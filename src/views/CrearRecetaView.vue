<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { obtenerIngredientes } from '@/services/ingredientes'
import { obtenerCategorias } from '@/services/categorias'
import { crearReceta } from '@/services/recetas'
import { ErrorCrearReceta, mensajeErrorCrearReceta, prepararDatosReceta } from '@/utils/crearReceta'
import IngredientesEditor from '@/components/recetas/IngredientesEditor.vue'
import PasosEditor from '@/components/recetas/PasosEditor.vue'

const auth = useAuthStore()
const formulario = reactive({
  titulo: '', descripcion: '', porciones: '', tiempo_minutos: '', dificultad: '',
  ingredientes: [], categorias: [], pasos: [],
})
const ingredientes = ref([])
const categorias = ref([])
const cargando = ref(true)
const errorCarga = ref('')
const error = ref('')
const guardando = ref(false)
const guardada = ref(false)

async function cargarOpciones() {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [listaIngredientes, listaCategorias] = await Promise.all([obtenerIngredientes(), obtenerCategorias()])
    // Solo esta vista restringe nuevas incorporaciones a ingredientes activos.
    ingredientes.value = listaIngredientes.filter((item) => item.activo)
    categorias.value = listaCategorias
  } catch {
    errorCarga.value = 'No pudimos cargar los ingredientes y categorías. Reintentá antes de crear la receta.'
  } finally {
    cargando.value = false
  }
}

async function guardar() {
  if (guardando.value || guardada.value || cargando.value || errorCarga.value) return
  error.value = ''
  if (!auth.autenticado) {
    error.value = 'Iniciá sesión para crear una receta.'
    return
  }
  guardando.value = true
  try {
    const datos = prepararDatosReceta({ ...formulario, pasos: formulario.pasos.map((paso) => paso.texto) })
    if (datos.ingredientes.some((item) => !ingredientes.value.some((opcion) => String(opcion.id) === String(item.ingrediente_id)))) {
      throw new ErrorCrearReceta('Seleccioná ingredientes activos del listado.')
    }
    if (datos.categorias.some((id) => !categorias.value.some((opcion) => String(opcion.id) === String(id)))) {
      throw new ErrorCrearReceta('Seleccioná categorías activas del listado.')
    }
    await crearReceta(datos)
    guardada.value = true
  } catch (err) {
    error.value = mensajeErrorCrearReceta(err)
  } finally {
    guardando.value = false
  }
}

onMounted(cargarOpciones)
</script>

<template>
  <section class="crear-receta" aria-labelledby="titulo-crear">
    <h1 id="titulo-crear">Crear receta</h1>
    <p>Compartí tu receta. Quedará pendiente de aprobación antes de aparecer en el catálogo.</p>
    <div v-if="guardada" class="mensaje-info" role="status">
      <p>Tu receta se guardó correctamente y está pendiente de aprobación.</p>
      <RouterLink :to="{ name: 'catalogo' }">Volver al catálogo</RouterLink>
    </div>
    <template v-else>
      <p v-if="cargando" role="status">Cargando ingredientes y categorías…</p>
      <div v-else-if="errorCarga" class="mensaje-error" role="alert">
        <p>{{ errorCarga }}</p>
        <button type="button" @click="cargarOpciones">Reintentar</button>
      </div>
      <p v-else-if="!ingredientes.length || !categorias.length" role="status">
        Se necesita al menos un ingrediente activo y una categoría activa para crear una receta.
      </p>
      <form :aria-busy="guardando" @submit.prevent="guardar">
        <fieldset :disabled="guardando || cargando || !!errorCarga || !auth.autenticado || !ingredientes.length || !categorias.length">
          <legend class="sr-only">Datos de la nueva receta</legend>
          <div class="campo">
            <label for="titulo-receta">Título *</label>
            <input id="titulo-receta" v-model="formulario.titulo" required>
          </div>
          <IngredientesEditor v-model="formulario.ingredientes" :disponibles="ingredientes" />
          <section aria-labelledby="datos-generales">
            <h2 id="datos-generales">Datos generales</h2>
            <label for="descripcion-receta">Descripción (opcional)</label>
            <textarea id="descripcion-receta" v-model="formulario.descripcion" rows="3" />
            <div class="filtros">
              <div class="campo">
                <label for="porciones-receta">Porciones *</label>
                <input id="porciones-receta" v-model="formulario.porciones" type="number" min="1" step="1" required>
              </div>
              <div class="campo">
                <label for="tiempo-receta">Tiempo en minutos (opcional)</label>
                <input id="tiempo-receta" v-model="formulario.tiempo_minutos" type="number" min="1" step="1">
              </div>
              <div class="campo">
                <label for="dificultad-receta">Dificultad (opcional)</label>
                <select id="dificultad-receta" v-model="formulario.dificultad">
                  <option value="">Sin especificar</option>
                  <option value="facil">Fácil</option>
                  <option value="media">Media</option>
                  <option value="dificil">Difícil</option>
                </select>
              </div>
            </div>
          </section>
          <section aria-labelledby="categorias-receta">
            <h2 id="categorias-receta">Categorías</h2>
            <p>Seleccioná al menos una categoría.</p>
            <div class="categorias-seleccion">
              <label v-for="categoria in categorias" :key="categoria.id">
                <input v-model="formulario.categorias" type="checkbox" :value="categoria.id">
                {{ categoria.nombre }}
              </label>
            </div>
          </section>
          <PasosEditor v-model="formulario.pasos" />
          <button type="submit">{{ guardando ? 'Guardando…' : 'Enviar receta para aprobación' }}</button>
        </fieldset>
        <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      </form>
    </template>
  </section>
</template>

<style>
.crear-receta { max-width: 850px; margin-inline: auto; }
.crear-receta fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.crear-receta section { margin-block: 2rem; padding-top: 1.5rem; border-top: 1px solid #e1e6dc; }
.crear-receta textarea { display: block; width: 100%; resize: vertical; font: inherit; color: inherit; background: white; border: 1px solid #b9c5b7; border-radius: 10px; padding: .75rem 1rem; margin-block: .4rem 1rem; }
.crear-receta .lista-editor { list-style: none; padding: 0; }
.crear-receta .lista-editor li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #e1e6dc; }
.crear-receta .lista-editor span { overflow-wrap: anywhere; min-width: 0; }
.crear-receta .acciones-editor { display: flex; gap: .5rem; flex-wrap: wrap; }
.crear-receta .pasos-editor { padding-left: 1.5rem; }
.crear-receta .pasos-editor li { margin-block: 1.5rem; }
.crear-receta .categorias-seleccion { display: flex; gap: 1rem; flex-wrap: wrap; }
.crear-receta .categorias-seleccion label { display: flex; align-items: center; gap: .5rem; }
.crear-receta input[type="checkbox"] { width: auto; }
.crear-receta .mensaje-error { margin-top: 1rem; }
.crear-receta .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); }
</style>
