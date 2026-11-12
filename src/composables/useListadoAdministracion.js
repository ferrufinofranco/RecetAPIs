import { onActivated, onMounted, watch } from 'vue'

// KeepAlive conserva el formulario; solo se relee el listado al regresar.
// Las operaciones en curso terminan antes de ejecutar una actualización pendiente.
export function useListadoAdministracion(cargar, ocupado = () => false, cargaInicial = true) {
  let primeraActivacion = true
  let pendiente = false
  function actualizar() {
    if (!pendiente || ocupado()) return
    pendiente = false
    void cargar()
  }
  if (cargaInicial) onMounted(cargar)
  onActivated(() => {
    if (primeraActivacion) {
      primeraActivacion = false
      return
    }
    pendiente = true
    actualizar()
  })
  watch(ocupado, actualizar)
}
