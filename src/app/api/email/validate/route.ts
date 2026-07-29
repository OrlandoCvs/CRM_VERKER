import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { checkEmails, EmailCheck } from '@/lib/email-validation'

/**
 * POST /api/email/validate — comprueba (sintaxis + MX) los emails de los leads
 * indicados, antes de enviarles una campaña. Body: { leadIds: string[] }.
 *
 * Devuelve el desglose por lead y un resumen, para que la interfaz avise de las
 * direcciones que probablemente rebotarían.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : []
  if (leadIds.length === 0) {
    return Response.json({ error: 'Sin leads que validar' }, { status: 400 })
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, name: true, email: true },
  })

  const withEmail = leads.filter((l) => l.email?.trim())
  const emails = [...new Set(withEmail.map((l) => l.email!.trim().toLowerCase()))]
  const checks = await checkEmails(emails)

  const results = withEmail.map((l) => ({
    leadId: l.id,
    name: l.name,
    email: l.email,
    check: checks.get(l.email!.trim().toLowerCase()) ?? ('error' as EmailCheck),
  }))

  const summary = {
    valid: results.filter((r) => r.check === 'valid').length,
    invalidSyntax: results.filter((r) => r.check === 'invalid_syntax').length,
    noMx: results.filter((r) => r.check === 'no_mx').length,
    error: results.filter((r) => r.check === 'error').length,
    noEmail: leads.length - withEmail.length,
  }

  return Response.json({ summary, results })
}
