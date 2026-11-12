<script setup>
const props = defineProps({
  modelValue: { type: String, required: true },
  opciones: { type: Array, required: true },
  prefijo: { type: String, required: true },
  etiqueta: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

function navegar(event, indice) {
  const ultimo = props.opciones.length - 1
  const destinos = { ArrowRight: (indice + 1) % (ultimo + 1), ArrowLeft: (indice + ultimo) % (ultimo + 1), Home: 0, End: ultimo }
  if (!(event.key in destinos)) return
  event.preventDefault()
  // Activación manual: las flechas mueven el foco; Enter/Espacio activan sin cargar módulos al recorrerlos.
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[destinos[event.key]]?.focus()
}
</script>

<template>
  <div class="admin-pestanas" role="tablist" :aria-label="etiqueta" aria-orientation="horizontal">
    <button v-for="(opcion, indice) in opciones" :id="`${prefijo}-tab-${opcion.id}`" :key="opcion.id"
      type="button" role="tab" :aria-selected="modelValue === opcion.id"
      :aria-controls="`${prefijo}-panel-${opcion.id}`" :tabindex="modelValue === opcion.id ? 0 : -1"
      @click="emit('update:modelValue', opcion.id)" @keydown="navegar($event, indice)">
      {{ opcion.nombre }}
    </button>
  </div>
</template>

<style scoped>
.admin-pestanas { display: flex; flex-wrap: wrap; gap: .5rem; padding: .4rem; margin-bottom: 1rem; border: 1px solid var(--borde-pestanas); border-radius: 14px; background: var(--superficie-suave); }
button { flex: 1 1 auto; min-width: 0; padding: .6rem .9rem; background: transparent; color: var(--pestana-texto); border-color: transparent; font-weight: 600; }
button[aria-selected="true"] { background: var(--primario); color: var(--sobre-primario); box-shadow: 0 2px 5px var(--sombra-pestana); }
button:focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }
@media (max-width: 480px) { button { flex-basis: 40%; padding-inline: .5rem; } }
</style>
