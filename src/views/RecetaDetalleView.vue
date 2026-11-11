<script setup>
import { computed } from 'vue'
import CategoriaEtiquetas from '@/components/CategoriaEtiquetas.vue'
import RecetaImagen from '@/components/RecetaImagen.vue'
import { recetas } from '@/data/recetas'
import NoEncontradaView from './NoEncontradaView.vue'

const props = defineProps({ id: { type: String, required: true } })
const receta = computed(() => recetas.find((item) => item.id === props.id))
const pasos = computed(() => [...(receta.value?.pasos ?? [])].sort((a, b) => a.orden - b.orden))
</script>

<template>
  <article v-if="receta" class="detalle">
    <RouterLink :to="{ name: 'catalogo' }" class="volver">← Volver al catálogo</RouterLink>
    <div class="detalle-cabecera">
      <RecetaImagen :src="receta.imagen" :alt="receta.titulo" />
      <header>
        <p class="ceja">Receta de demostración</p>
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
          <li v-for="ingrediente in receta.ingredientes" :key="ingrediente.nombre">
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
