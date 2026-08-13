import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { purgeOldRuns, RETENTION_DAYS } from '@/lib/search-history'

/**
 * GET /api/search-history?source=linkedin
 * Lista las búsquedas guardadas, de la más reciente a la más antigua.
 *
 * Aprovecha la consulta para borrar las que superan la retención: así la
 * limpieza no necesita un proceso programado aparte.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source')

  // La purga no debe impedir ver el historial si algo va mal.
  await purgeOldRuns().catch(() => {})

  const runs = await prisma.searchRun.findMany({
    where: source ? { source } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      label: true,
      resultCount: true,
      emailCount: true,
      createdAt: true,
    },
    // Suficiente para un mes de trabajo; evita respuestas enormes.
    take: 100,
  })

  return Response.json({ runs, retentionDays: RETENTION_DAYS })
}
