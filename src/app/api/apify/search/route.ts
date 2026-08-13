import { NextRequest } from 'next/server'
import { apifyClient, GOOGLE_PLACES_ACTOR } from '@/lib/apify'
import { recordSearch } from '@/lib/search-history'

/** Forma mínima del resultado de Places que necesita el historial. */
interface PlaceItem {
  placeId?: string
  title?: string
  categoryName?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  website?: string
  email?: string
  emails?: unknown
  imageUrl?: string
  totalScore?: number
  reviewsCount?: number
}

/** Primer correo utilizable de un negocio, venga suelto o en lista. */
function firstEmail(place: PlaceItem): string | null {
  if (typeof place.email === 'string' && place.email.trim()) return place.email.trim()
  if (!Array.isArray(place.emails)) return null
  for (const e of place.emails) {
    if (typeof e === 'string' && e.trim()) return e.trim()
  }
  return null
}

type GeoJsonGeometry = {
  type: 'Polygon' | 'MultiPolygon' | 'Point'
  coordinates: unknown
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, location, area, maxResults = 20, scrapeContacts = false } = body as {
    query?: string
    location?: string
    area?: GeoJsonGeometry
    maxResults?: number
    scrapeContacts?: boolean
  }

  if (!query) {
    return Response.json({ error: 'El tipo de negocio es obligatorio' }, { status: 400 })
  }
  if (!location && !area) {
    return Response.json(
      { error: 'Indica una ubicación o un área en el mapa' },
      { status: 400 },
    )
  }

  if (!process.env.APIFY_TOKEN) {
    return Response.json({ error: 'APIFY_TOKEN no configurado' }, { status: 500 })
  }

  // When searching by area we only send the category text; the geo box is
  // expressed via `customGeolocation` so Apify focuses the search to it.
  const searchString = location ? `${query} ${location}` : query

  const input: Record<string, unknown> = {
    searchStringsArray: [searchString],
    maxCrawledPlacesPerSearch: Math.min(maxResults, 50),
    language: 'es',
    includeHistogram: false,
    includeOpeningHours: true,
    includePeopleAlsoSearch: false,
    // Enriquecimiento opcional: visita la web de cada negocio para extraer
    // email y redes sociales. Consume más créditos de Apify y tarda más.
    scrapeContacts: Boolean(scrapeContacts),
  }
  if (area) input.customGeolocation = area

  try {
    const run = await apifyClient.actor(GOOGLE_PLACES_ACTOR).call(input)
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()

    // Historial: permite reabrir esta búsqueda sin volver a pagarla. Solo se
    // guarda lo necesario para decidir a quién importar, no el volcado entero.
    const places = items as unknown as PlaceItem[]
    const historyId = await recordSearch({
      source: 'google_places',
      label: [query, location].filter(Boolean).join(' · ') || query,
      filters: { query, location, maxResults, scrapeContacts, hasArea: Boolean(area) },
      runId: run.id,
      results: places
        .filter((p) => p.title)
        .map((p) => ({
          externalId: p.placeId ?? p.title ?? '',
          name: p.title ?? 'Sin nombre',
          headline: p.categoryName ?? null,
          company: null,
          position: p.categoryName ?? null,
          email: firstEmail(p),
          phone: p.phone ?? null,
          website: p.website ?? null,
          address: p.address ?? null,
          city: p.city ?? null,
          country: p.country ?? null,
          photo: p.imageUrl ?? null,
          rating: typeof p.totalScore === 'number' ? p.totalScore : null,
          connections: typeof p.reviewsCount === 'number' ? p.reviewsCount : null,
        })),
    })

    return Response.json({
      items,
      query,
      location: location ?? null,
      area: area ?? null,
      historyId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return Response.json({ error: message }, { status: 500 })
  }
}
