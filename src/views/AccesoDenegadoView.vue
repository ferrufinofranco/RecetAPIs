<script setup>
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <section class="estado-vacio">
    <h1>Acceso denegado</h1>
    <p>No tenés permisos para acceder a esta página.</p>
    <p v-if="auth.errorPerfil" role="alert">{{ auth.errorPerfil }}</p>
    <RouterLink :to="{ name: 'catalogo' }">Volver al catálogo público</RouterLink>
  </section>
</template>
