import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { createServer } from 'vite'

test('Pinia, sesiones y encabezados REST (Auth y REST simulados, sin crear usuarios)', async (t) => {
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
    const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.js')
    const sdk = getSupabase().auth
    let session = null
    let listener
    let perfil = { id: 'usuario-1', nombre: 'Ana', email: 'ana@example.com', rol: 'usuario' }
    let falloPerfil = false
    let registro
    let ultimoConfig
    let respuestaDiferida
    const sesionUsuario = () => ({ access_token: 'jwt-del-usuario', user: { id: 'usuario-1', email: 'ana@example.com', user_metadata: { rol: 'admin' } } })

    sdk.onAuthStateChange = (callback) => {
      listener = callback
      return { data: { subscription: { unsubscribe() {} } } }
    }
    sdk.getSession = async () => ({ data: { session }, error: null })
    sdk.signInWithPassword = async () => {
      session = sesionUsuario()
      return { data: { session }, error: null }
    }
    sdk.signUp = async (datos) => {
      registro = datos
      return { data: { session: null }, error: null }
    }
    sdk.signOut = async () => {
      session = null
      listener('SIGNED_OUT', null)
      return { error: null }
    }
    api.defaults.adapter = async (config) => {
      ultimoConfig = config
      if (falloPerfil) throw new Error('REST inaccesible')
      if (respuestaDiferida) return respuestaDiferida(config)
      return { data: perfil ? [perfil] : [], status: 200, statusText: 'OK', headers: {}, config }
    }

    await t.test('visitante: apikey sin Authorization', async () => {
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      assert.equal(auth.autenticado, false)
      await api.get('categorias')
      assert.equal(ultimoConfig.headers.get('Authorization'), undefined)
      assert.equal(ultimoConfig.headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('login consulta el perfil con JWT, ignorando el rol de metadata', async () => {
      const auth = useAuthStore(createPinia())
      await auth.ingresar('ana@example.com', 'contraseña-de-prueba')
      assert.equal(auth.autenticado, true)
      assert.equal(auth.esAdmin, false)
      assert.equal(auth.perfil.rol, 'usuario')
      assert.equal(ultimoConfig.params.id, 'eq.usuario-1')
      assert.equal(ultimoConfig.headers.get('Authorization'), 'Bearer jwt-del-usuario')
      assert.equal(ultimoConfig.headers.get('apikey'), 'sb_publishable_test')
    })

    await t.test('un store nuevo restaura la sesión mediante el SDK', async () => {
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      assert.equal(auth.user.id, 'usuario-1')
      perfil = { ...perfil, rol: 'admin' }
      await auth.actualizarPerfil()
      assert.equal(auth.esAdmin, true)
      perfil = { ...perfil, rol: 'usuario' }
      await auth.actualizarPerfil()
      assert.equal(auth.esAdmin, false)
    })

    await t.test('volver a la pestaña conserva el nombre durante la actualización del perfil', async () => {
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      let resolver
      respuestaDiferida = (config) => new Promise((resolve) => {
        resolver = () => resolve({ data: [{ ...perfil, nombre: 'Ana actualizada' }], status: 200, headers: {}, config })
      })
      try {
        listener('SIGNED_IN', session)
        // Supabase puede emitir SIGNED_IN nuevamente al recuperar el foco.
        while (!resolver) await new Promise((resolve) => setImmediate(resolve))
        assert.equal(auth.perfil.nombre, 'Ana')
        const pendiente = auth.actualizarPerfil()
        resolver()
        await pendiente
        assert.equal(auth.perfil.nombre, 'Ana actualizada')
      } finally {
        respuestaDiferida = null
      }
    })

    await t.test('perfil inaccesible o ausente elimina los permisos', async () => {
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      falloPerfil = true
      assert.equal(await auth.actualizarPerfil(), null)
      assert.equal(auth.perfil, null)
      assert.equal(auth.esAdmin, false)
      assert.ok(auth.errorPerfil)
      falloPerfil = false
      const anterior = perfil
      perfil = null
      assert.equal(await auth.actualizarPerfil(), null)
      assert.equal(auth.perfil, null)
      assert.ok(auth.errorPerfil)
      perfil = anterior
    })

    await t.test('logout elimina usuario, perfil y JWT de las próximas consultas', async () => {
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      await auth.cerrarSesion()
      assert.equal(auth.user, null)
      assert.equal(auth.perfil, null)
      await api.get('categorias')
      assert.equal(ultimoConfig.headers.get('Authorization'), undefined)
    })

    await t.test('registro envía solo nombre en metadata y avisa si requiere confirmación', async () => {
      const auth = useAuthStore(createPinia())
      // La URL del navegador solo se utiliza para el enlace de confirmación.
      globalThis.window = { location: { origin: 'https://recetas.example.com' } }
      try {
        const resultado = await auth.registrar('Ana', 'ana@example.com', 'contraseña-de-prueba')
        assert.equal(resultado.requiereConfirmacion, true)
        assert.deepEqual(registro.options.data, { nombre: 'Ana' })
        assert.equal(registro.options.emailRedirectTo, 'https://recetas.example.com/login')
        assert.equal(auth.autenticado, false)
        assert.equal('password' in auth.$state, false)
      } finally {
        delete globalThis.window
      }
    })

    await t.test('una respuesta de perfil tardía no restaura privilegios después del logout', async () => {
      session = sesionUsuario()
      const auth = useAuthStore(createPinia())
      await auth.inicializar()
      let resolver
      respuestaDiferida = (config) => new Promise((resolve) => {
        resolver = () => resolve({ data: [{ ...perfil, rol: 'admin' }], status: 200, headers: {}, config })
      })
      const pendiente = auth.actualizarPerfil()
      while (!resolver) await new Promise((resolve) => setImmediate(resolve))
      await auth.cerrarSesion()
      resolver()
      await pendiente
      assert.equal(auth.perfil, null)
      assert.equal(auth.esAdmin, false)
      respuestaDiferida = null
    })
  } finally {
    await server.close()
  }
})
