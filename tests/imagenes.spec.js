import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'
import ImagenRecetaEditor from '@/components/recetas/ImagenRecetaEditor.vue'
import { subirImagen, validarImagen, obtenerVersionGuardada } from '@/services/imagenes'
import { resolverImagen } from '@/utils/recetas'
import { obtenerReceta } from '@/services/recetas'
import { api } from '@/services/api'
import { getSupabaseMock, usuarioPrueba } from './vitest.setup'

const propuesta = {
  id: 83, receta_id: 12, estado: 'pendiente', titulo: 'Pan', porciones: 4,
  imagen_path: 'uuid-propio/original.png',
  receta_categorias: [{ categoria_id: 7 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { nombre: 'Harina', activo: true } }],
  receta_pasos: [{ orden: 1, descripcion: 'Mezclar' }],
}
let upload, peticiones, resultado, errorAsignar
const foto = () => new File(['imagen'], 'pan.webp', { type: 'image/webp' })
const posts = () => peticiones.filter((config) => config.method === 'post')
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview-prueba')
  URL.revokeObjectURL = vi.fn()
  upload = vi.fn().mockResolvedValue({ data: {}, error: null })
  getSupabaseMock().storage.from.mockReturnValue({ upload })
  peticiones = []
  resultado = { receta_id: 12, version_id: 84, estado: 'pendiente' }
  errorAsignar = false
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data = []
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol: 'usuario' }]
    else if (config.url === 'ingredientes') data = [{ id: 9, nombre: 'Harina', activo: true }]
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'General' }]
    else if (config.url === 'receta_versiones') data = [{ ...propuesta, estado: 'publicada' }]
    else if (config.url === 'rpc/asignar_imagen_receta') { if (errorAsignar) throw new Error('Fallo de asociación'); data = {} }
    else if (config.url.startsWith('rpc/')) data = resultado
    else throw new Error('Petición inesperada')
    return { data, status: 200, headers: {}, config }
  })
})

async function montar(estado = 'pendiente', publicada = false) {
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const wrapper = mount(RecetaFormulario, {
    props: { propuesta: { ...propuesta, estado }, publicada },
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

async function elegir(wrapper, archivo = foto()) {
  Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [archivo], configurable: true })
  await wrapper.get('input[type="file"]').trigger('change')
}

it('13: sube una imagen válida en carpeta propia y muestra preview', async () => {
  const wrapper = await montar()
  await elegir(wrapper)
  expect(wrapper.get('.preview-imagen').attributes('src')).toBe('blob:preview-prueba')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(1)
  expect(upload.mock.calls[0][0]).toMatch(/^uuid-propio\/.+\.webp$/)
  expect(getSupabaseMock().storage.from).toHaveBeenCalledWith('recetas-imagenes')
  expect(wrapper.text()).toContain('Cambios guardados correctamente')
})

it('14: rechaza formatos no permitidos y extensiones discordantes', async () => {
  const wrapper = await montar()
  await elegir(wrapper, new File(['x'], 'virus.svg', { type: 'image/svg+xml' }))
  expect(wrapper.getComponent(ImagenRecetaEditor).text()).toContain('Elegí una imagen JPG')
  expect(upload).not.toHaveBeenCalled()
  expect(() => validarImagen(new File(['x'], 'imagen.exe', { type: 'image/png' }))).toThrow()
})

it('15: rechaza archivos mayores a 5 MB', async () => {
  const wrapper = await montar()
  const archivo = foto()
  Object.defineProperty(archivo, 'size', { value: 5242881 })
  await elegir(wrapper, archivo)
  expect(wrapper.getComponent(ImagenRecetaEditor).text()).toContain('máximo 5 MB')
  expect(upload).not.toHaveBeenCalled()
})

it('16: crea una receta sin imagen sin llamar Storage ni asignar imagen', async () => {
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const wrapper = mount(RecetaFormulario, { global: { plugins: [pinia], stubs: { RouterLink: true } } })
  await flushPromises()
  await wrapper.get('#titulo-receta').setValue('Pan nuevo')
  await wrapper.get('#porciones-receta').setValue(2)
  await wrapper.get('#ingrediente-elegido').trigger('click')
  await wrapper.get('#ingrediente-opcion-9').trigger('click')
  await wrapper.get('#cantidad-ingrediente').setValue(100)
  await wrapper.findAll('button').find((item) => item.text() === 'Agregar ingrediente').trigger('click')
  await seleccionarCategoria(wrapper, 7)
  await wrapper.get('#nuevo-paso').setValue('Mezclar')
  await wrapper.findAll('button').find((item) => item.text() === 'Agregar paso').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts().map((config) => config.url)).toEqual(['rpc/crear_receta'])
  expect(upload).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Tu receta se guardó correctamente')
})

it('17: asocia imagen a version_id devuelto al reenviar, no al ID de receta ni versión rechazada', async () => {
  const wrapper = await montar('rechazada')
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts().map((config) => config.url)).toEqual(['rpc/editar_propuesta_receta', 'rpc/asignar_imagen_receta'])
  const datos = JSON.parse(posts()[1].data)
  expect(datos.p_version_id).toBe(84)
  expect(datos.p_imagen_path).toBe(upload.mock.calls[0][0])
  expect(datos.p_imagen_path).not.toContain('https://')
})

