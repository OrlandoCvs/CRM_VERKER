'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Folder as FolderIcon,
  Inbox,
  Layers,
  Search,
  X,
} from 'lucide-react'
import { Folder, DEFAULT_FOLDER_COLOR } from '@/types'
import { buildFolderTree, FolderNode, getFolderPath } from '@/lib/folders'

/** Claves especiales que no corresponden a una carpeta concreta. */
export const FOLDER_ALL = 'all'
export const FOLDER_NONE = 'none'

interface Props {
  folders: Folder[]
  /** Id de carpeta, o `all` / `none`. */
  value: string
  onChange: (value: string) => void
  /** folderId -> nº de leads (incluyendo subcarpetas). */
  counts: Map<string, number>
  allCount: number
  noneCount: number
}

/**
 * Selector de carpeta en forma de menú desplegable.
 *
 * A diferencia del árbol lateral de la vista de Leads, este ocupa una sola
 * línea, por lo que sirve en cabeceras donde el ancho es escaso (el tablero
 * del pipeline). Mantiene la jerarquía mediante sangrado y permite buscar
 * cuando hay muchas carpetas.
 */
export function FolderPicker({ folders, value, onChange, counts, allCount, noneCount }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Aplanamos el árbol conservando la profundidad: así el menú puede sangrar
  // cada nivel sin renderizar componentes anidados.
  const flat = useMemo(() => {
    const out: FolderNode[] = []
    const walk = (nodes: FolderNode[]) => {
      for (const n of nodes) {
        out.push(n)
        walk(n.children)
      }
    }
    walk(buildFolderTree(folders))
    return out
  }, [folders])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return flat
    return flat.filter((f) => f.name.toLowerCase().includes(needle))
  }, [flat, query])

  /** Cierra el desplegable y descarta la búsqueda, para que la próxima
   *  apertura empiece limpia. */
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  // Cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const selected = folders.find((f) => f.id === value)
  // La ruta completa evita la ambigüedad de dos subcarpetas con el mismo nombre.
  const path = selected ? getFolderPath(selected.id, folders) : []

  const label =
    value === FOLDER_ALL
      ? 'Todas las carpetas'
      : value === FOLDER_NONE
        ? 'Sin carpeta'
        : (selected?.name ?? 'Carpeta eliminada')

  const activeCount =
    value === FOLDER_ALL ? allCount : value === FOLDER_NONE ? noneCount : (counts.get(value) ?? 0)

  const select = (key: string) => {
    onChange(key)
    close()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex max-w-[16rem] items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          open
            ? 'border-blue-400 bg-white dark:bg-gray-900 ring-2 ring-blue-100'
            : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400'
        }`}
      >
        {value === FOLDER_ALL ? (
          <Layers className="h-4 w-4 shrink-0 text-gray-400" />
        ) : value === FOLDER_NONE ? (
          <Inbox className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <FolderIcon
            className="h-4 w-4 shrink-0"
            style={{ color: selected?.color ?? DEFAULT_FOLDER_COLOR }}
            fill={selected?.color ?? DEFAULT_FOLDER_COLOR}
          />
        )}
        <span className="truncate font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 text-xs font-medium tabular-nums text-gray-600 dark:text-gray-400">
          {activeCount}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Ruta completa cuando la carpeta está anidada, para no perder el contexto. */}
      {path.length > 1 && !open && (
        <p className="mt-1 truncate text-xs text-gray-400">
          {path.map((f) => f.name).join(' / ')}
        </p>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl"
        >
          {flat.length > 6 && (
            <div className="relative border-b border-gray-100 dark:border-gray-800 p-2">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar carpeta…"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 py-1.5 pl-8 pr-7 text-sm outline-none focus:border-blue-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto p-1.5">
            {!query && (
              <>
                <Option
                  icon={<Layers className="h-4 w-4 text-gray-400" />}
                  label="Todas las carpetas"
                  count={allCount}
                  active={value === FOLDER_ALL}
                  onClick={() => select(FOLDER_ALL)}
                />
                <Option
                  icon={<Inbox className="h-4 w-4 text-gray-400" />}
                  label="Sin carpeta"
                  count={noneCount}
                  active={value === FOLDER_NONE}
                  onClick={() => select(FOLDER_NONE)}
                />
                {flat.length > 0 && <div className="my-1.5 border-t border-gray-100 dark:border-gray-800" />}
              </>
            )}

            {visible.map((node) => (
              <Option
                key={node.id}
                icon={
                  <FolderIcon
                    className="h-4 w-4"
                    style={{ color: node.color ?? DEFAULT_FOLDER_COLOR }}
                    fill={node.color ?? DEFAULT_FOLDER_COLOR}
                  />
                }
                label={node.name}
                count={counts.get(node.id) ?? 0}
                active={value === node.id}
                // En modo búsqueda el sangrado confundiría: los resultados no
                // muestran a sus padres, así que se alinean todos a la izquierda.
                indent={query ? 0 : node.depth}
                onClick={() => select(node.id)}
              />
            ))}

            {visible.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-gray-400">
                {query ? 'Ninguna carpeta coincide' : 'Aún no tienes carpetas'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Option({
  icon,
  label,
  count,
  active,
  indent = 0,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  indent?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-sm transition-colors ${
        active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
      style={{ paddingLeft: 10 + indent * 14 }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span
        className={`shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
          active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
        }`}
      >
        {count}
      </span>
      {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
    </button>
  )
}
