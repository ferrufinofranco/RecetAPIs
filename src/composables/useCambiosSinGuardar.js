import { inject, onBeforeUnmount, onMounted, unref } from 'vue'
import { routerKey } from 'vue-router'

export const cambiosSinGuardarKey = Symbol('cambiosSinGuardar')
export const avisoCambiosSinGuardar = 'Tenés cambios sin guardar. ¿Querés salir y descartarlos?'

export function useCambiosSinGuardar(pendiente) {
  const contexto = inject(cambiosSinGuardarKey, null)
  contexto?.pendientes.add(pendiente)
  const confirmarSalida = () => unref(contexto?.descartando) || !unref(pendiente) || window.confirm(avisoCambiosSinGuardar)
  // App agrupa los borradores (incluidos los KeepAlive) en un único aviso.
  // Sin App, el formulario conserva su protección al montarse por separado.
  const router = inject(routerKey, null)
  const quitarGuard = !contexto && router ? router.beforeEach((to, from) => to.path === from.path || confirmarSalida()) : null
  function antesDeSalir(evento) {
    if (!unref(pendiente) || unref(contexto?.descartando)) return
    evento.preventDefault()
    evento.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', antesDeSalir))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', antesDeSalir)
    quitarGuard?.()
    contexto?.pendientes.delete(pendiente)
  })
  return { confirmarSalida }
}
