import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import appRouter from '@/router'
import { crearAuthGuard } from '@/router/authGuard'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { proponerEdicionReceta } from '@/services/recetas'
import MiRecetaCard from '@/components/recetas/MiRecetaCard.vue'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

const supabase = getSupabaseMock()
const copia = (valor) => structuredClone(valor)
const aprobada = {
  id: 50, receta_id: 12, numero: 1, estado: 'publicada', motivo_rechazo: null,
  titulo: 'Pan aprobado', descripcion: 'Descripción aprobada', porciones: 4, tiempo_minutos: 30, dificultad: 'facil',
  imagen_path: 'https://example.com/aprobada.jpg', receta: { id: 12, autor_id: 'uuid-propio' },
  receta_categorias: [{ categoria_id: 7, categorias: { id: 7, nombre: 'General' } }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { id: 9, nombre: 'Harina', activo: false } }],
  receta_pasos: [{ orden: 2, descripcion: 'Hornear' }, { orden: 1, descripcion: 'Mezclar' }],
}
const pendiente = { ...copia(aprobada), id: 51, numero: 2, estado: 'pendiente', titulo: 'Pan propuesto' }
let versiones
let autor
let solicitudes
let fallo
let diferida
const escrituras = () => solicitudes.filter((config) => config.method !== 'get')
const responder = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })

async function abrir(path = '/mis-recetas/12/editar-publicada') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
  router.beforeEach(crearAuthGuard(auth))
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, auth }
}

beforeEach(() => {
  versiones = [copia(aprobada)]
  autor = usuarioPrueba.id
  solicitudes = []
  fallo = null
  diferida = null
  api.defaults.adapter = vi.fn(async (config) => {
    solicitudes.push(config)
    if (config.method === 'post') {
      if (!['rpc/proponer_edicion_receta', 'rpc/editar_propuesta_receta'].includes(config.url)) throw new Error('RPC inesperada')
      if (fallo) throw fallo
      if (diferida) return diferida(config)
      // Respuestas simuladas independientes: no implementan ni verifican la lógica SQL.
      versiones = [copia(aprobada), copia(pendiente)]
      return responder(config, 51)
    }
    if (config.method !== 'get') throw new Error('Escritura directa prohibida')
    if (config.url === 'profiles') return responder(config, [{ ...usuarioPrueba, rol: 'usuario', nombre: 'Ana' }])
    if (config.url === 'categorias') return responder(config, [{ id: 7, nombre: 'General' }])
    if (config.url === 'ingredientes') return responder(config, [
      { id: 9, nombre: 'Harina', activo: false }, { id: 10, nombre: 'Leche', activo: true },
    ])
    if (config.url === 'recetas') return responder(config, config.params.offset ? [] : [{
      id: 12, autor_id: autor, creada_en: '2026-11-12T12:00:00Z', receta_versiones: copia(versiones),
    }])
    if (config.url === 'receta_versiones') {
      const filas = versiones.filter((version) => config.params.estado === 'eq.publicada'
        ? version.estado === 'publicada'
        : ['pendiente', 'rechazada'].includes(version.estado) && `eq.${version.id}` === config.params.id)
      return responder(config, config.params.offset ? [] : copia(filas))
    }
    throw new Error(`Consulta inesperada: ${config.url}`)
  })
})

