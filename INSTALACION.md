# Instalación de Verker CRM en la computadora del cliente

Guía para dejar el CRM corriendo en local (Windows).

## Requisitos previos

1. **Node.js** — descargar la versión **LTS** desde https://nodejs.org e instalarla
   (siguiente, siguiente, finalizar). Esto también instala `npm`.
2. **Internet** — el CRM lo necesita para buscar negocios, enviar correos y mostrar mapas.

## Paso 1 — Traer el proyecto

**Opción A (recomendada) — con GitHub:**
Necesita Git instalado (https://git-scm.com). En una terminal:
```
git clone https://github.com/OrlandoCvs/CRM_VERKER
cd CRM_VERKER
```

**Opción B — con USB:**
Copiar toda la carpeta del proyecto **excepto** `node_modules` y `.next`.

## Paso 2 — Crear los archivos de configuración

Estos NO vienen con el proyecto (contienen datos privados). Créalos en la raíz:

**Archivo `.env`:**
```
DATABASE_URL="file:./dev.db"
```

**Archivo `.env.local`:** copiar el contenido del `.env.local` original.
Antes de entregar, cambiar:
- `APP_PASSWORD` — la contraseña de acceso del cliente
- `AUTH_SECRET` — una cadena larga y aleatoria

## Paso 3 — Instalar

Doble clic en **`instalar.bat`** y esperar a que termine (varios minutos, solo la primera vez).

> Si prefieres hacerlo a mano, es lo mismo que ejecutar:
> `npm install` → `npx prisma generate` → `npx prisma migrate deploy` → `npm run build`

## Paso 4 — Usar el CRM

Doble clic en **`iniciar.bat`**. Se abre el navegador en http://localhost:3000.

- Para **apagar** el CRM: cerrar la ventana negra.
- Para **volver a usarlo**: doble clic en `iniciar.bat` otra vez.

## Actualizar a una versión nueva (solo con GitHub)

```
git pull
```
Luego volver a ejecutar `instalar.bat` (por si hubo cambios en dependencias o base de datos).
