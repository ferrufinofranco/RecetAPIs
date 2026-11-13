import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import appRouter from '@/router'
import { crearAuthGuard } from '@/router/authGuard'
import { useAuthStore } from '@/stores/auth'
import SolicitudesIngredientes from '@/components/ingredientes/SolicitudesIngredientes.vue'
import SolicitarIngredienteDialogo from '@/components/ingredientes/SolicitarIngredienteDialogo.vue'
import App from '@/App.vue'
import { api } from '@/services/api'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

let filas, rol, peticiones
const post = () => peticiones.filter((config) => config.method === 'post')
beforeEach(() => {
  rol = 'usuario'
  filas = [{ id: 10, nombre_solicitado: 'Almendras', solicitante_id: usuarioPrueba.id, estado: 'pendiente', creada_en: '2026-11-12T12:00:00Z' }]
  peticiones = []
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data = []
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol }]
    else if (config.url === 'solicitudes_ingredientes') data = config.params.offset ? [] : structuredClone(filas)
    else if (config.url === 'ingredientes') data = [{ id: 8, nombre: 'Harina', activo: true }, { id: 9, nombre: 'Inactivo', activo: false }]
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'General' }]
    else if (config.url === 'rpc/solicitar_ingrediente') data = { solicitud_id: 11, estado: 'pendiente' }
    else if (config.url === 'rpc/resolver_solicitud_ingrediente') { filas = []; data = { solicitud_id: 10, estado: 'aprobada' } }
    else throw new Error('Petición inesperada')
    return { data, status: 200, headers: {}, config }
  })
})

