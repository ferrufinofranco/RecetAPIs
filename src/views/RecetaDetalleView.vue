<script setup>
import { computed, ref, watch } from 'vue'
import CategoriaEtiquetas from '@/components/CategoriaEtiquetas.vue'
import RecetaImagen from '@/components/RecetaImagen.vue'
import { obtenerReceta } from '@/services/recetas'
import NoEncontradaView from './NoEncontradaView.vue'

const props = defineProps({ id: { type: String, required: true } })
const receta = ref(null)
const cargando = ref(true)
const error = ref('')
const intento = ref(0)
const pasos = computed(() => [...(receta.value?.pasos ?? [])].sort((a, b) => a.orden - b.orden))

watch([() => props.id, intento], async ([id], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  cargando.value = true
  error.value = ''
  receta.value = null
  try {
    const resultado = await obtenerReceta(id, controller.signal)
    if (!controller.signal.aborted) receta.value = resultado
  } catch {
    if (!controller.signal.aborted) {
      error.value = 'No pudimos cargar la receta. Revisá la conexión y volvé a intentar.'
    }
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })
</script>

<template>
  <p v-if="cargando" role="status">Cargando receta…</p>
  <div v-else-if="error" class="mensaje-error" role="alert">
    <p>{{ error }}</p>
    <button type="button" @click="intento++">Reintentar</button>
    <RouterLink :to="{ name: 'catalogo' }" class="volver">Volver al catálogo</RouterLink>
  </div>
  <article v-else-if="receta" class="detalle">
    <RouterLink :to="{ name: 'catalogo' }" class="volver">← Volver al catálogo</RouterLink>
    <div class="detalle-cabecera">
      <RecetaImagen :src="receta.imagen" :alt="receta.titulo" />
      <header>
        <p class="ceja">Receta publicada</p>
        <h1>{{ receta.titulo }}</h1>
        <CategoriaEtiquetas :categorias="receta.categorias" />
        <p class="descripcion">{{ receta.descripcion }}</p>
        <dl class="datos-receta">
          <div><dt>Porciones</dt><dd>{{ receta.porciones }}</dd></div>
          <div><dt>Tiempo total</dt><dd>{{ receta.tiempoMinutos }} min</dd></div>
          <div><dt>Dificultad</dt><dd>{{ receta.dificultad }}</dd></div>
        </dl>
      </header>
    </div>
    <div class="detalle-cuerpo">
      <section class="ingredientes" aria-labelledby="ingredientes">
        <h2 id="ingredientes">Ingredientes</h2>
        <ul>
          <li v-for="ingrediente in receta.ingredientes" :key="ingrediente.id">
            <strong>{{ ingrediente.cantidad }} {{ ingrediente.unidad }}</strong> de {{ ingrediente.nombre }}
          </li>
        </ul>
      </section>
      <section class="preparacion" aria-labelledby="preparacion">
        <h2 id="preparacion">Paso a paso</h2>
        <ol><li v-for="paso in pasos" :key="paso.orden">{{ paso.descripcion }}</li></ol>
      </section>
    </div>
  </article>
  <NoEncontradaView v-else />
</template>
