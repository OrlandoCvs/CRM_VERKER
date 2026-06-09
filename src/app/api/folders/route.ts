import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

// GET /api/folders — flat list of every folder, sorted by name.
export async function GET() {
  const folders = await prisma.folder.findMany({ orderBy: { name: 'asc' } })
  return Response.json(folders)
}

// POST /api/folders — create a folder, optionally nested under `parentId`.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const parentId: string | null = body?.parentId ?? null
  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } })
    if (!parent) {
      return Response.json({ error: 'La carpeta padre no existe' }, { status: 400 })
    }
  }

  const folder = await prisma.folder.create({
    data: {
      name,
      color: typeof body?.color === 'string' ? body.color : null,
      parentId,
    },
  })
  return Response.json(folder, { status: 201 })
}
