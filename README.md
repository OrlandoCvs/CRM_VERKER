<div align="center">

# Verker CRM

**CRM de prospección por correo frío**, construido a medida para un cliente real del sector inmobiliario en México — desde la captación de leads hasta el envío de campañas y el seguimiento de entregabilidad.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)](https://neon.tech)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)

**[Español](#-español)** · **[English](#-english)**

</div>

---

## 🇲🇽 Español

### Qué resuelve

El equipo comercial de una inmobiliaria necesitaba dejar de gestionar prospectos en hojas de cálculo sueltas. Verker CRM cubre el ciclo completo de la prospección en frío:

1. **Encontrar** negocios potenciales — buscando en Google Maps o LinkedIn, o subiendo listas propias en Excel.
2. **Organizarlos** en carpetas por campaña o zona.
3. **Contactarlos** con correos personalizados desde plantillas reutilizables.
4. **Darles seguimiento** en un tablero visual hasta cerrar o descartar el trato.

Diseñado y construido en solitario — producto, backend, frontend, infraestructura y despliegue — para un cliente real, en producción.

### Funcionalidades

**Captación de prospectos**
- Búsqueda de negocios en **Google Maps** por texto o dibujando una zona en el mapa (círculo o polígono a mano alzada).
- Búsqueda de **perfiles de LinkedIn** por cargo y ubicación.
- **Historial de búsquedas** (30 días): cada resultado pagado con créditos queda guardado para revisarlo e importarlo más tarde sin repetir el gasto.
- **Medidor de créditos de Apify** en pantalla, con aviso al acercarse al límite.
- **Importación desde Excel** con mapeo automático de columnas por alias en español e inglés, reporte de errores por fila descargable, y deduplicación entre fuentes.

**Organización y seguimiento**
- Carpetas anidadas con arrastrar y soltar.
- **Embudo de ventas** tipo kanban (Nuevo → Contactado → Negociando → Ganado/Perdido) con tasa de conversión.
- Mapa con los leads geolocalizados.
- Recordatorios de seguimiento con aviso de vencidos.
- Dashboard con métricas del funnel.

**Correo**
- **Editor de texto enriquecido propio**, sin librerías externas: tipografía, color, listas, alineación, imágenes, enlaces — comparable a un editor de correo convencional.
- Plantillas con **variables dinámicas** (`{{name}}`, `{{company}}`, `{{city}}`…) sustituidas por lead al enviar.
- Adjuntos (imágenes, PDF, `.kmz`) con **compresión automática en el navegador** para respetar el límite de payload del hosting serverless.
- Envío individual o en campaña masiva, en HTML y texto plano simultáneos.

**Entregabilidad y cumplimiento**
- Webhook firmado que detecta rebotes duros y quejas de spam, y bloquea el reenvío a esos contactos.
- **Baja de un clic** (`List-Unsubscribe`) con enlaces firmados por HMAC, sin exponer endpoints donde alguien pueda dar de baja a otra persona.

**Otros**
- Modo claro/oscuro/automático, aplicado antes del primer pintado (sin parpadeo).
- Autenticación por contraseña con cookie firmada y middleware.

### Aspectos técnicos destacables

Esta sección resume los problemas de ingeniería que tuvieron mayor impacto en el proyecto — la parte con más valor en una entrevista técnica.

<details>
<summary><strong>Migración completa de infraestructura por un límite de memoria en WebAssembly</strong></summary>

El primer despliegue, en hosting compartido, fallaba con `WebAssembly.instantiate(): Out of memory`. El servidor imponía `ulimit -v = 4GB`, lo que impedía reservar espacio de direcciones para WASM — y rompía a la vez el motor de consultas de Prisma 7 y el propio `fetch` de Node (basado en undici, también WASM). Sin `fetch`, Next.js no arranca.

No era corregible del lado del cliente, así que se migró el stack completo: SQLite → PostgreSQL (Neon), Prisma 7 → Prisma 5 (motor binario), hosting compartido → Vercel. Los adjuntos, que vivían en disco, pasaron a guardarse como binario en la base de datos, porque el entorno serverless no tiene disco persistente.
</details>

<details>
<summary><strong>Límite de 4.5 MB por petición → compresión en el navegador</strong></summary>

Vercel rechaza cualquier petición de más de 4.5 MB con un 413 antes de que llegue al código de la aplicación. La solución fue comprimir del lado del cliente sin depender de servicios de pago:

- **Imágenes:** redimensionado a 1600 px y recodificación JPEG — una foto de 12 Mpx pasa de 1.8 MB a 273 KB.
- **PDF:** rasterizado con pdf.js y reconstrucción con pdf-lib, probando calidades sucesivas hasta entrar en el límite — reducciones medidas del 77-89% en catálogos reales.
</details>

<details>
<summary><strong>Parser de Excel/CSV propio, conforme a RFC 4180</strong></summary>

Sin librerías de terceros: campos entrecomillados, comas y saltos de línea dentro de un campo, comillas dobladas, BOM de Excel, delimitador `,` o `;` autodetectado, y mapeo automático de columnas por alias (`Correo`/`E-mail`, `Celular`/`Teléfono`, `Giro`/`Categoría`…) revisable antes de importar.
</details>

<details>
<summary><strong>Deduplicación entre múltiples fuentes</strong></summary>

Los mismos leads pueden llegar por Google Maps, LinkedIn o Excel, con campos distintos y a veces ausentes. La deduplicación encadena varias claves según el tipo de origen — placeId → LinkedIn → teléfono → sitio web → nombre + ciudad — para no crear duplicados sin descartar contactos legítimos que coincidan solo parcialmente.
</details>

<details>
<summary><strong>Escapado recursivo de entidades HTML en el editor</strong></summary>

Al pulsar espacio, el editor mostraba `&amp;nbsp;`, y el problema se multiplicaba con cada tecla (`&amp;amp;amp;nbsp;`). La causa: la función que normalizaba texto plano no reconocía como HTML un contenido que solo tenía entidades (`&nbsp;`) sin etiquetas, así que volvía a escapar el `&` del propio HTML generado por el editor en cada renderizado. La corrección distingue el HTML que emite el editor —que nunca debe re-escaparse— del que llega de fuera, y detecta entidades además de etiquetas. El mismo error afectaba al envío real de correos y se corrigió ahí también.
</details>

<details>
<summary><strong>Baja de un clic con tokens firmados</strong></summary>

El endpoint de baja verifica un token HMAC-SHA256 de forma segura frente a ataques de temporización, y nunca deja dar de baja a un lead a partir de un token manipulado o de otro contacto. El webhook de entregabilidad usa el mismo patrón de verificación de firma (estándar Svix) y rechaza eventos con más de 5 minutos de antigüedad, para evitar reenvíos maliciosos.
</details>

### Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Lenguaje | TypeScript |
| UI | React 19 · TailwindCSS 4 · lucide-react |
| Base de datos | PostgreSQL (Neon, serverless) |
| ORM | Prisma 5 |
| Hosting | Vercel (funciones serverless) |
| Envío de correo | Resend / SMTP, con detección automática |
| Captación de datos | Apify (Google Places + LinkedIn) |
| Mapas | Leaflet / react-leaflet |
| Gráficas | Recharts |
| Arrastrar y soltar | dnd-kit |
| PDF en navegador | pdf-lib + pdf.js |

Sin librerías de UI pesadas para las piezas centrales: el editor de texto enriquecido, el parser de Excel/CSV y los compresores de imagen y PDF están escritos a medida.

### Modelo de datos

```
Lead ──┬── Activity        (historial: llamadas, correos, notas)
       ├── Contact         (personas dentro del negocio)
       ├── Reminder        (seguimientos pendientes)
       ├── EmailDelivery   (cada envío y su estado de entregabilidad)
       └── Folder          (carpeta, anidable)

EmailTemplate ── EmailAttachment   (binario en base de datos)

SearchRun ── SearchResult          (historial de búsquedas de Apify)
```

### Estructura del repositorio

```
src/
├── app/
│   ├── api/           25+ endpoints (leads, folders, email, apify, search-history, unsubscribe, auth…)
│   ├── dashboard/ leads/ pipeline/ reminders/ search/ map/ templates/
│   └── layout.tsx     tema claro/oscuro aplicado antes del primer pintado
├── components/
│   ├── email/          RichTextEditor propio, plantillas, vista previa de adjuntos
│   ├── leads/           gestión de leads, carpetas, importación, deduplicación
│   ├── pipeline/        tablero kanban
│   ├── search/          búsqueda + historial (Google Maps y LinkedIn)
│   └── layout/          navegación, selector de tema
├── lib/
│   ├── csv.ts            parser RFC 4180
│   ├── csv-mapping.ts    detección de columnas por alias
│   ├── dedup.ts           deduplicación multi-fuente
│   ├── email.ts            envío, plantillas, HTML/texto plano
│   ├── unsubscribe.ts      tokens firmados de baja
│   ├── search-history.ts   registro y purga del historial de búsquedas
│   ├── image-compress.ts / pdf-compress.ts
│   └── uploads.ts          tipos permitidos y límites
└── types/index.ts
```

### Puesta en marcha

```bash
npm install
npx prisma generate
npm run dev
```

Requiere un `.env.local` con, como mínimo, `DATABASE_URL` (PostgreSQL) y `APP_PASSWORD`. El resto de variables (Apify, Resend/SMTP) son opcionales y activan cada integración solo si están presentes.

### Estado

En producción para el cliente. Todo el sistema corre en planes gratuitos, con monitorización activa de los límites de Vercel y Neon (cómputo, almacenamiento y transferencia) para anticipar cuándo haría falta escalar.

---

## 🇬🇧 English

### What it solves

The sales team at a real-estate client needed to stop managing prospects across scattered spreadsheets. Verker CRM covers the full cold-outreach cycle:

1. **Find** potential businesses — scraping Google Maps or LinkedIn, or uploading their own Excel lists.
2. **Organize** them into folders by campaign or region.
3. **Reach out** with personalized emails built from reusable templates.
4. **Track** each deal on a visual pipeline until it's won or dropped.

Designed and built solo — product, backend, frontend, infrastructure, and deployment — for a real client, in production.

### Features

**Lead sourcing**
- Business search on **Google Maps** by keyword or by drawing an area on the map (circle or freehand polygon).
- **LinkedIn profile search** by job title and location.
- **Search history** (30-day retention): every credit-consuming search result is saved so it can be reviewed and imported later without paying for it again.
- On-screen **Apify credit meter** with a warning as usage approaches the limit.
- **Excel import** with automatic column mapping (Spanish/English aliases), a downloadable per-row error report, and cross-source deduplication.

**Organization & tracking**
- Nested folders with drag and drop.
- **Kanban-style pipeline** (New → Contacted → Negotiating → Won/Lost) with conversion rate.
- Map view of geolocated leads.
- Follow-up reminders with an overdue indicator.
- Dashboard with funnel metrics.

**Email**
- **Custom rich text editor**, no third-party libraries: fonts, color, lists, alignment, images, links — comparable to a mainstream email client.
- Templates with **dynamic variables** (`{{name}}`, `{{company}}`, `{{city}}`…) substituted per lead on send.
- Attachments (images, PDFs, `.kmz`) with **client-side compression** to stay under the serverless host's payload limit.
- Single or bulk-campaign sending, HTML and plain text simultaneously.

**Deliverability & compliance**
- Signed webhook that detects hard bounces and spam complaints, and blocks further sends to those contacts.
- **One-click unsubscribe** (`List-Unsubscribe`) with HMAC-signed links, with no endpoint that could unsubscribe someone else's contact.

**Other**
- Light/dark/auto theme, applied before first paint (no flash).
- Password-based auth with a signed cookie and middleware.

### Engineering highlights

The problems below had the biggest impact on the project — the part most worth discussing in a technical interview.

<details>
<summary><strong>Full infrastructure migration triggered by a WebAssembly memory limit</strong></summary>

The first deployment, on shared hosting, failed with `WebAssembly.instantiate(): Out of memory`. The host enforced `ulimit -v = 4GB`, which blocked address-space reservation for WASM — breaking both Prisma 7's query engine and Node's own `fetch` (undici-based, also WASM). Without `fetch`, Next.js doesn't boot.

Not fixable client-side, so the whole stack moved: SQLite → PostgreSQL (Neon), Prisma 7 → Prisma 5 (binary engine), shared hosting → Vercel. Attachments, which used to live on disk, moved to binary columns in the database, since the serverless environment has no persistent disk.
</details>

<details>
<summary><strong>4.5 MB request limit → browser-side compression</strong></summary>

Vercel rejects any request over 4.5 MB with a 413 before it reaches application code. Solved by compressing client-side, with no added paid services:

- **Images:** resized to 1600px and re-encoded as JPEG — a 12 MP photo goes from 1.8 MB to 273 KB.
- **PDFs:** rasterized with pdf.js and rebuilt with pdf-lib, trying successive quality levels until it fits — measured 77-89% reductions on real catalogs.
</details>

<details>
<summary><strong>Custom RFC 4180-compliant Excel/CSV parser</strong></summary>

No third-party libraries: quoted fields, commas and line breaks inside a field, doubled quotes, Excel's BOM, auto-detected `,`/`;` delimiter, and automatic column mapping by alias (`Email`/`Correo`, `Phone`/`Celular`, `Category`/`Giro`…), reviewable before import.
</details>

<details>
<summary><strong>Cross-source deduplication</strong></summary>

The same lead can arrive via Google Maps, LinkedIn, or Excel, with different — sometimes missing — fields. Deduplication chains several keys depending on the source type — placeId → LinkedIn URL → phone → website → name + city — to avoid duplicates without discarding legitimate contacts that only partially match.
</details>

<details>
<summary><strong>Recursive HTML entity escaping in the editor</strong></summary>

Pressing space made the editor display `&amp;nbsp;`, compounding with every keystroke (`&amp;amp;amp;nbsp;`). Root cause: the function that normalized legacy plain-text templates didn't recognize content with only entities (`&nbsp;`) and no tags as HTML, so it re-escaped the `&` in the editor's own generated output on every render. The fix distinguishes HTML emitted by the editor itself — which must never be re-escaped — from HTML coming from outside, and detects entities in addition to tags. The same bug affected real outgoing emails and was fixed there too.
</details>

<details>
<summary><strong>Signed one-click unsubscribe</strong></summary>

The unsubscribe endpoint verifies an HMAC-SHA256 token using timing-safe comparison, and never lets a tampered or borrowed token unsubscribe someone else's lead. The deliverability webhook uses the same signature-verification pattern (Svix standard) and rejects events older than 5 minutes, to prevent replay attacks.
</details>

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| UI | React 19 · TailwindCSS 4 · lucide-react |
| Database | PostgreSQL (Neon, serverless) |
| ORM | Prisma 5 |
| Hosting | Vercel (serverless functions) |
| Email delivery | Resend / SMTP, auto-detected |
| Data sourcing | Apify (Google Places + LinkedIn) |
| Maps | Leaflet / react-leaflet |
| Charts | Recharts |
| Drag and drop | dnd-kit |
| In-browser PDF | pdf-lib + pdf.js |

No heavy UI libraries for the core pieces: the rich text editor, the Excel/CSV parser, and the image/PDF compressors are all hand-built.

### Data model

```
Lead ──┬── Activity        (call/email/note history)
       ├── Contact         (people within the business)
       ├── Reminder        (pending follow-ups)
       ├── EmailDelivery   (each send and its deliverability status)
       └── Folder          (nestable)

EmailTemplate ── EmailAttachment   (binary stored in the database)

SearchRun ── SearchResult          (Apify search history)
```

### Repository structure

```
src/
├── app/
│   ├── api/           25+ endpoints (leads, folders, email, apify, search-history, unsubscribe, auth…)
│   ├── dashboard/ leads/ pipeline/ reminders/ search/ map/ templates/
│   └── layout.tsx     theme applied before first paint
├── components/
│   ├── email/          custom RichTextEditor, templates, attachment preview
│   ├── leads/           lead management, folders, import, deduplication
│   ├── pipeline/        kanban board
│   ├── search/          search + history (Google Maps and LinkedIn)
│   └── layout/          navigation, theme toggle
├── lib/
│   ├── csv.ts            RFC 4180 parser
│   ├── csv-mapping.ts    alias-based column detection
│   ├── dedup.ts           cross-source deduplication
│   ├── email.ts            sending, templates, HTML/plain text
│   ├── unsubscribe.ts      signed unsubscribe tokens
│   ├── search-history.ts   search history recording and purge
│   ├── image-compress.ts / pdf-compress.ts
│   └── uploads.ts          allowed types and limits
└── types/index.ts
```

### Getting started

```bash
npm install
npx prisma generate
npm run dev
```

Requires a `.env.local` with, at minimum, `DATABASE_URL` (PostgreSQL) and `APP_PASSWORD`. All other variables (Apify, Resend/SMTP) are optional and each integration only activates when its variables are present.

### Status

Live in production for the client. The entire system runs on free tiers, with active monitoring of Vercel's and Neon's limits (compute, storage, transfer) to anticipate when scaling would become necessary.
</content>
