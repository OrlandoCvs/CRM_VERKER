import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import { getDescendantIds } from '@/lib/folders'
import { STATUS_LABELS, SOURCE_LABELS, LeadStatus, LeadSource } from '@/types'

/**
 * GET /api/leads/export?folder=<id|all|none>&sub=<0|1>
 * Devuelve los leads como archivo CSV, respetando el filtro de carpeta para
 * exportar exactamente lo que el usuario está viendo.
 */

/** Escapa un valor para CSV: comillas dobladas y entrecomillado si hace falta. */
function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  // Entrecomilla si contiene coma, comillas o saltos de línea.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const COLUMNS: { header: string; key: string }[] = [
  { header: 'Nombre', key: 'name' },
  { header: 'Empresa', key: 'company' },
  { header: 'Email', key: 'email' },
  { header: 'Teléfono', key: 'phone' },
  { header: 'Sitio web', key: 'website' },
  { header: 'Dirección', key: 'address' },
  { header: 'Ciudad', key: 'city' },
  { header: 'País', key: 'country' },
  { header: 'Categoría', key: 'category' },
  { header: 'Rating', key: 'rating' },
  { header: 'Reseñas', key: 'reviewCount' },
  { header: 'Estado', key: 'status' },
  { header: 'Fuente', key: 'source' },
  { header: 'Estado email', key: 'emailStatus' },
  { header: 'Fecha alta', key: 'createdAt' },
]

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const folder = searchParams.get('folder') ?? 'all'
  const includeSub = searchParams.get('sub') !== '0'

  // Construye el filtro de carpeta equivalente al de la vista de Leads.
  let where: Record<string, unknown> = {}
  if (folder === 'none') {
    where = { folderId: null }
  } else if (folder !== 'all') {
    const allFolders = await prisma.folder.findMany({ select: { id: true, parentId: true } })
    const ids = new Set<string>([folder])
    if (includeSub) {
      for (const id of getDescendantIds(folder, allFolders)) ids.add(id)
    }
    where = { folderId: { in: [...ids] } }
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  const rows: string[] = []
  rows.push(COLUMNS.map((c) => csvCell(c.header)).join(','))

  for (const lead of leads) {
    const record = lead as unknown as Record<string, unknown>
    const cells = COLUMNS.map((c) => {
      let value = record[c.key]
      // Traduce estados y fuentes a su etiqueta legible.
      if (c.key === 'status') value = STATUS_LABELS[value as LeadStatus] ?? value
      if (c.key === 'source') value = SOURCE_LABELS[value as LeadSource] ?? value
      if (c.key === 'createdAt' && value instanceof Date) {
        value = value.toISOString().slice(0, 10)
      }
      return csvCell(value)
    })
    rows.push(cells.join(','))
  }

  // BOM inicial para que Excel abra los acentos correctamente en UTF-8.
  const csv = '﻿' + rows.join('\r\n')
  const date = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-verker-${date}.csv"`,
    },
  })
}
