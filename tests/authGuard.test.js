import test from 'node:test'
import assert from 'node:assert/strict'
import { crearAuthGuard } from '../src/router/authGuard.js'

function store(rol = null) {
  return {
    autenticado: !!rol,
    user: rol ? { id: 'usuario-1', user_metadata: { rol: 'admin' } } : null,
    inicializar: async () => {},
    actualizarPerfil: async () => rol ? { id: 'usuario-1', rol } : null,
  }
}
const admin = { meta: { requiereAuth: true, rol: 'admin' } }

test('catálogo y detalle no requieren sesión', async () => {
  assert.equal(await crearAuthGuard(store())({ meta: {} }), true)
})

test('espera la restauración de sesión antes de autorizar', async () => {
  const auth = store()
  auth.inicializar = async () => {
    await Promise.resolve()
    Object.assign(auth, store('admin'))
  }
  assert.equal(await crearAuthGuard(auth)(admin), true)
})

test('un visitante debe iniciar sesión para entrar a admin', async () => {
  assert.deepEqual(await crearAuthGuard(store())(admin), { name: 'login' })
})

test('usuario es rechazado aunque su metadata diga admin', async () => {
  assert.deepEqual(await crearAuthGuard(store('usuario'))(admin), { name: 'acceso-denegado' })
})

test('solo el perfil propio con rol admin habilita la ruta', async () => {
  assert.equal(await crearAuthGuard(store('admin'))(admin), true)
  const auth = store('admin')
  auth.actualizarPerfil = async () => ({ id: 'otro-usuario', rol: 'admin' })
  assert.deepEqual(await crearAuthGuard(auth)(admin), { name: 'acceso-denegado' })
})

test('perfil faltante o inaccesible nunca habilita admin', async () => {
  const auth = store('admin')
  auth.actualizarPerfil = async () => null
  assert.deepEqual(await crearAuthGuard(auth)(admin), { name: 'acceso-denegado' })
})

test('cada navegación consulta el rol actualizado, no un rol cacheado', async () => {
  const auth = store('admin')
  const guard = crearAuthGuard(auth)
  assert.equal(await guard(admin), true)
  auth.actualizarPerfil = async () => ({ id: auth.user.id, rol: 'usuario' })
  assert.deepEqual(await guard(admin), { name: 'acceso-denegado' })
})

test('una sesión cerrada durante la consulta no conserva permisos', async () => {
  const auth = store('admin')
  auth.actualizarPerfil = async () => {
    auth.autenticado = false
    auth.user = null
    return { id: 'usuario-1', rol: 'admin' }
  }
  assert.deepEqual(await crearAuthGuard(auth)(admin), { name: 'login' })
})

test('login y registro redirigen al catálogo si ya hay sesión', async () => {
  assert.deepEqual(await crearAuthGuard(store('usuario'))({ meta: { soloInvitados: true } }), { name: 'catalogo' })
  assert.equal(await crearAuthGuard(store())({ meta: { soloInvitados: true } }), true)
})
