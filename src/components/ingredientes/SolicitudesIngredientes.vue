<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { obtenerIngredientes } from '@/services/ingredientes'
import { obtenerSolicitudes, solicitarIngrediente, resolverSolicitud, errorSolicitud } from '@/services/solicitudes'

const props = defineProps({ administrativa: { type: Boolean, default: false } })
const emit = defineEmits(['resuelta'])
const auth = useAuthStore()
const filas = ref([])
const ingredientes = ref([])
const seleccionados = ref({})
const nombre = ref('')
const cargando = ref(true)
const procesando = ref(false)
const errorCarga = ref('')
const error = ref('')
const exito = ref('')
const intento = ref(0)
const resueltas = new Set()
const estados = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', asociada: 'Asociada' }

watch([() => auth.user?.id, intento], async ([id], _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  filas.value = []
  cargando.value = true
  errorCarga.value = ''
  try {
    if (!id || (props.administrativa && !auth.esAdmin)) return
    const [datos, opciones] = await Promise.all([
      obtenerSolicitudes({ usuarioId: id, pendientes: props.administrativa, signal: controller.signal }),
      props.administrativa ? obtenerIngredientes() : Promise.resolve([]),
    ])
    if (!controller.signal.aborted && auth.user?.id === id) {
      filas.value = datos.filter((item) => !props.administrativa || (item.estado === 'pendiente' && !resueltas.has(String(item.id))))
      ingredientes.value = opciones.filter((item) => item.activo)
    }
  } catch {
    if (!controller.signal.aborted) errorCarga.value = 'No pudimos cargar las solicitudes. Reintentá la lectura.'
  } finally {
    if (!controller.signal.aborted) cargando.value = false
  }
}, { immediate: true })

async function enviar() {
  if (procesando.value || !auth.autenticado) return
  procesando.value = true
  error.value = ''
  exito.value = ''
  try {
    await solicitarIngrediente(nombre.value)
    nombre.value = ''
    exito.value = 'Solicitud enviada. Quedó pendiente de resolución.'
    intento.value++
  } catch (err) { error.value = errorSolicitud(err) }
  finally { procesando.value = false }
}

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
</script>

<template>
  <section class="solicitudes">
    <h2 v-if="administrativa">Solicitudes de ingredientes</h2>
    <h1 v-else>Mis solicitudes</h1>
    <button type="button" class="boton-secundario" :disabled="cargando || procesando" @click="intento++">Actualizar solicitudes</button>
    <form v-if="!administrativa" @submit.prevent="enviar">
      <label for="nombre-solicitado">Nombre del ingrediente</label>
      <input id="nombre-solicitado" v-model="nombre" required maxlength="120" :disabled="procesando">
      <button type="submit" :disabled="procesando">{{ procesando ? 'Enviando…' : 'Solicitar ingrediente' }}</button>
    </form>
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
form { max-width: 480px; }
form button { margin-top: 1rem; }
.solicitudes-lista { list-style: none; padding: 0; }
li { border: 1px solid #e1e6dc; border-radius: 14px; padding: 1rem; margin-block: 1rem; overflow-wrap: anywhere; }
li h3 { margin-top: 0; }
fieldset { border: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; min-width: 0; }
fieldset select { max-width: 300px; }
.sr-solicitud { font-weight: 600; margin-bottom: .5rem; }
</style>
