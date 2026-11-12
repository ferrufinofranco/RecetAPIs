<script setup>
import { computed, onBeforeUnmount, provide, ref, unref, watch } from 'vue'
import { avisoCambiosSinGuardar, cambiosSinGuardarKey } from '@/composables/useCambiosSinGuardar'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AvisosPwa from '@/components/AvisosPwa.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const cerrando = ref(false)
const pendientes = new Set()
const hayCambiosSinGuardar = () => [...pendientes].some(unref)
provide(cambiosSinGuardarKey, { pendientes, descartando: cerrando })
function confirmarCambios() {
  return ![...pendientes].some(unref) || window.confirm(avisoCambiosSinGuardar)
}
// Un único aviso, aunque haya borradores en varias pestañas conservadas.
const quitarGuardCambios = router.beforeEach((to, from) => to.path === from.path || cerrando.value || confirmarCambios())
onBeforeUnmount(quitarGuardCambios)
const seccionActiva = computed(() => {
  if (String(route.name).startsWith('admin')) return 'admin'
  if (['mis-recetas', 'editar-propuesta', 'editar-publicada'].includes(route.name)) return 'mis-recetas'
  if (route.name === 'receta') return 'catalogo'
  return route.name
})
function enlaceActivo(nombre) {
  return { class: { 'seccion-activa': seccionActiva.value === nombre },
    'aria-current': seccionActiva.value === nombre ? (route.name === nombre ? 'page' : 'location') : undefined }
}
const error = ref('')
const menuAbierto = ref(false)
const botonMenu = ref(null)
watch(() => route.fullPath, () => { menuAbierto.value = false })

function cerrarMenu() {
  if (!menuAbierto.value) return
  menuAbierto.value = false
  botonMenu.value?.focus()
}

watch(() => auth.autenticado, (autenticado) => {
  if (auth.inicializado && !autenticado && route.meta.requiereAuth) {
    router.replace({ name: 'login' })
  }
})

async function salir() {
  if (!confirmarCambios()) return
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
    <nav class="contenedor" aria-label="Navegación principal" @keydown.esc="cerrarMenu">
      <RouterLink to="/" class="marca">Recet<span>APIs</span></RouterLink>
      <button ref="botonMenu" type="button" class="nav-toggle" :aria-expanded="menuAbierto"
        aria-controls="nav-enlaces" @click="menuAbierto = !menuAbierto">{{ menuAbierto ? 'Cerrar menú' : 'Abrir menú' }}</button>
      <div id="nav-enlaces" class="nav-enlaces" :class="{ 'nav-enlaces--abiertos': menuAbierto }">
        <RouterLink to="/" v-bind="enlaceActivo('catalogo')">Catálogo</RouterLink>
        <template v-if="auth.inicializado">
          <template v-if="auth.autenticado">
            <RouterLink :to="{ name: 'crear-receta' }" v-bind="enlaceActivo('crear-receta')">Crear receta</RouterLink>
            <RouterLink :to="{ name: 'mis-recetas' }" v-bind="enlaceActivo('mis-recetas')">Mis recetas</RouterLink>
            <RouterLink v-if="auth.esAdmin" :to="{ name: 'admin' }" v-bind="enlaceActivo('admin')">Administración</RouterLink>
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
    <AvisosPwa :hay-cambios-sin-guardar="hayCambiosSinGuardar" />
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="auth.errorPerfil && route.name !== 'acceso-denegado'" class="mensaje-error" role="alert">{{ auth.errorPerfil }}</p>
    <RouterView />
  </main>
  <footer class="sitio-footer">RecetAPIs · Recetas para compartir</footer>
</template>
