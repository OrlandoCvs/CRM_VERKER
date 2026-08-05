'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  pointerWithin,
} from '@dnd-kit/core'
import {
  Search,
  Plus,
  Filter,
  Star,
  Phone,
  Globe,
  MapPin,
  Mail,
  Trash2,
  Edit,
  GripVertical,
  Folder as FolderIcon,
  FolderInput,
  X,
  ChevronRight,
  Download,
  Upload,
} from 'lucide-react'
import { StatusBadge, SourceBadge } from '@/components/ui/Badge'
import { LeadFormModal } from '@/components/leads/LeadFormModal'
import { EmailComposerModal } from '@/components/email/EmailComposerModal'
import { FolderTree } from '@/components/leads/FolderTree'
import { FolderFormModal } from '@/components/leads/FolderFormModal'
import { MoveToFolderModal } from '@/components/leads/MoveToFolderModal'
import { DeleteFoldersModal } from '@/components/leads/DeleteFoldersModal'
import { ImportCsvModal } from '@/components/leads/ImportCsvModal'
import {
  Lead,
  Folder,
  LeadStatus,
  LeadSource,
  STATUS_LABELS,
  SOURCE_LABELS,
  DEFAULT_FOLDER_COLOR,
} from '@/types'
import {
  buildFolderTree,
  FolderNode,
  getDescendantIds,
  getFolderPath,
  isSelfOrDescendant,
  expandWithDescendants,
  resolveSurvivingParent,
} from '@/lib/folders'

interface Props {
  initialLeads: Lead[]
  initialFolders: Folder[]
}

type DragInfo =
  | { type: 'lead'; leadId: string; count: number }
  | { type: 'folder'; folderId: string }

type FolderFormState =
  | { mode: 'create'; parentId: string | null; parentName: string | null }
  | { mode: 'edit'; folder: Folder }

type MoveState =
  | { kind: 'leads'; leadIds: string[] }
  | { kind: 'folder'; folder: Folder }

