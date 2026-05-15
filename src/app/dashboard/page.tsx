import { prisma } from '@/lib/db'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { LeadStatus, LeadSource } from '@/types'

export default async function DashboardPage() {
  const totalLeads = await prisma.lead.count()

  const rawByStatus = await prisma.lead.groupBy({ by: ['status'], _count: { id: true } })
  const byStatus = rawByStatus as unknown as { status: string; _count: { id: number } }[]

  const rawBySource = await prisma.lead.groupBy({ by: ['source'], _count: { id: true } })
  const bySource = rawBySource as unknown as { source: string; _count: { id: number } }[]

  const recentLeads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true, name: true, company: true, status: true,
      source: true, city: true, rating: true, createdAt: true,
    },
  }) as unknown as {
    id: string; name: string; company: string | null; status: string
    source: string; city: string | null; rating: number | null; createdAt: Date
  }[]

  const wonLeads = byStatus.find((s) => s.status === 'won')?._count.id ?? 0
  const newLeads = byStatus.find((s) => s.status === 'new')?._count.id ?? 0
  const googlePlacesLeads = bySource.find((s) => s.source === 'google_places')?._count.id ?? 0

  return (
    <DashboardClient
      stats={{ totalLeads, wonLeads, newLeads, googlePlacesLeads }}
      byStatus={byStatus.map((s) => ({ status: s.status, count: s._count.id }))}
      bySource={bySource.map((s) => ({ source: s.source, count: s._count.id }))}
      recentLeads={recentLeads.map((l) => ({
        ...l,
        source: l.source as LeadSource,
        status: l.status as LeadStatus,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  )
}
