import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Verker CRM',
  description: 'Gestión de leads y campañas de correo',
}

/**
 * Aplica el tema guardado antes del primer pintado.
 *
 * Va como script síncrono en el <head>: si esperásemos a que React monte, la
 * página aparecería en claro un instante antes de saltar a oscuro.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('verker.theme');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full flex bg-gray-50 dark:bg-gray-950 antialiased">
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  )
}
