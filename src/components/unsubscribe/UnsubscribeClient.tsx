'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Undo2, MailX } from 'lucide-react'

/**
 * Pantalla de baja que ve el destinatario de un correo.
 *
 * La baja se aplica sola al abrir la página: es lo que exige el estándar de un
 * clic de Gmail y Yahoo, y evita que alguien tenga que dar dos pasos para dejar
 * de recibir correos que no pidió. Como contrapartida se ofrece deshacer, por
 * si el enlace se abrió sin querer.
 *
 * No hay sesión ni datos del CRM aquí: solo se ve el resultado de la operación.
 */

interface Props {
  token: string
  valid: boolean
  email: string | null
  alreadyUnsubscribed: boolean
}

type State = 'working' | 'done' | 'error' | 'resubscribed'

export function UnsubscribeClient({ token, valid, email, alreadyUnsubscribed }: Props) {
  const [state, setState] = useState<State>(
    alreadyUnsubscribed ? 'done' : valid ? 'working' : 'error',
  )
  const [busy, setBusy] = useState(false)

  // Aplica la baja nada más abrir, salvo que ya estuviera dada o el enlace
  // fuera inválido.
  useEffect(() => {
    if (!valid || alreadyUnsubscribed) return
    const controller = new AbortController()
    fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then((res) => setState(res.ok ? 'done' : 'error'))
      .catch(() => {
        if (!controller.signal.aborted) setState('error')
      })
    return () => controller.abort()
  }, [token, valid, alreadyUnsubscribed])

  async function resubscribe() {
    setBusy(true)
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) setState('resubscribed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {state === 'working' && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Procesando tu baja…
            </h1>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
            <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Listo, no volverás a recibir nuestros correos
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {email ? (
                <>
                  Hemos dado de baja la dirección{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">{email}</span>.
                </>
              ) : (
                'Hemos dado de baja tu dirección.'
              )}{' '}
              La baja es inmediata y definitiva.
            </p>

            <button
              onClick={resubscribe}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Fue sin querer, quiero seguir recibiéndolos
            </button>
          </>
        )}

        {state === 'resubscribed' && (
          <>
            <MailX className="mx-auto mb-4 h-12 w-12 text-blue-500" />
            <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Tu baja se ha cancelado
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Seguirás recibiendo nuestros correos. Puedes darte de baja cuando
              quieras desde el enlace del pie de cualquiera de ellos.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Este enlace no es válido
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Puede que esté incompleto o que ya no exista. Responde al correo
              que recibiste pidiendo la baja y la aplicaremos a mano.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
