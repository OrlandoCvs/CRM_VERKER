import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/reminders/[id] — actualiza un recordatorio.
 * Body admite: { done?, title?, dueAt? }. Al marcar `done` se sella la fecha de
 * completado; al desmarcarlo se limpia.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const data: {
    done?: boolean
    completedAt?: Date | null
    title?: string
    dueAt?: Date
  } = {}

  if (typeof body.done === 'boolean') {
    data.done = body.done
    data.completedAt = body.done ? new Date() : null
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    data.title = body.title.trim()
  }
  if (body.dueAt !== undefined) {
    const dueAt = new Date(body.dueAt)
    if (Number.isNaN(dueAt.getTime())) {
      return Response.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 })
    }
    data.dueAt = dueAt
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const reminder = await prisma.reminder.update({ where: { id }, data })
  return Response.json(reminder)
}

// DELETE /api/reminders/[id] — elimina un recordatorio.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  await prisma.reminder.delete({ where: { id } })
  return Response.json({ ok: true })
}
