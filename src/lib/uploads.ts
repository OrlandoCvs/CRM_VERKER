/**
 * Validación de los adjuntos de plantillas de correo.
 *
 * El binario ya NO se guarda en disco: vive en la base de datos (campo
 * `EmailAttachment.data`), porque el hosting serverless (Vercel) no tiene disco
 * persistente donde escribir. Este módulo solo centraliza los límites y tipos
 * permitidos; el guardado/lectura del binario lo hace Prisma directamente.
 */

/** Límite por archivo. Resend acepta ~40MB por correo entre todos los adjuntos. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB

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
