import { NextRequest } from 'next/server'
import { searchLinkedInProfiles, estimateCost, type LinkedInSearchParams } from '@/lib/linkedin'

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

/** Tope duro por búsqueda, con el actor a $0.01 por perfil con correo. */
const MAX_PROFILES_PER_SEARCH = 200

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
    return Response.json({
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
