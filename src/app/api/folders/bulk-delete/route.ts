import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import { expandWithDescendants, resolveSurvivingParent } from '@/lib/folders'

/**
 * POST /api/folders/bulk-delete — deletes one or more folders.
 * Body: { folderIds: string[], cascade: boolean }
 *
 *  - cascade = false → keep the data: subfolders and leads are re-homed to the
 *    nearest surviving ancestor (or the root). No lead is ever deleted.
 *  - cascade = true  → delete the folders, every nested subfolder, and every
 *    lead contained in any of them.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const folderIds: unknown = body?.folderIds
  const cascade: boolean = body?.cascade === true

  if (!Array.isArray(folderIds) || folderIds.length === 0) {
    return Response.json({ error: 'Selecciona al menos una carpeta' }, { status: 400 })
  }
  if (!folderIds.every((v) => typeof v === 'string')) {
    return Response.json({ error: 'folderIds inválido' }, { status: 400 })
  }
  const ids = folderIds as string[]

  const allFolders = await prisma.folder.findMany({ select: { id: true, parentId: true } })

  if (cascade) {
    const full = [...expandWithDescendants(ids, allFolders)]
    const [leadsResult, foldersResult] = await prisma.$transaction([
      prisma.lead.deleteMany({ where: { folderId: { in: full } } }),
      prisma.folder.deleteMany({ where: { id: { in: full } } }),
    ])
    return Response.json({
      ok: true,
      deletedFolders: foldersResult.count,
      deletedLeads: leadsResult.count,
    })
  }

  // Keep contents — figure out where every orphaned item should land.
  const deleteSet = new Set(ids)
  const leadsInside = await prisma.lead.findMany({
    where: { folderId: { in: ids } },
    select: { id: true, folderId: true },
  })

  // Group leads by their resolved destination so we can update them in batches.
  const leadsByTarget = new Map<string | null, string[]>()
  for (const lead of leadsInside) {
    const target = resolveSurvivingParent(lead.folderId, deleteSet, allFolders)
    const bucket = leadsByTarget.get(target)
    if (bucket) bucket.push(lead.id)
    else leadsByTarget.set(target, [lead.id])
  }

  await prisma.$transaction(async (tx) => {
    // Re-parent surviving subfolders whose parent is being deleted.
    for (const folder of allFolders) {
      if (deleteSet.has(folder.id)) continue
      if (folder.parentId && deleteSet.has(folder.parentId)) {
        await tx.folder.update({
          where: { id: folder.id },
          data: { parentId: resolveSurvivingParent(folder.parentId, deleteSet, allFolders) },
        })
      }
    }
    // Re-home the leads.
    for (const [target, leadIds] of leadsByTarget) {
      await tx.lead.updateMany({ where: { id: { in: leadIds } }, data: { folderId: target } })
    }
    // Finally remove the folders themselves.
    await tx.folder.deleteMany({ where: { id: { in: ids } } })
  })

  return Response.json({ ok: true, deletedFolders: ids.length, deletedLeads: 0 })
}
