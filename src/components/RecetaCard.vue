<script setup>
import CategoriaEtiquetas from './CategoriaEtiquetas.vue'
import RecetaImagen from './RecetaImagen.vue'

defineProps({ receta: { type: Object, required: true } })
</script>

<template>
  <article class="receta-card">
    <RouterLink :to="{ name: 'receta', params: { id: receta.id } }" class="receta-link">
      <RecetaImagen :src="receta.imagen" :alt="receta.titulo" />
      <div class="card-contenido">
        <p class="dato">{{ receta.tiempoMinutos }} min · {{ receta.dificultad }}</p>
        <h2>{{ receta.titulo }}</h2>
        <CategoriaEtiquetas :categorias="receta.categorias" />
        <span class="ver-receta">Ver receta →</span>
      </div>
    </RouterLink>
  </article>
</template>
