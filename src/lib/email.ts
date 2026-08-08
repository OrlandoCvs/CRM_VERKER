import nodemailer from 'nodemailer'

/**
 * Capa de envío de correo con dos proveedores intercambiables:
 *
 *  - Resend  → si existe RESEND_API_KEY (mejor entregabilidad, requiere dominio verificado)
 *  - SMTP    → si existen SMTP_HOST/SMTP_USER/SMTP_PASS (Gmail, Outlook o dominio propio)
 *
 * El proveedor se elige automáticamente: Resend tiene prioridad si está configurado.
 */

export type EmailProvider = 'resend' | 'smtp'

export interface EmailStatus {
  configured: boolean
  provider: EmailProvider | null
  from: string | null
}

/** Dirección remitente configurada (EMAIL_FROM, o el usuario SMTP como respaldo). */
function resolveFrom(): string | null {
  return process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? null
}

export function getEmailStatus(): EmailStatus {
  const from = resolveFrom()
  if (process.env.RESEND_API_KEY) {
    return { configured: Boolean(from), provider: 'resend', from }
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return { configured: Boolean(from), provider: 'smtp', from }
  }
  return { configured: false, provider: null, from }
}

/** Adjunto listo para enviar: contenido en memoria + metadatos. */
export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

/** Cliente SMTP perezoso (una sola conexión reutilizada por proceso). */
let cachedTransport: nodemailer.Transporter | null = null
function getSmtpTransport(): nodemailer.Transporter {
  if (cachedTransport) return cachedTransport
  const port = Number(process.env.SMTP_PORT ?? 587)
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 => SSL implícito; 587/25 => STARTTLS
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  return cachedTransport
}

async function sendViaResend(params: SendEmailParams, from: string): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
        // Resend espera el contenido en base64.
        attachments: params.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
          content_type: a.contentType,
        })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: data?.message ?? `Resend respondió ${res.status}` }
    }
    return { ok: true, id: data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error en Resend' }
  }
}

async function sendViaSmtp(params: SendEmailParams, from: string): Promise<SendResult> {
  try {
    const info = await getSmtpTransport().sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })
    return { ok: true, id: info.messageId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error en SMTP' }
  }
}

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const status = getEmailStatus()
  if (!status.configured || !status.from) {
    return { ok: false, error: 'Email no configurado. Define EMAIL_FROM y un proveedor (SMTP o Resend).' }
  }
  return status.provider === 'resend'
    ? sendViaResend(params, status.from)
    : sendViaSmtp(params, status.from)
}

/* ----------------------- Plantillas y variables ----------------------- */

/** Datos de un lead que pueden interpolarse en asunto/cuerpo. */
export interface TemplateLead {
  name?: string | null
  company?: string | null
  city?: string | null
  country?: string | null
  category?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
}

/** Variables disponibles para las plantillas (clave => etiqueta visible). */
export const TEMPLATE_VARIABLES: { key: keyof TemplateLead; label: string }[] = [
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

/**
 * Reemplaza `{{variable}}` por el valor del lead. Las variables sin valor se
 * sustituyen por cadena vacía para no dejar `{{...}}` en el correo enviado.
 */
export function renderTemplate(template: string, lead: TemplateLead): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey as keyof TemplateLead
    const value = lead[key]
    return value != null ? String(value) : ''
  })
}

/**
 * Convierte texto plano (con saltos de línea) en HTML simple y seguro.
 * Escapa caracteres especiales y transforma los saltos de línea en <br>.
 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const body = escaped.replace(/\r?\n/g, '<br>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">${body}</div>`
}

/**
 * Distingue el HTML del editor del texto plano de plantillas antiguas.
 *
 * También cuentan las entidades (`&nbsp;`, `&amp;`…): el editor las genera al
 * teclear espacios, y un cuerpo con entidades pero sin etiquetas se escaparía
 * por error, haciendo que el destinatario viera el código en vez del texto.
 */
export function isHtmlBody(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value) || /&(?:[a-z]+|#\d+);/i.test(value)
}

/**
 * Prepara el cuerpo para enviarlo por correo.
 *
 * El editor produce HTML, pero las plantillas creadas antes seguían siendo
 * texto plano: se detecta y se convierte, de modo que ambas siguen funcionando.
 * El HTML se envuelve con la tipografía base porque muchos clientes de correo
 * ignoran las hojas de estilo y solo respetan los estilos en línea.
 */
export function bodyToHtml(body: string): string {
  if (!isHtmlBody(body)) return textToHtml(body)
  // La marca visual de las variables solo tiene sentido dentro del editor.
  const clean = body.replace(/<span class="crm-var">([\s\S]*?)<\/span>/g, '$1')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">${clean}</div>`
}

/**
 * Versión en texto plano del cuerpo, para clientes que no muestran HTML y para
 * mejorar la puntuación antispam (un correo solo-HTML es más sospechoso).
 */
export function bodyToPlainText(body: string): string {
  if (!isHtmlBody(body)) return body
  return body
    // Los saltos estructurales se conservan como saltos de línea.
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Compacta los huecos que dejan las etiquetas anidadas.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
