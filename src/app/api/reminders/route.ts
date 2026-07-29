import { prisma } from '@/lib/db'

/**
 * GET /api/reminders — agenda global de recordatorios pendientes, con el lead
 * asociado, ordenados por vencimiento. Alimenta el contador de "vencidos/hoy"
 * y cualquier vista de agenda.
 */
export async function GET() {
  const reminders = await prisma.reminder.findMany({
    where: { done: false },
    orderBy: { dueAt: 'asc' },
    include: { lead: { select: { id: true, name: true, company: true } } },
  })
  return Response.json(reminders)
}
