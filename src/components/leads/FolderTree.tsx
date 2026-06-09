'use client'

import { useState, useEffect } from 'react'
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  FolderPlus,
  Pencil,
  Trash2,
  FolderInput,
  Layers,
  Inbox,
  X,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Folder, FOLDER_COLORS, DEFAULT_FOLDER_COLOR } from '@/types'
import { buildFolderTree, FolderNode, getDescendantIds } from '@/lib/folders'

interface FolderTreeProps {
  folders: Folder[]
  /** folderId -> number of leads inside it (including subfolders). */
  counts: Map<string, number>
  allCount: number
  noneCount: number
  selected: string
  expanded: Set<string>
  checkedFolders: Set<string>
  onSelect: (key: string) => void
  onToggle: (id: string) => void
  onToggleCheck: (id: string) => void
  onClearChecks: () => void
  onDeleteChecked: () => void
  onNewRoot: () => void
  onNewChild: (parentId: string) => void
  onEdit: (folder: Folder) => void
  onMove: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onRecolor: (folder: Folder, color: string) => void
  dragType: 'lead' | 'folder' | null
  draggingFolderId: string | null
}

export function FolderTree(props: FolderTreeProps) {
  const { folders, allCount, noneCount, selected, dragType, draggingFolderId } = props
  const tree = buildFolderTree(folders)
  const checkedCount = props.checkedFolders.size

  // While dragging a folder, these targets would create a cycle — disable them.
  const invalidDropIds =
    dragType === 'folder' && draggingFolderId
      ? new Set([draggingFolderId, ...getDescendantIds(draggingFolderId, folders)])
      : new Set<string>()

  return (
    <div className="w-64 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Carpetas</span>
        <button
          onClick={props.onNewRoot}
          title="Nueva carpeta"
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          <FolderPlus className="w-4 h-4" />
          Nueva
        </button>
      </div>

      {checkedCount > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border-b border-red-100">
          <span className="text-xs font-medium text-red-700">
            {checkedCount} {checkedCount === 1 ? 'carpeta' : 'carpetas'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={props.onDeleteChecked}
              className="flex items-center gap-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md px-2 py-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
            <button
              onClick={props.onClearChecks}
              className="p-1 text-red-400 hover:text-red-600"
              title="Limpiar selección"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* All leads */}
        <button
          onClick={() => props.onSelect('all')}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
            selected === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0 text-gray-400" />
          <span className="flex-1 text-left">Todos los leads</span>
          <CountBadge n={allCount} active={selected === 'all'} />
        </button>

        {/* Unfiled leads — also a drop target */}
        <UnfiledRow
          count={noneCount}
          selected={selected === 'none'}
          onSelect={() => props.onSelect('none')}
          dragType={dragType}
        />

        {tree.length > 0 && <div className="my-1.5 border-t border-gray-100" />}

        {tree.map((node) => (
          <FolderRow key={node.id} node={node} {...props} invalidDropIds={invalidDropIds} />
        ))}

        {folders.length === 0 && (
          <div className="px-2 py-6 text-center">
            <FolderIcon className="w-7 h-7 mx-auto text-gray-200 mb-1.5" />
            <p className="text-xs text-gray-400">Aún no tienes carpetas.</p>
            <button
              onClick={props.onNewRoot}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              Crear la primera
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CountBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`text-xs font-medium rounded-full px-1.5 min-w-[20px] text-center ${
        active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {n}
    </span>
  )
}

function UnfiledRow({
  count,
  selected,
  onSelect,
  dragType,
}: {
  count: number
  selected: boolean
  onSelect: () => void
  dragType: 'lead' | 'folder' | null
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop:none',
    data: { type: 'folder', folderId: null },
  })
  const highlight = isOver && dragType === 'lead'

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
        highlight ? 'ring-2 ring-blue-400 bg-blue-50' : ''
      } ${selected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
    >
      <Inbox className="w-4 h-4 shrink-0 text-gray-400" />
      <span className="flex-1 text-left">Sin carpeta</span>
      <CountBadge n={count} active={selected} />
    </button>
  )
}

type RowProps = FolderTreeProps & { node: FolderNode; invalidDropIds: Set<string> }

function FolderRow({ node, invalidDropIds, ...p }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasChildren = node.children.length > 0
  const isExpanded = p.expanded.has(node.id)
  const isSelected = p.selected === node.id
  const isChecked = p.checkedFolders.has(node.id)
  const color = node.color ?? DEFAULT_FOLDER_COLOR
  const count = p.counts.get(node.id) ?? 0
  const folder: Folder = node

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${node.id}`,
    data: { type: 'folder', folderId: node.id },
  })
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `folder:${node.id}`,
    data: { type: 'folder', folderId: node.id },
  })

  const isInvalidTarget = invalidDropIds.has(node.id)
  const highlight = isOver && !isInvalidTarget && p.dragType !== null

  return (
    <div>
      <div
        ref={setDropRef}
        className={`group relative flex items-center rounded-lg transition-colors ${
          highlight ? 'ring-2 ring-blue-400' : ''
        } ${
          isChecked
            ? 'bg-red-50'
            : isSelected
              ? 'bg-blue-50'
              : 'hover:bg-gray-50'
        } ${isDragging ? 'opacity-40' : ''}`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => p.onToggleCheck(node.id)}
          className="ml-2 mr-0.5 rounded border-gray-300 cursor-pointer shrink-0"
          aria-label={`Seleccionar carpeta ${node.name}`}
        />

        <div
          className="flex items-center gap-1 flex-1 min-w-0"
          style={{ paddingLeft: node.depth * 14 }}
        >
          {hasChildren ? (
            <button
              onClick={() => p.onToggle(node.id)}
              className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0"
              aria-label={isExpanded ? 'Contraer' : 'Expandir'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}

          <button
            ref={setDragRef}
            {...listeners}
            {...attributes}
            onClick={() => p.onSelect(node.id)}
            className={`flex items-center gap-2 flex-1 min-w-0 py-2 pr-1 text-sm text-left cursor-grab active:cursor-grabbing ${
              isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            <FolderIcon className="w-4 h-4 shrink-0" style={{ color }} fill={color} />
            <span className="truncate flex-1">{node.name}</span>
          </button>

          <CountBadge n={count} active={isSelected} />

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 mr-1 text-gray-300 hover:text-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
            aria-label="Opciones de carpeta"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {menuOpen && (
          <FolderMenu
            folder={folder}
            onClose={() => setMenuOpen(false)}
            onNewChild={() => p.onNewChild(node.id)}
            onEdit={() => p.onEdit(folder)}
            onMove={() => p.onMove(folder)}
            onDelete={() => p.onDelete(folder)}
            onRecolor={(c) => p.onRecolor(folder, c)}
          />
        )}
      </div>

      {isExpanded &&
        node.children.map((child) => (
          <FolderRow key={child.id} node={child} invalidDropIds={invalidDropIds} {...p} />
        ))}
    </div>
  )
}

function FolderMenu({
  folder,
  onClose,
  onNewChild,
  onEdit,
  onMove,
  onDelete,
  onRecolor,
}: {
  folder: Folder
  onClose: () => void
  onNewChild: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
  onRecolor: (color: string) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-1 top-9 z-50 w-52 bg-white rounded-xl border border-gray-200 shadow-xl py-1">
        <MenuItem icon={FolderPlus} label="Nueva subcarpeta" onClick={run(onNewChild)} />
        <MenuItem icon={Pencil} label="Renombrar / color" onClick={run(onEdit)} />
        <MenuItem icon={FolderInput} label="Mover a…" onClick={run(onMove)} />

        <div className="px-3 py-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 mb-1.5">Color rápido</p>
          <div className="flex items-center gap-1.5">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                onClick={run(() => onRecolor(c))}
                className={`w-5 h-5 rounded-md transition-transform hover:scale-110 ${
                  (folder.color ?? DEFAULT_FOLDER_COLOR) === c
                    ? 'ring-2 ring-offset-1 ring-gray-400'
                    : ''
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100">
          <MenuItem icon={Trash2} label="Eliminar carpeta" danger onClick={run(onDelete)} />
        </div>
      </div>
    </>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  )
}
