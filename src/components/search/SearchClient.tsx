'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Search,
  MapPin,
  Star,
  Phone,
  Mail,
  Globe,
  Plus,
  Check,
  Loader2,
  AlertCircle,
  Building2,
  Clock,
  ExternalLink,
  Map,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { circleToGeoJsonPolygon, verticesToGeoJsonPolygon } from '@/lib/geo'
import { ApifyUsage } from '@/components/search/ApifyUsage'

interface OpeningHour { day: string; hours: string }

interface PlaceResult {
  placeId: string
  title: string
  categoryName: string
  address: string
  city: string
  country: string
  phone: string
  email?: string
  emails?: string[]
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

// Leaflet only runs in the browser — load the drawing map dynamically.
const SearchAreaMap = dynamic(
  () => import('./SearchAreaMap').then((m) => m.SearchAreaMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
    ),
  },
)

function getTodayHours(openingHours?: OpeningHour[]): string | null {
  if (!openingHours?.length) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = days[new Date().getDay()]
  const entry = openingHours.find((h) => h.day === today)
  return entry ? entry.hours : null
}

/**
 * Persistencia de la búsqueda en sessionStorage.
 *
 * El estado de este componente vive en memoria de React: al cambiar de pestaña
 * del CRM, Next desmonta el componente y se perdería la búsqueda (y con ella los
 * créditos de Apify ya gastados). Guardamos resultados, meta e importados en
 * sessionStorage para que sobrevivan a la navegación dentro de la sesión. Se
 * limpian solos al cerrar la pestaña o al lanzar una búsqueda nueva.
 */
const STORAGE_KEY = 'verker.search.v1'

interface PersistedSearch {
  results: PlaceResult[]
  searchMeta: { query: string; location: string } | null
  imported: string[]
  importSummary: string | null
}

function loadPersisted(): PersistedSearch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedSearch) : null
  } catch {
    return null
  }
}

