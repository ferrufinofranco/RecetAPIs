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

<style scoped>
.filtros { grid-template-columns: minmax(0, 1fr); gap: .85rem; padding: 0; }
.campo { min-width: 0; }
.campo label { font-size: .9rem; margin-bottom: .3rem; }
input, select { min-width: 0; padding: .6rem .7rem; }
</style>
