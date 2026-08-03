/**
 * Post-build para el modo `output: 'standalone'` de Next.js.
 *
 * Next genera un servidor autónomo en `.next/standalone`, pero NO copia dentro
 * los archivos estáticos (`.next/static`) ni la carpeta `public`. Sin ellos, la
 * app arranca pero se ve rota (sin CSS, sin JS de cliente). Este script los copia.
 *
 * Escrito en Node (no en comandos shell) para que funcione igual en Windows
 * —donde compilas— y en el servidor Linux de cPanel.
 */
import { cpSync, existsSync } from 'fs'
import path from 'path'

const root = process.cwd()
const standalone = path.join(root, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.error('postbuild: no existe .next/standalone. ¿Está output:"standalone" en next.config?')
  process.exit(0) // No abortar el build; solo avisar.
}

// 1. Estáticos de Next -> .next/standalone/.next/static
const staticSrc = path.join(root, '.next', 'static')
if (existsSync(staticSrc)) {
  cpSync(staticSrc, path.join(standalone, '.next', 'static'), { recursive: true })
  console.log('postbuild: copiado .next/static')
}

// 2. Carpeta public -> .next/standalone/public
const publicSrc = path.join(root, 'public')
if (existsSync(publicSrc)) {
  cpSync(publicSrc, path.join(standalone, 'public'), { recursive: true })
  console.log('postbuild: copiado public')
}

console.log('postbuild: listo.')
