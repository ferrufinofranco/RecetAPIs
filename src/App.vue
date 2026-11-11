<template>
  <header class="sitio-header">
    <nav class="contenedor" aria-label="Navegación principal">
      <RouterLink to="/" class="marca">Recet<span>APIs</span></RouterLink>
      <RouterLink to="/">Catálogo</RouterLink>
    </nav>
  </header>
  <main class="contenedor contenido"><RouterView /></main>
  <footer class="sitio-footer">RecetAPIs · Recetas para compartir</footer>
</template>
