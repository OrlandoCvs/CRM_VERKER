'use client'

import { useRef, useState } from 'react'
import {
  Mail, Plus, Edit, Trash2, X, Loader2, AlertTriangle, Check, FileText,
  Paperclip, Upload, File as FileIcon,
} from 'lucide-react'

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

export function TemplatesClient({ initialTemplates, status }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<EmailTemplate | 'new' | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await fetch(`/api/email/templates/${id}`, { method: 'DELETE' })
    setTemplates((prev) => prev.filter((t) => t.id !== id))
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Plantillas de Correo</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Crea plantillas reutilizables para tus campañas. Usa variables como{' '}
            <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{'{{name}}'}</code>{' '}
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
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
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
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          Envío configurado: <span className="font-medium text-gray-600">{status.from}</span> vía{' '}
          {status.provider?.toUpperCase()}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <FileText className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Aún no tienes plantillas</p>
          <button
            onClick={() => setEditing('new')}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Crear la primera →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-2 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </span>
                  <h3 className="font-semibold text-gray-900 text-sm truncate">{t.name}</h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditing(t)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    aria-label="Editar"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">{t.subject}</p>
              <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap">{t.body}</p>
              {t.attachments && t.attachments.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
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
  const [body, setBody] = useState(template?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<TemplateAttachment[]>(
    template?.attachments ?? [],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !subject.trim() || !body.trim()) {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {template ? 'Editar plantilla' : 'Nueva plantilla'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Nombre de la plantilla</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Presentación de servicios"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Variables disponibles</label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <span
                  key={v.key}
                  className="px-2.5 py-1 rounded-full text-xs font-mono bg-gray-100 text-gray-600"
                  title={v.label}
                >
                  {`{{${v.key}}}`}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Asunto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Hola {{name}}, propuesta para {{company}}"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Mensaje</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder={'Hola {{name}},\n\nMe puse en contacto porque...'}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
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
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !templateId) return
    setError(null)
    setUploading(true)
    // Acumulador local: dentro del bucle el `attachments` del closure no cambia,
    // así que vamos agregando aquí y propagamos el resultado en cada paso.
    const next = [...attachments]
    try {
      // Se suben en serie para poder reportar el primer error con claridad.
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/email/templates/${templateId}/attachments`, {
          method: 'POST',
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `No se pudo subir ${file.name}`)
        next.push(data)
        onChange([...next])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
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
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
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
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 truncate text-gray-700">{a.filename}</span>
                  <span className="shrink-0 text-xs text-gray-400">{formatSize(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    className="shrink-0 rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label={`Quitar ${a.filename}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
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
            className="flex items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-white py-2 text-sm text-gray-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Subiendo…' : 'Añadir archivo'}
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-[11px] text-gray-400">
            PDF, imágenes, Word, Excel, texto. Máx. 10 MB por archivo.
          </p>
        </>
      )}
    </div>
  )
}
