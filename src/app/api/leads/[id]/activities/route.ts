import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await req.json()
  const activity = await prisma.activity.create({
    data: { leadId: id, type: body.type, note: body.note },
  })
  return Response.json(activity, { status: 201 })
}
