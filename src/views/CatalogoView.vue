<script setup>
import { computed, onMounted, ref } from 'vue'
import CatalogoFiltros from '@/components/CatalogoFiltros.vue'
import RecetaCard from '@/components/RecetaCard.vue'
import { recetas } from '@/data/recetas'
import { obtenerCategorias } from '@/services/categorias'
import { filtrarRecetas } from '@/utils/catalogo'

const busqueda = ref('')
const categoria = ref('')
const categorias = ref([])
const cargando = ref(true)
const error = ref('')
const resultados = computed(() => filtrarRecetas(recetas, busqueda.value, categoria.value))

async function cargarCategorias() {
  cargando.value = true
  error.value = ''
  try {
    categorias.value = await obtenerCategorias()
  } catch {
    error.value = 'No pudimos cargar las categorías de Supabase. Podés seguir buscando por título.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargarCategorias)
</script>

<template>
  <section aria-labelledby="titulo-catalogo">
    <header class="introduccion">
      <p class="ceja">Ideas para tu próxima comida</p>
      <h1 id="titulo-catalogo">Algo rico empieza acá.</h1>
      <p>Explorá recetas sencillas y encontrá tu próxima favorita.</p>
    </header>
    <p class="aviso-demo">Catálogo de demostración: recetas simuladas · Filtro con categorías de Supabase.</p>
    <CatalogoFiltros v-model:busqueda="busqueda" v-model:categoria="categoria"
      :categorias="categorias" :deshabilitado="cargando || !!error || !categorias.length" />
    <p v-if="cargando" role="status">Cargando categorías…</p>
    <div v-else-if="error" class="mensaje-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="cargarCategorias">Reintentar</button>
    </div>
    <p v-else-if="!categorias.length" role="status">No hay categorías disponibles para filtrar.</p>
    <p class="recuento" role="status">{{ resultados.length }} recetas encontradas</p>
    <div v-if="resultados.length" class="recetas-grid">
      <RecetaCard v-for="receta in resultados" :key="receta.id" :receta="receta" />
    </div>
    <div v-else class="estado-vacio">
      <h2>No encontramos recetas</h2>
      <p>Probá con otro título o seleccioná otra categoría.</p>
      <button type="button" @click="busqueda = ''; categoria = ''">Limpiar filtros</button>
    </div>
  </section>
</template>
