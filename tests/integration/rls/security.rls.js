import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createHarness, denied, success } from './harness.mjs'

describe('Seguridad RLS real — Supabase Auth + REST (sin mocks)', () => {
  const h = createHarness()
  const { sessions: s, fixtures: f } = h
  beforeAll(() => h.setup())
  afterAll(() => h.cleanup())

  test('RLS-01 | Solicitudes: propietario o admin consulta (15)', async () => {
    expect((await h.requestSnapshot(f.requestA)).estado).toBe('pendiente')
    expect((await h.requestSnapshot(f.requestB)).solicitante_id).toBe(s.B.id)
    expect(await h.rows(s.B, 'solicitudes_ingredientes', { id: `eq.${f.requestA.id}` })).toEqual([])
  })

  test('RLS-02 | Autor/Catálogo/Admin: versiones y relaciones privadas (02/10/11/12/14)', async () => {
    h.assertRelations(await h.snapshot(f.a), f.a)
    h.assertRelations(await h.snapshot(f.b), f.b)
    expect(await h.rows(s.B, 'receta_versiones', { id: `eq.${f.a.version_id}` })).toEqual([])
    expect(await h.rows(s.B, 'recetas', { id: `eq.${f.a.receta_id}` })).toEqual([])
    for (const table of ['receta_categorias', 'receta_ingredientes', 'receta_pasos']) {
      expect(await h.rows(s.B, table, { version_id: `eq.${f.a.version_id}` })).toEqual([])
    }
    expect(await h.rows(s.B, 'receta_versiones', { id: `eq.${f.a.version_id}`,
      select: 'id,receta_categorias(*),receta_ingredientes(*),receta_pasos(*)' })).toEqual([])
  })

  test('RLS-03 | Autor: leer mis recetas/versiones + solicitudes propias (10/12/15)', async () => {
    const own = await h.snapshot(f.a)
    expect(own.recipe.autor_id).toBe(s.A.id)
    expect(own.version.estado).toBe('pendiente')
    h.assertRelations(own, f.a)
    expect((await h.requestSnapshot(f.requestA)).solicitante_id).toBe(s.A.id)
  })

  test('RLS-04 | Admin: leer propuestas, relaciones y solicitudes ajenas (11/14/15)', async () => {
    for (const record of [f.a, f.b]) {
      const proposal = await h.snapshot(record, s.ADMIN)
      expect(proposal.recipe.autor_id).toBe(s[record.owner].id)
      expect(proposal.version.estado).toBe('pendiente')
      h.assertRelations(proposal, record)
    }
    for (const record of [f.requestA, f.requestB]) {
      expect(await h.rows(s.ADMIN, 'solicitudes_ingredientes', { id: `eq.${record.id}` }))
        .toEqual([await h.requestSnapshot(record)])
    }
  })

  test('RLS-05 | resolver_solicitud_ingrediente_internal: solo admin (15)', async () => {
    const before = await h.requestSnapshot(f.resolve)
    expect(before.estado).toBe('pendiente')
    const body = { p_solicitud_id: f.resolve.id, p_accion: 'rechazar', p_ingrediente_id: null }
    for (const actor of [s.A, s.B]) {
      const result = await actor.request('rpc/resolver_solicitud_ingrediente', { method: 'POST', body })
      // Primero comprobar persistencia, aun si la respuesta indica un éxito indebido.
      expect(await h.requestSnapshot(f.resolve)).toEqual(before)
      denied(result)
    }
    const result = await h.rpc(s.ADMIN, 'resolver_solicitud_ingrediente', body)
    expect(result.solicitud_id).toBe(f.resolve.id)
    const after = await h.requestSnapshot(f.resolve)
    expect(after.estado).toBe('rechazada')
    expect(after.resuelta_en).not.toBeNull()
    expect(after.ingrediente_id).toBeNull()
  })

  test('RLS-06 | aprobar_receta_internal / rechazar_receta_internal: solo admin (11)', async () => {
    for (const [record, name, state] of [[f.approve, 'aprobar_receta', 'publicada'], [f.reject, 'rechazar_receta', 'rechazada']]) {
      const before = await h.snapshot(record)
      expect(before.version.estado).toBe('pendiente')
      const body = { p_version_id: record.version_id, ...(state === 'rechazada' ? { p_motivo: h.run } : {}) }
      for (const actor of [s.A, s.B]) {
        const result = await actor.request(`rpc/${name}`, { method: 'POST', body })
        expect(await h.snapshot(record)).toEqual(before)
        denied(result)
      }
      const result = await h.rpc(s.ADMIN, name, body)
      expect(result.version_id).toBe(record.version_id)
      const after = await h.snapshot(record)
      expect(after.version.estado).toBe(state)
      h.assertRelations(after, record)
      if (state === 'rechazada') expect(after.version.motivo_rechazo).toBe(h.run)
      else expect(await h.rows(h.anonymous, 'receta_versiones', { id: `eq.${record.version_id}`, select: 'id' }))
        .toEqual([{ id: record.version_id }])
    }
  })

  test('RLS-07 | profiles.rol: sin GRANT UPDATE ni política de autoasignación (01/02)', async () => {
    for (const actor of [s.A, s.B]) {
      const query = { id: `eq.${actor.id}`, select: 'id,rol' }
      const before = await h.rows(actor, 'profiles', query)
      expect(before).toEqual([{ id: actor.id, rol: 'usuario' }])
      const result = await actor.request('profiles', { method: 'PATCH', query, body: { rol: 'admin' } })
      expect(await h.rows(actor, 'profiles', query)).toEqual(before)
      denied(result, { empty: true })
    }
    // El admin ya autenticado tiene permisos efectivos, no solo metadata/guard del cliente.
    expect(await h.rows(s.ADMIN, 'profiles', { id: `eq.${s.ADMIN.id}`, select: 'id,rol' }))
      .toEqual([{ id: s.ADMIN.id, rol: 'admin' }])
    expect(await h.rows(s.ADMIN, 'solicitudes_ingredientes', { id: `eq.${f.requestA.id}`, select: 'id' }))
      .toEqual([{ id: f.requestA.id }])
  })

  test('RLS-08 | anon: solicitudes privadas y escrituras protegidas (02/07/09/11/15)', async () => {
    const requestBefore = await h.requestSnapshot(f.requestA)
    const recipeBefore = await h.snapshot(f.a)
    const read = await h.anonymous.request('solicitudes_ingredientes', { query: { id: `eq.${f.requestA.id}`, select: 'id' } })
    denied(read, { empty: true })
    for (const table of ['receta_versiones', 'receta_categorias', 'receta_ingredientes', 'receta_pasos']) {
      const filter = table === 'receta_versiones' ? { id: `eq.${f.a.version_id}` } : { version_id: `eq.${f.a.version_id}` }
      expect(await h.rows(h.anonymous, table, filter)).toEqual([])
    }
    const operations = [
      ['aprobar_receta', { p_version_id: f.a.version_id }],
      ['rechazar_receta', { p_version_id: f.a.version_id, p_motivo: h.run }],
      ['resolver_solicitud_ingrediente', { p_solicitud_id: f.requestA.id, p_accion: 'rechazar', p_ingrediente_id: null }],
      ['eliminar_receta', { p_receta_id: f.a.receta_id }],
      ['solicitar_ingrediente', { p_nombre: `${h.run}-anon` }],
      ['crear_receta', { p_datos: h.payload(`${h.run}-anon`) }],
    ]
    for (const [name, body] of operations) {
      const result = await h.anonymous.request(`rpc/${name}`, { method: 'POST', body })
      expect(await h.requestSnapshot(f.requestA)).toEqual(requestBefore)
      expect(await h.snapshot(f.a)).toEqual(recipeBefore)
      expect(await h.rows(s.ADMIN, 'solicitudes_ingredientes', { nombre_solicitado: `eq.${h.run}-anon`, select: 'id' })).toEqual([])
      expect(await h.rows(s.ADMIN, 'receta_versiones', { titulo: `eq.${h.run}-anon`, select: 'id' })).toEqual([])
      denied(result)
    }
    const query = { id: `eq.${f.ingredient.id}` }
    const before = await h.rows(s.ADMIN, 'ingredientes', query)
    const result = await h.anonymous.request('ingredientes', { method: 'PATCH', query,
      body: { nombre: `${h.run}-anon-cambio` } })
    expect(await h.rows(s.ADMIN, 'ingredientes', query)).toEqual(before)
    denied(result, { empty: true })
    // Control positivo de la MISMA escritura directa, con lectura persistida y restauración.
    try {
      success(await s.ADMIN.request('ingredientes', { method: 'PATCH', query,
        body: { nombre: `${h.run}-admin-cambio` } }), 'Renombrado autorizado')
      expect((await h.rows(s.ADMIN, 'ingredientes', query))[0]?.nombre).toBe(`${h.run}-admin-cambio`)
    } finally {
      success(await s.ADMIN.request('ingredientes', { method: 'PATCH', query,
        body: { nombre: f.ingredient.name } }), 'Restauración del ingrediente propio')
      expect(await h.rows(s.ADMIN, 'ingredientes', query)).toEqual(before)
    }
  })
})
