<script setup>
import CategoriaEtiquetas from '@/components/CategoriaEtiquetas.vue'
import RecetaImagen from '@/components/RecetaImagen.vue'

defineProps({ propuesta: { type: Object, required: true } })
</script>

<template>
  <article class="detalle propuesta-detalle">
    <div class="detalle-cabecera">
      <RecetaImagen :src="propuesta.imagen" :alt="propuesta.titulo" />
      <header>
        <p class="ceja">Propuesta pendiente · Versión {{ propuesta.numero }}</p>
        <h3>{{ propuesta.titulo }}</h3>
        <CategoriaEtiquetas :categorias="propuesta.categorias" />
        <p class="descripcion">{{ propuesta.descripcion || 'Sin descripción.' }}</p>
        <dl class="datos-receta">
          <div><dt>Porciones</dt><dd>{{ propuesta.porciones }}</dd></div>
          <div><dt>Tiempo</dt><dd>{{ propuesta.tiempoMinutos == null ? 'Sin especificar' : `${propuesta.tiempoMinutos} min` }}</dd></div>
          <div><dt>Dificultad</dt><dd>{{ propuesta.dificultad || 'Sin especificar' }}</dd></div>
        </dl>
      </header>
    </div>
    <div class="detalle-cuerpo">
      <section class="ingredientes" aria-labelledby="ingredientes-propuesta">
        <h4 id="ingredientes-propuesta">Ingredientes</h4>
        <ul>
          <li v-for="ingrediente in propuesta.ingredientes" :key="ingrediente.id">
            <strong>{{ ingrediente.cantidad }} {{ ingrediente.unidad }}</strong> de {{ ingrediente.nombre }}
          </li>
        </ul>
        <p v-if="!propuesta.ingredientes.length">No hay ingredientes visibles.</p>
      </section>
      <section class="preparacion" aria-labelledby="pasos-propuesta">
        <h4 id="pasos-propuesta">Preparación</h4>
        <ol><li v-for="paso in propuesta.pasos" :key="paso.orden">{{ paso.descripcion }}</li></ol>
        <p v-if="!propuesta.pasos.length">No hay pasos visibles.</p>
      </section>
    </div>
  </article>
</template>

<style scoped>
h3 { font-size: 1.8rem; line-height: 1.25; margin-top: 0; }
h4 { font-size: 1.2rem; margin-top: 0; }
.propuesta-detalle { overflow-wrap: anywhere; }
.descripcion, .preparacion li { white-space: pre-wrap; }
</style>
