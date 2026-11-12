import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CatalogoView from '@/views/CatalogoView.vue'
import { api } from '@/services/api'

let versiones, categorias, errorRecetas, errorCategorias, peticiones
const version = (id, titulo, categoria) => ({
  id: id + 100, receta_id: id, numero: 1, titulo, tiempo_minutos: 30, dificultad: 'facil',
  receta: { id }, receta_categorias: [{ categorias: { id, nombre: categoria } }],
  receta_ingredientes: [], receta_pasos: [],
})
beforeEach(() => {
  versiones = [version(1, 'Ñoquis de papa', 'Pastas'), version(2, 'Sopa de zapallo', 'Sopas'), version(3, 'Pasta rápida', 'Pastas')]
  categorias = [{ id: 1, nombre: 'Pastas' }, { id: 2, nombre: 'Sopas' }]
  errorRecetas = errorCategorias = false
  peticiones = []
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data
    if (config.url === 'receta_versiones') {
      if (errorRecetas) throw new Error('Sin conexión')
      data = config.params.offset ? [] : structuredClone(versiones)
    } else if (config.url === 'categorias') {
      if (errorCategorias) throw new Error('Sin conexión')
      data = structuredClone(categorias)
    } else throw new Error(`Petición inesperada: ${config.url}`)
    return { data, status: 200, headers: {}, config }
  })
})
async function abrir(esperar = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'catalogo', component: CatalogoView },
    { path: '/recetas/:id', name: 'receta', component: { template: '<p>Detalle</p>' } },
  ] })
  await router.push('/')
  const wrapper = mount(CatalogoView, { attachTo: document.body, global: { plugins: [router] } })
  if (esperar) await flushPromises()
  return { wrapper, router }
}
const titulos = (wrapper) => wrapper.findAll('.receta-card h2').map((item) => item.text())

it('renderiza tarjetas con imágenes, categorías y enlaces al detalle existentes', async () => {
  const { wrapper, router } = await abrir()
  expect(titulos(wrapper)).toEqual(['Ñoquis de papa', 'Sopa de zapallo', 'Pasta rápida'])
  expect(wrapper.findAll('.receta-card img')).toHaveLength(3)
  expect(wrapper.get('.receta-card img').attributes('alt')).toBe('Ñoquis de papa')
  expect(wrapper.get('.receta-card').text()).toContain('Pastas')
  expect(wrapper.get('.receta-link').attributes('href')).toBe('/recetas/1')
  await wrapper.get('.receta-link').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('receta')
})

it('conserva búsqueda por título sin tildes y su combinación con categorías, sin nuevas consultas', async () => {
  const { wrapper } = await abrir()
  await wrapper.get('.catalogo-alternar').trigger('click')
  const antes = peticiones.length
  await wrapper.get('#busqueda').setValue('NOQUIS')
  expect(titulos(wrapper)).toEqual(['Ñoquis de papa'])
  await wrapper.get('#categoria').setValue('Sopas')
  expect(titulos(wrapper)).toEqual([])
  await wrapper.get('#busqueda').setValue('')
  expect(titulos(wrapper)).toEqual(['Sopa de zapallo'])
  expect(peticiones).toHaveLength(antes)
})

it('expande y contrae los filtros sin desmontar controles ni perder selecciones o resultados', async () => {
  const { wrapper } = await abrir()
  const boton = wrapper.get('.catalogo-alternar')
  const panel = wrapper.get('.catalogo-panel-filtros')
  expect(boton.attributes('aria-expanded')).toBe('false')
  expect(panel.classes()).not.toContain('esta-abierto')
  await boton.trigger('click')
  expect(boton.attributes('aria-expanded')).toBe('true')
  expect(panel.classes()).toContain('esta-abierto')
  await wrapper.get('#busqueda').setValue('pasta')
  await wrapper.get('#categoria').setValue('Pastas')
  const input = wrapper.get('#busqueda').element
  await boton.trigger('click')
  expect(boton.attributes('aria-expanded')).toBe('false')
  expect(panel.classes()).not.toContain('esta-abierto')
  expect(titulos(wrapper)).toEqual(['Pasta rápida'])
  await boton.trigger('click')
  expect(wrapper.get('#busqueda').element).toBe(input)
  expect(input.value).toBe('pasta')
  expect(wrapper.get('#categoria').element.value).toBe('Pastas')
})

