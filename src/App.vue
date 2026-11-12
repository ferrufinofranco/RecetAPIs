<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const cerrando = ref(false)
const error = ref('')

watch(() => auth.autenticado, (autenticado) => {
  if (auth.inicializado && !autenticado && route.meta.requiereAuth) {
    router.replace({ name: 'login' })
  }
})

async function salir() {
  cerrando.value = true
  error.value = ''
  try {
    await auth.cerrarSesion()
    await router.replace({ name: 'catalogo' })
  } catch {
    error.value = 'No se pudo cerrar la sesión. Volvé a intentar.'
  } finally {
    cerrando.value = false
  }
}
</script>

<template>
  <header class="sitio-header">
    <nav class="contenedor" aria-label="Navegación principal">
      <RouterLink to="/" class="marca">Recet<span>APIs</span></RouterLink>
      <div class="nav-enlaces">
        <RouterLink to="/">Catálogo</RouterLink>
        <template v-if="auth.inicializado">
          <template v-if="auth.autenticado">
            <RouterLink :to="{ name: 'crear-receta' }">Crear receta</RouterLink>
            <RouterLink :to="{ name: 'mis-recetas' }">Mis recetas</RouterLink>
            <RouterLink v-if="auth.esAdmin" :to="{ name: 'admin' }">Administración</RouterLink>
            <span class="dato">{{ auth.perfil?.nombre || auth.user.email }}</span>
            <button type="button" :disabled="cerrando" @click="salir">
              {{ cerrando ? 'Cerrando…' : 'Cerrar sesión' }}
            </button>
          </template>
          <template v-else>
            <RouterLink :to="{ name: 'login' }">Login</RouterLink>
            <RouterLink :to="{ name: 'registro' }">Registro</RouterLink>
          </template>
        </template>
      </div>
    </nav>
  </header>
  <main class="contenedor contenido">
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="auth.errorPerfil && route.name !== 'acceso-denegado'" class="mensaje-error" role="alert">{{ auth.errorPerfil }}</p>
    <RouterView />
  </main>
  <footer class="sitio-footer">RecetAPIs · Recetas para compartir</footer>
</template>
