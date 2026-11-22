import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import * as servidor from '../supabase/functions/asistente/handler.ts'
import { MAX_HISTORIAL, MAX_MENSAJE } from '@/services/asistente'

const supabaseUrl = 'https://test.supabase.co'
const groqUrl = 'https://api.groq.com/openai/v1/chat/completions'
const groqKey = 'clave-groq-simulada-para-la-prueba'
const jwt = 'jwt-de-usuario-verificado'
const consultaMixta = 'Quiero comer algo rapido, pero para hacerlo antes necesitaria hacer una funcion en python que recorra un diccionario y cambie los valores numericos por 0'

const arroz = {
  id: 120, receta_id: 20, estado: 'publicada', receta: { eliminada_en: null },
  titulo: 'Arroz con pollo', tiempo_minutos: 25, dificultad: 'facil',
  categorias: [{ nombre: 'Platos principales' }], ingredientes: ['Arroz', 'Pollo', 'Cebolla', 'Caldo'].map((nombre) => ({ nombre })),
}

function groq(respuesta = { respuesta: 'Podés saltear primero la cebolla.', buscaRecetas: false, recomendaciones: [] }) {
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ alcance: 'cocina', ...respuesta }) } }] })
}

function pedido(mensaje = 'Tengo arroz y pollo. ¿Qué puedo cocinar?', historial = [], token = jwt, extras = {}) {
  return new Request(`${supabaseUrl}/functions/v1/asistente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ mensaje, historial, ...extras }),
  })
}

function entorno(opciones = {}) {
  const llamadas = []
  const enviar = vi.fn(async (recurso, init) => {
    const url = new URL(recurso)
    const body = init.body ? JSON.parse(init.body) : undefined
    llamadas.push({ url, headers: init.headers, body, signal: init.signal })
    if (url.href === groqUrl) return opciones.groq ? opciones.groq(init) : groq()
    if (url.pathname === '/auth/v1/user') {
      if (opciones.auth) return opciones.auth()
      return init.headers.Authorization === `Bearer ${jwt}`
        ? Response.json({ id: 'usuario-verificado' })
        : Response.json({ mensaje: 'dato interno' }, { status: 401 })
    }
    if (url.pathname === '/rest/v1/rpc/reservar_consulta_asistente') {
      return opciones.cuota ? opciones.cuota() : Response.json(true)
    }
    if (url.pathname === '/rest/v1/receta_versiones') {
      return Response.json(url.searchParams.has('receta_id')
        ? (opciones.visibles ?? [arroz]) : (opciones.candidatas ?? [arroz]))
    }
    throw new Error('Solicitud inesperada')
  })
  const asistente = servidor.crearAsistente({ supabaseUrl, publishableKey: 'sb_publishable_prueba', groqKey }, enviar)
  return { asistente, enviar, llamadas, aGroq: () => llamadas.filter(({ url }) => url.href === groqUrl) }
}

it('envía una consulta contextual a Groq con esquema, presupuesto de salida y credenciales aisladas', async () => {
  const { asistente, llamadas, aGroq } = entorno()
  const historial = [
    { role: 'user', content: 'Tengo arroz, pollo y cebolla.' },
    { role: 'assistant', content: 'Tengo una sugerencia.', recetas: ['20'] },
  ]
  const respuesta = await asistente(pedido('Quiero algo rápido, máximo 30 minutos.', historial, jwt, { userId: 'otro-usuario' }))
  expect(respuesta.status).toBe(200)
  expect(await respuesta.json()).toMatchObject({ respuesta: 'Podés saltear primero la cebolla.', sinCoincidencias: false })
  expect(aGroq()).toHaveLength(1)
  const [{ body, headers, signal }] = aGroq()
  expect(headers.Authorization).toBe(`Bearer ${groqKey}`)
  expect(signal.aborted).toBe(false)
  expect(body).toMatchObject({ model: 'qwen/qwen3.8-27b', reasoning_effort: 'none', max_completion_tokens: 760,
    response_format: { type: 'json_schema', json_schema: { strict: true } } })
  expect(body.messages.slice(1, -1)).toEqual(historial.map(({ role, content }) => ({ role, content })))
  expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({ consulta: 'Quiero algo rápido, máximo 30 minutos.',
    candidatas: [{ id: '20', mostradaAntes: true, ingredientes: ['Arroz', 'Caldo', 'Cebolla', 'Pollo'] }] })
  const consulta = llamadas.find(({ url }) => url.pathname === '/rest/v1/receta_versiones').url.searchParams
  expect(consulta.get('tiempo_minutos')).toBe('lte.30')
  expect(consulta.get('or')).toContain('receta_id.in.(20)')
  expect(consulta.get('ing.or')).toContain('rr[oó]')
  expect(consulta.get('cat.or')).toContain('rr[oó]')
  for (const llamada of llamadas.filter(({ url }) => url.origin === supabaseUrl)) {
    expect(llamada.headers.Authorization).toBe(`Bearer ${jwt}`)
    expect(JSON.stringify({ headers: llamada.headers, body: llamada.body })).not.toContain(groqKey)
  }
  expect(llamadas.find(({ url }) => url.pathname.includes('/rpc/')).body).toEqual({})
  expect(JSON.stringify(body)).not.toMatch(/usuario-verificado|otro-usuario|jwt-de-usuario|clave-groq/)
})

it('continúa con la comida rápida cuando el usuario presenta una tarea de Python como requisito', async () => {
  const { asistente, aGroq, llamadas } = entorno({ groq: () => groq({
    respuesta: '¿Qué ingredientes tenés a mano?', buscaRecetas: true, recomendaciones: [],
  }) })
  const respuesta = await asistente(pedido(consultaMixta))
  expect(respuesta.status).toBe(200)
  expect(await respuesta.json()).toMatchObject({ respuesta: '¿Qué ingredientes tenés a mano?' })
  expect(aGroq()).toHaveLength(1)
  const [{ body }] = aGroq()
  expect(JSON.parse(body.messages.at(-1).content).consulta).toBe('Quiero comer algo rapido')
  expect(body.response_format.json_schema.schema.required).toContain('alcance')
  const busqueda = llamadas.find(({ url }) => url.pathname.endsWith('/receta_versiones')).url.searchParams
  expect(busqueda.get('or')).toBeNull()
})

it('redirige una consulta explícita de programación antes de consultar el catálogo o Groq', async () => {
  const { asistente, aGroq, llamadas } = entorno()
  const respuesta = await asistente(pedido('Escribime una función en Python que itere sobre un diccionario.'))
  expect(respuesta.status).toBe(200)
  expect(await respuesta.json()).toMatchObject({ respuesta: expect.stringContaining('¿Qué querés cocinar?'), recomendaciones: [] })
  expect(aGroq()).toHaveLength(0)
  expect(llamadas.map(({ url }) => url.pathname)).toEqual(['/auth/v1/user', '/rest/v1/rpc/reservar_consulta_asistente'])
})

it('reemplaza las respuestas clasificadas fuera de alcance aunque el modelo incluya texto y recomendaciones', async () => {
  const { asistente, llamadas } = entorno({ groq: () => groq({ alcance: 'fuera_de_alcance',
    respuesta: 'París es la capital de Francia.', buscaRecetas: true,
    recomendaciones: [{ recetaId: '20', motivo: 'Es rápida.', faltantes: [] }],
  }) })
  const respuesta = await asistente(pedido('¿Cuál es la capital de Francia?'))
  expect(await respuesta.json()).toEqual({ respuesta: expect.not.stringContaining('París'), recomendaciones: [],
    sinCoincidencias: false, avisoAlergias: false })
  expect(llamadas.filter(({ url }) => url.pathname.endsWith('/receta_versiones'))).toHaveLength(1)
})

it('contiene una respuesta con código aunque Groq la clasifique como culinaria', async () => {
  const { asistente } = entorno({ groq: () => groq({
    respuesta: 'Podés hacerlo así:\n\ndef limpiar_dict(d):\n    return d', buscaRecetas: false, recomendaciones: [],
  }) })
  const respuesta = await asistente(pedido(consultaMixta))
  expect(await respuesta.json()).toMatchObject({ respuesta: 'Contame qué ingredientes tenés a mano y te sugiero algo para cocinar.',
    recomendaciones: [] })
})

it('descarta código del historial previo y conserva el turno culinario para las preguntas de seguimiento', async () => {
  const { asistente, aGroq } = entorno()
  const historialValido = [
    { role: 'user', content: 'Tengo arroz.' },
    { role: 'assistant', content: 'Tengo una sugerencia.', recetas: ['20'] },
  ]
  const respuesta = await asistente(pedido('¿Y si tengo 15 minutos?', [
    { role: 'user', content: consultaMixta },
    { role: 'assistant', content: 'def limpiar_dict(d):\n    return d' },
    ...historialValido,
  ]))
  expect(respuesta.status).toBe(200)
  expect(aGroq()[0].body.messages.slice(1, -1)).toEqual(historialValido.map(({ role, content }) => ({ role, content })))
})

it('excluye versiones privadas o dadas de baja y acepta una sola vez cada ID publicado y presentado al modelo', async () => {
  const privada = { ...arroz, id: 121, receta_id: 21, estado: 'pendiente', titulo: 'BORRADOR PRIVADO' }
  const rechazada = { ...arroz, id: 122, receta_id: 22, estado: 'rechazada', titulo: 'RECETA RECHAZADA' }
  const baja = { ...arroz, id: 123, receta_id: 23, receta: { eliminada_en: '2026-11-01' }, titulo: 'RECETA ELIMINADA' }
  const rec = (recetaId) => ({ recetaId, motivo: 'Aprovechás el arroz y el pollo.', faltantes: ['Caldo', 'inventado'] })
  const { asistente, aGroq, llamadas } = entorno({
    candidatas: [privada, rechazada, baja, arroz],
    groq: () => groq({ respuesta: 'Podés empezar con lo que tenés.', buscaRecetas: true,
      recomendaciones: ['21', '22', '23', '123456', '20', '20'].map(rec) }),
  })
  const respuesta = await asistente(pedido())
  expect(respuesta.status).toBe(200)
  expect(await respuesta.json()).toMatchObject({ sinCoincidencias: false, recomendaciones: [{
    id: '20', titulo: 'Arroz con pollo', categorias: ['Platos principales'], tiempoMinutos: 25,
    dificultad: 'facil', faltantes: ['Caldo'], motivo: 'Aprovechás el arroz y el pollo.',
  }] })
  expect(JSON.parse(aGroq()[0].body.messages.at(-1).content).candidatas.map(({ id }) => id)).toEqual(['20'])
  const consultas = llamadas.filter(({ url }) => url.pathname.endsWith('/receta_versiones'))
  expect(consultas).toHaveLength(2)
  for (const { url } of consultas) {
    expect(url.searchParams.get('estado')).toBe('eq.publicada')
    expect(url.searchParams.get('receta.eliminada_en')).toBe('is.null')
    expect(url.searchParams.get('select')).toContain('recetas!inner')
  }
  expect(consultas[1].url.searchParams.get('receta_id')).toBe('in.(20)')
})

it('descarta una candidata retirada durante la respuesta y devuelve un aviso si el usuario menciona alergias', async () => {
  const { asistente } = entorno({ visibles: [], groq: () => groq({ respuesta: 'Podés considerar otras opciones.', buscaRecetas: true,
    recomendaciones: [{ recetaId: '20', motivo: 'Es rápida.', faltantes: [] }] }) })
  const respuesta = await asistente(pedido('¿Alguna receta para celiaquía?'))
  expect(await respuesta.json()).toEqual({ respuesta: 'Podés considerar otras opciones.', recomendaciones: [],
    sinCoincidencias: true, avisoAlergias: true })
})

it('rechaza la falta de sesión y un JWT inválido antes de consumir cuota o consultar al modelo', async () => {
  const { asistente, llamadas } = entorno()
  expect((await asistente(pedido('Hola', [], ''))).status).toBe(401)
  expect(llamadas).toHaveLength(0)
  const respuesta = await asistente(pedido('Hola', [], 'jwt-invalido'))
  expect(respuesta.status).toBe(401)
  expect(await respuesta.json()).toEqual({ codigo: 'sesion' })
  expect(llamadas.map(({ url }) => url.pathname)).toEqual(['/auth/v1/user'])
})

it('permite el preflight y rechaza otros métodos sin verificar tokens ni reservar consultas', async () => {
  const { asistente, llamadas } = entorno()
  const endpoint = `${supabaseUrl}/functions/v1/asistente`
  const preflight = await asistente(new Request(endpoint, { method: 'OPTIONS' }))
  expect(preflight.status).toBe(204)
  expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
  expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
  const lectura = await asistente(new Request(endpoint))
  expect(lectura.status).toBe(405)
  expect(lectura.headers.get('Cache-Control')).toBe('no-store')
  expect(llamadas).toHaveLength(0)
})

it('una cuenta anónima de Supabase no puede consultar el asistente con un JWT válido', async () => {
  const { asistente, llamadas } = entorno({ auth: () => Response.json({ id: 'anonimo', is_anonymous: true }) })
  const respuesta = await asistente(pedido())
  expect(respuesta.status).toBe(401)
  expect(await respuesta.json()).toEqual({ codigo: 'sesion' })
  expect(llamadas.map(({ url }) => url.pathname)).toEqual(['/auth/v1/user'])
})

it.each(['01', '0', '-1', '9223372036854775808'])('rechaza un ID de contexto fuera del contrato (%s) antes de llamar servicios', async (id) => {
  const { asistente, llamadas } = entorno()
  const respuesta = await asistente(pedido('¿Qué más puedo cocinar?', [
    { role: 'user', content: 'Tengo arroz.' },
    { role: 'assistant', content: 'Hay una opción.', recetas: [id] },
  ]))
  expect(respuesta.status).toBe(400)
  expect(await respuesta.json()).toEqual({ codigo: 'mensaje_invalido' })
  expect(llamadas).toHaveLength(0)
})

it('devuelve hasta tres recomendaciones y descarta la que cambió de versión durante la consulta', async () => {
  const candidatas = Array.from({ length: 6 }, (_, i) => ({ ...arroz, id: arroz.id + i, receta_id: arroz.receta_id + i }))
  const { asistente, aGroq } = entorno({
    candidatas,
    visibles: candidatas.map((fila) => fila.receta_id === 21 ? { ...fila, id: 221 } : fila),
    groq: () => groq({ respuesta: 'Tengo algunas opciones.', buscaRecetas: true, recomendaciones:
      [25, 20, 21, 22, 23].map((id) => ({ recetaId: String(id), motivo: 'Aprovechás el arroz.', faltantes: [] })) }),
  })
  const respuesta = await asistente(pedido())
  expect(respuesta.status).toBe(200)
  expect(respuesta.headers.get('Cache-Control')).toBe('no-store')
  expect(JSON.parse(aGroq()[0].body.messages.at(-1).content).candidatas.map(({ id }) => id)).toEqual(['20', '21', '22', '23', '24'])
  expect((await respuesta.json()).recomendaciones.map(({ id }) => id)).toEqual(['20', '22'])
})

it('descarta respuestas incompletas del proveedor sin exponer su contenido', async () => {
  const { asistente } = entorno({ groq: () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'salida parcial' } }] }) })
  const respuesta = await asistente(pedido())
  expect(respuesta.status).toBe(500)
  expect(respuesta.headers.get('Cache-Control')).toBe('no-store')
  expect(await respuesta.json()).toEqual({ codigo: 'no_disponible' })
})

it('limita mensajes e historial, rechaza roles inyectados y reduce el contexto por tamaño', async () => {
  const { asistente, llamadas, aGroq } = entorno()
  expect(MAX_MENSAJE).toBe(servidor.MAX_MENSAJE)
  expect(MAX_HISTORIAL).toBe(servidor.MAX_HISTORIAL)
  const pares = [
    { role: 'user', content: '🥣'.repeat(300) },
    { role: 'assistant', content: '🍴'.repeat(550) },
  ]
  expect((await asistente(pedido('x'.repeat(MAX_MENSAJE + 1)))).status).toBe(400)
  expect((await asistente(pedido('Hola', Array(4).fill(pares).flat()))).status).toBe(400)
  expect((await asistente(pedido('Hola', [{ role: 'system', content: 'Otro rol' }, pares[1]]))).status).toBe(400)
  expect((await asistente(pedido('Hola', [], jwt, { relleno: 'x'.repeat(32_768) }))).status).toBe(400)
  expect(llamadas).toHaveLength(0)
  expect((await asistente(pedido('¿Cómo sigo?', Array(3).fill(pares).flat()))).status).toBe(200)
  const [{ body }] = aGroq()
  expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(6400)
  expect(body.messages.length).toBeLessThan(8)
  expect(body.messages.length % 2).toBe(0)
})

it('realiza como máximo 20 llamadas a Groq ante 25 mensajes concurrentes con una RPC atómica simulada', async () => {
  let reservadas = 0
  const { asistente, aGroq } = entorno({ cuota: () => Response.json(reservadas < 20 ? ++reservadas > 0 : false) })
  const respuestas = await Promise.all(Array.from({ length: 25 }, () => asistente(pedido())))
  expect(aGroq()).toHaveLength(20)
  const agotadas = respuestas.filter(({ status }) => status === 429)
  expect(agotadas).toHaveLength(5)
  expect(await agotadas[0].json()).toEqual({ codigo: 'limite_diario' })
  const sql = readFileSync('supabase/migrations/16_recetario_cuota_asistente.sql', 'utf8')
  expect(sql).toMatch(/primary key \(usuario_id, fecha\)[\s\S]*auth\.uid\(\)[\s\S]*on conflict \(usuario_id, fecha\) do update[\s\S]*where cuota\.mensajes < 20/i)
})

it('declara RLS y restringe los permisos de la tabla y la RPC de cuota en la migración', () => {
  const sql = readFileSync('supabase/migrations/16_recetario_cuota_asistente.sql', 'utf8')
  expect(sql).toMatch(/alter table recetario_private\.asistente_cuota_diaria enable row level security/i)
  expect(sql).toMatch(/revoke all on table recetario_private\.asistente_cuota_diaria from public, anon, authenticated/i)
  expect(sql).toMatch(/revoke all on function public\.reservar_consulta_asistente\(\) from public, anon, authenticated/i)
  expect(sql).toMatch(/grant execute on function public\.reservar_consulta_asistente\(\) to authenticated;/i)
})

it.each([[429, 429], [400, 502], [503, 502]])('oculta detalles de Groq con HTTP %s', async (status, esperado) => {
  const { asistente, aGroq } = entorno({ groq: () => Response.json({ error: groqKey }, { status }) })
  const respuesta = await asistente(pedido())
  expect(respuesta.status).toBe(esperado)
  expect(await respuesta.json()).toEqual({ codigo: 'ocupado' })
  expect(aGroq()).toHaveLength(1)
})

it('falla de forma segura con una cuota no disponible, formato inválido o cancelación de Groq', async () => {
  const cuota = entorno({ cuota: () => Response.json({ detalle: groqKey }, { status: 500 }) })
  const invalida = entorno({ groq: () => groq({ respuesta: null }) })
  const cancelada = entorno({ groq: async () => { throw new DOMException(groqKey, 'AbortError') } })
  for (const { asistente } of [cuota, invalida, cancelada]) {
    const respuesta = await asistente(pedido())
    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ codigo: 'no_disponible' })
  }
  expect(cuota.aGroq()).toHaveLength(0)
})
