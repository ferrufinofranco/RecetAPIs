import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { formularioDesdePropuesta, ingredientesPermitidos } from '../src/utils/editarPropuesta.js'
import { prepararDatosReceta } from '../src/utils/crearReceta.js'
import { resumirRecetaPropia } from '../src/utils/misRecetas.js'

const propuesta = {
  id: 83, receta_id: 12, estado: 'rechazada', motivo_rechazo: 'Revisar cantidades',
  receta: { id: 12, autor_id: 'autor-propio' }, titulo: 'Pan', descripcion: null,
  porciones: 4, tiempo_minutos: null, dificultad: null,
  receta_categorias: [{ categoria_id: 7 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 100, unidad: 'g', ingredientes: { nombre: 'Harina', activo: false } }],
  receta_pasos: [{ orden: 2, descripcion: 'Hornear' }, { orden: 1, descripcion: 'Mezclar' }],
}

test('precarga IDs reales, opcionales y pasos ordenados; conserva ingredientes inactivos', () => {
  const form = formularioDesdePropuesta(propuesta)
  assert.equal(form.descripcion, '')
  assert.equal(form.tiempo_minutos, '')
  assert.deepEqual(form.categorias, [7])
  assert.equal(form.ingredientes[0].ingrediente_id, 9)
  assert.equal(form.ingredientes[0].activo, false)
  assert.deepEqual(form.pasos.map((paso) => paso.texto), ['Mezclar', 'Hornear'])
  assert.ok(form.pasos.every((paso) => String(paso.clave).startsWith('original-')))
  form.ingredientes[0].cantidad = 200
  assert.equal(propuesta.receta_ingredientes[0].cantidad, 100)
  const datos = prepararDatosReceta({ ...form, pasos: form.pasos.map((paso) => paso.texto) })
  assert.deepEqual(datos.ingredientes, [{ ingrediente_id: 9, cantidad: 200, unidad: 'g' }])
  assert.equal(datos.descripcion, null)
})

test('permite conservar inactivos originales, pero no incorporar inactivos nuevos ni en alta', () => {
  const originales = [{ ingrediente_id: 9 }]
  const disponibles = [{ id: 9, activo: false }, { id: 10, activo: false }, { id: 11, activo: true }]
  assert.equal(ingredientesPermitidos([{ ingrediente_id: 9 }, { ingrediente_id: 11 }], disponibles, originales), true)
  assert.equal(ingredientesPermitidos([{ ingrediente_id: 10 }], disponibles, originales), false)
  assert.equal(ingredientesPermitidos([{ ingrediente_id: 9 }], disponibles), false)
  assert.equal(ingredientesPermitidos([{ ingrediente_id: 999 }], disponibles, originales), false)
})

test('reenvío se resume en una sola tarjeta pendiente con ID de nueva versión', () => {
  const resumen = resumirRecetaPropia({ id: 12, receta_versiones: [
    { id: 83, numero: 1, titulo: 'Pan', estado: 'rechazada', motivo_rechazo: 'Revisar' },
    { id: 84, numero: 2, titulo: 'Pan corregido', estado: 'pendiente' },
  ] })
  assert.equal(resumen.estado, 'pendiente')
  assert.equal(resumen.versionEditableId, 84)
  assert.equal(resumen.motivoRechazo, null)
})

test('precarga propia y edición usan REST filtrado y RPC, nunca ID de receta ni escrituras directas', async (t) => {
  const server = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_test'),
    },
  })
  try {
    const { getSupabase } = await server.ssrLoadModule('/src/services/supabase.js')
    const { api } = await server.ssrLoadModule('/src/services/api.js')
    const { obtenerPropuestaPropia, editarPropuestaReceta } = await server.ssrLoadModule('/src/services/recetas.js')
    getSupabase().auth.getSession = async () => ({ data: { session: { access_token: 'jwt-autor' } }, error: null })
    let respuesta = [propuesta]
    let fallo = null
    const peticiones = []
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      return { data: respuesta, status: 200, headers: {}, config }
    }
    await t.test('consulta por versión, autor, estado y receta no eliminada', async () => {
      assert.deepEqual(await obtenerPropuestaPropia(83, 'autor-propio'), propuesta)
      const config = peticiones.at(-1)
      assert.equal(config.url, 'receta_versiones')
      assert.equal(config.params.id, 'eq.83')
      assert.equal(config.params['receta.autor_id'], 'eq.autor-propio')
      assert.equal(config.params['receta.eliminada_en'], 'is.null')
      assert.equal(config.params.estado, 'in.(pendiente,rechazada)')
      assert.match(config.params.select, /ingredientes\(nombre,activo\)/)
    })
    await t.test('rechaza acceso sin sesión, autor ajeno y versiones publicadas', async () => {
      const cantidad = peticiones.length
      await assert.rejects(() => obtenerPropuestaPropia(83, null))
      assert.equal(peticiones.length, cantidad)
      assert.equal(await obtenerPropuestaPropia(83, 'otro-autor'), null)
      respuesta = [{ ...propuesta, estado: 'publicada' }]
      assert.equal(await obtenerPropuestaPropia(83, 'autor-propio'), null)
      respuesta = []
      assert.equal(await obtenerPropuestaPropia(83, 'autor-propio'), null)
    })
    await t.test('pendiente y rechazada usan la misma RPC con opcionales null y payload permitido', async () => {
      for (const estado of ['pendiente', 'rechazada']) {
        const form = formularioDesdePropuesta({ ...propuesta, estado })
        const datos = { ...form, pasos: form.pasos.map((paso) => paso.texto) }
        respuesta = null
        await editarPropuestaReceta(propuesta.id, datos)
        const config = peticiones.at(-1)
        assert.equal(config.method, 'post')
        assert.equal(config.url, 'rpc/editar_propuesta_receta')
        assert.deepEqual(JSON.parse(config.data), { p_version_id: 83, p_datos: prepararDatosReceta(datos) })
        assert.equal(config.headers.get('apikey'), 'sb_publishable_test')
        assert.equal(config.headers.get('Authorization'), 'Bearer jwt-autor')
      }
    })
    await t.test('validación falla antes de enviar y errores RPC se propagan', async () => {
      const form = formularioDesdePropuesta(propuesta)
      const datos = { ...form, pasos: form.pasos.map((paso) => paso.texto) }
      const cantidad = peticiones.length
      await assert.rejects(() => editarPropuestaReceta(83, { ...datos, ingredientes: [] }))
      assert.equal(peticiones.length, cantidad)
      fallo = new Error('RPC rechazada')
      await assert.rejects(() => editarPropuestaReceta(83, datos), /RPC rechazada/)
    })
    assert.ok(peticiones.every((config) => config.method === 'get' || config.url === 'rpc/editar_propuesta_receta'))
  } finally { await server.close() }
})
