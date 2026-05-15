'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Lead, LeadStatus, STATUS_LABELS } from '@/types'

interface Props {
  lead: Lead | null
  onSave: (data: Partial<Lead>) => Promise<void>
  onClose: () => void
}

export function LeadFormModal({ lead, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    company: lead?.company ?? '',
    website: lead?.website ?? '',
    address: lead?.address ?? '',
    city: lead?.city ?? '',
    country: lead?.country ?? '',
    category: lead?.category ?? '',
    status: lead?.status ?? 'new',
    notes: lead?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      ...form,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      website: form.website || null,
      address: form.address || null,
      city: form.city || null,
      country: form.country || null,
      category: form.category || null,
      notes: form.notes || null,
    } as Partial<Lead>)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {lead ? 'Editar Lead' : 'Nuevo Lead'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *" required>
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="input"
                placeholder="Nombre del negocio"
              />
            </Field>
            <Field label="Empresa">
              <input
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                className="input"
                placeholder="Empresa"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="input"
                placeholder="email@ejemplo.com"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="input"
                placeholder="+52 555 000 0000"
              />
            </Field>
            <Field label="Sitio web">
              <input
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                className="input"
                placeholder="www.ejemplo.com"
              />
            </Field>
            <Field label="Categoría">
              <input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="input"
                placeholder="Ej: Restaurante, Gym..."
              />
            </Field>
            <Field label="Ciudad">
              <input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                className="input"
                placeholder="Ciudad"
              />
            </Field>
            <Field label="País">
              <input
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                className="input"
                placeholder="País"
              />
            </Field>
          </div>

          <Field label="Dirección">
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className="input"
              placeholder="Dirección completa"
            />
          </Field>

          <Field label="Estado">
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              className="input"
            >
              {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="Notas">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="Notas sobre este lead..."
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : lead ? 'Guardar cambios' : 'Crear Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
