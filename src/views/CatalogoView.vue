<script setup>
import { computed, onMounted, ref, useId } from 'vue'
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
const filtrosAbiertos = ref(false)
const filtrosId = useId()
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
    error.value = 'No pudimos cargar las recetas. Revisá tu conexión a internet y volvé a intentar.'
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
  <section class="catalogo" aria-labelledby="titulo-catalogo">
    <header class="introduccion">
      <p class="ceja">Ideas para tu próxima comida</p>
      <h1 id="titulo-catalogo">Algo rico empieza acá.</h1>
      <p>Explorá recetas sencillas y encontrá tu próxima favorita.</p>
    </header>
    <div class="catalogo-distribucion">
      <aside class="catalogo-lateral" aria-label="Filtros de recetas">
        <button type="button" class="catalogo-alternar boton-secundario" :aria-expanded="filtrosAbiertos"
          :aria-controls="filtrosId" @click="filtrosAbiertos = !filtrosAbiertos">Filtros</button>
        <!-- Se oculta con CSS, sin desmontar ni reiniciar las selecciones. En escritorio siempre es visible. -->
        <div :id="filtrosId" class="catalogo-panel-filtros" :class="{ 'esta-abierto': filtrosAbiertos }">
          <h2>Filtros</h2>
          <CatalogoFiltros v-model:busqueda="busqueda" v-model:categoria="categoria"
            :categorias="categorias" :deshabilitado="cargandoCategorias || !!errorCategorias || !categorias.length" />
          <p v-if="cargandoCategorias" role="status">Cargando categorías…</p>
          <div v-else-if="errorCategorias" class="mensaje-error" role="alert">
            <p>{{ errorCategorias }}</p>
            <button type="button" @click="cargarCategorias">Reintentar categorías</button>
          </div>
          <p v-else-if="!categorias.length" role="status">No hay categorías disponibles para filtrar.</p>
        </div>
      </aside>
      <div class="catalogo-resultados" role="region" aria-label="Resultados de recetas">
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
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Amplía solo esta vista, sin cambiar el contenedor compartido de otras pantallas. */
.catalogo { width: min(1280px, calc(100vw - 3rem)); margin-inline: calc((100% - min(1280px, 100vw - 3rem)) / 2); }
.catalogo-distribucion { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 1.5rem; align-items: start; }
.catalogo-lateral, .catalogo-resultados { min-width: 0; }
.catalogo-panel-filtros { padding: 1rem; border: 1px solid var(--borde); border-radius: 14px; background: var(--superficie-calida); overflow-wrap: anywhere; }
.catalogo-panel-filtros h2 { font-size: 1.1rem; margin-bottom: 1rem; }
.catalogo-panel-filtros > p, .catalogo-panel-filtros > .mensaje-error { margin: 1rem 0 0; font-size: .9rem; }
.catalogo-panel-filtros button { max-width: 100%; padding: .6rem .7rem; }
.catalogo-alternar { display: none; min-height: 44px; }
.catalogo .recuento { margin: 0 0 1rem; }
.catalogo .recetas-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
.catalogo :deep(.receta-card) { min-width: 0; overflow-wrap: anywhere; }
.catalogo :deep(.receta-link:focus-visible) { outline-offset: -4px; }
@media (max-width: 1199px) {
  .catalogo .recetas-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .catalogo-distribucion { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
  .catalogo-alternar { display: inline-flex; align-items: center; }
  .catalogo-panel-filtros { display: none; margin-top: .75rem; }
  .catalogo-panel-filtros.esta-abierto { display: block; }
}
@media (max-width: 600px) {
  .catalogo { width: calc(100vw - 2rem); margin-inline: calc((100% - (100vw - 2rem)) / 2); }
  .catalogo .recetas-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
