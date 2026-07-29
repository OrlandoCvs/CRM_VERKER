import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/leads/[id]/reminders — recordatorios del lead (pendientes primero).
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const reminders = await prisma.reminder.findMany({
    where: { leadId: id },
    orderBy: [{ done: 'asc' }, { dueAt: 'asc' }],
  })
  return Response.json(reminders)
}

// POST /api/leads/[id]/reminders — crea un recordatorio. Body: { title, dueAt }
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return Response.json({ error: 'El título es obligatorio' }, { status: 400 })
  }

  const dueAt = new Date(body.dueAt)
  if (Number.isNaN(dueAt.getTime())) {
    return Response.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true } })
  if (!lead) {
    return Response.json({ error: 'El lead no existe' }, { status: 404 })
  }

  const reminder = await prisma.reminder.create({
    data: { leadId: id, title, dueAt },
  })
  return Response.json(reminder, { status: 201 })
}
