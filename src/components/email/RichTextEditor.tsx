'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Indent, Outdent, Link2, Link2Off,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Quote, Minus, RemoveFormatting, Image as ImageIcon,
  Palette, Highlighter, ChevronDown,
} from 'lucide-react'

/**
 * Editor de correo enriquecido, con la barra de herramientas que espera
 * cualquiera que haya usado Outlook o Gmail.
 *
 * Trabaja sobre un `contentEditable` y `document.execCommand`. La API está
 * marcada como obsoleta pero sigue siendo la única soportada por todos los
 * navegadores sin traer una librería de editor completa; para el alcance de un
 * correo (negritas, listas, enlaces, color) cumple de sobra.
 *
 * El valor que entra y sale es HTML. Las plantillas antiguas guardadas como
 * texto plano se convierten al abrirlas (ver `ensureHtml`).
 */

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Variables {{campo}} que se pueden insertar desde la barra. */
  variables?: { key: string; label: string }[]
  minHeight?: number
}

/**
 * Detecta si una cadena ya es HTML o es texto plano heredado.
 *
 * Además de las etiquetas hay que reconocer las entidades: al pulsar espacio el
 * navegador escribe `&nbsp;`, y un texto así no lleva ninguna etiqueta. Sin
 * esta comprobación se tomaría por texto plano y se escaparía el `&`.
 */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value) || /&(?:[a-z]+|#\d+);/i.test(value)
}

/**
 * Convierte las marcas `<font size="7">` que deja `execCommand('fontSize')` en
 * spans con un tamaño exacto en píxeles.
 *
 * Al cambiar el tamaño de un texto que ya lo tenía, el navegador envuelve el
 * span anterior dentro del nuevo; como en CSS gana el más interno, hay que
 * limpiar el `font-size` de los descendientes o el cambio no se vería.
 *
 * Devuelve los spans creados para poder volver a seleccionarlos: sin eso el
 * rango guardado apuntaría a nodos ya destruidos y la barra dejaría de
 * responder a partir del segundo cambio.
 */
export function replaceFontMarkers(editor: HTMLElement, px: number): HTMLElement[] {
  const created: HTMLElement[] = []

  editor.querySelectorAll('font[size="7"]').forEach((node) => {
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    // Mueve los nodos en vez de copiar el HTML: conserva la estructura interna.
    while (node.firstChild) span.appendChild(node.firstChild)
    node.replaceWith(span)
    created.push(span)
  })

  // El tamaño heredado de una aplicación anterior tiene que desaparecer.
  for (const span of created) {
    span.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((child) => {
      child.style.removeProperty('font-size')
      // Un span que solo existía para fijar el tamaño ya no aporta nada.
      if (child.tagName === 'SPAN' && child.getAttribute('style') === '') {
        child.replaceWith(...Array.from(child.childNodes))
      }
    })
    // Las <font size> anidadas de versiones previas también estorban.
    span.querySelectorAll('font[size]').forEach((child) => {
      child.replaceWith(...Array.from(child.childNodes))
    })
  }

  return created
}

/**
 * Normaliza un cuerpo guardado para editarlo: el texto plano de plantillas
 * antiguas se convierte a HTML para que no se pierdan los saltos de línea.
 */
export function ensureHtml(value: string): string {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\r?\n/g, '<br>')
}

const FONTS = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Candara, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]

const SIZES = [10, 11, 12, 14, 16, 18, 24, 32]

const TEXT_COLORS = [
  '#111827', '#374151', '#6b7280', '#b91c1c', '#c2410c', '#a16207',
  '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d', '#ffffff',
]

const HIGHLIGHTS = [
  '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff', 'transparent',
]

