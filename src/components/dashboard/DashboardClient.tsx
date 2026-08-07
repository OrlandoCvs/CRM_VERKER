'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Users, TrendingUp, Star, MapPin } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { StatusBadge, SourceBadge } from '@/components/ui/Badge'
import { FolderPicker, FOLDER_ALL, FOLDER_NONE } from '@/components/leads/FolderPicker'
import { Lead, Folder, LeadStatus, LeadSource, STATUS_LABELS, SOURCE_LABELS } from '@/types'
import { buildFolderTree, FolderNode, getDescendantIds } from '@/lib/folders'

const STATUS_PIE_COLORS: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  negotiating: '#8b5cf6',
  won: '#10b981',
  lost: '#ef4444',
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
  fontSize: 12,
} as const

type DashLead = Pick<
  Lead,
  'id' | 'name' | 'company' | 'city' | 'rating' | 'status' | 'source' | 'folderId' | 'createdAt' | 'updatedAt'
>

/**
 * Calcula métricas de conversión sobre un conjunto de leads.
 *
 * Nota sobre el tiempo de cierre: sin historial de cambios de estado, se
 * aproxima como (updatedAt − createdAt) de los leads ganados. Es una estimación
 * razonable porque ganar suele ser la última modificación del lead; si luego se
 * edita, el número puede inflarse. Se etiqueta como "aprox." en la interfaz.
 */
function computeConversion(leads: DashLead[]) {
  const total = leads.length
  const won = leads.filter((l) => l.status === 'won').length
  const lost = leads.filter((l) => l.status === 'lost').length
  // "Trabajados" = todo lo que salió de "nuevo" (se actuó sobre ellos).
  const worked = leads.filter((l) => l.status !== 'new').length
  const closed = won + lost

  const winRate = total > 0 ? Math.round((won / total) * 100) : 0
  // Tasa de cierre entre los que ya se resolvieron (ganado vs perdido).
  const closeRate = closed > 0 ? Math.round((won / closed) * 100) : 0
  const contactRate = total > 0 ? Math.round((worked / total) * 100) : 0

  const wonLeads = leads.filter((l) => l.status === 'won')
  let avgDaysToClose: number | null = null
  if (wonLeads.length > 0) {
    const totalMs = wonLeads.reduce((sum, l) => {
      const created = new Date(l.createdAt).getTime()
      const updated = new Date(l.updatedAt).getTime()
      return sum + Math.max(0, updated - created)
    }, 0)
    avgDaysToClose = Math.round(totalMs / wonLeads.length / 86400000)
  }

  return { total, won, lost, worked, winRate, closeRate, contactRate, avgDaysToClose }
}

interface Props {
  leads: DashLead[]
  folders: Folder[]
}

