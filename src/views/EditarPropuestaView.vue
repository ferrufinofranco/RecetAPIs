<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { obtenerPropuestaPropia } from '@/services/recetas'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'

const props = defineProps({ versionId: { type: String, required: true } })
const auth = useAuthStore()
const propuesta = ref(null)
const cargando = ref(true)
const error = ref('')
const intento = ref(0)

watch([() => props.versionId, () => auth.user?.id, intento], async ([id, autorId], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  propuesta.value = null
  error.value = ''
  cargando.value = true
  try {
    if (!autorId) return
    const datos = await obtenerPropuestaPropia(id, autorId, controller.signal)
    if (!controller.signal.aborted && auth.user?.id === autorId) propuesta.value = datos
  } catch {
    if (!controller.signal.aborted) error.value = 'No pudimos cargar la propuesta. Revisá la conexión y tu sesión.'
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })
</script>

<template>
  <p v-if="cargando" role="status">Cargando tu propuesta…</p>
  <div v-else-if="error" class="mensaje-error" role="alert">
    <p>{{ error }}</p>
    <button type="button" @click="intento++">Reintentar</button>
  </div>
  <RecetaFormulario v-else-if="propuesta" :key="`${auth.user.id}-${propuesta.id}`" :propuesta="propuesta" />
  <section v-else class="estado-vacio">
    <h1>Propuesta no disponible</h1>
    <p>Solo podés editar tus propias versiones pendientes o rechazadas. Esta versión puede haber cambiado de estado.</p>
    <RouterLink :to="{ name: 'mis-recetas' }">Volver a Mis recetas</RouterLink>
  </section>
</template>
