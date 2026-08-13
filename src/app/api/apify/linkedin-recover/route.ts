import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apifyClient } from '@/lib/apify'
import { LINKEDIN_ACTOR, toResult, type LinkedInProfile, type LinkedInResult } from '@/lib/linkedin'

/**
 * POST /api/apify/linkedin-recover
 * Recupera los perfiles de una búsqueda de LinkedIn ya ejecutada y los guarda
 * como leads, sin volver a pagarla.
 *
 * Los resultados viven en el dataset de Apify durante días, así que una
 * búsqueda cuya vista se perdió (por un error de la interfaz o por cerrar el
 * navegador) no tiene por qué repetirse: el gasto ya está hecho.
 *
 * Sin `runId` toma la última ejecución del actor, que es el caso habitual.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Body {
  /** Ejecución concreta a recuperar. Si falta, se usa la más reciente. */
  runId?: string
  /** Carpeta donde dejar los leads; se crea si no existe. */
  folderName?: string
}

/** Notas del lead: lo que solo existe en LinkedIn. */
function buildNotes(profile: LinkedInResult): string | null {
  const parts: string[] = []
  if (profile.headline) parts.push(profile.headline)
  if (profile.position && profile.company) parts.push(`${profile.position} en ${profile.company}`)
  if (profile.connections !== null) parts.push(`${profile.connections} contactos`)
  if (profile.openToWork) parts.push('Abierto a ofertas')
  if (profile.about) {
    parts.push(profile.about.length > 600 ? profile.about.slice(0, 600) + '…' : profile.about)
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

/** Identificador del perfil dentro de la URL, para detectar duplicados. */
function linkedinKey(url?: string | null): string | null {
  if (!url) return null
  return url.trim().toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] ?? null
}

export async function POST(req: NextRequest) {
  if (!process.env.APIFY_TOKEN) {
    return Response.json({ error: 'Apify no está configurado' }, { status: 400 })
  }

  const { runId, folderName } = (await req.json().catch(() => ({}))) as Body

  try {
    // Sin runId se toma la última ejecución del actor de LinkedIn.
    let targetRunId = runId?.trim()
    if (!targetRunId) {
      const { items } = await apifyClient.actor(LINKEDIN_ACTOR).runs().list({ desc: true, limit: 1 })
      targetRunId = items[0]?.id
    }
    if (!targetRunId) {
      return Response.json({ error: 'No hay ninguna búsqueda previa que recuperar' }, { status: 404 })
    }

    const run = await apifyClient.run(targetRunId).get()
    if (!run?.defaultDatasetId) {
      return Response.json({ error: 'Esa búsqueda no tiene resultados guardados' }, { status: 404 })
    }

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()
    const profiles = (items as unknown as LinkedInProfile[])
      .map(toResult)
      .filter((p) => p.name && p.linkedinUrl)

    if (profiles.length === 0) {
      return Response.json({ error: 'Esa búsqueda no devolvió ningún perfil' }, { status: 404 })
    }

    // Se comparan todos de una vez: una consulta en vez de una por perfil.
    const existing = await prisma.lead.findMany({ select: { linkedin: true } })
    const known = new Set(
      existing.map((l) => linkedinKey(l.linkedin)).filter((k): k is string => Boolean(k)),
    )

    const name = folderName?.trim() || 'LinkedIn'
    const folder =
      (await prisma.folder.findFirst({ where: { name } })) ??
      (await prisma.folder.create({ data: { name, color: '#0ea5e9' } }))

    let created = 0
    let duplicates = 0

    for (const profile of profiles) {
      const key = linkedinKey(profile.linkedinUrl)
      if (key && known.has(key)) {
        duplicates++
        continue
      }
      if (key) known.add(key)

      await prisma.lead.create({
        data: {
          name: profile.name,
          email: profile.email || null,
          company: profile.company || null,
          city: profile.city || null,
          country: profile.country || null,
          category: profile.position || null,
          linkedin: profile.linkedinUrl,
          imageUrl: profile.photo || null,
          notes: buildNotes(profile),
          source: 'linkedin',
          sourceQuery: 'Recuperado de una búsqueda anterior',
          status: 'new',
          folderId: folder.id,
        },
      })
      created++
    }

    return Response.json({
      created,
      duplicates,
      total: profiles.length,
      folder: { id: folder.id, name: folder.name },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al recuperar la búsqueda'
    return Response.json({ error: message }, { status: 502 })
  }
}
