<script setup>
import { computed, nextTick, ref } from 'vue'
import { useCambiosSinGuardar } from '@/composables/useCambiosSinGuardar'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { crearCategoria, eliminarCategoria, obtenerCategorias, renombrarCategoria } from '@/services/categorias'
import { esCategoriaGeneral, mensajeErrorCategoria } from '@/utils/categorias'
import CategoriaFormulario from './CategoriaFormulario.vue'
import { normalizar } from '@/utils/catalogo'

const categorias = ref([])
const busqueda = ref('')
const filtradas = computed(() => categorias.value.filter(item => normalizar(item.nombre).includes(normalizar(busqueda.value))))
const seleccionada = ref(null)
const nombre = ref('')
const cargando = ref(true)
const guardando = ref(false)
const eliminandoId = ref(null)
const errorListado = ref('')
const errorOperacion = ref('')
const exito = ref('')
const errorFormulario = ref('')
const { confirmarSalida } = useCambiosSinGuardar(computed(() => nombre.value !== (seleccionada.value?.nombre ?? '')))

function cancelar() {
  if (confirmarSalida()) nuevaCategoria()
}

async function cargarCategorias() {
  cargando.value = true
  errorListado.value = ''
  try {
    categorias.value = await obtenerCategorias()
  } catch {
    errorListado.value = 'No se pudo actualizar el listado. Reintentá la lectura antes de realizar otra operación.'
  } finally {
    cargando.value = false
  }
}

function nuevaCategoria() {
  errorFormulario.value = ''
  seleccionada.value = null
  nombre.value = ''
  errorOperacion.value = ''
}

function editar(categoria) {
  if (guardando.value || cargando.value || esCategoriaGeneral(categoria)) return
  if (!confirmarSalida()) return
  errorFormulario.value = ''
  seleccionada.value = categoria
  nombre.value = categoria.nombre
  errorOperacion.value = ''
  exito.value = ''
  document.getElementById('nombre-categoria')?.focus()
}

async function guardar() {
  if (guardando.value || cargando.value || errorListado.value) return
  guardando.value = true
  errorOperacion.value = ''
  exito.value = ''
  errorFormulario.value = ''
  try {
    const editando = !!seleccionada.value
    if (editando) {
      await renombrarCategoria(seleccionada.value, nombre.value)
    } else {
      await crearCategoria(nombre.value)
    }
    nuevaCategoria()
    exito.value = editando ? 'Categoría modificada correctamente.' : 'Categoría creada correctamente.'
    await cargarCategorias()
  } catch (error) {
    errorOperacion.value = mensajeErrorCategoria(error)
    errorFormulario.value = errorOperacion.value
  } finally {
    guardando.value = false
    if (errorFormulario.value) {
      await nextTick()
      document.getElementById('nombre-categoria')?.focus()
    }
  }
}

async function eliminar(categoria) {
  if (guardando.value || cargando.value || errorListado.value || esCategoriaGeneral(categoria)) return
  const confirmado = window.confirm(
    `¿Eliminar la categoría «${categoria.nombre}»?\n\n` +
    'Se desactivará y se quitará de las recetas. Las versiones que queden sin categorías recibirán General.',
  )
  if (!confirmado) return

  guardando.value = true
  eliminandoId.value = categoria.id
  errorOperacion.value = ''
  exito.value = ''
  try {
    await eliminarCategoria(categoria)
    if (seleccionada.value?.id === categoria.id) nuevaCategoria()
    exito.value = 'Categoría eliminada correctamente.'
    await cargarCategorias()
  } catch (error) {
    errorOperacion.value = mensajeErrorCategoria(error, 'eliminar')
  } finally {
    eliminandoId.value = null
    guardando.value = false
  }
}

useListadoAdministracion(cargarCategorias, () => cargando.value || guardando.value)
</script>

<template>
  <section class="admin-categorias" aria-labelledby="titulo-categorias">
    <h2 id="titulo-categorias">Categorías</h2>
    <p>Creá, renombrá y eliminá categorías activas. General está protegida y no puede modificarse ni eliminarse.</p>
    <p v-if="exito" class="mensaje-info" role="status">{{ exito }}</p>
    <p v-if="errorOperacion" class="mensaje-error" role="alert">{{ errorOperacion }}</p>
    <div class="categorias-panel">
      <div class="listado-panel">
        <div class="campo">
          <label for="buscar-categorias-admin">Buscar categoría por nombre</label>
          <input id="buscar-categorias-admin" v-model="busqueda" type="search" placeholder="Buscar categoría..." aria-controls="listado-categorias-admin">
        </div>
        <p v-if="cargando" role="status">Cargando categorías…</p>
        <div v-else-if="errorListado" class="mensaje-error" role="alert">
          <p>{{ errorListado }}</p>
          <button type="button" :disabled="guardando" @click="cargarCategorias">Reintentar listado</button>
        </div>
        <template v-else>
        <p role="status">{{ filtradas.length }} coincidencias de {{ categorias.length }} categorías</p>
        <div id="listado-categorias-admin" class="listado-scroll" role="region" aria-label="Listado de categorías" tabindex="0">
        <p v-if="!filtradas.length" class="listado-vacio">{{ categorias.length ? 'No se encontraron categorías' : 'No hay categorías activas.' }}</p>
        <ul v-else class="categorias-lista" aria-label="Categorías activas">
          <li v-for="categoria in filtradas" :key="categoria.id">
            <span>{{ categoria.nombre }}</span>
            <span v-if="esCategoriaGeneral(categoria)" class="dato">Protegida</span>
            <div v-else class="categorias-fila-acciones">
              <button type="button" class="boton-secundario"
                :aria-label="`Editar ${categoria.nombre}`" :disabled="guardando || cargando" @click="editar(categoria)">
                Editar
              </button>
              <button type="button" class="boton-eliminar"
                :aria-label="`Eliminar ${categoria.nombre}`" :disabled="guardando || cargando" @click="eliminar(categoria)">
                {{ eliminandoId === categoria.id ? 'Eliminando…' : 'Eliminar' }}
              </button>
            </div>
          </li>
        </ul>
        </div>
        </template>
      </div>
      <CategoriaFormulario v-model:nombre="nombre" :editando="!!seleccionada" :guardando="guardando && eliminandoId === null"
        :error="errorFormulario" :deshabilitado="guardando || cargando || !!errorListado" @guardar="guardar" @cancelar="cancelar" />
    </div>
  </section>
</template>

<style scoped>
.listado-panel { min-width: 0; }
.listado-scroll { height: 400px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--borde); border-radius: 14px; background: var(--superficie); }
.listado-vacio { padding: 1rem; }
.categorias-lista { border: 0; border-radius: 0; }
.categorias-fila-acciones, .categorias-lista .dato { flex-shrink: 0; }
@media (max-width: 480px) {
  .categorias-lista li { flex-direction: column; align-items: stretch; }
  .categorias-fila-acciones { justify-content: flex-start; }
  .listado-scroll { height: min(400px, 60vh); }
}
</style>
