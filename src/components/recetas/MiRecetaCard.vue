<script setup>
import { computed } from 'vue'

const props = defineProps({ receta: { type: Object, required: true } })
const etiquetas = { publicada: 'Publicada', pendiente: 'Pendiente', rechazada: 'Rechazada' }
const fecha = computed(() => {
  const valor = new Date(props.receta.creadaEn)
  return Number.isNaN(valor.getTime()) ? 'Fecha no disponible' : valor.toLocaleDateString('es-AR')
})
</script>

<template>
  <article class="receta-card mi-receta-card">
    <div class="card-contenido">
      <h2>{{ receta.titulo }}</h2>
      <p class="dato">Creada: <time :datetime="receta.creadaEn">{{ fecha }}</time></p>
      <p><span class="estado-receta" :class="receta.estado">{{ etiquetas[receta.estado] }}</span></p>
      <p v-if="receta.cambiosPendientes" class="mensaje-info">Modificaciones pendientes</p>
      <div v-if="receta.motivoRechazo" class="motivo-rechazo">
        <h3>{{ receta.estado === 'publicada' ? 'Motivo de rechazo de la última propuesta' : 'Motivo de rechazo' }}</h3>
        <p>{{ receta.motivoRechazo }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.mi-receta-card { overflow-wrap: anywhere; }
.estado-receta { display: inline-block; border-radius: 20px; padding: .2rem .8rem; font-weight: 600; }
.publicada { color: #365f40; background: #edf2e7; }
.pendiente { color: #785218; background: #fff0ce; }
.rechazada { color: #8b3525; background: #fff2e9; }
.motivo-rechazo { border-top: 1px solid #e1e6dc; padding-top: 1rem; }
.motivo-rechazo h3 { font-size: 1rem; margin-top: 0; }
.motivo-rechazo p { white-space: pre-wrap; margin-bottom: 0; }
</style>
