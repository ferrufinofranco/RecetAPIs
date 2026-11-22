import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it } from 'vitest'
import App from '@/App.vue'
import LoginView from '@/views/LoginView.vue'
import routerAplicacion from '@/router/index.js'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup.js'

const invoke = getSupabaseMock().functions.invoke
const respuesta = {
  respuesta: 'Podés empezar por dorar el pollo.', sinCoincidencias: false, avisoAlergias: false,
  recomendaciones: [{ id: '20', titulo: 'Arroz con pollo', tiempoMinutos: 25, dificultad: 'facil',
    categorias: ['Platos principales'], motivo: 'Aprovecha lo que tenés.', faltantes: ['Caldo'] }],
}

beforeEach(() => invoke.mockReset().mockResolvedValue({ data: respuesta, error: null }))

async function abrirView(autenticado = true, ruta = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore(pinia)
  auth.user = autenticado ? usuarioPrueba : null
  auth.inicializado = true
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...routerAplicacion.options.routes.filter(({ name }) => ['catalogo', 'asistente'].includes(name)),
    { path: '/login', name: 'login', component: LoginView },
    { path: '/registro', name: 'registro', component: { template: '<p>Registro</p>' } },
    { path: '/recetas/:id', name: 'receta', component: { template: '<p>Detalle</p>' } },
    { path: '/recetas/crear', name: 'crear-receta', component: { template: '<p>Crear receta</p>' } },
    { path: '/mis-recetas', name: 'mis-recetas', component: { template: '<p>Mis recetas</p>' } },
  ] })
  api.defaults.adapter.mockImplementation(async (config) => ({
    data: config.url === 'profiles' ? [{ id: usuarioPrueba.id }] : [], status: 200, headers: {}, config,
  }))
  await router.push(ruta)
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, auth }
}

const flotante = '.asistente-flotante'
const cierre = '.asistente-cerrar'
const panel = '#asistente-panel'
const abrirPanel = (wrapper) => wrapper.get(flotante).trigger('click')

async function enviar(wrapper, texto) {
  await wrapper.get('textarea').setValue(texto)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

it('abre desde el catálogo y restaura el foco al cerrar con el botón o con Escape', async () => {
  const { wrapper, router } = await abrirView()
  const dialogo = wrapper.get(panel)
  expect(router.currentRoute.value.name).toBe('catalogo')
  expect(wrapper.get('header nav').text()).not.toContain('Asistente IA')
  expect(wrapper.findAll('[aria-controls="asistente-panel"]')).toHaveLength(1)
  expect(dialogo.element.open).toBe(false)
  await abrirPanel(wrapper)
  expect(dialogo.element.open).toBe(true)
  expect(wrapper.get(flotante).attributes('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(wrapper.get(cierre).element)
  await wrapper.get(cierre).trigger('click')
  expect(dialogo.element.open).toBe(false)
  expect(document.activeElement).toBe(wrapper.get(flotante).element)
  await abrirPanel(wrapper)
  expect(dialogo.element.open).toBe(true)
  // El navegador traduce Escape al evento cancel del diálogo nativo.
  await dialogo.trigger('cancel')
  expect(dialogo.element.open).toBe(false)
  expect(document.activeElement).toBe(wrapper.get(flotante).element)
  expect(invoke).not.toHaveBeenCalled()
})

it('redirige el acceso anterior al catálogo y abre una sola instancia del panel', async () => {
  const { wrapper, router } = await abrirView(true, '/asistente')
  expect(router.currentRoute.value.fullPath).toBe('/')
  expect(wrapper.findAll(panel)).toHaveLength(1)
  expect(wrapper.get(panel).element.open).toBe(true)
  await wrapper.get(cierre).trigger('click')
  expect(wrapper.get(panel).element.open).toBe(false)
  expect(invoke).not.toHaveBeenCalled()
})

it('envía una sugerencia una sola vez y conserva la respuesta al cerrar durante la consulta', async () => {
  let resolver
  invoke.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve }))
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  expect(wrapper.findAll('.asistente-sugerencias button').map((boton) => boton.text())).toEqual([
    'Tengo arroz, pollo y cebolla', 'Quiero preparar algo rápido', '¿Con qué puedo reemplazar la manteca?', 'Busco una receta vegetariana',
  ])
  await wrapper.get('.asistente-sugerencias button').trigger('click')
  expect(invoke.mock.calls[0][1].body).toEqual({ mensaje: 'Tengo arroz, pollo y cebolla', historial: [] })
  await wrapper.get(cierre).trigger('click')
  expect(invoke.mock.calls[0][1].signal.aborted).toBe(false)
  resolver({ data: respuesta, error: null })
  await flushPromises()
  await abrirPanel(wrapper)
  expect(wrapper.get('.asistente-respuesta').text()).toContain(respuesta.respuesta)
  expect(invoke).toHaveBeenCalledTimes(1)
})

