import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/email/templates/[id] — actualizar plantilla
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const data: Record<string, string> = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.subject === 'string') data.subject = body.subject
  if (typeof body.body === 'string') data.body = body.body

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const template = await prisma.emailTemplate.update({ where: { id }, data })
  return Response.json(template)
}

// DELETE /api/email/templates/[id]
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  await prisma.emailTemplate.delete({ where: { id } })
  return Response.json({ ok: true })
}
