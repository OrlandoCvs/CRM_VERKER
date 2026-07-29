import { prisma } from '@/lib/db'
import { RemindersAgenda, AgendaReminder } from '@/components/leads/RemindersAgenda'

export default async function RemindersPage() {
  const raw = (await prisma.reminder.findMany({
    where: { done: false },
    orderBy: { dueAt: 'asc' },
    include: { lead: { select: { id: true, name: true, company: true } } },
  })) as unknown as Array<{
    id: string; title: string; dueAt: Date; leadId: string
    lead: { id: string; name: string; company: string | null }
  }>

  const reminders: AgendaReminder[] = raw.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt.toISOString(),
    lead: r.lead,
  }))

  return <RemindersAgenda initialReminders={reminders} />
}
