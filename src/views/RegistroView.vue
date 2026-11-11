<script setup>
import AuthFormulario from '@/components/AuthFormulario.vue'
</script>

<template>
  <section class="auth-panel">
    <h1>Crear cuenta</h1>
    <p>Registrate con tu nombre, email y contraseña.</p>
    <AuthFormulario registro />
    <p>¿Ya tenés cuenta? <RouterLink :to="{ name: 'login' }">Iniciá sesión</RouterLink></p>
  </section>
</template>
