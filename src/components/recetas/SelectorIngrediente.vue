<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizar } from '@/utils/catalogo'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  opciones: { type: Array, required: true },
  invalido: Boolean,
  descripcion: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])
const raiz = ref(null)
const disparador = ref(null)
const entrada = ref(null)
const abierto = ref(false)
const busqueda = ref('')
const indice = ref(-1)
const filtradas = computed(() => props.opciones.filter(item => normalizar(item.nombre).includes(normalizar(busqueda.value))))
const seleccionado = computed(() => props.opciones.find(item => String(item.id) === String(props.modelValue)))
const opcionId = item => `ingrediente-opcion-${item.id}`
const activa = computed(() => filtradas.value[indice.value])

watch(filtradas, () => { indice.value = -1 })

async function abrir(ultima = false) {
  busqueda.value = ''
  abierto.value = true
  await nextTick()
  indice.value = ultima ? filtradas.value.length - 1 : -1
  entrada.value?.focus()
}
function cerrar(devolverFoco = false) {
  abierto.value = false
  if (devolverFoco) disparador.value?.focus()
}
function elegir(item) {
  emit('update:modelValue', item.id)
  cerrar(true)
}
async function teclado(evento) {
  if (evento.key === 'Escape') {
    evento.preventDefault()
    evento.stopPropagation()
    cerrar(true)
  } else if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
    evento.preventDefault()
    const paso = evento.key === 'ArrowDown' ? 1 : -1
    const total = filtradas.value.length
    indice.value = total ? (indice.value < 0 ? (paso > 0 ? 0 : total - 1) : (indice.value + paso + total) % total) : -1
    await nextTick()
    if (activa.value) document.getElementById(opcionId(activa.value))?.scrollIntoView?.({ block: 'nearest' })
  } else if (evento.key === 'Enter') {
    evento.preventDefault()
    if (activa.value) elegir(activa.value)
  } else if (evento.key === 'Tab') cerrar()
}
function clicFuera(evento) {
  if (!raiz.value?.contains(evento.target)) cerrar()
}
function focoFuera(evento) {
  if (!raiz.value?.contains(evento.relatedTarget)) cerrar()
}
onMounted(() => document.addEventListener('pointerdown', clicFuera))
onBeforeUnmount(() => document.removeEventListener('pointerdown', clicFuera))
</script>

<template>
  <div ref="raiz" class="selector-ingrediente" @focusout="focoFuera">
    <button id="ingrediente-elegido" ref="disparador" type="button" class="selector-campo"
      aria-haspopup="listbox" :aria-expanded="abierto" aria-controls="ingredientes-opciones"
      :aria-invalid="invalido || undefined" :aria-describedby="descripcion"
      @click="abierto ? cerrar() : abrir()" @keydown.down.prevent="abrir()" @keydown.up.prevent="abrir(true)" @keydown.esc="cerrar(true)">
      <span>{{ seleccionado?.nombre ?? 'Seleccioná un ingrediente' }}</span><span aria-hidden="true">▾</span>
    </button>
    <div v-if="abierto" class="selector-desplegable">
      <input ref="entrada" v-model="busqueda" role="combobox" aria-label="Buscar ingrediente"
        placeholder="Buscar ingrediente..." autocomplete="off" aria-autocomplete="list" aria-expanded="true"
        aria-controls="ingredientes-opciones" :aria-activedescendant="activa ? opcionId(activa) : undefined"
        @keydown="teclado">
      <ul id="ingredientes-opciones" role="listbox" aria-label="Ingredientes disponibles" class="selector-opciones">
        <li v-for="(item, posicion) in filtradas" :id="opcionId(item)" :key="item.id" role="option"
          :aria-selected="String(item.id) === String(modelValue)" :class="{ resaltada: posicion === indice }"
          @pointerdown.prevent @click="elegir(item)">{{ item.nombre }}</li>
      </ul>
      <p v-if="!filtradas.length" role="status">No se encontraron ingredientes</p>
    </div>
  </div>
</template>

<style scoped>
.selector-ingrediente { position: relative; min-width: 0; }
.selector-campo { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: .5rem; text-align: left; background: var(--superficie); color: var(--texto-control); border: 1px solid var(--borde-selector); font-weight: normal; }
.selector-campo span:first-child { overflow-wrap: anywhere; min-width: 0; }
.selector-desplegable { position: absolute; top: calc(100% + .25rem); left: 0; right: 0; z-index: 10; background: var(--superficie); border: 1px solid var(--borde-selector); border-radius: 12px; padding: .5rem; box-shadow: 0 8px 24px var(--sombra-desplegable); }
.selector-opciones { list-style: none; padding: 0; margin: .5rem 0 0; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }
.selector-opciones li { padding: .6rem; cursor: pointer; overflow-wrap: anywhere; border-radius: 6px; }
.selector-opciones li:hover, .selector-opciones .resaltada { background: var(--etiqueta-fondo); outline: 2px solid var(--etiqueta-texto); outline-offset: -2px; }
.selector-opciones [aria-selected="true"] { font-weight: bold; }
.selector-desplegable p { margin: .75rem .25rem; }
</style>
