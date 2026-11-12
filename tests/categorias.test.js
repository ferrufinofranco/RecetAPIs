import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

test('categorías: consultas REST y validaciones sin escrituras reales', async (t) => {
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
    const { obtenerCategorias, crearCategoria, renombrarCategoria } = await server.ssrLoadModule('/src/services/categorias.ts')
    const { mensajeErrorCategoria } = await server.ssrLoadModule('/src/utils/categorias.js')
    getSupabase().auth.getSession = async () => ({
      data: { session: { access_token: 'jwt-administrador' } }, error: null,
    })
    const peticiones = []
    let respuesta = []
    let fallo = null
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      return { data: respuesta, status: 200, statusText: 'OK', headers: {}, config }
    }
    const ultima = () => peticiones.at(-1)
    const categoria = { id: 7, nombre: 'Pastas' }

    await t.test('el listado solicita solo activas, ordenadas por nombre', async () => {
      respuesta = [categoria]
      assert.deepEqual(await obtenerCategorias(), [categoria])
      assert.equal(ultima().method, 'get')
      assert.equal(ultima().url, 'categorias')
      assert.deepEqual(ultima().params, { select: 'id,nombre', activa: 'eq.true', order: 'nombre.asc' })
    })

    await t.test('alta recorta espacios y envía JWT, apikey y representación de la fila creada', async () => {
      assert.deepEqual(await crearCategoria('  Pastas  '), categoria)
      assert.equal(ultima().method, 'post')
      assert.deepEqual(JSON.parse(ultima().data), { nombre: 'Pastas' })
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
      assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
      assert.equal(ultima().headers.get('Prefer'), 'return=representation')
    })

    await t.test('edición modifica solo nombre y filtra por id, activa y protección de General', async () => {
      respuesta = [{ ...categoria, nombre: 'Pastas caseras' }]
      const resultado = await renombrarCategoria(categoria, ' Pastas caseras ')
      assert.equal(resultado.nombre, 'Pastas caseras')
      assert.equal(ultima().method, 'patch')
      assert.deepEqual(JSON.parse(ultima().data), { nombre: 'Pastas caseras' })
      assert.deepEqual(ultima().params, { id: 'eq.7', activa: 'eq.true', nombre: 'neq.General', select: 'id,nombre' })
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
    })

    await t.test('no envía nombres vacíos ni cambios de General a la API', async () => {
      const cantidad = peticiones.length
      await assert.rejects(() => crearCategoria('   '), { code: 'NOMBRE_VACIO' })
      await assert.rejects(() => renombrarCategoria(categoria, ' '), { code: 'NOMBRE_VACIO' })
      await assert.rejects(() => renombrarCategoria({ id: 1, nombre: 'General' }, 'Otro'), { code: 'GENERAL_PROTEGIDA' })
      await assert.rejects(() => renombrarCategoria({ id: 1, nombre: ' GENERAL ' }, 'Otro'), { code: 'GENERAL_PROTEGIDA' })
      assert.equal(peticiones.length, cantidad)
    })

    await t.test('un PATCH sin filas afectadas no se informa como éxito', async () => {
      respuesta = []
      await assert.rejects(() => renombrarCategoria(categoria, 'Nuevo'), { code: 'SIN_CAMBIOS' })
      await assert.rejects(() => crearCategoria('Nueva'), { code: 'SIN_CONFIRMACION' })
    })

    await t.test('duplicados en alta y edición se informan con un mensaje claro', async () => {
      fallo = { response: { status: 409, data: { code: '23505' } } }
      for (const operacion of [() => crearCategoria('Pastas'), () => renombrarCategoria(categoria, 'Dulces')]) {
        await assert.rejects(operacion, (error) => {
          assert.match(mensajeErrorCategoria(error), /Ya existe una categoría/)
          return true
        })
      }
      fallo = null
    })

    await t.test('errores de permisos, red y validación tienen mensajes seguros', () => {
      assert.match(mensajeErrorCategoria({ response: { status: 403 } }), /permisos/)
      assert.match(mensajeErrorCategoria({ response: { status: 401 } }), /sesión/)
      assert.match(mensajeErrorCategoria(new Error('Network Error')), /conexión/)
    })
  } finally {
    await server.close()
  }
})
