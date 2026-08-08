'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Mail, Plus, Edit, Trash2, X, Loader2, AlertTriangle, Check, FileText,
  Paperclip, Upload, File as FileIcon, Search, Copy, Eye,
} from 'lucide-react'
import { RichTextEditor, ensureHtml } from '@/components/email/RichTextEditor'
import { AttachmentPreview } from '@/components/email/AttachmentPreview'
import { compressImage, formatBytes } from '@/lib/image-compress'
import { compressPdf, isPdf } from '@/lib/pdf-compress'
import { MAX_ATTACHMENT_BYTES } from '@/lib/uploads'

const VARIABLES = [
  { key: 'name', label: 'Nombre' },
  { key: 'company', label: 'Empresa' },
  { key: 'city', label: 'Ciudad' },
  { key: 'country', label: 'País' },
  { key: 'category', label: 'Categoría' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Sitio web' },
  { key: 'address', label: 'Dirección' },
]

export interface TemplateAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
  attachments?: TemplateAttachment[]
}

/** Formatea bytes a una unidad legible (KB / MB). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface EmailStatus {
  configured: boolean
  provider: 'resend' | 'smtp' | null
  from: string | null
}

interface Props {
  initialTemplates: EmailTemplate[]
  status: EmailStatus
}

/** Quita las etiquetas HTML para mostrar un resumen legible en la tarjeta. */
function toSnippet(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function TemplatesClient({ initialTemplates, status }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<EmailTemplate | 'new' | null>(null)
  const [preview, setPreview] = useState<EmailTemplate | null>(null)
  const [query, setQuery] = useState('')
  const [duplicating, setDuplicating] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        toSnippet(t.body).toLowerCase().includes(q),
    )
  }, [templates, query])

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await fetch(`/api/email/templates/${id}`, { method: 'DELETE' })
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  /** Crea una copia de la plantilla para partir de ella sin tocar la original. */
  async function handleDuplicate(t: EmailTemplate) {
    setDuplicating(t.id)
    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${t.name} (copia)`, subject: t.subject, body: t.body }),
      })
      if (!res.ok) return
      const created = await res.json()
      setTemplates((prev) => [created, ...prev])
    } finally {
      setDuplicating(null)
    }
  }

  function handleSaved(tpl: EmailTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === tpl.id)
      return exists ? prev.map((t) => (t.id === tpl.id ? tpl : t)) : [tpl, ...prev]
    })
    setEditing(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Plantillas de Correo</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Crea plantillas reutilizables para tus campañas. Usa variables como{' '}
            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{'{{name}}'}</code>{' '}
            que se reemplazan con los datos de cada lead.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      {!status.configured && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Email aún no configurado</p>
            <p className="text-xs mt-0.5">
              Puedes crear plantillas, pero para <strong>enviar</strong> necesitas configurar{' '}
              <code className="font-mono">EMAIL_FROM</code> y un proveedor (SMTP o Resend) en{' '}
              <code className="font-mono">.env.local</code>.
            </p>
          </div>
        </div>
      )}
      {status.configured && (
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          Envío configurado: <span className="font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300">{status.from}</span> vía{' '}
          {status.provider?.toUpperCase()}
        </p>
      )}

      {templates.length > 3 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plantilla…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
      )}

      {templates.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 py-16 text-center">
          <FileText className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no tienes plantillas</p>
          <button
            onClick={() => setEditing('new')}
            className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Crear la primera →
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          Ninguna plantilla coincide con «{query}».
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-2 hover:shadow-md dark:hover:border-gray-700 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{t.name}</h3>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setPreview(t)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                    aria-label="Previsualizar"
                    title="Previsualizar"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(t)}
                    disabled={duplicating === t.id}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                    aria-label="Duplicar"
                    title="Duplicar"
                  >
                    {duplicating === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setEditing(t)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded transition-colors"
                    aria-label="Editar"
                    title="Editar"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15 rounded transition-colors"
                    aria-label="Eliminar"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{t.subject}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{toSnippet(t.body)}</p>
              {t.attachments && t.attachments.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                  <Paperclip className="h-3.5 w-3.5" />
                  {t.attachments.length}{' '}
                  {t.attachments.length === 1 ? 'adjunto' : 'adjuntos'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateFormModal
          template={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {preview && <TemplatePreviewModal template={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** Datos de ejemplo para ver la plantilla ya resuelta, sin depender de un lead real. */
const SAMPLE_LEAD: Record<string, string> = {
  name: 'Inmobiliaria Sol Naciente',
  company: 'Sol Naciente SA de CV',
  city: 'Monterrey',
  country: 'México',
  category: 'Inmobiliaria',
  phone: '81 1234 5678',
  email: 'contacto@solnaciente.mx',
  website: 'solnaciente.mx',
  address: 'Av. Constitución 100',
}

function fillSample(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => SAMPLE_LEAD[key] ?? '')
}

/** Muestra la plantilla tal como la recibiría un destinatario. */
function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: EmailTemplate
  onClose: () => void
}) {
  // El contenido viene del propio usuario (lo escribió en el editor), no de
  // terceros, y se muestra igual que se enviará.
  const html = fillSample(ensureHtml(template.body))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Vista previa</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Con datos de ejemplo: {SAMPLE_LEAD.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 dark:bg-gray-800/50 px-4 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Asunto</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {fillSample(template.subject)}
              </p>
            </div>
            <div
              className="rich-editor p-4 text-sm text-gray-800 dark:text-gray-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          {template.attachments && template.attachments.length > 0 && (
            <AttachmentPreview attachments={template.attachments} />
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 dark:border-gray-800 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 dark:hover:text-white border border-gray-200 dark:border-gray-800 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateFormModal({
  template,
  onSaved,
  onClose,
}: {
  template: EmailTemplate | null
  onSaved: (tpl: EmailTemplate) => void
  onClose: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  // Las plantillas guardadas antes del editor son texto plano: se convierten a
  // HTML al abrirlas para no perder los saltos de línea.
  const [body, setBody] = useState(ensureHtml(template?.body ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<TemplateAttachment[]>(
    template?.attachments ?? [],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Un editor "vacío" puede contener <br> o <div></div>: para saber si el
    // usuario escribió algo hay que mirar el texto, no el HTML.
    const hasText = toSnippet(body).length > 0
    if (!name.trim() || !subject.trim() || !hasText) {
      setError('Todos los campos son obligatorios')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = template ? `/api/email/templates/${template.id}` : '/api/email/templates'
      const method = template ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo guardar')
      }
      // La respuesta de guardar no incluye adjuntos (solo los campos de texto);
      // los conservamos desde el estado local para no perderlos en la tarjeta.
      const saved = await res.json()
      onSaved({ ...saved, attachments })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {template ? 'Editar plantilla' : 'Nueva plantilla'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Nombre de la plantilla
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Presentación de servicios"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Asunto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Hola {{name}}, propuesta para {{company}}"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              También admite variables: {'{{name}}'}, {'{{company}}'}…
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Mensaje</label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              variables={VARIABLES}
              placeholder="Hola {{name}}, me puse en contacto porque…"
              minHeight={260}
            />
          </div>

          <AttachmentsSection
            templateId={template?.id ?? null}
            attachments={attachments}
            onChange={setAttachments}
          />

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {template ? 'Guardar cambios' : 'Crear plantilla'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Gestión de adjuntos fijos de una plantilla. Los adjuntos se cuelgan de la
 * plantilla, así que solo pueden gestionarse cuando ya existe (tiene id): al
 * crear una nueva, se pide guardarla primero.
 */
function AttachmentsSection({
  templateId,
  attachments,
  onChange,
}: {
  templateId: string | null
  attachments: TemplateAttachment[]
  onChange: (next: TemplateAttachment[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mensaje de progreso mientras se comprime un archivo pesado.
  const [notice, setNotice] = useState<string | null>(null)
  // Adjunto desplegado en vista previa (uno a la vez, para no cargar varios PDF).
  const [previewId, setPreviewId] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !templateId) return
    setError(null)
    setNotice(null)
    setUploading(true)
    // Acumulador local: dentro del bucle el `attachments` del closure no cambia,
    // así que vamos agregando aquí y propagamos el resultado en cada paso.
    const next = [...attachments]
    try {
      // Se suben en serie para poder reportar el primer error con claridad.
      for (const original of Array.from(files)) {
        // Las fotos se reducen aquí: a tamaño completo no pasarían el límite
        // de subida, y un correo con imágenes enormes tarda en abrirse.
        let file = await compressImage(original)

        // Un PDF que no cabe se rasteriza. Se hace solo cuando hace falta,
        // porque el texto deja de poder seleccionarse.
        if (isPdf(file) && file.size > MAX_ATTACHMENT_BYTES) {
          setNotice(`Comprimiendo ${original.name}…`)
          const result = await compressPdf(file, MAX_ATTACHMENT_BYTES, (done, total) =>
            setNotice(`Comprimiendo ${original.name} — página ${done} de ${total}…`),
          )
          setNotice(null)
          if (result.compressed) {
            setNotice(
              `${original.name}: ${formatBytes(file.size)} → ${formatBytes(result.file.size)}`,
            )
          } else if (result.reason) {
            throw new Error(
              `${original.name} pesa ${formatBytes(file.size)} y no se pudo comprimir ` +
              `(${result.reason}). Súbelo a Drive y enlázalo en el mensaje.`,
            )
          }
          file = result.file
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `${original.name} pesa ${formatBytes(file.size)} y el máximo por archivo es ` +
            `${formatBytes(MAX_ATTACHMENT_BYTES)}. Comprímelo o divídelo antes de adjuntarlo.`,
          )
        }

        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/email/templates/${templateId}/attachments`, {
          method: 'POST',
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `No se pudo subir ${original.name}`)
        next.push(data)
        onChange([...next])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
      setNotice(null)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/email/attachments/${id}`, { method: 'DELETE' })
    if (res.ok) onChange(attachments.filter((a) => a.id !== id))
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
        <Paperclip className="h-3.5 w-3.5" />
        Archivos adjuntos
        <span className="font-normal text-gray-400">— se envían con cada correo de esta plantilla</span>
      </div>

      {!templateId ? (
        <p className="py-2 text-xs text-gray-400">
          Guarda la plantilla primero para poder adjuntar archivos.
        </p>
      ) : (
        <>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((a) => {
                const viewable =
                  a.mimeType === 'application/pdf' || a.mimeType.startsWith('image/')
                const open = previewId === a.id
                return (
                  <li
                    key={a.id}
                    className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm"
                  >
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <FileIcon className="h-4 w-4 shrink-0 text-blue-500" />
                      <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{a.filename}</span>
                      <span className="shrink-0 text-xs text-gray-400">{formatSize(a.size)}</span>
                      {viewable && (
                        <button
                          type="button"
                          onClick={() => setPreviewId(open ? null : a.id)}
                          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-blue-600 transition-colors hover:bg-blue-50"
                        >
                          {open ? 'Ocultar' : 'Ver'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(a.id)}
                        className="shrink-0 rounded p-0.5 text-gray-300 dark:text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Quitar ${a.filename}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {open && viewable && (
                      <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800">
                        {a.mimeType === 'application/pdf' ? (
                          <object
                            data={`/api/email/attachments/${a.id}#toolbar=0&navpanes=0`}
                            type="application/pdf"
                            className="h-[380px] w-full"
                            aria-label={`Vista previa de ${a.filename}`}
                          >
                            <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                              Tu navegador no puede mostrar el PDF aquí.{' '}
                              <a
                                href={`/api/email/attachments/${a.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline hover:text-blue-700"
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
                            className="mx-auto max-h-[380px] w-auto"
                          />
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 text-sm text-gray-600 dark:text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Subiendo…' : 'Añadir archivo'}
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {notice && !error && (
            <p className="text-xs text-blue-600 dark:text-blue-400">{notice}</p>
          )}
          <p className="text-[11px] text-gray-400">
            PDF, fotos (JPG, PNG), Word, Excel y texto. Las fotos se optimizan
            solas al subirlas; el resto admite hasta {formatBytes(MAX_ATTACHMENT_BYTES)}.
          </p>
        </>
      )}
    </div>
  )
}
