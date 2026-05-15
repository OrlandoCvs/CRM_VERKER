import { NextRequest } from 'next/server'
import { apifyClient, GOOGLE_PLACES_ACTOR } from '@/lib/apify'

export async function POST(req: NextRequest) {
  const { query, location, maxResults = 20 } = await req.json()

  if (!query || !location) {
    return Response.json({ error: 'query y location son requeridos' }, { status: 400 })
  }

  if (!process.env.APIFY_TOKEN) {
    return Response.json({ error: 'APIFY_TOKEN no configurado' }, { status: 500 })
  }

  try {
    const run = await apifyClient.actor(GOOGLE_PLACES_ACTOR).call({
      searchStringsArray: [`${query} ${location}`],
      maxCrawledPlacesPerSearch: Math.min(maxResults, 50),
      language: 'es',
      includeHistogram: false,
      includeOpeningHours: true,
      includePeopleAlsoSearch: false,
    })

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()
    return Response.json({ items, query, location })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return Response.json({ error: message }, { status: 500 })
  }
}
