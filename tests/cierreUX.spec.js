import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'
import RecetaCard from '@/components/RecetaCard.vue'
import RecetaImagen from '@/components/RecetaImagen.vue'
import RecetaDetalleView from '@/views/RecetaDetalleView.vue'
import PropuestaDetalle from '@/components/admin/PropuestaDetalle.vue'
import GestionIngredientes from '@/components/admin/GestionIngredientes.vue'
import GestionCategorias from '@/components/admin/GestionCategorias.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

let peticiones, rol, falloGuardado
const propuesta = {
  id: 83, receta_id: 12, estado: 'pendiente', titulo: 'Pan', porciones: 4,
  imagen_path: 'uuid-propio/pan.webp',
  receta_categorias: [{ categoria_id: 7 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { nombre: 'Harina', activo: true } }],
  receta_pasos: [{ orden: 1, descripcion: 'Mezclar' }],
}
beforeEach(() => {
  rol = 'usuario'
  peticiones = []
  falloGuardado = false
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  getSupabaseMock().auth.signOut.mockResolvedValue({ error: null })
  api.defaults.adapter = vi.fn(async config => {
    peticiones.push(config)
    let data = []
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol }]
    else if (config.url === 'ingredientes') data = [{ id: 9, nombre: 'Harina', activo: true }]
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'Postres' }]
    else if (config.url === 'rpc/editar_propuesta_receta') {
      if (falloGuardado) throw new Error('Sin conexión')
      data = { version_id: 83 }
    } else if (config.url === 'receta_versiones') data = [{ ...propuesta, tiempo_minutos: null, dificultad: null }]
    else throw new Error(`Petición inesperada: ${config.url}`)
    return { data, status: 200, headers: {}, config }
  })
})

async function abrir(ruta = '/editar', componente = null) {
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/editar', name: 'editar-propuesta', component: RecetaFormulario, props: { propuesta: structuredClone(propuesta) } },
    { path: '/crear', name: 'crear-receta', component: RecetaFormulario },
    { path: '/', name: 'catalogo', component: { template: '<p>Catálogo</p>' } },
    { path: '/mis-recetas', name: 'mis-recetas', component: { template: '<p>Mis recetas</p>' } },
    { path: '/login', name: 'login', component: { template: '<p>Login</p>' } },
    { path: '/registro', name: 'registro', component: { template: '<p>Registro</p>' } },
    { path: '/admin', name: 'admin', component: componente || { template: '<p>Admin</p>' } },
  ] })
  await router.push(ruta)
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}
function recargaCancelada() {
  const evento = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(evento)
  return evento.defaultPrevented
}

it('menú desplegable con ARIA, Escape, sección activa y cierre al navegar sin exponer Administración', async () => {
  const { wrapper, router } = await abrir()
  const toggle = wrapper.get('.nav-toggle')
  expect(toggle.attributes('aria-controls')).toBe('nav-enlaces')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('nav a[href="/mis-recetas"]').attributes('aria-current')).toBe('location')
  expect(wrapper.get('nav').text()).not.toContain('Administración')
  await toggle.trigger('click')
  expect(wrapper.get('#nav-enlaces').classes()).toContain('nav-enlaces--abiertos')
  await wrapper.get('nav').trigger('keydown', { key: 'Escape' })
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle.element)
  await toggle.trigger('click')
  await router.push('/')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('nav a[href="/"]').attributes('aria-current')).toBe('page')
  expect(window.confirm).not.toHaveBeenCalled()
})

it('avisa al navegar o recargar con cambios y permite cancelar conservando el formulario', async () => {
  const { wrapper, router } = await abrir()
  expect(recargaCancelada()).toBe(false)
  await wrapper.get('#titulo-receta').setValue('Cambio sin guardar')
  expect(recargaCancelada()).toBe(true)
  await router.push('/')
  expect(router.currentRoute.value.name).toBe('editar-propuesta')
  expect(wrapper.get('#titulo-receta').element.value).toBe('Cambio sin guardar')
  expect(window.confirm).toHaveBeenCalledOnce()
  window.confirm.mockReturnValue(true)
  await router.push('/')
  expect(router.currentRoute.value.name).toBe('catalogo')
  expect(recargaCancelada()).toBe(false)
})

it('considera borradores de pasos y de ingredientes y deja de avisar al revertirlos', async () => {
  const { wrapper, router } = await abrir()
  await wrapper.get('#nuevo-paso').setValue('Paso todavía no agregado')
  await router.push('/')
  expect(router.currentRoute.value.name).toBe('editar-propuesta')
  await wrapper.get('#nuevo-paso').setValue('')
  await wrapper.get('#cantidad-ingrediente').setValue(5)
  expect(recargaCancelada()).toBe(true)
  await wrapper.get('#cantidad-ingrediente').setValue('')
  expect(recargaCancelada()).toBe(false)
})

it('protege una imagen seleccionada y deja de avisar al quitar esa selección', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:pan')
  URL.revokeObjectURL = vi.fn()
  const { wrapper } = await abrir()
  const campo = wrapper.get('#archivo-receta')
  Object.defineProperty(campo.element, 'files', { value: [new File(['imagen'], 'pan.webp', { type: 'image/webp' })] })
  await campo.trigger('change')
  expect(recargaCancelada()).toBe(true)
  await wrapper.findAll('button').find(item => item.text() === 'Mantener imagen actual').trigger('click')
  expect(recargaCancelada()).toBe(false)
})

