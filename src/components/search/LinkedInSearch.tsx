'use client'

import { useEffect, useState } from 'react'
import {
  Search, Loader2, AlertCircle, Plus, Check, Briefcase, MapPin,
  Building2, UserSearch, Mail, Users, Trash2, Info,
} from 'lucide-react'

/**
 * Búsqueda de personas en LinkedIn.
 *
 * Va aparte del buscador de Google Places porque el modelo es distinto: aquí se
 * buscan personas (cargo, empresa, perfil) y no negocios con teléfono y
 * dirección. Comparte, eso sí, la mecánica de revisar los resultados y
 * guardarlos como leads uno a uno o en bloque.
 *
 * El actor cobra por página de resultados aunque vuelva vacía, así que el
 * formulario obliga a fijar un tope y enseña el gasto estimado antes de lanzar.
 */

/** Perfil ya normalizado que devuelve el endpoint. */
interface LinkedInResult {
  profileId: string
  name: string
  headline: string
  company: string
  position: string
  email: string
  city: string
  country: string
  linkedinUrl: string
  photo: string
  about: string
  connections: number | null
  openToWork: boolean
}

interface SearchMeta {
  query: string
  found: number
  withEmailCount: number
  withEmail: boolean
}

/** Estado que sobrevive al cambio de pestaña, para no perder créditos gastados. */
const STORAGE_KEY = 'verker.search.linkedin.v1'

interface Persisted {
  results: LinkedInResult[]
  meta: SearchMeta | null
  imported: string[]
  summary: string | null
}

function loadPersisted(): Persisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : null
  } catch {
    return null
  }
}

/** Tarifas del actor; se replican para estimar el gasto antes de lanzar. */
const PER_PAGE = 25
const COST_PER_PAGE = 0.1
const COST_PER_PROFILE = 0.004
const COST_PER_PROFILE_EMAIL = 0.01

function estimateCost(maxProfiles: number, withEmail: boolean): number {
  const pages = Math.max(1, Math.ceil(maxProfiles / PER_PAGE))
  const perProfile = withEmail ? COST_PER_PROFILE_EMAIL : COST_PER_PROFILE
  return pages * COST_PER_PAGE + maxProfiles * perProfile
}

/**
 * Países que se pueden anexar a la ciudad.
 *
 * LinkedIn resuelve el texto de ubicación tomando la primera coincidencia de su
 * autocompletado, así que una ciudad a secas puede caer en otro país: hay un
 * Torreón en España y otro en México, y «UK» le devuelve Ucrania. Añadir el
 * país al final es la forma de desambiguar.
 */
const COUNTRIES = [
  { value: 'Mexico', label: '🇲🇽 México' },
  { value: 'Spain', label: '🇪🇸 España' },
  { value: 'Colombia', label: '🇨🇴 Colombia' },
  { value: 'Argentina', label: '🇦🇷 Argentina' },
  { value: 'Chile', label: '🇨🇱 Chile' },
  { value: 'Peru', label: '🇵🇪 Perú' },
  { value: 'United States', label: '🇺🇸 Estados Unidos' },
  { value: '', label: 'Sin país' },
]

/**
 * Une ciudad y país como LinkedIn espera verlo: «Torreón, Mexico».
 * Si no se escribe ciudad, se busca en todo el país.
 */
function composeLocation(city: string, country: string): string {
  // Abreviaturas de país que LinkedIn no reconoce y abortan la búsqueda
  // entera: se quitan del final para sustituirlas por el nombre completo.
  const trimmed = city
    .trim()
    .replace(/[.,\s]+$/, '')
    .replace(/[,\s]+(mx|mex|méx|esp|col|arg|usa|eeuu|ee\.?uu\.?)\.?$/i, '')
    .replace(/[.,\s]+$/, '')

  if (!trimmed) return country
  if (!country) return trimmed
  // Evita duplicar el país si el usuario ya lo escribió.
  if (trimmed.toLowerCase().includes(country.toLowerCase())) return trimmed
  return `${trimmed}, ${country}`
}

