import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AdminView from '@/views/AdminView.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { usuarioPrueba } from './vitest.setup'

let peticiones, eliminada, resuelta, fallo, ingredientes
const propuesta = { id: 112, receta_id: 12, titulo: 'Sopa', numero: 1, creada_en: '2026-11-12',
  estado: 'pendiente', receta: { id: 12 }, receta_categorias: [], receta_ingredientes: [], receta_pasos: [] }
beforeEach(() => {
  peticiones = []
  eliminada = resuelta = fallo = false
  ingredientes = [{ id: 8, nombre: 'Harina', activo: true }]
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data = []
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol: 'admin' }]
    else if (config.url === 'ingredientes') {
      if (fallo && config.method === 'patch') throw new Error('Sin conexión')
      data = structuredClone(ingredientes)
    }
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'Postres' }]
    else if (config.url === 'receta_versiones') data = eliminada || config.params.offset ? [] : [structuredClone(propuesta)]
    else if (config.url === 'recetas') data = eliminada || config.params.offset ? [] : [{ id: 12, autor_id: 'otro', receta_versiones: [structuredClone(propuesta)] }]
    else if (config.url === 'solicitudes_ingredientes') data = resuelta || config.params.offset ? [] : [{ id: 10, nombre_solicitado: 'Almendras', estado: 'pendiente' }]
    else if (config.url === 'rpc/eliminar_receta') eliminada = true
    else if (config.url === 'rpc/resolver_solicitud_ingrediente') {
      resuelta = true
      ingredientes.push({ id: 9, nombre: 'Almendras', activo: true })
    } else throw new Error(`Petición inesperada: ${config.url}`)
    return { data, status: 200, headers: {}, config }
  })
})

async function abrir(query = {}) {
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin', name: 'admin', component: AdminView },
    { path: '/', name: 'catalogo', component: { template: '<p>Catálogo</p>' } },
  ] })
  await router.push({ name: 'admin', query })
  const wrapper = mount(AdminView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  await esperarModulo(wrapper)
  return wrapper
}
async function esperarModulo(wrapper) {
  await vi.waitFor(async () => {
    await flushPromises()
    const activo = wrapper.get('[aria-label="Secciones de administración"] [aria-selected="true"]').element.id
    const selector = { 'admin-tab-recetas': wrapper.get('#admin-recetas-tab-pendientes').attributes('aria-selected') === 'true' ? '.moderacion' : '.gestion-recetas',
      'admin-tab-ingredientes': '.admin-ingredientes', 'admin-tab-categorias': '.admin-categorias', 'admin-tab-solicitudes': '.solicitudes' }[activo]
    expect(wrapper.find(selector).exists()).toBe(true)
    expect(wrapper.get(selector).text()).not.toMatch(/Cargando/)
  })
}
async function tab(wrapper, id) {
  await wrapper.get(`#${id}`).trigger('click')
  await flushPromises()
  await esperarModulo(wrapper)
}
const lecturas = (url) => peticiones.filter((item) => item.url === url).length

it('muestra las cuatro pestañas y ambas subpestañas, sin montar módulos no visitados', async () => {
  const wrapper = await abrir()
  expect(wrapper.get('[aria-label="Secciones de administración"]').findAll('[role="tab"]').map((item) => item.text()))
    .toEqual(['Recetas', 'Solicitudes', 'Ingredientes', 'Categorías'])
  expect(wrapper.get('[aria-label="Administración de recetas"]').text()).toContain('Pendientes')
  expect(wrapper.get('[aria-label="Administración de recetas"]').text()).toContain('Gestionar recetas')
  expect(wrapper.find('.moderacion').exists()).toBe(true)
  expect(wrapper.find('.gestion-recetas').exists()).toBe(false)
  for (const url of ['recetas', 'ingredientes', 'categorias', 'solicitudes_ingredientes']) expect(lecturas(url)).toBe(0)
  await tab(wrapper, 'admin-recetas-tab-gestion')
  expect(wrapper.find('.moderacion').exists()).toBe(false)
  expect(wrapper.get('.gestion-recetas').isVisible()).toBe(true)
  await tab(wrapper, 'admin-tab-solicitudes')
  expect(wrapper.find('.gestion-recetas').exists()).toBe(false)
  expect(wrapper.get('.solicitudes').isVisible()).toBe(true)
  await tab(wrapper, 'admin-tab-categorias')
  expect(wrapper.find('.solicitudes').exists()).toBe(false)
  expect(wrapper.get('.admin-categorias').isVisible()).toBe(true)
})

it('conserva edición, selección y errores de ingredientes y categorías al regresar', async () => {
  const wrapper = await abrir()
  await tab(wrapper, 'admin-tab-ingredientes')
  await wrapper.get('[aria-label="Editar Harina"]').trigger('click')
  await wrapper.get('#nombre-ingrediente').setValue('Borrador harina')
  fallo = true
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const error = wrapper.get('[role="alert"]').text()
  await tab(wrapper, 'admin-tab-categorias')
  await wrapper.get('[aria-label="Editar Postres"]').trigger('click')
  await wrapper.get('#nombre-categoria').setValue('Borrador postres')
  await tab(wrapper, 'admin-tab-ingredientes')
  expect(wrapper.get('#nombre-ingrediente').element.value).toBe('Borrador harina')
  expect(wrapper.get('form h3').text()).toBe('Modificar ingrediente')
  expect(wrapper.get('[role="alert"]').text()).toBe(error)
  await tab(wrapper, 'admin-tab-categorias')
  expect(wrapper.get('#nombre-categoria').element.value).toBe('Borrador postres')
  expect(wrapper.get('form h3').text()).toBe('Modificar categoría')
})

