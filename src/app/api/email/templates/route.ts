import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

// GET /api/email/templates — lista de plantillas con sus adjuntos
export async function GET() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, filename: true, mimeType: true, size: true },
      },
    },
  })
  return Response.json(templates)
}

// POST /api/email/templates — crear plantilla. Body: { name, subject, body }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject : ''
  const content = typeof body.body === 'string' ? body.body : ''

  if (!name || !subject || !content) {
    return Response.json(
      { error: 'Nombre, asunto y cuerpo son obligatorios' },
      { status: 400 },
    )
  }

  const template = await prisma.emailTemplate.create({
    data: { name, subject, body: content },
  })
  return Response.json(template, { status: 201 })
}
