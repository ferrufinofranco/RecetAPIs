<script setup>
import { ref } from 'vue'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { crearCategoria, eliminarCategoria, obtenerCategorias, renombrarCategoria } from '@/services/categorias'
import { esCategoriaGeneral, mensajeErrorCategoria } from '@/utils/categorias'
import CategoriaFormulario from './CategoriaFormulario.vue'

const categorias = ref([])
const seleccionada = ref(null)
const nombre = ref('')
const cargando = ref(true)
const guardando = ref(false)
const eliminandoId = ref(null)
const errorListado = ref('')
const errorOperacion = ref('')
const exito = ref('')

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
  seleccionada.value = null
  nombre.value = ''
  errorOperacion.value = ''
}

function editar(categoria) {
  if (guardando.value || cargando.value || esCategoriaGeneral(categoria)) return
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
  } finally {
    guardando.value = false
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
      <div>
        <p v-if="cargando" role="status">Cargando categorías…</p>
        <div v-else-if="errorListado" class="mensaje-error" role="alert">
          <p>{{ errorListado }}</p>
          <button type="button" :disabled="guardando" @click="cargarCategorias">Reintentar listado</button>
        </div>
        <p v-else-if="!categorias.length" role="status">No hay categorías activas.</p>
        <ul v-else class="categorias-lista" aria-label="Categorías activas">
          <li v-for="categoria in categorias" :key="categoria.id">
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
      <CategoriaFormulario v-model:nombre="nombre" :editando="!!seleccionada" :guardando="guardando && eliminandoId === null"
        :deshabilitado="guardando || cargando || !!errorListado" @guardar="guardar" @cancelar="nuevaCategoria" />
    </div>
  </section>
</template>
