import { apifyClient } from '@/lib/apify'

/**
 * GET /api/apify/usage
 * Consumo de la cuenta de Apify en el ciclo mensual en curso.
 *
 * Apify factura por "créditos" en dólares: cada búsqueda de leads consume una
 * fracción del saldo mensual. Exponemos el gasto actual, el tope del plan y
 * cuándo se renueva, para que el usuario sepa cuánto le queda antes de buscar.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!process.env.APIFY_TOKEN) {
    return Response.json({ error: 'Apify no está configurado' }, { status: 400 })
  }

  try {
    const limits = await apifyClient.user('me').limits()
    if (!limits) {
      return Response.json({ error: 'Apify no devolvió datos de consumo' }, { status: 502 })
    }

    const usedUsd = limits.current.monthlyUsageUsd ?? 0
    const maxUsd = limits.limits.maxMonthlyUsageUsd ?? 0

    return Response.json({
      usedUsd,
      maxUsd,
      // Porcentaje consumido; si no hay tope definido no tiene sentido calcularlo.
      percent: maxUsd > 0 ? Math.min(100, Math.round((usedUsd / maxUsd) * 100)) : null,
      remainingUsd: maxUsd > 0 ? Math.max(0, maxUsd - usedUsd) : null,
      cycleStart: limits.monthlyUsageCycle?.startAt ?? null,
      cycleEnd: limits.monthlyUsageCycle?.endAt ?? null,
    })
  } catch {
    return Response.json({ error: 'No se pudo consultar el consumo de Apify' }, { status: 502 })
  }
}
