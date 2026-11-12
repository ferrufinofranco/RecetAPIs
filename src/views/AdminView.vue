<script setup>
import { defineAsyncComponent, h, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminPestanas from '@/components/admin/AdminPestanas.vue'

const route = useRoute()
const principal = ref('recetas')
const recetas = ref('pendientes')
const cargarModulo = (loader) => defineAsyncComponent({
  loader,
  delay: 0,
  loadingComponent: { render: () => h('p', { role: 'status' }, 'Cargando módulo…') },
  errorComponent: { render: () => h('p', { role: 'alert', class: 'mensaje-error' }, 'No pudimos cargar este módulo. Recargá la página para reintentar.') },
})
const modulos = [
  { id: 'recetas', nombre: 'Recetas' },
  { id: 'solicitudes', nombre: 'Solicitudes', componente: cargarModulo(() => import('@/components/ingredientes/SolicitudesIngredientes.vue')) },
  { id: 'ingredientes', nombre: 'Ingredientes', componente: cargarModulo(() => import('@/components/admin/GestionIngredientes.vue')) },
  { id: 'categorias', nombre: 'Categorías', componente: cargarModulo(() => import('@/components/admin/GestionCategorias.vue')) },
]
const submodulos = [
  { id: 'pendientes', nombre: 'Pendientes', componente: cargarModulo(() => import('@/components/admin/ModeracionRecetas.vue')) },
  { id: 'gestion', nombre: 'Gestionar recetas', componente: cargarModulo(() => import('@/components/admin/GestionRecetas.vue')) },
]
watch(() => route.query.receta, (resultado) => {
  if (resultado === 'actualizada') {
    principal.value = 'recetas'
    recetas.value = 'gestion'
  }
}, { immediate: true })
</script>

<template>
  <section class="administracion" aria-labelledby="titulo-admin">
    <header>
      <p class="ceja">Solo administradores</p>
      <h1 id="titulo-admin">Administración</h1>
      <p>Revisá recetas y solicitudes, y organizá los ingredientes y las categorías.</p>
    </header>
    <p v-if="route.query.receta === 'actualizada'" class="mensaje-info" role="status">Receta actualizada y publicada correctamente.</p>
    <AdminPestanas v-model="principal" :opciones="modulos" prefijo="admin" etiqueta="Secciones de administración" />
    <div v-for="modulo in modulos" :id="`admin-panel-${modulo.id}`" :key="modulo.id"
      :hidden="principal !== modulo.id" role="tabpanel" :aria-labelledby="`admin-tab-${modulo.id}`" tabindex="0" class="admin-panel">
      <template v-if="modulo.id === 'recetas'">
        <AdminPestanas v-model="recetas" :opciones="submodulos" prefijo="admin-recetas" etiqueta="Administración de recetas" />
        <div v-for="submodulo in submodulos" :id="`admin-recetas-panel-${submodulo.id}`" :key="submodulo.id"
          :hidden="recetas !== submodulo.id" role="tabpanel" :aria-labelledby="`admin-recetas-tab-${submodulo.id}`" tabindex="0">
          <KeepAlive>
            <component :is="submodulo.componente" v-if="principal === 'recetas' && recetas === submodulo.id" />
          </KeepAlive>
        </div>
      </template>
      <KeepAlive v-else>
        <component :is="modulo.componente" v-if="principal === modulo.id" v-bind="modulo.id === 'solicitudes' ? { administrativa: true } : {}" />
      </KeepAlive>
    </div>
    <RouterLink class="admin-volver" :to="{ name: 'catalogo' }">Volver al catálogo</RouterLink>
  </section>
</template>

<style scoped>
.administracion { min-width: 0; }
.admin-panel { padding: clamp(.8rem, 2vw, 1.5rem); border: 1px solid #e1e6dc; border-radius: 16px; background: #fffdf8; min-width: 0; }
.admin-panel :deep(.moderacion), .admin-panel :deep(.gestion-recetas), .admin-panel :deep(.admin-ingredientes), .admin-panel :deep(.admin-categorias), .admin-panel :deep(.solicitudes) { margin-block: 0; }
.admin-panel :deep(h2) { margin-bottom: .5rem; }
.admin-panel :deep(button), .admin-panel :deep(input), .admin-panel :deep(select) { padding: .55rem .8rem; }
.admin-panel :deep(.categorias-panel), .admin-panel :deep(.ingredientes-panel) { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 1.25rem; }
.admin-panel :deep(li) { gap: .75rem; padding: .85rem; overflow-wrap: anywhere; }
.admin-panel :deep(.categorias-lista li), .admin-panel :deep(.ingredientes-lista li) { flex-wrap: wrap; }
.admin-panel :deep(select) { max-width: 100%; }
.admin-panel :deep(.estado-vacio), .admin-panel :deep(p[role="status"]:not(.mensaje-info)) { padding: 1rem; border-radius: 10px; background: #f0f3ec; }
.admin-volver { display: inline-block; margin-top: 1.5rem; }
@media (max-width: 700px) {
  .admin-panel :deep(.categorias-panel), .admin-panel :deep(.ingredientes-panel) { grid-template-columns: minmax(0, 1fr); }
  .admin-panel :deep(fieldset select) { flex-basis: 100%; }
}
</style>
