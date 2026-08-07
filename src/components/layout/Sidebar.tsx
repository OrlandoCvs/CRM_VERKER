'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Kanban,
  Search,
  Map,
  Mail,
  Bell,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/reminders', label: 'Seguimientos', icon: Bell },
  { href: '/search', label: 'Buscar Negocios', icon: Search },
  { href: '/map', label: 'Mapa de Leads', icon: Map },
  { href: '/templates', label: 'Plantillas Email', icon: Mail },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  // Recordatorios que requieren atención (vencidos o para hoy), para el badge.
  const [dueCount, setDueCount] = useState(0)
  // Si el login está activo, se muestra el botón de cerrar sesión.
  const [authEnabled, setAuthEnabled] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => setAuthEnabled(Boolean(d.enabled)))
      .catch(() => {})
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    router.replace('/login')
    router.refresh()
  }

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/api/reminders')
        .then((r) => r.json())
        .then((data: { dueAt: string }[]) => {
          if (!alive || !Array.isArray(data)) return
          const endOfToday = new Date()
          endOfToday.setHours(23, 59, 59, 999)
          setDueCount(data.filter((r) => new Date(r.dueAt) <= endOfToday).length)
        })
        .catch(() => {})
    }
    load()
    // Se refresca al navegar (cambia pathname) para reflejar altas/completados.
    return () => {
      alive = false
    }
  }, [pathname])

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen shrink-0">
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-white font-semibold text-base tracking-tight">Verker CRM</h1>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const showBadge = href === '/reminders' && dueCount > 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/30'
                  : 'text-gray-400 font-normal hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                  {dueCount}
                </span>
              )}
              {active && !showBadge && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-800 px-3 py-4">
        <div className="mb-3">
          <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Tema
          </p>
          <ThemeToggle />
        </div>
        {authEnabled && (
          <button
            onClick={logout}
            className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Cerrar sesión</span>
          </button>
        )}
        <div className="text-center text-[11px] text-gray-600">Powered by Apify</div>
      </div>
    </aside>
  )
}
