import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { resumirRecetaPropia, filtrarMisRecetas } from '../src/utils/misRecetas.js'
import { crearAuthGuard } from '../src/router/authGuard.js'

const receta = (versiones) => ({ id: 5, creada_en: '2026-11-12T12:00:00Z', receta_versiones: versiones })
const version = (numero, estado, titulo = `Versión ${numero}`) => ({ id: numero, numero, estado, titulo, motivo_rechazo: null })

test('una publicación con cambios pendientes genera una tarjeta publicada con indicador', () => {
  const registro = receta([version(3, 'pendiente'), version(1, 'rechazada'), version(2, 'publicada', 'Título publicado')])
  const resumen = resumirRecetaPropia(registro)
  assert.deepEqual(resumen, {
    id: '5', creadaEn: registro.creada_en, titulo: 'Título publicado', estado: 'publicada', cambiosPendientes: true, motivoRechazo: null,
  })
  assert.equal(filtrarMisRecetas([resumen], 'publicada').length, 1)
  assert.equal(filtrarMisRecetas([resumen], 'pendiente').length, 0)
  assert.equal(filtrarMisRecetas([resumen], 'todas').length, 1)
})

test('sin publicación usa la propuesta pendiente o rechazada de mayor número', () => {
  const versiones = [version(9, 'descartada'), version(2, 'pendiente'), { ...version(3, 'rechazada'), motivo_rechazo: 'Faltan detalles' }]
  const resumen = resumirRecetaPropia(receta(versiones))
  assert.equal(resumen.estado, 'rechazada')
  assert.equal(resumen.titulo, 'Versión 3')
  assert.equal(resumen.motivoRechazo, 'Faltan detalles')
  assert.equal(resumen.cambiosPendientes, false)
  assert.equal(versiones[0].numero, 9)
  assert.equal(filtrarMisRecetas([resumen], 'rechazada').length, 1)
  const pendiente = resumirRecetaPropia(receta([...versiones, version(4, 'pendiente')]))
  assert.equal(pendiente.estado, 'pendiente')
  assert.equal(pendiente.motivoRechazo, null)
})

test('rechazar una modificación no reemplaza la versión publicada', () => {
  const resumen = resumirRecetaPropia(receta([version(1, 'publicada'), { ...version(2, 'rechazada'), motivo_rechazo: 'Revisar cantidades' }]))
  assert.equal(resumen.estado, 'publicada')
  assert.equal(resumen.titulo, 'Versión 1')
  assert.equal(resumen.motivoRechazo, 'Revisar cantidades')
  assert.equal(resumen.cambiosPendientes, false)
})

test('versiones descartadas y rechazos antiguos no se muestran como recetas adicionales', () => {
  assert.equal(resumirRecetaPropia(receta([version(1, 'descartada')])), null)
  assert.equal(resumirRecetaPropia(receta([])), null)
  const resumen = resumirRecetaPropia(receta([{ ...version(1, 'rechazada'), motivo_rechazo: 'Antiguo' }, version(2, 'publicada')]))
  assert.equal(resumen.motivoRechazo, null)
})

test('Mis recetas requiere sesión, sin exigir rol administrador', async () => {
  const auth = { inicializar: async () => {}, autenticado: false }
  const to = { meta: { requiereAuth: true } }
  assert.deepEqual(await crearAuthGuard(auth)(to), { name: 'login' })
  auth.autenticado = true
  assert.equal(await crearAuthGuard(auth)(to), true)
})

test('consulta propia anidada: filtra autor y eliminadas, pagina y envía JWT; propaga errores', async () => {
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
    const { obtenerMisRecetas } = await server.ssrLoadModule('/src/services/recetas.js')
    getSupabase().auth.getSession = async () => ({ data: { session: { access_token: 'jwt-propio' } }, error: null })
    const peticiones = []
    let fallo = null
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      const data = config.params.offset === 0 ? [receta([version(1, 'publicada'), version(2, 'pendiente')])] : []
      return { data, status: 200, headers: {}, config }
    }
    await assert.rejects(() => obtenerMisRecetas(null), /Iniciá sesión/)
    assert.equal(peticiones.length, 0)
    const signal = new AbortController().signal
    const resultado = await obtenerMisRecetas('uuid-propio', signal)
    assert.equal(resultado.length, 1)
    assert.equal(resultado[0].cambiosPendientes, true)
    assert.equal(peticiones.length, 2)
    assert.equal(peticiones[1].params.offset, 1)
    for (const config of peticiones) {
      assert.equal(config.url, 'recetas')
      assert.equal(config.method, 'get')
      assert.equal(config.params.autor_id, 'eq.uuid-propio')
      assert.equal(config.params.eliminada_en, 'is.null')
      assert.match(config.params.select, /receta_versiones\(id,numero,estado,titulo,motivo_rechazo\)/)
      assert.equal(config.params['receta_versiones.estado'], 'in.(publicada,pendiente,rechazada)')
      assert.equal(config.headers.get('apikey'), 'sb_publishable_test')
      assert.equal(config.headers.get('Authorization'), 'Bearer jwt-propio')
      assert.equal(config.signal, signal)
    }
    fallo = new Error('Network Error')
    await assert.rejects(() => obtenerMisRecetas('uuid-propio'), /Network Error/)
  } finally { await server.close() }
})
