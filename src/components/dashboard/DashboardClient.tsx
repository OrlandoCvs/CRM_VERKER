'use client'

import Link from 'next/link'
import { Users, TrendingUp, Star, MapPin } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { StatusBadge, SourceBadge } from '@/components/ui/Badge'
import { LeadStatus, LeadSource, STATUS_LABELS, SOURCE_LABELS } from '@/types'

const STATUS_PIE_COLORS: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  negotiating: '#8b5cf6',
  won: '#10b981',
  lost: '#ef4444',
}

interface Props {
  stats: { totalLeads: number; wonLeads: number; newLeads: number; googlePlacesLeads: number }
  byStatus: { status: string; count: number }[]
  bySource: { source: string; count: number }[]
  recentLeads: {
    id: string
    name: string
    company: string | null
    status: string
    source: string
    city: string | null
    rating: number | null
    createdAt: string
  }[]
}

export function DashboardClient({ stats, byStatus, bySource, recentLeads }: Props) {
  const statusData = byStatus.map((s) => ({
    name: STATUS_LABELS[s.status as LeadStatus] ?? s.status,
    value: s.count,
    key: s.status,
  }))

  const sourceData = bySource.map((s) => ({
    name: SOURCE_LABELS[s.source as LeadSource] ?? s.source,
    count: s.count,
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-0.5">Resumen general de tu CRM</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={stats.totalLeads}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="Leads Nuevos"
          value={stats.newLeads}
          icon={<TrendingUp className="w-5 h-5" />}
          color="yellow"
        />
        <StatCard
          label="Ganados"
          value={stats.wonLeads}
          icon={<Star className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="Desde Google"
          value={stats.googlePlacesLeads}
          icon={<MapPin className="w-5 h-5" />}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Leads por Estado</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {statusData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={STATUS_PIE_COLORS[entry.key] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {statusData.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_PIE_COLORS[s.key] ?? '#94a3b8' }}
                />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Leads por Fuente</h3>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Leads Recientes</h3>
          <Link href="/leads" className="text-sm text-blue-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No hay leads aún.{' '}
            <Link href="/search" className="text-blue-600 hover:underline">
              Busca negocios
            </Link>{' '}
            para empezar.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-blue-600 font-semibold text-sm">
                    {lead.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {lead.company ?? lead.city ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'yellow' | 'green' | 'orange'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
      Sin datos aún
    </div>
  )
}