it('envía con Enter, conserva Shift+Enter y muestra estado de espera, respuesta y tarjetas enlazadas', async () => {
  let resolver
  invoke.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve }))
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  const campo = wrapper.get('textarea')
  await campo.setValue('¿Puedo preparar pollo?')
  await campo.trigger('keydown', { key: 'Enter', shiftKey: true })
  await campo.trigger('keydown', { key: 'Enter', isComposing: true })
  expect(invoke).not.toHaveBeenCalled()
  await campo.trigger('keydown', { key: 'Enter' })
  expect(wrapper.get(`${panel} [role="status"]`).text()).toContain('preparando su respuesta')
  expect(wrapper.get('[type="submit"]').element.disabled).toBe(true)
  await wrapper.get('form').trigger('submit')
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(invoke.mock.calls[0][1].body).toEqual({ mensaje: '¿Puedo preparar pollo?', historial: [] })
  expect(invoke.mock.calls[0][1].body).not.toHaveProperty('userId')
  resolver({ data: respuesta, error: null })
  await flushPromises()
  expect(wrapper.get('.asistente-respuesta').text()).toContain(respuesta.respuesta)
  expect(wrapper.get('.asistente-receta a').attributes('href')).toBe('/recetas/20')
  expect(wrapper.get('.asistente-receta').text()).toMatch(/25 min.*Fácil.*Podrían faltarte Caldo/)
  expect(wrapper.find(`${panel} [role="status"]`).exists()).toBe(false)
})

it('mantiene la posición si llega una respuesta mientras se leen mensajes anteriores', async () => {
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  const cuerpo = wrapper.get('.asistente-cuerpo')
  Object.defineProperties(cuerpo.element, { clientHeight: { value: 300 }, scrollHeight: { value: 800 } })
  let resolver
  invoke.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve }))
  await enviar(wrapper, 'Una consulta pendiente')
  expect(cuerpo.element.scrollTop).toBe(800)
  cuerpo.element.scrollTop = 250
  await cuerpo.trigger('scroll')
  resolver({ data: respuesta, error: null })
  await flushPromises()
  expect(cuerpo.element.scrollTop).toBe(250)
})

it('envía los últimos tres turnos completos y conserva el contexto al volver de una receta', async () => {
  const { wrapper, router } = await abrirView()
  await abrirPanel(wrapper)
  for (let i = 1; i <= 4; i++) await enviar(wrapper, `Pregunta ${i}`)
  await wrapper.get('.asistente-receta a').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/recetas/20')
  expect(wrapper.get(panel).element.open).toBe(false)
  await abrirPanel(wrapper)
  expect(wrapper.findAll('.asistente-usuario')).toHaveLength(4)
  await enviar(wrapper, '¿Qué ingredientes me faltarían?')
  const { body } = invoke.mock.calls.at(-1)[1]
  expect(body.historial.filter(({ role }) => role === 'user').map(({ content }) => content)).toEqual(['Pregunta 2', 'Pregunta 3', 'Pregunta 4'])
  expect(body.historial.at(-1)).toEqual({ role: 'assistant', content: respuesta.respuesta, recetas: ['20'] })
})

it('cancela una solicitud pendiente al iniciar otra conversación e ignora respuestas tardías', async () => {
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  let resolver
  invoke.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve }))
  await enviar(wrapper, 'Consulta pendiente')
  const { signal } = invoke.mock.calls[0][1]
  const boton = wrapper.findAll('button').find((b) => b.text() === 'Nueva conversación')
  await boton.trigger('click')
  expect(signal.aborted).toBe(true)
  resolver({ data: respuesta, error: null })
  await flushPromises()
  expect(wrapper.find('.asistente-respuesta').exists()).toBe(false)
  expect(wrapper.get('.asistente-sugerencias').isVisible()).toBe(true)
  await enviar(wrapper, 'Consulta nueva')
  expect(invoke.mock.calls.at(-1)[1].body.historial).toEqual([])
})

