<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { obtenerMisRecetas } from '@/services/recetas'
import { filtrarMisRecetas } from '@/utils/misRecetas'
import MiRecetaCard from '@/components/recetas/MiRecetaCard.vue'
import { useEliminarReceta } from '@/composables/useEliminarReceta'

const auth = useAuthStore()
const route = useRoute()
const recetas = ref([])
const estado = ref('todas')
const cargando = ref(true)
const error = ref('')
const intento = ref(0)
const resultados = computed(() => filtrarMisRecetas(recetas.value, estado.value))
const { eliminandoId, errorBaja, exitoBaja, eliminar } = useEliminarReceta()

function solicitarBaja(receta) {
  return eliminar(receta, () => {
    recetas.value = recetas.value.filter((item) => item.id !== receta.id)
    intento.value++
  })
}

watch([() => auth.user?.id, intento], async ([id], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  recetas.value = []
  cargando.value = true
  error.value = ''
  try {
    if (!id) return
    const datos = await obtenerMisRecetas(id, controller.signal)
    if (!controller.signal.aborted && auth.user?.id === id) recetas.value = datos
  } catch {
    if (!controller.signal.aborted) {
      error.value = 'No pudimos cargar tus recetas. Revisá la conexión y tu sesión e intentá nuevamente.'
    }
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })
</script>

<template>
  <section aria-labelledby="titulo-mis-recetas">
    <h1 id="titulo-mis-recetas">Mis recetas</h1>
    <p v-if="exitoBaja" class="mensaje-info" role="status">{{ exitoBaja }}</p>
    <p v-if="errorBaja" class="mensaje-error" role="alert">{{ errorBaja }}</p>
    <p v-if="route.query.propuesta === 'enviada'" class="mensaje-info" role="status">Propuesta de edición enviada para aprobación. La versión publicada sigue visible en el catálogo.</p>
    <p>Consultá tus recetas y el estado de sus propuestas.</p>
    <div class="campo filtro-mis-recetas">
      <label for="estado-mis-recetas">Estado</label>
      <select id="estado-mis-recetas" v-model="estado">
        <option value="todas">Todas</option>
        <option value="pendiente">Pendientes</option>
        <option value="publicada">Publicadas</option>
        <option value="rechazada">Rechazadas</option>
      </select>
    </div>
    <p v-if="cargando" role="status">Cargando tus recetas…</p>
    <div v-else-if="error" class="mensaje-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="intento++">Reintentar</button>
    </div>
    <div v-else-if="!recetas.length" class="estado-vacio">
      <h2>Todavía no tenés recetas</h2>
      <RouterLink :to="{ name: 'crear-receta' }">Crear receta</RouterLink>
    </div>
    <template v-else>
      <p class="recuento" role="status">{{ resultados.length }} recetas encontradas</p>
      <div v-if="resultados.length" class="recetas-grid">
        <MiRecetaCard v-for="receta in resultados" :key="receta.id" :receta="receta"
          :bloqueada="eliminandoId !== null" :eliminando="eliminandoId === receta.id" @eliminar="solicitarBaja" />
      </div>
      <p v-else class="estado-vacio">No tenés recetas con este estado.</p>
    </template>
  </section>
</template>

<style scoped>
.filtro-mis-recetas { max-width: 320px; margin-bottom: 1.5rem; }
</style>
