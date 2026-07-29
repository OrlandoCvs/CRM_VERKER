import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

// POST /api/auth/logout — borra la cookie de sesión.
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
