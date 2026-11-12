<script setup>
import { inject, nextTick, onMounted, ref, watch } from 'vue'
import { routeLocationKey } from 'vue-router'
import SolicitarIngredienteDialogo from './SolicitarIngredienteDialogo.vue'
import SolicitudesIngredientes from './SolicitudesIngredientes.vue'

const route = inject(routeLocationKey, null)
const abierto = ref(route?.query.solicitudes === 'abiertas')
const consultado = ref(abierto.value)
const actualizacion = ref(0)
const panel = ref(null)

async function destacarHistorial() {
  await nextTick()
  panel.value?.focus()
  panel.value?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
}
onMounted(() => { if (abierto.value) destacarHistorial() })
watch(() => route?.query.solicitudes, (valor) => {
  if (valor !== 'abiertas') return
  abierto.value = true
  consultado.value = true
  actualizacion.value++
  destacarHistorial()
})

function alternar() {
  abierto.value = !abierto.value
  if (abierto.value) {
    actualizacion.value++
    consultado.value = true
  }
}
</script>

<template>
  <div class="solicitudes-contextuales">
    <div class="solicitudes-acciones">
      <SolicitarIngredienteDialogo @enviada="actualizacion++" />
      <button id="ver-mis-solicitudes" type="button" class="boton-secundario ver-solicitudes"
        :aria-expanded="abierto" aria-controls="historial-solicitudes" @click="alternar">
        {{ abierto ? 'Ocultar mis solicitudes' : 'Ver mis solicitudes' }}
        <span aria-hidden="true">{{ abierto ? '↑' : '↓' }}</span>
      </button>
    </div>
    <div id="historial-solicitudes" ref="panel" v-show="abierto" :tabindex="abierto ? -1 : undefined" role="region" aria-labelledby="ver-mis-solicitudes">
      <SolicitudesIngredientes v-if="consultado" compacta :actualizacion="actualizacion" />
    </div>
  </div>
</template>

<style scoped>
.solicitudes-contextuales { min-width: 0; }
.solicitudes-acciones { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem .75rem; margin-top: .35rem; }
.solicitudes-acciones :deep(.boton-solicitud), .ver-solicitudes { margin: 0; min-height: 44px; max-width: 100%; white-space: normal; padding: .35rem 0; background: transparent; color: #365f40; border: 0; border-radius: 0; text-align: left; }
.ver-solicitudes:hover { text-decoration: underline; text-underline-offset: 4px; }
.ver-solicitudes:focus-visible { outline: 3px solid #b56825; outline-offset: 3px; }
</style>