it('pide iniciar sesión y vuelve al asistente después de autenticar', async () => {
  const { wrapper, router } = await abrirView(false)
  await abrirPanel(wrapper)
  expect(wrapper.text()).toContain('Iniciá sesión para utilizar el asistente')
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(invoke).not.toHaveBeenCalled()
  getSupabaseMock().auth.signInWithPassword.mockResolvedValue({ data: { session: { user: usuarioPrueba } }, error: null })
  await wrapper.get(`${panel} a`).trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ volver: 'asistente' })
  await wrapper.get('#email').setValue(usuarioPrueba.email)
  await wrapper.get('#password').setValue('clave-simulada')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('catalogo')
  expect(wrapper.get(panel).element.open).toBe(true)
  expect(wrapper.get('textarea').exists()).toBe(true)
})

it('elimina la conversación al cambiar la cuenta', async () => {
  const { wrapper, auth } = await abrirView()
  await abrirPanel(wrapper)
  await enviar(wrapper, 'Una consulta privada')
  auth.user = { id: 'otro-usuario' }
  await flushPromises()
  expect(wrapper.text()).not.toContain('Una consulta privada')
  expect(wrapper.find('.asistente-respuesta').exists()).toBe(false)
  await enviar(wrapper, 'Una consulta de la segunda cuenta')
  expect(invoke.mock.calls.at(-1)[1].body.historial).toEqual([])
})

it('cancela una consulta y descarta la respuesta tardía al cambiar la cuenta', async () => {
  const { wrapper, auth } = await abrirView()
  await abrirPanel(wrapper)
  let resolver
  invoke.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve }))
  await enviar(wrapper, 'Consulta de la primera cuenta')
  const { signal } = invoke.mock.calls[0][1]
  auth.user = { id: 'segunda-cuenta' }
  await flushPromises()
  expect(signal.aborted).toBe(true)
  resolver({ data: respuesta, error: null })
  await flushPromises()
  expect(wrapper.find('.asistente-usuario').exists()).toBe(false)
  expect(wrapper.find('.asistente-respuesta').exists()).toBe(false)
  await enviar(wrapper, 'Consulta de la segunda cuenta')
  expect(invoke.mock.calls.at(-1)[1].body.historial).toEqual([])
})

it('renderiza texto con marcas HTML del modelo y del catálogo como texto literal', async () => {
  const marca = '<strong data-prueba="contenido">Texto de prueba</strong>'
  invoke.mockResolvedValueOnce({ data: { ...respuesta, respuesta: marca, recomendaciones: [{
    ...respuesta.recomendaciones[0], titulo: marca, motivo: marca,
  }] }, error: null })
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  await enviar(wrapper, '¿Tenés una receta?')
  const mensaje = wrapper.get('.asistente-respuesta')
  expect(mensaje.text()).toContain(marca)
  expect(mensaje.find('[data-prueba="contenido"]').exists()).toBe(false)
  expect(mensaje.get('.asistente-receta a').attributes('href')).toBe('/recetas/20')
})

it.each([
  [401, 'sesion', 'Iniciá sesión para utilizar el asistente'],
  [429, 'limite_diario', 'Alcanzaste tu límite de consultas de hoy'],
  [429, 'ocupado', 'El asistente está temporalmente ocupado'],
  [500, 'no_disponible', 'El asistente está temporalmente ocupado'],
])('traduce el error HTTP %s (%s) y restituye el mensaje', async (status, codigo, esperado) => {
  invoke.mockResolvedValueOnce({ data: null, error: { context: Response.json({ codigo, detalle: 'error técnico' }, { status }) } })
  const { wrapper } = await abrirView()
  await abrirPanel(wrapper)
  await enviar(wrapper, '¿Cuánto tarda?')
  expect(wrapper.get('[role="alert"]').text()).toBe(esperado)
  expect(wrapper.text()).not.toContain('error técnico')
  expect(wrapper.get('textarea').element.value).toBe('¿Cuánto tarda?')
})
