import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'
import PasosEditor from '@/components/recetas/PasosEditor.vue'
import ImagenRecetaEditor from '@/components/recetas/ImagenRecetaEditor.vue'
import { usuarioPrueba } from './vitest.setup'
import { categoriasSeleccionadas, seleccionarCategoria } from './helpers/categorias'

let peticiones, falloSolicitud, pendienteSolicitud, historial
const posts = () => peticiones.filter((config) => config.method === 'post')
const propuesta = {
  id: 83, receta_id: 12, estado: 'pendiente', titulo: 'Pan', porciones: 4,
  receta_categorias: [{ categoria_id: 7 }],
  receta_ingredientes: [{ ingrediente_id: 9, cantidad: 200, unidad: 'g', ingredientes: { nombre: 'Harina', activo: true } }],
  receta_pasos: [{ orden: 1, descripcion: 'Mezclar' }],
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  peticiones = []
  falloSolicitud = null
  pendienteSolicitud = null
  historial = ['pendiente', 'aprobada', 'rechazada', 'asociada'].map((estado, id) => ({
    id, nombre_solicitado: `Solicitud ${estado}`, estado,
    ingrediente_id: ['aprobada', 'asociada'].includes(estado) ? 9 : null,
    creada_en: id ? '2026-11-12T12:00:00Z' : null,
  }))
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
    else if (config.url === 'solicitudes_ingredientes') data = config.params.offset ? [] : structuredClone(historial)
    else if (config.url === 'rpc/solicitar_ingrediente') {
      if (falloSolicitud) throw falloSolicitud
      if (pendienteSolicitud) await pendienteSolicitud
      historial.push({ id: 15, nombre_solicitado: 'Almendras', estado: 'pendiente' })
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
  await wrapper.get('#ingrediente-elegido').trigger('click')
  await wrapper.get(`#ingrediente-opcion-${id}`).trigger('click')
  await wrapper.get('#cantidad-ingrediente').setValue(100)
  await boton(wrapper, 'Agregar ingrediente').trigger('click')
}

it('ordena las secciones y permite agregar, editar y quitar ingredientes durante la creación', async () => {
  const wrapper = await montar()
  expect(wrapper.findAll('form section h2').map((item) => item.text())).toEqual([
    'Información general', 'Categorías', 'Imagen (opcional)', 'Ingredientes', 'Preparación',
  ])
  await wrapper.get('#ingrediente-elegido').trigger('click')
  expect(wrapper.find('#ingrediente-opcion-11').exists()).toBe(false)
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })
  await agregarIngrediente(wrapper)
  await wrapper.get('#cantidad-9').setValue(.5)
  await wrapper.get('#unidad-9').setValue('kg')
  await agregarIngrediente(wrapper, 10)
  await wrapper.get('[aria-label="Quitar Leche"]').trigger('click')
  expect(wrapper.findAll('.lista-editor li')).toHaveLength(1)
  await wrapper.get('#ingrediente-elegido').trigger('click')
  expect(wrapper.find('#ingrediente-opcion-10').exists()).toBe(true)
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })
  await wrapper.get('#titulo-receta').setValue('Pan nuevo')
  await wrapper.get('#porciones-receta').setValue(2)
  await seleccionarCategoria(wrapper, 7)
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
  expect(categoriasSeleccionadas(wrapper)).toEqual(['7'])
  expect(wrapper.get('.categorias-etiquetas').text()).toContain('General')
  await seleccionarCategoria(wrapper, 8)
  await wrapper.get('[aria-label="Quitar categoría General"]').trigger('click')
  await seleccionarCategoria(wrapper, 7)
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
    if (!edicion) await seleccionarCategoria(wrapper, 7)
    if (!edicion) await agregarIngrediente(wrapper)
    await wrapper.get('#cantidad-ingrediente').setValue(77)
    await wrapper.get('#nuevo-paso').setValue('Borrador de paso')
    // Mantener también la validación y la identidad de los campos al desplegar.
    await boton(wrapper, 'Agregar ingrediente').trigger('click')
    const errorIngrediente = wrapper.getComponent({ name: 'IngredientesEditor' }).get('[role="alert"]').text()
    const titulo = wrapper.get('#titulo-receta').element
    const toggle = wrapper.get('#ver-mis-solicitudes')
    const accionesSolicitudes = wrapper.get('.solicitudes-acciones')
    expect(accionesSolicitudes.get('[aria-haspopup="dialog"]').text()).toBe('Solicitar ingrediente')
    expect(accionesSolicitudes.get('#ver-mis-solicitudes').element).toBe(toggle.element)
    expect(accionesSolicitudes.find('#historial-solicitudes').exists()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.get('[aria-hidden="true"]').text()).toBe('↓')
    expect(wrapper.get('#historial-solicitudes').isVisible()).toBe(false)
    expect(peticiones.some((config) => config.url === 'solicitudes_ingredientes')).toBe(false)
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.get('[aria-hidden="true"]').text()).toBe('↑')
    const panel = wrapper.get('#historial-solicitudes')
    expect(panel.isVisible()).toBe(true)
    for (const estado of ['Pendiente', 'Aprobada', 'Rechazada', 'Asociada']) expect(panel.text()).toContain(estado)
    expect(panel.text()).toContain('Ingrediente creado: Harina')
    expect(panel.text()).toContain('Ingrediente asociado: Harina')
    expect(panel.text()).toContain('Fecha no disponible')
    expect(panel.text()).toContain('2026')
    expect(panel.find('li button').exists()).toBe(false)
    await toggle.trigger('click')
    expect(panel.isVisible()).toBe(false)
    expect(wrapper.get('#titulo-receta').element).toBe(titulo)
    expect(wrapper.getComponent({ name: 'IngredientesEditor' }).get('[role="alert"]').text()).toBe(errorIngrediente)
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
    await toggle.trigger('click')
    await flushPromises()
    expect(panel.text()).toContain('Almendras')
    expect(panel.findAll('li')).toHaveLength(5)
    expect(wrapper.getComponent({ name: 'IngredientesEditor' }).get('[role="alert"]').text()).toBe(errorIngrediente)
    expect(wrapper.get('#titulo-receta').element.value).toBe('Mi receta sin guardar')
    expect(wrapper.get('#descripcion-receta').element.value).toBe('Descripción conservada')
    expect(wrapper.get('#porciones-receta').element.value).toBe('3')
    expect(categoriasSeleccionadas(wrapper)).toEqual(['7'])
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

