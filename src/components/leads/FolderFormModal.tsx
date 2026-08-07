'use client'

import { useState } from 'react'
import { X, Folder as FolderIcon } from 'lucide-react'
import { Folder, FOLDER_COLORS, DEFAULT_FOLDER_COLOR } from '@/types'

interface Props {
  mode: 'create' | 'edit'
  folder?: Folder | null
  /** Name of the parent folder, shown as context when creating a subfolder. */
  parentName?: string | null
  onSubmit: (name: string, color: string) => Promise<void>
  onClose: () => void
}

export function FolderFormModal({ mode, folder, parentName, onSubmit, onClose }: Props) {
  const [name, setName] = useState(folder?.name ?? '')
  const [color, setColor] = useState<string>(folder?.color ?? DEFAULT_FOLDER_COLOR)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Escribe un nombre para la carpeta')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(trimmed, color)
    } catch {
      setError('No se pudo guardar la carpeta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'create' ? 'Nueva carpeta' : 'Editar carpeta'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {parentName && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Dentro de <span className="font-medium text-gray-700 dark:text-gray-300">{parentName}</span>
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</label>
            <div className="flex items-center gap-2">
              <FolderIcon className="w-5 h-5 shrink-0" style={{ color }} fill={color} />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="Ej: Clientes potenciales, Madrid, Restaurantes…"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Color</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : mode === 'create' ? 'Crear carpeta' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
