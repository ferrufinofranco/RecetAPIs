import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registrarPwa } from '@/pwa/registro'

let serviceWorker, registration, disponible, recargar, error, quitar
beforeEach(() => {
  vi.stubEnv('PROD', true)
  serviceWorker = new EventTarget()
  serviceWorker.controller = {}
  registration = new EventTarget()
  registration.waiting = { postMessage: vi.fn() }
  registration.update = vi.fn().mockResolvedValue(undefined)
  serviceWorker.register = vi.fn().mockResolvedValue(registration)
  vi.stubGlobal('navigator', { serviceWorker, onLine: true })
  disponible = vi.fn()
  recargar = vi.fn()
  error = vi.fn()
})
afterEach(() => { quitar?.(); quitar = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('registra el SW y sólo recarga la pestaña que acepta la actualización', async () => {
  quitar = await registrarPwa({ disponible, recargar, error })
  expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  expect(disponible).toHaveBeenCalledOnce()
  expect(registration.waiting.postMessage).not.toHaveBeenCalled()
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(recargar).not.toHaveBeenCalled()
  disponible.mock.calls[0][0]()
  expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(recargar).toHaveBeenCalledOnce()
  quitar()
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(recargar).toHaveBeenCalledOnce()
})

it('detecta una nueva instalación sin activar ni recargar', async () => {
  registration.waiting = null
  quitar = await registrarPwa({ disponible, recargar, error })
  expect(disponible).not.toHaveBeenCalled()
  registration.installing = new EventTarget()
  registration.dispatchEvent(new Event('updatefound'))
  registration.waiting = { postMessage: vi.fn() }
  registration.installing.state = 'installed'
  registration.installing.dispatchEvent(new Event('statechange'))
  expect(disponible).toHaveBeenCalledOnce()
  expect(recargar).not.toHaveBeenCalled()
})

it('permite actualizar después de que otra pestaña activó la versión pendiente', async () => {
  quitar = await registrarPwa({ disponible, recargar, error })
  const aplicar = disponible.mock.calls[0][0]
  registration.waiting = null
  registration.active = {}
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(recargar).not.toHaveBeenCalled()
  aplicar()
  expect(recargar).toHaveBeenCalledOnce()
})

it('la primera instalación no ofrece recargar y el modo desarrollo no registra', async () => {
  serviceWorker.controller = null
  quitar = await registrarPwa({ disponible, recargar, error })
  expect(disponible).not.toHaveBeenCalled()
  vi.stubEnv('PROD', false)
  await registrarPwa({ disponible, recargar, error })
  expect(serviceWorker.register).toHaveBeenCalledOnce()
})

it('informa un fallo de registro sin romper la aplicación', async () => {
  serviceWorker.register.mockRejectedValue(new Error('Registro rechazado'))
  quitar = await registrarPwa({ disponible, recargar, error })
  expect(error).toHaveBeenCalledOnce()
  expect(disponible).not.toHaveBeenCalled()
})
