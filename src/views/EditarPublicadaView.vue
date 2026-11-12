<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { obtenerEdicionPublicada } from '@/services/recetas'
import RecetaFormulario from '@/components/recetas/RecetaFormulario.vue'

const props = defineProps({ recetaId: { type: String, required: true }, administrativa: { type: Boolean, default: false } })
const router = useRouter()
const auth = useAuthStore()
const publicada = ref(null)
const cargando = ref(true)
const error = ref('')
const intento = ref(0)
const bloqueada = ref(false)

watch([() => props.recetaId, () => auth.user?.id, intento], async ([id, autorId], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  publicada.value = null
  bloqueada.value = false
  cargando.value = true
  error.value = ''
  try {
    if (!autorId) return
    const datos = await obtenerEdicionPublicada(id, autorId, controller.signal, { administrativa: props.administrativa })
    if (controller.signal.aborted || auth.user?.id !== autorId || !datos) return
    if (datos.pendienteId != null) {
      if (props.administrativa) bloqueada.value = true
      else await router.replace({ name: 'editar-propuesta', params: { versionId: datos.pendienteId } })
    } else {
      publicada.value = datos.publicada
    }
  } catch {
    if (!controller.signal.aborted) error.value = 'No pudimos cargar la receta publicada. Revisá la conexión y tu sesión.'
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })

function volver() {
  router.replace(props.administrativa ? { name: 'admin', query: { receta: 'actualizada' } } : { name: 'mis-recetas', query: { propuesta: 'enviada' } })
}
</script>

<template>
  <p v-if="cargando" role="status">Cargando tu receta publicada…</p>
  <div v-else-if="error" class="mensaje-error" role="alert">
    <p>{{ error }}</p>
    <button type="button" @click="intento++">Reintentar</button>
  </div>
  <section v-else-if="bloqueada" class="mensaje-info">
    <h1>Resolvé primero la propuesta pendiente</h1>
    <p>No se puede iniciar una edición administrativa mientras exista una propuesta pendiente.</p>
    <RouterLink :to="{ name: 'admin' }">Volver a moderación</RouterLink>
  </section>
  <RecetaFormulario v-else-if="publicada" :key="`${auth.user.id}-${publicada.id}`"
    :propuesta="publicada" publicada :administrativa="administrativa" @guardada="volver" />
  <section v-else class="estado-vacio">
    <h1>Receta no disponible para edición</h1>
    <p>{{ administrativa ? 'La receta debe tener una versión publicada y no estar eliminada.' : 'Solo podés proponer cambios sobre tus propias recetas publicadas y no eliminadas.' }}</p>
    <RouterLink :to="{ name: 'mis-recetas' }">Volver a Mis recetas</RouterLink>
  </section>
</template>
