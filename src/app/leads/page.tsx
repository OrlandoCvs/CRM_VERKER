import { prisma } from '@/lib/db'
import { LeadsClient } from '@/components/leads/LeadsClient'
import { Lead, Folder } from '@/types'

export default async function LeadsPage() {
  const [rawLeads, rawFolders] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      include: { contacts: true },
    }),
    prisma.folder.findMany({ orderBy: { name: 'asc' } }),
  ])

  const raw = rawLeads as unknown as Array<{
    id: string; name: string; email: string | null; phone: string | null
    company: string | null; website: string | null; address: string | null
    city: string | null; country: string | null; category: string | null
    rating: number | null; reviewCount: number | null; source: string
    sourceQuery: string | null; placeId: string | null; status: string
    notes: string | null; tags: string | null; folderId: string | null
    createdAt: Date; updatedAt: Date
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

  const folders: Folder[] = (
    rawFolders as unknown as Array<{
      id: string; name: string; color: string | null
      parentId: string | null; createdAt: Date; updatedAt: Date
    }>
  ).map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }))

  return <LeadsClient initialLeads={leads} initialFolders={folders} />
}
