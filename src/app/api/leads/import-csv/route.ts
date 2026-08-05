import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { findDuplicateLead } from '@/lib/dedup'
import { IMPORTABLE_FIELDS, type ImportableFieldKey } from '@/lib/csv-mapping'

/**
 * POST /api/leads/import-csv
 * Importa contactos desde un CSV ya parseado en el cliente.
 *
 * Body: {
 *   rows: string[][],                       // filas de datos (sin cabecera)
 *   mapping: Record<fieldKey, columnIndex>, // qué columna alimenta cada campo
 *   folderId?: string | null                // carpeta destino (opcional)
 * }
 *
 * Reutiliza la deduplicación de leads: los contactos que ya existen (por
 * teléfono, web o nombre+ciudad) se cuentan como duplicados y no se recrean.
 */

interface ImportBody {
  rows?: string[][]
  mapping?: Partial<Record<ImportableFieldKey, number>>
  folderId?: string | null
}

/** Máximo de filas por petición: evita cargas gigantes y timeouts en serverless. */
const MAX_ROWS = 5000

export async function POST(req: NextRequest) {
  const { rows, mapping, folderId } = (await req.json().catch(() => ({}))) as ImportBody

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: 'No hay filas para importar' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return Response.json(
      { error: `El archivo tiene ${rows.length} filas; el máximo por importación es ${MAX_ROWS}.` },
      { status: 400 },
    )
  }
  if (!mapping || mapping.name === undefined) {
    return Response.json(
      { error: 'Debes asignar al menos la columna de Nombre' },
      { status: 400 },
    )
  }

  // Si se indicó carpeta, verifica que exista (evita violar la FK).
  let targetFolderId: string | null = null
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
    targetFolderId = folder?.id ?? null
  }

  const fieldKeys = IMPORTABLE_FIELDS.map((f) => f.key)

  /** Extrae el valor de una celda para un campo, o null si no está mapeado/vacío. */
  function cell(row: string[], key: ImportableFieldKey): string | null {
    const idx = mapping![key]
    if (idx === undefined) return null
    const value = row[idx]?.trim()
    return value ? value : null
  }

  let created = 0
  let duplicates = 0
  let skipped = 0 // filas sin nombre (no se pueden importar)
  let errors = 0

  // Inserción secuencial: la dedup consulta la base y con miles de filas conviene
  // no dispararlas todas en paralelo (saturaría el pool de conexiones).
  for (const row of rows) {
    const name = cell(row, 'name')
    if (!name) {
      skipped++
      continue
    }

    const data: Record<string, string | null> = {}
    for (const key of fieldKeys) {
      if (key === 'name') continue
      data[key] = cell(row, key)
    }

    try {
      const duplicateId = await findDuplicateLead({
        name,
        phone: data.phone,
        website: data.website,
        city: data.city,
      })
      if (duplicateId) {
        duplicates++
        continue
      }

      await prisma.lead.create({
        data: {
          name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          website: data.website,
          address: data.address,
          city: data.city,
          country: data.country,
          category: data.category,
          notes: data.notes,
          source: 'import',
          status: 'new',
          folderId: targetFolderId,
        },
      })
      created++
    } catch {
      errors++
    }
  }

  return Response.json({ created, duplicates, skipped, errors, total: rows.length })
}
