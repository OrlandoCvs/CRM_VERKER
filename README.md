# CRM Verker

CRM de generación de leads con búsqueda de negocios en Google Places (vía Apify),
organización en carpetas, pipeline, mapa de leads y **envío de correo automatizado**
(individual y campañas masivas con plantillas).

Stack: Next.js 16 (App Router) · React 19 · Prisma 7 + SQLite · Tailwind 4 · Leaflet.

## Puesta en marcha

```bash
npm install
npx prisma generate
npm run dev
```

Abre [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

> Si `better-sqlite3` da error de versión de Node, ejecuta `npm rebuild better-sqlite3`.

## Variables de entorno

Copia y completa `.env.local` (ver plantilla incluida):

| Variable | Para qué sirve |
| --- | --- |
| `DATABASE_URL` | Base SQLite. Por defecto `file:./dev.db`. |
| `APIFY_TOKEN` | Búsqueda de negocios en Google Places. Opcional. |
| `EMAIL_FROM` | Remitente de los correos. **Obligatorio para enviar.** |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` | Envío vía SMTP (Gmail, Outlook, dominio propio). |
| `RESEND_API_KEY` | Envío vía Resend (prioritario si está definido). |

### Correo automatizado

El CRM detecta automáticamente el proveedor:

- **SMTP** (recomendado para empezar): funciona con tu Gmail/Outlook usando una
  *contraseña de aplicación*. Sin verificar dominio, gratis, ~500 correos/día en Gmail.
- **Resend**: mejor entregabilidad para campañas grandes; requiere verificar un dominio.

Funcionalidad:

- **Correo individual**: botón *Enviar correo* en la ficha de cada lead.
- **Campañas masivas**: selecciona varios leads en *Leads* → *Enviar campaña*.
- **Plantillas** (`/templates`) con variables `{{name}}`, `{{company}}`, `{{city}}`,
  `{{category}}`, etc., que se reemplazan con los datos de cada lead.
- Cada envío queda registrado como actividad del lead y, opcionalmente, lo marca como *Contactado*.

## Migraciones

```bash
npx prisma migrate dev --name <nombre>   # crear/aplicar
npx prisma migrate status                # ver estado
```
