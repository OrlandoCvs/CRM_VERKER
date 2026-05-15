'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  Filter,
  Star,
  Phone,
  Globe,
  MapPin,
  Trash2,
  Edit,
} from 'lucide-react'
import { StatusBadge, SourceBadge } from '@/components/ui/Badge'
import { LeadFormModal } from '@/components/leads/LeadFormModal'
import { Lead, LeadStatus, LeadSource, STATUS_LABELS, SOURCE_LABELS } from '@/types'

interface Props {
  initialLeads: Lead[]
}

export function LeadsClient({ initialLeads }: Props) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchQ =
        !q ||
        l.name.toLowerCase().includes(q.toLowerCase()) ||
        (l.company ?? '').toLowerCase().includes(q.toLowerCase()) ||
        (l.city ?? '').toLowerCase().includes(q.toLowerCase()) ||
        (l.email ?? '').toLowerCase().includes(q.toLowerCase())
      const matchStatus = statusFilter === 'all' || l.status === statusFilter
      const matchSource = sourceFilter === 'all' || l.source === sourceFilter
      return matchQ && matchStatus && matchSource
    })
  }, [leads, q, statusFilter, sourceFilter])

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este lead?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    setLeads((prev) => prev.filter((l) => l.id !== id))
  }

  async function handleSave(data: Partial<Lead>) {
    if (editingLead) {
      const res = await fetch(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const updated = await res.json()
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
    } else {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, source: 'manual' }),
      })
      const created = await res.json()
      setLeads((prev) => [{ ...created, contacts: [], activities: [] }, ...prev])
    }
    setShowModal(false)
    setEditingLead(null)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} de {leads.length} leads</p>
        </div>
        <button
          onClick={() => { setEditingLead(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar leads..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos los estados</option>
          {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todas las fuentes</option>
          {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay leads que coincidan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ubicación</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Rating</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fuente</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Categoría</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="hover:text-blue-600">
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">{lead.name}</p>
                        {lead.company && (
                          <p className="text-xs text-gray-400 truncate max-w-[180px]">{lead.company}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Phone className="w-3 h-3" />
                            <span className="text-xs">{lead.phone}</span>
                          </div>
                        )}
                        {lead.website && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Globe className="w-3 h-3" />
                            <a
                              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline truncate max-w-[120px]"
                            >
                              Web
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(lead.city || lead.country) && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="text-xs truncate max-w-[120px]">
                            {[lead.city, lead.country].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.rating != null && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs font-medium">{lead.rating.toFixed(1)}</span>
                          {lead.reviewCount && (
                            <span className="text-xs text-gray-400">({lead.reviewCount})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source as LeadSource} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status as LeadStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400 truncate max-w-[100px]">{lead.category ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingLead(lead); setShowModal(true) }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <LeadFormModal
          lead={editingLead}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingLead(null) }}
        />
      )}
    </div>
  )
}
