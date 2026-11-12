// Registro nativo: sólo la pestaña que acepta la actualización puede recargarse.
// No se interceptan fetch, Auth ni escrituras; Workbox sólo precachea la interfaz.
export async function registrarPwa({ disponible, error, recargar = () => window.location.reload() }) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => {}

  let detenido = false
  let aceptada = false
  let instalando
  let registration
  const avisar = () => {
    if (!detenido && registration.waiting && navigator.serviceWorker.controller) {
      disponible(() => {
        // Otra pestaña puede haber activado la versión mientras se posponía.
        if (!registration.waiting) {
          if (registration.active) recargar()
          return
        }
        aceptada = true
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      })
    }
  }
  const cambioEstado = () => {
    if (instalando?.state === 'installed') avisar()
  }
  const nuevaVersion = () => {
    instalando?.removeEventListener('statechange', cambioEstado)
    instalando = registration.installing
    instalando?.addEventListener('statechange', cambioEstado)
  }
  const cambioControlador = () => {
    if (aceptada && !detenido) {
      aceptada = false
      recargar()
    }
  }
  const comprobar = () => {
    if (navigator.onLine && !detenido) registration.update().catch(() => {})
  }
  try {
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    if (detenido) return () => {}
    navigator.serviceWorker.addEventListener('controllerchange', cambioControlador)
    registration.addEventListener('updatefound', nuevaVersion)
    window.addEventListener('online', comprobar)
    window.addEventListener('focus', comprobar)
    nuevaVersion()
    avisar()
  } catch {
    error()
  }
  return () => {
    detenido = true
    navigator.serviceWorker.removeEventListener('controllerchange', cambioControlador)
    registration?.removeEventListener('updatefound', nuevaVersion)
    instalando?.removeEventListener('statechange', cambioEstado)
    window.removeEventListener('online', comprobar)
    window.removeEventListener('focus', comprobar)
  }
}
