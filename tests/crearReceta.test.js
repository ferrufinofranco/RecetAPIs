import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { prepararDatosReceta, mensajeErrorCrearReceta } from '../src/utils/crearReceta.js'
import { crearAuthGuard } from '../src/router/authGuard.js'

function formulario() {
  return {
    titulo: ' Pan casero ', descripcion: ' ', porciones: '4', tiempo_minutos: '', dificultad: '',
    categorias: [7, 9],
    ingredientes: [{ ingrediente_id: 25, nombre: 'Harina', cantidad: '500.5', unidad: 'g' }],
    pasos: [' Mezclar ', 'Hornear'],
  }
}

test('payload normaliza opcionales, conserva IDs y orden, y excluye campos administrados por Supabase', () => {
  const datos = prepararDatosReceta({ ...formulario(), autor_id: 'otro', estado: 'publicada', numero: 10, id: 123 })
  assert.deepEqual(datos, {
    titulo: 'Pan casero', descripcion: null, porciones: 4, tiempo_minutos: null, dificultad: null,
    categorias: [7, 9], ingredientes: [{ ingrediente_id: 25, cantidad: 500.5, unidad: 'g' }],
    pasos: ['Mezclar', 'Hornear'],
  })
  const reordenado = prepararDatosReceta({ ...formulario(), pasos: ['Hornear', 'Mezclar'], descripcion: ' Pan ', tiempo_minutos: 30, dificultad: 'facil' })
  assert.deepEqual(reordenado.pasos, ['Hornear', 'Mezclar'])
  assert.equal(reordenado.descripcion, 'Pan')
  assert.equal(reordenado.tiempo_minutos, 30)
})

test('rechaza datos incompletos, cantidades inválidas y duplicados', () => {
  for (const cambio of [
    { titulo: '  ' }, { porciones: '' }, { porciones: 0 }, { porciones: 1.5 },
    { tiempo_minutos: -1 }, { tiempo_minutos: 'abc' }, { dificultad: 'otra' },
    { ingredientes: [] }, { ingredientes: [{ ingrediente_id: 25, cantidad: 0, unidad: 'g' }] },
    { ingredientes: [{ ingrediente_id: 25, cantidad: Infinity, unidad: 'g' }] },
    { ingredientes: [{ ingrediente_id: 25, cantidad: 1, unidad: 'otra' }] },
    { ingredientes: [...formulario().ingredientes, ...formulario().ingredientes] },
    { categorias: [] }, { categorias: [7, '7'] }, { pasos: [] }, { pasos: ['  '] },
  ]) assert.throws(() => prepararDatosReceta({ ...formulario(), ...cambio }))
})

test('la ruta de creación requiere sesión, sin exigir rol admin', async () => {
  const auth = { inicializar: async () => {}, autenticado: false }
  const ruta = { meta: { requiereAuth: true } }
  assert.deepEqual(await crearAuthGuard(auth)(ruta), { name: 'login' })
  auth.autenticado = true
  assert.equal(await crearAuthGuard(auth)(ruta), true)
})

test('crear receta utiliza solo RPC con JWT y apikey; no escribe tablas directamente', async () => {
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
    const { crearReceta } = await server.ssrLoadModule('/src/services/recetas.js')
    getSupabase().auth.getSession = async () => ({ data: { session: { access_token: 'jwt-usuario' } }, error: null })
    const peticiones = []
    let fallo = null
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      return { data: null, status: 200, headers: {}, config }
    }
    await crearReceta(formulario())
    assert.equal(peticiones.length, 1)
    const config = peticiones[0]
    assert.equal(config.url, 'rpc/crear_receta')
    assert.equal(config.method, 'post')
    assert.equal(config.headers.get('apikey'), 'sb_publishable_test')
    assert.equal(config.headers.get('Authorization'), 'Bearer jwt-usuario')
    assert.deepEqual(JSON.parse(config.data), { p_datos: prepararDatosReceta(formulario()) })
    await assert.rejects(() => crearReceta({ ...formulario(), ingredientes: [] }))
    assert.equal(peticiones.length, 1)
    fallo = { response: { status: 403 } }
    await assert.rejects(() => crearReceta(formulario()), (error) => {
      assert.match(mensajeErrorCrearReceta(error), /sesión/)
      return true
    })
    fallo = new Error('Network Error')
    await assert.rejects(() => crearReceta(formulario()), (error) => {
      assert.match(mensajeErrorCrearReceta(error), /pudo haberse procesado/)
      return true
    })
  } finally {
    await server.close()
  }
})
