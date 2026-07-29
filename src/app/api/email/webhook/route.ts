import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Webhook de Resend: recibe los eventos de entrega de cada correo enviado.
 *
 * Su función principal es proteger la reputación del dominio de envío:
 * cuando una dirección rebota (no existe) o alguien marca el correo como spam,
 * el lead queda marcado y `/api/email/send` deja de escribirle.
 *
 * Configuración en https://resend.com/webhooks:
 *   URL     → https://TU-DOMINIO/api/email/webhook
 *   Eventos → email.bounced, email.complained, email.delivered
 *   Copia el "Signing Secret" (whsec_...) a RESEND_WEBHOOK_SECRET en .env.local
 *
 * Mientras el CRM corra en localhost, Resend no puede alcanzar esta ruta; el
 * endpoint queda listo y empieza a recibir eventos en cuanto se despliegue.
 */

/** Cabeceras de firma que envía Resend (estándar Svix). */
interface SvixHeaders {
  id: string
  timestamp: string
  signature: string
}

function readSvixHeaders(req: NextRequest): SvixHeaders | null {
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')
  if (!id || !timestamp || !signature) return null
  return { id, timestamp, signature }
}

/**
 * Verifica la firma HMAC-SHA256 del webhook.
 *
 * Svix firma la cadena `{id}.{timestamp}.{payload}` con el secreto (cuya parte
 * tras `whsec_` va en base64) y manda el resultado en la cabecera
 * `svix-signature` como una lista de `v1,<firma>` separada por espacios.
 */
function isValidSignature(raw: string, headers: SvixHeaders, secret: string): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${raw}`)
    .digest('base64')

  const expectedBuf = Buffer.from(expected)
  // La cabecera puede traer varias firmas (rotación de secretos): basta con que una coincida.
  return headers.signature.split(' ').some((entry) => {
    const value = entry.split(',')[1]
    if (!value) return false
    const candidate = Buffer.from(value)
    // timingSafeEqual exige la misma longitud, de ahí la comprobación previa.
    return (
      candidate.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidate, expectedBuf)
    )
  })
}

/** Rechaza eventos con más de 5 minutos para evitar reenvíos maliciosos. */
function isFreshTimestamp(timestamp: string): boolean {
  const sent = Number(timestamp) * 1000
  if (!Number.isFinite(sent)) return false
  return Math.abs(Date.now() - sent) < 5 * 60 * 1000
}

interface ResendEvent {
  type?: string
  data?: {
    email_id?: string
    to?: string[] | string
    bounce?: { type?: string; message?: string }
  }
}

/** Traduce el evento de Resend al estado que guardamos en el lead. */
function resolveStatus(event: ResendEvent): { status: string; reason: string } | null {
  switch (event.type) {
    case 'email.bounced': {
      // Un rebote blando (buzón lleno, servidor caído) puede ser temporal:
      // solo damos la dirección por muerta en los rebotes duros.
      const type = event.data?.bounce?.type?.toLowerCase() ?? ''
      if (type && !type.includes('hard') && !type.includes('permanent')) return null
      return {
        status: 'bounced',
        reason: event.data?.bounce?.message ?? 'La dirección no existe o rechazó el correo',
      }
    }
    case 'email.complained':
      return { status: 'complained', reason: 'El destinatario marcó el correo como spam' }
    case 'email.delivered':
      return { status: 'valid', reason: 'Correo entregado' }
    default:
      return null
  }
}

// POST /api/email/webhook — eventos de entrega enviados por Resend.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return Response.json(
      { error: 'Webhook no configurado. Define RESEND_WEBHOOK_SECRET en .env.local.' },
      { status: 500 },
    )
  }

  // La firma se calcula sobre el cuerpo sin parsear, así que se lee como texto.
  const raw = await req.text()
  const headers = readSvixHeaders(req)

  if (!headers || !isFreshTimestamp(headers.timestamp) || !isValidSignature(raw, headers, secret)) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(raw) as ResendEvent
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const resolved = resolveStatus(event)
  const providerId = event.data?.email_id
  // Los eventos que no afectan a la entregabilidad (aperturas, clics) se aceptan
  // sin más: devolver un error haría que Resend reintentara en vano.
  if (!resolved || !providerId) {
    return Response.json({ ok: true, ignored: event.type ?? 'desconocido' })
  }

  const delivery = await prisma.emailDelivery.findUnique({
    where: { providerId },
    select: { id: true, leadId: true },
  })
  if (!delivery) {
    return Response.json({ ok: true, ignored: 'envío no registrado' })
  }

  await prisma.emailDelivery.update({
    where: { id: delivery.id },
    data: { status: resolved.status },
  })

  // Un lead ya marcado como 'complained' no vuelve atrás: es la señal más grave
  // y significa que no debemos contactarlo nunca más.
  const lead = await prisma.lead.findUnique({
    where: { id: delivery.leadId },
    select: { emailStatus: true },
  })
  if (lead?.emailStatus === 'complained') {
    return Response.json({ ok: true, skipped: 'lead ya marcado como queja' })
  }

  await prisma.lead.update({
    where: { id: delivery.leadId },
    data: {
      emailStatus: resolved.status,
      emailStatusAt: new Date(),
      emailStatusReason: resolved.reason,
    },
  })

  // Deja rastro en el historial del lead salvo para las entregas correctas,
  // que serían ruido: ya se registra la actividad al enviar.
  if (resolved.status !== 'valid') {
    await prisma.activity.create({
      data: {
        leadId: delivery.leadId,
        type: 'email',
        note:
          resolved.status === 'bounced'
            ? `Correo rebotado — ${resolved.reason}`
            : `Marcado como spam por el destinatario — ${resolved.reason}`,
      },
    })
  }

  return Response.json({ ok: true, status: resolved.status })
}
