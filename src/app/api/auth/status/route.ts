import { NextResponse } from 'next/server'
import { isAuthDisabled, isAuthConfigured } from '@/lib/auth'

/**
 * GET /api/auth/status — indica si el login está activo, para que la interfaz
 * decida mostrar el botón de cerrar sesión. Si el middleware dejó pasar esta
 * llamada es que ya hay sesión válida (o el auth está desactivado).
 */
export async function GET() {
  return NextResponse.json({
    enabled: isAuthConfigured() && !isAuthDisabled(),
  })
}
