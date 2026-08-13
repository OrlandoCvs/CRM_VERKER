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
  /** Puesto vigente. Trae `companyName` y, en muchos perfiles, `position`. */
  currentPosition?: { companyName?: string | null; position?: string | null }[]
  experience?: Experience[]
  topSkills?: string
  /**
   * Solo llegan en el modo con búsqueda de correo, y no siempre: lo habitual es
   * que `emails` sea `null`. Cuando trae algo puede ser una lista de cadenas o
   * de objetos con la dirección y su verificación, de ahí el tipo abierto.
   */
  email?: string | null
  emails?: unknown[] | null
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

/**
 * Texto limpio a partir de un valor de origen desconocido.
 *
 * El actor rellena unos campos y deja otros a `null`, y un mismo campo puede
 * llegar como cadena o como objeto según el perfil. Comprobar el tipo aquí
 * evita que un perfil raro tumbe la búsqueda entera.
 */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Correo del perfil, venga como venga.
 *
 * Solo aparece en el modo con búsqueda de correo, y aun así no siempre: el
 * campo puede faltar, ser `null`, una cadena, una lista de cadenas o una lista
 * de objetos con la dirección y su verificación.
 */
function pickEmail(profile: LinkedInProfile): string {
  const direct = text(profile.email)
  if (direct) return direct

  const list = profile.emails
  if (!Array.isArray(list)) return ''

  for (const entry of list) {
    const value = text(entry)
    if (value) return value
    // Forma con metadatos: { email: '…', status: 'valid' }.
    if (entry && typeof entry === 'object') {
      const nested = text((entry as Record<string, unknown>).email)
      if (nested) return nested
    }
  }
  return ''
}

/** La experiencia que sigue vigente, que es la que describe al lead hoy. */
function currentExperience(profile: LinkedInProfile) {
  if (!Array.isArray(profile.experience)) return undefined
  return profile.experience.find((e) => text(e?.endDate?.text) === 'Present')
}

/** Empresa actual: primero el campo dedicado, si no la experiencia en curso. */
function pickCompany(profile: LinkedInProfile): string {
  const positions = profile.currentPosition
  if (Array.isArray(positions)) {
    for (const p of positions) {
      const name = text(p?.companyName)
      if (name) return name
    }
  }
  return text(currentExperience(profile)?.companyName)
}

/** Cargo actual, para distinguirlo del titular (que suele ser publicitario). */
function pickPosition(profile: LinkedInProfile): string {
  // `currentPosition` también trae el puesto en algunos perfiles.
  const positions = profile.currentPosition
  if (Array.isArray(positions)) {
    for (const p of positions) {
      const role = text((p as Record<string, unknown>)?.position)
      if (role) return role
    }
  }
  return text(currentExperience(profile)?.position)
}

/**
 * Convierte un perfil crudo en la forma que consume la interfaz.
 *
 * Todo campo se lee con `text()`: el actor devuelve `null` en lo que no
 * encuentra, y un solo perfil incompleto no debe tumbar la búsqueda entera
 * (que ya está pagada).
 */
export function toResult(profile: LinkedInProfile): LinkedInResult {
  const name = [text(profile.firstName), text(profile.lastName)]
    .filter(Boolean)
    .join(' ')

  const parsed = profile.location?.parsed
  const identifier = text(profile.publicIdentifier)
  const url = text(profile.linkedinUrl)

  return {
    profileId: text(profile.id) || identifier || url,
    name: name || identifier || 'Sin nombre',
    headline: text(profile.headline),
    company: pickCompany(profile),
    position: pickPosition(profile),
    email: pickEmail(profile),
    city: text(parsed?.city) || text(profile.location?.linkedinText),
    country: text(parsed?.countryFull) || text(parsed?.country),
    linkedinUrl: url,
    photo: text(profile.photo),
    about: text(profile.about),
    connections: typeof profile.connectionsCount === 'number' ? profile.connectionsCount : null,
    openToWork: profile.openToWork === true,
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
