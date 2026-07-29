/**
 * Autenticación por contraseña única para todo el CRM.
 *
 * Pensado para correr en la laptop de un cliente en local: por defecto exige
 * login, de modo que abrir la máquina no da acceso directo a los datos. La cookie
 * de sesión va firmada (HMAC) para que no pueda falsificarse sin el secreto.
 *
 * Usa la Web Crypto API (globalThis.crypto.subtle) en lugar del módulo `crypto`
 * de Node, porque el middleware que valida la sesión corre en el Edge Runtime,
 * donde los módulos de Node no están disponibles. Web Crypto existe en ambos.
 *
 * Variables de entorno:
 *   APP_PASSWORD        Contraseña de acceso (obligatoria para que el login sirva).
 *   AUTH_SECRET         Secreto para firmar la sesión. Si falta, se deriva de
 *                       APP_PASSWORD (aceptable para un solo usuario).
 *   DISABLE_AUTH=true   Desactiva el login (para desarrollo en tu propia máquina).
 */

export const SESSION_COOKIE = 'verker_session'
const SESSION_DAYS = 30

/** True si el login está desactivado por configuración (entorno de desarrollo). */
export function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH === 'true'
}

/** True si hay una contraseña configurada; sin ella el login no puede exigirse. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD)
}

function secret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || 'verker-dev-secret'
}

/** Comparación en tiempo constante para no filtrar información por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Firma HMAC-SHA256 (hex) usando Web Crypto, disponible en Node y Edge. */
async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Verifica la contraseña introducida contra APP_PASSWORD. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) return false
  return safeEqual(input, expected)
}

/**
 * Token de sesión con forma `<expiración>.<firma>`. La firma HMAC ata la
 * expiración al secreto, así que el cliente no puede alargarla ni inventarla.
 */
export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  const sig = await hmacHex(String(expires))
  return `${expires}.${sig}`
}

/** Valida el token: firma correcta y no caducado. */
export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [expiresStr, sig] = token.split('.')
  if (!expiresStr || !sig) return false

  const expected = await hmacHex(expiresStr)
  if (!safeEqual(sig, expected)) return false

  const expires = Number(expiresStr)
  return Number.isFinite(expires) && expires > Date.now()
}

/** Opciones de la cookie de sesión (usadas al fijarla). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
}
