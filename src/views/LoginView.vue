<script setup>
import AuthFormulario from '@/components/AuthFormulario.vue'
</script>

<template>
  <section class="auth-panel">
    <h1>Iniciar sesión</h1>
    <AuthFormulario />
    <p>¿No tenés cuenta? <RouterLink :to="{ name: 'registro' }">Registrate</RouterLink></p>
  </section>
</template>
