import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import appRouter from '@/router'
import { crearAuthGuard } from '@/router/authGuard'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import IngredientesEditor from '@/components/recetas/IngredientesEditor.vue'
import MiRecetaCard from '@/components/recetas/MiRecetaCard.vue'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

const supabaseMock = getSupabaseMock()

const copia = (valor) => structuredClone(valor)
const original = {
  id: 83, receta_id: 12, numero: 1, estado: 'pendiente', motivo_rechazo: null,
  titulo: 'Pan casero', descripcion: 'Con semillas', porciones: 4, tiempo_minutos: 40, dificultad: 'facil',
  receta: { id: 12, autor_id: 'uuid-propio' },
  receta_categorias: [{ categoria_id: 7 }, { categoria_id: 8 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 500, unidad: 'g', ingredientes: { nombre: 'Harina', activo: true } }],
  receta_pasos: [{ orden: 2, descripcion: 'Hornear' }, { orden: 1, descripcion: 'Mezclar' }],
}

let propuesta
let rpcResultado
let rpcError
let rpcPendiente
let rol
let solicitudes
let recetasPropias

function respuesta(config, data) { return { data, status: 200, statusText: 'OK', headers: {}, config } }
const escrituras = () => solicitudes.filter((config) => config.method === 'post')
const payload = () => JSON.parse(escrituras().at(-1).data)

async function abrir(path = '/mis-recetas/propuestas/83/editar') {
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
  propuesta = copia(original)
  rpcResultado = 83
  rpcError = null
  rpcPendiente = null
  rol = 'usuario'
  solicitudes = []
  recetasPropias = [{
    id: 12, creada_en: '2026-11-12T12:00:00Z', receta_versiones: [
      { id: 83, numero: 1, estado: 'pendiente', titulo: 'Pan casero', motivo_rechazo: null },
    ],
  }]
  api.defaults.adapter = vi.fn(async (config) => {
    solicitudes.push(config)
    if (config.method === 'post' && config.url === 'rpc/editar_propuesta_receta') {
      if (rpcError) throw rpcError
      if (rpcPendiente) return rpcPendiente(config)
      return respuesta(config, rpcResultado)
    }
    if (config.method !== 'get') throw new Error(`Escritura inesperada: ${config.url}`)
    if (config.url === 'profiles') return respuesta(config, [{ ...usuarioPrueba, nombre: 'Ana', rol }])
    if (config.url === 'receta_versiones') return respuesta(config, [copia(propuesta)])
    if (config.url === 'categorias') return respuesta(config, [{ id: 7, nombre: 'General' }, { id: 8, nombre: 'Desayuno' }])
    if (config.url === 'ingredientes') return respuesta(config, [
      { id: 9, nombre: 'Harina', activo: propuesta.receta_ingredientes[0].ingredientes.activo },
      { id: 10, nombre: 'Leche', activo: true },
      { id: 11, nombre: 'Ingrediente inactivo nuevo', activo: false },
    ])
    if (config.url === 'recetas') return respuesta(config, config.params.offset ? [] : copia(recetasPropias))
    throw new Error(`Consulta inesperada: ${config.url}`)
  })
})

