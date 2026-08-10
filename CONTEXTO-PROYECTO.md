# Verker CRM — Documento de contexto

> Este archivo resume el proyecto completo para poder consultarlo fuera del
> repositorio (por ejemplo, subiéndolo a un Proyecto de Claude). Sirve para
> preparar entrevistas, seguir desarrollando, explicárselo al cliente o
> estudiarlo.

---

## 1. Qué es

**Verker CRM** es una aplicación web de gestión de prospectos (CRM) desarrollada
a medida para una inmobiliaria mexicana. Su objetivo es cubrir el ciclo completo
de la prospección por correo frío: **encontrar** negocios potenciales,
**organizarlos**, **contactarlos** por email y **hacerles seguimiento** hasta
cerrar o descartar la operación.

- **URL de producción:** `app.verker.mx`
- **Repositorio:** `OrlandoCvs/CRM_VERKER`
- **Idioma de la interfaz:** español (México)
- **Tipo de proyecto:** encargo real para cliente, no ejercicio académico

### Explicado sin tecnicismos (para el cliente)

Es un sistema donde el equipo comercial:
1. Busca negocios de una zona y giro concretos, y los guarda como contactos.
2. También puede subir sus propias listas de contactos desde Excel.
3. Los organiza en carpetas por campaña o zona.
4. Les escribe correos personalizados usando plantillas.
5. Ve en un tablero en qué punto está cada trato y qué tiene pendiente.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Lenguaje | TypeScript |
| UI | React 19, TailwindCSS 4, lucide-react |
| Base de datos | PostgreSQL (Neon, serverless) |
| ORM | Prisma 5 |
| Hosting | Vercel (funciones serverless) |
| Envío de correo | Resend |
| Scraping | Apify (actor `compass/crawler-google-places`) |
| Gráficas | Recharts |
| Mapas | Leaflet / react-leaflet |
| Arrastrar y soltar | dnd-kit |
| PDF | pdf-lib + pdf.js (solo en el navegador) |

**Sin dependencias de UI pesadas:** el editor de texto enriquecido, el parser de
CSV y los compresores de imagen y PDF están escritos a medida.

---

## 3. Módulos y funcionalidades

### 3.1 Búsqueda de prospectos (`/search`)
Integración con Apify para extraer negocios de Google Maps.
- Búsqueda **por texto** ("inmobiliarias en Polanco") o **dibujando en el mapa**
  (círculo con radio, o polígono a mano alzada).
- Opción de enriquecer con **email y redes sociales** visitando la web de cada
  negocio (consume más créditos).
- **Medidor de créditos de Apify** en pantalla, con semáforo al 75% y 90%.
- Los resultados **persisten en `sessionStorage`**: cambiar de pestaña no pierde
  la búsqueda ni los créditos ya gastados.

### 3.2 Importación por CSV (`/leads` → Importar)
Permite subir listas propias sin depender de créditos de scraping.
- **Parser propio conforme a RFC 4180**: campos entrecomillados, comas y saltos
  de línea dentro de un campo, comillas dobladas, BOM de Excel, delimitador
  `,` o `;` autodetectado.
- **Mapeo automático de columnas** por alias en español e inglés (`Correo`,
  `E-mail`, `Celular`, `Giro`…), revisable por el usuario antes de importar.
- **Procesamiento por lotes** de 100 filas con barra de progreso real.
- **Destino obligatorio**: crear carpeta nueva, usar una existente o dejar
  sueltos — decisión explícita para evitar desorden.
- **Reporte de errores por fila** (nº, nombre, motivo) descargable en CSV.
- **Deduplicación** por placeId → teléfono → web → nombre+ciudad.

### 3.3 Organización en carpetas
- Carpetas **anidadas** con colores.
- **Arrastrar y soltar** leads y carpetas.
- Buscador que conserva los ancestros de cada resultado.
- Expandir/contraer todo, guías visuales de jerarquía.
- Conteo de leads incluyendo subcarpetas.

### 3.4 Embudo de ventas (`/pipeline`)
- Tablero kanban con 5 etapas: Nuevo → Contactado → Negociando → Ganado / Perdido.
- Arrastrar tarjetas entre columnas para cambiar el estado.
- **Resumen del embudo**: total, tasa de conversión (calculada sobre lo ya
  cerrado, no sobre todo) y distribución proporcional.
