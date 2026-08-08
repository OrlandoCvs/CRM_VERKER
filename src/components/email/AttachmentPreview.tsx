'use client'

import { useState } from 'react'
import { FileText, Image as ImageIcon, Map, Paperclip, Download, ExternalLink, ChevronDown } from 'lucide-react'

/**
 * Lista de adjuntos con vista previa incrustada.
 *
 * Los archivos se guardan en Postgres y se sirven desde
 * `/api/email/attachments/[id]`. Los PDF e imágenes se pueden ver aquí mismo,
 * para confirmar que se adjuntó el documento correcto antes de enviar el correo;
 * el resto solo se descarga, porque el navegador no sabe mostrarlos.
 */

export interface PreviewableAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

interface Props {
  attachments: PreviewableAttachment[]
  /** Título de la sección; se oculta si es null. */
  label?: string | null
}

/** Formatea bytes a una unidad legible (KB / MB). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/** Mapas de Google Earth: no se pueden previsualizar, pero sí distinguir. */
function isMap(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-earth')
}

export function AttachmentPreview({ attachments, label = 'Adjuntos' }: Props) {
  // Adjunto desplegado (solo uno a la vez, para no cargar varios PDF pesados).
  const [openId, setOpenId] = useState<string | null>(null)

  if (attachments.length === 0) return null

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          {label} ({attachments.length})
        </p>
      )}

      <div className="space-y-1.5">
        {attachments.map((a) => {
          const viewable = isPdf(a.mimeType) || isImage(a.mimeType)
          const open = openId === a.id
          const Icon = isImage(a.mimeType) ? ImageIcon : isMap(a.mimeType) ? Map : FileText

          return (
            <div key={a.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 truncate">{a.filename}</span>
                <span className="text-xs text-gray-400 shrink-0">{formatSize(a.size)}</span>

                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {viewable && (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : a.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-1.5 py-1 rounded"
                    >
                      {open ? 'Ocultar' : 'Ver'}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  <a
                    href={`/api/email/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir en otra pestaña"
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`/api/email/attachments/${a.id}?download=1`}
                    title="Descargar"
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {open && viewable && (
                <div className="border-t border-gray-200 bg-gray-100">
                  {isPdf(a.mimeType) ? (
                    <object
                      data={`/api/email/attachments/${a.id}#toolbar=0&navpanes=0`}
                      type="application/pdf"
                      className="w-full h-[420px]"
                      aria-label={`Vista previa de ${a.filename}`}
                    >
                      {/* Algunos navegadores (sobre todo en móvil) no incrustan PDF. */}
                      <div className="p-4 text-center text-sm text-gray-500">
                        Tu navegador no puede mostrar el PDF aquí.{' '}
                        <a
                          href={`/api/email/attachments/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 underline"
                        >
                          Ábrelo en otra pestaña
                        </a>
                        .
                      </div>
                    </object>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/email/attachments/${a.id}`}
                      alt={a.filename}
                      className="max-h-[420px] w-auto mx-auto"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
