import { prisma } from '@/lib/db'
import { getEmailStatus } from '@/lib/email'
import { TemplatesClient, EmailTemplate } from '@/components/email/TemplatesClient'

export default async function TemplatesPage() {
  const rawTemplates = (await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, filename: true, mimeType: true, size: true },
      },
    },
  })) as unknown as Array<{
    id: string; name: string; subject: string; body: string
    createdAt: Date; updatedAt: Date
    attachments: { id: string; filename: string; mimeType: string; size: number }[]
  }>

  const templates: EmailTemplate[] = rawTemplates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))

  return <TemplatesClient initialTemplates={templates} status={getEmailStatus()} />
}
