import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import BotonTema from '@/components/BotonTema.vue'
import App from '@/App.vue'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'
import CatalogoView from '@/views/CatalogoView.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/services/api'
import { usuarioPrueba } from './vitest.setup'

const clave = 'recetapis-tema'
const html = readFileSync('index.html', 'utf8')
const scriptInicial = html.match(/<script>([\s\S]*?)<\/script>/)[1]
let media, eventos, meta
beforeEach(() => {
  localStorage.removeItem(clave)
  delete document.documentElement.dataset.tema
  meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = '#365f40'
  document.head.append(meta)
  eventos = new EventTarget()
  media = {
    matches: false,
    addEventListener: vi.fn((...args) => eventos.addEventListener(...args)),
    removeEventListener: vi.fn((...args) => eventos.removeEventListener(...args)),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(clave)
  delete document.documentElement.dataset.tema
  meta.remove()
})
function cambiarSistema(oscuro) {
  media.matches = oscuro
  const evento = new Event('change')
  Object.defineProperty(evento, 'matches', { value: oscuro })
  eventos.dispatchEvent(evento)
}
function ejecutarInicio() {
  new Function('window', 'document', 'localStorage', scriptInicial)(window, document, localStorage)
}

it('aplica el tema inicial antes de cargar Vue y la hoja bloqueante de colores evita el fondo claro inicial', () => {
  expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('href="/src/assets/temas.css"'))
  expect(html.indexOf('href="/src/assets/temas.css"')).toBeLessThan(html.indexOf('<body>'))
  expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'))
  media.matches = true
  ejecutarInicio()
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  expect(meta.content).toBe('#151d18')
  localStorage.setItem(clave, 'claro')
  ejecutarInicio()
  expect(document.documentElement.dataset.tema).toBe('claro')
  expect(meta.content).toBe('#365f40')
})

it('sigue el sistema en primera visita y reacciona a sus cambios sin guardar una elección manual', async () => {
  media.matches = true
  const wrapper = mount(BotonTema)
  expect(wrapper.attributes('aria-pressed')).toBe('true')
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  cambiarSistema(false)
  await flushPromises()
  expect(wrapper.attributes('aria-pressed')).toBe('false')
  expect(document.documentElement.dataset.tema).toBe('claro')
  expect(localStorage.getItem(clave)).toBeNull()
})

it('alterna con un botón accesible, persiste y restaura tras recargar sin obedecer al sistema', async () => {
  const wrapper = mount(BotonTema)
  expect(wrapper.attributes('type')).toBe('button')
  expect(wrapper.attributes('aria-label')).toBe('Modo oscuro')
  expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  await wrapper.trigger('click')
  expect(wrapper.attributes('aria-pressed')).toBe('true')
  expect(wrapper.attributes('title')).toBe('Activar modo claro')
  expect(localStorage.getItem(clave)).toBe('oscuro')
  cambiarSistema(false)
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  wrapper.unmount()
  delete document.documentElement.dataset.tema
  ejecutarInicio()
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  const recargado = mount(BotonTema)
  expect(recargado.attributes('aria-pressed')).toBe('true')
  await recargado.trigger('click')
  expect(localStorage.getItem(clave)).toBe('claro')
  cambiarSistema(true)
  expect(document.documentElement.dataset.tema).toBe('claro')
})

it('ignora preferencias inválidas y funciona sin matchMedia', () => {
  localStorage.setItem(clave, 'otro')
  vi.stubGlobal('matchMedia', undefined)
  ejecutarInicio()
  const wrapper = mount(BotonTema)
  expect(document.documentElement.dataset.tema).toBe('claro')
  expect(wrapper.attributes('aria-pressed')).toBe('false')
})

it('tolera localStorage bloqueado en el inicio y al alternar sin perder la elección de esta pestaña', async () => {
  media.matches = true
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Bloqueado') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Bloqueado') })
  expect(ejecutarInicio).not.toThrow()
  const wrapper = mount(BotonTema)
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  await wrapper.trigger('click')
  expect(document.documentElement.dataset.tema).toBe('claro')
  cambiarSistema(true)
  expect(document.documentElement.dataset.tema).toBe('claro')
})

it('sincroniza elecciones de otra pestaña y vuelve al sistema si se elimina la preferencia', async () => {
  mount(BotonTema)
  window.dispatchEvent(new StorageEvent('storage', { key: clave, newValue: 'oscuro' }))
  await flushPromises()
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  cambiarSistema(false)
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave', newValue: 'claro' }))
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  window.dispatchEvent(new StorageEvent('storage', { key: clave, newValue: null }))
  expect(document.documentElement.dataset.tema).toBe('claro')
})

it('libera listeners al desmontar, sin modificar el tema activo', async () => {
  const wrapper = mount(BotonTema)
  await wrapper.trigger('click')
  wrapper.unmount()
  expect(media.removeEventListener).toHaveBeenCalledWith('change', media.addEventListener.mock.calls[0][1])
  window.dispatchEvent(new StorageEvent('storage', { key: clave, newValue: 'claro' }))
  expect(document.documentElement.dataset.tema).toBe('oscuro')
})

