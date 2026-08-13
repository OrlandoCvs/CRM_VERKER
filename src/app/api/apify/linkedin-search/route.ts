import { NextRequest } from 'next/server'
import { searchLinkedInProfiles, estimateCost, type LinkedInSearchParams } from '@/lib/linkedin'
import { recordSearch } from '@/lib/search-history'

/**
 * POST /api/apify/linkedin-search
 * Busca personas en LinkedIn con los filtros indicados.
 *
 * A diferencia de la búsqueda de Google Places, esta cobra por página de
 * resultados aunque vuelva vacía, así que el tope de perfiles es obligatorio y
 * se acota aquí además de en la interfaz: el cliente no es la última defensa
 * del saldo.
 */

export const dynamic = 'force-dynamic'
// Una búsqueda con perfiles completos tarda; se le da margen sobre el
// límite por defecto de la función.
export const maxDuration = 300

/**
 * Tope duro por búsqueda. Debe coincidir con el de la interfaz.
 *
 * Se comprueba también aquí porque el cliente no es la última defensa del
 * saldo: una petición manipulada podría pedir miles de perfiles.
 */
const MAX_PROFILES_PER_SEARCH = 50

interface Body {
  query?: string
  jobTitles?: string[]
  locations?: string[]
  companies?: string[]
  maxProfiles?: number
  withEmail?: boolean
}

/** Limpia una lista de texto libre: sin vacíos ni espacios sobrantes. */
function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
}

export async function POST(req: NextRequest) {
  if (!process.env.APIFY_TOKEN) {
    return Response.json({ error: 'Apify no está configurado' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Body

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const jobTitles = cleanList(body.jobTitles)
  const locations = cleanList(body.locations)
  const companies = cleanList(body.companies)

  // Sin ningún criterio, LinkedIn devolvería cualquier cosa y se pagaría por ello.
  if (!query && jobTitles.length === 0 && companies.length === 0) {
    return Response.json(
      { error: 'Escribe qué buscas o indica al menos un cargo o empresa' },
      { status: 400 },
    )
  }

  const requested = Number(body.maxProfiles)
  const maxProfiles = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_PROFILES_PER_SEARCH)
    : 25

  const withEmail = body.withEmail === true

  const params: LinkedInSearchParams = {
    query: query || undefined,
    jobTitles: jobTitles.length ? jobTitles : undefined,
    locations: locations.length ? locations : undefined,
    companies: companies.length ? companies : undefined,
    maxProfiles,
    withEmail,
  }

  try {
    const results = await searchLinkedInProfiles(params)

    // Se guarda en el historial para poder reabrir esta búsqueda sin volver a
    // pagarla. Si falla, la búsqueda sigue devolviéndose igual.
    const historyId = await recordSearch({
      source: 'linkedin',
      label: [query, jobTitles.join(', '), locations.join(', ')].filter(Boolean).join(' · '),
      filters: { query, jobTitles, locations, companies, maxProfiles, withEmail },
      results: results.map((r) => ({
        externalId: r.profileId,
        name: r.name,
        headline: r.headline,
        company: r.company,
        position: r.position,
        email: r.email,
        city: r.city,
        country: r.country,
        linkedinUrl: r.linkedinUrl,
        photo: r.photo,
        about: r.about,
        connections: r.connections,
      })),
    })

    return Response.json({
      historyId,
      results,
      meta: {
        requested: maxProfiles,
        found: results.length,
        withEmail,
        withEmailCount: results.filter((r) => r.email).length,
        estimatedCost: estimateCost(maxProfiles, withEmail),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al buscar en LinkedIn'
    return Response.json({ error: message }, { status: 502 })
  }
}
