import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

test('ingredientes: listado, alta, edición y desactivación REST sin escrituras reales', async (t) => {
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
    const { obtenerIngredientes, crearIngrediente, renombrarIngrediente, desactivarIngrediente } = await server.ssrLoadModule('/src/services/ingredientes.js')
    const { mensajeErrorIngrediente } = await server.ssrLoadModule('/src/utils/ingredientes.js')
    getSupabase().auth.getSession = async () => ({
      data: { session: { access_token: 'jwt-administrador' } }, error: null,
    })
    const activo = { id: 1, nombre: 'Harina', activo: true }
    const inactivo = { id: 2, nombre: 'Leche', activo: false }
    let respuesta = [activo, inactivo]
    let fallo = null
    const peticiones = []
    api.defaults.adapter = async (config) => {
      peticiones.push(config)
      if (fallo) throw fallo
      return { data: respuesta, status: 200, statusText: 'OK', headers: {}, config }
    }
    const ultima = () => peticiones.at(-1)

    await t.test('lista activos e inactivos sin filtrar el estado y con JWT', async () => {
      assert.deepEqual(await obtenerIngredientes(), [activo, inactivo])
      assert.equal(ultima().method, 'get')
      assert.equal(ultima().url, 'ingredientes')
      assert.deepEqual(ultima().params, { select: 'id,nombre,activo', order: 'nombre.asc' })
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
      assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('alta envía únicamente nombre recortado, sin activo ni otros campos', async () => {
      respuesta = [activo]
      assert.deepEqual(await crearIngrediente('  Harina  '), activo)
      assert.equal(ultima().method, 'post')
      assert.equal(ultima().url, 'ingredientes')
      assert.deepEqual(JSON.parse(ultima().data), { nombre: 'Harina' })
      assert.equal(ultima().headers.get('Prefer'), 'return=representation')
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
      assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('permite renombrar activos e inactivos sin alterar su estado', async () => {
      for (const ingrediente of [activo, inactivo]) {
        respuesta = [{ ...ingrediente, nombre: `${ingrediente.nombre} nueva` }]
        const resultado = await renombrarIngrediente(ingrediente, ` ${ingrediente.nombre} nueva `)
        assert.equal(resultado.activo, ingrediente.activo)
        assert.equal(ultima().method, 'patch')
        assert.equal(ultima().url, 'ingredientes')
        assert.deepEqual(JSON.parse(ultima().data), { nombre: `${ingrediente.nombre} nueva` })
        assert.deepEqual(ultima().params, { id: `eq.${ingrediente.id}`, select: 'id,nombre,activo' })
        assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
        assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
      }
    })

    await t.test('nombres vacíos o solo espacios se rechazan antes de consultar REST', async () => {
      const cantidad = peticiones.length
      for (const nombre of ['', '   ']) {
        await assert.rejects(() => crearIngrediente(nombre), { code: 'NOMBRE_VACIO' })
        await assert.rejects(() => renombrarIngrediente(activo, nombre), { code: 'NOMBRE_VACIO' })
      }
      assert.equal(peticiones.length, cantidad)
    })

    await t.test('duplicados en POST y PATCH muestran un mensaje claro', async () => {
      fallo = { response: { status: 409, data: { code: '23505' } } }
      for (const operacion of [() => crearIngrediente(' HARINA '), () => renombrarIngrediente(inactivo, 'harina')]) {
        await assert.rejects(operacion, (error) => {
          assert.match(mensajeErrorIngrediente(error), /Ya existe un ingrediente/)
          return true
        })
      }
      fallo = null
    })

    await t.test('una respuesta sin filas no se informa como escritura exitosa', async () => {
      respuesta = []
      await assert.rejects(() => crearIngrediente('Nuevo'), { code: 'SIN_CONFIRMACION' })
      await assert.rejects(() => renombrarIngrediente(activo, 'Nuevo'), { code: 'SIN_CAMBIOS' })
      assert.deepEqual(await obtenerIngredientes(), [])
    })

    await t.test('errores de permisos y conexión se propagan y se muestran sin detalles sensibles', async () => {
      for (const status of [401, 403]) {
        fallo = { response: { status } }
        await assert.rejects(() => crearIngrediente('Nuevo'), (error) => {
          assert.match(mensajeErrorIngrediente(error), /permisos/)
          return true
        })
      }
      fallo = new Error('Network Error')
      await assert.rejects(() => obtenerIngredientes(), /Network Error/)
      await assert.rejects(() => renombrarIngrediente(activo, 'Nuevo'), (error) => {
        assert.match(mensajeErrorIngrediente(error), /conexión/)
        return true
      })
      fallo = null
    })

    await t.test('desactivación usa POST a la RPC con ID, JWT y apikey, sin PATCH de activo', async () => {
      respuesta = null
      const cantidad = peticiones.length
      await desactivarIngrediente(activo)
      assert.equal(peticiones.length, cantidad + 1)
      assert.equal(ultima().method, 'post')
      assert.equal(ultima().url, 'rpc/desactivar_ingrediente')
      assert.deepEqual(JSON.parse(ultima().data), { p_ingrediente_id: 1 })
      assert.equal(ultima().headers.get('Authorization'), 'Bearer jwt-administrador')
      assert.equal(ultima().headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('no permite desactivar de nuevo un ingrediente inactivo', async () => {
      const cantidad = peticiones.length
      await assert.rejects(() => desactivarIngrediente(inactivo), { code: 'INGREDIENTE_INACTIVO' })
      assert.equal(peticiones.length, cantidad)
    })

    await t.test('la lectura conserva ingredientes desactivados y no agrega filtro de estado', async () => {
      respuesta = [{ ...activo, activo: false }, inactivo]
      assert.deepEqual(await obtenerIngredientes(), respuesta)
      assert.deepEqual(ultima().params, { select: 'id,nombre,activo', order: 'nombre.asc' })
    })

    await t.test('errores de RPC se propagan con mensaje de desactivación sin informar éxito', async () => {
      fallo = { response: { status: 403, data: { code: '42501' } } }
      await assert.rejects(() => desactivarIngrediente(activo), (error) => {
        assert.match(mensajeErrorIngrediente(error, 'desactivar'), /permisos/)
        return true
      })
      fallo = new Error('Network Error')
      await assert.rejects(() => desactivarIngrediente(activo), (error) => {
        assert.match(mensajeErrorIngrediente(error, 'desactivar'), /No se pudo desactivar/)
        return true
      })
      fallo = null
    })

    assert.ok(peticiones.every((config) => ['get', 'post', 'patch'].includes(config.method)))
    for (const config of peticiones.filter((config) => config.method === 'patch')) {
      assert.deepEqual(Object.keys(JSON.parse(config.data)), ['nombre'])
    }
  } finally {
    await server.close()
  }
})
