import { prisma } from '@/lib/db'

/**
 * Deduplicación de leads al importar.
 *
 * El identificador fuerte es `placeId` (único de Google Places). Pero no todos
 * los registros lo traen, y un mismo negocio puede aparecer con placeId distinto
 * o importarse a mano. Por eso, cuando no hay placeId, se busca un duplicado
 * "probable" combinando señales normalizadas (teléfono, web, o nombre+ciudad).
 */

/** Normaliza un teléfono a solo dígitos para comparar sin importar el formato. */
function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  // Se queda con los últimos 10 dígitos: ignora prefijos de país inconsistentes.
  return digits.length >= 7 ? digits.slice(-10) : null
}

/** Normaliza un dominio web: sin protocolo, sin www, sin barra final, minúsculas. */
function normalizeWebsite(website?: string | null): string | null {
  if (!website) return null
  const cleaned = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
  return cleaned || null
}

/** Normaliza texto para comparaciones laxas (sin acentos, espacios colapsados). */
function normalizeText(text?: string | null): string | null {
  if (!text) return null
  const cleaned = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
  return cleaned || null
}

/**
 * Normaliza una URL de perfil de LinkedIn a su identificador público.
 *
 * `https://www.linkedin.com/in/juan-perez/` y `linkedin.com/in/juan-perez?x=1`
 * son la misma persona, así que se reduce todo al tramo que sigue a `/in/`.
 */
function normalizeLinkedIn(url?: string | null): string | null {
  if (!url) return null
  const match = url.trim().toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/)
  return match?.[1] ?? null
}

export interface DedupCandidate {
  placeId?: string | null
  name?: string | null
  phone?: string | null
  website?: string | null
  city?: string | null
  /** URL del perfil de LinkedIn: identifica a una persona sin ambigüedad. */
  linkedin?: string | null
  /**
   * Marca que el candidato es una persona, no un negocio.
   *
   * Cambia las reglas: dos personas homónimas en la misma ciudad son habituales
   * («Juan Pérez» en Monterrey), así que esa combinación deja de servir como
   * prueba de duplicado. Para un negocio sí sirve.
   */
  isPerson?: boolean
}

/**
 * Busca un lead existente que sea el mismo contacto que `candidate`.
 * Devuelve su id, o null si no hay duplicado.
 *
 * Orden de confianza: placeId → perfil de LinkedIn → teléfono → web →
 * nombre+ciudad (esta última solo para negocios).
 */
export async function findDuplicateLead(candidate: DedupCandidate): Promise<string | null> {
  // 1. placeId exacto (la señal más fiable para un negocio).
  if (candidate.placeId) {
    const byPlace = await prisma.lead.findFirst({
      where: { placeId: candidate.placeId },
      select: { id: true },
    })
    if (byPlace) return byPlace.id
  }

  // 2. Mismo teléfono. Como SQLite no normaliza, se compara en memoria sobre los
  //    leads que tienen teléfono (conjunto acotado; suficiente para este volumen).
  const phone = normalizePhone(candidate.phone)
  const website = normalizeWebsite(candidate.website)
  const name = normalizeText(candidate.name)
  const city = normalizeText(candidate.city)
  const linkedin = normalizeLinkedIn(candidate.linkedin)

  if (!phone && !website && !name && !linkedin) return null

  const existing = await prisma.lead.findMany({
    select: { id: true, name: true, phone: true, website: true, city: true, linkedin: true },
  })

  for (const lead of existing) {
    // El perfil de LinkedIn identifica a una persona sin ambigüedad: va primero.
    if (linkedin && normalizeLinkedIn(lead.linkedin) === linkedin) return lead.id
    if (phone && normalizePhone(lead.phone) === phone) return lead.id
    if (website && normalizeWebsite(lead.website) === website) return lead.id
    // Nombre + ciudad juntos: el nombre solo daría demasiados falsos positivos.
    // No se aplica a personas, donde los homónimos son frecuentes.
    if (
      !candidate.isPerson &&
      name && city &&
      normalizeText(lead.name) === name &&
      normalizeText(lead.city) === city
    ) {
      return lead.id
    }
  }

  return null
}
