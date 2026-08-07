'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import Link from 'next/link'
import { LeadStatus, STATUS_LABELS } from '@/types'

export interface MapLead {
  id: string
  name: string
  status: string
  category: string | null
  rating: number | null
  reviewCount: number | null
  city: string | null
  phone: string | null
  lat: number
  lng: number
}

const STATUS_PIN_COLORS: Record<string, string> = {
  new: '#3B82F6',
  contacted: '#EAB308',
  negotiating: '#8B5CF6',
  won: '#22C55E',
  lost: '#EF4444',
}

interface Props {
  leads: MapLead[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function LeafletMap({ leads, selectedId, onSelect }: Props) {
  const center: [number, number] = leads.length > 0
    ? [
        leads.reduce((s, l) => s + l.lat, 0) / leads.length,
        leads.reduce((s, l) => s + l.lng, 0) / leads.length,
      ]
    : [23.6345, -102.5528] // México (centro del país)

  const zoom = leads.length === 1 ? 14 : leads.length === 0 ? 5 : 5

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {leads.map((lead) => {
        const color = STATUS_PIN_COLORS[lead.status] ?? '#6B7280'
        const isSelected = lead.id === selectedId
        return (
          <CircleMarker
            key={lead.id}
            center={[lead.lat, lead.lng]}
            radius={isSelected ? 14 : 9}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.9,
              color: isSelected ? '#1E3A5F' : '#fff',
              weight: isSelected ? 3 : 1.5,
            }}
            eventHandlers={{
              click: () => onSelect(lead.id === selectedId ? null : lead.id),
            }}
          >
            <Popup>
              <div className="min-w-[180px]">
                <p className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">{lead.name}</p>
                {lead.category && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lead.category}</p>}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
                  </span>
                  {lead.rating != null && (
                    <span className="text-xs text-gray-600 dark:text-gray-400">⭐ {lead.rating.toFixed(1)}</span>
                  )}
                </div>
                {lead.city && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">📍 {lead.city}</p>}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="block text-xs text-blue-600 mb-2 hover:underline">
                    📞 {lead.phone}
                  </a>
                )}
                <Link
                  href={`/leads/${lead.id}`}
                  className="block text-center text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 font-medium"
                >
                  Ver detalle →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
