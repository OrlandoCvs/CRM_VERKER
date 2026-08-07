'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { MapPin, Star, Loader2 } from 'lucide-react'
import { LeadStatus, STATUS_LABELS, STATUS_COLORS } from '@/types'
import { MapLead } from './LeafletMap'

const LeafletMap = dynamic(
  () => import('./LeafletMap').then((m) => ({ default: m.LeafletMap })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando mapa...</p>
      </div>
    ),
  }
)

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'negotiating', 'won', 'lost']

const STATUS_DOT: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-yellow-400',
  negotiating: 'bg-purple-500',
  won: 'bg-green-500',
  lost: 'bg-red-500',
}

interface Props {
  leads: MapLead[]
  allLeadsCount: number
  leadsWithoutCoords: { id: string; name: string; status: string; city: string | null }[]
}

export function MapClient({ leads, allLeadsCount, leadsWithoutCoords }: Props) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(
    () => (statusFilter ? leads.filter((l) => l.status === statusFilter) : leads),
    [leads, statusFilter]
  )

  const selectedLead = useMemo(() => filtered.find((l) => l.id === selectedId), [filtered, selectedId])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="w-72 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">Mapa de Leads</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {leads.length} de {allLeadsCount} leads con coordenadas
          </p>
        </div>

        {/* Status filter */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Filtrar por estado</p>
          <div className="space-y-1">
            <button
              onClick={() => setStatusFilter(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                statusFilter === null ? 'bg-gray-900 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0" />
              Todos ({leads.length})
            </button>
            {STATUS_OPTIONS.map((s) => {
              const count = leads.filter((l) => l.status === s).length
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s === statusFilter ? null : s)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    statusFilter === s ? 'bg-gray-900 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                  {STATUS_LABELS[s]} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected lead info */}
        {selectedLead && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-blue-50">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{selectedLead.name}</p>
                {selectedLead.category && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedLead.category}</p>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs shrink-0">✕</button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedLead.status as LeadStatus]}`}>
                {STATUS_LABELS[selectedLead.status as LeadStatus]}
              </span>
              {selectedLead.rating != null && (
                <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  {selectedLead.rating.toFixed(1)}
                </span>
              )}
            </div>
            {selectedLead.city && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {selectedLead.city}
              </p>
            )}
            <Link
              href={`/leads/${selectedLead.id}`}
              className="mt-2 block text-center text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium"
            >
              Ver detalle completo →
            </Link>
          </div>
        )}

        {/* Leads without coords */}
        {leadsWithoutCoords.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-400">{leadsWithoutCoords.length} sin coordenadas</p>
            </div>
            <div className="divide-y divide-gray-50">
              {leadsWithoutCoords.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[l.status] ?? 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{l.name}</p>
                    {l.city && <p className="text-xs text-gray-400 truncate">{l.city}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900">
            <MapPin className="w-12 h-12 text-gray-200 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">No hay leads con coordenadas para este filtro</p>
            <Link href="/search" className="text-sm text-blue-600 hover:underline">
              Buscar e importar leads →
            </Link>
          </div>
        ) : (
          <LeafletMap leads={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </div>
    </div>
  )
}
