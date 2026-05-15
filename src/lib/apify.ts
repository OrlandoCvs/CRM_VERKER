import { ApifyClient } from 'apify-client'

export const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

export const GOOGLE_PLACES_ACTOR = 'compass/crawler-google-places'

export interface GooglePlaceResult {
  placeId: string
  title: string
  categoryName: string
  categories?: string[]
  address: string
  city: string
  country: string
  countryCode?: string
  state?: string
  postalCode?: string
  neighborhood?: string
  phone: string
  phoneUnformatted?: string
  website: string
  totalScore: number
  reviewsCount: number
  url: string
  imageUrl?: string
  description?: string
  price?: string
  permanentlyClosed?: boolean
  temporarilyClosed?: boolean
  location?: { lat: number; lng: number }
  openingHours?: { day: string; hours: string }[]
  webResults?: { title: string; url: string; description?: string }[]
  reviewsDistribution?: { oneStar: number; twoStar: number; threeStar: number; fourStar: number; fiveStar: number }
  // Social media (from company contacts enrichment — paid add-on)
  instagrams?: string[]
  facebooks?: string[]
  linkedIns?: string[]
  youtubes?: string[]
  tiktoks?: string[]
  twitters?: string[]
  pinterests?: string[]
  emails?: string[]
}

export async function searchGooglePlaces(
  query: string,
  location: string,
  maxResults = 20
): Promise<GooglePlaceResult[]> {
  const run = await apifyClient.actor(GOOGLE_PLACES_ACTOR).call({
    searchStringsArray: [`${query} ${location}`],
    maxCrawledPlacesPerSearch: maxResults,
    language: 'es',
    includeHistogram: false,
    includeOpeningHours: true,
    includePeopleAlsoSearch: false,
  })

  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()
  return items as unknown as GooglePlaceResult[]
}
