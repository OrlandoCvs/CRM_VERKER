import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  const q = searchParams.get('q')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (source) where.source = source
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { company: { contains: q } },
      { email: { contains: q } },
      { city: { contains: q } },
    ]
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { contacts: true, activities: { orderBy: { createdAt: 'desc' }, take: 3 } },
  })

  return Response.json(leads)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const lead = await prisma.lead.create({ data: body })
  return Response.json(lead, { status: 201 })
}

// DELETE /api/leads — bulk delete. Body: { leadIds: string[] }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const leadIds: unknown = body?.leadIds

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return Response.json({ error: 'Selecciona al menos un lead' }, { status: 400 })
  }
  if (!leadIds.every((v) => typeof v === 'string')) {
    return Response.json({ error: 'leadIds inválido' }, { status: 400 })
  }

  const result = await prisma.lead.deleteMany({
    where: { id: { in: leadIds as string[] } },
  })
  return Response.json({ ok: true, count: result.count })
}
