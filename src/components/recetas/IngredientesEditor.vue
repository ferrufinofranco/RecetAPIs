<script setup>
import { computed, ref } from 'vue'
import { unidadesReceta } from '@/utils/crearReceta'

const props = defineProps({
  modelValue: { type: Array, required: true },
  disponibles: { type: Array, required: true },
  editarCantidades: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const ingredienteId = ref('')
const cantidad = ref('')
const unidad = ref('g')
const error = ref('')
const opciones = computed(() => props.disponibles.filter((item) =>
  item.activo && !props.modelValue.some((agregado) => String(agregado.ingrediente_id) === String(item.id)),
))

function agregar() {
  error.value = ''
  const ingrediente = opciones.value.find((item) => String(item.id) === String(ingredienteId.value))
  if (!ingrediente) {
    error.value = 'Seleccioná un ingrediente activo que todavía no esté agregado.'
    return
  }
  if (!Number.isFinite(Number(cantidad.value)) || Number(cantidad.value) <= 0) {
    error.value = 'Ingresá una cantidad mayor que cero.'
    return
  }
  emit('update:modelValue', [...props.modelValue, {
    ingrediente_id: ingrediente.id, nombre: ingrediente.nombre,
    cantidad: Number(cantidad.value), unidad: unidad.value,
  }])
  ingredienteId.value = ''
  cantidad.value = ''
}

function modificar(id, campo, valor) {
  emit('update:modelValue', props.modelValue.map((item) =>
    item.ingrediente_id === id ? { ...item, [campo]: valor } : item,
  ))
}
</script>

<template>
  <section aria-labelledby="ingredientes-editor">
    <h2 id="ingredientes-editor">Ingredientes</h2>
    <RouterLink :to="{ name: 'mis-solicitudes' }">¿No encontrás un ingrediente? Solicitá uno nuevo</RouterLink>
    <p>{{ editarCantidades ? 'Podés conservar los ingredientes inactivos ya presentes. Solo se agregan ingredientes activos.' : 'Agregá al menos un ingrediente activo.' }}</p>
    <div class="filtros">
      <div class="campo">
        <label for="ingrediente-elegido">Ingrediente</label>
        <select id="ingrediente-elegido" v-model="ingredienteId">
          <option value="">Seleccioná un ingrediente</option>
          <option v-for="item in opciones" :key="item.id" :value="item.id">{{ item.nombre }}</option>
        </select>
      </div>
      <div class="campo">
        <label for="cantidad-ingrediente">Cantidad</label>
        <input id="cantidad-ingrediente" v-model="cantidad" type="number" min="0" step="any">
      </div>
      <div class="campo">
        <label for="unidad-ingrediente">Unidad</label>
        <select id="unidad-ingrediente" v-model="unidad">
          <option v-for="item in unidadesReceta" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>
    <button type="button" @click="agregar">Agregar ingrediente</button>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <ul class="lista-editor">
      <li v-for="item in modelValue" :key="item.ingrediente_id">
        <div v-if="editarCantidades" class="ingrediente-editable">
          <strong>{{ item.nombre }}{{ item.activo === false ? ' (inactivo)' : '' }}</strong>
          <label :for="`cantidad-${item.ingrediente_id}`">Cantidad</label>
          <input :id="`cantidad-${item.ingrediente_id}`" :value="item.cantidad" type="number" min="0" step="any" required
            @input="modificar(item.ingrediente_id, 'cantidad', $event.target.value)">
          <label :for="`unidad-${item.ingrediente_id}`">Unidad</label>
          <select :id="`unidad-${item.ingrediente_id}`" :value="item.unidad" @change="modificar(item.ingrediente_id, 'unidad', $event.target.value)">
            <option v-for="opcion in unidadesReceta" :key="opcion" :value="opcion">{{ opcion }}</option>
          </select>
        </div>
        <span v-else>{{ item.nombre }} — {{ item.cantidad }} {{ item.unidad }}</span>
        <button type="button" class="boton-secundario" :aria-label="`Quitar ${item.nombre}`"
          @click="$emit('update:modelValue', modelValue.filter((actual) => actual.ingrediente_id !== item.ingrediente_id))">Quitar</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ingrediente-editable { display: grid; gap: .4rem; min-width: 0; flex: 1; }
</style>
