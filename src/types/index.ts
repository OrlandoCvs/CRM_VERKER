export type LeadStatus = 'new' | 'contacted' | 'negotiating' | 'won' | 'lost'
export type LeadSource = 'google_places' | 'manual' | 'import'
export type ActivityType = 'call' | 'email' | 'meeting' | 'note'

export interface Lead {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  category?: string | null
  rating?: number | null
  reviewCount?: number | null
  source: LeadSource
  sourceQuery?: string | null
  placeId?: string | null
  status: LeadStatus
  notes?: string | null
  tags?: string | null
  // Location
  lat?: number | null
  lng?: number | null
  // Extended place data
  imageUrl?: string | null
  description?: string | null
  price?: string | null
  permanentlyClosed?: boolean | null
  temporarilyClosed?: boolean | null
  // Social media
  instagram?: string | null
  facebook?: string | null
  linkedin?: string | null
  youtube?: string | null
  tiktok?: string | null
  twitter?: string | null
  pinterest?: string | null
  // JSON strings
  openingHours?: string | null
  webResults?: string | null
  // Folder organization
  folderId?: string | null
  createdAt: string
  updatedAt: string
  activities?: Activity[]
  contacts?: Contact[]
}

export interface Folder {
  id: string
  name: string
  color?: string | null
  parentId?: string | null
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  leadId: string
  name: string
  email?: string | null
  phone?: string | null
  role?: string | null
  createdAt: string
}

export interface Activity {
  id: string
  leadId: string
  type: ActivityType
  note: string
  createdAt: string
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  negotiating: 'Negociando',
  won: 'Ganado',
  lost: 'Perdido',
}

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  negotiating: 'bg-purple-100 text-purple-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
}

export const SOURCE_LABELS: Record<LeadSource, string> = {
  google_places: 'Google Places',
  manual: 'Manual',
  import: 'Importado',
}

export const PIPELINE_COLUMNS: LeadStatus[] = [
  'new',
  'contacted',
  'negotiating',
  'won',
  'lost',
]

// Color palette for folders (hex values used for the folder icon tint)
export const FOLDER_COLORS = [
  '#64748b', // slate
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
] as const

export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0]
