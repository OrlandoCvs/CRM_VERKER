'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildFolderTree } from '@/lib/folders'
import type { Folder } from '@/types'

/**
 * Selector de carpeta destino al guardar leads.
 *
 * Obliga a decidir dónde caen los leads (carpeta nueva, existente o ninguna)
 * para que nadie los suelte por descuido y acabe con la bandeja desordenada.
 *
 * Lo usan la importación de CSV y el historial de búsquedas. El estado vive en
 * el padre porque quien importa necesita resolver el destino a un id concreto
 * justo antes de enviar, creando la carpeta si hace falta.
 */

/** Cómo decide el usuario dónde caen los leads. `null` = aún sin elegir. */
export type Destination = 'new' | 'existing' | 'none' | null

export interface DestinationState {
  destination: Destination
  newFolderName: string
  existingFolderId: string
}

export const EMPTY_DESTINATION: DestinationState = {
  destination: null,
  newFolderName: '',
  existingFolderId: '',
}

/** True cuando la elección está completa y se puede importar. */
export function destinationReady(state: DestinationState): boolean {
  if (state.destination === 'new') return state.newFolderName.trim().length > 0
  if (state.destination === 'existing') return state.existingFolderId !== ''
  if (state.destination === 'none') return true
  return false
}

/**
 * Resuelve la elección a un folderId, creando la carpeta nueva si toca.
 * Lanza si la creación falla, para que el llamante avise en vez de guardar
 * los leads en un sitio que el usuario no pidió.
 */
export async function resolveDestination(
  state: DestinationState,
  onFolderCreated?: (folder: Folder) => void,
): Promise<string | null> {
  if (state.destination === 'existing') return state.existingFolderId || null
  if (state.destination === 'new') {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.newFolderName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo crear la carpeta')
    onFolderCreated?.(data as Folder)
    return (data as Folder).id
  }
  return null
}

interface Props {
  value: DestinationState
  onChange: (next: DestinationState) => void
  /**
   * Carpetas ya conocidas. Si no se pasan, el componente las carga solo: el
   * historial de búsquedas no tiene la lista a mano.
   */
  folders?: Folder[]
  /** Identifica los radios; hace falta si hay varios selectores en la página. */
  name?: string
  compact?: boolean
}

export function FolderDestination({
  value,
  onChange,
  folders,
  name = 'destination',
  compact = false,
}: Props) {
  const [loaded, setLoaded] = useState<Folder[]>([])

  // Solo se piden si el padre no las tiene.
  const needsFetch = folders === undefined
  useEffect(() => {
    if (!needsFetch) return
    const controller = new AbortController()
    fetch('/api/folders', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setLoaded(Array.isArray(d) ? d : []))
      .catch(() => {})
    return () => controller.abort()
  }, [needsFetch])

  const list = folders ?? loaded

  // Jerarquía aplanada con sangría por nivel, para el <select>.
  const options = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const walk = (nodes: ReturnType<typeof buildFolderTree>) => {
      for (const n of nodes) {
        out.push({ id: n.id, label: `${'  '.repeat(n.depth)}${n.name}` })
        if (n.children.length) walk(n.children)
      }
    }
    walk(buildFolderTree(list))
    return out
  }, [list])

  const set = (patch: Partial<DestinationState>) => onChange({ ...value, ...patch })

  const field = compact
    ? 'flex-1 min-w-0 px-2 py-1 border border-gray-200 dark:border-gray-800 rounded-lg text-xs bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
    : 'flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const row = compact
    ? 'flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300'
    : 'flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'

  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-800 ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      }`}
    >
      <p
        className={`font-medium text-gray-800 dark:text-gray-200 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        Destino de los leads <span className="text-red-500">*</span>
      </p>

      <label className={row}>
        <input
          type="radio"
          name={name}
          checked={value.destination === 'new'}
          onChange={() => set({ destination: 'new' })}
        />
        <span className="shrink-0">Crear carpeta nueva</span>
        <input
          type="text"
          placeholder="Nombre de la carpeta"
          value={value.newFolderName}
          onFocus={() => set({ destination: 'new' })}
          onChange={(e) => set({ destination: 'new', newFolderName: e.target.value })}
          className={field}
        />
      </label>

      <label className={row}>
        <input
          type="radio"
          name={name}
          checked={value.destination === 'existing'}
          onChange={() => set({ destination: 'existing' })}
        />
        <span className="shrink-0">Usar carpeta existente</span>
        <select
          value={value.existingFolderId}
          onFocus={() => set({ destination: 'existing' })}
          onChange={(e) => set({ destination: 'existing', existingFolderId: e.target.value })}
          className={field}
        >
          <option value="">— Elegir carpeta —</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className={row}>
        <input
          type="radio"
          name={name}
          checked={value.destination === 'none'}
          onChange={() => set({ destination: 'none' })}
        />
        Sin carpeta (quedan sueltos)
      </label>
    </div>
  )
}
