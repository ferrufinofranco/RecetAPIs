<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { obtenerIngredientes } from '@/services/ingredientes'
import { obtenerCategorias } from '@/services/categorias'
import { crearReceta, editarPropuestaReceta, proponerEdicionReceta, adminEditarReceta } from '@/services/recetas'
import { subirImagen, asignarImagen, obtenerVersionGuardada } from '@/services/imagenes'
import ImagenRecetaEditor from './ImagenRecetaEditor.vue'
import { formularioDesdePropuesta, ingredientesPermitidos } from '@/utils/editarPropuesta'
import { ErrorCrearReceta, mensajeErrorCrearReceta, prepararDatosReceta } from '@/utils/crearReceta'
import IngredientesEditor from '@/components/recetas/IngredientesEditor.vue'
import PasosEditor from '@/components/recetas/PasosEditor.vue'

const auth = useAuthStore()
const props = defineProps({
  propuesta: { type: Object, default: null },
  publicada: { type: Boolean, default: false },
  administrativa: { type: Boolean, default: false },
})
const emit = defineEmits(['guardada'])
const autorId = auth.user?.id
const editando = !!props.propuesta
const rechazado = props.propuesta?.estado === 'rechazada'
const inicial = props.propuesta ? formularioDesdePropuesta(props.propuesta) : null
const formulario = reactive({
  titulo: '', descripcion: '', porciones: '', tiempo_minutos: '', dificultad: '',
  ingredientes: [], categorias: [], pasos: [],
})
if (inicial) Object.assign(formulario, inicial)
// Copia independiente: quitar una fila no modifica los IDs originales permitidos.
const ingredientesOriginales = inicial?.ingredientes.map((item) => ({ ...item })) ?? []
const ingredientes = ref([])
const categorias = ref([])
const cargando = ref(true)
const errorCarga = ref('')
const error = ref('')
const guardando = ref(false)
const guardada = ref(false)
const contenidoGuardado = ref(false)
const archivo = ref(null)
const quitarImagen = ref(false)
const errorImagen = ref('')
let rutaSubida = null
let respuestaGuardado
watch(archivo, () => { rutaSubida = null })

function finalizar() {
  guardada.value = true
  errorImagen.value = ''
  emit('guardada')
}

async function completarImagen() {
  const versionId = obtenerVersionGuardada(respuestaGuardado,
    !props.publicada && props.propuesta?.estado === 'pendiente' ? props.propuesta.id : null)
  if (archivo.value && !rutaSubida) rutaSubida = await subirImagen(archivo.value, autorId)
  await asignarImagen(versionId, quitarImagen.value ? null : rutaSubida)
}

async function reintentarImagen() {
  if (guardando.value) return
  if (!contenidoGuardado.value) { await guardar(); return }
  if (!auth.autenticado || auth.user?.id !== autorId) {
    errorImagen.value = 'La sesión cambió. Volvé a ingresar con la cuenta que guardó la propuesta.'
    return
  }
  guardando.value = true
  errorImagen.value = ''
  try { await completarImagen(); finalizar() }
  catch (err) { errorImagen.value = err.message || 'No pudimos asociar la imagen. Podés continuar sin cambiarla.' }
  finally { guardando.value = false }
}

function continuarSinImagen() {
  if (guardando.value) return
  if (contenidoGuardado.value) finalizar()
  else {
    archivo.value = null
    quitarImagen.value = false
    errorImagen.value = ''
    guardar()
  }
}

async function cargarOpciones() {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [listaIngredientes, listaCategorias] = await Promise.all([obtenerIngredientes(), obtenerCategorias()])
    ingredientes.value = listaIngredientes
    categorias.value = listaCategorias
  } catch {
    errorCarga.value = 'No pudimos cargar los ingredientes y categorías. Reintentá antes de guardar.'
  } finally {
    cargando.value = false
  }
}

