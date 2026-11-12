import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import appRouter from '@/router'
import { crearAuthGuard } from '@/router/authGuard'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { eliminarReceta, obtenerPropuestaPropia, obtenerEdicionPublicada } from '@/services/recetas'
import { obtenerPropuesta } from '@/services/moderacion'
import MiRecetaCard from '@/components/recetas/MiRecetaCard.vue'
import { usuarioPrueba } from './vitest.setup'

const copia = (valor) => structuredClone(valor)
const receta = (id, estado, autor = usuarioPrueba.id) => ({
  id, autor_id: autor, creada_en: '2026-11-12T12:00:00Z',
  receta_versiones: [{ id: id + 100, receta_id: id, numero: 1, estado, titulo: `Receta ${id}`, motivo_rechazo: null,
    receta: { id, autor_id: autor }, receta_categorias: [], receta_ingredientes: [], receta_pasos: [],
  }],
})
let registros
let excluidas
let rol
let solicitudes
let fallo
let diferida
let errorRecarga
let confirmar
const respuesta = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const escrituras = () => solicitudes.filter((config) => config.method !== 'get')
const botonBaja = (wrapper, id) => wrapper.get(`[aria-label="Eliminar Receta ${id}"]`)

async function abrir(path = '/mis-recetas') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
  router.beforeEach(crearAuthGuard(auth))
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  if (path === '/admin') await vi.waitFor(() => expect(wrapper.find('.lista-propuestas').exists()).toBe(true))
  return { wrapper, router, auth }
}

beforeEach(() => {
  registros = [receta(12, 'pendiente'), receta(13, 'publicada'), receta(14, 'rechazada'), receta(15, 'pendiente', 'otro-autor')]
  excluidas = new Set()
  rol = 'usuario'
  solicitudes = []
  fallo = null
  diferida = null
  errorRecarga = false
  confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.defaults.adapter = vi.fn(async (config) => {
    solicitudes.push(config)
    if (config.method === 'post') {
      if (config.url !== 'rpc/eliminar_receta') throw new Error('Escritura inesperada')
      if (fallo) throw fallo
      if (diferida) return diferida(config)
      // Simula la siguiente lectura sin eliminar ni alterar el historial de las fixtures.
      excluidas.add(Number(JSON.parse(config.data).p_receta_id))
      return respuesta(config, null)
    }
    if (config.method !== 'get') throw new Error('Escritura directa prohibida')
    if (config.url === 'profiles') return respuesta(config, [{ ...usuarioPrueba, nombre: 'Ana', rol }])
    if (config.url === 'categorias' || config.url === 'ingredientes') return respuesta(config, [])
    if (config.url === 'recetas') {
      if (errorRecarga && excluidas.size) throw new Error('Error de recarga')
      const filas = registros.filter((item) => !excluidas.has(item.id)
        && (!config.params.autor_id || `eq.${item.autor_id}` === config.params.autor_id)
        && (!config.params.id || `eq.${item.id}` === config.params.id))
      return respuesta(config, config.params.offset ? [] : copia(filas))
    }
    if (config.url === 'receta_versiones') {
      const filas = registros.filter((item) => !excluidas.has(item.id)).flatMap((item) => item.receta_versiones)
        .filter((item) => (!config.params.id || `eq.${item.id}` === config.params.id)
          && (!config.params.receta_id || `eq.${item.receta_id}` === config.params.receta_id)
          && (config.params.estado === 'eq.publicada' ? item.estado === 'publicada'
            : config.params.estado === 'eq.pendiente' ? item.estado === 'pendiente' : ['pendiente', 'rechazada'].includes(item.estado)))
      return respuesta(config, config.params.offset ? [] : copia(filas))
    }
    throw new Error(`Consulta inesperada: ${config.url}`)
  })
})

