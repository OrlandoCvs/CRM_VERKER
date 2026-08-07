'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gauge, Loader2, RefreshCw } from 'lucide-react'

/**
 * Muestra el consumo de créditos de Apify del ciclo mensual en curso.
 *
 * Cada búsqueda gasta saldo de la cuenta de Apify, así que conviene ver cuánto
 * queda antes de lanzar una búsqueda grande. Se consulta al montar y con el
 * botón de recargar (no en tiempo real: la API de Apify tarda en reflejar el
 * gasto de un run recién terminado).
 */

interface Usage {
  usedUsd: number
  maxUsd: number
  percent: number | null
  remainingUsd: number | null
  cycleEnd: string | null
}

export function ApifyUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Pide el consumo a la API. Puro: no toca estado, así el effect puede
   *  decidir si aplicar el resultado (evita setState en componente desmontado). */
  const fetchUsage = useCallback(async (signal?: AbortSignal): Promise<Usage> => {
    const res = await fetch('/api/apify/usage', { signal })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Error')
    return data as Usage
  }, [])

  // Carga inicial al montar; se cancela si el componente se desmonta antes.
  useEffect(() => {
    const controller = new AbortController()
    fetchUsage(controller.signal)
      .then((data) => {
        setUsage(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fetchUsage])

  /** Recarga manual desde el botón de refrescar. */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUsage()
      setUsage(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [fetchUsage])

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        <Gauge className="w-4 h-4 text-gray-400" />
        Consumo de Apify no disponible
        <button onClick={() => load()} className="text-blue-600 hover:text-blue-700" title="Reintentar">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  if (loading && !usage) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Consultando créditos…
      </div>
    )
  }

  if (!usage) return null

  const pct = usage.percent ?? 0
  // Verde por defecto; ámbar al 75% y rojo al 90% para avisar antes de quedarse sin saldo.
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = pct >= 90 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-emerald-600'

  const renews = usage.cycleEnd
    ? new Date(usage.cycleEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3.5 py-2.5 min-w-[230px]">
      <div className="flex items-center gap-2 mb-1.5">
        <Gauge className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Créditos Apify</span>
        <button
          onClick={() => load()}
          disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-baseline gap-1 mb-1.5">
        <span className={`text-sm font-semibold ${textColor}`}>
          ${usage.usedUsd.toFixed(2)}
        </span>
        <span className="text-xs text-gray-400">de ${usage.maxUsd.toFixed(2)} usados</span>
      </div>

      {usage.percent !== null && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        {usage.remainingUsd !== null && <span>Quedan ${usage.remainingUsd.toFixed(2)}</span>}
        {renews && <span>Renueva {renews}</span>}
      </div>
    </div>
  )
}
