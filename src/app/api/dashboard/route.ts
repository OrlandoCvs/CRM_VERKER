import { prisma } from '@/lib/db'

export async function GET() {
  const [totalLeads, byStatus, bySource, recentLeads] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.lead.groupBy({ by: ['source'], _count: { id: true } }),
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, company: true, status: true, source: true, city: true, createdAt: true },
    }),
  ])

  return Response.json({
    totalLeads,
    byStatus,
    bySource,
    recentLeads,
  })
}
