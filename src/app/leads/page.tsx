import { prisma } from '@/lib/db'
import { LeadsClient } from '@/components/leads/LeadsClient'
import { Lead } from '@/types'

export default async function LeadsPage() {
  const raw = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    include: { contacts: true },
  }) as unknown as Array<{
    id: string; name: string; email: string | null; phone: string | null
    company: string | null; website: string | null; address: string | null
    city: string | null; country: string | null; category: string | null
    rating: number | null; reviewCount: number | null; source: string
    sourceQuery: string | null; placeId: string | null; status: string
    notes: string | null; tags: string | null; createdAt: Date; updatedAt: Date
    contacts: { id: string; leadId: string; name: string; email: string | null
      phone: string | null; role: string | null; createdAt: Date }[]
  }>

  const leads: Lead[] = raw.map((l) => ({
    ...l,
    source: l.source as Lead['source'],
    status: l.status as Lead['status'],
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    contacts: l.contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  }))

  return <LeadsClient initialLeads={leads} />
}
