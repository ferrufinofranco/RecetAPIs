// PNG reproducibles, sin dependencias: plato y cubiertos en los colores de RecetAPIs.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function chunk(tipo, datos) {
  const contenido = Buffer.concat([Buffer.from(tipo), datos])
  let crc = 0xffffffff
  for (const byte of contenido) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([largo, contenido, checksum])
}

function icono(size) {
  const pixels = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) / size, v = (y + .5) / size
      const radio = Math.hypot(u - .5, v - .5)
      let color = [54, 95, 64]
      if (radio < .225) color = [250, 249, 245]
      if (radio > .185 && radio < .197) color = [181, 104, 37]
      const tenedor = (Math.abs(u - .205) < .012 && v > .43 && v < .73)
        || (v > .29 && v < .46 && [ .175, .205, .235 ].some(t => Math.abs(u - t) < .009))
        || (u > .166 && u < .244 && v > .435 && v < .46)
      const cuchara = ((u - .795) ** 2 / .036 ** 2 + (v - .36) ** 2 / .07 ** 2 < 1)
        || (Math.abs(u - .795) < .012 && v > .39 && v < .73)
      if (tenedor || cuchara) color = [250, 249, 245]
      const offset = y * (size * 3 + 1) + 1 + x * 3
      pixels.set(color, offset)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

const carpeta = new URL('../public/icons/', import.meta.url)
mkdirSync(carpeta, { recursive: true })
for (const [nombre, size] of [['pwa-192.png', 192], ['pwa-512.png', 512], ['pwa-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(nombre, carpeta), icono(size))
}
