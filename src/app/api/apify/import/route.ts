import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { findDuplicateLead } from '@/lib/dedup'

function first(arr?: string[]): string | null {
  return arr && arr.length > 0 ? arr[0] : null
}

export async function POST(req: NextRequest) {
  const { place, sourceQuery } = await req.json()

  try {
    // Deduplicación: si ya existe este negocio, no se crea de nuevo.
    const duplicateId = await findDuplicateLead({
      placeId: place.placeId,
      name: place.title ?? place.name,
      phone: place.phone,
      website: place.website,
      city: place.city,
    })
    if (duplicateId) {
      return Response.json(
        { id: duplicateId, status: 'duplicate' },
        { status: 200 },
      )
    }

    const lead = await prisma.lead.create({
      data: {
        name: place.title ?? place.name ?? 'Sin nombre',
        email: place.email ?? first(place.emails),
        phone: place.phone ?? null,
        website: place.website ?? null,
        address: place.address ?? null,
        city: place.city ?? null,
        country: place.country ?? place.countryCode ?? null,
        category: place.categoryName ?? null,
        rating: place.totalScore ?? null,
        reviewCount: place.reviewsCount ?? null,
        source: 'google_places',
        sourceQuery: sourceQuery ?? null,
        placeId: place.placeId ?? null,
        status: 'new',
        // Coordinates
        lat: place.location?.lat ?? null,
        lng: place.location?.lng ?? null,
        // Extended data
        imageUrl: place.imageUrl ?? null,
        description: place.description ?? null,
        price: place.price ?? null,
        permanentlyClosed: place.permanentlyClosed ?? false,
        temporarilyClosed: place.temporarilyClosed ?? false,
        // Social media (present if Apify company contacts enrichment is enabled)
        instagram: first(place.instagrams),
        facebook: first(place.facebooks),
        linkedin: first(place.linkedIns),
        youtube: first(place.youtubes),
        tiktok: first(place.tiktoks),
        twitter: first(place.twitters),
        pinterest: first(place.pinterests),
        // JSON fields
        openingHours: place.openingHours ? JSON.stringify(place.openingHours) : null,
        webResults: place.webResults && place.webResults.length > 0
          ? JSON.stringify(place.webResults)
          : null,
      },
    })

    return Response.json({ ...lead, status: 'created' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al importar'
    return Response.json({ error: message }, { status: 500 })
  }
}
