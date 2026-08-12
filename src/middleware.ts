import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, isValidSessionToken, isAuthDisabled, isAuthConfigured } from '@/lib/auth'

/**
 * Puerta de acceso: sin sesión válida, cualquier ruta redirige a /login
 * (o responde 401 si es una llamada a la API).
 *
 * Se omite cuando el login está desactivado (desarrollo) o cuando no hay
 * contraseña configurada — así una instalación sin configurar no queda
 * inaccesible por accidente.
 */
export async function middleware(req: NextRequest) {
  if (isAuthDisabled() || !isAuthConfigured()) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (await isValidSessionToken(token)) {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl

  // Las rutas de la API responden con 401 en vez de redirigir.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  // Recuerda a dónde iba para volver ahí tras autenticarse.
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

/**
 * Se aplica a todo salvo: la propia página de login, su endpoint de auth, el
 * webhook de Resend (lo llama un servicio externo, se valida por firma propia),
 * la página de baja y su API —que abren los destinatarios de los correos, sin
 * cuenta en el CRM, y se validan con un token firmado— y los recursos
 * estáticos de Next.
 */
export const config = {
  matcher: [
    '/((?!login|api/auth|api/email/webhook|baja|api/unsubscribe|_next/static|_next/image|favicon.ico).*)',
  ],
}