export function SearchClient() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [scrapeContacts, setScrapeContacts] = useState(false)
  // Inicialización perezosa: restaura la última búsqueda si existe en la sesión.
  const [results, setResults] = useState<PlaceResult[]>(() => loadPersisted()?.results ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(
    () => new Set(loadPersisted()?.imported ?? []),
  )
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<string | null>(
    () => loadPersisted()?.importSummary ?? null,
  )
  const [searchMeta, setSearchMeta] = useState<{ query: string; location: string } | null>(
    () => loadPersisted()?.searchMeta ?? null,
  )

  // Cada vez que cambian los resultados/importados, se persisten en la sesión.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (results.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    const toSave: PersistedSearch = {
      results,
      searchMeta,
      imported: [...imported],
      importSummary,
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // Si el volumen excediera la cuota de sessionStorage, no rompemos la UI.
    }
  }, [results, searchMeta, imported, importSummary])

  // Map mode state
  const [searchMode, setSearchMode] = useState<'text' | 'map'>('text')
  const [shape, setShape] = useState<'circle' | 'polygon'>('circle')
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm] = useState(2)
  const [vertices, setVertices] = useState<[number, number][]>([])

  const shapeReady =
    shape === 'circle' ? center !== null : vertices.length >= 3

  function clearShape() {
    setCenter(null)
    setVertices([])
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    if (searchMode === 'text' && !location.trim()) return
    if (searchMode === 'map' && !shapeReady) {
      setError(
        shape === 'circle'
          ? 'Haz clic en el mapa para fijar el centro del círculo'
          : 'Añade al menos 3 vértices para formar el polígono',
      )
      return
    }

    setLoading(true)
    setError(null)
    setResults([])

    const body: Record<string, unknown> = { query, maxResults, scrapeContacts }
    let metaLocation = ''

    if (searchMode === 'text') {
      body.location = location
      metaLocation = location
    } else {
      body.area =
        shape === 'circle'
          ? circleToGeoJsonPolygon(center![0], center![1], radiusKm)
          : verticesToGeoJsonPolygon(vertices)
      metaLocation =
        shape === 'circle'
          ? `un círculo de ${radiusKm} km`
          : `un polígono de ${vertices.length} vértices`
    }

    try {
      const res = await fetch('/api/apify/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al buscar')
      setResults(data.items ?? [])
      setSearchMeta({ query: data.query ?? query, location: metaLocation })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  /** Importa un lead. Devuelve 'created' | 'duplicate' | 'error' para poder resumir. */
  async function handleImport(place: PlaceResult): Promise<'created' | 'duplicate' | 'error'> {
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
      const data = await res.json()
      // Marca como "ya en el CRM" tanto los nuevos como los duplicados.
      setImported((prev) => new Set([...prev, place.placeId]))
      return data.status === 'duplicate' ? 'duplicate' : 'created'
    } catch {
      return 'error'
    } finally {
      setImportingId(null)
    }
  }

  async function handleImportAll() {
    const toImport = results.filter((r) => !imported.has(r.placeId))
    let created = 0
    let duplicates = 0
    let errors = 0
    for (const place of toImport) {
      const result = await handleImport(place)
      if (result === 'created') created++
      else if (result === 'duplicate') duplicates++
      else errors++
    }
    // Resumen al terminar: cuántos nuevos, cuántos ya existían.
    const parts = [`${created} importado${created === 1 ? '' : 's'}`]
    if (duplicates > 0) parts.push(`${duplicates} ya existía${duplicates === 1 ? '' : 'n'}`)
    if (errors > 0) parts.push(`${errors} con error`)
    setImportSummary(parts.join(' · '))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Buscar Negocios</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Encuentra negocios en Google Places y agrégalos como leads
          </p>
        </div>
        {/* Saldo de Apify a la vista: cada búsqueda consume créditos. */}
        <ApifyUsage />
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
          <ModeTab
            active={searchMode === 'text'}
            onClick={() => setSearchMode('text')}
            icon={Search}
            label="Por texto"
          />
          <ModeTab
            active={searchMode === 'map'}
            onClick={() => setSearchMode('map')}
            icon={Map}
            label="En el mapa"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Negocio o palabra clave</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: restaurante, reparación de móviles, Starbucks..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {searchMode === 'text' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Ubicación</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Ciudad de México, Guadalajara, Monterrey..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Forma:</span>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-md">
                  <ShapeTab
                    active={shape === 'circle'}
                    onClick={() => { setShape('circle'); clearShape() }}
                    label="Círculo"
                  />
                  <ShapeTab
                    active={shape === 'polygon'}
                    onClick={() => { setShape('polygon'); clearShape() }}
                    label="Polígono"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shape === 'polygon' && vertices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVertices((v) => v.slice(0, -1))}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1"
                  >
                    Quitar último vértice
                  </button>
                )}
                {(center || vertices.length > 0) && (
                  <button
                    type="button"
                    onClick={clearShape}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-md px-2 py-1"
                  >
                    <Trash2 className="w-3 h-3" /> Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="h-[400px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <SearchAreaMap
                mode={shape}
                center={center}
                radiusKm={radiusKm}
                vertices={vertices}
                onSetCenter={setCenter}
                onAddVertex={(v) => setVertices((prev) => [...prev, v])}
              />
            </div>

            {shape === 'circle' ? (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Radio
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-16 text-right">
                  {radiusKm} km
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Haz clic en el mapa para añadir vértices. Necesitas al menos 3 para formar
                un polígono. Vértices actuales:{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{vertices.length}</span>
              </p>
            )}

            {shape === 'circle' && !center && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Haz clic en el mapa para fijar el centro del círculo.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Categorías rápidas</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setQuery(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  query === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Enriquecimiento de contactos (web scraping) */}
        <label
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
            scrapeContacts ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
          }`}
        >
          <Switch checked={scrapeContacts} onChange={setScrapeContacts} />
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              <Sparkles className={`w-4 h-4 ${scrapeContacts ? 'text-emerald-500' : 'text-gray-400'}`} />
              Obtener email y redes sociales
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Visita la web de cada negocio para extraer correo y perfiles sociales.
              Consume más créditos de Apify y la búsqueda tarda más.
            </span>
          </div>
        </label>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Máx. resultados</label>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <p className="font-medium text-sm">No se pudo buscar</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Buscando en Google Places via Apify...</p>
          <p className="text-gray-400 text-xs mt-1">Esto puede tomar 30-60 segundos</p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length}</span> resultados para{' '}
              <em>{searchMeta?.query}</em> en {searchMeta?.location}
            </p>
            <div className="flex items-center gap-3">
              {importSummary && (
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{importSummary}</span>
              )}
              <button
                onClick={() => {
                  setResults([])
                  setSearchMeta(null)
                  setImported(new Set())
                  setImportSummary(null)
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Limpiar
              </button>
              <button
                onClick={handleImportAll}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Importar todos ({results.filter((r) => !imported.has(r.placeId)).length})
              </button>
            </div>
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
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 py-16 text-center">
          <Search className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No se encontraron resultados</p>
          <p className="text-gray-400 text-xs mt-1">Prueba con otros términos o área</p>
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

function Switch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Search
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-white dark:bg-gray-900 text-blue-700 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function ShapeTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
      }`}
    >
      {label}
    </button>
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
    <div className={`bg-white dark:bg-gray-900 rounded-xl border flex flex-col gap-0 overflow-hidden hover:shadow-md transition-shadow ${isClosed ? 'border-red-100' : 'border-gray-200 dark:border-gray-800'}`}>
      {/* Image */}
      {place.imageUrl && (
        <div className="h-32 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
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
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{place.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              {place.categoryName && <p className="text-xs text-gray-400 truncate">{place.categoryName}</p>}
              {place.price && <span className="text-xs text-gray-500 dark:text-gray-400 font-medium shrink-0">{place.price}</span>}
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
        <div className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
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
          {(place.email ?? place.emails?.[0]) && (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <a
                href={`mailto:${place.email ?? place.emails?.[0]}`}
                className="text-emerald-600 hover:underline truncate"
              >
                {place.email ?? place.emails?.[0]}
              </a>
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
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
                ? 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-800 cursor-wait'
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
