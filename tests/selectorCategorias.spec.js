import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SelectorCategorias from '@/components/recetas/SelectorCategorias.vue'
import { categoriasSeleccionadas } from './helpers/categorias'

const opciones = [
  { id: 7, nombre: 'General' },
  { id: '9007199254740993', nombre: 'Lácteos' },
  { id: 9, nombre: 'Café y té' },
]
function montar(modelValue = [], disponibles = opciones) {
  const wrapper = mount(SelectorCategorias, {
    attachTo: document.body,
    props: { opciones: disponibles, modelValue,
      'onUpdate:modelValue': valor => wrapper.setProps({ modelValue: valor }) },
  })
  return wrapper
}

it('inicia cerrado sin elegir General; abre, enfoca y cierra con Escape, toggle y clic exterior', async () => {
  const wrapper = montar()
  const boton = wrapper.get('#agregar-categorias')
  expect(boton.text()).toContain('Agregar categorías...')
  expect(boton.attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  expect(wrapper.get('.categorias-recuadro').text()).toContain('Categorías seleccionadas')
  expect(wrapper.text()).toContain('No seleccionaste categorías.')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await boton.trigger('click')
  expect(document.activeElement).toBe(wrapper.get('#buscar-categorias').element)
  expect(boton.attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('[role="combobox"]').attributes('aria-controls')).toBe(wrapper.get('[role="listbox"]').attributes('id'))
  expect(wrapper.get('[role="listbox"]').attributes('aria-multiselectable')).toBe('true')
  await wrapper.get('#buscar-categorias').trigger('keydown', { key: 'Escape' })
  expect(document.activeElement).toBe(boton.element)
  expect(boton.attributes('aria-expanded')).toBe('false')
  await boton.trigger('click')
  await boton.trigger('click')
  expect(boton.attributes('aria-expanded')).toBe('false')
  await boton.trigger('click')
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await flushPromises()
  expect(boton.attributes('aria-expanded')).toBe('false')
})

it('busca parcialmente sin tildes ni mayúsculas y muestra el estado sin resultados', async () => {
  const wrapper = montar()
  await wrapper.get('#agregar-categorias').trigger('click')
  const entrada = wrapper.get('#buscar-categorias')
  await entrada.setValue('ACTE')
  expect(wrapper.findAll('[role="option"]').map(item => item.text())).toEqual(['Lácteos'])
  await entrada.setValue('fé Y TÉ')
  expect(wrapper.findAll('[role="option"]').map(item => item.text())).toEqual(['Café y té'])
  await entrada.setValue('sin coincidencias')
  expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
  expect(wrapper.text()).toContain('No se encontraron categorías disponibles.')
  await entrada.trigger('keydown', { key: 'ArrowDown' })
  await entrada.trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(entrada.attributes('aria-activedescendant')).toBeUndefined()
})

it('agrega varias con mouse sin cerrar, conserva IDs y oculta seleccionadas sin duplicarlas', async () => {
  const wrapper = montar()
  await wrapper.get('#agregar-categorias').trigger('click')
  const general = wrapper.get('#categoria-opcion-7')
  await general.trigger('click')
  expect(wrapper.props('modelValue')).toEqual([7])
  expect(wrapper.get('#agregar-categorias').attributes('aria-expanded')).toBe('true')
  expect(wrapper.find('#categoria-opcion-7').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('#buscar-categorias').element)
  await general.trigger('click')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  await wrapper.get('#categoria-opcion-9007199254740993').trigger('click')
  expect(wrapper.props('modelValue')).toEqual([7, '9007199254740993'])
  expect(categoriasSeleccionadas(wrapper)).toEqual(['7', '9007199254740993'])
  expect(wrapper.findAll('[role="option"]').map(item => item.text())).toEqual(['Café y té'])
  expect(wrapper.get('.categorias-recuadro').text()).toContain('Lácteos')
})

it('quita etiquetas, restaura las opciones y lleva el foco a la siguiente etiqueta o al selector', async () => {
  const wrapper = montar([7, '9007199254740993'])
  const quitarGeneral = wrapper.get('[aria-label="Quitar categoría General"]')
  expect(quitarGeneral.get('span').attributes('aria-hidden')).toBe('true')
  await quitarGeneral.trigger('click')
  expect(wrapper.props('modelValue')).toEqual(['9007199254740993'])
  expect(document.activeElement).toBe(wrapper.get('[aria-label="Quitar categoría Lácteos"]').element)
  await wrapper.get('#agregar-categorias').trigger('click')
  expect(wrapper.find('#categoria-opcion-7').exists()).toBe(true)
  await wrapper.get('#buscar-categorias').trigger('keydown', { key: 'Escape' })
  await wrapper.get('[aria-label="Quitar categoría Lácteos"]').trigger('click')
  expect(wrapper.props('modelValue')).toEqual([])
  expect(document.activeElement).toBe(wrapper.get('#agregar-categorias').element)
  await wrapper.get('#agregar-categorias').trigger('click')
  expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
})

it('recorre con flechas, agrega con Enter y mantiene el foco y la referencia ARIA tras seleccionar', async () => {
  const wrapper = montar()
  await wrapper.get('#agregar-categorias').trigger('keydown', { key: 'ArrowUp' })
  const entrada = wrapper.get('#buscar-categorias')
  expect(entrada.attributes('aria-activedescendant')).toBe('categoria-opcion-9')
  await entrada.trigger('keydown', { key: 'ArrowDown' })
  expect(entrada.attributes('aria-activedescendant')).toBe('categoria-opcion-7')
  await entrada.trigger('keydown', { key: 'ArrowDown' })
  await entrada.trigger('keydown', { key: 'Enter' })
  expect(wrapper.props('modelValue')).toEqual(['9007199254740993'])
  expect(entrada.attributes('aria-activedescendant')).toBe('categoria-opcion-9')
  expect(document.activeElement).toBe(entrada.element)
  await entrada.trigger('keydown', { key: 'Enter' })
  expect(wrapper.props('modelValue')).toEqual(['9007199254740993', 9])
  await entrada.setValue('General')
  expect(entrada.attributes('aria-activedescendant')).toBeUndefined()
  await entrada.trigger('keydown', { key: 'ArrowDown' })
  await entrada.trigger('keydown', { key: 'Enter' })
  expect(wrapper.props('modelValue')).toEqual(['9007199254740993', 9, 7])
  expect(wrapper.text()).toContain('No se encontraron categorías disponibles.')
  await entrada.trigger('keydown', { key: 'Escape' })
  expect(document.activeElement).toBe(wrapper.get('#agregar-categorias').element)
})

it('precarga sin emitir cambios, reconoce IDs equivalentes y no usa los nombres para identificar', async () => {
  const wrapper = montar([7], [])
  await wrapper.setProps({ opciones: [{ id: '7', nombre: 'General' }, { id: 8, nombre: 'General' }] })
  expect(wrapper.props('modelValue')).toEqual([7])
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await wrapper.get('#agregar-categorias').trigger('click')
  expect(wrapper.find('#categoria-opcion-7').exists()).toBe(false)
  await wrapper.get('#categoria-opcion-8').trigger('click')
  expect(wrapper.props('modelValue')).toEqual([7, 8])
  expect(wrapper.findAll('.categorias-etiquetas li')).toHaveLength(2)
})

it('conserva selecciones no disponibles sin corregirlas automáticamente y vincula el error existente', async () => {
  const wrapper = montar([99])
  await wrapper.setProps({ invalido: true, descripcion: 'error-categorias' })
  expect(categoriasSeleccionadas(wrapper)).toEqual(['99'])
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('#agregar-categorias').attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#agregar-categorias').attributes('aria-describedby')).toBe('error-categorias')
  await wrapper.get('#agregar-categorias').trigger('click')
  expect(wrapper.get('#buscar-categorias').attributes('aria-describedby')).toBe('error-categorias')
})

it('cierra al salir con Tab sin robar el foco al siguiente control', async () => {
  const wrapper = mount({
    components: { SelectorCategorias },
    data: () => ({ seleccion: [], opciones }),
    template: '<div><SelectorCategorias v-model="seleccion" :opciones="opciones" /><button id="siguiente-campo">Siguiente campo</button></div>',
  }, { attachTo: document.body })
  await wrapper.get('#agregar-categorias').trigger('click')
  await wrapper.get('#buscar-categorias').trigger('keydown', { key: 'Tab' })
  // jsdom no ejecuta el desplazamiento nativo de Tab; se simula el foco de destino.
  wrapper.get('#siguiente-campo').element.focus()
  await flushPromises()
  expect(wrapper.get('#agregar-categorias').attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(wrapper.get('#siguiente-campo').element)
})

it('respeta el fieldset deshabilitado incluso si el desplegable ya estaba abierto', async () => {
  const wrapper = mount({
    components: { SelectorCategorias },
    data: () => ({ seleccion: [], opciones, bloqueado: false }),
    template: '<fieldset :disabled="bloqueado"><SelectorCategorias v-model="seleccion" :opciones="opciones" /></fieldset>',
  })
  await wrapper.get('#agregar-categorias').trigger('click')
  await wrapper.setData({ bloqueado: true })
  await wrapper.get('#categoria-opcion-7').trigger('click')
  expect(wrapper.getComponent(SelectorCategorias).emitted('update:modelValue')).toBeUndefined()
})
