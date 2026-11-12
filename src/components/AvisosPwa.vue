<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { registrarPwa } from '@/pwa/registro'

const props = defineProps({ hayCambiosSinGuardar: { type: Function, required: true } })
const sinConexion = ref(!navigator.onLine)
const actualizar = shallowRef(null)
const pospuesta = ref(false)
const errorRegistro = ref(false)
const esperandoCambios = ref(false)
let quitarRegistro
let desmontado = false
const conexion = () => { sinConexion.value = !navigator.onLine }

function aplicarActualizacion() {
  // Consultar al hacer clic, no una copia del estado al encontrar la versión.
  if (props.hayCambiosSinGuardar()) {
    esperandoCambios.value = true
    return
  }
  actualizar.value?.()
}

function recargarSinPerderCambios() {
  // También cubrir cambios hechos mientras el worker pasaba a activo.
  if (props.hayCambiosSinGuardar()) {
    esperandoCambios.value = true
    return
  }
  window.location.reload()
}

onMounted(async () => {
  window.addEventListener('online', conexion)
  window.addEventListener('offline', conexion)
  quitarRegistro = await registrarPwa({
    disponible: (aplicar) => { actualizar.value = aplicar; pospuesta.value = false },
    error: () => { errorRegistro.value = true },
    recargar: recargarSinPerderCambios,
  })
  if (desmontado) quitarRegistro?.()
})
onBeforeUnmount(() => {
  desmontado = true
  quitarRegistro?.()
  window.removeEventListener('online', conexion)
  window.removeEventListener('offline', conexion)
})
</script>

<template>
  <p v-if="sinConexion" class="mensaje-info" role="status">
    Estás sin conexión. Necesitás internet para consultar o modificar recetas e iniciar sesión.
    La interfaz puede abrirse, pero los datos no están disponibles sin conexión.
    No se enviarán cambios automáticamente al reconectarte.
  </p>
  <section v-if="actualizar && !pospuesta" class="mensaje-info" aria-label="Actualización disponible">
    <p role="status">Hay una nueva versión de RecetAPIs. Guardá tus cambios antes de actualizar; se recargará esta pestaña.</p>
    <p v-if="esperandoCambios" role="status">Tenés cambios sin guardar. Guardalos o descartalos desde el formulario antes de actualizar.</p>
    <button type="button" @click="aplicarActualizacion">Actualizar ahora</button>
    <button type="button" class="boton-secundario" @click="pospuesta = true">Más tarde</button>
  </section>
  <p v-if="errorRegistro && !sinConexion" class="mensaje-info" role="status">
    No se pudo preparar la instalación. Podés seguir usando RecetAPIs con internet y volver a intentar al abrirla de nuevo.
  </p>
</template>
