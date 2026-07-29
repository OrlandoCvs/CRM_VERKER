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

export interface DedupCandidate {
  placeId?: string | null
  name?: string | null
  phone?: string | null
  website?: string | null
  city?: string | null
}

/**
 * Busca un lead existente que sea el mismo negocio que `candidate`.
 * Devuelve su id, o null si no hay duplicado.
 *
 * Orden de confianza: placeId exacto → teléfono → web → nombre+ciudad.
 */
export async function findDuplicateLead(candidate: DedupCandidate): Promise<string | null> {
  // 1. placeId exacto (la señal más fiable).
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

  if (!phone && !website && !name) return null

  const existing = await prisma.lead.findMany({
    select: { id: true, name: true, phone: true, website: true, city: true },
  })

  for (const lead of existing) {
    if (phone && normalizePhone(lead.phone) === phone) return lead.id
    if (website && normalizeWebsite(lead.website) === website) return lead.id
    // Nombre + ciudad juntos: el nombre solo daría demasiados falsos positivos.
    if (name && city && normalizeText(lead.name) === name && normalizeText(lead.city) === city) {
      return lead.id
    }
  }

  return null
}
