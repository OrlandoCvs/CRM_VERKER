import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'
import { Lead } from '@/types'

type RawLead = {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; website: string | null; address: string | null
  city: string | null; country: string | null; category: string | null
  rating: number | null; reviewCount: number | null; source: string
  sourceQuery: string | null; placeId: string | null; status: string
  notes: string | null; tags: string | null; createdAt: Date; updatedAt: Date
  lat: number | null; lng: number | null
  imageUrl: string | null; description: string | null; price: string | null
  permanentlyClosed: boolean | null; temporarilyClosed: boolean | null
  instagram: string | null; facebook: string | null; linkedin: string | null
  youtube: string | null; tiktok: string | null; twitter: string | null; pinterest: string | null
  openingHours: string | null; webResults: string | null
  contacts: { id: string; leadId: string; name: string; email: string | null
    phone: string | null; role: string | null; createdAt: Date }[]
  activities: { id: string; leadId: string; type: string; note: string; createdAt: Date }[]
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await prisma.lead.findUnique({
    where: { id },
    include: {
      contacts: true,
      activities: { orderBy: { createdAt: 'desc' } },
    },
  }) as unknown as RawLead | null

  if (!raw) notFound()

  const lead: Lead = {
    ...raw,
    source: raw.source as Lead['source'],
    status: raw.status as Lead['status'],
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    contacts: raw.contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    activities: raw.activities.map((a) => ({
      ...a,
      type: a.type as 'call' | 'email' | 'meeting' | 'note',
      createdAt: a.createdAt.toISOString(),
    })),
  }

  return <LeadDetailClient lead={lead} />
}
