<script setup>
import GestionCategorias from '@/components/admin/GestionCategorias.vue'
</script>

<template>
  <section>
    <p class="ceja">Solo administradores</p>
    <h1>Administración</h1>
    <GestionCategorias />
    <RouterLink :to="{ name: 'catalogo' }">Volver al catálogo</RouterLink>
  </section>
</template>
