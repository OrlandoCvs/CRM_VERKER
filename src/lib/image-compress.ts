/**
 * Compresión de imágenes en el navegador, antes de subirlas.
 *
 * Hace falta por dos motivos:
 *
 * 1. Vercel rechaza cualquier petición de más de 4.5 MB antes de que llegue al
 *    servidor, así que una foto de móvil (8-12 MB) sería imposible de adjuntar.
 * 2. Aunque cupiera, un correo con fotos a resolución completa pesa de más:
 *    tarda en descargarse y empeora la reputación de envío.
 *
 * Una foto de 8 MB queda en torno a 400 KB sin pérdida apreciable al verla en
 * un correo. Los PDF y documentos no se tocan: no se pueden recomprimir aquí.
 */

/** Lado mayor al que se reduce la imagen. De sobra para verla en un correo. */
const MAX_DIMENSION = 1600

/** Calidad JPEG. 0.82 es el punto donde el recorte de peso deja de notarse. */
const JPEG_QUALITY = 0.82

/** Por debajo de este tamaño no merece la pena recomprimir. */
const SKIP_BELOW_BYTES = 400 * 1024

export function isCompressibleImage(file: File): boolean {
  // El PNG se convierte a JPEG salvo que pueda tener transparencia útil; se
  // incluye igualmente porque la mayoría de capturas y fotos no la usan.
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}

/**
 * Devuelve una versión reducida de la imagen, o el archivo original si no es
 * una imagen, si ya es pequeña, o si el navegador no puede procesarla.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isCompressibleImage(file) || file.size <= SKIP_BELOW_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)

    // Solo se reduce si excede el lado máximo; nunca se amplía.
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    // Fondo blanco: al pasar a JPEG, las zonas transparentes saldrían negras.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file

    // Si comprimir no mejora nada (imagen ya optimizada), se deja la original.
    if (blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    // Formato que el navegador no sabe decodificar: se sube tal cual y que
    // decida el servidor.
    return file
  }
}

/** Formatea bytes para mensajes al usuario. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
