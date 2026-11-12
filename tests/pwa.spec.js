import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AvisosPwa from '@/components/AvisosPwa.vue'
import { registrarPwa } from '@/pwa/registro'

vi.mock('@/pwa/registro', () => ({ registrarPwa: vi.fn() }))
let opciones, aplicar, quitar, wrapper
beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  aplicar = vi.fn()
  quitar = vi.fn()
  registrarPwa.mockImplementation(async (callbacks) => { opciones = callbacks; return quitar })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

it('avisa offline y al reconectar no dispara actualizaciones ni escrituras', async () => {
  wrapper = mount(AvisosPwa, { props: { hayCambiosSinGuardar: () => false } })
  await flushPromises()
  expect(wrapper.text()).toBe('')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  window.dispatchEvent(new Event('offline'))
  await flushPromises()
  expect(wrapper.text()).toContain('Necesitás internet para consultar o modificar recetas')
  expect(wrapper.text()).toContain('No se enviarán cambios automáticamente')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  window.dispatchEvent(new Event('online'))
  await flushPromises()
  expect(wrapper.text()).toBe('')
  expect(aplicar).not.toHaveBeenCalled()
})

it('no aplica versiones automáticamente y comprueba cambios al aceptar', async () => {
  let pendiente = false
  wrapper = mount(AvisosPwa, { props: { hayCambiosSinGuardar: () => pendiente } })
  await flushPromises()
  opciones.disponible(aplicar)
  await flushPromises()
  expect(aplicar).not.toHaveBeenCalled()
  pendiente = true
  await wrapper.get('button').trigger('click')
  expect(aplicar).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Tenés cambios sin guardar')
  pendiente = false
  await wrapper.get('button').trigger('click')
  expect(aplicar).toHaveBeenCalledOnce()
})

it('permite posponer sin recargar y elimina los listeners al desmontar', async () => {
  wrapper = mount(AvisosPwa, { props: { hayCambiosSinGuardar: () => false } })
  await flushPromises()
  opciones.disponible(aplicar)
  await flushPromises()
  await wrapper.get('.boton-secundario').trigger('click')
  expect(wrapper.find('section').exists()).toBe(false)
  expect(aplicar).not.toHaveBeenCalled()
  wrapper.unmount()
  expect(quitar).toHaveBeenCalledOnce()
})

it('revisa nuevamente los borradores si cambian durante la activación', async () => {
  wrapper = mount(AvisosPwa, { props: { hayCambiosSinGuardar: () => true } })
  await flushPromises()
  opciones.disponible(aplicar)
  opciones.recargar()
  await flushPromises()
  expect(wrapper.text()).toContain('Tenés cambios sin guardar')
})

it('presenta un fallo de registro sin detalles técnicos', async () => {
  wrapper = mount(AvisosPwa, { props: { hayCambiosSinGuardar: () => false } })
  await flushPromises()
  opciones.error()
  await flushPromises()
  expect(wrapper.text()).toContain('Podés seguir usando RecetAPIs con internet')
})
