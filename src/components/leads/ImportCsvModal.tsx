'use client'

import { useState, useRef } from 'react'
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import { IMPORTABLE_FIELDS, guessMapping, type ImportableFieldKey } from '@/lib/csv-mapping'

interface Props {
  folderId: string // carpeta seleccionada actualmente ('all' | 'none' | id)
  onClose: () => void
  onImported: () => void // recargar la lista tras importar
}

interface ImportResult {
  created: number
  duplicates: number
  skipped: number
  errors: number
  total: number
}

type Step = 'upload' | 'map' | 'done'

export function ImportCsvModal({ folderId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<ImportableFieldKey, number>>>({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImport() {
    if (mapping.name === undefined) {
      setError('Asigna la columna de Nombre antes de importar.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          mapping,
          // Solo pasamos carpeta si hay una concreta seleccionada.
          folderId: folderId === 'all' || folderId === 'none' ? null : folderId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al importar')
      setResult(data as ImportResult)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Importar contactos desde CSV</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
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
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) handleFile(file)
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl py-12 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">
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
          )}

          {/* STEP 2: mapear columnas */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-800">{fileName}</span>
                <span className="text-gray-400">·</span>
                <span>{rows.length} filas</span>
              </div>

              <p className="text-xs text-gray-500">
                Revisa qué columna de tu archivo corresponde a cada campo. El nombre es
                obligatorio; el resto es opcional.
              </p>

              <div className="space-y-2">
                {IMPORTABLE_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="w-28 shrink-0 text-sm text-gray-700">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setFieldColumn(field.key, e.target.value === '' ? null : Number(e.target.value))
                      }
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Vista previa de las primeras filas mapeadas */}
              {mapping.name !== undefined && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Vista previa (primeras 3):</p>
                  <div className="rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {rows.slice(0, 3).map((row, i) => (
                      <div key={i} className="flex gap-3 px-3 py-1.5 border-b border-gray-100 last:border-0">
                        <span className="font-medium text-gray-800">
                          {row[mapping.name!]?.trim() || '(sin nombre)'}
                        </span>
                        {mapping.email !== undefined && row[mapping.email]?.trim() && (
                          <span className="text-gray-500">{row[mapping.email].trim()}</span>
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

          {/* STEP 3: resultado */}
          {step === 'done' && result && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <h4 className="font-semibold text-gray-900 mb-1">Importación completada</h4>
              <div className="text-sm text-gray-600 space-y-0.5 mt-3">
                <p><span className="font-semibold text-green-600">{result.created}</span> contactos nuevos importados</p>
                {result.duplicates > 0 && (
                  <p><span className="font-medium text-gray-500">{result.duplicates}</span> ya existían (omitidos)</p>
                )}
                {result.skipped > 0 && (
                  <p><span className="font-medium text-amber-600">{result.skipped}</span> sin nombre (omitidos)</p>
                )}
                {result.errors > 0 && (
                  <p><span className="font-medium text-red-600">{result.errors}</span> con error</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          {step === 'map' && (
            <>
              <button
                onClick={() => { setStep('upload'); setError(null) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Atrás
              </button>
              <button
                onClick={handleImport}
                disabled={importing || mapping.name === undefined}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Importar {rows.length} contactos</>
                )}
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