describe('Baja lógica de recetas propias y administrativa', () => {
  it('TEST 01: el autor dispone de Eliminar en pendientes, publicadas y rechazadas, no en recetas ajenas', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.findAllComponents(MiRecetaCard)).toHaveLength(3)
    for (const id of [12, 13, 14]) expect(botonBaja(wrapper, id).text()).toBe('Eliminar')
    expect(wrapper.find('[aria-label="Eliminar Receta 15"]').exists()).toBe(false)
  })

  it('TEST 02: solicita confirmación identificando la receta y la conservación del historial', async () => {
    const { wrapper } = await abrir()
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(confirmar).toHaveBeenCalledTimes(1)
    expect(confirmar.mock.calls[0][0]).toContain('Receta 12')
    expect(confirmar.mock.calls[0][0]).toContain('Se conservará el historial')
  })

  it('TEST 03: cancelar no realiza ninguna petición REST y conserva la tarjeta', async () => {
    confirmar.mockReturnValue(false)
    const { wrapper } = await abrir()
    const antes = solicitudes.length
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(solicitudes).toHaveLength(antes)
    expect(botonBaja(wrapper, 12).exists()).toBe(true)
  })

  it('TEST 04: envía recetas.id, no el ID de versión, con JWT y apikey', async () => {
    const { wrapper } = await abrir()
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    const config = escrituras()[0]
    expect(config.url).toBe('rpc/eliminar_receta')
    expect(JSON.parse(config.data)).toEqual({ p_receta_id: '12' })
    expect(JSON.parse(config.data).p_receta_id).not.toBe(112)
    expect(config.headers.get('Authorization')).toBe('Bearer jwt-prueba')
    expect(config.headers.get('apikey')).toBe('sb_publishable_test')
  })

  it('TEST 05: el éxito informa y vuelve a consultar el listado propio actualizado', async () => {
    const { wrapper } = await abrir()
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Receta eliminada correctamente')
    expect(wrapper.findAllComponents(MiRecetaCard)).toHaveLength(2)
    const posterior = solicitudes.slice(solicitudes.findIndex((config) => config.method === 'post') + 1)
    expect(posterior.some((config) => config.url === 'recetas' && config.params.autor_id === 'eq.uuid-propio')).toBe(true)
  })

  it('TEST 06: una receta eliminada no reaparece al volver a Mis recetas', async () => {
    const { wrapper, router } = await abrir()
    await botonBaja(wrapper, 14).trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-label="Eliminar Receta 14"]').exists()).toBe(false)
    await router.push('/')
    await router.push('/mis-recetas')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Receta 14')
    expect(registros.find((item) => item.id === 14).receta_versiones).toHaveLength(1)
  })

  it('TEST 07: el administrador consulta todos los autores y elimina una receta ajena', async () => {
    rol = 'admin'
    registros.push(receta(16, 'descartada', 'tercer-autor'))
    const { wrapper } = await abrir('/admin')
    await wrapper.get('#admin-recetas-tab-gestion').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('.gestion-lista').exists()).toBe(true))
    const gestion = wrapper.get('.gestion-recetas')
    expect(gestion.text()).toContain('otro-autor')
    expect(gestion.text()).toContain('Descartada')
    await botonBaja(gestion, 15).trigger('click')
    await flushPromises()
    expect(gestion.text()).toContain('Receta eliminada correctamente')
    expect(gestion.find('[aria-label="Eliminar Receta 15"]').exists()).toBe(false)
    expect(JSON.parse(escrituras()[0].data)).toEqual({ p_receta_id: '15' })
    const consulta = solicitudes.find((config) => config.url === 'recetas' && config.params.select.includes('autor_id'))
    expect(consulta.params).not.toHaveProperty('autor_id')
    expect(consulta.params).not.toHaveProperty('receta_versiones.estado')
    expect(consulta.params.eliminada_en).toBe('is.null')
  })

  it('TEST 08: muestra errores de permisos sin quitar la receta ni anunciar éxito', async () => {
    fallo = { response: { status: 403, data: { code: '42501' } } }
    const { wrapper } = await abrir()
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('No tenés permisos')
    expect(botonBaja(wrapper, 12).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Receta eliminada correctamente')
  })

  it('TEST 09: bloquea todos los botones de baja y no repite solicitudes mientras espera', async () => {
    let resolver
    diferida = (config) => new Promise((resolve) => { resolver = () => resolve(respuesta(config, null)) })
    const { wrapper } = await abrir()
    const card = wrapper.getComponent(MiRecetaCard)
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(botonBaja(wrapper, 12).text()).toBe('Eliminando…')
    for (const id of [12, 13, 14]) expect(botonBaja(wrapper, id).element.disabled).toBe(true)
    card.vm.$emit('eliminar', card.props('receta'))
    await flushPromises()
    expect(escrituras()).toHaveLength(1)
    expect(confirmar).toHaveBeenCalledTimes(1)
    resolver()
    await flushPromises()
  })

  it('TEST 10: catálogo y detalle no muestran la receta eliminada según la respuesta actualizada', async () => {
    const { wrapper, router } = await abrir()
    await botonBaja(wrapper, 13).trigger('click')
    await flushPromises()
    await router.push('/')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Receta 13')
    expect(wrapper.text()).toContain('Todavía no hay recetas publicadas')
    await router.push('/recetas/13')
    await flushPromises()
    expect(wrapper.text()).toContain('No encontramos esta página o receta')
    const consultas = solicitudes.filter((config) => config.url === 'receta_versiones')
    expect(consultas.every((config) => config.params['receta.eliminada_en'] === 'is.null')).toBe(true)
  })

  it('TEST 11: edición y moderación excluyen eliminadas; el panel descarta la revisión abierta tras la baja', async () => {
    rol = 'admin'
    const { wrapper } = await abrir('/admin')
    const pendientes = wrapper.get('.moderacion')
    await pendientes.get('[aria-label="Revisar Receta 12, versión 1"]').trigger('click')
    await flushPromises()
    expect(pendientes.text()).toContain('Aprobar receta')
    await wrapper.get('#admin-recetas-tab-gestion').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.gestion-lista').exists()).toBe(true))
    await botonBaja(wrapper.get('.gestion-recetas'), 12).trigger('click')
    await flushPromises()
    await wrapper.get('#admin-recetas-tab-pendientes').trigger('click')
    await flushPromises()
    expect(wrapper.get('.moderacion').text()).not.toContain('Aprobar receta')
    expect(wrapper.get('.moderacion').find('[aria-label="Revisar Receta 12, versión 1"]').exists()).toBe(false)
    expect(await obtenerPropuestaPropia(112, usuarioPrueba.id)).toBeNull()
    expect(await obtenerPropuesta(112)).toBeNull()
    excluidas.add(13)
    expect(await obtenerEdicionPublicada(13, usuarioPrueba.id)).toBeNull()
  })

  it('TEST 12: la única escritura de baja usa RPC, nunca PATCH o DELETE de tablas', async () => {
    await eliminarReceta(12)
    expect(escrituras().map((config) => [config.method, config.url, JSON.parse(config.data)])).toEqual([
      ['post', 'rpc/eliminar_receta', { p_receta_id: 12 }],
    ])
  })

  it('fallar la recarga conserva el éxito y permite reintentar solo la lectura', async () => {
    errorRecarga = true
    const { wrapper } = await abrir()
    await botonBaja(wrapper, 12).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Receta eliminada correctamente')
    expect(wrapper.text()).toContain('No pudimos cargar tus recetas')
    errorRecarga = false
    await wrapper.findAll('button').find((item) => item.text() === 'Reintentar').trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-label="Eliminar Receta 12"]').exists()).toBe(false)
    expect(escrituras()).toHaveLength(1)
  })
})