export function DashboardClient({ leads, folders }: Props) {
  const [folder, setFolder] = useState<string>(FOLDER_ALL)
  const [includeSub, setIncludeSub] = useState(true)

  // Conteo por carpeta acumulando subcarpetas, para el selector (igual que en Pipeline).
  const counts = useMemo(() => {
    const direct = new Map<string, number>()
    for (const l of leads) {
      if (l.folderId) direct.set(l.folderId, (direct.get(l.folderId) ?? 0) + 1)
    }
    const total = new Map<string, number>()
    const walk = (node: FolderNode): number => {
      let sum = direct.get(node.id) ?? 0
      for (const child of node.children) sum += walk(child)
      total.set(node.id, sum)
      return sum
    }
    buildFolderTree(folders).forEach(walk)
    return total
  }, [leads, folders])

  const noneCount = useMemo(() => leads.filter((l) => !l.folderId).length, [leads])

  // Alcance según la carpeta elegida: todas las métricas se calculan sobre esto.
  const scoped = useMemo(() => {
    if (folder === FOLDER_ALL) return leads
    if (folder === FOLDER_NONE) return leads.filter((l) => !l.folderId)
    const scope = new Set<string>([folder])
    if (includeSub) {
      for (const id of getDescendantIds(folder, folders)) scope.add(id)
    }
    return leads.filter((l) => l.folderId && scope.has(l.folderId))
  }, [leads, folder, includeSub, folders])

  const hasSubfolders =
    folder !== FOLDER_ALL && folder !== FOLDER_NONE && getDescendantIds(folder, folders).length > 0

  const stats = useMemo(
    () => ({
      totalLeads: scoped.length,
      newLeads: scoped.filter((l) => l.status === 'new').length,
      wonLeads: scoped.filter((l) => l.status === 'won').length,
      googlePlacesLeads: scoped.filter((l) => l.source === 'google_places').length,
    }),
    [scoped],
  )

  const statusData = useMemo(() => {
    const by = new Map<string, number>()
    for (const l of scoped) by.set(l.status, (by.get(l.status) ?? 0) + 1)
    // Orden estable por etapa del pipeline, no por recuento.
    return (['new', 'contacted', 'negotiating', 'won', 'lost'] as LeadStatus[])
      .filter((k) => (by.get(k) ?? 0) > 0)
      .map((k) => ({ name: STATUS_LABELS[k], value: by.get(k) ?? 0, key: k }))
  }, [scoped])

  const sourceData = useMemo(() => {
    const by = new Map<string, number>()
    for (const l of scoped) by.set(l.source, (by.get(l.source) ?? 0) + 1)
    return [...by.entries()].map(([source, count]) => ({
      name: SOURCE_LABELS[source as LeadSource] ?? source,
      count,
    }))
  }, [scoped])

  // Los leads ya llegan ordenados por fecha desc desde el servidor.
  const recentLeads = useMemo(() => scoped.slice(0, 8), [scoped])

  // Métricas de conversión: tasas y tiempo medio de cierre.
  const conversion = useMemo(() => computeConversion(scoped), [scoped])

  // Conversión por fuente: qué origen de leads acaba cerrando mejor.
  const bySourceConversion = useMemo(() => {
    const byId = new Map<string, { total: number; won: number }>()
    for (const l of scoped) {
      const key = l.source
      const acc = byId.get(key) ?? { total: 0, won: 0 }
      acc.total += 1
      if (l.status === 'won') acc.won += 1
      byId.set(key, acc)
    }
    return [...byId.entries()]
      .map(([source, v]) => ({
        name: SOURCE_LABELS[source as LeadSource] ?? source,
        total: v.total,
        won: v.won,
        rate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [scoped])

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Dashboard</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {folder === FOLDER_ALL
              ? 'Resumen general de tu CRM'
              : 'Resumen de la carpeta seleccionada'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FolderPicker
            folders={folders}
            value={folder}
            onChange={setFolder}
            counts={counts}
            allCount={leads.length}
            noneCount={noneCount}
          />
          {hasSubfolders && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-400">
              <input
                type="checkbox"
                checked={includeSub}
                onChange={(e) => setIncludeSub(e.target.checked)}
                className="cursor-pointer rounded border-gray-300 dark:border-gray-700"
              />
              Incluir subcarpetas
            </label>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Leads"
          value={stats.totalLeads}
          icon={<Users className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          label="Leads Nuevos"
          value={stats.newLeads}
          icon={<TrendingUp className="h-5 w-5" />}
          color="amber"
        />
        <StatCard
          label="Ganados"
          value={stats.wonLeads}
          icon={<Star className="h-5 w-5" />}
          color="emerald"
        />
        <StatCard
          label="Desde Google"
          value={stats.googlePlacesLeads}
          icon={<MapPin className="h-5 w-5" />}
          color="orange"
        />
      </div>

      {/* Conversion metrics */}
      <ConversionPanel conversion={conversion} bySource={bySourceConversion} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Leads por Estado</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={86}
                  dataKey="value"
                  paddingAngle={2}
                  // Separador del color de la superficie entre segmentos contiguos.
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_PIE_COLORS[entry.key] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
          {/* La leyenda lleva el valor: la identidad nunca depende solo del color. */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {statusData.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_PIE_COLORS[s.key] ?? '#94a3b8' }}
                />
                <span>{s.name}</span>
                <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Leads por Fuente</h3>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceData} barSize={40} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Leads Recientes</h3>
          <Link
            href="/leads"
            className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            Ver todos →
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {folder === FOLDER_ALL ? (
              <>
                No hay leads aún.{' '}
                <Link href="/search" className="text-blue-600 hover:underline">
                  Busca negocios
                </Link>{' '}
                para empezar.
              </>
            ) : (
              'Esta carpeta no tiene leads.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 ring-1 ring-inset ring-blue-100">
                  <span className="text-sm font-semibold text-blue-600">
                    {lead.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600">
                    {lead.name}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {lead.company ?? lead.city ?? '—'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SourceBadge source={lead.source as LeadSource} />
                  <StatusBadge status={lead.status as LeadStatus} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversionPanel({
  conversion,
  bySource,
}: {
  conversion: ReturnType<typeof computeConversion>
  bySource: { name: string; total: number; won: number; rate: number }[]
}) {
  const { total, won, worked, winRate, closeRate, contactRate, avgDaysToClose } = conversion

  if (total === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Conversión</h3>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Tasa de conversión"
          value={`${winRate}%`}
          hint={`${won} ganados de ${total}`}
          tone="emerald"
        />
        <Metric
          label="Tasa de cierre"
          value={`${closeRate}%`}
          hint="ganados vs. resueltos"
          tone="blue"
        />
        <Metric
          label="Leads trabajados"
          value={`${contactRate}%`}
          hint={`${worked} salieron de "nuevo"`}
          tone="amber"
        />
        <Metric
          label="Cierre promedio"
          value={avgDaysToClose === null ? '—' : `${avgDaysToClose} d`}
          hint="aprox., desde alta"
          tone="violet"
        />
      </div>

      {/* Conversión por fuente */}
      {bySource.length > 0 && (
        <div className="mt-5 border-t border-gray-100 dark:border-gray-800 pt-4">
          <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">Conversión por fuente</p>
          <div className="space-y-2.5">
            {bySource.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-gray-600 dark:text-gray-400">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {s.rate}% · {s.won}/{s.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'emerald' | 'blue' | 'amber' | 'violet'
}) {
  const toneCls: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    violet: 'text-violet-600',
  }
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums tracking-tight ${toneCls[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
      <p className="text-[11px] text-gray-400">{hint}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'amber' | 'emerald' | 'orange'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100',
  }
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 transition-shadow hover:shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ${colorMap[color]}`}
        >
          {icon}
        </span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
      Sin datos aún
    </div>
  )
}
