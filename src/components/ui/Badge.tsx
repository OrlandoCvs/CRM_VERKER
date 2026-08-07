'use client'

import { LeadStatus, LeadSource, STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS } from '@/types'

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function SourceBadge({ source }: { source: LeadSource }) {
  const colors: Record<LeadSource, string> = {
    google_places: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
    manual: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    import: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  )
}
