import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { findDuplicateLead } from '@/lib/dedup'
import type { LinkedInResult } from '@/lib/linkedin'

/**
 * POST /api/apify/linkedin-import
 * Guarda un perfil de LinkedIn como lead.
 *
 * LinkedIn describe personas, no negocios: no hay teléfono, dirección postal ni
 * valoraciones, y esos campos quedan vacíos (todos son opcionales en el
 * esquema). Lo que sí aporta —cargo, empresa y titular— se conserva en los
 * campos equivalentes y en las notas.
 */

interface Body {
  profile?: LinkedInResult
  sourceQuery?: string
  folderId?: string | null
}

/**
 * Compone las notas del lead con lo que solo existe en LinkedIn.
 * Se recorta el "acerca de", que puede ocupar varios párrafos.
 */
function buildNotes(profile: LinkedInResult): string | null {
  const parts: string[] = []
  if (profile.headline) parts.push(profile.headline)
  if (profile.position && profile.company) {
    parts.push(`${profile.position} en ${profile.company}`)
  }
  if (profile.connections !== null) parts.push(`${profile.connections} contactos`)
  if (profile.openToWork) parts.push('Abierto a ofertas')
  if (profile.about) {
    parts.push(profile.about.length > 600 ? profile.about.slice(0, 600) + '…' : profile.about)
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

export async function POST(req: NextRequest) {
  const { profile, sourceQuery, folderId } = (await req.json().catch(() => ({}))) as Body

  if (!profile?.name || !profile.linkedinUrl) {
    return Response.json({ error: 'Perfil incompleto' }, { status: 400 })
  }

  try {
    // El perfil de LinkedIn es el identificador fuerte de una persona.
    // `isPerson` evita descartar homónimos como si fueran el mismo contacto.
    const duplicateId = await findDuplicateLead({
      linkedin: profile.linkedinUrl,
      name: profile.name,
      city: profile.city,
      isPerson: true,
    })
    if (duplicateId) {
      return Response.json({ id: duplicateId, status: 'duplicate' }, { status: 200 })
    }

    // La carpeta se verifica antes de usarla: un id inválido violaría la clave
    // foránea y haría fallar el guardado entero.
    let targetFolderId: string | null = null
    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { id: true },
      })
      targetFolderId = folder?.id ?? null
    }

    const lead = await prisma.lead.create({
      data: {
        name: profile.name,
        email: profile.email || null,
        company: profile.company || null,
        city: profile.city || null,
        country: profile.country || null,
        // El cargo hace de categoría: es lo que segmenta una campaña.
        category: profile.position || null,
        linkedin: profile.linkedinUrl,
        imageUrl: profile.photo || null,
        notes: buildNotes(profile),
        source: 'linkedin',
        sourceQuery: sourceQuery ?? null,
        status: 'new',
        folderId: targetFolderId,
      },
    })

    return Response.json({ ...lead, status: 'created' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al guardar el perfil'
    return Response.json({ error: message }, { status: 500 })
  }
}
