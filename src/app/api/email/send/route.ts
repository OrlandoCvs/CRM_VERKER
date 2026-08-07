import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import {
  getEmailStatus,
  sendEmail,
  renderTemplate,
  bodyToHtml,
  bodyToPlainText,
  type TemplateLead,
  type EmailAttachment,
} from '@/lib/email'

interface SendBody {
  leadIds?: string[]
  subject?: string
  body?: string
  replyTo?: string
  markContacted?: boolean
  templateId?: string
}

interface PerLeadResult {
  leadId: string
  name: string
  email: string | null
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

// POST /api/email/send — envía un correo (con plantilla) a uno o varios leads.
export async function POST(req: NextRequest) {
  const status = getEmailStatus()
  if (!status.configured) {
    return Response.json(
      { error: 'Email no configurado. Configura SMTP o Resend en .env.local.' },
      { status: 400 },
    )
  }

  const { leadIds, subject, body, replyTo, markContacted, templateId } =
    (await req.json().catch(() => ({}))) as SendBody

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return Response.json({ error: 'Selecciona al menos un lead' }, { status: 400 })
  }
  if (!subject?.trim() || !body?.trim()) {
    return Response.json({ error: 'El asunto y el cuerpo son obligatorios' }, { status: 400 })
  }

  // Los adjuntos de la plantilla se leen una sola vez (el binario vive en la
  // base, campo `data`) y se reutilizan en cada correo.
  let attachments: EmailAttachment[] | undefined
  if (templateId) {
    const rows = await prisma.emailAttachment.findMany({ where: { templateId } })
    if (rows.length > 0) {
      attachments = rows.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.data),
        contentType: a.mimeType,
      } satisfies EmailAttachment))
    }
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
  })

  const results: PerLeadResult[] = []

  // Envío secuencial: respeta los límites de tasa de Gmail/SMTP y permite
  // reportar el resultado de cada destinatario por separado.
  for (const lead of leads) {
    const email = lead.email?.trim() || null
    if (!email) {
      results.push({ leadId: lead.id, name: lead.name, email: null, status: 'skipped', error: 'Sin email' })
      continue
    }

    // Los rebotes duros y las quejas de spam se excluyen siempre: reenviar a una
    // dirección muerta (o a quien ya te reportó) degrada la reputación del dominio.
    if (lead.emailStatus === 'bounced' || lead.emailStatus === 'complained') {
      const motivo = lead.emailStatus === 'bounced' ? 'Email rebotado' : 'Marcó un correo como spam'
      results.push({ leadId: lead.id, name: lead.name, email, status: 'skipped', error: motivo })
      continue
    }

    const templateLead: TemplateLead = lead
    const renderedSubject = renderTemplate(subject, templateLead)
    // El cuerpo puede ser HTML (editor nuevo) o texto plano (plantillas
    // antiguas); ambos se resuelven aquí a las dos versiones del correo.
    const renderedBody = renderTemplate(body, templateLead)

    const result = await sendEmail({
      to: email,
      subject: renderedSubject,
      text: bodyToPlainText(renderedBody),
      html: bodyToHtml(renderedBody),
      replyTo: replyTo?.trim() || undefined,
      attachments,
    })

    if (result.ok) {
      // Registra el envío como actividad y, si se pidió, marca el lead como contactado.
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: 'email',
          note: `Correo enviado — "${renderedSubject}"`,
        },
      })
      // Guarda el id del proveedor para casar después los eventos del webhook
      // (rebotes y quejas) con este lead.
      if (result.id) {
        await prisma.emailDelivery.create({
          data: {
            leadId: lead.id,
            providerId: result.id,
            to: email,
            subject: renderedSubject,
          },
        }).catch(() => {
          // Un id duplicado no debe abortar el envío al resto de leads.
        })
      }
      if (markContacted && lead.status === 'new') {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: 'contacted' } })
      }
      results.push({ leadId: lead.id, name: lead.name, email, status: 'sent' })
    } else {
      results.push({ leadId: lead.id, name: lead.name, email, status: 'failed', error: result.error })
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length
  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped').length

  return Response.json({ sent, failed, skipped, results })
}
