import { prisma } from '@/lib/db'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { Lead, Folder } from '@/types'

/**
 * El dashboard filtra por carpeta en el cliente, así que envía la lista de leads
 * (con los campos que alimentan métricas y gráficos) en vez de agregados ya
 * calculados. Para el volumen de un CRM de este tipo es un coste despreciable y
 * permite recalcular todo al instante sin recargar la página.
 */
type DashLead = Pick<
  Lead,
  'id' | 'name' | 'company' | 'city' | 'rating' | 'status' | 'source' | 'folderId' | 'createdAt' | 'updatedAt'
>

export default async function DashboardPage() {
  const [rawLeads, rawFolders] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, company: true, city: true, rating: true,
        status: true, source: true, folderId: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.folder.findMany({ orderBy: { name: 'asc' } }),
  ])

  const raw = rawLeads as unknown as Array<{
    id: string; name: string; company: string | null; city: string | null
    rating: number | null; status: string; source: string
    folderId: string | null; createdAt: Date; updatedAt: Date
  }>

  const leads: DashLead[] = raw.map((l) => ({
    ...l,
    source: l.source as Lead['source'],
    status: l.status as Lead['status'],
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  const folders: Folder[] = (
    rawFolders as unknown as Array<{
      id: string; name: string; color: string | null
      parentId: string | null; createdAt: Date; updatedAt: Date
    }>
  ).map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }))

  return <DashboardClient leads={leads} folders={folders} />
}
