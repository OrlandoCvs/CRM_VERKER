'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  History, Loader2, Trash2, ChevronDown, Mail, Check,
  Users, Building2, MapPin, X,
} from 'lucide-react'

/**
 * Historial de búsquedas ya pagadas.
 *
 * Cada búsqueda consume créditos, así que sus resultados se guardan al
 * terminarla y se pueden reabrir aquí para importar a quién interese, sin
 * repetir el gasto. Sirve igual para Google Places y para LinkedIn: solo
 * cambian los campos que trae cada resultado.
 *
 * Las búsquedas se borran solas al mes; también pueden borrarse a mano.
 */

interface RunSummary {
  id: string
  source: string
  label: string
  resultCount: number
  emailCount: number
  createdAt: string
}

interface RunResult {
  id: string
  name: string
  headline: string | null
  company: string | null
  position: string | null
  email: string | null
  phone: string | null
  city: string | null
  linkedinUrl: string | null
  importedLeadId: string | null
}

interface Props {
  source: 'google_places' | 'linkedin'
  /** Se llama tras importar, por si la vista de origen quiere refrescarse. */
  onImported?: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia
    ? `Hoy ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function SearchHistory({ source, onImported }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // Búsqueda desplegada y sus resultados.
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [results, setResults] = useState<RunResult[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/search-history?source=${source}`)
      const data = await res.json()
      setRuns(data.runs ?? [])
    } catch {
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/search-history?source=${source}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [source])

  async function openRun(id: string) {
    if (openRunId === id) {
      setOpenRunId(null)
      return
    }
    setOpenRunId(id)
    setResults([])
    setSelected(new Set())
    setSummary(null)
    setLoadingResults(true)
    try {
      const res = await fetch(`/api/search-history/${id}`)
      const data = await res.json()
      const list: RunResult[] = data.run?.results ?? []
      setResults(list)
      // Preselecciona lo que aún no se ha importado: es lo que se suele querer.
      setSelected(new Set(list.filter((r) => !r.importedLeadId).map((r) => r.id)))
    } finally {
      setLoadingResults(false)
    }
  }

  async function removeRun(id: string) {
    if (!confirm('¿Borrar esta búsqueda del historial? Los leads ya importados no se tocan.')) return
    await fetch(`/api/search-history/${id}`, { method: 'DELETE' })
    setRuns((prev) => prev.filter((r) => r.id !== id))
    if (openRunId === id) setOpenRunId(null)
  }

  async function importSelected(runId: string) {
    if (selected.size === 0) return
    setImporting(true)
    setSummary(null)
    try {
      const res = await fetch(`/api/search-history/${runId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultIds: [...selected],
          folderName: source === 'linkedin' ? 'LinkedIn' : 'Google Maps',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al importar')

      const partes = [`${data.created} guardados`]
      if (data.duplicates) partes.push(`${data.duplicates} ya existían`)
      if (data.errors) partes.push(`${data.errors} con error`)
      setSummary(partes.join(' · '))

      await openRunRefresh(runId)
      await load()
      onImported?.()
    } catch (err) {
      setSummary(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  /** Recarga los resultados para reflejar cuáles quedaron importados. */
  async function openRunRefresh(id: string) {
    const res = await fetch(`/api/search-history/${id}`)
    const data = await res.json()
    const list: RunResult[] = data.run?.results ?? []
    setResults(list)
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return null
  if (runs.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <History className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Búsquedas anteriores
        </span>
        <span className="rounded-full bg-gray-100 px-1.5 text-xs font-medium tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {runs.length}
        </span>
        <span className="ml-auto text-[11px] text-gray-400">se borran al mes</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {runs.map((run) => (
            <div key={run.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => openRun(run.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm text-gray-800 dark:text-gray-200" title={run.label}>
                    {run.label || 'Sin criterios'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(run.createdAt)} · {run.resultCount}{' '}
                    {run.resultCount === 1 ? 'resultado' : 'resultados'}
                    {run.emailCount > 0 && ` · ${run.emailCount} con correo`}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => removeRun(run.id)}
                  title="Borrar del historial"
                  className="shrink-0 rounded p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                    openRunId === run.id ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {openRunId === run.id && (
                <div className="bg-gray-50 px-4 py-3 dark:bg-gray-800/40">
                  {loadingResults ? (
                    <p className="flex items-center gap-2 py-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando resultados…
                    </p>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {selected.size} de {results.length} seleccionados
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelected(
                              new Set(results.filter((r) => !r.importedLeadId).map((r) => r.id)),
                            )
                          }
                          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(new Set())}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Ninguno
                        </button>
                        {summary && (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {summary}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => importSelected(run.id)}
                          disabled={importing || selected.size === 0}
                          className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          {importing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
                            </>
                          ) : (
                            `Guardar ${selected.size} como leads`
                          )}
                        </button>
                      </div>

                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {results.map((r) => {
                          const yaImportado = Boolean(r.importedLeadId)
                          return (
                            <label
                              key={r.id}
                              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                                yaImportado
                                  ? 'border-transparent bg-gray-100 opacity-60 dark:bg-gray-800'
                                  : 'cursor-pointer border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900'
                              }`}
                            >
                              {yaImportado ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selected.has(r.id)}
                                  onChange={() => toggle(r.id)}
                                  className="shrink-0 cursor-pointer rounded border-gray-300"
                                />
                              )}

                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-gray-800 dark:text-gray-200">
                                  {r.name}
                                </span>
                                <span className="flex flex-wrap items-center gap-x-2.5 text-gray-500 dark:text-gray-400">
                                  {r.position && (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <Users className="h-3 w-3 shrink-0 text-gray-400" />
                                      <span className="truncate">{r.position}</span>
                                    </span>
                                  )}
                                  {r.company && (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <Building2 className="h-3 w-3 shrink-0 text-gray-400" />
                                      <span className="truncate">{r.company}</span>
                                    </span>
                                  )}
                                  {r.city && (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                                      <span className="truncate">{r.city}</span>
                                    </span>
                                  )}
                                </span>
                              </span>

                              {r.email ? (
                                <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <X className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                              )}

                              {yaImportado && (
                                <span className="shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  guardado
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
