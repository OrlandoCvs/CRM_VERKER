import { apifyClient } from '@/lib/apify'

/**
 * Búsqueda de personas en LinkedIn a través de Apify.
 *
 * A diferencia del actor de Google Places, este cobra **por página de búsqueda**
 * (25 perfiles) además de por perfil, y lo hace aunque la página vuelva vacía.
 * Por eso toda búsqueda lleva un tope de perfiles y se calcula el coste
 * estimado antes de lanzarla.
 *
 * Devuelve personas, no negocios: no hay teléfono ni dirección postal, porque
 * LinkedIn no publica esos datos.
 */

export const LINKEDIN_ACTOR = 'harvestapi/linkedin-profile-search'

/** Perfiles por página de búsqueda. Lo fija LinkedIn. */
export const PROFILES_PER_PAGE = 25

/**
 * Tarifas del actor, en dólares. Se replican aquí para poder estimar el gasto
 * en la interfaz antes de lanzar la búsqueda.
 * https://apify.com/harvestapi/linkedin-profile-search
 */
export const PRICING = {
  perSearchPage: 0.1,
  perProfile: 0.004,
  perProfileWithEmail: 0.01,
} as const

export type ScraperMode = 'Full' | 'Full + email search'

/** Filtros que expone el CRM. El actor admite muchos más, pero estos cubren
 *  la prospección inmobiliaria sin abrumar al usuario. */
export interface LinkedInSearchParams {
  /** Búsqueda libre: cargo, sector, palabras clave. */
  query?: string
  /** Cargos actuales exactos (p. ej. "Director Comercial"). */
  jobTitles?: string[]
  /** Ciudades o países tal como los entiende LinkedIn. */
  locations?: string[]
  /** Empresas actuales. */
  companies?: string[]
  /** Tope de perfiles a traer. Obligatorio: protege el saldo. */
  maxProfiles: number
  /** Si se busca también el correo (encarece el perfil). */
  withEmail: boolean
}

/** Estimación de coste de una búsqueda, para mostrarla antes de lanzarla. */
export function estimateCost(maxProfiles: number, withEmail: boolean): number {
  const pages = Math.max(1, Math.ceil(maxProfiles / PROFILES_PER_PAGE))
  const perProfile = withEmail ? PRICING.perProfileWithEmail : PRICING.perProfile
  return pages * PRICING.perSearchPage + maxProfiles * perProfile
}

/* ------------------------------ Respuesta ------------------------------ */

interface DateRange {
  month?: string | number | null
  year?: number | null
  text?: string | null
}

interface Experience {
  position?: string | null
  companyName?: string | null
  companyLinkedinUrl?: string | null
  location?: string | null
  description?: string | null
  startDate?: DateRange | null
  endDate?: DateRange | null
}

/** Perfil tal como lo devuelve el actor (solo los campos que usamos). */
export interface LinkedInProfile {
  id?: string
  publicIdentifier?: string
  linkedinUrl?: string
  firstName?: string
  lastName?: string
  headline?: string
  about?: string
  photo?: string
  openToWork?: boolean
  premium?: boolean
  connectionsCount?: number
  followerCount?: number
  location?: {
    linkedinText?: string
    parsed?: {
      text?: string
      city?: string | null
      state?: string | null
      country?: string | null
      countryFull?: string | null
    } | null
  } | null
  currentPosition?: { companyName?: string | null }[]
  experience?: Experience[]
  topSkills?: string
  /** Solo llega en el modo con búsqueda de correo, y no siempre. */
  email?: string | null
  emails?: string[] | null
}

/** Forma en que el CRM presenta un perfil, ya normalizado. */
export interface LinkedInResult {
  profileId: string
  name: string
  headline: string
  company: string
  position: string
  email: string
  city: string
  country: string
  linkedinUrl: string
  photo: string
  about: string
  connections: number | null
  openToWork: boolean
}

/** El actor unas veces trae `email` y otras una lista `emails`. */
function pickEmail(profile: LinkedInProfile): string {
  if (profile.email?.trim()) return profile.email.trim()
  const first = profile.emails?.find((e) => e?.trim())
  return first?.trim() ?? ''
}

/** Empresa actual: primero el campo dedicado, si no la experiencia en curso. */
function pickCompany(profile: LinkedInProfile): string {
  const current = profile.currentPosition?.[0]?.companyName
  if (current?.trim()) return current.trim()
  const ongoing = profile.experience?.find((e) => e.endDate?.text === 'Present')
  return ongoing?.companyName?.trim() ?? ''
}

/** Cargo actual, para distinguirlo del titular (que suele ser publicitario). */
function pickPosition(profile: LinkedInProfile): string {
  const ongoing = profile.experience?.find((e) => e.endDate?.text === 'Present')
  return ongoing?.position?.trim() ?? ''
}

/** Convierte un perfil crudo en la forma que consume la interfaz. */
export function toResult(profile: LinkedInProfile): LinkedInResult {
  const name = [profile.firstName, profile.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')

  const parsed = profile.location?.parsed
  return {
    profileId: profile.id ?? profile.publicIdentifier ?? profile.linkedinUrl ?? '',
    name: name || (profile.publicIdentifier ?? 'Sin nombre'),
    headline: profile.headline?.trim() ?? '',
    company: pickCompany(profile),
    position: pickPosition(profile),
    email: pickEmail(profile),
    city: parsed?.city?.trim() || profile.location?.linkedinText?.trim() || '',
    country: parsed?.countryFull?.trim() || parsed?.country?.trim() || '',
    linkedinUrl: profile.linkedinUrl ?? '',
    photo: profile.photo ?? '',
    about: profile.about?.trim() ?? '',
    connections: profile.connectionsCount ?? null,
    openToWork: Boolean(profile.openToWork),
  }
}

/**
 * Lanza la búsqueda y devuelve los perfiles encontrados.
 *
 * `takePages` acota cuántas páginas se pagan: sin él, una consulta amplia
 * seguiría paginando (y cobrando $0.10 por página) hasta agotar el saldo.
 */
export async function searchLinkedInProfiles(
  params: LinkedInSearchParams,
): Promise<LinkedInResult[]> {
  const pages = Math.max(1, Math.ceil(params.maxProfiles / PROFILES_PER_PAGE))

  const input: Record<string, unknown> = {
    profileScraperMode: params.withEmail ? 'Full + email search' : 'Full',
    maxItems: params.maxProfiles,
    takePages: pages,
    // La segmentación automática multiplica las consultas —y el gasto— para
    // superar el tope de 2.500 resultados de LinkedIn. Con topes pequeños no
    // aporta nada, así que se deja apagada.
    autoQuerySegmentation: false,
  }

  if (params.query?.trim()) input.searchQuery = params.query.trim()
  if (params.jobTitles?.length) input.currentJobTitles = params.jobTitles
  if (params.locations?.length) input.locations = params.locations
  if (params.companies?.length) input.currentCompanies = params.companies

  const run = await apifyClient.actor(LINKEDIN_ACTOR).call(input)
  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()

  return (items as unknown as LinkedInProfile[])
    .map(toResult)
    // Un perfil sin nombre ni URL no sirve como lead.
    .filter((r) => r.name && r.linkedinUrl)
}
