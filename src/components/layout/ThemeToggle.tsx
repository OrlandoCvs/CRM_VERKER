'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

/**
 * Selector de tema claro / oscuro / automático.
 *
 * La preferencia se guarda en localStorage y se aplica poniendo la clase `dark`
 * en <html>. El script de `layout.tsx` ya la aplicó antes de pintar, así que
 * aquí solo sincronizamos el estado visible del control y reaccionamos a los
 * cambios; en modo automático seguimos la preferencia del sistema operativo.
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'verker.theme'

/** Aplica el tema al documento. Exportada para reutilizarla desde el script inicial. */
function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Automático', icon: Monitor },
]

/** Lee la preferencia guardada; 'system' si no hay ninguna o no es válida. */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  // El servidor no conoce la preferencia del usuario, así que el primer render
  // debe coincidir en ambos lados: `mounted` es false en el servidor y true en
  // el cliente, y hasta entonces se pinta un hueco neutro.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  // En modo automático hay que seguir los cambios del sistema en caliente.
  useEffect(() => {
    if (!mounted) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyTheme(theme)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme, mounted])

  function choose(next: Theme) {
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  // Antes de montar no sabemos el tema guardado: reservamos el hueco para que
  // el menú no salte cuando aparezca.
  if (!mounted) {
    return <div className={collapsed ? 'h-9' : 'h-9 rounded-lg bg-gray-100 dark:bg-gray-800'} />
  }

  if (collapsed) {
    const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]
    const Icon = current.icon
    return (
      <button
        type="button"
        onClick={() => {
          const order: Theme[] = ['light', 'dark', 'system']
          choose(order[(order.indexOf(theme) + 1) % order.length])
        }}
        title={`Tema: ${current.label}`}
        className="w-full flex items-center justify-center h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition-colors"
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          title={label}
          aria-pressed={theme === value}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            theme === value
              ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}
