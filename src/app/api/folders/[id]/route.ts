import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Walks the parent chain to decide whether re-parenting `folderId` under
 * `newParentId` would create a cycle (a folder cannot live inside itself
 * or inside any of its own descendants).
 */
async function wouldCreateCycle(folderId: string, newParentId: string): Promise<boolean> {
  if (folderId === newParentId) return true
  const folders = await prisma.folder.findMany({ select: { id: true, parentId: true } })
  const byId = new Map(folders.map((f) => [f.id, f.parentId]))

  let current: string | null | undefined = newParentId
  const seen = new Set<string>()
  while (current) {
    if (current === folderId) return true
    if (seen.has(current)) break // defensive: pre-existing cycle
    seen.add(current)
    current = byId.get(current) ?? null
  }
  return false
}

// PATCH /api/folders/[id] — rename, recolor or move (re-parent) a folder.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json()

  const existing = await prisma.folder.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'Carpeta no encontrada' }, { status: 404 })

  const data: { name?: string; color?: string | null; parentId?: string | null } = {}

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    data.name = name
  }

  if (body?.color !== undefined) {
    data.color = typeof body.color === 'string' ? body.color : null
  }

  if (body?.parentId !== undefined) {
    const newParentId: string | null = body.parentId ?? null
    if (newParentId) {
      const parent = await prisma.folder.findUnique({ where: { id: newParentId } })
      if (!parent) {
        return Response.json({ error: 'La carpeta destino no existe' }, { status: 400 })
      }
      if (await wouldCreateCycle(id, newParentId)) {
        return Response.json(
          { error: 'No puedes mover una carpeta dentro de sí misma' },
          { status: 400 },
        )
      }
    }
    data.parentId = newParentId
  }

  const folder = await prisma.folder.update({ where: { id }, data })
  return Response.json(folder)
}

/**
 * DELETE /api/folders/[id] — removes a folder without losing data:
 * its subfolders and leads are re-homed to the deleted folder's parent
 * (or to the root when it had none). Leads are never deleted.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const folder = await prisma.folder.findUnique({ where: { id } })
  if (!folder) return Response.json({ error: 'Carpeta no encontrada' }, { status: 404 })

  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { parentId: id },
      data: { parentId: folder.parentId },
    }),
    prisma.lead.updateMany({
      where: { folderId: id },
      data: { folderId: folder.parentId },
    }),
    prisma.folder.delete({ where: { id } }),
  ])

  return Response.json({ ok: true, reassignedTo: folder.parentId })
}
