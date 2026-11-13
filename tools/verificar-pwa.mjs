// Ejecutar después de npm run build. No requiere ni consulta Supabase.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import vm from 'node:vm'

const dist = new URL('../dist/', import.meta.url)
const leer = (nombre) => readFileSync(new URL(nombre, dist), 'utf8')
const leerBinario = (nombre) => readFileSync(new URL(nombre, dist))
const manifest = JSON.parse(leer('manifest.webmanifest'))
assert.equal(manifest.name, 'RecetAPIs')
assert.equal(manifest.short_name, 'RecetAPIs')
assert.equal(manifest.lang, 'es-AR')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.id, '/')
assert.equal(manifest.theme_color, '#365f40')
assert.equal(manifest.background_color, '#faf9f5')
assert.deepEqual(manifest.icons, [
  { src: 'recetapis-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'recetapis-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'recetapis-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
])
const iconosPng = [
  ...manifest.icons,
  { src: 'recetapis-32.png', sizes: '32x32' },
  { src: 'apple-touch-icon.png', sizes: '180x180' },
]
for (const { src, sizes } of iconosPng) {
  const png = leerBinario(src)
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', src)
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, sizes, src)
}
const favicon = leerBinario('favicon.ico')
assert.equal(favicon.readUInt32LE(0), 0x00010000, 'Cabecera ICO')
const cantidadImagenes = favicon.readUInt16LE(4)
assert(cantidadImagenes > 0 && favicon.length >= 6 + cantidadImagenes * 16)
const tamanosFavicon = new Set()
for (let i = 0; i < cantidadImagenes; i++) {
  const entrada = 6 + i * 16
  tamanosFavicon.add(`${favicon[entrada] || 256}x${favicon[entrada + 1] || 256}`)
}
for (const size of ['16x16', '32x32', '48x48', '64x64']) {
  assert(tamanosFavicon.has(size), `Falta ${size} en favicon.ico`)
}

const html = leer('index.html')
assert.match(html, /rel="manifest"/)
assert.match(html, /<link rel="icon" type="image\/x-icon" href="\/favicon\.ico">/)
assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/recetapis-32\.png">/)
assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png">/)

// Ejecutar el módulo generado con dobles: sólo se permite precache + fallback HTML.
let entries, fallback, opciones, limpiezas = 0, skip = 0
const listeners = []
const workbox = {
  precacheAndRoute: (lista) => { entries = lista },
  cleanupOutdatedCaches: () => { limpiezas++ },
  createHandlerBoundToURL: (url) => { fallback = url; return 'shell' },
  NavigationRoute: class { constructor(handler, options) { assert.equal(handler, 'shell'); opciones = options } },
  registerRoute: (route) => { assert(route instanceof workbox.NavigationRoute, 'No permitir caché runtime') },
}
const define = (deps, factory) => {
  for (const archivo of deps) assert(existsSync(new URL(`${archivo}.js`, dist)))
  factory(workbox)
}
vm.runInNewContext(leer('sw.js'), {
  define,
  self: { define, addEventListener: (tipo, cb) => { assert.equal(tipo, 'message'); listeners.push(cb) }, skipWaiting: () => { skip++ } },
})
assert(entries.length > 0)
const iconos = ['favicon.ico', ...iconosPng.map(({ src }) => src)]
for (const { url } of entries) {
  assert(iconos.includes(url) || /^(?:index\.html|assets\/[^?]+\.(?:js|css)|manifest\.webmanifest)$/.test(url), url)
  assert(existsSync(new URL(url, dist)))
}
for (const icono of iconos) {
  const revision = createHash('md5').update(leerBinario(icono)).digest('hex')
  assert.equal(entries.find(({ url }) => url === icono)?.revision, revision, `Revisión de precaché de ${icono}`)
}
assert.equal(fallback, 'index.html')
for (const ruta of ['/auth/v1/token', '/rest/v1/profiles', '/storage/v1/object', '/functions/v1/rpc', '/api/privado']) {
  assert(opciones.denylist.some(regex => regex.test(ruta)))
}
for (const ruta of ['/login', '/recetas/1', '/mis-recetas', '/admin']) {
  assert(!opciones.denylist.some(regex => regex.test(ruta)))
}
assert.equal(limpiezas, 1)
assert.equal(skip, 0, 'No activar automáticamente')
listeners[0]({ data: { type: 'SKIP_WAITING' } })
assert.equal(skip, 1, 'Activar sólo por mensaje explícito')
console.log(`PWA verificada: manifest, seis íconos revisionados, ${entries.length} recursos estáticos, fallback SPA, sin caché runtime, activación explícita.`)