it('no advierte después de guardar correctamente, pero mantiene protección ante un error', async () => {
  const { wrapper, router } = await abrir()
  await wrapper.get('#titulo-receta').setValue('Pan actualizado')
  falloGuardado = true
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(recargaCancelada()).toBe(true)
  expect(document.activeElement.id).toBe('error-guardado')
  falloGuardado = false
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Cambios guardados correctamente')
  expect(recargaCancelada()).toBe(false)
  await router.push('/')
  expect(router.currentRoute.value.name).toBe('catalogo')
  expect(window.confirm).not.toHaveBeenCalled()
})

it('confirma antes del logout y no cierra la sesión si se cancela', async () => {
  const { wrapper } = await abrir()
  await wrapper.get('#titulo-receta').setValue('Cambio')
  const salir = wrapper.findAll('button').find(item => item.text() === 'Cerrar sesión')
  await salir.trigger('click')
  expect(getSupabaseMock().auth.signOut).not.toHaveBeenCalled()
  expect(wrapper.get('#titulo-receta').element.value).toBe('Cambio')
  window.confirm.mockReturnValue(true)
  await salir.trigger('click')
  await flushPromises()
  expect(getSupabaseMock().auth.signOut).toHaveBeenCalledOnce()
  expect(window.confirm).toHaveBeenCalledTimes(2)
})

for (const [componente, campo] of [[GestionIngredientes, '#nombre-ingrediente'], [GestionCategorias, '#nombre-categoria']]) {
  it(`protege el borrador administrativo ${campo} y enfoca errores contextuales`, async () => {
    rol = 'admin'
    const { wrapper, router } = await abrir('/admin', componente)
    await wrapper.get(campo).setValue('  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get(campo).attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get(campo).element)
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('admin')
    await wrapper.get(campo).setValue('Nuevo nombre')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get(campo).element.value).toBe('')
    expect(recargaCancelada()).toBe(false)
    window.confirm.mockClear()
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('catalogo')
    expect(window.confirm).not.toHaveBeenCalled()
  })
}

for (const valor of [null, undefined, '']) {
  it(`omite metadatos vacíos (${String(valor)}) en tarjetas y conserva lazy loading`, () => {
    const wrapper = mount(RecetaCard, {
      props: { receta: { id: '12', titulo: 'Pan', categorias: [], tiempoMinutos: valor, dificultad: valor } },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.find('.dato').exists()).toBe(false)
    expect(wrapper.get('img').attributes('loading')).toBe('lazy')
    expect(wrapper.get('img').attributes('fetchpriority')).toBeUndefined()
    expect(wrapper.text()).not.toMatch(/null|undefined/)
  })
}

it('formatea duración y dificultades sin separadores vacíos', async () => {
  const wrapper = mount(RecetaCard, {
    props: { receta: { id: '12', titulo: 'Pan', categorias: [], dificultad: 'facil', tiempoMinutos: 20 } },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  expect(wrapper.get('.dato').text()).toBe('20 min · Fácil')
  await wrapper.setProps({ receta: { id: '12', titulo: 'Pan', categorias: [], dificultad: 'dificil' } })
  expect(wrapper.get('.dato').text()).toBe('Difícil')
})

it('permite priorizar la imagen principal, conserva el fallback y restablece al cambiar src', async () => {
  const wrapper = mount(RecetaImagen, { props: { src: '/pan.webp', alt: 'Pan', prioritaria: true } })
  expect(wrapper.attributes('loading')).toBe('eager')
  expect(wrapper.attributes('fetchpriority')).toBe('high')
  await wrapper.trigger('error')
  expect(wrapper.attributes('src')).toContain('receta-default.svg')
  await wrapper.setProps({ src: '/otra.webp' })
  expect(wrapper.attributes('src')).toBe('/otra.webp')
})

it('detalle público prioriza su imagen y presenta los opcionales sin campos vacíos', async () => {
  const wrapper = mount(RecetaDetalleView, { props: { id: '12' }, global: { stubs: { RouterLink: true } } })
  await flushPromises()
  expect(wrapper.find('.descripcion').exists()).toBe(false)
  expect(wrapper.findAll('dd').map(item => item.text())).toEqual(['4', 'Sin especificar', 'Sin especificar'])
  expect(wrapper.get('img').attributes('loading')).toBe('eager')
  expect(wrapper.get('img').attributes('fetchpriority')).toBe('high')
  expect(wrapper.text()).not.toMatch(/null|undefined/)
})

it('el detalle de moderación utiliza las mismas etiquetas legibles', () => {
  const wrapper = mount(PropuestaDetalle, { props: { propuesta: {
    titulo: 'Pan', numero: 1, porciones: 4, tiempoMinutos: '', dificultad: 'media', categorias: [], ingredientes: [], pasos: [],
  } } })
  expect(wrapper.findAll('dd').map(item => item.text())).toEqual(['4', 'Sin especificar', 'Media'])
})