async function guardar() {
  if (guardando.value || guardada.value || contenidoGuardado.value || cargando.value || errorCarga.value) return
  error.value = ''
  if (!auth.autenticado || auth.user?.id !== autorId) {
    error.value = 'La sesión cambió. Volvé a ingresar al formulario con tu cuenta.'
    return
  }
  guardando.value = true
  try {
    const datos = prepararDatosReceta({ ...formulario, pasos: formulario.pasos.map((paso) => paso.texto) })
    if (!ingredientesPermitidos(datos.ingredientes, ingredientes.value, ingredientesOriginales)) {
      throw new ErrorCrearReceta('Solo podés agregar ingredientes activos o conservar los originales de la propuesta.')
    }
    if (datos.categorias.some((id) => !categorias.value.some((opcion) => String(opcion.id) === String(id)))) {
      throw new ErrorCrearReceta('Seleccioná categorías activas del listado.')
    }
    if (props.administrativa) {
      const perfil = await auth.actualizarPerfil()
      if (perfil?.rol !== 'admin' || perfil?.id !== auth.user?.id) throw new ErrorCrearReceta('No pudimos verificar tus permisos de administrador.')
      const imagen = {}
      if (archivo.value) {
        try { if (!rutaSubida) rutaSubida = await subirImagen(archivo.value, autorId) }
        catch (err) { errorImagen.value = err.message; return }
        imagen.imagen_path = rutaSubida
      } else if (quitarImagen.value) imagen.imagen_path = null
      await adminEditarReceta(props.propuesta.receta_id, datos, imagen)
      finalizar()
      return
    }
    if (props.publicada) respuestaGuardado = await proponerEdicionReceta(props.propuesta.receta_id, datos)
    else if (editando) respuestaGuardado = await editarPropuestaReceta(props.propuesta.id, datos)
    else respuestaGuardado = await crearReceta(datos)
    contenidoGuardado.value = true
    if (archivo.value || quitarImagen.value) {
      try { await completarImagen() }
      catch (err) { errorImagen.value = err.message || 'No pudimos asociar la imagen.'; return }
    }
    finalizar()
  } catch (err) {
    error.value = mensajeErrorCrearReceta(err, editando ? 'guardar la propuesta' : 'crear la receta')
  } finally {
    guardando.value = false
  }
}

onMounted(cargarOpciones)
</script>

