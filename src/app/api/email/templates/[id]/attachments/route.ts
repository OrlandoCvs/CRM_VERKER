import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import {
  MAX_ATTACHMENT_BYTES,
  resolveMimeType,
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
  // El tipo se deduce de la extensión: el navegador no reconoce formatos como
  // .kmz y los manda sin tipo, lo que haría fallar una comprobación directa.
  const mimeType = resolveMimeType(file.name, file.type)
  if (!mimeType) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : null
    return Response.json(
      { error: `Tipo de archivo no permitido: ${ext ? `.${ext}` : file.type || 'desconocido'}` },
      { status: 400 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  const attachment = await prisma.emailAttachment.create({
    data: {
      templateId: id,
      filename: file.name,
      mimeType,
      size: file.size,
      data: bytes,
    },
    // No devolvemos `data` (el binario) en la respuesta: solo el metadato.
    select: { id: true, filename: true, mimeType: true, size: true },
  })

  // Refresca la marca de tiempo de la plantilla para que suba en la lista.
  await prisma.emailTemplate.update({ where: { id }, data: { updatedAt: new Date() } })

  return Response.json(attachment, { status: 201 })
}
