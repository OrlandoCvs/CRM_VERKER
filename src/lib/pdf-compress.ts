/**
 * Compresión de PDF en el navegador.
 *
 * Un PDF pesado lo es casi siempre por las imágenes que lleva incrustadas, y
 * esas ya vienen comprimidas: no se pueden "apretar" más sin reconstruirlas.
 * Por eso aquí se rasteriza —cada página se dibuja en un lienzo y se guarda
 * como JPEG— y se arma un PDF nuevo con esas páginas.
 *
 * La contrapartida es que el texto deja de poder seleccionarse y pierde algo de
 * nitidez, así que solo se recurre a esto cuando el archivo original no se
 * puede enviar tal cual. Un catálogo con fotos suele bajar un 70-90%; un
 * documento de solo texto apenas mejora, y en ese caso se devuelve el original.
 *
 * Las librerías se cargan con `import()` dinámico: pesan bastante y no deben
 * entrar en el paquete inicial de la aplicación.
 */

/** Pasadas sucesivas: si con la primera no basta, se baja calidad y resolución. */
const ATTEMPTS = [
  { scale: 1.6, quality: 0.75 }, // ≈115 DPI, texto cómodo de leer
  { scale: 1.2, quality: 0.65 }, // ≈86 DPI
  { scale: 0.9, quality: 0.55 }, // último recurso antes de rendirse
]

/** Más allá de esto la rasterización tarda demasiado en el navegador. */
const MAX_PAGES = 60

export interface PdfCompressionResult {
  file: File
  /** `false` cuando no se pudo mejorar y se devuelve el archivo original. */
  compressed: boolean
  /** Motivo por el que no se comprimió, para poder explicárselo al usuario. */
  reason?: string
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf'
}

/**
 * Devuelve una versión más ligera del PDF, o el original si no se consigue
 * bajar del tamaño objetivo sin destrozarlo.
 */
export async function compressPdf(
  file: File,
  targetBytes: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfCompressionResult> {
  if (!isPdf(file)) return { file, compressed: false, reason: 'No es un PDF' }

  try {
    const pdfjs = await import('pdfjs-dist')
    // El worker vive en un archivo aparte; sin esto pdf.js no arranca.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()

    const bytes = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise

    if (doc.numPages > MAX_PAGES) {
      return {
        file,
        compressed: false,
        reason: `El PDF tiene ${doc.numPages} páginas; solo se pueden comprimir hasta ${MAX_PAGES}`,
      }
    }

    const { PDFDocument } = await import('pdf-lib')

    for (const { scale, quality } of ATTEMPTS) {
      const out = await PDFDocument.create()

      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return { file, compressed: false, reason: 'El navegador no pudo dibujar el PDF' }

        // Fondo blanco: sin esto las zonas sin pintar saldrían negras en JPEG.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: ctx, viewport }).promise

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        )
        if (!blob) return { file, compressed: false, reason: 'No se pudo convertir una página' }

        const jpg = await out.embedJpg(await blob.arrayBuffer())
        // La página conserva las proporciones originales, no las del lienzo.
        const size = page.getViewport({ scale: 1 })
        const added = out.addPage([size.width, size.height])
        added.drawImage(jpg, { x: 0, y: 0, width: size.width, height: size.height })

        onProgress?.(n, doc.numPages)
      }

      const result = await out.save()
      // `slice()` desprende el búfer del array de Prisma/pdf-lib: sin esto el
      // Blob podría apuntar a memoria que se reutiliza.
      const blob = new Blob([result.slice()], { type: 'application/pdf' })

      if (blob.size <= targetBytes) {
        const name = file.name.replace(/\.pdf$/i, '') + '-comprimido.pdf'
        return {
          file: new File([blob], name, { type: 'application/pdf', lastModified: Date.now() }),
          compressed: true,
        }
      }
    }

    return {
      file,
      compressed: false,
      reason: 'Ni con la calidad más baja se consigue bajar del límite',
    }
  } catch {
    return { file, compressed: false, reason: 'No se pudo leer el PDF' }
  }
}
