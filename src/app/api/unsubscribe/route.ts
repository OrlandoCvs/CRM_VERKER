import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

/**
 * Baja de un destinatario.
 *
 * Es público a propósito: lo llama alguien sin sesión desde su bandeja de
 * entrada, y también los servidores de Gmail y Yahoo, que hacen un POST directo
 * a la URL de `List-Unsubscribe` cuando el usuario pulsa "cancelar suscripción"
 * dentro de su cliente de correo. Quien manda es el token firmado.
 */

export const dynamic = 'force-dynamic'

/** Extrae el token del cuerpo JSON o del formulario que envía Gmail. */
async function readToken(req: NextRequest): Promise<string | null> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { token?: string } | null
    return body?.token ?? null
  }

  // Gmail y Yahoo publican `List-Unsubscribe=One-Click` como formulario.
  if (contentType.includes('form')) {
    const form = await req.formData().catch(() => null)
    const value = form?.get('token')
    return typeof value === 'string' ? value : null
  }

  return null
}

/** Registra la baja en el historial del lead, para que el equipo sepa por qué. */
async function logUnsubscribe(leadId: string, note: string) {
  await prisma.activity
    .create({ data: { leadId, type: 'note', note } })
    .catch(() => {
      // El historial es informativo: si falla, la baja ya está aplicada.
    })
}

export async function POST(req: NextRequest) {
  // El token puede venir en el cuerpo o, si Gmail lo llama en un clic, en la
  // propia ruta a través de la cabecera del correo.
  const token = (await readToken(req)) ?? req.nextUrl.searchParams.get('token')
  const leadId = token ? verifyUnsubscribeToken(token) : null
  if (!leadId) {
    return Response.json({ error: 'Enlace no válido' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, unsubscribedAt: true },
  })
  if (!lead) {
    return Response.json({ error: 'Enlace no válido' }, { status: 400 })
  }

  // Repetir la baja no es un error: el destinatario puede pulsar dos veces.
  if (lead.unsubscribedAt) {
    return Response.json({ ok: true, alreadyUnsubscribed: true })
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { unsubscribedAt: new Date(), unsubscribeSource: 'email_link' },
  })
  await logUnsubscribe(leadId, 'Se dio de baja desde el enlace del correo. No volver a contactar.')

  return Response.json({ ok: true })
}

/** Deshacer, por si el enlace se abrió sin querer. */
export async function DELETE(req: NextRequest) {
  const token = await readToken(req)
  const leadId = token ? verifyUnsubscribeToken(token) : null
  if (!leadId) {
    return Response.json({ error: 'Enlace no válido' }, { status: 400 })
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { unsubscribedAt: null, unsubscribeSource: null },
  })
  await logUnsubscribe(leadId, 'Canceló su baja: vuelve a aceptar correos.')

  return Response.json({ ok: true })
}
