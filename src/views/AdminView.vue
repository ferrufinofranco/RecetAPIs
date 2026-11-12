<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import GestionCategorias from '@/components/admin/GestionCategorias.vue'
import GestionIngredientes from '@/components/admin/GestionIngredientes.vue'
import ModeracionRecetas from '@/components/admin/ModeracionRecetas.vue'
import GestionRecetas from '@/components/admin/GestionRecetas.vue'
import SolicitudesIngredientes from '@/components/ingredientes/SolicitudesIngredientes.vue'

const revisionPendientes = ref(0)
const revisionIngredientes = ref(0)
const route = useRoute()
</script>

<template>
  <section>
    <p class="ceja">Solo administradores</p>
    <h1>Administración</h1>
    <p v-if="route.query.receta === 'actualizada'" class="mensaje-info" role="status">Receta actualizada y publicada correctamente.</p>
    <ModeracionRecetas :key="revisionPendientes" />
    <GestionRecetas @eliminada="revisionPendientes++" />
    <GestionCategorias />
    <SolicitudesIngredientes administrativa @resuelta="revisionIngredientes++" />
    <GestionIngredientes :key="revisionIngredientes" />
    <RouterLink :to="{ name: 'catalogo' }">Volver al catálogo</RouterLink>
  </section>
</template>
