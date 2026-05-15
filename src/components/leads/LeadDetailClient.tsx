'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, Globe, MapPin, Star, Mail,
  Edit, Trash2, Plus, MessageSquare, PhoneCall, AtSign, CalendarDays,
  Clock, ExternalLink,
} from 'lucide-react'
import { StatusBadge, SourceBadge } from '@/components/ui/Badge'
import { LeadFormModal } from '@/components/leads/LeadFormModal'
import { Lead, LeadStatus, LeadSource, Activity, ActivityType, STATUS_LABELS } from '@/types'

interface Props { lead: Lead }

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  call: PhoneCall,
  email: AtSign,
  meeting: CalendarDays,
  note: MessageSquare,
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: 'Llamada',
  email: 'Email',
  meeting: 'Reunión',
  note: 'Nota',
}

const DAYS_ES: Record<string, string> = {
  Monday: 'Lunes', Tuesday: 'Martes', Wednesday: 'Miércoles',
  Thursday: 'Jueves', Friday: 'Viernes', Saturday: 'Sábado', Sunday: 'Domingo',
}
const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function LeadDetailClient({ lead: initialLead }: Props) {
  const router = useRouter()
  const [lead, setLead] = useState<Lead>(initialLead)
  const [showEdit, setShowEdit] = useState(false)
  const [activityNote, setActivityNote] = useState('')
  const [activityType, setActivityType] = useState<ActivityType>('note')
  const [savingActivity, setSavingActivity] = useState(false)

  const openingHours: { day: string; hours: string }[] | null = lead.openingHours
    ? JSON.parse(lead.openingHours)
    : null

  const webResults: { title: string; url: string; description?: string }[] | null = lead.webResults
    ? JSON.parse(lead.webResults)
    : null

  const socialLinks = [
    { emoji: '📸', label: 'Instagram', url: lead.instagram, cls: 'bg-pink-50 text-pink-700 border-pink-100' },
    { emoji: '👥', label: 'Facebook', url: lead.facebook, cls: 'bg-blue-50 text-blue-700 border-blue-100' },
    { emoji: '💼', label: 'LinkedIn', url: lead.linkedin, cls: 'bg-sky-50 text-sky-700 border-sky-100' },
    { emoji: '▶️', label: 'YouTube', url: lead.youtube, cls: 'bg-red-50 text-red-700 border-red-100' },
    { emoji: '𝕏', label: 'Twitter/X', url: lead.twitter, cls: 'bg-slate-50 text-slate-700 border-slate-100' },
    { emoji: '🎵', label: 'TikTok', url: lead.tiktok, cls: 'bg-neutral-50 text-neutral-700 border-neutral-100' },
    { emoji: '📌', label: 'Pinterest', url: lead.pinterest, cls: 'bg-red-50 text-red-600 border-red-100' },
  ].filter((s) => s.url)

  const hasSocial = socialLinks.length > 0

  const mapsUrl = lead.lat && lead.lng
    ? `https://www.google.com/maps?q=${lead.lat},${lead.lng}`
    : lead.address
    ? `https://www.google.com/maps/search/${encodeURIComponent(lead.address)}`
    : null

  const osmEmbedUrl = lead.lat && lead.lng
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lead.lng - 0.008},${lead.lat - 0.005},${lead.lng + 0.008},${lead.lat + 0.005}&layer=mapnik&marker=${lead.lat},${lead.lng}`
    : null

  async function handleSave(data: Partial<Lead>) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const updated = await res.json()
    setLead((prev) => ({ ...prev, ...updated }))
    setShowEdit(false)
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
    router.push('/leads')
  }

  async function handleStatusChange(status: string) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const updated = await res.json()
    setLead((prev) => ({ ...prev, status: updated.status }))
  }

  async function addActivity() {
    if (!activityNote.trim()) return
    setSavingActivity(true)
    const res = await fetch(`/api/leads/${lead.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: activityType, note: activityNote }),
    })
    const activity = await res.json()
    setLead((prev) => ({
      ...prev,
      activities: [{ ...activity, createdAt: activity.createdAt }, ...(prev.activities ?? [])],
    }))
    setActivityNote('')
    setSavingActivity(false)
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-gray-400 hover:text-gray-600 p-1 rounded">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-xl font-bold text-gray-900 flex-1 truncate">{lead.name}</h2>
        {(lead.permanentlyClosed || lead.temporarilyClosed) && (
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
            {lead.permanentlyClosed ? 'CERRADO PERM.' : 'TEMP. CERRADO'}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-3.5 h-3.5" /> Editar
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Lead image + basic info */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {lead.imageUrl && (
              <div className="h-48 bg-gray-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lead.imageUrl} alt={lead.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{lead.name}</h3>
                  {lead.company && <p className="text-sm text-gray-500">{lead.company}</p>}
                  {lead.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{lead.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-col">
                  <SourceBadge source={lead.source as LeadSource} />
                  {lead.price && <span className="text-xs text-gray-500 font-medium">{lead.price}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {lead.phone && (
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="Teléfono">
                    <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
                  </InfoRow>
                )}
                {lead.email && (
                  <InfoRow icon={<Mail className="w-4 h-4" />} label="Email">
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                  </InfoRow>
                )}
                {lead.website && (
                  <InfoRow icon={<Globe className="w-4 h-4" />} label="Web">
                    <a
                      href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate"
                    >
                      {lead.website}
                    </a>
                  </InfoRow>
                )}
                {(lead.city || lead.country) && (
                  <InfoRow icon={<MapPin className="w-4 h-4" />} label="Ubicación">
                    {[lead.city, lead.country].filter(Boolean).join(', ')}
                  </InfoRow>
                )}
                {lead.rating != null && (
                  <InfoRow icon={<Star className="w-4 h-4 text-yellow-400" />} label="Rating">
                    {lead.rating.toFixed(1)} ({lead.reviewCount ?? 0} reseñas)
                  </InfoRow>
                )}
                {lead.category && (
                  <InfoRow icon={<span className="text-lg">🏷️</span>} label="Categoría">
                    {lead.category}
                  </InfoRow>
                )}
                {lead.lat && lead.lng && (
                  <InfoRow icon={<MapPin className="w-4 h-4 text-green-500" />} label="Coordenadas">
                    <a
                      href={mapsUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {lead.lat.toFixed(5)}, {lead.lng.toFixed(5)}
                    </a>
                  </InfoRow>
                )}
              </div>

              {lead.address && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
                  <p className="font-medium text-gray-400 text-xs mb-1">DIRECCIÓN</p>
                  <div className="flex items-start gap-2">
                    <span>{lead.address}</span>
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {lead.notes && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="font-medium text-gray-400 text-xs mb-1">NOTAS</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}

              {lead.sourceQuery && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="font-medium text-gray-400 text-xs mb-1">BÚSQUEDA ORIGEN</p>
                  <p className="text-sm text-gray-600">{lead.sourceQuery}</p>
                </div>
              )}
            </div>
          </div>

          {/* Mini map */}
          {osmEmbedUrl && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" /> Ubicación en Mapa
                </h4>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Abrir en Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <iframe
                src={osmEmbedUrl}
                className="w-full h-56 border-0"
                title={`Mapa de ${lead.name}`}
              />
            </div>
          )}

          {/* Social Media */}
          {hasSocial && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">Redes Sociales</h4>
              <div className="flex flex-wrap gap-3">
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.url!.startsWith('http') ? s.url! : `https://${s.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80 ${s.cls}`}
                  >
                    <span>{s.emoji}</span>
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Opening Hours */}
          {openingHours && openingHours.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" /> Horario
              </h4>
              <div className="space-y-1.5">
                {DAYS_ORDER.map((day) => {
                  const entry = openingHours.find((h) => h.day === day)
                  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day
                  return (
                    <div
                      key={day}
                      className={`flex justify-between text-sm px-2 py-1 rounded ${isToday ? 'bg-blue-50 font-medium' : ''}`}
                    >
                      <span className={isToday ? 'text-blue-700' : 'text-gray-600'}>{DAYS_ES[day] ?? day}</span>
                      <span className={entry?.hours === 'Closed' ? 'text-red-500' : isToday ? 'text-blue-700' : 'text-gray-700'}>
                        {entry ? entry.hours : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Web Results */}
          {webResults && webResults.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" /> Resultados Web
              </h4>
              <div className="space-y-3">
                {webResults.map((r, i) => (
                  <div key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline line-clamp-1"
                    >
                      {r.title}
                    </a>
                    <p className="text-xs text-green-700 mt-0.5 truncate">{r.url}</p>
                    {r.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="font-semibold text-gray-900 mb-4">Actividad</h4>
            <div className="flex gap-2 mb-4">
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
              >
                {(Object.entries(ACTIVITY_LABELS) as [ActivityType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="Añadir nota de actividad..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => { if (e.key === 'Enter') addActivity() }}
              />
              <button
                onClick={addActivity}
                disabled={savingActivity || !activityNote.trim()}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(lead.activities ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin actividades aún</p>
              ) : (
                (lead.activities ?? []).map((a) => {
                  const Icon = ACTIVITY_ICONS[a.type as ActivityType] ?? MessageSquare
                  return (
                    <div key={a.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {ACTIVITY_LABELS[a.type as ActivityType]}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(a.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">{a.note}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="font-semibold text-gray-900 mb-3">Estado del Lead</h4>
            <div className="space-y-2">
              {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => handleStatusChange(k)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    lead.status === k
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Información</h4>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Creado</span>
                <span>{new Date(lead.createdAt).toLocaleDateString('es')}</span>
              </div>
              <div className="flex justify-between">
                <span>Actualizado</span>
                <span>{new Date(lead.updatedAt).toLocaleDateString('es')}</span>
              </div>
              {lead.placeId && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-gray-400 mb-1">Google Place ID</p>
                  <p className="font-mono text-xs break-all text-gray-600">{lead.placeId}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick map link in sidebar */}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Ver en Google Maps
            </a>
          )}

          {lead.placeId && (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${lead.placeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ver en Google Places
            </a>
          )}
        </div>
      </div>

      {showEdit && (
        <LeadFormModal lead={lead} onSave={handleSave} onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <div className="text-gray-700">{children}</div>
      </div>
    </div>
  )
}
