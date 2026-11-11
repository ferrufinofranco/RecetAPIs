<template>
  <section class="estado-vacio">
    <h1>No encontramos esta página o receta</h1>
    <p>Volvé al catálogo para explorar las recetas disponibles.</p>
    <RouterLink :to="{ name: 'catalogo' }">Volver al catálogo</RouterLink>
  </section>
</template>
