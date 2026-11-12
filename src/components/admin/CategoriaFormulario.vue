<script setup>
defineProps({
  nombre: { type: String, required: true },
  editando: { type: Boolean, default: false },
  deshabilitado: { type: Boolean, default: false },
  guardando: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
defineEmits(['update:nombre', 'guardar', 'cancelar'])
</script>

<template>
  <form class="categoria-formulario" :aria-busy="guardando" @submit.prevent="$emit('guardar')">
    <h3>{{ editando ? 'Modificar categoría' : 'Nueva categoría' }}</h3>
    <label for="nombre-categoria">Nombre</label>
    <input id="nombre-categoria" :value="nombre" name="nombre" required :disabled="deshabilitado"
      :aria-invalid="!!error || undefined" :aria-describedby="error ? 'error-nombre-categoria' : undefined"
      @input="$emit('update:nombre', $event.target.value)">
    <p v-if="error" id="error-nombre-categoria" class="error-contextual">{{ error }}</p>
    <div class="categoria-acciones">
      <button type="submit" :disabled="deshabilitado">
        {{ guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear categoría' }}
      </button>
      <button v-if="editando" type="button" class="boton-secundario" :disabled="deshabilitado"
        @click="$emit('cancelar')">Cancelar</button>
    </div>
  </form>
</template>
