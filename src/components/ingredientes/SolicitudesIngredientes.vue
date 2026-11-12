<script setup>
import { ref, watch } from 'vue'
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
const cargando = ref(true)
const procesando = ref(false)
const errorCarga = ref('')
const error = ref('')
const exito = ref('')
const intento = ref(0)
const resueltas = new Set()
const estados = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', asociada: 'Asociada' }

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
  procesando.value = true
  try {
    const perfil = await auth.actualizarPerfil()
    if (perfil?.rol !== 'admin' || perfil?.id !== auth.user?.id) throw new Error('No pudimos verificar tus permisos de administrador.')
    await resolverSolicitud(item.id, accion, ingredienteId)
    resueltas.add(String(item.id))
    filas.value = filas.value.filter((fila) => fila.id !== item.id)
    exito.value = 'Solicitud resuelta correctamente.'
    emit('resuelta')
    intento.value++
  } catch (err) { error.value = errorSolicitud(err) }
  finally { procesando.value = false }
}

function fecha(item) {
  if (!item.creada_en) return 'Fecha no disponible'
  return new Date(item.creada_en).toLocaleString('es-AR')
}

function ingredienteResuelto(item) {
  return ingredientes.value.find((opcion) => String(opcion.id) === String(item.ingrediente_id))?.nombre
    || `Ingrediente #${item.ingrediente_id}`
}
</script>

<template>
  <section class="solicitudes" :class="{ 'solicitudes--compacta': compacta }" :aria-label="compacta ? 'Mis solicitudes de ingredientes' : undefined">
    <h2 v-if="administrativa">Solicitudes de ingredientes</h2>
    <h1 v-else-if="!compacta">Mis solicitudes</h1>
    <button type="button" class="boton-secundario" :disabled="cargando || procesando" @click="intento++">Actualizar solicitudes</button>
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
        <h3>{{ item.nombre_solicitado }}</h3>
        <p>{{ estados[item.estado] || item.estado }} · {{ fecha(item) }}</p>
        <p v-if="compacta && !administrativa && item.ingrediente_id != null && ['aprobada', 'asociada'].includes(item.estado)">
          {{ item.estado === 'aprobada' ? 'Ingrediente creado' : 'Ingrediente asociado' }}: {{ ingredienteResuelto(item) }}
        </p>
        <p v-if="administrativa">Solicitante: {{ item.solicitante_id }}</p>
        <fieldset v-if="administrativa && auth.esAdmin && item.estado === 'pendiente'" :disabled="procesando">
          <legend class="sr-solicitud">Resolver {{ item.nombre_solicitado }}</legend>
          <button type="button" @click="resolver(item, 'aprobar')">Aprobar</button>
          <button type="button" class="boton-eliminar" @click="resolver(item, 'rechazar')">Rechazar</button>
          <label :for="`asociar-${item.id}`">Ingrediente activo existente</label>
          <select :id="`asociar-${item.id}`" v-model="seleccionados[item.id]">
            <option :value="undefined">Seleccioná un ingrediente</option>
            <option v-for="opcion in ingredientes" :key="opcion.id" :value="opcion.id">{{ opcion.nombre }}</option>
          </select>
          <button type="button" @click="resolver(item, 'asociar')">Asociar</button>
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
fieldset { border: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; min-width: 0; }
fieldset select { max-width: 300px; }
.sr-solicitud { font-weight: 600; margin-bottom: .5rem; }
.solicitudes.solicitudes--compacta { margin: .5rem 0 0; padding: .5rem; border: 1px solid var(--borde); border-radius: 10px; min-width: 0; }
.solicitudes--compacta .solicitudes-lista { max-height: 20rem; overflow-y: auto; margin-bottom: 0; }
.solicitudes--compacta li { padding: .65rem; margin-block: .5rem; }
.solicitudes--compacta li h3 { font-size: 1rem; margin-bottom: .25rem; }
.solicitudes--compacta button { max-width: 100%; white-space: normal; }
.solicitudes--compacta :focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }
</style>
