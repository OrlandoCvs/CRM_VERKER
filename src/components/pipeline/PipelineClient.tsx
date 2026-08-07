'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  rectIntersection,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Star, Phone, MapPin, GripVertical, Search, X, MailWarning } from 'lucide-react'
import { SourceBadge } from '@/components/ui/Badge'
import { FolderPicker, FOLDER_ALL, FOLDER_NONE } from '@/components/leads/FolderPicker'
import { Lead, Folder, LeadStatus, LeadSource, STATUS_LABELS, PIPELINE_COLUMNS } from '@/types'
import { buildFolderTree, FolderNode, getDescendantIds } from '@/lib/folders'

/**
 * Cada columna se identifica por un color de acento. Se aplica como una franja
 * superior y al punto del encabezado, en vez de teñir toda la columna: mantiene
 * el tablero legible cuando hay muchas tarjetas.
 */
const COLUMN_ACCENT: Record<LeadStatus, { bar: string; dot: string; count: string; ring: string }> = {
  new: {
    bar: 'bg-blue-500',
    dot: 'bg-blue-500',
    count: 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    ring: 'ring-blue-400/60 bg-blue-50/40',
  },
  contacted: {
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    count: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    ring: 'ring-amber-400/60 bg-amber-50/40',
  },
  negotiating: {
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
    count: 'bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    ring: 'ring-violet-400/60 bg-violet-50/40',
  },
  won: {
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    count: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    ring: 'ring-emerald-400/60 bg-emerald-50/40',
  },
  lost: {
    bar: 'bg-rose-400',
    dot: 'bg-rose-400',
    count: 'bg-rose-50 text-rose-700',
    ring: 'ring-rose-400/60 bg-rose-50/40',
  },
}

type PipelineLead = Pick<
  Lead,
  'id' | 'name' | 'company' | 'status' | 'source' | 'city' | 'rating' | 'phone' | 'category' | 'folderId' | 'createdAt' | 'email' | 'emailStatus'
>

interface Props {
  initialLeads: PipelineLead[]
  initialFolders: Folder[]
}

