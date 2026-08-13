import { prisma } from '@/lib/db'

/**
 * Historial de búsquedas de prospectos.
 *
 * Cada búsqueda consume créditos de Apify, así que sus resultados se guardan
 * aquí en lugar de depender del dataset de Apify, que en el plan gratuito se
 * borra a los pocos días. Así se puede reabrir una búsqueda pasada y decidir a
 * quién importar sin volver a pagarla.
 *
 * Sirve para las dos fuentes: Google Places (negocios) y LinkedIn (personas).
 * Solo se guarda lo necesario para revisar y decidir; los datos voluminosos que
 * aporta cada fuente (horarios, reseñas, experiencia laboral) se descartan.
 */

/** Días que se conserva una búsqueda antes de borrarse sola. */
export const RETENTION_DAYS = 30

export type SearchSource = 'google_places' | 'linkedin'

/** Resultado normalizado, común a ambas fuentes. */
export interface HistoryResult {
  externalId: string
  name: string
  headline?: string | null
  company?: string | null
  position?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  linkedinUrl?: string | null
  photo?: string | null
  about?: string | null
  connections?: number | null
  rating?: number | null
}

/** Recorta un texto largo: el historial es para decidir, no para archivar. */
function short(value: string | null | undefined, max = 500): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * Borra las búsquedas que superan la retención.
 *
 * Se ejecuta al listar el historial en vez de con una tarea programada: así no
 * hace falta un proceso aparte y la limpieza ocurre justo cuando alguien mira.
 * Los resultados se van en cascada.
 */
export async function purgeOldRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await prisma.searchRun.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  return count
}

/**
 * Registra una búsqueda y sus resultados.
 *
 * Nunca interrumpe la búsqueda: si el historial falla, el usuario debe seguir
 * viendo los resultados que ya ha pagado. Por eso devuelve `null` en vez de
 * propagar el error.
 */
export async function recordSearch(params: {
  source: SearchSource
  label: string
  filters?: unknown
  runId?: string | null
  results: HistoryResult[]
}): Promise<string | null> {
  const { source, label, filters, runId, results } = params
  if (results.length === 0) return null

  try {
    const run = await prisma.searchRun.create({
      data: {
        source,
        label: label.slice(0, 300),
        filters: filters ? JSON.stringify(filters) : null,
        runId: runId ?? null,
        resultCount: results.length,
        emailCount: results.filter((r) => r.email?.trim()).length,
        results: {
          create: results.map((r) => ({
            externalId: r.externalId,
            name: r.name,
            headline: short(r.headline, 300),
            company: short(r.company, 200),
            position: short(r.position, 200),
            email: short(r.email, 200),
            phone: short(r.phone, 60),
            website: short(r.website, 300),
            address: short(r.address, 300),
            city: short(r.city, 120),
            country: short(r.country, 120),
            linkedinUrl: short(r.linkedinUrl, 300),
            photo: short(r.photo, 500),
            about: short(r.about, 500),
            connections: typeof r.connections === 'number' ? r.connections : null,
            rating: typeof r.rating === 'number' ? r.rating : null,
          })),
        },
      },
      select: { id: true },
    })

    // Se purga después de guardar, para no perder la búsqueda recién hecha si
    // la limpieza fallara.
    await purgeOldRuns().catch(() => {})

    return run.id
  } catch {
    // El historial es un extra: su fallo no debe tumbar la búsqueda.
    return null
  }
}