<template>
  <section class="crear-receta" aria-labelledby="titulo-crear">
    <h1 id="titulo-crear">{{ administrativa ? 'Edición administrativa' : publicada ? 'Editar receta publicada' : rechazado ? 'Corregir y reenviar' : editando ? 'Editar propuesta' : 'Crear receta' }}</h1>
    <p v-if="publicada && !administrativa" class="mensaje-info">Se creará una nueva propuesta pendiente. La versión aprobada y su imagen seguirán visibles sin cambios hasta la aprobación.</p>
    <p>{{ administrativa ? 'Los cambios se publicarán directamente como una nueva versión, conservando el historial.' : editando ? 'Guardá tus cambios para revisión. La propuesta quedará pendiente de aprobación.' : 'Compartí tu receta. Quedará pendiente de aprobación antes de aparecer en el catálogo.' }}</p>
    <div v-if="rechazado && !guardada" class="mensaje-info">
      <strong>Motivo de rechazo</strong>
      <p class="motivo-rechazo">{{ propuesta.motivo_rechazo || 'No se indicó un motivo.' }}</p>
    </div>
    <div v-if="guardada" class="mensaje-info" role="status">
      <p>{{ administrativa ? 'Receta actualizada y publicada correctamente.' : publicada ? 'Propuesta de edición enviada. La versión publicada sigue visible.' : rechazado ? 'Corrección reenviada correctamente. Se creó una nueva versión pendiente de aprobación.' : editando ? 'Cambios guardados correctamente. La propuesta continúa pendiente de aprobación.' : 'Tu receta se guardó correctamente y está pendiente de aprobación.' }}</p>
      <RouterLink :to="{ name: administrativa ? 'admin' : editando ? 'mis-recetas' : 'catalogo' }">{{ administrativa ? 'Volver a administración' : editando ? 'Volver a Mis recetas' : 'Volver al catálogo' }}</RouterLink>
    </div>
    <template v-else>
      <p v-if="cargando" role="status">Cargando ingredientes y categorías…</p>
      <div v-else-if="errorCarga" class="mensaje-error" role="alert">
        <p>{{ errorCarga }}</p>
        <button type="button" @click="cargarOpciones">Reintentar</button>
      </div>
      <p v-else-if="(!ingredientes.some(item => item.activo) && !ingredientesOriginales.length) || !categorias.length" role="status">
        Se necesita al menos un ingrediente permitido y una categoría activa para guardar.
      </p>
      <form :aria-busy="guardando" @submit.prevent="guardar">
        <fieldset :disabled="guardando || contenidoGuardado || cargando || !!errorCarga || !auth.autenticado || auth.user?.id !== autorId || (!ingredientes.some(item => item.activo) && !ingredientesOriginales.length) || !categorias.length">
          <legend class="sr-only">Datos de la receta</legend>
          <div class="campo">
            <label for="titulo-receta">Título *</label>
            <input id="titulo-receta" v-model="formulario.titulo" required>
          </div>
          <IngredientesEditor v-model="formulario.ingredientes" :disponibles="ingredientes" :editar-cantidades="editando" />
          <section aria-labelledby="datos-generales">
            <h2 id="datos-generales">Datos generales</h2>
            <label for="descripcion-receta">Descripción (opcional)</label>
            <textarea id="descripcion-receta" v-model="formulario.descripcion" rows="3" />
            <div class="filtros">
              <div class="campo">
                <label for="porciones-receta">Porciones *</label>
                <input id="porciones-receta" v-model="formulario.porciones" type="number" min="1" step="1" required>
              </div>
              <div class="campo">
                <label for="tiempo-receta">Tiempo en minutos (opcional)</label>
                <input id="tiempo-receta" v-model="formulario.tiempo_minutos" type="number" min="1" step="1">
              </div>
              <div class="campo">
                <label for="dificultad-receta">Dificultad (opcional)</label>
                <select id="dificultad-receta" v-model="formulario.dificultad">
                  <option value="">Sin especificar</option>
                  <option value="facil">Fácil</option>
                  <option value="media">Media</option>
                  <option value="dificil">Difícil</option>
                </select>
              </div>
            </div>
          </section>
          <section aria-labelledby="categorias-receta">
            <h2 id="categorias-receta">Categorías</h2>
            <p>Seleccioná al menos una categoría.</p>
            <div class="categorias-seleccion">
              <label v-for="categoria in categorias" :key="categoria.id">
                <input v-model="formulario.categorias" type="checkbox" :value="categoria.id">
                {{ categoria.nombre }}
              </label>
            </div>
          </section>
          <PasosEditor v-model="formulario.pasos" />
          <ImagenRecetaEditor v-model:archivo="archivo" v-model:quitar="quitarImagen" :ruta-inicial="propuesta?.imagen_path || ''" />
          <button type="submit">{{ guardando ? 'Guardando…' : administrativa ? 'Publicar cambios' : publicada ? 'Proponer cambios para aprobación' : rechazado ? 'Reenviar para aprobación' : editando ? 'Guardar cambios' : 'Enviar receta para aprobación' }}</button>
        </fieldset>
        <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      </form>
      <div v-if="errorImagen" class="mensaje-error" role="alert">
        <p>{{ contenidoGuardado ? 'El contenido ya se guardó. No vuelvas a enviarlo.' : 'El contenido todavía no se guardó.' }} {{ errorImagen }}</p>
        <button type="button" :disabled="guardando" @click="reintentarImagen">Reintentar imagen</button>
        <button type="button" :disabled="guardando" @click="continuarSinImagen">Continuar sin cambiar la imagen</button>
      </div>
      <p v-if="guardando && contenidoGuardado" role="status">Guardando imagen…</p>
      <RouterLink v-if="editando && !guardando && !contenidoGuardado" :to="{ name: administrativa ? 'admin' : 'mis-recetas' }">Cancelar sin guardar</RouterLink>
    </template>
  </section>
</template>

<style>
.crear-receta { max-width: 850px; margin-inline: auto; }
.crear-receta fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.crear-receta section { margin-block: 2rem; padding-top: 1.5rem; border-top: 1px solid #e1e6dc; }
.crear-receta textarea { display: block; width: 100%; resize: vertical; font: inherit; color: inherit; background: white; border: 1px solid #b9c5b7; border-radius: 10px; padding: .75rem 1rem; margin-block: .4rem 1rem; }
.crear-receta .lista-editor { list-style: none; padding: 0; }
.crear-receta .lista-editor li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #e1e6dc; }
.crear-receta .lista-editor span { overflow-wrap: anywhere; min-width: 0; }
.crear-receta .acciones-editor { display: flex; gap: .5rem; flex-wrap: wrap; }
.crear-receta .pasos-editor { padding-left: 1.5rem; }
.crear-receta .pasos-editor li { margin-block: 1.5rem; }
.crear-receta .categorias-seleccion { display: flex; gap: 1rem; flex-wrap: wrap; }
.crear-receta .categorias-seleccion label { display: flex; align-items: center; gap: .5rem; }
.crear-receta input[type="checkbox"] { width: auto; }
.crear-receta .mensaje-error { margin-top: 1rem; }
.crear-receta .motivo-rechazo { white-space: pre-wrap; }
.crear-receta .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); }
</style>
