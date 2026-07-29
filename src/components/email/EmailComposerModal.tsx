'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Mail, Send, Loader2, AlertTriangle, Check, Save,
  Users, Eye, ChevronDown, ShieldCheck,
} from 'lucide-react'

/** Variables disponibles para interpolar (debe coincidir con TEMPLATE_VARIABLES de lib/email). */
const VARIABLES: { key: string; label: string }[] = [
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

/** Forma mínima de lead que necesita el compositor. */
export interface ComposerLead {
  id: string
  name: string
  email?: string | null
  company?: string | null
  city?: string | null
  country?: string | null
  category?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  status?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

interface EmailStatus {
  configured: boolean
  provider: 'resend' | 'smtp' | null
  from: string | null
}

interface SendResultItem {
  leadId: string
  name: string
  email: string | null
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

interface Props {
  leads: ComposerLead[]
  /** Título opcional (por defecto se infiere según cantidad de destinatarios). */
  title?: string
  onClose: () => void
  /** Se llama tras un envío con al menos un correo entregado. */
  onSent?: (sentLeadIds: string[], markedContacted: boolean) => void
}

function renderPreview(template: string, lead: ComposerLead): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = (lead as unknown as Record<string, unknown>)[key]
    return value != null ? String(value) : ''
  })
}