- Aviso en la tarjeta si el correo del lead **rebotó o fue marcado como spam**.

### 3.5 Correo (`/templates` y compositor)
- **Editor enriquecido propio** tipo Outlook: deshacer/rehacer, tipografía y
  tamaño, negrita/cursiva/subrayado/tachado, color y resaltado, listas,
  sangrías, alineación, interlineado, enlaces, imágenes, cita, línea divisoria.
- **Variables dinámicas** `{{name}}`, `{{company}}`, `{{city}}`… que se
  sustituyen por los datos de cada lead al enviar.
- **Plantillas** con buscador, duplicado y vista previa con datos de ejemplo.
- **Adjuntos** guardados en la base de datos, con vista previa incrustada de PDF
  e imágenes.
- Envío **en HTML y texto plano** simultáneamente (mejora la entregabilidad).
- **Validación MX** opcional de los destinatarios antes de enviar.

### 3.6 Entregabilidad
Webhook de Resend que actualiza el estado de cada envío:
- **Rebote duro** → el lead se marca y deja de recibir correos.
- **Marcado como spam** → nunca se le vuelve a escribir.
- Firma HMAC-SHA256 verificada (estándar Svix) y rechazo de eventos con más de
  5 minutos, para evitar reenvíos maliciosos.

### 3.7 Otros
- **Dashboard** con métricas y conversión.
- **Mapa de leads** geolocalizados.
- **Recordatorios** de seguimiento con aviso de vencidos.
- **Exportación** a CSV de lo que se esté viendo.
- **Modo día/noche** con selector claro/oscuro/automático, aplicado antes del
  primer pintado para evitar destellos.
- **Autenticación** por contraseña única (HMAC + cookie firmada + middleware).

---

## 4. Modelo de datos

```
Lead ──┬── Activity        (historial: llamadas, correos, notas)
       ├── Contact         (personas dentro del negocio)
       ├── Reminder        (seguimientos pendientes)
       ├── EmailDelivery   (cada envío y su estado)
       └── Folder          (carpeta, anidable con parentId)

EmailTemplate ── EmailAttachment  (binario en columna Bytes)
```

Campos destacables de `Lead`: datos del negocio, ubicación (lat/lng), redes
sociales, `source` (google_places | manual | import), `status` (etapa del
embudo) y `emailStatus` (entregabilidad).

---

## 5. Decisiones técnicas y problemas resueltos

Esta es la parte con más valor para una entrevista.

### 5.1 Migración de infraestructura por un bloqueo de WebAssembly
**Problema:** el despliegue inicial en hosting compartido (cPanel) fallaba con
`RangeError: WebAssembly.instantiate(): Out of memory`.

**Diagnóstico:** el servidor imponía `ulimit -v = 4GB`, lo que impide reservar
espacio de direcciones para WASM. Esto rompía dos cosas a la vez: Prisma 7 (que
usa un compilador de consultas en WASM) y el propio `fetch` de Node (que depende
de undici, también WASM). Sin `fetch` no hay Next.js.

**Solución:** al no ser corregible desde el lado del cliente, se migró el stack
completo — de SQLite a PostgreSQL, de Prisma 7 a Prisma 5 (motor binario) y del
hosting compartido a Vercel + Neon. Los adjuntos, que antes vivían en disco,
pasaron a guardarse como `Bytes` en la base, porque el hosting serverless no
tiene disco persistente.

### 5.2 Límite de 4.5 MB en las subidas
**Problema:** Vercel rechaza toda petición de más de 4.5 MB con un error 413
antes de que llegue al código de la aplicación. El límite de 10 MB que anunciaba
la interfaz nunca fue alcanzable y producía un fallo incomprensible.

**Solución sin servicios de pago añadidos:** comprimir en el navegador.
- **Imágenes:** redimensionado a 1600px y recodificación JPEG. Una foto de 12
  Mpx pasa de 1.8 MB a 273 KB.
- **PDF:** rasterizado con pdf.js y reconstrucción con pdf-lib, probando tres
  calidades sucesivas. Catálogos medidos: 5.5 MB → 1.3 MB, 22 MB → 2.6 MB,
  33 MB → 3.9 MB (77-89% de reducción).

