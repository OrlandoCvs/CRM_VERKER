export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { MapClient } from '@/components/map/MapClient'
import { MapLead } from '@/components/map/LeafletMap'

type RawLead = {
  id: string; name: string; status: string; category: string | null
  rating: number | null; reviewCount: number | null; city: string | null
  phone: string | null; lat: number | null; lng: number | null
}

export default async function MapPage() {
  const raw = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, status: true, category: true,
      rating: true, reviewCount: true, city: true, phone: true,
      lat: true, lng: true,
    },
  }) as unknown as RawLead[]

  const withCoords: MapLead[] = raw
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({ ...l, lat: l.lat!, lng: l.lng! }))

  const withoutCoords = raw
    .filter((l) => l.lat == null || l.lng == null)
    .map((l) => ({ id: l.id, name: l.name, status: l.status, city: l.city }))

  return (
    <MapClient
      leads={withCoords}
      allLeadsCount={raw.length}
      leadsWithoutCoords={withoutCoords}
    />
  )
}
