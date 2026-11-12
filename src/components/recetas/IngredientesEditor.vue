<script setup>
import { computed, nextTick, ref } from 'vue'
import { unidadesReceta } from '@/utils/crearReceta'
import SolicitarIngredienteDialogo from '@/components/ingredientes/SolicitarIngredienteDialogo.vue'
import SolicitudesContextuales from '@/components/ingredientes/SolicitudesContextuales.vue'
import SelectorIngrediente from './SelectorIngrediente.vue'

const props = defineProps({
  modelValue: { type: Array, required: true },
  disponibles: { type: Array, required: true },
  editarCantidades: { type: Boolean, default: false },
  historialPersonal: { type: Boolean, default: true },
  errorValidacion: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const ingredienteId = ref('')
const cantidad = ref('')
const unidad = ref('g')
const error = ref('')
const campoError = ref('')
const hayBorrador = computed(() => !!ingredienteId.value || String(cantidad.value) !== '' || unidad.value !== 'g')
defineExpose({ hayBorrador })
function indicarError(campo, mensaje) {
  error.value = mensaje
  campoError.value = campo
  nextTick(() => document.getElementById(campo)?.focus())
}
const opciones = computed(() => props.disponibles.filter((item) =>
  item.activo && !props.modelValue.some((agregado) => String(agregado.ingrediente_id) === String(item.id)),
))
const hayInactivos = computed(() => props.modelValue.some(item => item.activo === false))

function agregar() {
  error.value = ''
  campoError.value = ''
  const ingrediente = opciones.value.find((item) => String(item.id) === String(ingredienteId.value))
  if (!ingrediente) {
    indicarError('ingrediente-elegido', 'Seleccioná un ingrediente activo que todavía no esté agregado.')
    return
  }
  if (!Number.isFinite(Number(cantidad.value)) || Number(cantidad.value) <= 0) {
    indicarError('cantidad-ingrediente', 'Ingresá una cantidad mayor que cero.')
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
    <h2 id="ingredientes-editor" :aria-describedby="errorValidacion ? 'error-ingredientes' : undefined">Ingredientes</h2>
    <p v-if="errorValidacion" id="error-ingredientes" class="error-contextual">{{ errorValidacion }}</p>
    <p v-if="hayInactivos">Podés conservar los ingredientes inactivos ya presentes. Solo se agregan ingredientes activos.</p>
    <p v-else-if="!modelValue.length">Agregá al menos un ingrediente activo.</p>
    <div class="ingrediente-nuevo">
      <div class="campo">
        <label for="ingrediente-elegido">Ingrediente</label>
        <SelectorIngrediente v-model="ingredienteId" :opciones="opciones" :invalido="campoError === 'ingrediente-elegido'"
          :descripcion="campoError === 'ingrediente-elegido' ? 'error-agregar-ingrediente' : undefined" />
      </div>
      <div class="campo">
        <label for="cantidad-ingrediente">Cantidad</label>
        <input id="cantidad-ingrediente" v-model="cantidad" type="number" min="0" step="any" :aria-invalid="campoError === 'cantidad-ingrediente' || undefined" :aria-describedby="campoError === 'cantidad-ingrediente' ? 'error-agregar-ingrediente' : undefined">
      </div>
      <div class="campo">
        <label for="unidad-ingrediente">Unidad</label>
        <select id="unidad-ingrediente" v-model="unidad">
          <option v-for="item in unidadesReceta" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
      <button type="button" class="agregar-ingrediente" @click="agregar">Agregar ingrediente</button>
    </div>
    <SolicitudesContextuales v-if="historialPersonal" />
    <SolicitarIngredienteDialogo v-else />
    <p v-if="error" id="error-agregar-ingrediente" class="mensaje-error" role="alert">{{ error }}</p>
    <div v-if="modelValue.length" class="ingredientes-encabezado" aria-hidden="true">
      <span>Ingrediente</span><span>Cantidad</span><span>Unidad</span><span class="encabezado-quitar">Quitar</span>
    </div>
    <ul class="lista-editor ingredientes-agregados" aria-label="Ingredientes agregados">
      <li v-for="item in modelValue" :key="item.ingrediente_id">
        <strong>{{ item.nombre }}{{ item.activo === false ? ' (inactivo)' : '' }}</strong>
        <template v-if="editarCantidades">
          <div class="cantidad-fila">
            <label class="etiqueta-accesible" :for="`cantidad-${item.ingrediente_id}`">Cantidad de {{ item.nombre }}</label>
            <input :id="`cantidad-${item.ingrediente_id}`" :value="item.cantidad" type="number" min="0" step="any" required
              @input="modificar(item.ingrediente_id, 'cantidad', $event.target.value)">
          </div>
          <div class="unidad-fila">
            <label class="etiqueta-accesible" :for="`unidad-${item.ingrediente_id}`">Unidad de {{ item.nombre }}</label>
            <select :id="`unidad-${item.ingrediente_id}`" :value="item.unidad" @change="modificar(item.ingrediente_id, 'unidad', $event.target.value)">
              <option v-for="opcion in unidadesReceta" :key="opcion" :value="opcion">{{ opcion }}</option>
            </select>
          </div>
        </template>
        <template v-else><span>{{ item.cantidad }}</span><span>{{ item.unidad }}</span></template>
        <button type="button" class="boton-secundario quitar-ingrediente" :aria-label="`Quitar ${item.nombre}`" :title="`Quitar ${item.nombre}`"
          @click="$emit('update:modelValue', modelValue.filter((actual) => actual.ingrediente_id !== item.ingrediente_id))"><span aria-hidden="true">×</span></button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ingrediente-nuevo { display: grid; grid-template-columns: minmax(0, 2fr) minmax(80px, 1fr) minmax(80px, 1fr) auto; gap: .5rem; align-items: end; }
.ingrediente-nuevo .campo { margin: 0; }
.agregar-ingrediente { max-width: 8rem; line-height: 1.25; }
.ingredientes-encabezado, .lista-editor.ingredientes-agregados li { display: grid; grid-template-columns: minmax(0, 1fr) 96px 84px 44px; align-items: center; gap: .5rem; }
.ingredientes-encabezado { margin-top: .65rem; padding-bottom: .25rem; border-bottom: 1px solid var(--borde); font-size: .8rem; color: var(--texto-secundario); }
.encabezado-quitar { text-align: center; }
.lista-editor.ingredientes-agregados { list-style: none; padding: 0; margin: 0; }
.lista-editor.ingredientes-agregados li { min-height: 50px; padding: .25rem 0; border-bottom: 1px solid var(--borde); }
.ingredientes-agregados strong { min-width: 0; overflow-wrap: anywhere; font-size: .9rem; font-weight: 600; }
.ingredientes-agregados input, .ingredientes-agregados select { width: 100%; min-width: 0; min-height: 40px; padding: .3rem .45rem; }
.ingredientes-agregados .quitar-ingrediente { display: inline-flex; align-items: center; justify-content: center; justify-self: center; width: 40px; min-height: 40px; padding: 0; font-size: 1.4rem; line-height: 1; }
.etiqueta-accesible { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 700px) {
  .ingrediente-nuevo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ingrediente-nuevo .campo:first-child { grid-column: 1 / -1; }
  .ingrediente-nuevo .agregar-ingrediente { grid-column: 1 / -1; justify-self: start; max-width: none; }
}
@media (max-width: 480px) {
  .ingredientes-encabezado, .lista-editor.ingredientes-agregados li { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px; gap: .25rem .5rem; }
  .ingredientes-encabezado > span:first-child { display: none; }
  .ingredientes-agregados strong { grid-column: 1 / -1; }
  .ingredientes-agregados input, .ingredientes-agregados select, .ingredientes-agregados .quitar-ingrediente { min-height: 44px; }
  .ingredientes-agregados .quitar-ingrediente { width: 44px; }
}
</style>
