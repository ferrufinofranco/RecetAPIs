<script setup>
import { computed, nextTick, ref } from 'vue'
import { useCambiosSinGuardar } from '@/composables/useCambiosSinGuardar'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { crearIngrediente, desactivarIngrediente, obtenerIngredientes, renombrarIngrediente } from '@/services/ingredientes'
import { mensajeErrorIngrediente } from '@/utils/ingredientes'
import IngredienteFormulario from './IngredienteFormulario.vue'
import { normalizar } from '@/utils/catalogo'

const ingredientes = ref([])
const busqueda = ref('')
const filtrados = computed(() => ingredientes.value.filter(item => normalizar(item.nombre).includes(normalizar(busqueda.value))))
const seleccionado = ref(null)
const nombre = ref('')
const cargando = ref(true)
const guardando = ref(false)
const desactivandoId = ref(null)
const errorListado = ref('')
const errorOperacion = ref('')
const exito = ref('')
const errorFormulario = ref('')
const { confirmarSalida } = useCambiosSinGuardar(computed(() => nombre.value !== (seleccionado.value?.nombre ?? '')))

function cancelar() {
  if (confirmarSalida()) nuevoIngrediente()
}

async function cargarIngredientes() {
  cargando.value = true
  errorListado.value = ''
  try {
    ingredientes.value = await obtenerIngredientes()
  } catch {
    errorListado.value = 'No se pudo actualizar el listado de ingredientes. Reintentá la lectura antes de realizar otra operación.'
  } finally {
    cargando.value = false
  }
}

function nuevoIngrediente() {
  errorFormulario.value = ''
  seleccionado.value = null
  nombre.value = ''
  errorOperacion.value = ''
}

function editar(ingrediente) {
  if (guardando.value || cargando.value || errorListado.value) return
  if (!confirmarSalida()) return
  errorFormulario.value = ''
  seleccionado.value = ingrediente
  nombre.value = ingrediente.nombre
  errorOperacion.value = ''
  exito.value = ''
  document.getElementById('nombre-ingrediente')?.focus()
}

async function guardar() {
  if (guardando.value || cargando.value || errorListado.value) return
  guardando.value = true
  errorOperacion.value = ''
  exito.value = ''
  errorFormulario.value = ''
  try {
    const editando = !!seleccionado.value
    if (editando) {
      await renombrarIngrediente(seleccionado.value, nombre.value)
    } else {
      await crearIngrediente(nombre.value)
    }
    nuevoIngrediente()
    exito.value = editando ? 'Ingrediente modificado correctamente.' : 'Ingrediente creado correctamente.'
    await cargarIngredientes()
  } catch (error) {
    errorOperacion.value = mensajeErrorIngrediente(error)
    errorFormulario.value = errorOperacion.value
  } finally {
    guardando.value = false
    if (errorFormulario.value) {
      await nextTick()
      document.getElementById('nombre-ingrediente')?.focus()
    }
  }
}

async function desactivar(ingrediente) {
  if (guardando.value || cargando.value || errorListado.value || !ingrediente.activo) return
  const confirmado = window.confirm(
    `¿Desactivar el ingrediente «${ingrediente.nombre}»?\n\n` +
    'El registro y las recetas existentes se conservarán. No hay reactivación disponible desde esta pantalla.',
  )
  if (!confirmado) return

  guardando.value = true
  desactivandoId.value = ingrediente.id
  errorOperacion.value = ''
  exito.value = ''
  try {
    await desactivarIngrediente(ingrediente)
    exito.value = 'Ingrediente desactivado correctamente.'
    await cargarIngredientes()
  } catch (error) {
    errorOperacion.value = mensajeErrorIngrediente(error, 'desactivar')
  } finally {
    desactivandoId.value = null
    guardando.value = false
  }
}

useListadoAdministracion(cargarIngredientes, () => cargando.value || guardando.value)
</script>

