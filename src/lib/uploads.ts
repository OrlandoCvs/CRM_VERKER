/**
 * Validación de los adjuntos de plantillas de correo.
 *
 * El binario ya NO se guarda en disco: vive en la base de datos (campo
 * `EmailAttachment.data`), porque el hosting serverless (Vercel) no tiene disco
 * persistente donde escribir. Este módulo solo centraliza los límites y tipos
 * permitidos; el guardado/lectura del binario lo hace Prisma directamente.
 */

/**
 * Límite por archivo.
 *
 * Lo impone Vercel, no nosotros: rechaza toda petición de más de 4.5 MB con un
 * 413 antes de que llegue a este código, así que anunciar un límite mayor solo
 * produciría errores incomprensibles. Se deja algo por debajo para dar margen a
 * las cabeceras y al resto del formulario.
 *
 * Las fotos no se ven afectadas en la práctica: el navegador las comprime antes
 * de subirlas (ver `lib/image-compress.ts`), y una foto de móvil acaba pesando
 * unos cientos de KB.
 *
 * https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024 // 4 MB

/** Tipos permitidos: documentos e imágenes habituales en material comercial. */
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  // Mapas de Google Earth: planos de terrenos y ubicación de desarrollos.
  'application/vnd.google-earth.kmz',
  'application/vnd.google-earth.kml+xml',
])

/**
 * Tipo correcto según la extensión.
 *
 * Hace falta porque el navegador no siempre sabe qué es un archivo: para un
 * `.kmz` suele mandar el tipo vacío o `application/octet-stream`, así que
 * validar solo por lo que dice el navegador lo rechazaría. Registrar el tipo
 * canónico —en vez del que llegue— también evita guardar un `text/html` que
 * luego se sirviera como página.
 */
const EXTENSION_MIME: Record<string, string> = {
  kmz: 'application/vnd.google-earth.kmz',
  kml: 'application/vnd.google-earth.kml+xml',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
}

/** Tipos que el navegador manda cuando en realidad no sabe qué archivo es. */
const GENERIC_TYPES = new Set([
  '',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
])

/**
 * Decide con qué tipo se guarda un archivo, o `null` si no está permitido.
 *
 * Se prefiere siempre el tipo deducido de la extensión: es el que de verdad
 * corresponde al contenido y no depende de cómo esté configurado el equipo de
 * quien sube el archivo.
 */
export function resolveMimeType(filename: string, reportedType: string): string | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const byExtension = EXTENSION_MIME[ext]

  if (byExtension) return byExtension
  // Sin extensión reconocida solo se acepta si el navegador afirma un tipo
  // concreto de la lista; los genéricos no dicen nada sobre el contenido.
  if (!GENERIC_TYPES.has(reportedType) && ALLOWED_MIME_TYPES.has(reportedType)) {
    return reportedType
  }
  return null
}

/** Extensiones que se ofrecen en el selector de archivos del navegador. */
export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_MIME)
  .map((e) => `.${e}`)
  .join(',')
