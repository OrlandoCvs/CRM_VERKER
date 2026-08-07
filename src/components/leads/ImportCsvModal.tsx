'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowRight, Download } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import { IMPORTABLE_FIELDS, guessMapping, type ImportableFieldKey } from '@/lib/csv-mapping'
import { buildFolderTree } from '@/lib/folders'
import type { Folder } from '@/types'

interface Props {
  /** Carpeta actualmente seleccionada en la vista ('all' | 'none' | id). */
  folderId: string
  /** Todas las carpetas, para el selector de destino. */
  folders: Folder[]
  onClose: () => void
  onImported: () => void // recargar la lista tras importar
  /** Crea una carpeta nueva y devuelve su id (para "crear carpeta al importar"). */
  onFolderCreated?: (folder: Folder) => void
}

/** Error de una fila concreta que devuelve el backend. */
interface RowError {
  row: number
  name: string
  reason: string
}

/** Resultado acumulado de todos los lotes. */
interface ImportTotals {
  created: number
  duplicates: number
  errors: RowError[]
}

/** Cómo decide el usuario dónde caen los leads. Obligatorio elegir uno. */
type Destination = 'new' | 'existing' | 'none' | null

/** Filas por lote enviadas al backend. Menos que el MAX del servidor, por margen. */
const BATCH_SIZE = 100

type Step = 'upload' | 'map' | 'importing' | 'done'

