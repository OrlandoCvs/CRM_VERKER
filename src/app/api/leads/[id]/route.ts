import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contacts: true,
      activities: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!lead) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(lead)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json()
  const lead = await prisma.lead.update({ where: { id }, data: body })
  return Response.json(lead)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  await prisma.lead.delete({ where: { id } })
  return Response.json({ ok: true })
}
