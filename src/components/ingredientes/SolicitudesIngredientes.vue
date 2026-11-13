<script setup>
import { nextTick, ref, watch } from 'vue'
import { useListadoAdministracion } from '@/composables/useListadoAdministracion'
import { useAuthStore } from '@/stores/auth'
import { obtenerIngredientes } from '@/services/ingredientes'
import { obtenerSolicitudes, resolverSolicitud, errorSolicitud } from '@/services/solicitudes'

const props = defineProps({
  administrativa: { type: Boolean, default: false },
  compacta: { type: Boolean, default: false },
  actualizacion: { type: Number, default: 0 },
})
const emit = defineEmits(['resuelta'])
const auth = useAuthStore()
const filas = ref([])
const ingredientes = ref([])
const seleccionados = ref({})
const acciones = ref({})
const tituloAdmin = ref(null)
const cargando = ref(true)
const procesando = ref(false)
const errorCarga = ref('')
const error = ref('')
const exito = ref('')
const intento = ref(0)
const resueltas = new Set()
const estados = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', asociada: 'Asociada' }
const confirmaciones = {
  aprobar: 'Confirmar aprobación',
  asociar: 'Confirmar asociación',
  rechazar: 'Confirmar rechazo',
}
const formatoFechaAdmin = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

useListadoAdministracion(() => { if (props.administrativa) intento.value++ }, () => cargando.value || procesando.value, false)

