'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search, MapPin, Star, Phone, Globe, Plus, Check,
  Loader2, AlertCircle, Building2, Clock, ExternalLink,
} from 'lucide-react'

interface OpeningHour { day: string; hours: string }

interface PlaceResult {
  placeId: string
  title: string
  categoryName: string
  address: string
  city: string
  country: string
  phone: string
  website: string
  totalScore: number
  reviewsCount: number
  url: string
  imageUrl?: string
  price?: string
  permanentlyClosed?: boolean
  temporarilyClosed?: boolean
  location?: { lat: number; lng: number }
  openingHours?: OpeningHour[]
  instagrams?: string[]
  facebooks?: string[]
  linkedIns?: string[]
  youtubes?: string[]
  tiktoks?: string[]
  twitters?: string[]
  pinterests?: string[]
}

const QUICK_CATEGORIES = [
  'Restaurantes', 'Gimnasios', 'Dentistas', 'Abogados', 'Hoteles',
  'Farmacias', 'Supermercados', 'Salones de belleza', 'Agencias de marketing',
]

const SOCIAL_PLATFORMS = [
  { key: 'instagrams', label: 'IG', color: 'bg-pink-100 text-pink-700' },
  { key: 'facebooks', label: 'FB', color: 'bg-blue-100 text-blue-700' },
  { key: 'linkedIns', label: 'LI', color: 'bg-sky-100 text-sky-700' },
  { key: 'twitters', label: 'TW', color: 'bg-slate-100 text-slate-700' },
  { key: 'tiktoks', label: 'TT', color: 'bg-neutral-100 text-neutral-700' },
  { key: 'youtubes', label: 'YT', color: 'bg-red-100 text-red-700' },
] as const

function getTodayHours(openingHours?: OpeningHour[]): string | null {
  if (!openingHours?.length) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = days[new Date().getDay()]
  const entry = openingHours.find((h) => h.day === today)
  return entry ? entry.hours : null
}

export function SearchClient() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [importingId, setImportingId] = useState<string | null>(null)
  const [searchMeta, setSearchMeta] = useState<{ query: string; location: string } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !location.trim()) return
    setLoading(true)
    setError(null)
    setResults([])

    try {
      const res = await fetch('/api/apify/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, location, maxResults }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al buscar')
      setResults(data.items ?? [])
      setSearchMeta({ query: data.query, location: data.location })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport(place: PlaceResult) {
    setImportingId(place.placeId)
    try {
      const res = await fetch('/api/apify/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place,
          sourceQuery: `${searchMeta?.query} ${searchMeta?.location}`,
        }),
      })
      if (!res.ok) throw new Error('Error al importar')
      setImported((prev) => new Set([...prev, place.placeId]))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImportingId(null)
    }
  }

  async function handleImportAll() {
    const toImport = results.filter((r) => !imported.has(r.placeId))
    for (const place of toImport) {
      await handleImport(place)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Buscar Negocios</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          Encuentra negocios en Google Places y agrégalos como leads
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Tipo de negocio</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: restaurante, gimnasio, dentista..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Ubicación</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Ciudad de México, Madrid, Buenos Aires..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">Categorías rápidas</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setQuery(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  query === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Máx. resultados</label>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
            ) : (
              <><Search className="w-4 h-4" /> Buscar</>
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Error al buscar</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Buscando en Google Places via Apify...</p>
          <p className="text-gray-400 text-xs mt-1">Esto puede tomar 30-60 segundos</p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{results.length}</span> resultados para{' '}
              <em>"{searchMeta?.query}"</em> en {searchMeta?.location}
            </p>
            <button
              onClick={handleImportAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Importar todos ({results.filter((r) => !imported.has(r.placeId)).length})
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {results.map((place) => (
              <PlaceCard
                key={place.placeId}
                place={place}
                isImported={imported.has(place.placeId)}
                isImporting={importingId === place.placeId}
                onImport={() => handleImport(place)}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && searchMeta && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Search className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">No se encontraron resultados</p>
          <p className="text-gray-400 text-xs mt-1">Prueba con otros términos o ubicación</p>
        </div>
      )}

      {imported.size > 0 && (
        <div className="text-center">
          <Link href="/leads" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
            Ver {imported.size} lead{imported.size !== 1 ? 's' : ''} importado{imported.size !== 1 ? 's' : ''} →
          </Link>
        </div>
      )}
    </div>
  )
}

function PlaceCard({
  place,
  isImported,
  isImporting,
  onImport,
}: {
  place: PlaceResult
  isImported: boolean
  isImporting: boolean
  onImport: () => void
}) {
  const todayHours = getTodayHours(place.openingHours)
  const isClosed = place.permanentlyClosed || place.temporarilyClosed
  const socialLinks = SOCIAL_PLATFORMS.filter((p) => {
    const arr = place[p.key as keyof PlaceResult] as string[] | undefined
    return arr && arr.length > 0
  })
  const mapsUrl = place.location
    ? `https://www.google.com/maps?q=${place.location.lat},${place.location.lng}`
    : place.url

  return (
    <div className={`bg-white rounded-xl border flex flex-col gap-0 overflow-hidden hover:shadow-md transition-shadow ${isClosed ? 'border-red-100' : 'border-gray-200'}`}>
      {/* Image */}
      {place.imageUrl && (
        <div className="h-32 bg-gray-100 overflow-hidden relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={place.imageUrl} alt={place.title} className="w-full h-full object-cover" />
          {isClosed && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-600 px-2 py-0.5 rounded">
                {place.permanentlyClosed ? 'CERRADO PERMANENTE' : 'TEMPORALMENTE CERRADO'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 text-sm truncate">{place.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              {place.categoryName && <p className="text-xs text-gray-400 truncate">{place.categoryName}</p>}
              {place.price && <span className="text-xs text-gray-500 font-medium shrink-0">{place.price}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {place.totalScore > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-semibold">{place.totalScore.toFixed(1)}</span>
              </div>
            )}
            {place.reviewsCount > 0 && (
              <span className="text-xs text-gray-400">{place.reviewsCount} reseñas</span>
            )}
          </div>
        </div>

        {/* Contact + Location */}
        <div className="space-y-1.5 text-xs text-gray-500">
          {place.address && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{place.address}</span>
            </div>
          )}
          {place.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <a href={`tel:${place.phone}`} className="hover:text-blue-600">{place.phone}</a>
            </div>
          )}
          {place.website && (
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <a
                href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline truncate"
              >
                {place.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {todayHours && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Hoy: {todayHours}</span>
            </div>
          )}
        </div>

        {/* Social media badges */}
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {socialLinks.map((p) => {
              const arr = place[p.key as keyof PlaceResult] as string[]
              return (
                <a
                  key={p.key}
                  href={arr[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-2 py-0.5 rounded text-xs font-bold ${p.color}`}
                >
                  {p.label}
                </a>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Maps
          </a>
          <button
            onClick={onImport}
            disabled={isImported || isImporting}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors ${
              isImported
                ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                : isImporting
                ? 'bg-gray-50 text-gray-500 border border-gray-200 cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {isImported ? (
              <><Check className="w-3.5 h-3.5" /> Importado</>
            ) : isImporting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando...</>
            ) : (
              <><Plus className="w-3.5 h-3.5" /> Agregar como Lead</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
