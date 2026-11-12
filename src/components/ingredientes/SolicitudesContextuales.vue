<script setup>
import { inject, ref } from 'vue'
import { routeLocationKey } from 'vue-router'
import SolicitarIngredienteDialogo from './SolicitarIngredienteDialogo.vue'
import SolicitudesIngredientes from './SolicitudesIngredientes.vue'

const route = inject(routeLocationKey, null)
const abierto = ref(route?.query.solicitudes === 'abiertas')
const consultado = ref(abierto.value)
const actualizacion = ref(0)

function alternar() {
  abierto.value = !abierto.value
  if (abierto.value) consultado.value = true
}
</script>

<template>
  <div class="solicitudes-contextuales">
    <SolicitarIngredienteDialogo @enviada="actualizacion++" />
    <button id="ver-mis-solicitudes" type="button" class="boton-secundario ver-solicitudes"
      :aria-expanded="abierto" aria-controls="historial-solicitudes" @click="alternar">
      {{ abierto ? 'Ocultar mis solicitudes' : 'Ver mis solicitudes' }}
      <span aria-hidden="true">{{ abierto ? '↑' : '↓' }}</span>
    </button>
    <div id="historial-solicitudes" v-show="abierto" role="region" aria-labelledby="ver-mis-solicitudes">
      <SolicitudesIngredientes v-if="consultado" compacta :actualizacion="actualizacion" />
    </div>
  </div>
</template>

<style scoped>
.solicitudes-contextuales { min-width: 0; }
.ver-solicitudes { display: block; margin-top: .5rem; min-height: 44px; max-width: 100%; white-space: normal; }
.ver-solicitudes:focus-visible { outline: 3px solid #b56825; outline-offset: 3px; }
</style>
