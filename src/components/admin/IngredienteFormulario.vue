<script setup>
defineProps({
  nombre: { type: String, required: true },
  editando: { type: Boolean, default: false },
  deshabilitado: { type: Boolean, default: false },
  guardando: { type: Boolean, default: false },
})
defineEmits(['update:nombre', 'guardar', 'cancelar'])
</script>

<template>
  <form class="ingrediente-formulario" :aria-busy="guardando" @submit.prevent="$emit('guardar')">
    <h3>{{ editando ? 'Modificar ingrediente' : 'Nuevo ingrediente' }}</h3>
    <label for="nombre-ingrediente">Nombre</label>
    <input id="nombre-ingrediente" :value="nombre" name="nombre" required :disabled="deshabilitado"
      @input="$emit('update:nombre', $event.target.value)">
    <div class="ingrediente-acciones">
      <button type="submit" :disabled="deshabilitado">
        {{ guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear ingrediente' }}
      </button>
      <button v-if="editando" type="button" class="boton-secundario" :disabled="deshabilitado"
        @click="$emit('cancelar')">Cancelar</button>
    </div>
  </form>
</template>

<style scoped>
.ingrediente-formulario { padding: 1.5rem; border-radius: 14px; background: #eef1e5; }
h3 { margin-top: 0; }
label { display: block; font-weight: 600; margin-bottom: .4rem; }
.ingrediente-acciones { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1rem; }
</style>