watch([() => auth.user?.id, intento, () => props.actualizacion], async ([id], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  filas.value = []
  cargando.value = true
  errorCarga.value = ''
  try {
    if (!id || (props.administrativa && !auth.esAdmin)) return
    const [datos, opciones] = await Promise.all([
      obtenerSolicitudes({ usuarioId: id, pendientes: props.administrativa, signal: controller.signal }),
      props.administrativa || props.compacta ? obtenerIngredientes() : Promise.resolve([]),
    ])
    if (!controller.signal.aborted && auth.user?.id === id) {
      filas.value = datos.filter((item) => !props.administrativa || (item.estado === 'pendiente' && !resueltas.has(String(item.id))))
      ingredientes.value = opciones.filter((item) => item.activo)
      if (!props.administrativa) ingredientes.value = opciones
    }
  } catch {
    if (!controller.signal.aborted) errorCarga.value = 'No pudimos cargar las solicitudes. Reintentá la lectura.'
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })

async function resolver(item, accion) {
  if (procesando.value || !props.administrativa || !auth.esAdmin || item.estado !== 'pendiente' || resueltas.has(String(item.id))) return
  error.value = ''
  exito.value = ''
  const ingredienteId = seleccionados.value[item.id]
  if (accion === 'asociar' && !ingredientes.value.some((opcion) => String(opcion.id) === String(ingredienteId))) {
    error.value = 'Seleccioná un ingrediente activo para asociar.'
    return
  }
  const controlesEnFoco = document.activeElement?.closest('fieldset')
  procesando.value = true
  try {
    const perfil = await auth.actualizarPerfil()
    if (perfil?.rol !== 'admin' || perfil?.id !== auth.user?.id) throw new Error('No pudimos verificar tus permisos de administrador.')
    await resolverSolicitud(item.id, accion, ingredienteId)
    resueltas.add(String(item.id))
    delete acciones.value[item.id]
    delete seleccionados.value[item.id]
    filas.value = filas.value.filter((fila) => fila.id !== item.id)
    exito.value = 'Solicitud resuelta correctamente.'
    emit('resuelta')
    intento.value++
    await nextTick()
    if (controlesEnFoco && document.activeElement === document.body) tituloAdmin.value?.focus()
  } catch (err) { error.value = errorSolicitud(err) }
  finally { procesando.value = false }
}

function fecha(item) {
  if (!item.creada_en) return 'Fecha no disponible'
  const valor = new Date(item.creada_en)
  if (Number.isNaN(valor.getTime())) return 'Fecha no disponible'
  return props.administrativa ? formatoFechaAdmin.format(valor) : valor.toLocaleString('es-AR')
}

function solicitanteBreve(id) {
  if (!id) return 'no disponible'
  return id.length > 8 ? `${id.slice(0, 8)}…` : id
}

function ingredienteResuelto(item) {
  return ingredientes.value.find((opcion) => String(opcion.id) === String(item.ingrediente_id))?.nombre
    || `Ingrediente #${item.ingrediente_id}`
}
</script>

<template>
  <section class="solicitudes" :class="{ 'solicitudes--compacta': compacta, 'solicitudes--admin': administrativa }"
    :aria-label="compacta ? 'Mis solicitudes de ingredientes' : undefined" :aria-labelledby="administrativa ? 'titulo-solicitudes-admin' : undefined">
    <header :class="{ 'solicitudes-encabezado': administrativa }">
      <h2 v-if="administrativa" id="titulo-solicitudes-admin" ref="tituloAdmin" tabindex="-1">Solicitudes de ingredientes</h2>
      <h1 v-else-if="!compacta">Mis solicitudes</h1>
      <button type="button" class="boton-secundario" :disabled="cargando || procesando" @click="intento++">Actualizar solicitudes</button>
    </header>
    <p v-if="!administrativa && !compacta">Consultá el historial y los estados de tus solicitudes. Para solicitar un ingrediente nuevo, usá el editor de ingredientes al crear o editar una receta.</p>
    <p v-if="exito" class="mensaje-info" role="status">{{ exito }}</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="cargando" role="status">Cargando solicitudes…</p>
    <div v-else-if="errorCarga" class="mensaje-error" role="alert">
      <p>{{ errorCarga }}</p><button type="button" :disabled="procesando" @click="intento++">Reintentar listado</button>
    </div>
    <p v-else-if="!filas.length">{{ administrativa ? 'No hay solicitudes pendientes.' : 'Todavía no tenés solicitudes.' }}</p>
    <ul v-else class="solicitudes-lista">
      <li v-for="item in filas" :key="item.id">
        <div v-if="administrativa" class="solicitud-datos">
          <div class="solicitud-titulo">
            <h3>{{ item.nombre_solicitado }}</h3>
            <span class="solicitud-estado">{{ estados[item.estado] || item.estado }}</span>
          </div>
          <p class="solicitud-meta">
            <time v-if="item.creada_en" :datetime="item.creada_en">{{ fecha(item) }}</time>
            <span v-else>{{ fecha(item) }}</span>
            <span>Solicitante: {{ solicitanteBreve(item.solicitante_id) }}</span>
          </p>
        </div>
        <template v-else>
          <h3>{{ item.nombre_solicitado }}</h3>
          <p>{{ estados[item.estado] || item.estado }} · {{ fecha(item) }}</p>
        </template>
        <p v-if="compacta && !administrativa && item.ingrediente_id != null && ['aprobada', 'asociada'].includes(item.estado)">
          {{ item.estado === 'aprobada' ? 'Ingrediente creado' : 'Ingrediente asociado' }}: {{ ingredienteResuelto(item) }}
        </p>
        <fieldset v-if="administrativa && auth.esAdmin && item.estado === 'pendiente'" class="solicitud-acciones" :disabled="procesando">
          <legend class="sr-solicitud">Resolver {{ item.nombre_solicitado }}</legend>
          <div class="campo">
            <label :for="`accion-solicitud-${item.id}`">Acción</label>
            <select :id="`accion-solicitud-${item.id}`" v-model="acciones[item.id]">
              <option :value="undefined" disabled>Seleccioná una acción</option>
              <option value="aprobar">Aprobar</option>
              <option value="asociar">Asociar</option>
              <option value="rechazar">Rechazar</option>
            </select>
          </div>
          <div v-if="acciones[item.id]" class="solicitud-confirmacion">
            <div v-if="acciones[item.id] === 'asociar'" class="campo">
              <label :for="`asociar-${item.id}`">Ingrediente activo existente</label>
              <select :id="`asociar-${item.id}`" v-model="seleccionados[item.id]">
                <option :value="undefined">Seleccioná un ingrediente</option>
                <option v-for="opcion in ingredientes" :key="opcion.id" :value="opcion.id">{{ opcion.nombre }}</option>
              </select>
            </div>
            <p v-else :id="`ayuda-solicitud-${item.id}`">
              {{ acciones[item.id] === 'aprobar'
                ? 'Se creará un ingrediente nuevo en el catálogo.'
                : 'La solicitud quedará rechazada y se cerrará.' }}
            </p>
            <button type="button" :class="{ 'boton-eliminar': acciones[item.id] === 'rechazar' }"
              :aria-describedby="acciones[item.id] === 'asociar' ? undefined : `ayuda-solicitud-${item.id}`"
              @click="resolver(item, acciones[item.id])">
              {{ confirmaciones[acciones[item.id]] }}
            </button>
          </div>
        </fieldset>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.solicitudes { margin-block: 2rem; }
.solicitudes-lista { list-style: none; padding: 0; }
li { border: 1px solid var(--borde); border-radius: 14px; padding: 1rem; margin-block: 1rem; overflow-wrap: anywhere; }
li h3 { margin-top: 0; }
.solicitudes-encabezado { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
.solicitudes-encabezado h2, .solicitud-titulo h3 { margin: 0; }
.solicitudes--admin .solicitudes-lista { display: grid; gap: .75rem; }
.solicitudes--admin li { margin: 0; padding: .875rem 1rem; min-width: 0; background: var(--superficie); }
.solicitud-titulo, .solicitud-meta { display: flex; align-items: baseline; flex-wrap: wrap; gap: .25rem .75rem; }
.solicitud-meta { margin: .3rem 0 0; color: var(--texto-secundario); font-size: .875rem; }
.solicitud-estado { background: var(--advertencia-fondo); color: var(--advertencia-texto); border-radius: 20px; padding: .15rem .6rem; font-size: .8rem; }
.solicitud-acciones { border: 0; padding: 0; margin: .75rem 0 0; min-width: 0; }
.sr-solicitud { position: absolute; width: 1px; height: 1px; padding: 0; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
.solicitud-acciones .campo { min-width: 0; width: 100%; max-width: 18rem; margin: 0; }
.solicitud-acciones label { margin-bottom: .25rem; font-size: .875rem; }
.solicitud-confirmacion { display: flex; align-items: flex-end; flex-wrap: wrap; gap: .5rem .75rem; margin-top: .6rem; }
.solicitud-confirmacion p { align-self: center; margin: 0; color: var(--texto-secundario); font-size: .9rem; }
.solicitudes--admin button { max-width: 100%; white-space: normal; }
@media (max-width: 480px) {
  .solicitudes--admin li { padding: .75rem; }
  .solicitud-acciones .campo, .solicitud-confirmacion button { max-width: none; width: 100%; }
}
.solicitudes.solicitudes--compacta { margin: .5rem 0 0; padding: .5rem; border: 1px solid var(--borde); border-radius: 10px; min-width: 0; }
.solicitudes--compacta .solicitudes-lista { max-height: 20rem; overflow-y: auto; margin-bottom: 0; }
.solicitudes--compacta li { padding: .65rem; margin-block: .5rem; }
.solicitudes--compacta li h3 { font-size: 1rem; margin-bottom: .25rem; }
.solicitudes--compacta button { max-width: 100%; white-space: normal; }
.solicitudes--compacta :focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }
</style>
