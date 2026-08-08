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
])
