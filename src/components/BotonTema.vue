<script setup>
import { useTema } from '@/composables/useTema'

const { tema, alternar } = useTema()
</script>

<template>
  <button type="button" class="boton-tema" aria-label="Modo oscuro" :aria-pressed="tema === 'oscuro'"
    :title="tema === 'oscuro' ? 'Activar modo claro' : 'Activar modo oscuro'" @click="alternar">
    <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path v-if="tema === 'claro'" d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />
      <template v-else>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.boton-tema { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; align-self: center; width: 44px; height: 44px; padding: .5rem; background: var(--superficie); color: var(--enlace); }
.boton-tema:hover { background: var(--etiqueta-fondo); }
@media (max-width: 850px) { .boton-tema { align-self: flex-start; } }
</style>
