<script setup>
defineProps({
  busqueda: { type: String, required: true },
  categoria: { type: String, required: true },
  categorias: { type: Array, required: true },
  deshabilitado: { type: Boolean, default: false },
})
defineEmits(['update:busqueda', 'update:categoria'])
</script>

<template>
  <div class="filtros">
    <div class="campo">
      <label for="busqueda">Buscar por título</label>
      <input id="busqueda" type="search" :value="busqueda" placeholder="Por ejemplo, pasta"
        @input="$emit('update:busqueda', $event.target.value)">
    </div>
    <div class="campo">
      <label for="categoria">Categoría</label>
      <select id="categoria" :value="categoria" :disabled="deshabilitado"
        @change="$emit('update:categoria', $event.target.value)">
        <option value="">Todas las categorías</option>
        <option v-for="item in categorias" :key="item.id" :value="item.nombre">{{ item.nombre }}</option>
      </select>
    </div>
  </div>
</template>