it('conserva motivo y selección de moderación al alternar subpestañas', async () => {
  const wrapper = await abrir()
  await wrapper.get('[aria-label="Revisar Sopa, versión 1"]').trigger('click')
  await flushPromises()
  await wrapper.get('#motivo-rechazo').setValue('Revisar cantidades')
  await tab(wrapper, 'admin-recetas-tab-gestion')
  await tab(wrapper, 'admin-recetas-tab-pendientes')
  expect(wrapper.get('#motivo-rechazo').element.value).toBe('Revisar cantidades')
  expect(wrapper.get('.revision').text()).toContain('Sopa')
})

it('destaca y enfoca el detalle seleccionado y devuelve el foco al cerrar', async () => {
  const wrapper = await abrir()
  const disparador = wrapper.get('[aria-label="Revisar Sopa, versión 1"]')
  await disparador.trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#revision-propuesta').element)
  expect(disparador.attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.revision').text()).toContain('Aprobar receta')
  expect(wrapper.get('.revision').text()).toContain('Rechazar receta')
  await wrapper.findAll('button').find(item => item.text() === 'Cerrar revisión').trigger('click')
  expect(document.activeElement).toBe(disparador.element)
  expect(disparador.attributes('aria-expanded')).toBe('false')
})

it('actualiza pendientes tras eliminar una receta sin remontar la moderación', async () => {
  const wrapper = await abrir()
  await tab(wrapper, 'admin-recetas-tab-gestion')
  await wrapper.get('[aria-label="Eliminar Sopa"]').trigger('click')
  await flushPromises()
  await tab(wrapper, 'admin-recetas-tab-pendientes')
  expect(wrapper.text()).toContain('No hay recetas pendientes.')
  expect(wrapper.find('[aria-label="Revisar Sopa, versión 1"]').exists()).toBe(false)
})

it('actualiza ingredientes tras resolver solicitudes y conserva selecciones al navegar', async () => {
  const wrapper = await abrir()
  await tab(wrapper, 'admin-tab-ingredientes')
  await wrapper.get('#nombre-ingrediente').setValue('Borrador')
  await tab(wrapper, 'admin-tab-solicitudes')
  await wrapper.get('#accion-solicitud-10').setValue('asociar')
  await wrapper.get('#asociar-10').setValue(8)
  await tab(wrapper, 'admin-tab-categorias')
  await tab(wrapper, 'admin-tab-solicitudes')
  expect(wrapper.get('#accion-solicitud-10').element.value).toBe('asociar')
  expect(wrapper.get('#asociar-10').element.value).toBe('8')
  await wrapper.get('#accion-solicitud-10').setValue('aprobar')
  expect(wrapper.find('#asociar-10').exists()).toBe(false)
  await wrapper.get('.solicitudes li button').trigger('click')
  await flushPromises()
  await tab(wrapper, 'admin-tab-ingredientes')
  expect(wrapper.get('.ingredientes-lista').text()).toContain('Almendras')
  expect(wrapper.get('#nombre-ingrediente').element.value).toBe('Borrador')
  await tab(wrapper, 'admin-tab-solicitudes')
  expect(wrapper.text()).toContain('Solicitud resuelta correctamente.')
})

it('relee listas al regresar incluso ante cambios externos', async () => {
  const wrapper = await abrir()
  await tab(wrapper, 'admin-tab-ingredientes')
  await tab(wrapper, 'admin-tab-categorias')
  ingredientes.push({ id: 20, nombre: 'Externo', activo: true })
  await tab(wrapper, 'admin-tab-ingredientes')
  expect(wrapper.get('.ingredientes-lista').text()).toContain('Externo')
})

it('flechas, Home y End recorren las pestañas sin cargar módulos; activación manual y ARIA coherentes', async () => {
  const wrapper = await abrir()
  const recetas = wrapper.get('#admin-tab-recetas')
  recetas.element.focus()
  await recetas.trigger('keydown', { key: 'ArrowLeft' })
  expect(document.activeElement.id).toBe('admin-tab-categorias')
  await wrapper.get('#admin-tab-categorias').trigger('keydown', { key: 'Home' })
  expect(document.activeElement.id).toBe('admin-tab-recetas')
  await recetas.trigger('keydown', { key: 'End' })
  expect(document.activeElement.id).toBe('admin-tab-categorias')
  await wrapper.get('#admin-tab-categorias').trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement.id).toBe('admin-tab-recetas')
  expect(lecturas('categorias')).toBe(0)
  // jsdom no genera el click nativo de Enter/Espacio: se simula esa activación.
  await tab(wrapper, 'admin-tab-categorias')
  expect(wrapper.get('#admin-tab-categorias').attributes('aria-selected')).toBe('true')
  expect(recetas.attributes('tabindex')).toBe('-1')
  expect(wrapper.get('#admin-panel-categorias').attributes('aria-labelledby')).toBe('admin-tab-categorias')
  expect(wrapper.get('#admin-panel-recetas').attributes('hidden')).toBeDefined()
  await tab(wrapper, 'admin-tab-recetas')
  await wrapper.get('#admin-recetas-tab-pendientes').trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement.id).toBe('admin-recetas-tab-gestion')
})

it('retorno de edición abre Gestionar recetas y conserva el mensaje al navegar', async () => {
  const wrapper = await abrir({ receta: 'actualizada' })
  expect(wrapper.get('#admin-tab-recetas').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#admin-recetas-tab-gestion').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('.gestion-recetas').isVisible()).toBe(true)
  expect(lecturas('receta_versiones')).toBe(0)
  await tab(wrapper, 'admin-tab-ingredientes')
  expect(wrapper.text()).toContain('Receta actualizada y publicada correctamente.')
})
