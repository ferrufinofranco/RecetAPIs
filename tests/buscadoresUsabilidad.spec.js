import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import IngredientesEditor from '@/components/recetas/IngredientesEditor.vue'
import GestionIngredientes from '@/components/admin/GestionIngredientes.vue'
import GestionCategorias from '@/components/admin/GestionCategorias.vue'
import * as ingredientes from '@/services/ingredientes'
import * as categorias from '@/services/categorias'

vi.mock('@/services/ingredientes', () => ({
  obtenerIngredientes: vi.fn(), crearIngrediente: vi.fn(), renombrarIngrediente: vi.fn(), desactivarIngrediente: vi.fn(),
}))
vi.mock('@/services/categorias', () => ({
  obtenerCategorias: vi.fn(), crearCategoria: vi.fn(), renombrarCategoria: vi.fn(), eliminarCategoria: vi.fn(),
}))
const disponibles = [
  { id: '9007199254740993', nombre: 'Azúcar morena', activo: true },
  { id: 12, nombre: 'Café molido', activo: true },
  { id: 13, nombre: 'Inactivo', activo: false },
]
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  ingredientes.obtenerIngredientes.mockResolvedValue(disponibles)
  categorias.obtenerCategorias.mockResolvedValue([{ id: 1, nombre: 'General' }, { id: 2, nombre: 'Lácteos' }])
})
function editor(modelValue = []) {
  const wrapper = mount(IngredientesEditor, {
    attachTo: document.body,
    props: { disponibles, modelValue, editarCantidades: true,
      'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) },
    global: { stubs: { SolicitudesContextuales: true, SolicitarIngredienteDialogo: true } },
  })
  return wrapper
}
const boton = (wrapper, texto) => wrapper.findAll('button').find(item => item.text() === texto)

it('muestra un único encabezado y campos compactos con etiquetas accesibles; permite editar y quitar', async () => {
  const wrapper = editor([
    { ingrediente_id: 12, nombre: 'Café molido', cantidad: 20, unidad: 'g' },
    { ingrediente_id: '9007199254740993', nombre: 'Azúcar morena', cantidad: 5, unidad: 'g' },
  ])
  expect(wrapper.findAll('.ingredientes-encabezado')).toHaveLength(1)
  expect(wrapper.get('.ingredientes-encabezado').findAll('span').map(item => item.text())).toEqual(['Ingrediente', 'Cantidad', 'Unidad', 'Quitar'])
  const fila = wrapper.get('.ingredientes-agregados li')
  expect(fila.get('label[for="cantidad-12"]').text()).toBe('Cantidad de Café molido')
  expect(fila.get('label[for="unidad-12"]').text()).toBe('Unidad de Café molido')
  expect(fila.findAll('label').every(item => item.classes().includes('etiqueta-accesible'))).toBe(true)
  await wrapper.get('#cantidad-12').setValue('2.5')
  await wrapper.get('#unidad-12').setValue('kg')
  expect(wrapper.props('modelValue')[0]).toMatchObject({ ingrediente_id: 12, cantidad: '2.5', unidad: 'kg' })
  const quitar = wrapper.get('[aria-label="Quitar Café molido"]')
  expect(quitar.text()).toBe('×')
  expect(quitar.get('span').attributes('aria-hidden')).toBe('true')
  await quitar.trigger('click')
  expect(wrapper.props('modelValue').map(item => item.ingrediente_id)).toEqual(['9007199254740993'])
  expect(wrapper.findAll('.ingredientes-agregados li')).toHaveLength(1)
})

it('solo avisa sobre inactivos si están presentes y oculta los encabezados al vaciar el listado', async () => {
  const wrapper = editor([{ ingrediente_id: 12, nombre: 'Café molido', cantidad: 20, unidad: 'g' }])
  expect(wrapper.text()).not.toContain('Podés conservar los ingredientes inactivos')
  await wrapper.setProps({ modelValue: [{ ingrediente_id: 13, nombre: 'Inactivo', activo: false, cantidad: 2, unidad: 'g' }] })
  expect(wrapper.text()).toContain('Podés conservar los ingredientes inactivos')
  expect(wrapper.get('.ingredientes-agregados').text()).toContain('Inactivo (inactivo)')
  await wrapper.get('[aria-label="Quitar Inactivo"]').trigger('click')
  expect(wrapper.text()).not.toContain('Podés conservar los ingredientes inactivos')
  expect(wrapper.find('.ingredientes-encabezado').exists()).toBe(false)
  expect(wrapper.text()).toContain('Agregá al menos un ingrediente activo.')
})

it('abre sin preselección, enfoca búsqueda y cierra por Escape, clic exterior, toggle y Tab', async () => {
  const wrapper = editor()
  const selector = wrapper.get('#ingrediente-elegido')
  expect(selector.text()).toContain('Seleccioná un ingrediente')
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  await selector.trigger('click')
  expect(selector.attributes('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element)
  expect(wrapper.findAll('[role="option"]').every(item => item.attributes('aria-selected') === 'false')).toBe(true)
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })
  expect(document.activeElement).toBe(selector.element)
  expect(selector.attributes('aria-expanded')).toBe('false')
  await selector.trigger('click')
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await flushPromises()
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  await selector.trigger('click')
  await selector.trigger('click')
  expect(selector.attributes('aria-expanded')).toBe('false')
  await selector.trigger('click')
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Tab' })
  expect(selector.attributes('aria-expanded')).toBe('false')
})

it('busca parcialmente sin tildes ni mayúsculas, muestra vacío y permite cambiar con mouse', async () => {
  const wrapper = editor()
  await wrapper.get('#cantidad-ingrediente').setValue(75)
  await wrapper.get('#ingrediente-elegido').trigger('click')
  const entrada = wrapper.get('[role="combobox"]')
  await entrada.setValue('ZUCA')
  expect(wrapper.findAll('[role="option"]').map(item => item.text())).toEqual(['Azúcar morena'])
  await wrapper.get('[role="option"]').trigger('click')
  expect(wrapper.get('#ingrediente-elegido').text()).toContain('Azúcar morena')
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  await wrapper.get('#ingrediente-elegido').trigger('click')
  await wrapper.get('[role="combobox"]').setValue('inexistente')
  expect(wrapper.text()).toContain('No se encontraron ingredientes')
  await wrapper.get('[role="combobox"]').setValue('CAFE')
  await wrapper.get('[role="option"]').trigger('click')
  expect(wrapper.get('#ingrediente-elegido').text()).toContain('Café molido')
  expect(wrapper.get('#cantidad-ingrediente').element.value).toBe('75')
})

it('selecciona con flechas y Enter, mantiene el ID real y previene duplicados e inactivos', async () => {
  const wrapper = editor([{ ingrediente_id: 13, nombre: 'Inactivo', cantidad: 2, unidad: 'g', activo: false }])
  await wrapper.get('#ingrediente-elegido').trigger('keydown', { key: 'ArrowDown' })
  const entrada = wrapper.get('[role="combobox"]')
  expect(wrapper.find('#ingrediente-opcion-13').exists()).toBe(false)
  await entrada.trigger('keydown', { key: 'ArrowUp' })
  expect(entrada.attributes('aria-activedescendant')).toBe('ingrediente-opcion-12')
  await entrada.trigger('keydown', { key: 'ArrowDown' })
  expect(entrada.attributes('aria-activedescendant')).toBe('ingrediente-opcion-9007199254740993')
  await entrada.trigger('keydown', { key: 'Enter' })
  expect(document.activeElement).toBe(wrapper.get('#ingrediente-elegido').element)
  await wrapper.get('#cantidad-ingrediente').setValue(20)
  await boton(wrapper, 'Agregar ingrediente').trigger('click')
  expect(wrapper.props('modelValue')[1]).toEqual({ ingrediente_id: '9007199254740993', nombre: 'Azúcar morena', cantidad: 20, unidad: 'g' })
  expect(wrapper.get('.lista-editor').text()).toContain('Inactivo (inactivo)')
  await wrapper.get('#ingrediente-elegido').trigger('click')
  expect(wrapper.findAll('[role="option"]').map(item => item.text())).toEqual(['Café molido'])
  await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })
  await boton(wrapper, 'Agregar ingrediente').trigger('click')
  expect(wrapper.props('modelValue')).toHaveLength(2)
  expect(wrapper.get('[role="alert"]').text()).toContain('todavía no esté agregado')
})