<template>
  <section class="admin-ingredientes" aria-labelledby="titulo-ingredientes">
    <h2 id="titulo-ingredientes">Ingredientes</h2>
    <p>Creá, renombrá y desactivá ingredientes. Los inactivos siguen visibles y se conservan en las recetas existentes.</p>
    <p v-if="exito" class="mensaje-info" role="status">{{ exito }}</p>
    <p v-if="errorOperacion" class="mensaje-error" role="alert">{{ errorOperacion }}</p>
    <div class="ingredientes-panel">
      <div class="listado-panel">
        <div class="campo">
          <label for="buscar-ingredientes-admin">Buscar ingrediente por nombre</label>
          <input id="buscar-ingredientes-admin" v-model="busqueda" type="search" placeholder="Buscar ingrediente..." aria-controls="listado-ingredientes-admin">
        </div>
        <p v-if="cargando" role="status">Cargando ingredientes…</p>
        <div v-else-if="errorListado" class="mensaje-error" role="alert">
          <p>{{ errorListado }}</p>
          <button type="button" :disabled="guardando" @click="cargarIngredientes">Reintentar listado</button>
        </div>
        <template v-else>
        <p role="status">{{ filtrados.length }} coincidencias de {{ ingredientes.length }} ingredientes</p>
        <div id="listado-ingredientes-admin" class="listado-scroll" role="region" aria-label="Listado de ingredientes" tabindex="0">
        <p v-if="!filtrados.length" class="listado-vacio">{{ ingredientes.length ? 'No se encontraron ingredientes' : 'No hay ingredientes disponibles.' }}</p>
        <ul v-else class="ingredientes-lista" aria-label="Ingredientes activos e inactivos">
          <li v-for="ingrediente in filtrados" :key="ingrediente.id">
            <div class="ingrediente-datos">
              <span>{{ ingrediente.nombre }}</span>
              <span class="estado" :class="{ inactivo: !ingrediente.activo }">
                {{ ingrediente.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </div>
            <div class="ingrediente-fila-acciones">
              <button type="button" class="boton-secundario" :aria-label="`Editar ${ingrediente.nombre}`"
                :disabled="guardando || cargando" @click="editar(ingrediente)">Editar</button>
              <button v-if="ingrediente.activo" type="button" class="boton-eliminar"
                :aria-label="`Desactivar ${ingrediente.nombre}`" :disabled="guardando || cargando" @click="desactivar(ingrediente)">
                {{ desactivandoId === ingrediente.id ? 'Desactivando…' : 'Desactivar' }}
              </button>
            </div>
          </li>
        </ul>
        </div>
        </template>
      </div>
      <IngredienteFormulario v-model:nombre="nombre" :editando="!!seleccionado" :guardando="guardando && desactivandoId === null"
        :error="errorFormulario" :deshabilitado="guardando || cargando || !!errorListado" @guardar="guardar" @cancelar="cancelar" />
    </div>
  </section>
</template>

<style scoped>
.admin-ingredientes { margin-block: 3rem 2rem; }
.ingredientes-panel { display: grid; grid-template-columns: 1.3fr 1fr; gap: 2rem; align-items: start; }
.listado-panel { min-width: 0; }
.listado-scroll { height: 400px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--borde); border-radius: 14px; background: var(--superficie); }
.listado-vacio { padding: 1rem; }
.ingredientes-lista { list-style: none; padding: 0; margin: 0; background: var(--superficie); }
.ingredientes-lista li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--borde); }
.ingredientes-lista li:last-child { border-bottom: 0; }
.ingrediente-datos { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; min-width: 0; overflow-wrap: anywhere; }
.ingrediente-fila-acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; flex-shrink: 0; }
.estado { background: var(--etiqueta-fondo); color: var(--etiqueta-texto); border-radius: 20px; padding: .2rem .7rem; font-size: .8rem; }
.estado.inactivo { background: var(--inactivo-fondo); color: var(--inactivo-texto); }
@media (max-width: 700px) { .ingredientes-panel { grid-template-columns: 1fr; } }
@media (max-width: 480px) {
  .ingredientes-lista li { flex-direction: column; align-items: stretch; }
  .ingrediente-fila-acciones { justify-content: flex-start; }
  .listado-scroll { height: min(400px, 60vh); }
}
</style>
