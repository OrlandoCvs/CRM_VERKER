/**
 * Validación de direcciones de correo en dos niveles:
 *   1. Sintaxis  — barato, descarta basura evidente.
 *   2. MX        — consulta DNS para confirmar que el dominio puede recibir
 *                  correo. Descarta dominios muertos, webs sin buzón y typos de
 *                  dominio, que son la principal causa de rebotes en listas
 *                  scrapeadas. No garantiza que el buzón exista (eso no se puede
 *                  saber de forma fiable), pero elimina lo claramente inservible.
 *
 * La consulta MX se hace por DNS-over-HTTPS (puerto 443) en vez del DNS del
 * sistema (puerto 53), porque muchos entornos —contenedores, sandboxes, algunas
 * redes— bloquean el DNS directo pero no el HTTPS. Es la misma vía que ya usa el
 * envío por Resend, así que si el correo sale, esta validación también funciona.
 */

export type EmailCheck = 'valid' | 'invalid_syntax' | 'no_mx' | 'error'

/** Regex pragmático: cubre la inmensa mayoría de direcciones reales. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidSyntax(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

/** Resultado de la consulta MX de un dominio. */
type MxResult = 'has_mx' | 'no_mx' | 'error'

/** Cache en memoria por dominio: evita repetir la consulta DNS en un mismo lote. */
const mxCache = new Map<string, MxResult>()

/** Resolvedores DNS-over-HTTPS. Se intenta el segundo si el primero falla. */
const DOH_RESOLVERS = [
  (domain: string) => `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
  (domain: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
]

/** Consulta MX vía un resolvedor DoH. Devuelve el resultado o lanza si la red falla. */
async function queryDoh(url: string): Promise<MxResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`DoH respondió ${res.status}`)
    const data = (await res.json()) as { Status: number; Answer?: { type: number }[] }
    // Status 3 = NXDOMAIN (el dominio no existe). Otros != 0 son inconcluyentes.
    if (data.Status === 3) return 'no_mx'
    if (data.Status !== 0) throw new Error(`DNS status ${data.Status}`)
    // type 15 = registro MX. Sin registros MX => el dominio no recibe correo.
    const hasMx = (data.Answer ?? []).some((a) => a.type === 15)
    return hasMx ? 'has_mx' : 'no_mx'
  } finally {
    clearTimeout(timer)
  }
}

async function domainMx(domain: string): Promise<MxResult> {
  const cached = mxCache.get(domain)
  if (cached !== undefined) return cached

  // Intenta cada resolvedor; solo si todos fallan por red se devuelve 'error'
  // (que NO descarta el email, para no perder leads por un problema de conexión).
  let result: MxResult = 'error'
  for (const build of DOH_RESOLVERS) {
    try {
      result = await queryDoh(build(domain))
      break
    } catch {
      result = 'error'
    }
  }

  // Solo se cachean resultados definitivos; los errores de red pueden reintentarse.
  if (result !== 'error') mxCache.set(domain, result)
  return result
}

/** Valida una dirección: sintaxis y luego MX del dominio. */
export async function checkEmail(email: string): Promise<EmailCheck> {
  const trimmed = email.trim().toLowerCase()
  if (!isValidSyntax(trimmed)) return 'invalid_syntax'

  const domain = trimmed.split('@')[1]
  if (!domain) return 'invalid_syntax'

  const mx = await domainMx(domain)
  if (mx === 'has_mx') return 'valid'
  if (mx === 'no_mx') return 'no_mx'
  return 'error'
}

/**
 * Valida muchas direcciones en paralelo (deduplicando por dominio vía la cache).
 * Devuelve un mapa email -> resultado.
 */
export async function checkEmails(emails: string[]): Promise<Map<string, EmailCheck>> {
  const result = new Map<string, EmailCheck>()
  await Promise.all(
    emails.map(async (email) => {
      result.set(email, await checkEmail(email))
    }),
  )
  return result
}
