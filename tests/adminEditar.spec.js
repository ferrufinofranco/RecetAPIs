import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import appRouter from '@/router'
import { crearAuthGuard } from '@/router/authGuard'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

const aprobada = {
  id: 83, receta_id: 12, numero: 1, estado: 'publicada', titulo: 'Receta de otro autor', descripcion: 'Original',
  porciones: 4, tiempo_minutos: 30, dificultad: 'facil', imagen_path: 'otro-autor/original.png',
  receta: { id: 12, autor_id: 'otro-autor' },
  receta_categorias: [{ categoria_id: 7, categorias: { id: 7, nombre: 'General' } }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { id: 9, nombre: 'Harina', activo: false } }],
  receta_pasos: [{ orden: 1, descripcion: 'Mezclar' }],
}
let rol, pendiente, publicada, peticiones, upload
const posts = () => peticiones.filter((config) => config.method === 'post')
beforeEach(() => {
  rol = 'admin'
  pendiente = false
  publicada = structuredClone(aprobada)
  peticiones = []
  URL.createObjectURL = vi.fn(() => 'blob:admin')
  URL.revokeObjectURL = vi.fn()
  upload = vi.fn().mockResolvedValue({ data: {}, error: null })
  getSupabaseMock().storage.from.mockReturnValue({ upload })
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data = []
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol }]
    else if (config.url === 'recetas') data = config.params.offset ? [] : [{
      id: 12, autor_id: 'otro-autor', creada_en: '2026-11-12', receta_versiones: [publicada,
        ...(pendiente ? [{ ...publicada, id: 84, numero: 2, estado: 'pendiente' }] : [])],
    }]
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'General' }]
    else if (config.url === 'ingredientes') data = [{ id: 9, nombre: 'Harina', activo: false }]
    else if (config.url === 'solicitudes_ingredientes') data = []
    else if (config.url === 'receta_versiones') data = config.params.estado === 'eq.publicada' && !config.params.offset ? [publicada] : []
    else if (config.url === 'rpc/admin_editar_receta') {
      const datos = JSON.parse(config.data).p_datos
      // Respuesta de lectura simulada después de la RPC; no prueba SQL.
      publicada = { ...publicada, titulo: datos.titulo, id: 85, numero: 2 }
      data = { receta_id: 12, version_id: 85, estado: 'publicada', version_anterior_id: 83 }
    } else throw new Error('Petición inesperada')
    return { data, status: 200, headers: {}, config }
  })
})

async function abrir(path = '/admin/recetas/12/editar') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
  router.beforeEach(crearAuthGuard(auth))
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

it('21: admin abre edición de una publicación de otro autor reutilizando el formulario', async () => {
  const { wrapper } = await abrir()
  expect(wrapper.get('h1').text()).toBe('Edición administrativa')
  expect(wrapper.get('#titulo-receta').element.value).toBe('Receta de otro autor')
  expect(wrapper.text()).toContain('Los cambios se publicarán directamente')
  const consulta = peticiones.find((config) => config.url === 'recetas')
  expect(consulta.params).not.toHaveProperty('autor_id')
  expect(consulta.params.eliminada_en).toBe('is.null')
})

it('22: envía ID de receta y contenido a admin_editar_receta, no ID de versión ni UPDATE', async () => {
  const { wrapper } = await abrir()
  await wrapper.get('#titulo-receta').setValue('Cambio administrativo')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts()).toHaveLength(1)
  expect(posts()[0].url).toBe('rpc/admin_editar_receta')
  expect(posts()[0].headers.get('Authorization')).toBe('Bearer jwt-prueba')
  const datos = JSON.parse(posts()[0].data)
  expect(datos.p_receta_id).toBe(12)
  expect(datos.p_datos.titulo).toBe('Cambio administrativo')
  expect(datos.p_datos).not.toHaveProperty('imagen_path')
  expect(peticiones.every((config) => config.method === 'get' || config.url.startsWith('rpc/'))).toBe(true)
})

it('23: con una pendiente no abre formulario ni ofrece edición directa en gestión', async () => {
  pendiente = true
  const { wrapper, router } = await abrir()
  expect(wrapper.text()).toContain('Resolvé primero la propuesta pendiente')
  expect(wrapper.find('form').exists()).toBe(false)
  await router.push('/admin')
  await flushPromises()
  expect(wrapper.get('.gestion-recetas').text()).not.toContain('Editar directamente')
  expect(posts()).toHaveLength(0)
})

it('24: éxito vuelve al panel con confirmación y la lectura pública refleja el nuevo contenido', async () => {
  const { wrapper, router } = await abrir()
  await wrapper.get('#titulo-receta').setValue('Título actualizado')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('admin'))
  expect(wrapper.text()).toContain('Receta actualizada y publicada correctamente')
  await router.push('/recetas/12')
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('Título actualizado')
  expect(peticiones.at(-1).params.estado).toBe('eq.publicada')
})

it('25: usuario común no accede a la ruta ni dispone de la operación administrativa', async () => {
  rol = 'usuario'
  const { wrapper, router } = await abrir()
  expect(router.currentRoute.value.name).toBe('acceso-denegado')
  expect(wrapper.find('form').exists()).toBe(false)
  expect(posts()).toHaveLength(0)
})

it('26: conserva las validaciones de categorías, ingredientes y pasos', async () => {
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
  await wrapper.get('.pasos-editor textarea').setValue(' ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('completá todos los pasos')
  expect(posts()).toHaveLength(0)
})

it('admin puede quitar la imagen con null, sin llamar asignar_imagen_receta sobre una publicada', async () => {
  const { wrapper } = await abrir()
  await wrapper.findAll('button').find((item) => item.text() === 'Quitar imagen').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(JSON.parse(posts()[0].data).p_datos.imagen_path).toBeNull()
  expect(posts().every((config) => config.url === 'rpc/admin_editar_receta')).toBe(true)
  expect(upload).not.toHaveBeenCalled()
})

it('admin sube imagen propia antes de publicar la nueva versión, y envía solo su ruta', async () => {
  const { wrapper } = await abrir()
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['imagen'], 'foto.png', { type: 'image/png' })] })
  await input.trigger('change')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(1)
  expect(JSON.parse(posts()[0].data).p_datos.imagen_path).toBe(upload.mock.calls[0][0])
  expect(upload.mock.calls[0][0]).toMatch(/^uuid-propio\/.+\.png$/)
  expect(posts()).toHaveLength(1)
})

it('un fallo de Storage en edición admin permite publicar sin cambiar imagen, sin duplicar versión', async () => {
  upload.mockResolvedValue({ error: { message: 'Storage no disponible' } })
  const { wrapper } = await abrir()
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['imagen'], 'foto.png', { type: 'image/png' })] })
  await input.trigger('change')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts()).toHaveLength(0)
  expect(wrapper.text()).toContain('El contenido todavía no se guardó')
  await wrapper.findAll('button').find((item) => item.text() === 'Continuar sin cambiar la imagen').trigger('click')
  await flushPromises()
  expect(posts()).toHaveLength(1)
  expect(JSON.parse(posts()[0].data).p_datos).not.toHaveProperty('imagen_path')
})
