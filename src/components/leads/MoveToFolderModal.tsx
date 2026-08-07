'use client'

import { useMemo, useState } from 'react'
import { X, Folder as FolderIcon, FolderInput, Plus, Check, CornerDownRight } from 'lucide-react'
import { Folder, FOLDER_COLORS, DEFAULT_FOLDER_COLOR } from '@/types'
import { buildFolderTree, FolderNode } from '@/lib/folders'

interface Props {
  title: string
  subtitle?: string
  folders: Folder[]
  /** Folders that cannot be picked as a destination (e.g. a folder + its subtree). */
  disabledIds?: Set<string>
  initialTargetId?: string | null
  confirmLabel?: string
  onConfirm: (targetFolderId: string | null) => Promise<void>
  onCreateFolder: (name: string, parentId: string | null, color: string) => Promise<Folder>
  onClose: () => void
}

export function MoveToFolderModal({
  title,
  subtitle,
  folders,
  disabledIds,
  initialTargetId = null,
  confirmLabel = 'Mover aquí',
  onConfirm,
  onCreateFolder,
  onClose,
}: Props) {
  // `target` is the destination folder id, or null for the root ("Sin carpeta").
  const [target, setTarget] = useState<string | null>(initialTargetId)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(DEFAULT_FOLDER_COLOR)
  const [error, setError] = useState('')

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const targetName = target ? folders.find((f) => f.id === target)?.name ?? '' : 'Sin carpeta'

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm(target)
    } catch {
      setError('No se pudo completar la operación')
      setBusy(false)
    }
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setError('Escribe un nombre para la nueva carpeta')
      return
    }
    setBusy(true)
    setError('')
    try {
      // New folder is created inside the currently selected destination.
      const created = await onCreateFolder(name, target, newColor)
      setTarget(created.id)
      setNewName('')
      setNewColor(DEFAULT_FOLDER_COLOR)
      setShowCreate(false)
    } catch {
      setError('No se pudo crear la carpeta')
    } finally {
      setBusy(false)
    }
  }

  function renderNode(node: FolderNode) {
    const disabled = disabledIds?.has(node.id) ?? false
    const selected = target === node.id
    return (
      <div key={node.id}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setTarget(node.id)}
          style={{ paddingLeft: 8 + node.depth * 18 }}
          className={`w-full flex items-center gap-2 pr-3 py-2 rounded-lg text-sm text-left transition-colors ${
            disabled
              ? 'opacity-40 cursor-not-allowed'
              : selected
                ? 'bg-blue-50 text-blue-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          {node.depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />}
          <FolderIcon
            className="w-4 h-4 shrink-0"
            style={{ color: node.color ?? DEFAULT_FOLDER_COLOR }}
            fill={node.color ?? DEFAULT_FOLDER_COLOR}
          />
          <span className="truncate flex-1">{node.name}</span>
          {selected && <Check className="w-4 h-4 shrink-0" />}
        </button>
        {node.children.map(renderNode)}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-3 flex-1">
          <button
            type="button"
            onClick={() => setTarget(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
              target === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <FolderInput className="w-4 h-4 shrink-0 text-gray-400" />
            <span className="flex-1">Sin carpeta (raíz)</span>
            {target === null && <Check className="w-4 h-4 shrink-0" />}
          </button>

          {tree.length > 0 && <div className="my-1 border-t border-gray-100 dark:border-gray-800" />}
          {tree.map(renderNode)}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
          {showCreate ? (
            <div className="space-y-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nueva carpeta dentro de{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{targetName}</span>
              </p>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreate())}
                placeholder="Nombre de la carpeta"
                className="input"
              />
              <div className="flex items-center gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-md transition-transform hover:scale-110 ${
                      newColor === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy}
                  className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  Crear y seleccionar
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError('') }}
                  className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Crear una carpeta nueva
            </button>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Destino: <span className="font-medium text-gray-700 dark:text-gray-300">{targetName}</span>
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
