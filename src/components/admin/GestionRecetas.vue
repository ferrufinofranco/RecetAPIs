<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { useAuthStore } from '@/stores/auth'
import { obtenerRecetasAdministracion } from '@/services/recetas'
import { useEliminarReceta } from '@/composables/useEliminarReceta'
import EliminarRecetaBoton from '@/components/recetas/EliminarRecetaBoton.vue'

const emit = defineEmits(['eliminada'])
const auth = useAuthStore()
const recetas = ref([])
const cargando = ref(true)
const error = ref('')
const { eliminandoId, errorBaja, exitoBaja, eliminar } = useEliminarReceta({ administrativo: true })
const estados = { publicada: 'Publicada', pendiente: 'Pendiente', rechazada: 'Rechazada', anterior: 'Anterior', descartada: 'Descartada', sin_version: 'Sin versión visible' }
let controller

async function cargar() {
  controller?.abort()
  const actual = new AbortController()
  controller = actual
  cargando.value = true
  error.value = ''
  try {
    const datos = await obtenerRecetasAdministracion(actual.signal)
    if (!actual.signal.aborted) recetas.value = datos
  } catch {
    if (!actual.signal.aborted) error.value = 'No pudimos actualizar la gestión de recetas. Reintentá el listado antes de realizar otra operación.'
  } finally {
    if (!actual.signal.aborted) cargando.value = false
  }
}

function solicitarBaja(receta) {
  return eliminar(receta, async () => {
    recetas.value = recetas.value.filter((item) => item.id !== receta.id)
    emit('eliminada')
    await cargar()
  })
}

useListadoAdministracion(cargar, () => cargando.value || eliminandoId.value !== null)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="gestion-recetas" aria-labelledby="titulo-gestion-recetas">
    <h2 id="titulo-gestion-recetas">Gestión de recetas</h2>
    <p>Recetas no eliminadas de todos los autores, independientemente de su estado.</p>
    <button type="button" class="boton-secundario" :disabled="cargando || eliminandoId !== null" @click="cargar">Actualizar recetas</button>
    <p v-if="exitoBaja" class="mensaje-info" role="status">{{ exitoBaja }}</p>
    <p v-if="errorBaja" class="mensaje-error" role="alert">{{ errorBaja }}</p>
    <p v-if="cargando" role="status">Cargando recetas…</p>
    <div v-else-if="error" class="mensaje-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="cargar">Reintentar listado</button>
    </div>
    <p v-else-if="!recetas.length" class="estado-vacio">No hay recetas disponibles para gestionar.</p>
    <ul v-else class="gestion-lista">
      <li v-for="receta in recetas" :key="receta.id">
        <div>
          <h3>{{ receta.titulo }}</h3>
          <p>Autor: {{ receta.autorId }}</p>
          <p>Estado: {{ estados[receta.estado] || receta.estado }}</p>
          <p v-if="receta.cambiosPendientes">Modificaciones pendientes</p>
        </div>
        <EliminarRecetaBoton :titulo="receta.titulo" :deshabilitado="eliminandoId !== null || !auth.esAdmin"
          :eliminando="eliminandoId === receta.id" @eliminar="solicitarBaja(receta)" />
        <RouterLink v-if="auth.esAdmin && receta.estado === 'publicada' && !receta.cambiosPendientes && eliminandoId === null"
          :to="{ name: 'admin-editar-receta', params: { recetaId: receta.id } }">Editar directamente</RouterLink>
        <p v-if="receta.estado === 'publicada' && receta.cambiosPendientes">Resolvé primero la propuesta pendiente.</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gestion-recetas { margin-block: 2rem; }
.gestion-recetas > button { margin-bottom: 1rem; }
.gestion-lista { list-style: none; padding: 0; }
.gestion-lista li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding: 1rem; border-bottom: 1px solid #e1e6dc; }
.gestion-lista li > div { min-width: 0; overflow-wrap: anywhere; }
.gestion-lista h3 { margin-top: 0; }
.gestion-lista p { margin-bottom: .5rem; }
</style>