it('mantiene etiquetas y controles nativos accesibles, y vincula el botón con su panel', async () => {
  const { wrapper } = await abrir()
  const boton = wrapper.get('.catalogo-alternar')
  expect(boton.element.tagName).toBe('BUTTON')
  expect(boton.attributes('type')).toBe('button')
  expect(boton.text()).toBe('Filtros')
  expect(boton.attributes('aria-controls')).toBe(wrapper.get('.catalogo-panel-filtros').attributes('id'))
  boton.element.focus()
  expect(document.activeElement).toBe(boton.element)
  // Los botones nativos convierten Enter/Espacio en click; jsdom no sintetiza esa acción.
  await boton.trigger('click')
  expect(wrapper.get('label[for="busqueda"]').text()).toBe('Buscar por título')
  expect(wrapper.get('label[for="categoria"]').text()).toBe('Categoría')
  expect(wrapper.get('#busqueda').attributes('type')).toBe('search')
  expect(wrapper.get('#categoria').element.tagName).toBe('SELECT')
  expect(wrapper.get('.recuento[role="status"]').text()).toBe('3 recetas encontradas')
})

it('muestra ausencia de resultados y limpia ambos filtros aunque el panel esté plegado', async () => {
  const { wrapper } = await abrir()
  await wrapper.get('.catalogo-alternar').trigger('click')
  await wrapper.get('#busqueda').setValue('Inexistente')
  await wrapper.get('#categoria').setValue('Pastas')
  await wrapper.get('.catalogo-alternar').trigger('click')
  expect(wrapper.get('.estado-vacio').text()).toContain('No encontramos recetas')
  await wrapper.get('.estado-vacio button').trigger('click')
  expect(wrapper.get('#busqueda').element.value).toBe('')
  expect(wrapper.get('#categoria').element.value).toBe('')
  expect(titulos(wrapper)).toHaveLength(3)
})

it('conserva los estados de carga y de catálogo sin publicaciones', async () => {
  versiones = []
  const { wrapper } = await abrir(false)
  expect(wrapper.text()).toContain('Cargando recetas…')
  await flushPromises()
  expect(wrapper.get('.estado-vacio').text()).toContain('Todavía no hay recetas publicadas')
  expect(wrapper.find('.receta-card').exists()).toBe(false)
})

it('conserva errores y reintentos de recetas y categorías y permite buscar sin categorías', async () => {
  errorRecetas = errorCategorias = true
  const { wrapper } = await abrir()
  await wrapper.get('.catalogo-alternar').trigger('click')
  expect(wrapper.findAll('[role="alert"]')).toHaveLength(2)
  expect(wrapper.get('#categoria').element.disabled).toBe(true)
  expect(wrapper.get('#busqueda').element.disabled).toBe(false)
  errorRecetas = errorCategorias = false
  await wrapper.get('.catalogo-resultados .mensaje-error button').trigger('click')
  await wrapper.get('.catalogo-lateral .mensaje-error button').trigger('click')
  await flushPromises()
  expect(titulos(wrapper)).toHaveLength(3)
  expect(wrapper.get('#categoria').element.disabled).toBe(false)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('conserva el aviso cuando no hay categorías y la búsqueda por título sigue disponible', async () => {
  categorias = []
  const { wrapper } = await abrir()
  await wrapper.get('.catalogo-alternar').trigger('click')
  expect(wrapper.text()).toContain('No hay categorías disponibles para filtrar.')
  expect(wrapper.get('#categoria').element.disabled).toBe(true)
  await wrapper.get('#busqueda').setValue('Sopa')
  expect(titulos(wrapper)).toEqual(['Sopa de zapallo'])
})
