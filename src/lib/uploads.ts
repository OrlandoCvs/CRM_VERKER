import { randomUUID } from 'crypto'
import { mkdir, writeFile, readFile, unlink } from 'fs/promises'
import path from 'path'

/**
 * Almacenamiento en disco de los adjuntos de plantillas.
 *
 * Los binarios viven en `uploads/` (fuera de git); en la base solo guardamos su
 * metadato. Al desplegar en un entorno sin disco persistente (p. ej. Vercel)
 * habrá que migrar a un bucket, pero la interfaz de este módulo lo aísla.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

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

/**
 * Guarda un archivo con un nombre único (para evitar colisiones y no exponer el
 * nombre original en disco) y devuelve ese nombre almacenado.
 */
export async function storeUpload(bytes: Buffer, originalName: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true })
  // Conserva la extensión original para que el sistema operativo lo reconozca.
  const ext = path.extname(originalName).slice(0, 12)
  const storedName = `${randomUUID()}${ext}`
  await writeFile(path.join(UPLOADS_DIR, storedName), bytes)
  return storedName
}

/** Lee el binario de un adjunto ya guardado. */
export function readUpload(storedName: string): Promise<Buffer> {
  return readFile(safePath(storedName))
}

/** Borra el binario. No falla si el archivo ya no existe. */
export async function deleteUpload(storedName: string): Promise<void> {
  await unlink(safePath(storedName)).catch(() => {})
}

/**
 * Resuelve la ruta absoluta de un `storedName` verificando que no escape de
 * `uploads/` (defensa ante path traversal si el nombre llegara manipulado).
 */
function safePath(storedName: string): string {
  const resolved = path.join(UPLOADS_DIR, path.basename(storedName))
  if (path.dirname(resolved) !== UPLOADS_DIR) {
    throw new Error('Ruta de adjunto inválida')
  }
  return resolved
}