describe('Edición de publicadas con propuestas pendientes', () => {
  it('TEST 01: el autor inicia edición desde su tarjeta publicada', async () => {
    const { wrapper, router } = await abrir('/mis-recetas')
    const card = wrapper.getComponent(MiRecetaCard)
    expect(card.get('a').text()).toBe('Editar')
    await card.get('a').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#titulo-receta').exists()).toBe(true))
    expect(router.currentRoute.value.name).toBe('editar-publicada')
    const consulta = solicitudes.find((config) => config.params?.id === 'eq.12' && config.url === 'recetas')
    expect(consulta.params.autor_id).toBe('eq.uuid-propio')
    expect(consulta.params.eliminada_en).toBe('is.null')
  })

  it('TEST 02: precarga exclusivamente el contenido publicado y conserva ingredientes inactivos originales', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.get('#titulo-receta').element.value).toBe('Pan aprobado')
    expect(wrapper.get('#descripcion-receta').element.value).toBe('Descripción aprobada')
    expect(wrapper.get('#porciones-receta').element.value).toBe('4')
    expect(wrapper.get('#tiempo-receta').element.value).toBe('30')
    expect(wrapper.get('#dificultad-receta').element.value).toBe('facil')
    expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(true)
    expect(wrapper.get('#cantidad-9').element.value).toBe('200')
    expect(wrapper.get('#unidad-9').element.value).toBe('g')
    expect(wrapper.get('.lista-editor').text()).toContain('inactivo')
    expect(wrapper.findAll('.pasos-editor textarea').map((paso) => paso.element.value)).toEqual(['Mezclar', 'Hornear'])
    expect(wrapper.get('input[type="file"]').attributes('accept')).toContain('image/webp')
  })

  it('TEST 03: el servicio envía ID de receta, contenido validado, JWT y apikey, sin imagen ni estado', async () => {
    await proponerEdicionReceta(12, {
      titulo: ' Pan nuevo ', descripcion: '', porciones: 2, tiempo_minutos: '', dificultad: '',
      categorias: [7], ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g' }], pasos: ['Mezclar'],
      imagen_path: 'otra.jpg', estado: 'publicada', autor_id: 'otro',
    })
    const config = escrituras()[0]
    expect(config.url).toBe('rpc/proponer_edicion_receta')
    expect(config.headers.get('Authorization')).toBe('Bearer jwt-prueba')
    expect(config.headers.get('apikey')).toBe('sb_publishable_test')
    expect(JSON.parse(config.data)).toEqual({ p_receta_id: 12, p_datos: {
      titulo: 'Pan nuevo', descripcion: null, porciones: 2, tiempo_minutos: null, dificultad: null,
      categorias: [7], ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g' }], pasos: ['Mezclar'],
    } })
  })

  it('TEST 04: guardar muestra confirmación y regresa automáticamente a Mis recetas', async () => {
    const { wrapper, router } = await abrir()
    await wrapper.get('#titulo-receta').setValue('Pan propuesto')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('mis-recetas'))
    expect(wrapper.text()).toContain('Propuesta de edición enviada para aprobación')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(escrituras()).toHaveLength(1)
    expect(JSON.parse(escrituras()[0].data).p_receta_id).toBe(12)
  })

  it('TEST 05: Mis recetas muestra una sola tarjeta publicada con cambios pendientes', async () => {
    versiones.push(copia(pendiente))
    const { wrapper } = await abrir('/mis-recetas')
    expect(wrapper.findAllComponents(MiRecetaCard)).toHaveLength(1)
    const card = wrapper.getComponent(MiRecetaCard)
    expect(card.get('h2').text()).toBe('Pan aprobado')
    expect(card.text()).toContain('Publicada')
    expect(card.text()).toContain('Modificaciones pendientes')
    expect(card.text()).toContain('La versión publicada sigue visible')
  })

  it('TEST 06: una propuesta pendiente existente redirige a su edición, sin crear otra versión', async () => {
    versiones.push(copia(pendiente))
    const { wrapper, router } = await abrir()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('editar-propuesta'))
    await vi.waitFor(() => expect(wrapper.find('#titulo-receta').exists()).toBe(true))
    expect(router.currentRoute.value.params.versionId).toBe('51')
    expect(wrapper.get('#titulo-receta').element.value).toBe('Pan propuesto')
    expect(escrituras()).toHaveLength(0)
  })

  it('TEST 07: el enlace de la tarjeta edita la pendiente usando su ID de versión y RPC existente', async () => {
    versiones.push(copia(pendiente))
    const { wrapper } = await abrir('/mis-recetas')
    const enlace = wrapper.getComponent(MiRecetaCard).get('a')
    expect(enlace.text()).toBe('Editar propuesta pendiente')
    expect(enlace.attributes('href')).toContain('/propuestas/51/editar')
    await enlace.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(escrituras()[0].url).toBe('rpc/editar_propuesta_receta')
    expect(JSON.parse(escrituras()[0].data).p_version_id).toBe(51)
  })

  it('TEST 08: catálogo y detalle público consultan solo la publicada y no muestran la pendiente', async () => {
    versiones.push(copia(pendiente))
    const { wrapper, router } = await abrir('/')
    expect(wrapper.text()).toContain('Pan aprobado')
    expect(wrapper.text()).not.toContain('Pan propuesto')
    await router.push('/recetas/12')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Pan aprobado')
    expect(wrapper.text()).not.toContain('Pan propuesto')
    const lecturas = solicitudes.filter((config) => config.url === 'receta_versiones')
    expect(lecturas.length).toBeGreaterThan(0)
    expect(lecturas.every((config) => config.params.estado === 'eq.publicada')).toBe(true)
  })

  it('TEST 09: un error de API se muestra y preserva el formulario sin anunciar éxito', async () => {
    fallo = { response: { status: 403 } }
    const { wrapper, router } = await abrir()
    await wrapper.get('#titulo-receta').setValue('Cambio conservado')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('permisos')
    expect(wrapper.get('#titulo-receta').element.value).toBe('Cambio conservado')
    expect(router.currentRoute.value.name).toBe('editar-publicada')
    expect(wrapper.get('fieldset').element.disabled).toBe(false)
  })

  it('TEST 10: bloquea botones y doble envío durante el guardado', async () => {
    let resolver
    diferida = (config) => new Promise((resolve) => { resolver = () => resolve(responder(config, 51)) })
    const { wrapper } = await abrir()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('fieldset').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Guardando…')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(escrituras()).toHaveLength(1)
    resolver()
    await flushPromises()
  })

  it('TEST 11: mantiene validaciones de ingredientes, categorías y pasos antes de enviar', async () => {
    const { wrapper } = await abrir()
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('categoría')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('#cantidad-9').setValue(0)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('cantidad positiva')
    await wrapper.get('#cantidad-9').setValue(200)
    await wrapper.get('.pasos-editor textarea').setValue('  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('completá todos los pasos')
    expect(escrituras()).toHaveLength(0)
  })

  it('TEST 12: propuesta rechazada no reemplaza el título aprobado ni el estado público', async () => {
    versiones.push({ ...copia(pendiente), estado: 'rechazada', motivo_rechazo: 'Revisar cantidades' })
    const { wrapper } = await abrir('/mis-recetas')
    const card = wrapper.getComponent(MiRecetaCard)
    expect(card.get('h2').text()).toBe('Pan aprobado')
    expect(card.text()).toContain('Publicada')
    expect(card.text()).toContain('Revisar cantidades')
    expect(card.text()).not.toContain('Modificaciones pendientes')
    expect(card.get('a').attributes('href')).toContain('/12/editar-publicada')
  })

  it('TEST 13: guardar no hace PATCH, UPDATE ni POST sobre tablas publicadas', async () => {
    const { wrapper } = await abrir()
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Propuesta de edición enviada para aprobación'))
    expect(escrituras().map((config) => [config.method, config.url])).toEqual([['post', 'rpc/proponer_edicion_receta']])
  })

  it('TEST 14: visitante va a Login y un usuario común no accede a administración', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const invitado = await abrir()
    expect(invitado.router.currentRoute.value.name).toBe('login')
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-prueba', user: usuarioPrueba } }, error: null })
    const usuario = await abrir('/admin')
    expect(usuario.router.currentRoute.value.name).toBe('acceso-denegado')
    expect(escrituras()).toHaveLength(0)
  })

  it('un autor ajeno o una receta sin publicación no abre el formulario', async () => {
    autor = 'otro-autor'
    const ajeno = await abrir()
    expect(ajeno.wrapper.text()).toContain('Receta no disponible para edición')
    expect(ajeno.wrapper.find('form').exists()).toBe(false)
    autor = usuarioPrueba.id
    versiones = [copia(pendiente)]
    const noPublicada = await abrir()
    expect(noPublicada.wrapper.find('form').exists()).toBe(false)
    expect(escrituras()).toHaveLength(0)
  })
})