export function PipelineClient({ initialLeads, initialFolders }: Props) {
  const [leads, setLeads] = useState<PipelineLead[]>(initialLeads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [folder, setFolder] = useState<string>(FOLDER_ALL)
  const [includeSub, setIncludeSub] = useState(true)
  const [q, setQ] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null

  // Conteo por carpeta acumulando las subcarpetas, igual que en la vista de Leads.
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
    buildFolderTree(initialFolders).forEach(walk)
    return total
  }, [leads, initialFolders])

  const noneCount = useMemo(() => leads.filter((l) => !l.folderId).length, [leads])

  const visibleLeads = useMemo(() => {
    let scoped = leads
    if (folder === FOLDER_NONE) {
      scoped = leads.filter((l) => !l.folderId)
    } else if (folder !== FOLDER_ALL) {
      const scope = new Set<string>([folder])
      if (includeSub) {
        for (const id of getDescendantIds(folder, initialFolders)) scope.add(id)
      }
      scoped = leads.filter((l) => l.folderId && scope.has(l.folderId))
    }

    const needle = q.trim().toLowerCase()
    if (!needle) return scoped
    return scoped.filter((l) =>
      [l.name, l.company, l.city, l.phone, l.category]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    )
  }, [leads, folder, includeSub, q, initialFolders])

  // Una carpeta con subcarpetas es la única situación donde el conmutador aporta.
  const hasSubfolders =
    folder !== FOLDER_ALL &&
    folder !== FOLDER_NONE &&
    getDescendantIds(folder, initialFolders).length > 0

  const isFiltered = folder !== FOLDER_ALL || q.trim() !== ''

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const leadId = active.id as string
      // `over.id` can be a column status or another card's id
      let newStatus = over.id as string
      // If dropped on a card, find that card's column
      if (!PIPELINE_COLUMNS.includes(newStatus as LeadStatus)) {
        const overLead = leads.find((l) => l.id === newStatus)
        if (overLead) newStatus = overLead.status
        else return
      }

      const lead = leads.find((l) => l.id === leadId)
      if (!lead || lead.status === newStatus) return

      const previousStatus = lead.status
      // Actualización optimista: la tarjeta se mueve al soltarla y se revierte
      // si el servidor rechaza el cambio, para no mostrar un estado que no se guardó.
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus as LeadStatus } : l))
      )

      try {
        const res = await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        if (!res.ok) throw new Error('El servidor rechazó el cambio')
      } catch {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: previousStatus } : l))
        )
      }
    },
    [leads]
  )

  return (
    // h-screen + min-h-0 acotan el alto real disponible: sin esto las columnas
    // crecen con su contenido y el tablero desborda la página verticalmente.
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Pipeline</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Arrastra los leads entre columnas para cambiar su estado
            </p>
          </div>
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium tabular-nums text-gray-600 dark:text-gray-400">
            {isFiltered
              ? `${visibleLeads.length} de ${leads.length}`
              : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FolderPicker
            folders={initialFolders}
            value={folder}
            onChange={setFolder}
            counts={counts}
            allCount={leads.length}
            noneCount={noneCount}
          />

          {hasSubfolders && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-400">
              <input
                type="checkbox"
                checked={includeSub}
                onChange={(e) => setIncludeSub(e.target.checked)}
                className="cursor-pointer rounded border-gray-300 dark:border-gray-700"
              />
              Incluir subcarpetas
            </label>
          )}

          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el tablero…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 py-2 pl-9 pr-8 text-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setFolder(FOLDER_ALL)
                setQ('')
              }}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              Limpiar
            </button>
          )}
        </div>
      </header>

      <PipelineSummary leads={visibleLeads} />

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 py-5">
          <div className="flex h-full gap-4">
            {PIPELINE_COLUMNS.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                leads={visibleLeads.filter((l) => l.status === status)}
                isFiltered={isFiltered}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead && <KanbanCard lead={activeLead} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

/**
 * Resumen del embudo: cuánto pesa cada etapa y qué porcentaje llegó a cerrarse.
 *
 * La barra usa los mismos colores que las columnas, así se lee de un vistazo
 * dónde se está atascando el trabajo sin tener que contar tarjetas.
 */
function PipelineSummary({ leads }: { leads: PipelineLead[] }) {
  const total = leads.length
  if (total === 0) return null

  const byStatus = PIPELINE_COLUMNS.map((status) => ({
    status,
    count: leads.filter((l) => l.status === status).length,
  }))
  const won = leads.filter((l) => l.status === 'won').length
  const lost = leads.filter((l) => l.status === 'lost').length
  // Se mide sobre lo ya resuelto: los que siguen abiertos aún pueden cerrarse.
  const closed = won + lost
  const conversion = closed > 0 ? Math.round((won / closed) * 100) : null
  const problems = leads.filter(
    (l) => l.emailStatus === 'bounced' || l.emailStatus === 'complained',
  ).length

  return (
    <div className="shrink-0 border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold text-gray-900 tabular-nums dark:text-gray-100">
            {total}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {total === 1 ? 'lead' : 'leads'}
          </span>
        </div>

        {conversion !== null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
              {conversion}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              conversión ({won} de {closed} cerrados)
            </span>
          </div>
        )}

        {problems > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <MailWarning className="h-3.5 w-3.5" />
            {problems} con problemas de correo
          </span>
        )}

        {/* Distribución proporcional del embudo. */}
        <div className="ml-auto flex h-2 min-w-[12rem] flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          {byStatus.map(({ status, count }) =>
            count === 0 ? null : (
              <div
                key={status}
                className={COLUMN_ACCENT[status].bar}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${STATUS_LABELS[status]}: ${count}`}
              />
            ),
          )}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({
  status,
  leads,
  isFiltered,
}: {
  status: LeadStatus
  leads: PipelineLead[]
  isFiltered: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const accent = COLUMN_ACCENT[status]

  return (
    // flex + min-h-0: la cabecera queda fija y solo la lista de tarjetas scrollea.
    <section
      className={`flex h-full w-[19rem] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-gray-50/80 dark:bg-gray-900/60 transition-colors ${
        isOver ? `border-transparent ring-2 ${accent.ring}` : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className={`h-1 shrink-0 ${accent.bar}`} />

      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{STATUS_LABELS[status]}</h3>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${accent.count}`}
        >
          {leads.length}
        </span>
      </div>

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 [scrollbar-color:theme(colors.gray.300)_transparent] [scrollbar-width:thin]"
        >
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} />
          ))}
          {leads.length === 0 && (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 text-center text-xs text-gray-400">
              {isFiltered ? 'Sin resultados en este filtro' : 'Arrastra un lead aquí'}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

function KanbanCard({ lead, isDragging = false }: { lead: PipelineLead; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isThisDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', status: lead.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-sm transition-shadow ${
        isThisDragging ? 'opacity-40' : ''
      } ${isDragging ? 'rotate-2 shadow-xl ring-1 ring-blue-400/40' : 'hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="min-w-0 flex-1"
          onClick={(e) => isDragging && e.preventDefault()}
        >
          <p className="truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {lead.name}
          </p>
          {lead.company && (
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{lead.company}</p>
          )}
        </Link>
        <button
          type="button"
          aria-label="Reordenar lead"
          {...attributes}
          {...listeners}
          className="-mr-1 shrink-0 cursor-grab rounded p-0.5 text-gray-300 dark:text-gray-600 opacity-0 transition-opacity hover:text-gray-500 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Metadatos en una sola fila envolvente: mantiene la tarjeta compacta
          para que quepan más leads visibles por columna. */}
      {(lead.city || lead.phone || lead.rating != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {lead.city && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="truncate">{lead.city}</span>
            </span>
          )}
          {lead.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="tabular-nums">{lead.phone}</span>
            </span>
          )}
          {lead.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              <span className="tabular-nums">{lead.rating.toFixed(1)}</span>
            </span>
          )}
        </div>
      )}

      {/* Un correo rebotado o marcado como spam bloquea futuros envíos: se avisa
          en la propia tarjeta para no perder tiempo trabajando ese lead. */}
      {(lead.emailStatus === 'bounced' || lead.emailStatus === 'complained') && (
        <div
          className={`mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
            lead.emailStatus === 'complained'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          }`}
        >
          <MailWarning className="h-3 w-3 shrink-0" />
          {lead.emailStatus === 'complained' ? 'Marcado como spam' : 'Correo rebotado'}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-800 pt-2">
        <SourceBadge source={lead.source as LeadSource} />
        {lead.category && (
          <span className="truncate text-xs text-gray-400" title={lead.category}>
            {lead.category}
          </span>
        )}
      </div>
    </article>
  )
}
