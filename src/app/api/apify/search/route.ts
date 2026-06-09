import { NextRequest } from 'next/server'
import { apifyClient, GOOGLE_PLACES_ACTOR } from '@/lib/apify'

type GeoJsonGeometry = {
  type: 'Polygon' | 'MultiPolygon' | 'Point'
  coordinates: unknown
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, location, area, maxResults = 20 } = body as {
    query?: string
    location?: string
    area?: GeoJsonGeometry
    maxResults?: number
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
  }
  if (area) input.customGeolocation = area

  try {
    const run = await apifyClient.actor(GOOGLE_PLACES_ACTOR).call(input)
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()
    return Response.json({ items, query, location: location ?? null, area: area ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return Response.json({ error: message }, { status: 500 })
  }
}
