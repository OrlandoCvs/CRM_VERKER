import { NextRequest, NextResponse } from 'next/server'
import {
  verifyPassword,
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth'

// POST /api/auth/login — valida la contraseña y fija la cookie de sesión.
export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: 'No hay contraseña configurada (APP_PASSWORD)' },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const password = typeof body.password === 'string' ? body.password : ''

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), SESSION_COOKIE_OPTIONS)
  return res
}
