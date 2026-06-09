'use client'

import { useMemo, useState } from 'react'
import { X, AlertTriangle, FolderMinus, Trash2, Folder as FolderIcon } from 'lucide-react'
import { Folder, Lead, DEFAULT_FOLDER_COLOR } from '@/types'
import { expandWithDescendants } from '@/lib/folders'

interface Props {
  /** Folders the user chose to delete. */
  targets: Folder[]
  folders: Folder[]
  leads: Lead[]
  onConfirm: (cascade: boolean) => Promise<void>
  onClose: () => void
}

export function DeleteFoldersModal({ targets, folders, leads, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<'keep' | 'all'>('keep')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Everything that lives inside the chosen folders (their whole subtree).
  const { subfolderCount, leadCount } = useMemo(() => {
    const fullSet = expandWithDescendants(
      targets.map((t) => t.id),
      folders,
    )
    const leadCount = leads.filter((l) => l.folderId && fullSet.has(l.folderId)).length
    return { subfolderCount: fullSet.size - targets.length, leadCount }
  }, [targets, folders, leads])

  const hasContent = subfolderCount > 0 || leadCount > 0
  const many = targets.length > 1

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      // No content → both modes behave the same; default to a plain delete.
      await onConfirm(hasContent ? mode === 'all' : false)
    } catch {
      setError('No se pudo completar la operación')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {many ? `Eliminar ${targets.length} carpetas` : 'Eliminar carpeta'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {targets.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700"
              >
                <FolderIcon
                  className="w-3.5 h-3.5"
                  style={{ color: f.color ?? DEFAULT_FOLDER_COLOR }}
                  fill={f.color ?? DEFAULT_FOLDER_COLOR}
                />
                {f.name}
              </span>
            ))}
          </div>

          {hasContent ? (
            <>
              <p className="text-sm text-gray-500">
                {many ? 'Estas carpetas contienen' : 'Esta carpeta contiene'}{' '}
                {leadCount > 0 && (
                  <span className="font-medium text-gray-700">
                    {leadCount} {leadCount === 1 ? 'lead' : 'leads'}
                  </span>
                )}
                {leadCount > 0 && subfolderCount > 0 && ' y '}
                {subfolderCount > 0 && (
                  <span className="font-medium text-gray-700">
                    {subfolderCount} {subfolderCount === 1 ? 'subcarpeta' : 'subcarpetas'}
                  </span>
                )}
                . ¿Qué quieres hacer?
              </p>

              <div className="space-y-2">
                <ChoiceCard
                  selected={mode === 'keep'}
                  onSelect={() => setMode('keep')}
                  icon={FolderMinus}
                  tone="neutral"
                  title="Conservar el contenido"
                  desc={`Los leads y subcarpetas se moverán a la carpeta superior. No se elimina ningún lead.`}
                />
                <ChoiceCard
                  selected={mode === 'all'}
                  onSelect={() => setMode('all')}
                  icon={Trash2}
                  tone="danger"
                  title="Eliminar todo el contenido"
                  desc={`Se eliminarán también los ${leadCount} ${
                    leadCount === 1 ? 'lead' : 'leads'
                  }${subfolderCount > 0 ? ` y las ${subfolderCount} subcarpetas` : ''}. No se puede deshacer.`}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {many
                ? 'Estas carpetas están vacías. Se eliminarán definitivamente.'
                : 'Esta carpeta está vacía. Se eliminará definitivamente.'}
            </p>
          )}

          {mode === 'all' && hasContent && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                Vas a eliminar leads de forma permanente. Asegúrate de que es lo que quieres.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {!hasContent || mode === 'keep' ? 'Eliminar carpeta' + (many ? 's' : '') : 'Eliminar todo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChoiceCard({
  selected,
  onSelect,
  icon: Icon,
  tone,
  title,
  desc,
}: {
  selected: boolean
  onSelect: () => void
  icon: typeof Trash2
  tone: 'neutral' | 'danger'
  title: string
  desc: string
}) {
  const ring = selected
    ? tone === 'danger'
      ? 'border-red-400 bg-red-50'
      : 'border-blue-400 bg-blue-50'
    : 'border-gray-200 hover:border-gray-300'
  const iconColor = tone === 'danger' ? 'text-red-500' : 'text-gray-500'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-start gap-3 text-left border rounded-xl px-3 py-2.5 transition-colors ${ring}`}
    >
      <span
        className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
          selected
            ? tone === 'danger'
              ? 'border-red-500'
              : 'border-blue-500'
            : 'border-gray-300'
        }`}
      >
        {selected && (
          <span
            className={`w-2 h-2 rounded-full ${tone === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`}
          />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </button>
  )
}
