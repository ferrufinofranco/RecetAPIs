// Ejecutar después de npm run build. No requiere ni consulta Supabase.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import vm from 'node:vm'

const dist = new URL('../dist/', import.meta.url)
const leer = (nombre) => readFileSync(new URL(nombre, dist), 'utf8')
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
assert(manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'any'))
assert(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'any'))
assert(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'))
for (const icon of manifest.icons) {
  assert.equal(icon.type, 'image/png')
  const png = readFileSync(new URL(icon.src, dist))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes)
}
assert.match(leer('index.html'), /rel="manifest"/)

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
for (const { url } of entries) {
  assert.match(url, /^(?:index\.html|assets\/[^?]+\.(?:js|css)|icons\/[\w-]+\.png|manifest\.webmanifest)$/)
  assert(existsSync(new URL(url, dist)))
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
console.log(`PWA verificada: manifest, PNG, ${entries.length} recursos estáticos, fallback SPA, sin caché runtime, activación explícita.`)
