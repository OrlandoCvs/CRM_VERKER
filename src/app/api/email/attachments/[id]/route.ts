import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/email/attachments/[id] — elimina un adjunto. El binario vive en la
// misma fila (campo `data`), así que borrar el registro borra todo de una vez.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const attachment = await prisma.emailAttachment.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!attachment) {
    return Response.json({ error: 'El adjunto no existe' }, { status: 404 })
  }

  await prisma.emailAttachment.delete({ where: { id } })

  return Response.json({ ok: true })
}