export function LeadsClient({ initialLeads, initialFolders }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [folders, setFolders] = useState<Folder[]>(initialFolders)

  const [selectedFolder, setSelectedFolder] = useState<string>('all')
  const [includeSub, setIncludeSub] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [checkedFolders, setCheckedFolders] = useState<Set<string>>(new Set())

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  const [showLeadModal, setShowLeadModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [showImportCsv, setShowImportCsv] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState | null>(null)
  const [moveModal, setMoveModal] = useState<MoveState | null>(null)
  const [deleteFolders, setDeleteFolders] = useState<Folder[] | null>(null)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [emailCampaign, setEmailCampaign] = useState<Lead[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  )

  // ---- Lead counts per folder (including nested subfolders) ----
  const counts = useMemo(() => {
    const direct = new Map<string, number>()
    for (const l of leads) {
      if (l.folderId) direct.set(l.folderId, (direct.get(l.folderId) ?? 0) + 1)
    }
    const total = new Map<string, number>()
    const walk = (node: FolderNode): number => {
      let sum = direct.get(node.id) ?? 0
      for (const child of node.children) sum += walk(child)
      total.set(node.id, sum)
      return sum
    }
    buildFolderTree(folders).forEach(walk)
    return total
  }, [leads, folders])

  const noneCount = useMemo(() => leads.filter((l) => !l.folderId).length, [leads])

  // ---- Filtering ----
  const scopedLeads = useMemo(() => {
    if (selectedFolder === 'all') return leads
    if (selectedFolder === 'none') return leads.filter((l) => !l.folderId)
    const scope = new Set<string>([selectedFolder])
    if (includeSub) {
      for (const id of getDescendantIds(selectedFolder, folders)) scope.add(id)
    }
    return leads.filter((l) => l.folderId && scope.has(l.folderId))
  }, [leads, folders, selectedFolder, includeSub])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scopedLeads.filter((l) => {
      const matchQ =
        !needle ||
        [
          l.name,
          l.company,
          l.city,
          l.country,
          l.email,
          l.phone,
          l.address,
          l.category,
          l.notes,
          l.tags,
          STATUS_LABELS[l.status as LeadStatus],
        ].some((v) => (v ?? '').toLowerCase().includes(needle))
      const matchStatus = statusFilter === 'all' || l.status === statusFilter
      const matchSource = sourceFilter === 'all' || l.source === sourceFilter
      return matchQ && matchStatus && matchSource
    })
  }, [scopedLeads, q, statusFilter, sourceFilter])

  const folderPath = useMemo(
    () =>
      selectedFolder !== 'all' && selectedFolder !== 'none'
        ? getFolderPath(selectedFolder, folders)
        : [],
    [selectedFolder, folders],
  )

  // ---- Selection ----
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))
  const someFilteredSelected = filtered.some((l) => selectedIds.has(l.id))

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (filtered.every((l) => next.has(l.id))) {
        for (const l of filtered) next.delete(l.id)
      } else {
        for (const l of filtered) next.add(l.id)
      }
      return next
    })
  }

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Selecciona una carpeta abriendo también la rama que la contiene: si se llega
   * desde la ruta de navegación o tras borrar una carpeta, el destino podría
   * quedar colapsado y por tanto invisible en el árbol.
   */
  const selectFolder = useCallback(
    (key: string) => {
      setSelectedFolder(key)
      if (key === 'all' || key === 'none') return
      const ancestors = getFolderPath(key, folders).slice(0, -1)
      if (ancestors.length === 0) return
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const f of ancestors) next.add(f.id)
        return next
      })
    },
    [folders],
  )

  // ---- Folder API helpers ----
  const createFolder = useCallback(
    async (name: string, parentId: string | null, color: string): Promise<Folder> => {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId, color }),
      })
      if (!res.ok) throw new Error('create failed')
      const folder: Folder = await res.json()
      setFolders((prev) => [...prev, folder])
      if (parentId) setExpanded((prev) => new Set(prev).add(parentId))
      return folder
    },
    [],
  )

  const patchFolder = useCallback(
    async (id: string, data: Partial<Pick<Folder, 'name' | 'color' | 'parentId'>>) => {
      const res = await fetch(`/api/folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'No se pudo actualizar la carpeta')
        throw new Error('patch failed')
      }
      const updated: Folder = await res.json()
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...updated } : f)))
    },
    [],
  )

  function toggleCheckFolder(id: string) {
    setCheckedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearFolderChecks = useCallback(() => setCheckedFolders(new Set()), [])

  async function handleDeleteFoldersConfirm(cascade: boolean) {
    if (!deleteFolders) return
    const ids = deleteFolders.map((f) => f.id)

    const res = await fetch('/api/folders/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderIds: ids, cascade }),
    })
    if (!res.ok) {
      alert('No se pudieron eliminar las carpetas')
      throw new Error('bulk-delete failed')
    }

    const deleteSet = new Set(ids)

    if (cascade) {
      // The folders, their whole subtree and every lead inside are gone.
      const full = expandWithDescendants(ids, folders)
      const removedLeadIds = new Set(
        leads.filter((l) => l.folderId && full.has(l.folderId)).map((l) => l.id),
      )
      setFolders((prev) => prev.filter((f) => !full.has(f.id)))
      setLeads((prev) => prev.filter((l) => !removedLeadIds.has(l.id)))
      setSelectedIds((prev) => {
        if (![...prev].some((id) => removedLeadIds.has(id))) return prev
        return new Set([...prev].filter((id) => !removedLeadIds.has(id)))
      })
      if (selectedFolder !== 'all' && selectedFolder !== 'none' && full.has(selectedFolder)) {
        setSelectedFolder('all')
      }
    } else {
      // Contents survive — re-home them to the nearest surviving ancestor.
      setFolders((prev) =>
        prev
          .filter((f) => !deleteSet.has(f.id))
          .map((f) =>
            f.parentId && deleteSet.has(f.parentId)
              ? { ...f, parentId: resolveSurvivingParent(f.parentId, deleteSet, folders) }
              : f,
          ),
      )
      setLeads((prev) =>
        prev.map((l) =>
          l.folderId && deleteSet.has(l.folderId)
            ? { ...l, folderId: resolveSurvivingParent(l.folderId, deleteSet, folders) }
            : l,
        ),
      )
      if (selectedFolder !== 'all' && selectedFolder !== 'none' && deleteSet.has(selectedFolder)) {
        setSelectedFolder(resolveSurvivingParent(selectedFolder, deleteSet, folders) ?? 'all')
      }
    }

    setCheckedFolders((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    setDeleteFolders(null)
  }

  const moveLeads = useCallback(
    async (leadIds: string[], folderId: string | null) => {
      if (leadIds.length === 0) return
      const res = await fetch('/api/leads/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, folderId }),
      })
      if (!res.ok) {
        alert('No se pudieron mover los leads')
        return
      }
      const idSet = new Set(leadIds)
      setLeads((prev) =>
        prev.map((l) => (idSet.has(l.id) ? { ...l, folderId } : l)),
      )
    },
    [],
  )

  // ---- Folder form submit (create / edit) ----
  async function handleFolderFormSubmit(name: string, color: string) {
    if (!folderForm) return
    if (folderForm.mode === 'create') {
      await createFolder(name, folderForm.parentId, color)
    } else {
      await patchFolder(folderForm.folder.id, { name, color })
    }
    setFolderForm(null)
  }

  // ---- Move modal confirm ----
  async function handleMoveConfirm(target: string | null) {
    if (!moveModal) return
    if (moveModal.kind === 'leads') {
      await moveLeads(moveModal.leadIds, target)
      clearSelection()
    } else {
      await patchFolder(moveModal.folder.id, { parentId: target })
    }
    setMoveModal(null)
  }

  // ---- Lead save ----
  async function handleSaveLead(data: Partial<Lead>) {
    if (editingLead) {
      const res = await fetch(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const updated = await res.json()
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
    } else {
      // A lead created while a folder is open lands inside that folder.
      const folderId =
        selectedFolder !== 'all' && selectedFolder !== 'none' ? selectedFolder : null
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, source: 'manual', folderId }),
      })
      const created = await res.json()
      setLeads((prev) => [{ ...created, contacts: [], activities: [] }, ...prev])
    }
    setShowLeadModal(false)
    setEditingLead(null)
  }

  async function handleDeleteLead(id: string) {
    if (!confirm('¿Eliminar este lead?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function bulkDeleteLeads() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const msg =
      `¿Eliminar ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}?\n\n` +
      `Esta acción no se puede deshacer.`
    if (!confirm(msg)) return

    const res = await fetch('/api/leads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: ids }),
    })
    if (!res.ok) {
      alert('No se pudieron eliminar los leads')
      return
    }
    const idSet = new Set(ids)
    setLeads((prev) => prev.filter((l) => !idSet.has(l.id)))
    clearSelection()
  }

  // ---- Drag & drop ----
  function handleDragStart(e: DragStartEvent) {
    const d = e.active.data.current
    if (d?.type === 'lead') {
      const inSelection = selectedIds.has(d.leadId)
      setDrag({
        type: 'lead',
        leadId: d.leadId,
        count: inSelection && selectedIds.size > 0 ? selectedIds.size : 1,
      })
    } else if (d?.type === 'folder') {
      setDrag({ type: 'folder', folderId: d.folderId })
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setDrag(null)
    const { active, over } = e
    if (!over) return
    const a = active.data.current
    const o = over.data.current
    if (!o || o.type !== 'folder') return
    const targetFolderId = (o.folderId ?? null) as string | null

    if (a?.type === 'lead') {
      const leadId = a.leadId as string
      const ids =
        selectedIds.has(leadId) && selectedIds.size > 0
          ? [...selectedIds]
          : [leadId]
      moveLeads(ids, targetFolderId)
    } else if (a?.type === 'folder') {
      const fid = a.folderId as string
      const folder = folderById.get(fid)
      if (!folder || folder.parentId === targetFolderId) return
      if (targetFolderId && isSelfOrDescendant(fid, targetFolderId, folders)) return
      patchFolder(fid, { parentId: targetFolderId })
    }
  }

  const isRealFolder = selectedFolder !== 'all' && selectedFolder !== 'none'
  // El conmutador solo aporta si la carpeta tiene algo anidado dentro.
  const hasSubfolders =
    isRealFolder && getDescendantIds(selectedFolder, folders).length > 0

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {filtered.length} de {leads.length} leads
              {selectedIds.size > 0 && ` · ${selectedIds.size} seleccionados`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportCsv(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              title="Importar contactos desde un archivo CSV"
            >
              <Upload className="h-4 w-4" />
              Importar
            </button>
            <a
              href={`/api/leads/export?folder=${encodeURIComponent(selectedFolder)}&sub=${includeSub ? 1 : 0}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              title="Exportar los leads visibles a CSV"
            >
              <Download className="h-4 w-4" />
              Exportar
            </a>
            <button
              onClick={() => {
                setEditingLead(null)
                setShowLeadModal(true)
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Lead
            </button>
          </div>
        </div>

        <div className="flex gap-5 items-start">
          {/* Folder sidebar */}
          <FolderTree
            folders={folders}
            counts={counts}
            allCount={leads.length}
            noneCount={noneCount}
            selected={selectedFolder}
            expanded={expanded}
            checkedFolders={checkedFolders}
            onSelect={selectFolder}
            onToggle={toggleExpand}
            onToggleCheck={toggleCheckFolder}
            onClearChecks={clearFolderChecks}
            onDeleteChecked={() =>
              setDeleteFolders(folders.filter((f) => checkedFolders.has(f.id)))
            }
            onNewRoot={() =>
              setFolderForm({ mode: 'create', parentId: null, parentName: null })
            }
            onNewChild={(parentId) =>
              setFolderForm({
                mode: 'create',
                parentId,
                parentName: folderById.get(parentId)?.name ?? null,
              })
            }
            onEdit={(folder) => setFolderForm({ mode: 'edit', folder })}
            onMove={(folder) => setMoveModal({ kind: 'folder', folder })}
            onDelete={(folder) => setDeleteFolders([folder])}
            onRecolor={(folder, color) => patchFolder(folder.id, { color })}
            dragType={drag?.type ?? null}
            draggingFolderId={drag?.type === 'folder' ? drag.folderId : null}
          />

          {/* Main column */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Breadcrumb / context */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                <button
                  onClick={() => setSelectedFolder('all')}
                  className="hover:text-gray-800"
                >
                  Todos los leads
                </button>
                {selectedFolder === 'none' && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    <span className="text-gray-800 font-medium">Sin carpeta</span>
                  </>
                )}
                {folderPath.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1.5 min-w-0">
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    <button
                      onClick={() => selectFolder(f.id)}
                      className={`truncate ${
                        i === folderPath.length - 1
                          ? 'text-gray-800 font-medium'
                          : 'hover:text-gray-800'
                      }`}
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
              </div>
              {hasSubfolders && (
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSub}
                    onChange={(e) => setIncludeSub(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Incluir subcarpetas
                </label>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre, ciudad, notas, estado…"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos los estados</option>
                {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las fuentes</option>
                {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap bg-blue-600 text-white rounded-xl px-4 py-2.5">
                <span className="text-sm font-medium">
                  {selectedIds.size} {selectedIds.size === 1 ? 'lead' : 'leads'} seleccionado
                  {selectedIds.size === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setEmailCampaign(leads.filter((l) => selectedIds.has(l.id)))
                    }
                    className="flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Enviar campaña
                  </button>
                  <button
                    onClick={() =>
                      setMoveModal({ kind: 'leads', leadIds: [...selectedIds] })
                    }
                    className="flex items-center gap-1.5 bg-white text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
                  >
                    <FolderInput className="w-4 h-4" />
                    Mover a carpeta
                  </button>
                  <button
                    onClick={() => {
                      moveLeads([...selectedIds], null)
                      clearSelection()
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
                  >
                    Quitar de carpeta
                  </button>
                  <button
                    onClick={bulkDeleteLeads}
                    className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                  <button
                    onClick={clearSelection}
                    className="p-1.5 rounded-lg hover:bg-blue-500 transition-colors"
                    title="Limpiar selección"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay leads que coincidan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="w-10 px-3 py-3">
                          <SelectAllCheckbox
                            checked={allFilteredSelected}
                            indeterminate={someFilteredSelected && !allFilteredSelected}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Nombre
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Contacto
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Ubicación
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Carpeta
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Rating
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Fuente
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">
                          Estado
                        </th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map((lead) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          folder={lead.folderId ? folderById.get(lead.folderId) ?? null : null}
                          selected={selectedIds.has(lead.id)}
                          onToggle={() => toggleLead(lead.id)}
                          onEdit={() => {
                            setEditingLead(lead)
                            setShowLeadModal(true)
                          }}
                          onDelete={() => handleDeleteLead(lead.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400">
              Consejo: arrastra un lead (o varios seleccionados) sobre una carpeta para
              organizarlo. También puedes arrastrar carpetas para anidarlas.
            </p>
          </div>
        </div>
      </div>

      {/* Drag preview */}
      <DragOverlay dropAnimation={null}>
        {drag?.type === 'lead' && (
          <div className="bg-white rounded-lg border border-blue-300 shadow-xl px-3 py-2 text-sm flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-blue-400" />
            <span className="font-medium text-gray-800">
              {drag.count > 1
                ? `${drag.count} leads`
                : leads.find((l) => l.id === drag.leadId)?.name ?? 'Lead'}
            </span>
          </div>
        )}
        {drag?.type === 'folder' && (
          <div className="bg-white rounded-lg border border-blue-300 shadow-xl px-3 py-2 text-sm flex items-center gap-2">
            <FolderIcon
              className="w-4 h-4"
              style={{ color: folderById.get(drag.folderId)?.color ?? DEFAULT_FOLDER_COLOR }}
              fill={folderById.get(drag.folderId)?.color ?? DEFAULT_FOLDER_COLOR}
            />
            <span className="font-medium text-gray-800">
              {folderById.get(drag.folderId)?.name ?? 'Carpeta'}
            </span>
          </div>
        )}
      </DragOverlay>

      {/* Modals */}
      {showLeadModal && (
        <LeadFormModal
          lead={editingLead}
          onSave={handleSaveLead}
          onClose={() => {
            setShowLeadModal(false)
            setEditingLead(null)
          }}
        />
      )}

      {showImportCsv && (
        <ImportCsvModal
          folderId={selectedFolder}
          folders={folders}
          onClose={() => setShowImportCsv(false)}
          // Refleja al instante una carpeta creada durante el import en el árbol.
          onFolderCreated={(folder) => setFolders((prev) => [...prev, folder])}
          // Tras importar (potencialmente cientos de leads), recargamos la vista
          // para traer todos los nuevos registros del servidor de una vez.
          onImported={() => window.location.reload()}
        />
      )}

      {folderForm && (
        <FolderFormModal
          mode={folderForm.mode}
          folder={folderForm.mode === 'edit' ? folderForm.folder : null}
          parentName={folderForm.mode === 'create' ? folderForm.parentName : null}
          onSubmit={handleFolderFormSubmit}
          onClose={() => setFolderForm(null)}
        />
      )}

      {moveModal && (
        <MoveToFolderModal
          title={
            moveModal.kind === 'leads'
              ? `Mover ${moveModal.leadIds.length} ${
                  moveModal.leadIds.length === 1 ? 'lead' : 'leads'
                }`
              : `Mover carpeta "${moveModal.folder.name}"`
          }
          subtitle={
            moveModal.kind === 'leads'
              ? 'Elige una carpeta destino o crea una nueva.'
              : 'Elige la nueva carpeta superior.'
          }
          folders={folders}
          disabledIds={
            moveModal.kind === 'folder'
              ? new Set([
                  moveModal.folder.id,
                  ...getDescendantIds(moveModal.folder.id, folders),
                ])
              : undefined
          }
          initialTargetId={
            moveModal.kind === 'folder' ? moveModal.folder.parentId ?? null : null
          }
          confirmLabel={moveModal.kind === 'leads' ? 'Mover leads' : 'Mover carpeta'}
          onConfirm={handleMoveConfirm}
          onCreateFolder={createFolder}
          onClose={() => setMoveModal(null)}
        />
      )}

      {deleteFolders && deleteFolders.length > 0 && (
        <DeleteFoldersModal
          targets={deleteFolders}
          folders={folders}
          leads={leads}
          onConfirm={handleDeleteFoldersConfirm}
          onClose={() => setDeleteFolders(null)}
        />
      )}

      {emailCampaign && (
        <EmailComposerModal
          leads={emailCampaign}
          onClose={() => setEmailCampaign(null)}
          onSent={(sentIds, markedContacted) => {
            if (markedContacted) {
              const idSet = new Set(sentIds)
              setLeads((prev) =>
                prev.map((l) =>
                  idSet.has(l.id) && l.status === 'new' ? { ...l, status: 'contacted' } : l,
                ),
              )
            }
          }}
        />
      )}
    </DndContext>
  )
}

/* ---------------- Sub-components ---------------- */

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="rounded border-gray-300 cursor-pointer"
      aria-label="Seleccionar todos"
    />
  )
}

function LeadRow({
  lead,
  folder,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  lead: Lead
  folder: Folder | null
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `lead:${lead.id}`,
    data: { type: 'lead', leadId: lead.id },
  })

  return (
    <tr
      ref={setNodeRef}
      className={`group transition-colors ${
        isDragging ? 'opacity-40' : ''
      } ${selected ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="rounded border-gray-300 cursor-pointer"
            aria-label={`Seleccionar ${lead.name}`}
          />
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Arrastrar lead"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link href={`/leads/${lead.id}`} className="hover:text-blue-600">
          <p className="font-medium text-gray-900 truncate max-w-[180px]">{lead.name}</p>
          {lead.company && (
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{lead.company}</p>
          )}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {lead.phone && (
            <div className="flex items-center gap-1 text-gray-600">
              <Phone className="w-3 h-3" />
              <span className="text-xs">{lead.phone}</span>
            </div>
          )}
          {lead.website && (
            <div className="flex items-center gap-1 text-gray-600">
              <Globe className="w-3 h-3" />
              <a
                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate max-w-[120px]"
              >
                Web
              </a>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {(lead.city || lead.country) && (
          <div className="flex items-center gap-1 text-gray-600">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="text-xs truncate max-w-[120px]">
              {[lead.city, lead.country].filter(Boolean).join(', ')}
            </span>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {folder ? (
          <span className="inline-flex items-center gap-1.5 max-w-[140px]">
            <FolderIcon
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: folder.color ?? DEFAULT_FOLDER_COLOR }}
              fill={folder.color ?? DEFAULT_FOLDER_COLOR}
            />
            <span className="text-xs text-gray-600 truncate">{folder.name}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {lead.rating != null && (
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-medium">{lead.rating.toFixed(1)}</span>
            {lead.reviewCount ? (
              <span className="text-xs text-gray-400">({lead.reviewCount})</span>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <SourceBadge source={lead.source as LeadSource} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={lead.status as LeadStatus} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            aria-label="Editar"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            aria-label="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}
