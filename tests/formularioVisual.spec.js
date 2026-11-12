import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'
import PasosEditor from '@/components/recetas/PasosEditor.vue'
import ImagenRecetaEditor from '@/components/recetas/ImagenRecetaEditor.vue'
import { usuarioPrueba } from './vitest.setup'

let peticiones, falloSolicitud, pendienteSolicitud
const posts = () => peticiones.filter((config) => config.method === 'post')
const propuesta = {
  id: 83, receta_id: 12, estado: 'pendiente', titulo: 'Pan', porciones: 4,
  receta_categorias: [{ categoria_id: 7 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { nombre: 'Harina', activo: true } }],
  receta_pasos: [{ orden: 1, descripcion: 'Mezclar' }],
}

beforeEach(() => {
  peticiones = []
  falloSolicitud = null
  pendienteSolicitud = null
  URL.createObjectURL = vi.fn(() => 'blob:receta-conservada')
  URL.revokeObjectURL = vi.fn()
  api.defaults.adapter = vi.fn(async (config) => {
    peticiones.push(config)
    let data
    if (config.url === 'profiles') data = [{ ...usuarioPrueba, rol: 'usuario' }]
    else if (config.url === 'ingredientes') data = [
      { id: 9, nombre: 'Harina', activo: true }, { id: 10, nombre: 'Leche', activo: true },
      { id: 11, nombre: 'Inactivo', activo: false },
    ]
    else if (config.url === 'categorias') data = [{ id: 7, nombre: 'General' }, { id: 8, nombre: 'Desayuno' }]
    else if (config.url === 'rpc/solicitar_ingrediente') {
      if (falloSolicitud) throw falloSolicitud
      if (pendienteSolicitud) await pendienteSolicitud
      data = { solicitud_id: 15, estado: 'pendiente' }
    } else if (config.url === 'rpc/crear_receta' || config.url === 'rpc/editar_propuesta_receta') data = { version_id: 83 }
    else throw new Error(`Petición inesperada: ${config.url}`)
    return { data, status: 200, headers: {}, config }
  })
})

afterEach(() => { document.body.replaceChildren() })