async function montar(administrativa = false, solicitar = false) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  await auth.inicializar()
  return mount(solicitar ? SolicitarIngredienteDialogo : SolicitudesIngredientes, {
    props: solicitar ? {} : { administrativa },
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
}

it('05: usuario solicita un ingrediente mediante RPC, solo nombre y JWT', async () => {
  const wrapper = await montar(false, true)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await wrapper.get('input').setValue('  Harina de almendras  ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(post()).toHaveLength(1)
  expect(post()[0].url).toBe('rpc/solicitar_ingrediente')
  expect(JSON.parse(post()[0].data)).toEqual({ p_nombre: 'Harina de almendras' })
  expect(post()[0].headers.get('Authorization')).toBe('Bearer jwt-prueba')
  expect(wrapper.text()).toContain('Solicitud enviada')
})

it('06: visitante no puede navegar a Mis solicitudes', async () => {
  getSupabaseMock().auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
  router.beforeEach(crearAuthGuard(useAuthStore(pinia)))
  await router.push('/mis-solicitudes')
  expect(router.currentRoute.value.name).toBe('login')
  expect(post()).toHaveLength(0)
})

for (const admin of [false, true]) {
  it(`retira el enlace personal del menú de ${admin ? 'administrador' : 'usuario'} y redirige enlaces anteriores al panel`, async () => {
    rol = admin ? 'admin' : 'usuario'
    const pinia = createPinia()
    const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
    router.beforeEach(crearAuthGuard(useAuthStore(pinia)))
    await router.push('/mis-solicitudes')
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('crear-receta')
    expect(router.currentRoute.value.query.solicitudes).toBe('abiertas')
    expect(router.currentRoute.value.hash).toBe('#historial-solicitudes')
    expect(appRouter.options.scrollBehavior(router.currentRoute.value)).toEqual({ el: '#historial-solicitudes', top: 24 })
    expect(wrapper.get('#ver-mis-solicitudes').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#historial-solicitudes').isVisible()).toBe(true)
    expect(wrapper.get('#historial-solicitudes').text()).toContain('Almendras')
    expect(wrapper.get('nav').text()).not.toContain('Mis solicitudes')
    expect(wrapper.get('nav').text().includes('Administración')).toBe(admin)
    expect(post()).toHaveLength(0)
    wrapper.unmount()
  })
}

it('el enlace anterior abre el historial en un formulario ya montado sin perder sus cambios', async () => {
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
  router.beforeEach(crearAuthGuard(useAuthStore(pinia)))
  await router.push('/recetas/crear')
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  await wrapper.get('#titulo-receta').setValue('Mi borrador')
  const titulo = wrapper.get('#titulo-receta').element
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await router.push('/mis-solicitudes')
  await flushPromises()
  expect(wrapper.get('#titulo-receta').element).toBe(titulo)
  expect(titulo.value).toBe('Mi borrador')
  expect(wrapper.get('#ver-mis-solicitudes').attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('#historial-solicitudes').text()).toContain('Almendras')
  expect(document.activeElement.id).toBe('historial-solicitudes')
  expect(confirmar).not.toHaveBeenCalled()
  expect(post()).toHaveLength(0)
})

it('07: consulta sus solicitudes y muestra los cuatro estados sin ofrecer modificación', async () => {
  filas = ['pendiente', 'aprobada', 'rechazada', 'asociada'].map((estado, id) => ({ ...filas[0], id, estado }))
  const wrapper = await montar()
  await flushPromises()
  for (const estado of ['Pendiente', 'Aprobada', 'Rechazada', 'Asociada']) expect(wrapper.text()).toContain(estado)
  expect(wrapper.findAll('li')).toHaveLength(4)
  expect(peticiones.find((config) => config.url === 'solicitudes_ingredientes').params.solicitante_id).toBe('eq.uuid-propio')
  expect(wrapper.find('li button').exists()).toBe(false)
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.find('input').exists()).toBe(false)
})

for (const [caso, accion, etiqueta] of [
  ['08', 'aprobar', 'Confirmar aprobación'],
  ['09', 'rechazar', 'Confirmar rechazo'],
  ['10', 'asociar', 'Confirmar asociación'],
]) {
  it(`${caso}: administrador puede ${accion} mediante RPC y retira la solicitud`, async () => {
    rol = 'admin'
    const wrapper = await montar(true)
    await flushPromises()
    const tarjeta = wrapper.get('li')
    expect(tarjeta.get('h3').text()).toBe('Almendras')
    expect(tarjeta.get('.solicitud-estado').text()).toBe('Pendiente')
    expect(tarjeta.get('time').text()).toMatch(/\d{1,2}:\d{2}(?!:)/)
    expect(tarjeta.text()).not.toContain(usuarioPrueba.id)
    expect(tarjeta.find('button').exists()).toBe(false)
    expect(tarjeta.findAll('select')).toHaveLength(1)
    await tarjeta.get('#accion-solicitud-10').setValue(accion)
    expect(tarjeta.findAll('button').map((boton) => boton.text())).toEqual([etiqueta])
    expect(tarjeta.find('#asociar-10').exists()).toBe(accion === 'asociar')
    if (accion === 'asociar') {
      expect(wrapper.find('option[value="9"]').exists()).toBe(false)
      await tarjeta.get('button').trigger('click')
      expect(wrapper.get('[role="alert"]').text()).toBe('Seleccioná un ingrediente activo para asociar.')
      expect(post()).toHaveLength(0)
      await tarjeta.get('#asociar-10').setValue(8)
    } else if (accion === 'aprobar') {
      expect(tarjeta.text()).toContain('Se creará un ingrediente nuevo')
    } else {
      expect(tarjeta.text()).toContain('La solicitud quedará rechazada')
      expect(tarjeta.find('textarea').exists()).toBe(false)
    }
    await tarjeta.get('button').trigger('click')
    await flushPromises()
    expect(JSON.parse(post()[0].data)).toEqual({ p_solicitud_id: 10, p_accion: accion, p_ingrediente_id: accion === 'asociar' ? 8 : null })
    expect(post()[0].url).toBe('rpc/resolver_solicitud_ingrediente')
    expect(peticiones.slice(peticiones.indexOf(post()[0]) + 1).some(
      (config) => config.url === 'solicitudes_ingredientes' && config.params.estado === 'eq.pendiente',
    )).toBe(true)
    expect(wrapper.text()).toContain('Solicitud resuelta correctamente')
    expect(wrapper.find('li').exists()).toBe(false)
  })
}

it('11: una solicitud resuelta no ofrece acciones nuevamente aunque una lectura quede desactualizada', async () => {
  rol = 'admin'
  const wrapper = await montar(true)
  await flushPromises()
  const adapter = api.defaults.adapter
  // Mantener deliberadamente la fila pendiente en la siguiente lectura:
  // el cliente debe excluirla después de resolver, sin habilitar otra decisión.
  api.defaults.adapter = vi.fn(async (config) => {
    if (config.url === 'rpc/resolver_solicitud_ingrediente') {
      peticiones.push(config)
      return { data: { solicitud_id: 10, estado: 'rechazada' }, status: 200, headers: {}, config }
    }
    return adapter(config)
  })
  await wrapper.get('#accion-solicitud-10').setValue('rechazar')
  await wrapper.get('li button').trigger('click')
  await flushPromises()
  expect(wrapper.find('li button').exists()).toBe(false)
  expect(post()).toHaveLength(1)
})

it('bloquea otra confirmación mientras se procesa y conserva la acción si falla la resolución', async () => {
  rol = 'admin'
  const wrapper = await montar(true)
  await flushPromises()
  const adapter = api.defaults.adapter
  let fallarResolucion
  api.defaults.adapter = vi.fn((config) => {
    if (config.url !== 'rpc/resolver_solicitud_ingrediente') return adapter(config)
    peticiones.push(config)
    return new Promise((_, reject) => { fallarResolucion = reject })
  })
  await wrapper.get('#accion-solicitud-10').setValue('aprobar')
  const confirmar = wrapper.get('li button')
  await confirmar.trigger('click')
  await flushPromises()
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  expect(confirmar.element.matches(':disabled')).toBe(true)
  expect(wrapper.get('header button').element.disabled).toBe(true)
  await confirmar.trigger('click')
  expect(post()).toHaveLength(1)
  fallarResolucion({ response: { status: 409, data: { code: '23505' } } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Ya existe ese ingrediente')
  expect(wrapper.get('#accion-solicitud-10').element.value).toBe('aprobar')
  expect(confirmar.element.matches(':disabled')).toBe(false)
})

it('12: usuario común no dispone de acciones administrativas ni en un montaje directo', async () => {
  const wrapper = await montar(true)
  await flushPromises()
  expect(wrapper.find('fieldset').exists()).toBe(false)
  expect(post()).toHaveLength(0)
})

it('valida nombre vacío y muestra conflictos de solicitudes sin perder el formulario', async () => {
  const wrapper = await montar(false, true)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await wrapper.get('input').setValue('   ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('entre 1 y 120')
  expect(post()).toHaveLength(0)
  const adapter = api.defaults.adapter
  api.defaults.adapter = vi.fn(async (config) => {
    if (config.url === 'rpc/solicitar_ingrediente') throw { response: { status: 400, data: { code: '22023', message: 'Ya tenes una solicitud pendiente para ese ingrediente' } } }
    return adapter(config)
  })
  await wrapper.get('input').setValue('Almendras')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Ya tenes una solicitud pendiente')
  expect(wrapper.get('input').element.value).toBe('Almendras')
})
