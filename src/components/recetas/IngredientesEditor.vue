<script setup>
import { computed, ref } from 'vue'
import { unidadesReceta } from '@/utils/crearReceta'
import SolicitarIngredienteDialogo from '@/components/ingredientes/SolicitarIngredienteDialogo.vue'

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
    <p>{{ editarCantidades ? 'Podés conservar los ingredientes inactivos ya presentes. Solo se agregan ingredientes activos.' : 'Agregá al menos un ingrediente activo.' }}</p>
    <div class="ingrediente-nuevo">
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
      <button type="button" class="agregar-ingrediente" @click="agregar">Agregar ingrediente</button>
    </div>
    <SolicitarIngredienteDialogo />
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <ul class="lista-editor">
      <li v-for="item in modelValue" :key="item.ingrediente_id">
        <div v-if="editarCantidades" class="ingrediente-editable">
          <strong>{{ item.nombre }}{{ item.activo === false ? ' (inactivo)' : '' }}</strong>
          <div class="cantidad-fila">
            <label :for="`cantidad-${item.ingrediente_id}`">Cantidad</label>
            <input :id="`cantidad-${item.ingrediente_id}`" :value="item.cantidad" type="number" min="0" step="any" required
              @input="modificar(item.ingrediente_id, 'cantidad', $event.target.value)">
          </div>
          <div class="unidad-fila">
            <label :for="`unidad-${item.ingrediente_id}`">Unidad</label>
            <select :id="`unidad-${item.ingrediente_id}`" :value="item.unidad" @change="modificar(item.ingrediente_id, 'unidad', $event.target.value)">
              <option v-for="opcion in unidadesReceta" :key="opcion" :value="opcion">{{ opcion }}</option>
            </select>
          </div>
        </div>
        <span v-else>{{ item.nombre }} — {{ item.cantidad }} {{ item.unidad }}</span>
        <button type="button" class="boton-secundario" :aria-label="`Quitar ${item.nombre}`"
          @click="$emit('update:modelValue', modelValue.filter((actual) => actual.ingrediente_id !== item.ingrediente_id))">Quitar</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ingrediente-nuevo { display: grid; grid-template-columns: minmax(0, 2fr) minmax(80px, 1fr) minmax(80px, 1fr) auto; gap: .5rem; align-items: end; }
.ingrediente-nuevo .campo { margin: 0; }
.agregar-ingrediente { max-width: 8rem; line-height: 1.25; }
.ingrediente-editable { display: grid; grid-template-columns: minmax(0, 2fr) minmax(80px, 1fr) minmax(80px, 1fr); align-items: center; gap: .5rem; min-width: 0; flex: 1; }
.ingrediente-editable strong { overflow-wrap: anywhere; }
.ingrediente-editable label { display: block; font-size: .8rem; }
@media (max-width: 700px) {
  .ingrediente-nuevo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ingrediente-nuevo .campo:first-child { grid-column: 1 / -1; }
  .ingrediente-nuevo button { grid-column: 1 / -1; justify-self: start; max-width: none; }
}
@media (max-width: 480px) {
  .ingrediente-editable { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ingrediente-editable strong { grid-column: 1 / -1; }
}
</style>