it('relee el historial al reexpandir sin remontar ni perder el borrador principal', async () => {
  const wrapper = await montar(true)
  await wrapper.get('#nuevo-paso').setValue('Borrador conservado')
  const titulo = wrapper.get('#titulo-receta').element
  const toggle = wrapper.get('#ver-mis-solicitudes')
  await toggle.trigger('click')
  await flushPromises()
  const lecturas = () => peticiones.filter(item => item.url === 'solicitudes_ingredientes' && !item.params.offset).length
  const antes = lecturas()
  await toggle.trigger('click')
  historial[0].estado = 'aprobada'
  historial.push({ id: 99, nombre_solicitado: 'Externo', estado: 'asociada', ingrediente_id: 9 })
  await toggle.trigger('click')
  await flushPromises()
  expect(lecturas()).toBe(antes + 1)
  expect(wrapper.get('#historial-solicitudes').text()).toContain('Externo')
  expect(wrapper.get('#titulo-receta').element).toBe(titulo)
  expect(wrapper.get('#nuevo-paso').element.value).toBe('Borrador conservado')
  expect(posts()).toHaveLength(0)
})

it('vincula errores al campo o sección correspondiente y mueve el foco sin enviar datos inválidos', async () => {
  const wrapper = await montar()
  const enviar = async () => { await wrapper.get('form').trigger('submit'); await flushPromises() }
  await enviar()
  expect(document.activeElement.id).toBe('titulo-receta')
  expect(wrapper.get('#titulo-receta').attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#error-titulo').text()).toBe('Ingresá un título.')
  await wrapper.get('#titulo-receta').setValue('Pan')
  await enviar()
  expect(document.activeElement.id).toBe('porciones-receta')
  await wrapper.get('#porciones-receta').setValue(2)
  await enviar()
  expect(document.activeElement.id).toBe('ingredientes-editor')
  expect(wrapper.get('#error-ingredientes').text()).toContain('al menos un ingrediente')
  await agregarIngrediente(wrapper)
  await enviar()
  expect(document.activeElement.id).toBe('categorias-receta')
  expect(wrapper.get('#agregar-categorias').attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#agregar-categorias').attributes('aria-describedby')).toBe('error-categorias')
  await seleccionarCategoria(wrapper, 7)
  await enviar()
  expect(document.activeElement.id).toBe('preparacion-editor')
  expect(wrapper.get('#error-pasos').text()).toContain('al menos un paso')
  expect(posts()).toHaveLength(0)
})

it('presenta también la validación nativa con contexto y foco', async () => {
  const wrapper = await montar(true)
  await wrapper.get('#porciones-receta').setValue(0)
  await wrapper.get('#porciones-receta').trigger('invalid')
  await flushPromises()
  expect(document.activeElement.id).toBe('porciones-receta')
  expect(wrapper.get('#porciones-receta').attributes('aria-describedby')).toBe('error-porciones')
  expect(wrapper.get('#error-porciones').text()).not.toBe('')
  expect(posts()).toHaveLength(0)
})
