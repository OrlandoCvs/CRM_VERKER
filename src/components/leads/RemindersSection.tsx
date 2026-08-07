'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Plus, Check, Trash2, Loader2, AlarmClock } from 'lucide-react'
import { Reminder } from '@/types'

/** Devuelve un valor `datetime-local` (YYYY-MM-DDTHH:mm) para dentro de N días a las 9:00. */
function defaultDue(daysAhead = 1): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(9, 0, 0, 0)
  // Ajuste a hora local para el input (toISOString daría UTC).
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

/** Etiqueta relativa y color según cuán cerca/vencido está el recordatorio. */
function dueMeta(dueAt: string, done: boolean): { label: string; tone: string } {
  const due = new Date(dueAt)
  const now = new Date()
  const fmt = due.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  if (done) return { label: fmt, tone: 'text-gray-400' }

  const diffMs = due.getTime() - now.getTime()
  const dayMs = 86400000
  if (diffMs < 0) return { label: `Vencido · ${fmt}`, tone: 'text-red-600' }
  if (diffMs < dayMs) return { label: `Hoy · ${fmt}`, tone: 'text-amber-600' }
  if (diffMs < 2 * dayMs) return { label: `Mañana · ${fmt}`, tone: 'text-blue-600' }
  return { label: fmt, tone: 'text-gray-500 dark:text-gray-400' }
}

export function RemindersSection({ leadId }: { leadId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState(defaultDue())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/leads/${leadId}/reminders`)
      .then((r) => r.json())
      .then((data) => alive && setReminders(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [leadId])

  const { pending, done } = useMemo(() => {
    const pending = reminders.filter((r) => !r.done)
    const done = reminders.filter((r) => r.done)
    return { pending, done }
  }, [reminders])

  async function add() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), dueAt: new Date(dueAt).toISOString() }),
      })
      if (res.ok) {
        const created: Reminder = await res.json()
        setReminders((prev) => [...prev, created])
        setTitle('')
        setDueAt(defaultDue())
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggle(r: Reminder) {
    // Optimista: reflejar el cambio ya y revertir si el servidor falla.
    const next = !r.done
    setReminders((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, done: next } : x)),
    )
    const res = await fetch(`/api/reminders/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: next }),
    })
    if (!res.ok) {
      setReminders((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, done: r.done } : x)),
      )
    }
  }

  async function remove(id: string) {
    const prev = reminders
    setReminders((p) => p.filter((x) => x.id !== id))
    const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
    if (!res.ok) setReminders(prev)
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Seguimiento</h4>
        {pending.length > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            {pending.length} pendiente{pending.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Alta rápida */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Volver a llamar, enviar propuesta…"
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={add}
          disabled={saving || !title.trim()}
          className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-400">Cargando…</p>
      ) : reminders.length === 0 ? (
        <div className="py-6 text-center">
          <AlarmClock className="mx-auto mb-1.5 h-6 w-6 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-gray-400">Sin recordatorios. Agenda un seguimiento.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pending.map((r) => (
            <ReminderRow key={r.id} reminder={r} onToggle={toggle} onRemove={remove} />
          ))}
          {done.length > 0 && pending.length > 0 && (
            <div className="pt-2 text-xs font-medium text-gray-400">Completados</div>
          )}
          {done.map((r) => (
            <ReminderRow key={r.id} reminder={r} onToggle={toggle} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReminderRow({
  reminder,
  onToggle,
  onRemove,
}: {
  reminder: Reminder
  onToggle: (r: Reminder) => void
  onRemove: (id: string) => void
}) {
  const meta = dueMeta(reminder.dueAt, reminder.done)
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
      <button
        onClick={() => onToggle(reminder)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          reminder.done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-gray-300 dark:border-gray-700 hover:border-emerald-400'
        }`}
        aria-label={reminder.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
      >
        {reminder.done && <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${reminder.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
          {reminder.title}
        </p>
        <p className={`text-xs ${meta.tone}`}>{meta.label}</p>
      </div>

      <button
        onClick={() => onRemove(reminder.id)}
        className="shrink-0 rounded p-1 text-gray-300 dark:text-gray-600 opacity-0 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        aria-label="Eliminar recordatorio"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
