import { PrismaClient } from '@prisma/client'

// En Vercel (serverless) cada invocación puede reutilizar el proceso: cacheamos
// el cliente en globalThis para no abrir una conexión nueva por request, lo que
// agotaría el pool de Postgres. Por eso guardamos SIEMPRE (no solo en dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

globalForPrisma.prisma = prisma
