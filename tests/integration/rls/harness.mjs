import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadRlsConfig } from './config.mjs'

export function success(response, operation) {
  assert.ok(response.status >= 200 && response.status < 300,
    `${operation}: HTTP ${response.status}, código ${response.code ?? 'sin código'}`)
  return response.data
}

export function denied(response, { empty = false } = {}) {
  if (empty && response.status === 200) {
    assert.deepEqual(response.data, [], 'La operación no debe devolver filas ni modificar datos')
    return
  }
  assert.ok([401, 403].includes(response.status),
    `Se esperaba denegación de autorización, no HTTP ${response.status}`)
  assert.equal(response.code, '42501', 'Un fallo de red, de JWT o de contrato no demuestra RLS')
}

function id(value) {
  assert.ok(Number.isSafeInteger(value) && value > 0, 'ID inexistente o fuera del rango seguro de JS')
  return value
}

export function createHarness() {
  // Se repite el gate aunque se invoque Vitest directamente, sin pasar por npm.
  const config = loadRlsConfig()
  const run = `rls-${randomUUID()}`
  const sessions = {}
  const fixtures = { recipes: [], requests: [] }
  const manifest = { run, singleProjectTestOnly: config.singleProject,
    startedAt: new Date().toISOString(), status: 'preparando',
    recipes: [], requests: [], catalog: [], cleanup: [] }
  mkdirSync('artifacts/rls', { recursive: true })
  const save = () => writeFileSync(`artifacts/rls/${run}.json`, JSON.stringify(manifest, null, 2))
  save()

  async function http(path, { method = 'GET', body, query, token } = {}) {
    let response
    try {
      const url = new URL(`${config.url}/${path}`)
      for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
      response = await fetch(url, {
        method,
        headers: { apikey: config.key, 'Content-Type': 'application/json',
          Prefer: 'return=representation', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      })
    } catch {
      // Nunca propagar errores fetch/Axios: pueden incluir URL, headers o cuerpos.
      throw new Error('Petición Supabase no confirmada (red/timeout). Sin reintento automático; revisar manifiesto por marcador.')
    }
    let data
    try {
      const text = await response.text()
      data = text ? JSON.parse(text) : null
    } catch { throw new Error(`Respuesta no JSON de Supabase (HTTP ${response.status})`) }
    const code = typeof data?.code === 'string' && /^[A-Z0-9_]{1,12}$/.test(data.code) ? data.code : undefined
    return { status: response.status, code, data: response.ok ? data : null }
  }

  async function login(name) {
    const account = config.accounts[name]
    const result = success(await http('auth/v1/token', { method: 'POST',
      query: { grant_type: 'password' }, body: { email: account.email, password: account.password } }),
    `Auth ${name}`)
    // No devolver ni persistir la respuesta Auth: solo conservar JWT en un closure.
    const token = result?.access_token
    const userId = result?.user?.id
    assert.ok(typeof token === 'string' && /^[0-9a-f-]{36}$/i.test(userId ?? ''), `Sesión ${name} inválida`)
    const session = {
      id: userId,
      request: (path, options = {}) => http(`rest/v1/${path}`, { ...options, token }),
      logout: () => http('auth/v1/logout', { method: 'POST', query: { scope: 'local' }, token }),
    }
    sessions[name] = session
    const user = success(await http('auth/v1/user', { token }), `Validación Auth ${name}`)
    assert.equal(user.id, userId, 'El JWT no corresponde al usuario autenticado')
    const profile = await rows(session, 'profiles', { id: `eq.${userId}`, select: 'id,rol' })
    assert.deepEqual(profile, [{ id: userId, rol: account.role }], `Rol inesperado en profiles para ${name}`)
    return session
  }

  async function rows(session, table, query) {
    const data = success(await session.request(table, { query: { select: '*', ...query } }), `GET ${table}`)
    assert.ok(Array.isArray(data), `GET ${table} debe devolver una lista`)
    return data
  }

  async function rpc(session, name, body) {
    return success(await session.request(`rpc/${name}`, { method: 'POST', body }), `RPC ${name}`)
  }

  async function catalog(table, name) {
    const data = success(await sessions.ADMIN.request(table, { method: 'POST', body: { nombre: name } }), `Alta ${table}`)
    assert.equal(data.length, 1)
    const record = { table, id: id(data[0].id), name }
    manifest.catalog.push(record)
    save()
    assert.equal(data[0].nombre, name)
    return record
  }

  async function recipe(owner, label) {
    const title = `${run}-${label}`
    // Registrar intención ANTES del POST: también sirve para buscar commits tras un timeout.
    manifest.recipes.push({ title, ownerId: sessions[owner].id, status: 'intentada' })
    save()
    const result = await rpc(sessions[owner], 'crear_receta', { p_datos: payload(title) })
    const record = { owner, title, receta_id: id(result?.receta_id), version_id: id(result?.version_id) }
    fixtures.recipes.push(record)
    Object.assign(manifest.recipes.at(-1), record, { status: 'creada' })
    save()
    const initial = await snapshot(record)
    assert.equal(initial.recipe.autor_id, sessions[owner].id)
    assert.equal(initial.version.titulo, title)
    assert.equal(initial.version.estado, 'pendiente')
    assert.equal(initial.version.receta_id, record.receta_id)
    assertRelations(initial, record)
    return record
  }

  function payload(title) {
    return { titulo: title, descripcion: run, porciones: 1, tiempo_minutos: 1, dificultad: 'facil',
      categorias: [fixtures.category.id], ingredientes: [{ ingrediente_id: fixtures.ingredient.id, cantidad: 1, unidad: 'g' }],
      pasos: [`${run}: paso privado`] }
  }

  async function request(owner, label) {
    const name = `${run}-${label}`
    manifest.requests.push({ name, ownerId: sessions[owner].id, status: 'intentada' })
    save()
    const result = await rpc(sessions[owner], 'solicitar_ingrediente', { p_nombre: name })
    const record = { owner, name, id: id(result?.solicitud_id) }
    fixtures.requests.push(record)
    Object.assign(manifest.requests.at(-1), record, { status: 'creada' })
    save()
    const initial = await requestSnapshot(record)
    assert.equal(initial.solicitante_id, sessions[owner].id)
    assert.equal(initial.nombre_solicitado, name)
    assert.equal(initial.estado, 'pendiente')
    return record
  }

  async function requestSnapshot(record) {
    const data = await rows(sessions[record.owner], 'solicitudes_ingredientes', { id: `eq.${record.id}` })
    assert.equal(data.length, 1, 'La solicitud conocida debe ser visible para su dueño')
    assert.equal(data[0].id, record.id)
    return data[0]
  }

  async function snapshot(record, session = sessions[record.owner]) {
    const recipes = await rows(session, 'recetas', { id: `eq.${record.receta_id}` })
    const versions = await rows(session, 'receta_versiones', { id: `eq.${record.version_id}` })
    assert.equal(recipes.length, 1, 'La receta conocida debe ser visible para el actor autorizado')
    assert.equal(versions.length, 1, 'La versión conocida debe ser visible para el actor autorizado')
    const result = { recipe: recipes[0], version: versions[0] }
    assert.equal(result.recipe.id, record.receta_id)
    assert.equal(result.version.id, record.version_id)
    for (const table of ['receta_categorias', 'receta_ingredientes', 'receta_pasos']) {
      result[table] = await rows(session, table, { version_id: `eq.${record.version_id}` })
    }
    return result
  }

  function assertRelations(snapshot, record) {
    assert.deepEqual(snapshot.receta_categorias, [{ version_id: record.version_id, categoria_id: fixtures.category.id }])
    assert.deepEqual(snapshot.receta_ingredientes, [{ version_id: record.version_id,
      ingrediente_id: fixtures.ingredient.id, cantidad: 1, unidad: 'g' }])
    assert.deepEqual(snapshot.receta_pasos, [{ version_id: record.version_id, orden: 1, descripcion: `${run}: paso privado` }])
  }

  async function setup() {
    console.info(`RLS: ejecución ${run}; manifiesto local sin credenciales en artifacts/rls/.`)
    // Ninguna escritura antes de validar las TRES sesiones y sus roles en la base real.
    for (const name of ['A', 'B', 'ADMIN']) await login(name)
    assert.equal(new Set(Object.values(sessions).map(({ id }) => id)).size, 3, 'Las identidades Auth deben ser distintas')
    // Nombres previstos también quedan registrados si un alta de catálogo queda sin confirmar.
    manifest.catalogIntents = { category: `${run}-categoria`, ingredient: `${run}-ingrediente` }
    manifest.anonymousWriteMarkers = [`${run}-anon`, `${run}-anon-cambio`]
    save()
    fixtures.category = await catalog('categorias', manifest.catalogIntents.category)
    fixtures.ingredient = await catalog('ingredientes', manifest.catalogIntents.ingredient)
    fixtures.a = await recipe('A', 'privada-A')
    fixtures.b = await recipe('B', 'privada-B')
    fixtures.approve = await recipe('A', 'aprobar')
    fixtures.reject = await recipe('A', 'rechazar')
    fixtures.requestA = await request('A', 'solicitud-A')
    fixtures.requestB = await request('B', 'solicitud-B')
    fixtures.resolve = await request('A', 'resolver')
    manifest.status = 'fixtures-verificados'
    save()
  }

  async function cleanup() {
    const errors = []
    async function attempt(kind, record, action) {
      try {
        await action()
        manifest.cleanup.push({ kind, id: record.id ?? record.receta_id, status: 'verificada' })
      } catch {
        errors.push(kind)
        manifest.cleanup.push({ kind, id: record.id ?? record.receta_id, status: 'no-confirmada-revisar' })
      }
      save()
    }
    for (const record of fixtures.requests) await attempt('rechazo-solicitud', record, async () => {
      const current = await requestSnapshot(record)
      assert.equal(current.nombre_solicitado, record.name)
      assert.equal(current.solicitante_id, sessions[record.owner].id)
      if (current.estado === 'pendiente') {
        await rpc(sessions.ADMIN, 'resolver_solicitud_ingrediente', {
          p_solicitud_id: record.id, p_accion: 'rechazar', p_ingrediente_id: null,
        })
        assert.equal((await requestSnapshot(record)).estado, 'rechazada')
      }
    })
    for (const record of fixtures.recipes) await attempt('baja-logica-receta', record, async () => {
      const current = await snapshot(record)
      assert.equal(current.version.titulo, record.title)
      assert.equal(current.recipe.autor_id, sessions[record.owner].id)
      const result = await rpc(sessions.ADMIN, 'eliminar_receta', { p_receta_id: record.receta_id })
      assert.equal(result.receta_id, record.receta_id)
      assert.equal(result.eliminada, true)
      assert.deepEqual(await rows(sessions[record.owner], 'recetas', { id: `eq.${record.receta_id}` }), [])
      assert.deepEqual(await rows(anonymous, 'receta_versiones', { id: `eq.${record.version_id}` }), [])
    })
    if (fixtures.ingredient) await attempt('desactivar-ingrediente', fixtures.ingredient, async () => {
      const current = await rows(sessions.ADMIN, 'ingredientes', { id: `eq.${fixtures.ingredient.id}` })
      assert.equal(current[0]?.nombre, fixtures.ingredient.name)
      await rpc(sessions.ADMIN, 'desactivar_ingrediente', { p_ingrediente_id: fixtures.ingredient.id })
      assert.equal((await rows(sessions.ADMIN, 'ingredientes', { id: `eq.${fixtures.ingredient.id}` }))[0]?.activo, false)
    })
    // No usar eliminar_categoria: reasigna relaciones globalmente, incluso de recetas ajenas.
    manifest.retained = 'Historial de recetas/solicitudes, ingrediente inactivo y categoría propia. Sin DELETE físico ni baja masiva de categoría.'
    for (const session of Object.values(sessions)) {
      await attempt('logout-local', {}, async () => success(await session.logout(), 'Logout local'))
    }
    manifest.status = errors.length ? 'limpieza-incompleta' : 'limpieza-segura-finalizada'
    save()
    assert.equal(errors.length, 0, 'Limpieza o cierre de sesión incompleto: revisar manifiesto (no se reintentan escrituras)')
  }

  const anonymous = { request: (path, options) => http(`rest/v1/${path}`, options) }
  return { run, sessions, fixtures, anonymous, setup, cleanup, rows, rpc, snapshot, requestSnapshot,
    assertRelations, payload }
}