it('18: la imagen propuesta no modifica la publicada ni se envía a su versión', async () => {
  const wrapper = await montar('publicada', true)
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts()[0].url).toBe('rpc/proponer_edicion_receta')
  expect(JSON.parse(posts()[1].data).p_version_id).toBe(84)
  const publica = await obtenerReceta(12)
  expect(publica.imagen).toContain('recetas-imagenes/uuid-propio/original.png')
  expect(peticiones.at(-1).params.estado).toBe('eq.publicada')
})

it('19: error de Storage permite continuar o reintentar sin duplicar el contenido', async () => {
  upload.mockResolvedValueOnce({ error: { message: 'Storage sin permiso' } })
  const wrapper = await montar()
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('El contenido ya se guardó')
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  expect(wrapper.text()).not.toContain('Cancelar sin guardar')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts().filter((config) => config.url === 'rpc/editar_propuesta_receta')).toHaveLength(1)
  await wrapper.findAll('button').find((item) => item.text() === 'Reintentar imagen').trigger('click')
  await flushPromises()
  expect(posts().filter((config) => config.url === 'rpc/editar_propuesta_receta')).toHaveLength(1)
  expect(upload).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('Cambios guardados correctamente')
})

it('20: genera objetos únicos y nunca permite sobrescritura', async () => {
  const a = await subirImagen(foto(), usuarioPrueba.id)
  const b = await subirImagen(foto(), usuarioPrueba.id)
  expect(a).not.toBe(b)
  for (const llamada of upload.mock.calls) expect(llamada[2]).toEqual({ upsert: false, contentType: 'image/webp' })
})

it('anuncia la carga y el reintento de imagen e impide reenviar la receta', async () => {
  let completarSubida, completarReintento
  upload.mockImplementationOnce(() => new Promise((resolve) => { completarSubida = resolve }))
    .mockImplementationOnce(() => new Promise((resolve) => { completarReintento = resolve }))
  const wrapper = await montar()
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  expect(wrapper.findAll('[role="status"]').map(item => item.text())).toContain('Guardando imagen…')
  completarSubida({ error: { message: 'Error temporal de imagen' } })
  await flushPromises()
  expect(wrapper.get('form').attributes('aria-busy')).toBe('false')
  expect(wrapper.get('[role="alert"]').text()).toContain('El contenido ya se guardó')
  await wrapper.findAll('button').find((item) => item.text() === 'Reintentar imagen').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('[role="status"]').map(item => item.text())).toContain('Guardando imagen…')
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  for (const texto of ['Reintentar imagen', 'Continuar sin cambiar la imagen']) {
    expect(wrapper.findAll('button').some((item) => item.text() === texto)).toBe(false)
  }
  await wrapper.get('form').trigger('submit')
  expect(posts().filter((config) => config.url === 'rpc/editar_propuesta_receta')).toHaveLength(1)
  completarReintento({ data: {}, error: null })
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('Cambios guardados correctamente')
  expect(upload).toHaveBeenCalledTimes(2)
})

it('quitar la imagen envía null; una pendiente con respuesta sin ID utiliza solo su ID conocido', async () => {
  resultado = null
  const wrapper = await montar()
  await wrapper.findAll('button').find((item) => item.text() === 'Quitar imagen').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(JSON.parse(posts()[1].data)).toEqual({ p_version_id: 83, p_imagen_path: null })
  expect(upload).not.toHaveBeenCalled()
})

it('fallar asociación permite reintentar sin volver a subir el objeto', async () => {
  errorAsignar = true
  const wrapper = await montar()
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  errorAsignar = false
  await wrapper.findAll('button').find((item) => item.text() === 'Reintentar imagen').trigger('click')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(1)
  expect(posts().filter((config) => config.url === 'rpc/editar_propuesta_receta')).toHaveLength(1)
})

it('sin version_id inequívoco no adivina un ID ni repite contenido y permite continuar', async () => {
  resultado = { receta_id: 12 }
  const wrapper = await montar('rechazada')
  await elegir(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('La RPC no devolvió version_id')
  expect(upload).not.toHaveBeenCalled()
  await wrapper.findAll('button').find((item) => item.text() === 'Continuar sin cambiar la imagen').trigger('click')
  expect(wrapper.text()).toContain('Corrección reenviada correctamente')
  expect(posts()).toHaveLength(1)
  expect(() => obtenerVersionGuardada(12)).toThrow()
  expect(resolverImagen('uuid-propio/nueva.webp', 'https://example.com')).toBe('https://example.com/storage/v1/object/public/recetas-imagenes/uuid-propio/nueva.webp')
})

it('un version_id inseguro se rechaza antes de enviarlo a la RPC de imagen', () => {
  expect(() => obtenerVersionGuardada({ version_id: 2 ** 53 })).toThrow(/entero seguro/)
  expect(() => obtenerVersionGuardada({ version_id: NaN })).toThrow(/version_id/)
  expect(obtenerVersionGuardada({ version_id: 84 })).toBe(84)
  expect(obtenerVersionGuardada({ version_id: '9007199254740993' })).toBe('9007199254740993')
})
import { seleccionarCategoria } from './helpers/categorias'
