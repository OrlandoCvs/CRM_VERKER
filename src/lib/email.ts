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
  /**
   * URL de baja del destinatario. Se envía en la cabecera `List-Unsubscribe`,
   * que Gmail y Yahoo exigen desde 2024 a quien manda correo en volumen: sin
   * ella, los mensajes acaban en spam por muy bien configurado que esté el
   * dominio.
   */
  unsubscribeUrl?: string
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
        ...(params.unsubscribeUrl
          ? {
              headers: {
                'List-Unsubscribe': `<${params.unsubscribeUrl}>`,
                // Declara que la baja se aplica con una sola petición, sin
                // pedirle nada más al destinatario.
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
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
      ...(params.unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${params.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
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

/* --------------------------- Pie de baja --------------------------- */

/**
 * Pie legal que se añade a todos los correos salientes.
 *
 * Cumple dos funciones a la vez: da el medio de oposición que exige la ley
 * mexicana (LFPDPPP) y satisface el requisito de Gmail y Yahoo de ofrecer baja
 * visible. Explicar quién escribe y por qué también reduce las denuncias por
 * spam, que son lo que de verdad hunde la reputación de un dominio.
 */

/** Nombre del remitente que se muestra en el pie. */
function senderName(): string {
  return process.env.EMAIL_SENDER_NAME?.trim() || 'Verker'
}

/** Escapa texto para insertarlo en el HTML del pie. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Versión HTML del pie, separada del mensaje por una línea fina. */
export function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  const name = escapeHtml(senderName())
  const url = escapeHtml(unsubscribeUrl)
  return (
    '<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">' +
    `Este mensaje te lo envía <strong>${name}</strong> porque tu negocio aparece en ` +
    'directorios públicos de tu sector. No compartimos tus datos con terceros.<br>' +
    `Si no deseas recibir más correos, <a href="${url}" style="color:#2563eb;">` +
    'date de baja aquí</a> y no volveremos a escribirte.' +
    '</div>'
  )
}

/** Versión en texto plano del mismo pie. */
export function unsubscribeFooterText(unsubscribeUrl: string): string {
  return (
    '\n\n----------\n' +
    `Este mensaje te lo envía ${senderName()} porque tu negocio aparece en ` +
    'directorios públicos de tu sector. No compartimos tus datos con terceros.\n' +
    `Si no deseas recibir más correos, date de baja aquí: ${unsubscribeUrl}`
  )
}
