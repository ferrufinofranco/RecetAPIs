import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

test('moderación REST: pendientes, detalle y decisiones por RPC sin escrituras reales', async (t) => {
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
    const servicio = await server.ssrLoadModule('/src/services/moderacion.js')
    getSupabase().auth.getSession = async () => ({ data: { session: { access_token: 'jwt-admin' } }, error: null })
    const peticiones = []
    let respuesta = []
    let fallo = null
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      return { data: typeof respuesta === 'function' ? respuesta(config) : respuesta, status: 200, headers: {}, config }
    }
    const ultima = () => peticiones.at(-1)

    await t.test('lista solo pendientes de recetas no eliminadas, con orden ascendente y paginación', async () => {
      const fila = { id: 81, titulo: 'Pan', numero: 3, creada_en: '2026-11-12T12:00:00Z' }
      respuesta = (config) => config.params.offset === 0 ? [fila] : []
      const signal = new AbortController().signal
      assert.deepEqual(await servicio.obtenerPropuestasPendientes(signal), [fila])
      assert.equal(ultima().params.offset, 1)
      for (const config of peticiones) {
        assert.equal(config.method, 'get')
        assert.equal(config.url, 'receta_versiones')
        assert.equal(config.params.estado, 'eq.pendiente')
        assert.equal(config.params['receta.eliminada_en'], 'is.null')
        assert.equal(config.params.order, 'creada_en.asc,id.asc')
        assert.match(config.params.select, /receta:recetas!inner\(id\)/)
        assert.equal(config.headers.get('apikey'), 'sb_publishable_test')
        assert.equal(config.headers.get('Authorization'), 'Bearer jwt-admin')
        assert.equal(config.signal, signal)
      }
    })

    await t.test('detalle consulta por ID de versión y adapta relaciones con pasos ordenados', async () => {
      respuesta = [{
        id: 81, receta_id: 12, numero: 3, titulo: 'Pan', descripcion: 'Casero', porciones: 4,
        tiempo_minutos: null, dificultad: null, imagen_path: null,
        receta_categorias: [{ categorias: { id: 1, nombre: 'General' } }],
        receta_ingredientes: [{ cantidad: 500, unidad: 'g', ingredientes: { id: 7, nombre: 'Harina' } }],
        receta_pasos: [{ orden: 2, descripcion: 'Hornear' }, { orden: 1, descripcion: 'Mezclar' }],
      }]
      const detalle = await servicio.obtenerPropuesta(81)
      assert.equal(ultima().params.id, 'eq.81')
      assert.equal(ultima().params.estado, 'eq.pendiente')
      assert.equal(ultima().params['receta.eliminada_en'], 'is.null')
      assert.equal(detalle.id, '12')
      assert.equal(detalle.versionId, 81)
      assert.equal(detalle.numero, 3)
      assert.deepEqual(detalle.categorias, ['General'])
      assert.deepEqual(detalle.ingredientes, [{ id: 7, nombre: 'Harina', cantidad: 500, unidad: 'g' }])
      assert.deepEqual(detalle.pasos.map((paso) => paso.orden), [1, 2])
      assert.equal(detalle.tiempoMinutos, null)
    })

    await t.test('una propuesta que ya no está pendiente no devuelve detalle', async () => {
      respuesta = []
      assert.equal(await servicio.obtenerPropuesta(81), null)
      assert.deepEqual(await servicio.obtenerPropuestasPendientes(), [])
    })

    await t.test('aprobar usa únicamente la RPC con ID de versión y JWT', async () => {
      respuesta = null
      const antes = peticiones.length
      await servicio.aprobarReceta(81)
      assert.equal(peticiones.length, antes + 1)
      assert.equal(ultima().method, 'post')
      assert.equal(ultima().url, 'rpc/aprobar_receta')
      assert.deepEqual(JSON.parse(ultima().data), { p_version_id: 81 })
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-admin')
      assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('rechazar envía motivo recortado o null mediante RPC', async () => {
      for (const [motivo, esperado] of [['  Revisar cantidades  ', 'Revisar cantidades'], ['', null], ['   ', null], [undefined, null]]) {
        await servicio.rechazarReceta(81, motivo)
        assert.equal(ultima().method, 'post')
        assert.equal(ultima().url, 'rpc/rechazar_receta')
        assert.deepEqual(JSON.parse(ultima().data), { p_version_id: 81, p_motivo: esperado })
        assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-admin')
        assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
      }
    })

    await t.test('permisos, concurrencia y fallo de conexión no se consideran éxito', async () => {
      for (const operar of [() => servicio.aprobarReceta(81), () => servicio.rechazarReceta(81, '')]) {
        fallo = { response: { status: 403, data: { code: '42501' } } }
        await assert.rejects(operar, (error) => {
          assert.match(servicio.mensajeErrorModeracion(error), /permisos/)
          return true
        })
        fallo = { response: { status: 400 } }
        await assert.rejects(operar, (error) => {
          assert.match(servicio.mensajeErrorModeracion(error), /otro administrador/)
          return true
        })
        fallo = new Error('Network Error')
        await assert.rejects(operar, (error) => {
          assert.match(servicio.mensajeErrorModeracion(error), /actualizá el listado/)
          return true
        })
      }
    })
    assert.ok(peticiones.every((config) => config.method === 'get' || config.url.startsWith('rpc/')))
  } finally { await server.close() }
})
