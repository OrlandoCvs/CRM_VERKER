import crypto from 'crypto'

/**
 * Enlaces de baja de los correos.
 *
 * El enlace lo abre alguien que no ha iniciado sesión y que llega desde su
 * bandeja de entrada, así que el propio enlace tiene que demostrar a qué lead
 * corresponde. Se firma el id con HMAC: sin la firma correcta no se puede dar
 * de baja a otra persona cambiando la URL, y no hace falta guardar nada extra
 * en la base.
 *
 * Los tokens no caducan a propósito: un correo enviado hace meses debe seguir
 * permitiendo la baja, que es justo lo que exige la normativa.
 */

/** Mismo secreto que la sesión: si falta, el despliegue ya está mal configurado. */
function secret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || 'verker-dev-secret'
}

/** Base64 apta para URL: sin `+`, `/` ni relleno. */
function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(leadId: string): string {
  return toBase64Url(crypto.createHmac('sha256', secret()).update(leadId).digest()).slice(0, 32)
}

/** Token que identifica al lead y demuestra que el enlace lo generamos nosotros. */
export function createUnsubscribeToken(leadId: string): string {
  return `${toBase64Url(leadId)}.${sign(leadId)}`
}

/**
 * Devuelve el id del lead si el token es auténtico, o null si no lo es.
 * Nunca lanza: un token manipulado es una petición inválida, no un fallo.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encodedId, signature] = token.split('.')
  if (!encodedId || !signature) return null

  let leadId: string
  try {
    leadId = Buffer.from(encodedId.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
  if (!leadId) return null

  const expected = sign(leadId)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  // timingSafeEqual exige la misma longitud, de ahí la comprobación previa.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  return leadId
}

/** URL pública de baja para un lead. */
export function unsubscribeUrl(leadId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/baja/${createUnsubscribeToken(leadId)}`
}

/**
 * Dirección pública del CRM, para construir enlaces dentro de los correos.
 *
 * En Vercel `VERCEL_PROJECT_PRODUCTION_URL` apunta siempre al dominio de
 * producción, incluso cuando el envío ocurre en una vista previa; así un correo
 * real nunca enlaza a un despliegue temporal.
 */
export function publicBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}