describe('Edición y reenvío desde la interfaz real', () => {
  it('TEST 01: permite editar una propuesta pendiente y muestra éxito con los datos modificados', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.get('h1').text()).toBe('Editar propuesta')
    await wrapper.get('#titulo-receta').setValue('Pan mejorado')
    await wrapper.get('#cantidad-9').setValue(600)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(payload().p_datos.titulo).toBe('Pan mejorado')
    expect(payload().p_datos.ingredientes).toEqual([{ ingrediente_id: 9, cantidad: 600, unidad: 'g' }])
    expect(wrapper.text()).toContain('Cambios guardados correctamente')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('TEST 02: conserva el ID de versión y el mensaje pendiente, sin enviar estado ni ID de receta', async () => {
    const { wrapper } = await abrir()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(payload().p_version_id).toBe(83)
    expect(payload().p_version_id).not.toBe(propuesta.receta_id)
    expect(payload().p_datos).not.toHaveProperty('estado')
    expect(payload().p_datos).not.toHaveProperty('receta_id')
    expect(wrapper.get('[role="status"]').text()).toContain('continúa pendiente de aprobación')
    await wrapper.get('a').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents(MiRecetaCard)).toHaveLength(1)
    })
    const tarjeta = wrapper.getComponent(MiRecetaCard)
    expect(tarjeta.text()).toContain('Pendiente')
    expect(tarjeta.get('a').attributes('href')).toContain('/propuestas/83/editar')
  })

  it('TEST 03: corrección de rechazada conserva el motivo visible y envía el contenido a la RPC correcta', async () => {
    propuesta.estado = 'rechazada'
    propuesta.motivo_rechazo = 'Revisar cantidades'
    const { wrapper } = await abrir()
    expect(wrapper.get('.motivo-rechazo').text()).toBe('Revisar cantidades')
    await wrapper.get('#titulo-receta').setValue('Pan corregido')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(escrituras()).toHaveLength(1)
    expect(escrituras()[0].url).toBe('rpc/editar_propuesta_receta')
    expect(escrituras()[0].headers.get('Authorization')).toBe('Bearer jwt-prueba')
    expect(escrituras()[0].headers.get('apikey')).toBe('sb_publishable_test')
    expect(payload().p_datos.titulo).toBe('Pan corregido')
    expect(wrapper.text()).toContain('Corrección reenviada correctamente')
  })

  it('TEST 04: acepta nuevo ID de versión de la RPC y al volver muestra una sola tarjeta pendiente nueva', async () => {
    propuesta.estado = 'rechazada'
    rpcResultado = 84
    recetasPropias[0].receta_versiones = [
      { id: 83, numero: 1, estado: 'rechazada', titulo: 'Pan original', motivo_rechazo: 'Revisar cantidades' },
      { id: 84, numero: 2, estado: 'pendiente', titulo: 'Pan corregido', motivo_rechazo: null },
    ]
    const { wrapper, router } = await abrir()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Se creó una nueva versión pendiente')
    await wrapper.get('a').trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('mis-recetas')
      expect(wrapper.findAllComponents(MiRecetaCard)).toHaveLength(1)
    })
    const card = wrapper.getComponent(MiRecetaCard)
    expect(card.text()).toContain('Pan corregido')
    expect(card.text()).toContain('Pendiente')
    expect(card.get('a').attributes('href')).toContain('/propuestas/84/editar')
    expect(payload().p_version_id).toBe(83)
  })

  it('TEST 05: precarga título, categorías, cantidades, unidades y pasos y permite reordenarlos', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.get('#titulo-receta').element.value).toBe('Pan casero')
    expect(wrapper.get('#descripcion-receta').element.value).toBe('Con semillas')
    expect(wrapper.get('#porciones-receta').element.value).toBe('4')
    expect(wrapper.findAll('input[type="checkbox"]').map((item) => item.element.checked)).toEqual([true, true])
    expect(wrapper.get('#cantidad-9').element.value).toBe('500')
    expect(wrapper.get('#unidad-9').element.value).toBe('g')
    expect(wrapper.findAll('.pasos-editor textarea').map((item) => item.element.value)).toEqual(['Mezclar', 'Hornear'])
    await wrapper.get('[aria-label="Subir paso 2"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(payload().p_datos.pasos).toEqual(['Hornear', 'Mezclar'])
  })

  it('TEST 06: el selector y las validaciones impiden ingredientes duplicados', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('#ingrediente-elegido option[value="9"]').exists()).toBe(false)
    await wrapper.get('#ingrediente-elegido').setValue('10')
    await wrapper.get('#cantidad-ingrediente').setValue(200)
    const agregar = wrapper.findAll('button').find((item) => item.text() === 'Agregar ingrediente')
    await agregar.trigger('click')
    expect(wrapper.findAll('.lista-editor li')).toHaveLength(2)
    expect(wrapper.find('#ingrediente-elegido option[value="10"]').exists()).toBe(false)
    await agregar.trigger('click')
    expect(wrapper.getComponent(IngredientesEditor).text()).toContain('todavía no esté agregado')
    expect(wrapper.findAll('.lista-editor li')).toHaveLength(2)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(payload().p_datos.ingredientes.map((item) => item.ingrediente_id)).toEqual([9, 10])
  })

  it('TEST 07: no ofrece ingredientes inactivos nuevos y rechaza su incorporación', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('#ingrediente-elegido option[value="11"]').exists()).toBe(false)
    await wrapper.get('#cantidad-ingrediente').setValue(100)
    await wrapper.findAll('button').find((item) => item.text() === 'Agregar ingrediente').trigger('click')
    expect(wrapper.getComponent(IngredientesEditor).text()).toContain('Seleccioná un ingrediente activo')
    expect(wrapper.findAll('.lista-editor li')).toHaveLength(1)
    expect(escrituras()).toHaveLength(0)
  })

  it('TEST 08: conserva y guarda un ingrediente inactivo original, con cantidad y unidad editables', async () => {
    propuesta.receta_ingredientes[0].ingredientes.activo = false
    const { wrapper } = await abrir()
    expect(wrapper.get('.lista-editor').text()).toContain('Harina (inactivo)')
    expect(wrapper.find('#ingrediente-elegido option[value="9"]').exists()).toBe(false)
    await wrapper.get('#cantidad-9').setValue(0.5)
    await wrapper.get('#unidad-9').setValue('kg')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(payload().p_datos.ingredientes).toEqual([{ ingrediente_id: 9, cantidad: 0.5, unidad: 'kg' }])
    expect(wrapper.text()).toContain('Cambios guardados correctamente')
  })

  it('TEST 09: una versión publicada no admite edición directa como propuesta pendiente', async () => {
    propuesta.estado = 'publicada'
    const { wrapper } = await abrir()
    expect(wrapper.text()).toContain('Propuesta no disponible')
    expect(wrapper.find('form').exists()).toBe(false)
    const card = mount(MiRecetaCard, { props: { receta: {
      id: '12', titulo: 'Pan', estado: 'publicada', creadaEn: '2026-11-12', versionEditableId: null,
    } }, global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(card.getComponent(RouterLinkStub).props('to')).toEqual({ name: 'editar-publicada', params: { recetaId: '12' } })
    expect(escrituras()).toHaveLength(0)
  })

  it('TEST 10: un error RPC informa al usuario y conserva los datos para corregir o reintentar', async () => {
    rpcError = { response: { status: 403, data: { code: '42501' } } }
    const { wrapper } = await abrir()
    await wrapper.get('#titulo-receta').setValue('Pan actualizado')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('sesión esté activa y tenga permisos')
    expect(wrapper.get('#titulo-receta').element.value).toBe('Pan actualizado')
    expect(wrapper.get('fieldset').element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('Cambios guardados correctamente')
  })

  it('TEST 11: bloquea doble envío mientras espera y retira el formulario tras el éxito', async () => {
    let resolver
    rpcPendiente = (config) => new Promise((resolve) => { resolver = () => resolve(respuesta(config, 83)) })
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
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('continúa pendiente')
  })

  it('TEST 12: las rutas reales mantienen redirección de visitante, rechazo de usuario y acceso admin', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const invitado = await abrir()
    expect(invitado.router.currentRoute.value.name).toBe('login')
    expect(invitado.wrapper.find('form').exists()).toBe(true)
    expect(escrituras()).toHaveLength(0)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-prueba', user: usuarioPrueba } }, error: null })
    const usuario = await abrir('/admin')
    expect(usuario.router.currentRoute.value.name).toBe('acceso-denegado')
    rol = 'admin'
    await usuario.router.push('/admin')
    expect(usuario.router.currentRoute.value.name).toBe('admin')
    expect(escrituras()).toHaveLength(0)
  })

  it('Cancelar vuelve a Mis recetas sin enviar ninguna escritura', async () => {
    const { wrapper, router } = await abrir()
    await wrapper.get('#titulo-receta').setValue('Cambio que no se guarda')
    const cancelar = wrapper.findAll('a').find((item) => item.text() === 'Cancelar sin guardar')
    await cancelar.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('mis-recetas'))
    expect(escrituras()).toHaveLength(0)
  })

  it('Si falla la precarga muestra error y no habilita el formulario', async () => {
    const adapter = api.defaults.adapter
    api.defaults.adapter = vi.fn(async (config) => {
      if (config.url === 'receta_versiones') throw { response: { status: 503 } }
      return adapter(config)
    })
    const { wrapper } = await abrir()
    expect(wrapper.get('[role="alert"]').text()).toContain('No pudimos cargar la propuesta')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(escrituras()).toHaveLength(0)
  })
})