export function EmailComposerModal({ leads, title, onClose, onSent }: Props) {
  const withEmail = useMemo(() => leads.filter((l) => l.email?.trim()), [leads])
  const withoutEmail = leads.length - withEmail.length

  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState('propiedades@verker.mx')
  const [markContacted, setMarkContacted] = useState(true)
  // Seguimiento automático: agenda un recordatorio a los N días tras enviar.
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false)
  const [followUpDays, setFollowUpDays] = useState(3)
  // Validación MX de los destinatarios (opcional, antes de enviar).
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{
    valid: number; noMx: number; invalidSyntax: number; error: number; noEmail: number
  } | null>(null)
  // Detalle por lead, para mostrar QUÉ direcciones tienen problema (no solo cuántas).
  const [validationDetail, setValidationDetail] = useState<
    { leadId: string; name: string; email: string | null; check: string }[]
  >([])

  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [results, setResults] = useState<{ sent: number; failed: number; skipped: number; results: SendResultItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastFocused = useRef<'subject' | 'body'>('body')

  useEffect(() => {
    fetch('/api/email/status').then((r) => r.json()).then(setStatus).catch(() => {})
    fetch('/api/email/templates').then((r) => r.json()).then(setTemplates).catch(() => {})
  }, [])

  const previewLead = withEmail[0] ?? leads[0]

  function applyTemplate(id: string) {
    setSelectedTemplate(id)
    const tpl = templates.find((t) => t.id === id)
    if (tpl) {
      setSubject(tpl.subject)
      setBody(tpl.body)
    }
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`
    if (lastFocused.current === 'subject') {
      const el = subjectRef.current
      const start = el?.selectionStart ?? subject.length
      const end = el?.selectionEnd ?? subject.length
      const next = subject.slice(0, start) + token + subject.slice(end)
      setSubject(next)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(start + token.length, start + token.length)
      })
    } else {
      const el = bodyRef.current
      const start = el?.selectionStart ?? body.length
      const end = el?.selectionEnd ?? body.length
      const next = body.slice(0, start) + token + body.slice(end)
      setBody(next)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(start + token.length, start + token.length)
      })
    }
  }

  async function handleSaveTemplate() {
    const name = prompt('Nombre de la plantilla:')
    if (!name?.trim()) return
    setSavingTemplate(true)
    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), subject, body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo guardar')
      }
      const tpl: EmailTemplate = await res.json()
      setTemplates((prev) => [tpl, ...prev])
      setSelectedTemplate(tpl.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar plantilla')
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleValidate() {
    if (withEmail.length === 0) return
    setValidating(true)
    setValidation(null)
    try {
      const res = await fetch('/api/email/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: withEmail.map((l) => l.id) }),
      })
      const data = await res.json()
      if (res.ok) {
        setValidation(data.summary)
        setValidationDetail(Array.isArray(data.results) ? data.results : [])
      }
    } catch {
      // Silencioso: la validación es un extra, no debe bloquear el envío.
    } finally {
      setValidating(false)
    }
  }

  async function handleSend() {
    setError(null)
    if (!subject.trim() || !body.trim()) {
      setError('El asunto y el cuerpo son obligatorios')
      return
    }
    if (withEmail.length === 0) {
      setError('Ninguno de los leads seleccionados tiene email')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: withEmail.map((l) => l.id),
          subject,
          body,
          replyTo: replyTo || undefined,
          markContacted,
          // Si se envía a partir de una plantilla, el servidor adjuntará sus archivos.
          templateId: selectedTemplate || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar')
      setResults(data)
      const sentIds = (data.results as SendResultItem[])
        .filter((r) => r.status === 'sent')
        .map((r) => r.leadId)

      // Agenda un recordatorio de seguimiento para cada lead al que sí se envió.
      if (scheduleFollowUp && sentIds.length > 0) {
        const dueAt = new Date()
        dueAt.setDate(dueAt.getDate() + followUpDays)
        dueAt.setHours(9, 0, 0, 0)
        const byId = new Map(withEmail.map((l) => [l.id, l]))
        await Promise.all(
          sentIds.map((id) => {
            const lead = byId.get(id)
            const who = lead?.company || lead?.name || 'el lead'
            return fetch(`/api/leads/${id}/reminders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: `Revisar si ${who} respondió al correo`,
                dueAt: dueAt.toISOString(),
              }),
            }).catch(() => {})
          }),
        )
      }

      if (sentIds.length > 0) onSent?.(sentIds, markContacted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSending(false)
    }
  }

  const heading =
    title ?? (leads.length === 1 ? 'Enviar correo' : `Campaña de correo · ${leads.length} leads`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 leading-tight">{heading}</h3>
              <p className="text-xs text-gray-500">
                {withEmail.length} con email
                {withoutEmail > 0 && ` · ${withoutEmail} sin email (se omiten)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results view */}
        {results ? (
          <div className="overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <ResultStat label="Enviados" value={results.sent} tone="green" />
              <ResultStat label="Fallidos" value={results.failed} tone="red" />
              <ResultStat label="Omitidos" value={results.skipped} tone="gray" />
            </div>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {results.results.map((r) => (
                <div key={r.leadId} className="flex items-center gap-3 px-4 py-2.5">
                  <StatusDot status={r.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400 truncate">{r.email ?? 'sin email'}</p>
                  </div>
                  {r.error && <span className="text-xs text-red-500 truncate max-w-[180px]">{r.error}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto p-6 space-y-4">
              {/* Not configured warning */}
              {status && !status.configured && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-800">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Email no configurado</p>
                    <p className="text-xs mt-0.5">
                      Define <code className="font-mono">EMAIL_FROM</code> y un proveedor (SMTP o Resend)
                      en <code className="font-mono">.env.local</code> y reinicia el servidor para poder enviar.
                    </p>
                  </div>
                </div>
              )}
              {status?.configured && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Enviando desde <span className="font-medium text-gray-600">{status.from}</span> vía {status.provider?.toUpperCase()}
                </p>
              )}

              {/* Template selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">Plantilla</label>
                <div className="relative">
                  <select
                    value={selectedTemplate}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="w-full appearance-none pl-3 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Sin plantilla (escribir desde cero) —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Variables */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Insertar variable (se reemplaza por los datos de cada lead)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                      title={`{{${v.key}}}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">Asunto</label>
                <input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => (lastFocused.current = 'subject')}
                  placeholder="Ej: Hola {{name}}, una propuesta para {{company}}"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">Mensaje</label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onFocus={() => (lastFocused.current = 'body')}
                  rows={9}
                  placeholder={'Hola {{name}},\n\nVi que {{company}} está en {{city}} y...'}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                />
              </div>

              {/* Reply-to */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Responder a (opcional)
                </label>
                <input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="tucorreo@empresa.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Options */}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markContacted}
                  onChange={(e) => setMarkContacted(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Marcar como &quot;Contactado&quot; los leads en estado Nuevo
              </label>

              {/* Follow-up: agenda un recordatorio tras enviar */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={scheduleFollowUp}
                    onChange={(e) => setScheduleFollowUp(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Programar seguimiento a los
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={followUpDays}
                  onChange={(e) => setFollowUpDays(Math.max(1, Number(e.target.value) || 1))}
                  disabled={!scheduleFollowUp}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className={scheduleFollowUp ? '' : 'text-gray-400'}>días si no responde</span>
              </div>

              {/* Validación MX opcional */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={validating || withEmail.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Verificar correos
                </button>
                {validation && (
                  // Si no se pudo verificar ninguno (todo 'error'), se avisa en vez
                  // de mostrar un engañoso "0 válidos".
                  validation.valid + validation.noMx + validation.invalidSyntax === 0 &&
                  validation.error > 0 ? (
                    <span className="text-xs text-amber-600">
                      No se pudo verificar (sin acceso a DNS). Se puede enviar igualmente.
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      <span className="font-medium text-emerald-600">{validation.valid} válidos</span>
                      {validation.noMx > 0 && (
                        <span className="text-amber-600"> · {validation.noMx} dominio sin correo</span>
                      )}
                      {validation.invalidSyntax > 0 && (
                        <span className="text-red-600"> · {validation.invalidSyntax} mal escritos</span>
                      )}
                      {validation.error > 0 && (
                        <span className="text-gray-400"> · {validation.error} sin verificar</span>
                      )}
                      {validation.noMx + validation.invalidSyntax > 0 && (
                        <span className="text-gray-400"> (probablemente reboten)</span>
                      )}
                    </span>
                  )
                )}
              </div>

              {/* Detalle: qué direcciones tienen problema */}
              {validationDetail.some((r) => r.check === 'no_mx' || r.check === 'invalid_syntax') && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1.5 text-xs font-medium text-amber-800">
                    Direcciones que probablemente reboten:
                  </p>
                  <ul className="space-y-1">
                    {validationDetail
                      .filter((r) => r.check === 'no_mx' || r.check === 'invalid_syntax')
                      .map((r) => (
                        <li key={r.leadId} className="flex items-center gap-2 text-xs">
                          <span className="truncate font-medium text-gray-700">{r.name}</span>
                          <span className="truncate text-gray-500">{r.email}</span>
                          <span className="ml-auto shrink-0 text-amber-600">
                            {r.check === 'no_mx' ? 'dominio sin correo' : 'mal escrito'}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Preview */}
              {previewLead && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPreview((s) => !s)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Eye className="w-4 h-4" /> Vista previa para {previewLead.name}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-180' : ''}`} />
                  </button>
                  {showPreview && (
                    <div className="p-4 space-y-2">
                      <p className="text-xs text-gray-400">Asunto</p>
                      <p className="text-sm font-medium text-gray-800">
                        {renderPreview(subject, previewLead) || <span className="text-gray-300">(vacío)</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-3">Mensaje</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {renderPreview(body, previewLead) || <span className="text-gray-300">(vacío)</span>}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !subject.trim() || !body.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar plantilla
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {withEmail.length} destinatario{withEmail.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !status?.configured || withEmail.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Enviar {withEmail.length > 1 ? `(${withEmail.length})` : ''}</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'gray' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className={`rounded-xl p-4 text-center ${tones[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  )
}

function StatusDot({ status }: { status: 'sent' | 'failed' | 'skipped' }) {
  const map = {
    sent: 'bg-emerald-500',
    failed: 'bg-red-500',
    skipped: 'bg-gray-300',
  }
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${map[status]}`} />
}
