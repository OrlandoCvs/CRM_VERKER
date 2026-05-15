import { prisma } from '@/lib/db'
import { PipelineClient } from '@/components/pipeline/PipelineClient'
import { Lead } from '@/types'

type PipelineLead = Pick<Lead, 'id' | 'name' | 'company' | 'status' | 'source' | 'city' | 'rating' | 'phone' | 'category' | 'createdAt'>

export default async function PipelinePage() {
  const raw = await prisma.lead.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, company: true, status: true, source: true,
      city: true, rating: true, phone: true, category: true,
      createdAt: true, updatedAt: true,
    },
  }) as unknown as Array<{
    id: string; name: string; company: string | null; status: string
    source: string; city: string | null; rating: number | null
    phone: string | null; category: string | null; createdAt: Date
  }>

  const leads: PipelineLead[] = raw.map((l) => ({
    ...l,
    source: l.source as Lead['source'],
    status: l.status as Lead['status'],
    createdAt: l.createdAt.toISOString(),
  }))

  return <PipelineClient initialLeads={leads} />
}
