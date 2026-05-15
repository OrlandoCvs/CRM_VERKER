'use client'

import { useState, useCallback } from 'react'
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
import { Star, Phone, MapPin, GripVertical } from 'lucide-react'
import { SourceBadge } from '@/components/ui/Badge'
import { Lead, LeadStatus, LeadSource, STATUS_LABELS, PIPELINE_COLUMNS } from '@/types'

const COLUMN_COLORS: Record<LeadStatus, string> = {
  new: 'border-blue-300 bg-blue-50',
  contacted: 'border-yellow-300 bg-yellow-50',
  negotiating: 'border-purple-300 bg-purple-50',
  won: 'border-green-300 bg-green-50',
  lost: 'border-red-300 bg-red-50',
}

const COLUMN_HEADER: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  negotiating: 'bg-purple-100 text-purple-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
}

type PipelineLead = Pick<Lead, 'id' | 'name' | 'company' | 'status' | 'source' | 'city' | 'rating' | 'phone' | 'category' | 'createdAt'>

interface Props {
  initialLeads: PipelineLead[]
}

export function PipelineClient({ initialLeads }: Props) {
  const [leads, setLeads] = useState<PipelineLead[]>(initialLeads)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null

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

      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus as LeadStatus } : l))
      )

      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    },
    [leads]
  )

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Pipeline</h2>
        <p className="text-gray-500 text-sm mt-0.5">Arrastra los leads entre columnas para cambiar su estado</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {PIPELINE_COLUMNS.map((status) => {
            const colLeads = leads.filter((l) => l.status === status)
            return (
              <KanbanColumn
                key={status}
                status={status}
                leads={colLeads}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeLead && <KanbanCard lead={activeLead} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function KanbanColumn({ status, leads }: { status: LeadStatus; leads: PipelineLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-xl border-2 transition-colors ${COLUMN_COLORS[status]} ${
        isOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''
      }`}
    >
      <div className="px-4 py-3 border-b border-white/50">
        <div className="flex items-center justify-between">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${COLUMN_HEADER[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs font-bold text-gray-500 bg-white rounded-full w-6 h-6 flex items-center justify-center">
            {leads.length}
          </span>
        </div>
      </div>

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="p-3 space-y-2 min-h-[200px]">
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} />
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-xs text-gray-400">
              Arrastra un lead aquí
            </div>
          )}
        </div>
      </SortableContext>
    </div>
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
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm p-3 transition-all ${
        isThisDragging ? 'opacity-30' : ''
      } ${isDragging ? 'shadow-xl rotate-1 opacity-95' : 'hover:shadow-md'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="flex-1 min-w-0 hover:text-blue-600"
          onClick={(e) => isDragging && e.preventDefault()}
        >
          <p className="text-sm font-medium text-gray-900 truncate leading-tight">{lead.name}</p>
          {lead.company && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{lead.company}</p>
          )}
        </Link>
        <div
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 mt-0.5"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {lead.city && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin className="w-3 h-3" />
            {lead.city}
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Phone className="w-3 h-3" />
            {lead.phone}
          </div>
        )}
        {lead.rating != null && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            {lead.rating.toFixed(1)}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <SourceBadge source={lead.source as LeadSource} />
        {lead.category && (
          <span className="text-xs text-gray-400 truncate max-w-[90px]">{lead.category}</span>
        )}
      </div>
    </div>
  )
}
