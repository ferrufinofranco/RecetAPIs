<script setup>
import { ref } from 'vue'

const props = defineProps({ modelValue: { type: Array, required: true } })
const emit = defineEmits(['update:modelValue'])
const nuevoPaso = ref('')
const error = ref('')
let siguienteId = 0

function agregar() {
  error.value = ''
  if (!nuevoPaso.value.trim()) {
    error.value = 'Escribí el paso antes de agregarlo.'
    return
  }
  while (props.modelValue.some((paso) => paso.clave === siguienteId)) siguienteId++
  emit('update:modelValue', [...props.modelValue, { clave: siguienteId++, texto: nuevoPaso.value.trim() }])
  nuevoPaso.value = ''
}

function modificar(indice, texto) {
  emit('update:modelValue', props.modelValue.map((paso, i) => i === indice ? { ...paso, texto } : paso))
}

function mover(indice, direccion) {
  const destino = indice + direccion
  if (destino < 0 || destino >= props.modelValue.length) return
  const pasos = [...props.modelValue]
  ;[pasos[indice], pasos[destino]] = [pasos[destino], pasos[indice]]
  emit('update:modelValue', pasos)
}
</script>

<template>
  <section aria-labelledby="preparacion-editor">
    <h2 id="preparacion-editor">Preparación</h2>
    <div class="paso-nuevo">
      <div>
        <label for="nuevo-paso">Nuevo paso</label>
        <textarea id="nuevo-paso" v-model="nuevoPaso" rows="2" />
      </div>
      <button type="button" @click="agregar">Agregar paso</button>
    </div>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <ol class="pasos-editor">
      <li v-for="(paso, indice) in modelValue" :key="paso.clave">
        <div>
          <label :for="`paso-${paso.clave}`">Paso {{ indice + 1 }}</label>
          <textarea :id="`paso-${paso.clave}`" :value="paso.texto" rows="2" required
            @input="modificar(indice, $event.target.value)" />
        </div>
        <div class="acciones-editor">
          <button type="button" class="boton-secundario" :disabled="indice === 0"
            :aria-label="`Subir paso ${indice + 1}`" @click="mover(indice, -1)">Subir</button>
          <button type="button" class="boton-secundario" :disabled="indice === modelValue.length - 1"
            :aria-label="`Bajar paso ${indice + 1}`" @click="mover(indice, 1)">Bajar</button>
          <button type="button" class="boton-secundario" :aria-label="`Quitar paso ${indice + 1}`"
            @click="$emit('update:modelValue', modelValue.filter((_, i) => i !== indice))">Quitar</button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.paso-nuevo, .pasos-editor li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: .5rem; }
.paso-nuevo > div, .pasos-editor li > div { min-width: 0; }
.paso-nuevo label, .pasos-editor label { display: block; font-weight: 600; }
.paso-nuevo textarea, .pasos-editor textarea { margin-bottom: 0; line-height: 1.4; }
.pasos-editor li { padding-bottom: .5rem; border-bottom: 1px solid #e1e6dc; }
.acciones-editor { gap: .35rem; }
@media (max-width: 700px) {
  .pasos-editor li { grid-template-columns: minmax(0, 1fr); gap: .35rem; }
  .acciones-editor { justify-content: flex-end; }
}
@media (max-width: 480px) {
  .paso-nuevo { grid-template-columns: minmax(0, 1fr); gap: .35rem; }
  .paso-nuevo button { justify-self: start; }
}
</style>