**Beneficio secundario:** un correo más ligero mejora la entregabilidad, ya que
muchos servidores corporativos rechazan mensajes de más de 10 MB.

### 5.3 Timeout en la importación masiva
**Problema:** importar miles de filas en una sola petición excede el tiempo
máximo de una función serverless.

**Solución:** el cliente trocea el archivo en lotes de 100 filas y los envía
secuencialmente, lo que además permite mostrar progreso real y acumular el
reporte de errores.

### 5.4 Formatos que el navegador no reconoce (KMZ)
**Problema:** el cliente adjunta mapas de Google Earth. Un `.kmz` llega con el
tipo MIME vacío, como `application/octet-stream` o como `application/zip` según
el equipo, así que validar por el tipo declarado lo habría rechazado casi
siempre.

**Solución:** deducir el tipo de la **extensión** y guardar el tipo canónico en
lugar del recibido. Esto además impide registrar un `text/html` que después se
sirviera como página desde el propio dominio.

### 5.5 Escapado recursivo de entidades HTML
**Problema:** al pulsar espacio, el editor mostraba `&amp;nbsp;`, y el error se
multiplicaba con cada pulsación (`&amp;amp;amp;nbsp;`).

**Causa:** el navegador inserta `&nbsp;` al teclear un espacio. La función que
normalizaba plantillas antiguas en texto plano no detectaba ese contenido como
HTML (no lleva etiquetas) y escapaba el `&`. Cada ciclo repetía el escape.

**Solución:** distinguir el HTML que emite el propio editor —que nunca debe
volver a escaparse— del que llega de fuera, y reconocer también las entidades,
no solo las etiquetas. El mismo fallo afectaba al envío del correo.

### 5.6 Estado perdido al cambiar de pestaña
**Problema:** una búsqueda de Apify se perdía al navegar a otra sección,
desperdiciando los créditos ya consumidos.

**Solución:** persistir resultados y metadatos en `sessionStorage`, con opción
explícita de limpiar.

---

## 6. Restricciones y coste

Todo el sistema corre en **planes gratuitos**, con monitorización de las cuatro
métricas que podrían limitarlo:

| Métrica | Límite | Qué la hace subir |
|---|---|---|
| Vercel (peticiones, cómputo) | 1 M / mes | volumen de visitas |
| Neon — almacenamiento | 0.5 GB | adjuntos acumulados |
| Neon — transferencia | 5 GB / mes | envíos con adjunto |
| Neon — cómputo | 100 CU-hrs | horas de uso diario |

Neon suspende el cómputo tras ~5 minutos de inactividad y despierta en ~1
segundo, lo que mantiene bajo el consumo sin afectar a la experiencia.

---

## 7. Estructura del repositorio

```
src/
├── app/
│   ├── api/            26 endpoints (leads, folders, email, apify, auth…)
│   ├── dashboard/  leads/  pipeline/  reminders/  search/  map/  templates/
│   └── layout.tsx      tema aplicado antes del primer pintado
├── components/
│   ├── email/          RichTextEditor, TemplatesClient, EmailComposerModal,
│   │                   AttachmentPreview
│   ├── leads/          LeadsClient, FolderTree, ImportCsvModal, LeadDetail…
│   ├── pipeline/       PipelineClient (kanban)
│   ├── search/         SearchClient, ApifyUsage
│   └── layout/         Sidebar, ThemeToggle
├── lib/
│   ├── csv.ts          parser RFC 4180
│   ├── csv-mapping.ts  detección de columnas por alias
│   ├── dedup.ts        deduplicación de leads
│   ├── email.ts        envío, plantillas, HTML/texto
│   ├── image-compress.ts  /  pdf-compress.ts
│   ├── uploads.ts      tipos permitidos y límites
│   ├── folders.ts      árbol y jerarquía
│   └── db.ts           cliente Prisma cacheado (serverless)
└── types/index.ts      tipos y etiquetas del dominio
```

---

## 8. Estado actual

**Funcionando en producción.** Pendientes conocidos:
- Reforzar la contraseña de acceso antes de la entrega final.
- Conectar el webhook de Resend en el panel del proveedor (el código está listo).
- Los recordatorios son manuales: no hay envío automático programado.