async function montar(edicion = false) {
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const wrapper = mount(RecetaFormulario, {
    attachTo: document.body,
    props: edicion ? { propuesta: structuredClone(propuesta) } : {},
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

const boton = (wrapper, texto) => wrapper.findAll('button').find((item) => item.text() === texto)
async function agregarIngrediente(wrapper, id = 9) {
  await wrapper.get('#ingrediente-elegido').setValue(id)
  await wrapper.get('#cantidad-ingrediente').setValue(100)
  await boton(wrapper, 'Agregar ingrediente').trigger('click')
}

it('ordena las secciones y permite agregar, editar y quitar ingredientes durante la creación', async () => {
  const wrapper = await montar()
  expect(wrapper.findAll('form section h2').map((item) => item.text())).toEqual([
    'Información general', 'Categorías', 'Imagen (opcional)', 'Ingredientes', 'Preparación',
  ])
  expect(wrapper.find('option[value="11"]').exists()).toBe(false)
  await agregarIngrediente(wrapper)
  await wrapper.get('#cantidad-9').setValue(.5)
  await wrapper.get('#unidad-9').setValue('kg')
  await agregarIngrediente(wrapper, 10)
  await wrapper.get('[aria-label="Quitar Leche"]').trigger('click')
  expect(wrapper.findAll('.lista-editor li')).toHaveLength(1)
  expect(wrapper.find('option[value="10"]').exists()).toBe(true)
  await wrapper.get('#titulo-receta').setValue('Pan nuevo')
  await wrapper.get('#porciones-receta').setValue(2)
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.get('#nuevo-paso').setValue('Mezclar')
  await boton(wrapper, 'Agregar paso').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts()).toHaveLength(1)
  expect(posts()[0].url).toBe('rpc/crear_receta')
  expect(JSON.parse(posts()[0].data).p_datos.ingredientes).toEqual([{ ingrediente_id: 9, cantidad: .5, unidad: 'kg' }])
})

it('agrupa las columnas en orden de lectura y deja el guardado después de ambas', async () => {
  const wrapper = await montar(true)
  expect(wrapper.get('.receta-columna--general').findAll('h2').map((item) => item.text())).toEqual([
    'Información general', 'Categorías', 'Imagen (opcional)',
  ])
  expect(wrapper.get('.receta-columna--preparacion').findAll('h2').map((item) => item.text())).toEqual([
    'Ingredientes', 'Preparación',
  ])
  expect(wrapper.get('.receta-columnas').element.nextElementSibling).toBe(wrapper.get('.guardar-receta').element)
  expect(wrapper.find('[tabindex]').exists()).toBe(false)
})

it('las etiquetas de categorías conservan la selección múltiple y los IDs del payload', async () => {
  const wrapper = await montar(true)
  const categorias = wrapper.findAll('.categorias-seleccion input')
  expect(categorias.map((item) => item.element.checked)).toEqual([true, false])
  expect(wrapper.findAll('.categorias-seleccion label').map((item) => item.text())).toEqual(['General', 'Desayuno'])
  await categorias[1].setValue(true)
  await categorias[0].setValue(false)
  await categorias[0].setValue(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(JSON.parse(posts()[0].data).p_datos.categorias).toEqual([8, 7])
})

it('agrega, modifica, reordena y quita pasos conservando claves y nodos DOM estables', async () => {
  const wrapper = await montar(true)
  await wrapper.get('#nuevo-paso').setValue('Hornear')
  await boton(wrapper, 'Agregar paso').trigger('click')
  const editor = wrapper.getComponent(PasosEditor)
  const claves = editor.props('modelValue').map((paso) => paso.clave)
  const nodo = wrapper.get(`#paso-${claves[1]}`).element
  await wrapper.get(`#paso-${claves[1]}`).setValue('Hornear 20 minutos')
  await wrapper.get('[aria-label="Subir paso 2"]').trigger('click')
  expect(editor.props('modelValue').map((paso) => paso.clave)).toEqual([claves[1], claves[0]])
  expect(wrapper.findAll('.pasos-editor textarea')[0].element).toBe(nodo)
  await wrapper.get('[aria-label="Quitar paso 2"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(JSON.parse(posts()[0].data).p_datos.pasos).toEqual(['Hornear 20 minutos'])
})

for (const edicion of [false, true]) {
  it(`solicita sin navegar ni perder campos o borradores en ${edicion ? 'edición' : 'creación'}`, async () => {
    const wrapper = await montar(edicion)
    await wrapper.get('#titulo-receta').setValue('Mi receta sin guardar')
    await wrapper.get('#descripcion-receta').setValue('Descripción conservada')
    await wrapper.get('#porciones-receta').setValue(3)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    if (!edicion) await agregarIngrediente(wrapper)
    await wrapper.get('#cantidad-ingrediente').setValue(77)
    await wrapper.get('#nuevo-paso').setValue('Borrador de paso')
    const archivo = new File(['imagen'], 'pan.webp', { type: 'image/webp' })
    Object.defineProperty(wrapper.get('#archivo-receta').element, 'files', { value: [archivo], configurable: true })
    await wrapper.get('#archivo-receta').trigger('change')
    const disparador = wrapper.get('[aria-haspopup="dialog"]')
    await disparador.trigger('click')
    await flushPromises()
    const dialogo = document.querySelector('dialog')
    expect(dialogo.open).toBe(true)
    const entrada = dialogo.querySelector('input')
    expect(document.activeElement).toBe(entrada)
    entrada.value = '  Almendras  '
    entrada.dispatchEvent(new Event('input', { bubbles: true }))
    dialogo.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(posts()).toHaveLength(1)
    expect(posts()[0].url).toBe('rpc/solicitar_ingrediente')
    expect(JSON.parse(posts()[0].data)).toEqual({ p_nombre: 'Almendras' })
    expect(dialogo.querySelector('[role="status"]').textContent).toContain('Solicitud enviada')
    expect(document.activeElement).toBe(dialogo.querySelector('button'))
    dialogo.querySelector('button').click()
    await flushPromises()
    expect(document.activeElement).toBe(disparador.element)
    expect(document.querySelector('dialog')).toBeNull()
    expect(wrapper.get('#titulo-receta').element.value).toBe('Mi receta sin guardar')
    expect(wrapper.get('#descripcion-receta').element.value).toBe('Descripción conservada')
    expect(wrapper.get('#porciones-receta').element.value).toBe('3')
    expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(true)
    expect(wrapper.findAll('.lista-editor li')).toHaveLength(1)
    expect(wrapper.get('#cantidad-ingrediente').element.value).toBe('77')
    expect(wrapper.get('#nuevo-paso').element.value).toBe('Borrador de paso')
    expect(wrapper.getComponent(ImagenRecetaEditor).props('archivo')).toBe(archivo)
    expect(wrapper.get('.preview-imagen').attributes('src')).toBe('blob:receta-conservada')
    expect(wrapper.findAll('.pasos-editor li')).toHaveLength(edicion ? 1 : 0)
  })
}

it('muestra errores, bloquea doble envío y permite reintentar y cerrar con Escape sin guardar receta', async () => {
  falloSolicitud = new Error('Network Error')
  const wrapper = await montar(true)
  const disparador = wrapper.get('[aria-haspopup="dialog"]')
  await disparador.trigger('click')
  await flushPromises()
  const dialogo = document.querySelector('dialog')
  const entrada = dialogo.querySelector('input')
  entrada.value = 'Almendras'
  entrada.dispatchEvent(new Event('input', { bubbles: true }))
  const enviar = () => dialogo.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  enviar()
  await flushPromises()
  expect(dialogo.querySelector('[role="alert"]').textContent).toContain('No hay conexión')
  expect(entrada.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(entrada)
  expect(entrada.value).toBe('Almendras')
  expect(wrapper.get('#titulo-receta').element.value).toBe('Pan')
  falloSolicitud = null
  let resolver
  pendienteSolicitud = new Promise((resolve) => { resolver = resolve })
  enviar()
  await flushPromises()
  expect(dialogo.querySelector('form').getAttribute('aria-busy')).toBe('true')
  expect(dialogo.querySelector('button[type="submit"]').disabled).toBe(true)
  expect(dialogo.querySelector('button[type="button"]').disabled).toBe(true)
  dialogo.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flushPromises()
  expect(dialogo.open).toBe(true)
  enviar()
  await flushPromises()
  expect(posts()).toHaveLength(2)
  resolver()
  await flushPromises()
  expect(dialogo.querySelector('[role="status"]').textContent).toContain('Solicitud enviada')
  dialogo.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flushPromises()
  expect(document.querySelector('dialog')).toBeNull()
  expect(document.activeElement).toBe(disparador.element)
})

it('cancelar una solicitud conserva el nombre y la receta sin enviar ninguna operación', async () => {
  const wrapper = await montar(true)
  const disparador = wrapper.get('[aria-haspopup="dialog"]')
  await disparador.trigger('click')
  await flushPromises()
  const dialogo = document.querySelector('dialog')
  const entrada = dialogo.querySelector('input')
  entrada.value = 'Almendras'
  entrada.dispatchEvent(new Event('input', { bubbles: true }))
  dialogo.querySelector('button[type="button"]').click()
  await flushPromises()
  expect(document.querySelector('dialog')).toBeNull()
  expect(document.activeElement).toBe(disparador.element)
  expect(wrapper.get('#titulo-receta').element.value).toBe('Pan')
  expect(posts()).toHaveLength(0)
  await disparador.trigger('click')
  await flushPromises()
  expect(document.querySelector('dialog input').value).toBe('Almendras')
})
