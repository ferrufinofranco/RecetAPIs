<script setup>
import { computed, onMounted, ref } from 'vue'
import CatalogoFiltros from '@/components/CatalogoFiltros.vue'
import RecetaCard from '@/components/RecetaCard.vue'
import { obtenerRecetas } from '@/services/recetas'
import { obtenerCategorias } from '@/services/categorias'
import { filtrarRecetas } from '@/utils/catalogo'

const busqueda = ref('')
const categoria = ref('')
const categorias = ref([])
const recetas = ref([])
const cargando = ref(true)
const error = ref('')
const cargandoCategorias = ref(true)
const errorCategorias = ref('')
const resultados = computed(() => filtrarRecetas(recetas.value, busqueda.value, categoria.value))

async function cargarCategorias() {
  cargandoCategorias.value = true
  errorCategorias.value = ''
  try {
    categorias.value = await obtenerCategorias()
  } catch {
    errorCategorias.value = 'No pudimos cargar las categorías. Podés seguir buscando por título.'
  } finally {
    cargandoCategorias.value = false
  }
}

async function cargarRecetas() {
  cargando.value = true
  error.value = ''
  try {
    recetas.value = await obtenerRecetas()
  } catch {
    error.value = 'No pudimos cargar las recetas. Revisá la conexión y la configuración de Supabase.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  cargarCategorias()
  cargarRecetas()
})
</script>

<template>
  <section aria-labelledby="titulo-catalogo">
    <header class="introduccion">
      <p class="ceja">Ideas para tu próxima comida</p>
      <h1 id="titulo-catalogo">Algo rico empieza acá.</h1>
      <p>Explorá recetas sencillas y encontrá tu próxima favorita.</p>
    </header>
    <CatalogoFiltros v-model:busqueda="busqueda" v-model:categoria="categoria"
      :categorias="categorias" :deshabilitado="cargandoCategorias || !!errorCategorias || !categorias.length" />
    <p v-if="cargandoCategorias" role="status">Cargando categorías…</p>
    <div v-else-if="errorCategorias" class="mensaje-error" role="alert">
      <p>{{ errorCategorias }}</p>
      <button type="button" @click="cargarCategorias">Reintentar categorías</button>
    </div>
    <p v-else-if="!categorias.length" role="status">No hay categorías disponibles para filtrar.</p>
    <p v-if="cargando" role="status">Cargando recetas…</p>
    <div v-else-if="error" class="mensaje-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="cargarRecetas">Reintentar recetas</button>
    </div>
    <div v-else-if="!recetas.length" class="estado-vacio">
      <h2>Todavía no hay recetas publicadas</h2>
      <p>Las recetas disponibles aparecerán aquí.</p>
    </div>
    <template v-else>
      <p class="recuento" role="status">{{ resultados.length }} recetas encontradas</p>
      <div v-if="resultados.length" class="recetas-grid">
        <RecetaCard v-for="receta in resultados" :key="receta.id" :receta="receta" />
      </div>
      <div v-else class="estado-vacio">
        <h2>No encontramos recetas</h2>
        <p>Probá con otro título o seleccioná otra categoría.</p>
        <button type="button" @click="busqueda = ''; categoria = ''">Limpiar filtros</button>
      </div>
    </template>
  </section>
</template>
