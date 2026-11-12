<script setup>
import { onMounted, ref } from 'vue'
import { crearCategoria, obtenerCategorias, renombrarCategoria } from '@/services/categorias'
import { esCategoriaGeneral, mensajeErrorCategoria } from '@/utils/categorias'
import CategoriaFormulario from './CategoriaFormulario.vue'

const categorias = ref([])
const seleccionada = ref(null)
const nombre = ref('')
const cargando = ref(true)
const guardando = ref(false)
const errorListado = ref('')
const errorOperacion = ref('')
const exito = ref('')

async function cargarCategorias() {
  cargando.value = true
  errorListado.value = ''
  try {
    categorias.value = await obtenerCategorias()
  } catch {
    errorListado.value = 'No se pudo actualizar el listado. Reintentá la lectura antes de guardar otra vez.'
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

onMounted(cargarCategorias)
</script>

<template>
  <section class="admin-categorias" aria-labelledby="titulo-categorias">
    <h2 id="titulo-categorias">Categorías</h2>
    <p>Creá y renombrá categorías activas. General está protegida y no puede modificarse.</p>
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
            <button v-else type="button" class="boton-secundario"
              :aria-label="`Editar ${categoria.nombre}`" :disabled="guardando || cargando" @click="editar(categoria)">
              Editar
            </button>
          </li>
        </ul>
      </div>
      <CategoriaFormulario v-model:nombre="nombre" :editando="!!seleccionada" :guardando="guardando"
        :deshabilitado="guardando || cargando || !!errorListado" @guardar="guardar" @cancelar="nuevaCategoria" />
    </div>
  </section>
</template>
