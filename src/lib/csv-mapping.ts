/**
 * Mapeo de columnas de un CSV a los campos de un lead.
 *
 * Cada cliente exporta sus listas con nombres de columna distintos
 * ("Correo", "Email", "e-mail"...). Aquí definimos los campos que aceptamos y
 * un conjunto de alias para adivinar el mapeo automáticamente; el usuario luego
 * puede corregirlo en la UI.
 */

/** Campos de lead que se pueden rellenar desde un CSV. `name` es el único obligatorio. */
export const IMPORTABLE_FIELDS = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'company', label: 'Empresa', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'website', label: 'Sitio web', required: false },
  { key: 'address', label: 'Dirección', required: false },
  { key: 'city', label: 'Ciudad', required: false },
  { key: 'country', label: 'País', required: false },
  { key: 'category', label: 'Categoría', required: false },
  { key: 'notes', label: 'Notas', required: false },
] as const

export type ImportableFieldKey = (typeof IMPORTABLE_FIELDS)[number]['key']

/** Alias (normalizados) por campo: nombres de columna que se mapean a cada uno. */
const ALIASES: Record<ImportableFieldKey, string[]> = {
  name: ['nombre', 'name', 'nombrecompleto', 'fullname', 'contacto', 'contact', 'razonsocial', 'negocio', 'business'],
  company: ['empresa', 'company', 'compania', 'organizacion', 'organization', 'negocio'],
  email: ['email', 'correo', 'e-mail', 'mail', 'correoelectronico', 'emailaddress'],
  phone: ['telefono', 'phone', 'tel', 'celular', 'movil', 'mobile', 'whatsapp', 'numero', 'telephone'],
  website: ['sitioweb', 'website', 'web', 'sitio', 'url', 'pagina', 'paginaweb'],
  address: ['direccion', 'address', 'domicilio', 'calle', 'ubicacion'],
  city: ['ciudad', 'city', 'localidad', 'municipio', 'poblacion'],
  country: ['pais', 'country', 'nacion'],
  category: ['categoria', 'category', 'rubro', 'giro', 'sector', 'tipo'],
  notes: ['notas', 'notes', 'comentarios', 'observaciones', 'nota', 'comment', 'comments'],
}

/** Normaliza un encabezado para comparar: minúsculas, sin acentos, sin espacios/símbolos. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Dado los encabezados del CSV, propone un mapeo campo -> índice de columna.
 * Devuelve un objeto parcial (solo los campos que encontró). El usuario lo
 * confirma/ajusta después.
 */
export function guessMapping(headers: string[]): Partial<Record<ImportableFieldKey, number>> {
  const normalized = headers.map(normalizeHeader)
  const mapping: Partial<Record<ImportableFieldKey, number>> = {}
  const usedColumns = new Set<number>()

  for (const field of IMPORTABLE_FIELDS) {
    const aliases = ALIASES[field.key]
    // Coincidencia exacta primero; luego "contiene" para nombres compuestos.
    let col = normalized.findIndex((h, i) => !usedColumns.has(i) && aliases.includes(h))
    if (col === -1) {
      col = normalized.findIndex(
        (h, i) => !usedColumns.has(i) && aliases.some((a) => h.includes(a)),
      )
    }
    if (col !== -1) {
      mapping[field.key] = col
      usedColumns.add(col)
    }
  }

  return mapping
}