export function ImportCsvModal({ folderId, folders, onClose, onImported, onFolderCreated }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<ImportableFieldKey, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [totals, setTotals] = useState<ImportTotals | null>(null)
  const [progress, setProgress] = useState(0) // filas ya procesadas
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Destino de los leads (obligatorio) ---
  const [destination, setDestination] = useState<Destination>(
    // Si venías dentro de una carpeta concreta, pre-selecciona "usar existente".
    folderId !== 'all' && folderId !== 'none' ? 'existing' : null,
  )
  const [newFolderName, setNewFolderName] = useState('')
  const [existingFolderId, setExistingFolderId] = useState(
    folderId !== 'all' && folderId !== 'none' ? folderId : '',
  )

  // Carpetas ordenadas jerárquicamente para el <select> (con sangría por nivel).
  const folderOptions = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const walk = (nodes: ReturnType<typeof buildFolderTree>) => {
      for (const n of nodes) {
        out.push({ id: n.id, label: `${'  '.repeat(n.depth)}${n.name}` })
        if (n.children.length) walk(n.children)
      }
    }
    walk(buildFolderTree(folders))
    return out
  }, [folders])

  function handleFile(file: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const parsed = parseCsv(text)
        if (parsed.headers.length === 0) {
          setError('El archivo está vacío o no es un CSV válido.')
          return
        }
        if (parsed.rows.length === 0) {
          setError('El CSV tiene cabeceras pero ninguna fila de datos.')
          return
        }
        setFileName(file.name)
        setHeaders(parsed.headers)
        setRows(parsed.rows)
        setMapping(guessMapping(parsed.headers))
        setStep('map')
      } catch {
        setError('No se pudo leer el archivo. ¿Es un CSV?')
      }
    }
    reader.onerror = () => setError('Error al leer el archivo.')
    reader.readAsText(file, 'utf-8')
  }

  function setFieldColumn(field: ImportableFieldKey, columnIndex: number | null) {
    setMapping((prev) => {
      const next = { ...prev }
      if (columnIndex === null) {
        delete next[field]
      } else {
        // Una columna no puede alimentar dos campos: si estaba usada, la libera.
        for (const k of Object.keys(next) as ImportableFieldKey[]) {
          if (next[k] === columnIndex) delete next[k]
        }
        next[field] = columnIndex
      }
      return next
    })
  }

  /** Resuelve el destino elegido a un folderId concreto (creando la carpeta si toca). */
  async function resolveTargetFolder(): Promise<string | null> {
    if (destination === 'none') return null
    if (destination === 'existing') return existingFolderId || null
    if (destination === 'new') {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear la carpeta')
      onFolderCreated?.(data as Folder)
      return (data as Folder).id
    }
    return null
  }

  /** Valida el destino antes de dejar importar. */
  function destinationReady(): boolean {
    if (destination === 'new') return newFolderName.trim().length > 0
    if (destination === 'existing') return existingFolderId !== ''
    if (destination === 'none') return true
    return false
  }

  async function handleImport() {
    if (mapping.name === undefined) {
      setError('Asigna la columna de Nombre antes de importar.')
      return
    }
    if (!destinationReady()) {
      setError('Elige dónde guardar los leads antes de importar.')
      return
    }

    setError(null)
    setStep('importing')
    setProgress(0)

    const acc: ImportTotals = { created: 0, duplicates: 0, errors: [] }

    try {
      const targetFolderId = await resolveTargetFolder()

      // Envía el archivo en lotes para no exceder el tiempo de la función serverless
      // y poder mostrar progreso real.
      for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        const batch = rows.slice(offset, offset + BATCH_SIZE)
        const res = await fetch('/api/leads/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, mapping, folderId: targetFolderId, rowOffset: offset }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al importar')

        acc.created += data.created ?? 0
        acc.duplicates += data.duplicates ?? 0
        if (Array.isArray(data.errors)) acc.errors.push(...(data.errors as RowError[]))

        setProgress(Math.min(offset + batch.length, rows.length))
        setTotals({ ...acc })
      }

      setTotals(acc)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setStep('map') // vuelve al mapeo para reintentar sin perder el archivo
    }
  }

  /** Descarga las filas con error como CSV, para corregir y reimportar. */
  function downloadErrors() {
    if (!totals || totals.errors.length === 0) return
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [
      ['Fila', 'Nombre', 'Motivo'].join(','),
      ...totals.errors.map((e) => [e.row, escape(e.name), escape(e.reason)].join(',')),
    ]
    downloadCsv('errores-importacion.csv', '﻿' + lines.join('\r\n'))
  }

  /** Descarga una plantilla CSV de ejemplo con las columnas que entiende el sistema. */
  function downloadTemplate() {
    const cols = IMPORTABLE_FIELDS.map((f) => f.label)
    const example = [
      'Inmobiliaria Sol', 'Grupo Sol', 'contacto@sol.mx', '55 1234 5678',
      'https://sol.mx', 'Av. Reforma 100', 'CDMX', 'México', 'Inmobiliaria',
      'Cliente potencial',
    ]
    const content = '﻿' + [cols.join(','), example.map((c) => `"${c}"`).join(',')].join('\r\n')
    downloadCsv('plantilla-contactos.csv', content)
  }

  const total = rows.length
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Importar contactos desde CSV</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* STEP 1: subir archivo */}
          {step === 'upload' && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl py-12 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Arrastra tu archivo CSV aquí o haz clic para elegirlo
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  El sistema detectará las columnas automáticamente
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                  }}
                />
              </div>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 mx-auto"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar plantilla CSV de ejemplo
              </button>
            </div>
          )}

          {/* STEP 2: mapear columnas + destino */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-800 dark:text-gray-200">{fileName}</span>
                <span className="text-gray-400">·</span>
                <span>{rows.length} filas</span>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Revisa qué columna de tu archivo corresponde a cada campo. El nombre es
                obligatorio; el resto es opcional.
              </p>

              <div className="space-y-2">
                {IMPORTABLE_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="w-28 shrink-0 text-sm text-gray-700 dark:text-gray-300">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setFieldColumn(field.key, e.target.value === '' ? null : Number(e.target.value))
                      }
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Sin asignar —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Columna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Destino de los leads (obligatorio) */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2.5">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Destino de los leads <span className="text-red-500">*</span>
                </p>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="destination"
                    checked={destination === 'new'}
                    onChange={() => setDestination('new')}
                  />
                  Crear carpeta nueva
                  <input
                    type="text"
                    placeholder="Nombre de la carpeta"
                    value={newFolderName}
                    onFocus={() => setDestination('new')}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="destination"
                    checked={destination === 'existing'}
                    onChange={() => setDestination('existing')}
                  />
                  Usar carpeta existente
                  <select
                    value={existingFolderId}
                    onFocus={() => setDestination('existing')}
                    onChange={(e) => {
                      setExistingFolderId(e.target.value)
                      setDestination('existing')
                    }}
                    className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Elegir carpeta —</option>
                    {folderOptions.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="destination"
                    checked={destination === 'none'}
                    onChange={() => setDestination('none')}
                  />
                  Sin carpeta (quedan sueltos)
                </label>
              </div>

              {/* Vista previa de las primeras filas mapeadas */}
              {mapping.name !== undefined && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Vista previa (primeras 3):</p>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden text-xs">
                    {rows.slice(0, 3).map((row, i) => (
                      <div key={i} className="flex gap-3 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {row[mapping.name!]?.trim() || '(sin nombre)'}
                        </span>
                        {mapping.email !== undefined && row[mapping.email]?.trim() && (
                          <span className="text-gray-500 dark:text-gray-400">{row[mapping.email].trim()}</span>
                        )}
                        {mapping.phone !== undefined && row[mapping.phone]?.trim() && (
                          <span className="text-gray-400">{row[mapping.phone].trim()}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: importando (barra de progreso) */}
          {step === 'importing' && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
                Importando {progress} de {total}…
              </p>
              <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{pct}%</p>
              {totals && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {totals.created} nuevos · {totals.duplicates} duplicados
                </p>
              )}
            </div>
          )}

          {/* STEP 4: resultado */}
          {step === 'done' && totals && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Importación completada</h4>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5 mt-3">
                <p><span className="font-semibold text-green-600">{totals.created}</span> contactos nuevos importados</p>
                {totals.duplicates > 0 && (
                  <p><span className="font-medium text-gray-500 dark:text-gray-400">{totals.duplicates}</span> ya existían (omitidos)</p>
                )}
                {totals.errors.length > 0 && (
                  <p><span className="font-medium text-red-600">{totals.errors.length}</span> con avisos o errores</p>
                )}
              </div>

              {totals.errors.length > 0 && (
                <div className="mt-4 text-left">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 max-h-40 overflow-y-auto text-xs">
                    {totals.errors.slice(0, 50).map((e, i) => (
                      <div key={i} className="flex gap-2 px-3 py-1.5 border-b border-amber-100 last:border-0">
                        <span className="text-amber-700 shrink-0">Fila {e.row}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{e.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 ml-auto shrink-0">{e.reason}</span>
                      </div>
                    ))}
                    {totals.errors.length > 50 && (
                      <div className="px-3 py-1.5 text-gray-400">
                        …y {totals.errors.length - 50} más (descárgalos para verlos todos)
                      </div>
                    )}
                  </div>
                  <button
                    onClick={downloadErrors}
                    className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar filas con error (CSV)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-gray-800 px-5 py-4">
          {step === 'map' && (
            <>
              <button
                onClick={() => { setStep('upload'); setError(null) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
              >
                Atrás
              </button>
              <button
                onClick={handleImport}
                disabled={mapping.name === undefined || !destinationReady()}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" /> Importar {rows.length} contactos
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={() => { onImported(); onClose() }}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Ver leads
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Dispara la descarga de un archivo CSV en el navegador. */
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