/** Convierte "Director, Gerente" en ['Director', 'Gerente']. */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function LinkedInSearch() {
  const [query, setQuery] = useState('')
  const [jobTitles, setJobTitles] = useState('')
  const [locations, setLocations] = useState('')
  const [companies, setCompanies] = useState('')
  // México por defecto: es donde opera el cliente.
  const [country, setCountry] = useState('Mexico')
  const [maxProfiles, setMaxProfiles] = useState(25)
  const [withEmail, setWithEmail] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [results, setResults] = useState<LinkedInResult[]>(() => loadPersisted()?.results ?? [])
  const [meta, setMeta] = useState<SearchMeta | null>(() => loadPersisted()?.meta ?? null)
  const [imported, setImported] = useState<Set<string>>(
    () => new Set(loadPersisted()?.imported ?? []),
  )
  const [summary, setSummary] = useState<string | null>(() => loadPersisted()?.summary ?? null)

  // Persistir evita perder una búsqueda ya pagada al cambiar de pestaña.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (results.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ results, meta, imported: [...imported], summary }),
      )
    } catch {
      // Cuota llena: la búsqueda sigue en pantalla, solo no se recuerda.
    }
  }, [results, meta, imported, summary])

  const resolvedLocation = composeLocation(locations, country)
  const cost = estimateCost(maxProfiles, withEmail)
  const hasCriteria = query.trim() || jobTitles.trim() || companies.trim()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!hasCriteria) {
      setError('Escribe qué buscas o indica al menos un cargo o empresa')
      return
    }
    setLoading(true)
    setError(null)
    setResults([])
    setSummary(null)

    try {
      const res = await fetch('/api/apify/linkedin-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          jobTitles: splitList(jobTitles),
          // Ciudad y país juntos, tal como LinkedIn muestra la ubicación.
          locations: resolvedLocation ? [resolvedLocation] : [],
          companies: splitList(companies),
          maxProfiles,
          withEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al buscar')

      // Una búsqueda válida que no encuentra a nadie suele significar filtros
      // demasiado estrechos o una ubicación que LinkedIn no reconoce; conviene
      // decirlo en vez de dejar la pantalla en blanco.
      if ((data.results?.length ?? 0) === 0) {
        setError(
          'LinkedIn no devolvió ningún perfil. Suele ser porque los filtros son ' +
          'demasiado estrechos: prueba con menos cargos, una ciudad más grande, ' +
          'o deja la ubicación vacía para buscar en todo el país.',
        )
      }

      setResults(data.results ?? [])
      setMeta({
        query: [query.trim(), jobTitles.trim(), resolvedLocation].filter(Boolean).join(' · '),
        found: data.meta?.found ?? 0,
        withEmailCount: data.meta?.withEmailCount ?? 0,
        withEmail: data.meta?.withEmail ?? false,
      })
      setImported(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function importOne(profile: LinkedInResult): Promise<'created' | 'duplicate' | 'error'> {
    try {
      const res = await fetch('/api/apify/linkedin-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, sourceQuery: meta?.query ?? null }),
      })
      const data = await res.json()
      if (!res.ok) return 'error'
      setImported((prev) => new Set(prev).add(profile.profileId))
      return data.status === 'duplicate' ? 'duplicate' : 'created'
    } catch {
      return 'error'
    }
  }

  async function importAll() {
    const pending = results.filter((r) => !imported.has(r.profileId))
    let created = 0
    let duplicates = 0
    let errors = 0
    for (const profile of pending) {
      const result = await importOne(profile)
      if (result === 'created') created++
      else if (result === 'duplicate') duplicates++
      else errors++
    }
    const parts = [`${created} guardados`]
    if (duplicates) parts.push(`${duplicates} ya existían`)
    if (errors) parts.push(`${errors} con error`)
    setSummary(parts.join(' · '))
  }

  function clearResults() {
    setResults([])
    setMeta(null)
    setImported(new Set())
    setSummary(null)
  }

  const pending = results.filter((r) => !imported.has(r.profileId)).length

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSearch}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <Field label="Qué buscas" hint="Cargo, sector o palabras clave">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: director inmobiliario, desarrollador de vivienda…"
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cargo actual" hint="Separa varios con comas">
            <IconInput
              icon={Briefcase}
              value={jobTitles}
              onChange={setJobTitles}
              placeholder="Director Comercial, Gerente de Ventas"
            />
          </Field>

          <Field label="Ubicación" hint="Ciudad o estado">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                  placeholder="Torreón"
                  className="w-full rounded-lg border border-gray-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              {/* El país se añade a la ubicación antes de enviarla: LinkedIn
                  toma la primera coincidencia de su autocompletado, y sin país
                  un «Torreón» puede resolverse al de España. */}
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                title="País al que pertenece la ciudad"
                className="w-36 shrink-0 rounded-lg border border-gray-200 px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {resolvedLocation && (
              <p className="text-[11px] text-gray-400">
                Se buscará en: <span className="font-medium text-gray-600 dark:text-gray-300">{resolvedLocation}</span>
              </p>
            )}
          </Field>
        </div>

        <Field label="Empresa actual" hint="Opcional">
          <IconInput
            icon={Building2}
            value={companies}
            onChange={setCompanies}
            placeholder="Nombre de la empresa en LinkedIn"
          />
        </Field>

        {/* Tope y coste: el actor cobra por página aunque vuelva vacía. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Máximo de perfiles" hint="Acota lo que se gasta">
            <select
              value={maxProfiles}
              onChange={(e) => setMaxProfiles(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {[10, 25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} perfiles
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col justify-end">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-xs text-gray-500 dark:text-gray-400">Coste estimado</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                ${cost.toFixed(2)} USD
              </p>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:border-blue-300 dark:border-gray-700">
          <input
            type="checkbox"
            checked={withEmail}
            onChange={(e) => setWithEmail(e.target.checked)}
            className="mt-0.5 cursor-pointer rounded border-gray-300"
          />
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              <Mail className={`h-4 w-4 ${withEmail ? 'text-emerald-500' : 'text-gray-400'}`} />
              Buscar también el correo
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              LinkedIn no publica los correos: se buscan aparte y se verifican. No
              siempre se encuentra. Encarece de $0.004 a $0.01 por perfil.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !hasCriteria}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando en LinkedIn…
            </>
          ) : (
            <>
              <UserSearch className="h-4 w-4" /> Buscar perfiles
            </>
          )}
        </button>

        {loading && (
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Puede tardar un par de minutos. No cierres esta pestaña.
          </p>
        )}
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length}</span>{' '}
              {results.length === 1 ? 'perfil' : 'perfiles'}
              {meta?.withEmail && (
                <> · {meta.withEmailCount} con correo</>
              )}
            </p>
            {summary && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{summary}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={clearResults}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
              >
                <Trash2 className="h-3.5 w-3.5" /> Limpiar
              </button>
              {pending > 0 && (
                <button
                  onClick={importAll}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Guardar todos ({pending})
                </button>
              )}
            </div>
          </div>

          {/* Los perfiles sin correo no se pueden trabajar por email desde el CRM. */}
          {meta?.withEmail === false && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Estos perfiles llegan sin correo. Podrás guardarlos como leads, pero
              para escribirles tendrás que añadir la dirección a mano o repetir la
              búsqueda con la opción de correo activada.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((profile) => (
              <ProfileCard
                key={profile.profileId}
                profile={profile}
                saved={imported.has(profile.profileId)}
                onSave={() => importOne(profile)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------ Piezas ------------------------------ */

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
        {hint && <span className="ml-1.5 font-normal text-gray-400">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function IconInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
}: {
  icon: typeof Briefcase
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  )
}

function ProfileCard({
  profile,
  saved,
  onSave,
}: {
  profile: LinkedInResult
  saved: boolean
  onSave: () => void
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        {profile.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={profile.photo}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500 dark:bg-gray-800">
            {profile.name.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
            title={profile.name}
          >
            {profile.name}
          </a>
          {profile.position && (
            <p className="truncate text-xs text-gray-600 dark:text-gray-400" title={profile.position}>
              {profile.position}
            </p>
          )}
          {profile.company && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-500" title={profile.company}>
              {profile.company}
            </p>
          )}
        </div>

        <button
          onClick={onSave}
          disabled={saved}
          title={saved ? 'Ya guardado' : 'Guardar como lead'}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${
            saved
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/15'
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {profile.headline && (
        <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400" title={profile.headline}>
          {profile.headline}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {profile.city && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="truncate">{profile.city}</span>
          </span>
        )}
        {profile.connections !== null && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="tabular-nums">{profile.connections}</span>
          </span>
        )}
        {profile.email ? (
          <span
            className="inline-flex min-w-0 items-center gap-1 text-emerald-600 dark:text-emerald-400"
            title={profile.email}
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{profile.email}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-gray-400">
            <Mail className="h-3 w-3 shrink-0" />
            sin correo
          </span>
        )}
      </div>
    </article>
  )
}
