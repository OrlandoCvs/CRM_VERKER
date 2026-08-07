'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, ChevronRight, Building2, CalendarCheck } from 'lucide-react'

export interface AgendaReminder {
  id: string
  title: string
  dueAt: string
  lead: { id: string; name: string; company: string | null }
}

type Bucket = 'overdue' | 'today' | 'tomorrow' | 'upcoming'

const BUCKET_META: Record<Bucket, { label: string; tone: string }> = {
  overdue: { label: 'Vencidos', tone: 'text-red-600' },
  today: { label: 'Hoy', tone: 'text-amber-600' },
  tomorrow: { label: 'Mañana', tone: 'text-blue-600' },
  upcoming: { label: 'Próximos', tone: 'text-gray-500 dark:text-gray-400' },
}
const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'tomorrow', 'upcoming']

function bucketOf(dueAt: string): Bucket {
  const due = new Date(dueAt)
  const now = new Date()
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999)
  const endTomorrow = new Date(endToday); endTomorrow.setDate(endTomorrow.getDate() + 1)
  if (due < now) return 'overdue'
  if (due <= endToday) return 'today'
  if (due <= endTomorrow) return 'tomorrow'
  return 'upcoming'
}

export function RemindersAgenda({ initialReminders }: { initialReminders: AgendaReminder[] }) {
  const [reminders, setReminders] = useState(initialReminders)

  const grouped = useMemo(() => {
    const map: Record<Bucket, AgendaReminder[]> = {
      overdue: [], today: [], tomorrow: [], upcoming: [],
    }
    for (const r of reminders) map[bucketOf(r.dueAt)].push(r)
    return map
  }, [reminders])

  async function complete(id: string) {
    const prev = reminders
    setReminders((p) => p.filter((r) => r.id !== id))
    const res = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    if (!res.ok) setReminders(prev)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          Seguimientos
        </h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Tareas pendientes sobre tus leads, ordenadas por urgencia.
        </p>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-16 text-center">
          <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No tienes seguimientos pendientes.</p>
          <p className="mt-1 text-xs text-gray-400">
            Agenda uno desde la ficha de cualquier lead.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.map((bucket) => {
            const items = grouped[bucket]
            if (items.length === 0) return null
            const meta = BUCKET_META[bucket]
            return (
              <div key={bucket}>
                <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${meta.tone}`}>
                  {meta.label}
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {items.length}
                  </span>
                </h3>
                <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  {items.map((r) => (
                    <AgendaRow key={r.id} reminder={r} onComplete={complete} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AgendaRow({
  reminder,
  onComplete,
}: {
  reminder: AgendaReminder
  onComplete: (id: string) => void
}) {
  const due = new Date(reminder.dueAt).toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
      <button
        onClick={() => onComplete(reminder.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 text-transparent transition-colors hover:border-emerald-400 hover:text-emerald-500"
        aria-label="Marcar como completado"
        title="Marcar como completado"
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{reminder.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{due}</p>
      </div>

      <Link
        href={`/leads/${reminder.lead.id}`}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="max-w-[10rem] truncate">
          {reminder.lead.company || reminder.lead.name}
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
