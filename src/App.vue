<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { obtenerCategorias, type Categoria } from '@/services/categorias'

const categorias = ref<Categoria[]>([])
const cargando = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    categorias.value = await obtenerCategorias()
  } catch {
    error.value = 'No se pudieron cargar las categorías. Revisá la conexión y la configuración de Supabase.'
  } finally {
    cargando.value = false
  }
})
</script>

<template>
  <main>
    <h1>Categorías</h1>
    <p v-if="cargando" role="status">Cargando categorías…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <ul v-else-if="categorias.length">
      <li v-for="categoria in categorias" :key="categoria.id">{{ categoria.nombre }}</li>
    </ul>
    <p v-else>No hay categorías disponibles.</p>
  </main>
</template>

<style scoped></style>