/** Interlineado disponible; se aplica al bloque donde está el cursor. */
const LINE_HEIGHTS = [
  { label: 'Sencillo', value: '1.4' },
  { label: '1.5 líneas', value: '1.75' },
  { label: 'Doble', value: '2.2' },
]

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escribe tu mensaje…',
  variables = [],
  minHeight = 240,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<string | null>(null)
  // Formatos activos donde está el cursor, para iluminar los botones.
  const [active, setActive] = useState<Record<string, boolean>>({})
  // La selección se pierde al pulsar un botón: se guarda antes de abrir menús.
  const savedRange = useRef<Range | null>(null)

  // Último HTML que emitió este editor. Sirve para distinguir el valor que
  // vuelve del propio componente de uno que llega de fuera.
  const lastEmitted = useRef<string | null>(null)

  // Vuelca el valor recibido solo cuando difiere del DOM: escribirlo en cada
  // tecleo movería el cursor al principio en cada pulsación.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // `ensureHtml` solo debe tocar lo que viene de fuera (una plantilla antigua
    // guardada como texto plano). Lo que emitió el editor ya es HTML: volver a
    // escaparlo convertiría el &nbsp; de cada espacio en &amp;nbsp;, y el error
    // se multiplicaría con cada pulsación.
    const html = value === lastEmitted.current ? value : ensureHtml(value)
    if (el.innerHTML !== html) el.innerHTML = html
  }, [value])

  const emit = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Al borrarlo todo, el navegador suele dejar un <br> suelto. Eso impide que
    // reaparezca el texto de ayuda y guarda una plantilla "vacía" que parece
    // llena, así que se normaliza a cadena vacía.
    const raw = el.innerHTML
    const html = /^(<br\s*\/?>|<div><br\s*\/?><\/div>|&nbsp;)$/i.test(raw.trim()) ? '' : raw
    lastEmitted.current = html
    onChange(html)
  }, [onChange])

  /** Refresca qué formatos están activos bajo el cursor. */
  const syncActive = useCallback(() => {
    if (typeof document === 'undefined') return
    const next: Record<string, boolean> = {}
    for (const cmd of ['bold', 'italic', 'underline', 'strikeThrough',
      'insertUnorderedList', 'insertOrderedList',
      'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull']) {
      try {
        next[cmd] = document.queryCommandState(cmd)
      } catch {
        next[cmd] = false
      }
    }
    setActive(next)
  }, [])

  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  /**
   * Devuelve el foco al editor y recupera la selección que había antes de
   * pulsar un botón. Un rango cuyos nodos ya fueron reemplazados deja de ser
   * válido: en ese caso se descarta en vez de arrastrar el error.
   */
  function restoreSelection() {
    const editor = ref.current
    if (!editor) return
    editor.focus()

    const range = savedRange.current
    if (!range) return
    if (!editor.contains(range.commonAncestorContainer)) {
      savedRange.current = null
      return
    }
    try {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch {
      // El rango quedó desconectado del documento; se empieza de cero.
      savedRange.current = null
    }
  }

  /** Ejecuta un comando del editor conservando el foco y avisando del cambio. */
  const run = useCallback((command: string, arg?: string) => {
    restoreSelection()
    // styleWithCSS hace que se generen estilos en línea en vez de etiquetas
    // <font>, que los clientes de correo modernos interpretan mejor.
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* no soportado */ }
    document.execCommand(command, false, arg)
    // El comando pudo reescribir el DOM: se vuelve a guardar el rango vigente
    // para que el siguiente botón no trabaje sobre nodos obsoletos.
    saveSelection()
    emit()
    syncActive()
  }, [emit, syncActive])

  /**
   * Aplica un tamaño exacto en píxeles.
   *
   * `execCommand('fontSize')` solo acepta los valores 1-7 de HTML, así que se
   * usa el 7 como marca y luego se sustituyen esos nodos por el tamaño real.
   */
  function applyFontSize(px: number) {
    restoreSelection()
    const editor = ref.current
    if (!editor) return

    document.execCommand('fontSize', false, '7')
    const created = replaceFontMarkers(editor, px)

    // Reselecciona el texto que se acaba de cambiar: así se puede seguir
    // aplicando formato encima y el rango guardado vuelve a ser válido.
    if (created.length > 0) {
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStartBefore(created[0])
      range.setEndAfter(created[created.length - 1])
      sel?.removeAllRanges()
      sel?.addRange(range)
      savedRange.current = range.cloneRange()
    }

    emit()
    syncActive()
  }

  /**
   * Aplica interlineado al párrafo donde está el cursor.
   *
   * Si el texto está suelto en la raíz del editor, `formatBlock` lo envuelve
   * antes en un <div>: así el estilo afecta solo a ese párrafo y no a todo el
   * mensaje.
   */
  function applyLineHeight(value: string) {
    restoreSelection()
    const editor = ref.current
    if (!editor) return
    document.execCommand('formatBlock', false, '<div>')

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const start: Node = sel.getRangeAt(0).commonAncestorContainer
    let block: HTMLElement | null =
      start.nodeType === Node.TEXT_NODE ? start.parentElement : (start as HTMLElement)

    // Sube hasta el hijo directo del editor: ese es el párrafo a estilar.
    while (block && block.parentElement && block.parentElement !== editor) {
      block = block.parentElement
    }
    if (block && block.parentElement === editor) {
      block.style.lineHeight = value
    }
    emit()
  }

  function insertLink() {
    saveSelection()
    const url = window.prompt('Dirección del enlace (https://…)')
    if (!url) return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    restoreSelection()
    const sel = window.getSelection()
    // Sin texto seleccionado, se inserta la propia dirección como texto.
    if (sel && sel.isCollapsed) {
      run('insertHTML', `<a href="${safe}" target="_blank" rel="noopener">${safe}</a>`)
    } else {
      run('createLink', safe)
    }
  }

  function insertImage() {
    saveSelection()
    const url = window.prompt('Dirección de la imagen (https://…)')
    if (!url) return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    run('insertHTML', `<img src="${safe}" alt="" />`)
  }

  function insertVariable(key: string) {
    run('insertHTML', `<span class="crm-var">{{${key}}}</span>&nbsp;`)
  }

  // Cierra los menús desplegables al hacer clic fuera.
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-editor-menu]')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  function toggleMenu(name: string) {
    saveSelection()
    setMenu((m) => (m === name ? null : name))
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* ---------------- Barra de herramientas ---------------- */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">
        <TB onClick={() => run('undo')} title="Deshacer"><Undo2 className="w-4 h-4" /></TB>
        <TB onClick={() => run('redo')} title="Rehacer"><Redo2 className="w-4 h-4" /></TB>

        <Sep />

        {/* Tipografía */}
        <Menu
          name="font"
          open={menu === 'font'}
          onToggle={() => toggleMenu('font')}
          label="Fuente"
          width="w-44"
        >
          {FONTS.map((f) => (
            <MenuItem
              key={f.value}
              onClick={() => { run('fontName', f.value); setMenu(null) }}
            >
              <span style={{ fontFamily: f.value }}>{f.label}</span>
            </MenuItem>
          ))}
        </Menu>

        <Menu
          name="size"
          open={menu === 'size'}
          onToggle={() => toggleMenu('size')}
          label="Tamaño"
          width="w-24"
        >
          {SIZES.map((s) => (
            <MenuItem key={s} onClick={() => { applyFontSize(s); setMenu(null) }}>
              {s} px
            </MenuItem>
          ))}
        </Menu>

        <Sep />

        <TB onClick={() => run('bold')} title="Negrita (Ctrl+B)" active={active.bold}>
          <Bold className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('italic')} title="Cursiva (Ctrl+I)" active={active.italic}>
          <Italic className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('underline')} title="Subrayado (Ctrl+U)" active={active.underline}>
          <Underline className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('strikeThrough')} title="Tachado" active={active.strikeThrough}>
          <Strikethrough className="w-4 h-4" />
        </TB>

        {/* Colores */}
        <Menu
          name="color"
          open={menu === 'color'}
          onToggle={() => toggleMenu('color')}
          icon={<Palette className="w-4 h-4" />}
          title="Color del texto"
          width="w-44"
        >
          <div className="grid grid-cols-6 gap-1 p-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => { e.preventDefault(); run('foreColor', c); setMenu(null) }}
                className="h-5 w-5 rounded border border-gray-300 dark:border-gray-600"
                style={{ background: c }}
              />
            ))}
          </div>
        </Menu>

        <Menu
          name="highlight"
          open={menu === 'highlight'}
          onToggle={() => toggleMenu('highlight')}
          icon={<Highlighter className="w-4 h-4" />}
          title="Resaltado"
          width="w-40"
        >
          <div className="grid grid-cols-4 gap-1 p-1.5">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c}
                type="button"
                title={c === 'transparent' ? 'Sin resaltado' : c}
                onMouseDown={(e) => { e.preventDefault(); run('hiliteColor', c); setMenu(null) }}
                className="h-5 w-5 rounded border border-gray-300 dark:border-gray-600"
                style={{
                  background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#eee,#eee 3px,#fff 3px,#fff 6px)' : c,
                }}
              />
            ))}
          </div>
        </Menu>

        <TB onClick={() => run('removeFormat')} title="Quitar formato">
          <RemoveFormatting className="w-4 h-4" />
        </TB>

        <Sep />

        {/* Listas y sangría */}
        <TB onClick={() => run('insertUnorderedList')} title="Viñetas" active={active.insertUnorderedList}>
          <List className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('insertOrderedList')} title="Lista numerada" active={active.insertOrderedList}>
          <ListOrdered className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('outdent')} title="Reducir sangría"><Outdent className="w-4 h-4" /></TB>
        <TB onClick={() => run('indent')} title="Aumentar sangría"><Indent className="w-4 h-4" /></TB>

        <Sep />

        {/* Alineación */}
        <TB onClick={() => run('justifyLeft')} title="Alinear a la izquierda" active={active.justifyLeft}>
          <AlignLeft className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('justifyCenter')} title="Centrar" active={active.justifyCenter}>
          <AlignCenter className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('justifyRight')} title="Alinear a la derecha" active={active.justifyRight}>
          <AlignRight className="w-4 h-4" />
        </TB>
        <TB onClick={() => run('justifyFull')} title="Justificar" active={active.justifyFull}>
          <AlignJustify className="w-4 h-4" />
        </TB>

        <Menu
          name="spacing"
          open={menu === 'spacing'}
          onToggle={() => toggleMenu('spacing')}
          label="Interlineado"
          width="w-36"
        >
          {LINE_HEIGHTS.map((lh) => (
            <MenuItem key={lh.value} onClick={() => { applyLineHeight(lh.value); setMenu(null) }}>
              {lh.label}
            </MenuItem>
          ))}
        </Menu>

        <Sep />

        {/* Insertar */}
        <TB onClick={insertLink} title="Insertar enlace"><Link2 className="w-4 h-4" /></TB>
        <TB onClick={() => run('unlink')} title="Quitar enlace"><Link2Off className="w-4 h-4" /></TB>
        <TB onClick={insertImage} title="Insertar imagen por URL"><ImageIcon className="w-4 h-4" /></TB>
        <TB onClick={() => run('formatBlock', '<blockquote>')} title="Cita"><Quote className="w-4 h-4" /></TB>
        <TB onClick={() => run('insertHorizontalRule')} title="Línea divisoria"><Minus className="w-4 h-4" /></TB>

        {variables.length > 0 && (
          <>
            <Sep />
            <Menu
              name="vars"
              open={menu === 'vars'}
              onToggle={() => toggleMenu('vars')}
              label="Variables"
              width="w-48"
            >
              <p className="px-2.5 pt-2 pb-1 text-[11px] text-gray-400">
                Se sustituyen por los datos del lead
              </p>
              {variables.map((v) => (
                <MenuItem key={v.key} onClick={() => { insertVariable(v.key); setMenu(null) }}>
                  <span className="flex items-center justify-between gap-2">
                    <span>{v.label}</span>
                    <code className="text-[11px] text-blue-600 dark:text-blue-400">{`{{${v.key}}}`}</code>
                  </span>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

      </div>

      {/* ---------------- Área de edición ---------------- */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Cuerpo del mensaje"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={() => { saveSelection(); emit() }}
        onKeyUp={syncActive}
        onMouseUp={syncActive}
        style={{ minHeight }}
        className="rich-editor overflow-y-auto p-3 text-sm text-gray-800 dark:text-gray-200"
      />
    </div>
  )
}

/* ------------------------- Piezas de la barra ------------------------- */

/** Botón de la barra de herramientas. */
function TB({
  onClick, title, children, active = false,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      // onMouseDown en vez de onClick: evita que el editor pierda la selección
      // al pulsar el botón, que es lo que hace que el comando no se aplique.
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
}

/** Desplegable de la barra (fuente, tamaño, colores, variables…). */
function Menu({
  open, onToggle, label, icon, title, width, children,
}: {
  name: string
  open: boolean
  onToggle: () => void
  label?: string
  icon?: React.ReactNode
  title?: string
  width: string
  children: React.ReactNode
}) {
  return (
    <div className="relative" data-editor-menu>
      <button
        type="button"
        title={title ?? label}
        onMouseDown={(e) => { e.preventDefault(); onToggle() }}
        className={`flex items-center gap-1 rounded px-1.5 py-1.5 text-xs transition-colors ${
          open
            ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        {icon}
        {label && <span className="whitespace-nowrap">{label}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full z-30 mt-1 ${width} max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="block w-full px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      {children}
    </button>
  )
}
