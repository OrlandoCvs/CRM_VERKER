import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { findDuplicateLead } from '@/lib/dedup'
import { IMPORTABLE_FIELDS, type ImportableFieldKey } from '@/lib/csv-mapping'

/**
 * POST /api/leads/import-csv
 * Importa un LOTE de contactos desde un CSV parseado en el cliente.
 *
 * El cliente trocea el archivo y envía tandas (p. ej. 100 filas) para mostrar
 * progreso y no exceder el tiempo máximo de una función serverless. Cada llamada
 * procesa un lote y devuelve el detalle (creados, duplicados, y errores por fila
 * con su motivo, para que el usuario pueda corregir y reimportar).
 *
 * Body: {
 *   rows: string[][],                       // filas del lote (sin cabecera)
 *   mapping: Record<fieldKey, columnIndex>, // qué columna alimenta cada campo
 *   folderId?: string | null,               // carpeta destino (opcional)
 *   rowOffset?: number                       // índice de la 1ª fila del lote en el
 *                                            // archivo completo (para reportar bien)
 * }
 */

interface ImportBody {
  rows?: string[][]
  mapping?: Partial<Record<ImportableFieldKey, number>>
  folderId?: string | null
  rowOffset?: number
}

interface RowError {
  row: number // número de fila en el archivo (1 = primera fila de datos)
  name: string
  reason: string
}

/** Máximo de filas por lote: acotado para no acercarse al límite de tiempo. */
const MAX_BATCH = 200

/** Validación laxa de email: solo descarta lo evidentemente mal formado. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(req: NextRequest) {
  const { rows, mapping, folderId, rowOffset = 0 } =
    (await req.json().catch(() => ({}))) as ImportBody

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: 'No hay filas para importar' }, { status: 400 })
  }
  if (rows.length > MAX_BATCH) {
    return Response.json(
      { error: `Lote demasiado grande (${rows.length}). Máximo ${MAX_BATCH} por petición.` },
      { status: 400 },
    )
  }
  if (!mapping || mapping.name === undefined) {
    return Response.json({ error: 'Debes asignar al menos la columna de Nombre' }, { status: 400 })
  }

  // Verifica la carpeta destino una sola vez por lote (evita violar la FK).
  let targetFolderId: string | null = null
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
    targetFolderId = folder?.id ?? null
  }

  const fieldKeys = IMPORTABLE_FIELDS.map((f) => f.key)

  function cell(row: string[], key: ImportableFieldKey): string | null {
    const idx = mapping![key]
    if (idx === undefined) return null
    const value = row[idx]?.trim()
    return value ? value : null
  }

  let created = 0
  let duplicates = 0
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const fileRow = rowOffset + i + 1 // 1-indexado respecto al archivo completo
    const name = cell(row, 'name')

    if (!name) {
      errors.push({ row: fileRow, name: '(sin nombre)', reason: 'Falta el nombre' })
      continue
    }

    const data: Record<string, string | null> = {}
    for (const key of fieldKeys) {
      if (key === 'name') continue
      data[key] = cell(row, key)
    }

    // Email con formato claramente inválido: se descarta el valor pero NO la fila
    // (el contacto se importa igual, solo sin email, y se avisa).
    let emailWarning = false
    if (data.email && !looksLikeEmail(data.email)) {
      data.email = null
      emailWarning = true
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
      if (emailWarning) {
        errors.push({ row: fileRow, name, reason: 'Email inválido (se importó sin email)' })
      }
    } catch {
      errors.push({ row: fileRow, name, reason: 'Error al guardar en la base' })
    }
  }

  return Response.json({ created, duplicates, errors })
}
