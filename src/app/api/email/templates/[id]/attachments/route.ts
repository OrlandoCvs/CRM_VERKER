import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import {
  storeUpload,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
} from '@/lib/uploads'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/email/templates/[id]/attachments
 * Sube un archivo (multipart/form-data, campo `file`) y lo asocia a la plantilla.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const template = await prisma.emailTemplate.findUnique({ where: { id } })
  if (!template) {
    return Response.json({ error: 'La plantilla no existe' }, { status: 404 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
  }

  if (file.size === 0) {
    return Response.json({ error: 'El archivo está vacío' }, { status: 400 })
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      { error: `El archivo supera el límite de ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB` },
      { status: 400 },
    )
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json({ error: `Tipo de archivo no permitido: ${file.type || 'desconocido'}` }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const storedName = await storeUpload(bytes, file.name)

  const attachment = await prisma.emailAttachment.create({
    data: {
      templateId: id,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storedName,
    },
    select: { id: true, filename: true, mimeType: true, size: true },
  })

  // Refresca la marca de tiempo de la plantilla para que suba en la lista.
  await prisma.emailTemplate.update({ where: { id }, data: { updatedAt: new Date() } })

  return Response.json(attachment, { status: 201 })
}
