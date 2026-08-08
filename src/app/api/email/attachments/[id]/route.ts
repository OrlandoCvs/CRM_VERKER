import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/email/attachments/[id] — devuelve el archivo para verlo o descargarlo.
 *
 * El binario vive en Postgres (Vercel no tiene disco), así que se lee de la fila
 * y se sirve con su tipo real. Por defecto se muestra en el navegador
 * (`inline`), que es lo que permite previsualizar un PDF sin descargarlo;
 * con `?download=1` se fuerza la descarga.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const attachment = await prisma.emailAttachment.findUnique({
    where: { id },
    select: { filename: true, mimeType: true, data: true },
  })
  if (!attachment) {
    return Response.json({ error: 'El adjunto no existe' }, { status: 404 })
  }

  // Solo se muestran dentro del navegador los formatos que sabe pintar; el
  // resto se descarga siempre. Además de ser lo esperable para un .kmz o un
  // Excel, evita que un archivo se interprete como página en nuestro dominio.
  const previewable =
    attachment.mimeType === 'application/pdf' || attachment.mimeType.startsWith('image/')
  const download = req.nextUrl.searchParams.get('download') === '1' || !previewable
  // Comillas escapadas: un nombre con `"` rompería la cabecera.
  const safeName = attachment.filename.replace(/"/g, '')

  return new Response(new Uint8Array(attachment.data), {
    headers: {
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
      'Content-Length': String(attachment.data.length),
      // Privado: el adjunto solo debe cachearse en el navegador del usuario.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

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