async function abrirFormulario() {
  api.defaults.adapter = vi.fn(async config => {
    const datos = {
      profiles: [{ ...usuarioPrueba, rol: 'usuario' }],
      ingredientes: [{ id: 9, nombre: 'Harina', activo: true }],
      categorias: [{ id: 7, nombre: 'General' }],
      receta_versiones: [],
    }
    if (!Object.hasOwn(datos, config.url)) throw new Error(`Petición inesperada: ${config.url}`)
    return { data: datos[config.url], status: 200, headers: {}, config }
  })
  const pinia = createPinia()
  await useAuthStore(pinia).inicializar()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/crear', name: 'crear-receta', component: RecetaFormulario },
    { path: '/', name: 'catalogo', component: CatalogoView },
    { path: '/login', name: 'login', component: { template: '<p>Login</p>' } },
    { path: '/registro', name: 'registro', component: { template: '<p>Registro</p>' } },
    { path: '/mis-recetas', name: 'mis-recetas', component: { template: '<p>Mis recetas</p>' } },
  ] })
  await router.push('/crear')
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

it('alterna desde el menú sin remontar ni borrar el formulario y conserva el tema al navegar', async () => {
  const { wrapper, router } = await abrirFormulario()
  const formulario = wrapper.get('form').element
  await wrapper.get('#titulo-receta').setValue('Borrador conservado')
  await wrapper.get('#cantidad-ingrediente').setValue(77)
  await wrapper.get('#nuevo-paso').setValue('Paso sin agregar')
  await wrapper.get('#agregar-categorias').trigger('click')
  await wrapper.get('#categoria-opcion-7').trigger('click')
  await wrapper.get('#buscar-categorias').trigger('keydown', { key: 'Escape' })
  await wrapper.get('.nav-toggle').trigger('click')
  const menu = wrapper.get('#nav-enlaces')
  await menu.get('.boton-tema').trigger('click')
  expect(wrapper.get('.nav-toggle').attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('form').element).toBe(formulario)
  expect(wrapper.get('#titulo-receta').element.value).toBe('Borrador conservado')
  expect(wrapper.get('#cantidad-ingrediente').element.value).toBe('77')
  expect(wrapper.get('#nuevo-paso').element.value).toBe('Paso sin agregar')
  expect(wrapper.get('[data-categoria-id="7"]').text()).toContain('General')
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await router.push('/')
  await flushPromises()
  expect(wrapper.find('.catalogo').exists()).toBe(true)
  expect(wrapper.find('.mensaje-error').exists()).toBe(false)
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  expect(wrapper.get('.boton-tema').attributes('aria-pressed')).toBe('true')
  expect(api.defaults.adapter.mock.calls.every(([config]) => !config.method || config.method === 'get')).toBe(true)
})

it('el tema del sistema se aplica también al diálogo teletransportado sin cerrarlo ni borrar su borrador', async () => {
  const { wrapper } = await abrirFormulario()
  await wrapper.get('[aria-haspopup="dialog"]').trigger('click')
  await flushPromises()
  const dialogo = document.querySelector('dialog')
  const entrada = dialogo.querySelector('input')
  entrada.value = 'Almendras'
  entrada.dispatchEvent(new Event('input', { bubbles: true }))
  cambiarSistema(true)
  await flushPromises()
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  expect(document.querySelector('dialog')).toBe(dialogo)
  expect(dialogo.open).toBe(true)
  expect(entrada.value).toBe('Almendras')
  dialogo.dispatchEvent(new Event('cancel', { cancelable: true }))
  await flushPromises()
})

it('la paleta oscura cumple contraste AA en textos, estados y controles principales', () => {
  const css = readFileSync('src/assets/temas.css', 'utf8')
  const bloque = css.match(/:root\[data-tema='oscuro'\]\s*\{([^}]+)\}/)[1]
  const colores = Object.fromEntries([...bloque.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map(([, nombre, color]) => [nombre, color]))
  function luminancia(hex) {
    const canales = hex.slice(1).match(/../g).map(canal => {
      const valor = parseInt(canal, 16) / 255
      return valor <= .04045 ? valor / 12.92 : ((valor + .055) / 1.055) ** 2.4
    })
    return canales[0] * .2126 + canales[1] * .7152 + canales[2] * .0722
  }
  function contraste(a, b) {
    const valores = [luminancia(colores[a]), luminancia(colores[b])].sort((x, y) => y - x)
    return (valores[0] + .05) / (valores[1] + .05)
  }
  for (const texto of ['texto', 'texto-control', 'texto-secundario', 'texto-tenue', 'texto-ceja', 'enlace']) {
    for (const fondo of ['fondo', 'superficie', 'superficie-calida', 'superficie-suave']) {
      expect(contraste(texto, fondo), `${texto} / ${fondo}`).toBeGreaterThanOrEqual(4.5)
    }
  }
  for (const [texto, fondo] of [
    ['sobre-primario', 'primario'], ['etiqueta-texto', 'etiqueta-fondo'], ['enlace', 'etiqueta-fondo'],
    ['error-texto', 'error-fondo'], ['advertencia-texto', 'advertencia-fondo'], ['inactivo-texto', 'inactivo-fondo'],
  ]) expect(contraste(texto, fondo), `${texto} / ${fondo}`).toBeGreaterThanOrEqual(4.5)
  for (const color of ['borde-control', 'borde-selector', 'acento']) {
    expect(contraste(color, 'superficie')).toBeGreaterThanOrEqual(3)
  }
})
