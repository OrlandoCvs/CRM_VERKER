import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { findDuplicateLead } from '@/lib/dedup'

/**
 * POST /api/search-history/[id]/import
 * Guarda como leads los resultados elegidos de una búsqueda del historial.
 *
 * Vale para las dos fuentes: un negocio de Google Places y una persona de
 * LinkedIn se guardan en los mismos campos, solo cambia cuáles vienen
 * rellenos. Los ya importados quedan marcados para no repetirlos.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

interface Body {
  /** Ids de resultados a importar. Si falta, se importan todos. */
  resultIds?: string[]
  /** Carpeta destino; se crea si no existe. */
  folderName?: string
  folderId?: string | null
}

/** Notas del lead con lo que no cabe en un campo propio. */
function buildNotes(r: {
  headline: string | null
  position: string | null
  company: string | null
  connections: number | null
  about: string | null
  source: string
}): string | null {
  const parts: string[] = []
  if (r.headline && r.headline !== r.position) parts.push(r.headline)
  if (r.position && r.company) parts.push(`${r.position} en ${r.company}`)
  if (r.connections !== null) {
    parts.push(
      r.source === 'linkedin' ? `${r.connections} contactos` : `${r.connections} reseñas`,
    )
  }
  if (r.about) parts.push(r.about)
  return parts.length > 0 ? parts.join('\n\n') : null
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const { resultIds, folderName, folderId } = (await req.json().catch(() => ({}))) as Body

  const run = await prisma.searchRun.findUnique({
    where: { id },
    include: {
      results: resultIds?.length ? { where: { id: { in: resultIds } } } : true,
    },
  })
  if (!run) {
    return Response.json({ error: 'Esa búsqueda ya no existe' }, { status: 404 })
  }
  if (run.results.length === 0) {
    return Response.json({ error: 'No hay resultados que importar' }, { status: 400 })
  }

  // Carpeta destino: la indicada, o una con el nombre dado (se reutiliza).
  let targetFolderId: string | null = null
  if (folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true },
    })
    targetFolderId = folder?.id ?? null
  } else if (folderName?.trim()) {
    const name = folderName.trim()
    const folder =
      (await prisma.folder.findFirst({ where: { name } })) ??
      (await prisma.folder.create({ data: { name, color: '#0ea5e9' } }))
    targetFolderId = folder.id
  }

  let created = 0
  let duplicates = 0
  let errors = 0

  for (const r of run.results) {
    // Ya importado en una pasada anterior: no se cuenta como duplicado nuevo.
    if (r.importedLeadId) {
      duplicates++
      continue
    }

    try {
      const isPerson = run.source === 'linkedin'
      const duplicateId = await findDuplicateLead({
        placeId: isPerson ? null : r.externalId,
        linkedin: r.linkedinUrl,
        name: r.name,
        phone: r.phone,
        website: r.website,
        city: r.city,
        isPerson,
      })

      if (duplicateId) {
        duplicates++
        // Se recuerda igualmente, para no volver a ofrecerlo.
        await prisma.searchResult.update({
          where: { id: r.id },
          data: { importedLeadId: duplicateId },
        })
        continue
      }

      const lead = await prisma.lead.create({
        data: {
          name: r.name,
          email: r.email,
          phone: r.phone,
          company: r.company,
          website: r.website,
          address: r.address,
          city: r.city,
          country: r.country,
          category: r.position,
          rating: r.rating,
          reviewCount: isPerson ? null : r.connections,
          linkedin: r.linkedinUrl,
          imageUrl: r.photo,
          notes: buildNotes({ ...r, source: run.source }),
          // El placeId es único: solo lo usan los negocios de Google.
          placeId: isPerson ? null : r.externalId || null,
          source: run.source,
          sourceQuery: run.label,
          status: 'new',
          folderId: targetFolderId,
        },
      })

      await prisma.searchResult.update({
        where: { id: r.id },
        data: { importedLeadId: lead.id },
      })
      created++
    } catch {
      errors++
    }
  }

  return Response.json({ created, duplicates, errors, total: run.results.length })
}