for (const [tipo, Componente, servicio, nombre, idBusqueda, accion, funcionAccion, vacio] of [
  ['ingredientes', GestionIngredientes, ingredientes, 'Azúcar morena', 'buscar-ingredientes-admin', 'Desactivar', 'desactivarIngrediente', 'No se encontraron ingredientes'],
  ['categorías', GestionCategorias, categorias, 'Lácteos', 'buscar-categorias-admin', 'Eliminar', 'eliminarCategoria', 'No se encontraron categorías'],
]) {
  it(`filtra ${tipo}, cuenta coincidencias y conserva creación, edición y ${accion.toLowerCase()}`, async () => {
    const wrapper = mount(Componente)
    await flushPromises()
    const buscar = wrapper.get(`#${idBusqueda}`)
    expect(buscar.element.closest('.listado-scroll')).toBeNull()
    await buscar.setValue(tipo === 'ingredientes' ? 'ZUCA' : 'LACT')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.text()).toContain('1 coincidencias')
    await wrapper.get(`[aria-label="Editar ${nombre}"]`).trigger('click')
    expect(wrapper.get('form input').element.value).toBe(nombre)
    await wrapper.get('form input').setValue('Nombre editado')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(servicio[tipo === 'ingredientes' ? 'renombrarIngrediente' : 'renombrarCategoria']).toHaveBeenCalledWith(expect.objectContaining({ nombre }), 'Nombre editado')
    await wrapper.get(`[aria-label="${accion} ${nombre}"]`).trigger('click')
    await flushPromises()
    expect(servicio[funcionAccion]).toHaveBeenCalledWith(expect.objectContaining({ nombre }))
    await buscar.setValue('sin coincidencias')
    expect(wrapper.text()).toContain(vacio)
    expect(wrapper.text()).toContain('0 coincidencias')
    expect(wrapper.findAll('li')).toHaveLength(0)
    await wrapper.get('form input').setValue('Nuevo registro')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(servicio[tipo === 'ingredientes' ? 'crearIngrediente' : 'crearCategoria']).toHaveBeenCalledWith('Nuevo registro')
    await buscar.setValue('')
    expect(wrapper.findAll('li')).toHaveLength(tipo === 'ingredientes' ? 3 : 2)
    if (tipo === 'categorías') {
      const general = wrapper.findAll('li').find(item => item.text().includes('General'))
      expect(general.text()).toContain('Protegida')
      expect(general.find('button').exists()).toBe(false)
    } else expect(wrapper.find('[aria-label="Desactivar Inactivo"]').exists()).toBe(false)
  })
}
