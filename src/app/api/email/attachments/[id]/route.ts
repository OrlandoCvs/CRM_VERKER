import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import { deleteUpload } from '@/lib/uploads'

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/email/attachments/[id] — elimina un adjunto (registro + binario).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const attachment = await prisma.emailAttachment.findUnique({ where: { id } })
  if (!attachment) {
    return Response.json({ error: 'El adjunto no existe' }, { status: 404 })
  }

  await prisma.emailAttachment.delete({ where: { id } })
  // El binario se borra después del registro: si esto fallara, quedaría un
  // archivo huérfano (inocuo) en vez de un registro apuntando a un archivo ausente.
  await deleteUpload(attachment.storedName)

  return Response.json({ ok: true })
}
