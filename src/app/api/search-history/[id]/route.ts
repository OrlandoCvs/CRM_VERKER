import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Una búsqueda concreta del historial:
 *   GET    → sus resultados, para revisarlos y decidir a quién importar
 *   DELETE → la borra a mano, sin esperar a que caduque
 */

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  const run = await prisma.searchRun.findUnique({
    where: { id },
    include: {
      results: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!run) {
    return Response.json({ error: 'Esa búsqueda ya no existe' }, { status: 404 })
  }

  return Response.json({ run })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  // Los resultados se van en cascada (definido en el esquema).
  await prisma.searchRun.delete({ where: { id } }).catch(() => null)

  return Response.json({ ok: true })
}
