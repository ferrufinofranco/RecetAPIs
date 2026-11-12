<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizar } from '@/utils/catalogo'

const props = defineProps({
  modelValue: { type: Array, required: true },
  opciones: { type: Array, required: true },
  invalido: Boolean,
  descripcion: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])
const raiz = ref(null)
const disparador = ref(null)
const entrada = ref(null)
const etiquetas = ref(null)
const abierto = ref(false)
const busqueda = ref('')
const indice = ref(-1)
const aviso = ref('')
const contiene = id => props.modelValue.some(valor => String(valor) === String(id))
const filtradas = computed(() => props.opciones.filter(item =>
  !contiene(item.id) && normalizar(item.nombre).includes(normalizar(busqueda.value)),
))
const seleccionadas = computed(() => props.modelValue.map(id => ({
  id, nombre: props.opciones.find(item => String(item.id) === String(id))?.nombre ?? `Categoría ${id}`,
})))
const activa = computed(() => filtradas.value[indice.value])
const opcionId = item => `categoria-opcion-${item.id}`
const bloqueado = () => disparador.value?.matches(':disabled')
watch(filtradas, () => { indice.value = -1 })

async function abrir(ultima = false) {
  if (bloqueado()) return
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
async function agregar(item) {
  if (bloqueado() || contiene(item.id)) return
  const posicion = indice.value
  emit('update:modelValue', [...props.modelValue, item.id])
  aviso.value = `${item.nombre}: categoría agregada.`
  await nextTick()
  indice.value = posicion < 0 ? -1 : Math.min(posicion, filtradas.value.length - 1)
  entrada.value?.focus()
}
async function quitar(item) {
  if (bloqueado()) return
  const posicion = seleccionadas.value.findIndex(actual => String(actual.id) === String(item.id))
  emit('update:modelValue', props.modelValue.filter(id => String(id) !== String(item.id)))
  aviso.value = `${item.nombre}: categoría quitada.`
  await nextTick()
  const botones = etiquetas.value?.querySelectorAll('button')
  const siguiente = botones?.[Math.min(posicion, botones.length - 1)]
  const destino = siguiente ?? disparador.value
  destino?.focus()
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
    if (activa.value) await agregar(activa.value)
  }
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
  <div ref="raiz" class="selector-categorias" @focusout="focoFuera" @keydown.esc.stop.prevent="cerrar(true)">
    <button id="agregar-categorias" ref="disparador" type="button" class="selector-campo"
      aria-haspopup="listbox" :aria-expanded="abierto" aria-controls="categorias-disponibles"
      :aria-invalid="invalido || undefined" :aria-describedby="descripcion"
      @click="abierto ? cerrar() : abrir()" @keydown.down.prevent="abrir()" @keydown.up.prevent="abrir(true)">
      <span>Agregar categorías...</span><span aria-hidden="true">▾</span>
    </button>
    <div v-if="abierto" class="selector-desplegable">
      <input id="buscar-categorias" ref="entrada" v-model="busqueda" role="combobox" aria-label="Buscar categorías"
        placeholder="Buscar categorías..." autocomplete="off" aria-autocomplete="list" aria-expanded="true"
        aria-controls="categorias-disponibles" :aria-activedescendant="activa ? opcionId(activa) : undefined"
        :aria-invalid="invalido || undefined" :aria-describedby="descripcion" @keydown="teclado">
      <ul id="categorias-disponibles" role="listbox" aria-label="Categorías disponibles" aria-multiselectable="true" class="selector-opciones">
        <li v-for="(item, posicion) in filtradas" :id="opcionId(item)" :key="item.id" role="option"
          aria-selected="false" :class="{ resaltada: posicion === indice }"
          @pointerdown.prevent @click="agregar(item)">{{ item.nombre }}</li>
      </ul>
      <p v-if="!filtradas.length" role="status">No se encontraron categorías disponibles.</p>
    </div>
    <div class="categorias-recuadro" role="group" aria-labelledby="categorias-seleccionadas-titulo">
      <h3 id="categorias-seleccionadas-titulo">Categorías seleccionadas</h3>
      <ul v-if="seleccionadas.length" ref="etiquetas" class="categorias-etiquetas" aria-label="Categorías seleccionadas">
        <li v-for="item in seleccionadas" :key="item.id" :data-categoria-id="item.id">
          <span>{{ item.nombre }}</span>
          <button type="button" :aria-label="`Quitar categoría ${item.nombre}`" :title="`Quitar categoría ${item.nombre}`" @click="quitar(item)">
            <span aria-hidden="true">×</span>
          </button>
        </li>
      </ul>
      <p v-else>No seleccionaste categorías.</p>
    </div>
    <p class="etiqueta-accesible" role="status">{{ aviso }}</p>
  </div>
</template>

<style scoped>
.selector-categorias { min-width: 0; }
.selector-campo { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: .5rem; text-align: left; background: white; color: #283522; border: 1px solid #c5cdbd; font-weight: normal; }
.selector-campo span:first-child { overflow-wrap: anywhere; min-width: 0; }
.selector-desplegable { margin-top: .25rem; background: white; border: 1px solid #c5cdbd; border-radius: 12px; padding: .5rem; box-shadow: 0 8px 24px #28352226; }
.selector-desplegable input { width: 100%; min-width: 0; }
.selector-opciones { list-style: none; padding: 0; margin: .5rem 0 0; max-height: min(240px, 40dvh); overflow-y: auto; overscroll-behavior: contain; }
.selector-opciones li { padding: .6rem; cursor: pointer; overflow-wrap: anywhere; border-radius: 6px; }
.selector-opciones li:hover, .selector-opciones .resaltada { background: #edf2e7; outline: 2px solid #455e38; outline-offset: -2px; }
.selector-desplegable p { margin: .75rem .25rem; }
.categorias-recuadro { margin-top: .65rem; padding: .65rem; border: 1px solid #e1e6dc; border-radius: 12px; background: white; }
.categorias-recuadro h3 { margin: 0 0 .4rem; font-size: .9rem; font-weight: 600; }
.categorias-recuadro p { margin: 0; color: #576353; font-size: .9rem; }
.categorias-etiquetas { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none; padding: 0; margin: 0; }
.categorias-etiquetas li { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; gap: .25rem; padding-left: .6rem; border: 1px solid #b9c5b7; border-radius: 20px; background: #edf2e7; color: #365f40; font-size: .9rem; }
.categorias-etiquetas li > span { min-width: 0; overflow-wrap: anywhere; }
.categorias-etiquetas button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; min-height: 32px; width: 32px; padding: 0; background: transparent; color: inherit; border: 0; border-radius: 50%; font-size: 1.3rem; }
.selector-categorias :focus-visible { outline: 3px solid #b56825; outline-offset: 3px; }
.etiqueta-accesible { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 600px) {
  .categorias-etiquetas button { min-height: 44px; width: 44px; }
}
</style>
