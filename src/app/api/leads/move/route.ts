import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * POST /api/leads/move — assigns a batch of leads to a folder.
 * Body: { leadIds: string[], folderId: string | null }
 * A null `folderId` removes the leads from any folder.
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const leadIds: unknown = body?.leadIds
  const folderId: string | null = body?.folderId ?? null

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return Response.json({ error: 'Selecciona al menos un lead' }, { status: 400 })
  }
  if (!leadIds.every((v) => typeof v === 'string')) {
    return Response.json({ error: 'leadIds inválido' }, { status: 400 })
  }

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } })
    if (!folder) {
      return Response.json({ error: 'La carpeta no existe' }, { status: 404 })
    }
  }

  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds as string[] } },
    data: { folderId },
  })

  return Response.json({ ok: true, count: result.count, folderId })
}
