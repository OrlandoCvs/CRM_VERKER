/**
 * Parser de CSV para importar contactos.
 *
 * Escrito a mano (sin dependencias) porque el formato que necesitamos es acotado
 * pero hay que respetar el estándar RFC 4180: campos entrecomillados que pueden
 * contener comas, saltos de línea y comillas dobladas (`""`). También tolera el
 * BOM de Excel y saltos de línea `\r\n` o `\n`, y detecta `,` o `;` como separador.
 */

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** Detecta el separador más probable mirando la primera línea (coma vs punto y coma). */
function detectDelimiter(firstLine: string): ',' | ';' {
  const commas = (firstLine.match(/,/g) ?? []).length
  const semicolons = (firstLine.match(/;/g) ?? []).length
  return semicolons > commas ? ';' : ','
}

/**
 * Convierte el texto de un CSV en cabeceras + filas. Cada fila es un array de
 * celdas alineado con `headers`. Filas totalmente vacías se descartan.
 */
export function parseCsv(text: string): ParsedCsv {
  // Quita el BOM inicial que Excel suele anteponer en UTF-8.
  const input = text.replace(/^﻿/, '')
  if (input.trim() === '') return { headers: [], rows: [] }

  // Delimitador a partir de la primera línea física.
  const firstLineEnd = input.search(/\r?\n/)
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd)
  const delimiter = detectDelimiter(firstLine)

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        // Comilla doblada dentro de campo entrecomillado => comilla literal.
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // Cierra la celda y el registro. Consume el \n de un par \r\n.
      if (char === '\r' && input[i + 1] === '\n') i++
      record.push(field)
      field = ''
      records.push(record)
      record = []
    } else {
      field += char
    }
  }
  // Último campo/registro si el archivo no termina en salto de línea.
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  // Descarta registros completamente vacíos (líneas en blanco).
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((h) => h.trim())
  const rows = nonEmpty.slice(1)
  return { headers, rows }
}
