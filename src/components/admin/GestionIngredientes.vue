<script setup>
import { ref } from 'vue'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { crearIngrediente, desactivarIngrediente, obtenerIngredientes, renombrarIngrediente } from '@/services/ingredientes'
import { mensajeErrorIngrediente } from '@/utils/ingredientes'
import IngredienteFormulario from './IngredienteFormulario.vue'

const ingredientes = ref([])
const seleccionado = ref(null)
const nombre = ref('')
const cargando = ref(true)
const guardando = ref(false)
const desactivandoId = ref(null)
const errorListado = ref('')
const errorOperacion = ref('')
const exito = ref('')

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
  seleccionado.value = null
  nombre.value = ''
  errorOperacion.value = ''
}

function editar(ingrediente) {
  if (guardando.value || cargando.value || errorListado.value) return
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
  } finally {
    guardando.value = false
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
      <div>
        <p v-if="cargando" role="status">Cargando ingredientes…</p>
        <div v-else-if="errorListado" class="mensaje-error" role="alert">
          <p>{{ errorListado }}</p>
          <button type="button" :disabled="guardando" @click="cargarIngredientes">Reintentar listado</button>
        </div>
        <p v-else-if="!ingredientes.length" role="status">No hay ingredientes disponibles.</p>
        <ul v-else class="ingredientes-lista" aria-label="Ingredientes activos e inactivos">
          <li v-for="ingrediente in ingredientes" :key="ingrediente.id">
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
      <IngredienteFormulario v-model:nombre="nombre" :editando="!!seleccionado" :guardando="guardando && desactivandoId === null"
        :deshabilitado="guardando || cargando || !!errorListado" @guardar="guardar" @cancelar="nuevoIngrediente" />
    </div>
  </section>
</template>

<style scoped>
.admin-ingredientes { margin-block: 3rem 2rem; }
.ingredientes-panel { display: grid; grid-template-columns: 1.3fr 1fr; gap: 2rem; align-items: start; }
.ingredientes-lista { list-style: none; padding: 0; margin: 0; border: 1px solid #e1e6dc; border-radius: 14px; overflow: hidden; background: white; }
.ingredientes-lista li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border-bottom: 1px solid #e1e6dc; }
.ingredientes-lista li:last-child { border-bottom: 0; }
.ingrediente-datos { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; min-width: 0; overflow-wrap: anywhere; }
.ingrediente-fila-acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
.estado { background: #edf2e7; color: #455e38; border-radius: 20px; padding: .2rem .7rem; font-size: .8rem; }
.estado.inactivo { background: #ececea; color: #555b53; }
@media (max-width: 700px) { .ingredientes-panel { grid-template-columns: 1fr; } }
</style>
