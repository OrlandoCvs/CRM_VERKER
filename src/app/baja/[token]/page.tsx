export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'
import { UnsubscribeClient } from '@/components/unsubscribe/UnsubscribeClient'

/**
 * Página de baja, enlazada desde el pie de cada correo.
 *
 * Es pública: la abre alguien que no tiene cuenta en el CRM y que llega desde su
 * bandeja de entrada. La autenticidad la garantiza el token firmado, no la
 * sesión (ver `lib/unsubscribe.ts`), y `middleware.ts` la deja pasar sin login.
 */

export const metadata = {
  title: 'Darse de baja',
  // Un enlace de baja no debe acabar indexado en un buscador.
  robots: { index: false, follow: false },
}

export default async function BajaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const leadId = verifyUnsubscribeToken(token)

  const lead = leadId
    ? await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, name: true, email: true, unsubscribedAt: true },
      })
    : null

  return (
    <UnsubscribeClient
      token={token}
      // Un token manipulado y un lead borrado se tratan igual: no se confirma
      // ni se desmiente que la dirección exista.
      valid={Boolean(lead)}
      email={lead?.email ?? null}
      alreadyUnsubscribed={Boolean(lead?.unsubscribedAt)}
    />
  )
}
