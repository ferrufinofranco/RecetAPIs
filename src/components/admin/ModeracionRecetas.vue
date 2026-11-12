<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { useAuthStore } from '@/stores/auth'
import { aprobarReceta, rechazarReceta, obtenerPropuesta, obtenerPropuestasPendientes, mensajeErrorModeracion } from '@/services/moderacion'
import PropuestaDetalle from './PropuestaDetalle.vue'

const auth = useAuthStore()
const propuestas = ref([])
const propuesta = ref(null)
const seleccionadaId = ref(null)
const motivo = ref('')
const cargando = ref(true)
const revisando = ref(false)
const procesando = ref(false)
const errorListado = ref('')
const errorDetalle = ref('')
const errorOperacion = ref('')
const exito = ref('')
const panelRevision = ref(null)
let disparadorRevision
let listadoController
let detalleController

function fecha(valor) {
  const date = new Date(valor)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-AR')
}

function cerrarRevision() {
  detalleController?.abort()
  propuesta.value = null
  seleccionadaId.value = null
  motivo.value = ''
  errorDetalle.value = ''
  revisando.value = false
  disparadorRevision?.focus()
}

async function cargarListado(conservarRevision = false) {
  listadoController?.abort()
  const controller = new AbortController()
  listadoController = controller
  if (!conservarRevision) cerrarRevision()
  cargando.value = true
  errorListado.value = ''
  try {
    const datos = await obtenerPropuestasPendientes(controller.signal)
    if (!controller.signal.aborted) {
      propuestas.value = datos
      if (conservarRevision && seleccionadaId.value !== null && !datos.some((item) => item.id === seleccionadaId.value)) cerrarRevision()
    }
  } catch {
    if (!controller.signal.aborted) errorListado.value = 'No pudimos cargar las propuestas pendientes. Reintentá la lectura.'
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}

async function revisar(id, disparador) {
  if (procesando.value || cargando.value || !auth.esAdmin) return
  cerrarRevision()
  disparadorRevision = disparador
  const controller = new AbortController()
  detalleController = controller
  seleccionadaId.value = id
  revisando.value = true
  errorOperacion.value = ''
  exito.value = ''
  try {
    const datos = await obtenerPropuesta(id, controller.signal)
    if (controller.signal.aborted) return
    propuesta.value = datos
    if (!datos) errorDetalle.value = 'Esta propuesta ya no está pendiente o la receta no está disponible. Actualizá el listado.'
  } catch {
    if (!controller.signal.aborted) errorDetalle.value = 'No pudimos cargar el contenido de la propuesta. Volvé a revisarla.'
  } finally {
    if (!controller.signal.aborted) {
      revisando.value = false
      await nextTick()
      panelRevision.value?.focus()
      panelRevision.value?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    }
  }
}

async function decidir(accion) {
  if (procesando.value || revisando.value || !propuesta.value || !auth.esAdmin) return
  const versionId = propuesta.value.versionId
  const confirmacion = accion === 'aprobar'
    ? `¿Aprobar «${propuesta.value.titulo}», versión ${propuesta.value.numero}? Quedará publicada en el catálogo.`
    : `¿Rechazar «${propuesta.value.titulo}», versión ${propuesta.value.numero}?`
  if (!window.confirm(confirmacion)) return
  procesando.value = true
  errorOperacion.value = ''
  exito.value = ''
  try {
    const perfil = await auth.actualizarPerfil()
    if (!auth.autenticado || perfil?.id !== auth.user?.id || perfil?.rol !== 'admin') {
      errorOperacion.value = 'No pudimos verificar tus permisos de administrador.'
      cerrarRevision()
      return
    }
    if (accion === 'aprobar') await aprobarReceta(versionId)
    else await rechazarReceta(versionId, motivo.value)
    exito.value = accion === 'aprobar' ? 'Receta aprobada y publicada correctamente.' : 'Propuesta rechazada correctamente.'
    await cargarListado()
  } catch (error) {
    errorOperacion.value = mensajeErrorModeracion(error)
    // Volver a consultar antes de permitir otra decisión, incluso ante un timeout.
    cerrarRevision()
  } finally {
    procesando.value = false
  }
}

useListadoAdministracion(() => cargarListado(true), () => cargando.value || procesando.value || revisando.value)
onBeforeUnmount(() => {
  listadoController?.abort()
  detalleController?.abort()
})
</script>

<template>
  <section class="moderacion" aria-labelledby="titulo-pendientes">
    <h2 id="titulo-pendientes">Recetas pendientes</h2>
    <p>Revisá las propuestas, ordenadas de la más antigua a la más reciente.</p>
    <button type="button" class="boton-secundario" :disabled="cargando || procesando" @click="cargarListado">Actualizar listado</button>
    <p v-if="exito" class="mensaje-info" role="status">{{ exito }}</p>
    <p v-if="errorOperacion" class="mensaje-error" role="alert">{{ errorOperacion }}</p>
    <p v-if="cargando" role="status">Cargando propuestas…</p>
    <div v-else-if="errorListado" class="mensaje-error" role="alert">
      <p>{{ errorListado }}</p>
      <button type="button" :disabled="procesando" @click="cargarListado">Reintentar listado</button>
    </div>
    <p v-else-if="!propuestas.length" class="estado-vacio">No hay recetas pendientes.</p>
    <ul v-else class="lista-propuestas">
      <li v-for="item in propuestas" :key="item.id">
        <div>
          <strong>{{ item.titulo }}</strong>
          <p class="dato">Versión {{ item.numero }} · <time :datetime="item.creada_en">{{ fecha(item.creada_en) }}</time></p>
        </div>
        <button type="button" :disabled="procesando || !auth.esAdmin" :aria-label="`Revisar ${item.titulo}, versión ${item.numero}`"
          :aria-expanded="seleccionadaId === item.id" aria-controls="revision-propuesta"
          @click="revisar(item.id, $event.currentTarget)">Revisar</button>
      </li>
    </ul>
    <section v-if="seleccionadaId !== null" id="revision-propuesta" ref="panelRevision" class="revision" tabindex="-1" aria-label="Revisión de propuesta" :aria-busy="revisando">
      <p v-if="revisando" role="status">Cargando contenido completo…</p>
      <p v-else-if="errorDetalle" class="mensaje-error" role="alert">{{ errorDetalle }}</p>
      <template v-else-if="propuesta">
        <PropuestaDetalle :propuesta="propuesta" />
        <fieldset :disabled="procesando || !auth.esAdmin" :aria-busy="procesando" class="decision">
          <legend>Decisión sobre la propuesta</legend>
          <label for="motivo-rechazo">Motivo del rechazo (opcional, solo se envía al rechazar)</label>
          <textarea id="motivo-rechazo" v-model="motivo" rows="3" />
          <div class="acciones-moderacion">
            <button type="button" @click="decidir('aprobar')">Aprobar receta</button>
            <button type="button" class="boton-eliminar" @click="decidir('rechazar')">Rechazar receta</button>
          </div>
        </fieldset>
        <p v-if="procesando" role="status">Procesando decisión…</p>
      </template>
      <button type="button" class="boton-secundario" :disabled="procesando" @click="cerrarRevision">Cerrar revisión</button>
    </section>
  </section>
</template>

<style scoped>
.moderacion { margin-bottom: 3rem; }
.moderacion > button { margin-bottom: 1rem; }
.lista-propuestas { list-style: none; margin: 0; padding: 0; }
.lista-propuestas li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--borde); }
.lista-propuestas li > div { min-width: 0; overflow-wrap: anywhere; }
.lista-propuestas p { margin-bottom: 0; }
.revision { padding: 1.5rem; margin-top: 2rem; border: 1px solid var(--borde); border-radius: 16px; background: var(--superficie-calida); }
.revision:focus { outline: 3px solid var(--acento); outline-offset: 4px; }
.decision { border: 0; margin: 2rem 0 1rem; padding: 0; min-width: 0; }
.decision legend { font-weight: 700; margin-bottom: 1rem; }
.decision textarea { display: block; width: 100%; resize: vertical; font: inherit; padding: .75rem; border: 1px solid var(--borde-control); border-radius: 10px; margin-block: .5rem 1rem; }
.acciones-moderacion { display: flex; flex-wrap: wrap; gap: .75rem; }
@media (max-width: 600px) { .lista-propuestas li { flex-wrap: wrap; } .revision { padding: 1rem; } }
</style>
