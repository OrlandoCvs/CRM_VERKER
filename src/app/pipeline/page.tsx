export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { PipelineClient } from '@/components/pipeline/PipelineClient'
import { Lead, Folder } from '@/types'

type PipelineLead = Pick<
  Lead,
  'id' | 'name' | 'company' | 'status' | 'source' | 'city' | 'rating' | 'phone' | 'category' | 'folderId' | 'createdAt' | 'email' | 'emailStatus'
>

export default async function PipelinePage() {
  const [rawLeads, rawFolders] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, company: true, status: true, source: true,
        city: true, rating: true, phone: true, category: true,
        folderId: true, createdAt: true, updatedAt: true,
        email: true, emailStatus: true,
      },
    }),
    prisma.folder.findMany({ orderBy: { name: 'asc' } }),
  ])

  const raw = rawLeads as unknown as Array<{
    id: string; name: string; company: string | null; status: string
    source: string; city: string | null; rating: number | null
    phone: string | null; category: string | null; folderId: string | null
    createdAt: Date; email: string | null; emailStatus: string | null
  }>

  const leads: PipelineLead[] = raw.map((l) => ({
    ...l,
    source: l.source as Lead['source'],
    status: l.status as Lead['status'],
    createdAt: l.createdAt.toISOString(),
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

  return <PipelineClient initialLeads={leads} initialFolders={folders} />
}
