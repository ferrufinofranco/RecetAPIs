<script setup>
defineProps({ categorias: { type: Array, required: true } })
</script>

<template>
  <ul class="etiquetas" aria-label="Categorías">
    <li v-for="categoria in categorias" :key="categoria">{{ categoria }}</li>
  </ul>
</template>
