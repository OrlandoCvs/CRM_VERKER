/**
 * Punto de arranque para Passenger (cPanel "Setup Node.js App").
 *
 * cPanel arranca la app ejecutando este archivo. Next.js en modo `standalone`
 * genera su propio servidor en `.next/standalone/server.js`; aquí solo lo
 * lanzamos. Passenger pasa el puerto por la variable de entorno PORT.
 *
 * Requisito previo (una vez, tras cada `npm run build`): copiar las carpetas
 * estáticas dentro de standalone, porque Next no las incluye automáticamente:
 *   cp -r .next/static .next/standalone/.next/static
 *   cp -r public       .next/standalone/public   (si existe carpeta public)
 * El script "postbuild" de package.json lo hace por ti.
 */
process.chdir(__dirname)
require('./.next/standalone/server.js')
