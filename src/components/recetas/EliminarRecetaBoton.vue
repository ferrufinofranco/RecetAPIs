<script setup>
defineProps({
  titulo: { type: String, required: true },
  deshabilitado: { type: Boolean, default: false },
  eliminando: { type: Boolean, default: false },
})
defineEmits(['eliminar'])
</script>

<template>
  <button type="button" class="boton-eliminar" :disabled="deshabilitado || eliminando"
    :aria-label="`Eliminar ${titulo}`" @click="$emit('eliminar')">
    {{ eliminando ? 'Eliminando…' : 'Eliminar' }}
  </button>
</template>
