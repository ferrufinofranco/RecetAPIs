<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useCambiosSinGuardar } from '@/composables/useCambiosSinGuardar'
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
import SelectorCategorias from './SelectorCategorias.vue'

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
const contenidoInicial = JSON.stringify(formulario)
const editorIngredientes = ref(null)
const editorPasos = ref(null)
const formElement = ref(null)
const campoError = ref('')
const pendiente = computed(() => !guardada.value && (
  JSON.stringify(formulario) !== contenidoInicial || !!archivo.value || quitarImagen.value
  || editorIngredientes.value?.hayBorrador || editorPasos.value?.hayBorrador
))
useCambiosSinGuardar(pendiente)

const destinosError = {
  titulo: '#titulo-receta', porciones: '#porciones-receta', tiempo: '#tiempo-receta', dificultad: '#dificultad-receta',
  ingredientes: '#ingredientes-editor', categorias: '#categorias-receta', pasos: '#preparacion-editor',
}
function identificarCampo(mensaje) {
  if (/título/i.test(mensaje)) return 'titulo'
  if (/porciones/i.test(mensaje)) return 'porciones'
  if (/tiempo/i.test(mensaje)) return 'tiempo'
  if (/dificultad/i.test(mensaje)) return 'dificultad'
  if (/ingrediente|cantidad|unidad/i.test(mensaje)) return 'ingredientes'
  if (/categoría/i.test(mensaje)) return 'categorias'
  if (/paso/i.test(mensaje)) return 'pasos'
  return ''
}
function atributosError(campo) {
  return campoError.value === campo ? { 'aria-invalid': 'true', 'aria-describedby': `error-${campo}` } : {}
}
async function enfocarError() {
  await nextTick()
  const destino = formElement.value?.querySelector(destinosError[campoError.value] || '#error-guardado')
  if (!destino) return
  if (!destino.matches('input, select, textarea')) destino.setAttribute('tabindex', '-1')
  destino.focus()
}
function errorNativo(evento) {
  evento.preventDefault()
  const campo = evento.target
  // El navegador dispara invalid por cada control: conservar el primero.
  const primero = [...formElement.value.querySelectorAll('input, select, textarea')].find(item => !item.validity.valid)
  if (campo !== primero) return
  error.value = campo.validationMessage
  campoError.value = identificarCampo(campo.id)
  if (campo.id === 'titulo-receta') campoError.value = 'titulo'
  if (campo.id.startsWith('paso-')) campoError.value = 'pasos'
  if (campo.id.startsWith('cantidad-')) campoError.value = 'ingredientes'
  nextTick(() => campo.focus())
}
const errorImagen = ref('')
const panelErrorImagen = ref(null)
watch(errorImagen, async (mensaje) => {
  if (!mensaje) return
  await nextTick()
  panelErrorImagen.value?.focus()
})
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
  campoError.value = ''
  if (!auth.autenticado || auth.user?.id !== autorId) {
    error.value = 'La sesión cambió. Volvé a ingresar al formulario con tu cuenta.'
    enfocarError()
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
    campoError.value = err instanceof ErrorCrearReceta ? identificarCampo(err.message) : ''
  } finally {
    guardando.value = false
    if (error.value) enfocarError()
  }
}

onMounted(cargarOpciones)
</script>

<template>
  <section class="crear-receta" :class="{ 'crear-receta--amplia': !administrativa }" aria-labelledby="titulo-crear">
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
      <form ref="formElement" :aria-busy="guardando" @submit.prevent="guardar" @invalid.capture="errorNativo">
        <p v-if="error" id="error-guardado" class="mensaje-error" role="alert">{{ error }}</p>
        <fieldset :disabled="guardando || contenidoGuardado || cargando || !!errorCarga || !auth.autenticado || auth.user?.id !== autorId || (!ingredientes.some(item => item.activo) && !ingredientesOriginales.length) || !categorias.length">
          <legend class="sr-only">Datos de la receta</legend>
          <div class="receta-columnas">
            <div class="receta-columna receta-columna--general">
              <section aria-labelledby="datos-generales">
                <h2 id="datos-generales">Información general</h2>
                <div class="informacion-grid">
                  <div class="campo">
                    <label for="titulo-receta">Título *</label>
                    <input id="titulo-receta" v-model="formulario.titulo" required v-bind="atributosError('titulo')">
                    <p v-if="campoError === 'titulo'" id="error-titulo" class="error-contextual">{{ error }}</p>
                  </div>
                  <div class="campo">
                    <label for="descripcion-receta">Descripción (opcional)</label>
                    <textarea id="descripcion-receta" v-model="formulario.descripcion" rows="2" />
                  </div>
                </div>
                <div class="datos-grid">
                  <div class="campo">
                    <label for="porciones-receta">Porciones *</label>
                    <input id="porciones-receta" v-model="formulario.porciones" type="number" min="1" step="1" required v-bind="atributosError('porciones')">
                    <p v-if="campoError === 'porciones'" id="error-porciones" class="error-contextual">{{ error }}</p>
                  </div>
                  <div class="campo">
                    <label for="tiempo-receta">Duración (min, opcional)</label>
                    <input id="tiempo-receta" v-model="formulario.tiempo_minutos" type="number" min="1" step="1" v-bind="atributosError('tiempo')">
                    <p v-if="campoError === 'tiempo'" id="error-tiempo" class="error-contextual">{{ error }}</p>
                  </div>
                  <div class="campo">
                    <label for="dificultad-receta">Dificultad (opcional)</label>
                    <select id="dificultad-receta" v-model="formulario.dificultad" v-bind="atributosError('dificultad')">
                      <option value="">Sin especificar</option>
                      <option value="facil">Fácil</option>
                      <option value="media">Media</option>
                      <option value="dificil">Difícil</option>
                    </select>
                    <p v-if="campoError === 'dificultad'" id="error-dificultad" class="error-contextual">{{ error }}</p>
                  </div>
                </div>
              </section>
              <section aria-labelledby="categorias-receta">
                <h2 id="categorias-receta" :aria-describedby="campoError === 'categorias' ? 'error-categorias' : undefined">Categorías</h2>
                <p v-if="campoError === 'categorias'" id="error-categorias" class="error-contextual">{{ error }}</p>
                <p>Seleccioná al menos una categoría.</p>
                <SelectorCategorias v-model="formulario.categorias" :opciones="categorias" :invalido="campoError === 'categorias'"
                  :descripcion="campoError === 'categorias' ? 'error-categorias' : undefined" />
              </section>
              <ImagenRecetaEditor v-if="!administrativa" v-model:archivo="archivo" v-model:quitar="quitarImagen" :ruta-inicial="propuesta?.imagen_path || ''" />
            </div>
            <div class="receta-columna receta-columna--preparacion">
               <IngredientesEditor ref="editorIngredientes" v-model="formulario.ingredientes" :disponibles="ingredientes" :historial-personal="!administrativa" :error-validacion="campoError === 'ingredientes' ? error : ''" editar-cantidades />
               <PasosEditor ref="editorPasos" v-model="formulario.pasos" :error-validacion="campoError === 'pasos' ? error : ''" />
            </div>
          </div>
          <ImagenRecetaEditor v-if="administrativa" v-model:archivo="archivo" v-model:quitar="quitarImagen" :ruta-inicial="propuesta?.imagen_path || ''" />
          <div class="guardar-receta">
            <button type="submit">{{ guardando ? 'Guardando…' : administrativa ? 'Publicar cambios' : publicada ? 'Proponer cambios para aprobación' : rechazado ? 'Reenviar para aprobación' : editando ? 'Guardar cambios' : 'Enviar receta para aprobación' }}</button>
          </div>
        </fieldset>
      </form>
      <div v-if="errorImagen" ref="panelErrorImagen" tabindex="-1" class="mensaje-error" role="alert" :aria-busy="guardando">
        <p>{{ contenidoGuardado ? 'El contenido ya se guardó. No vuelvas a enviarlo.' : 'El contenido todavía no se guardó.' }} {{ errorImagen }}</p>
        <button type="button" :disabled="guardando" @click="reintentarImagen">Reintentar imagen</button>
        <button type="button" :disabled="guardando" @click="continuarSinImagen">Continuar sin cambiar la imagen</button>
      </div>
      <p v-if="guardando && contenidoGuardado" role="status">Guardando imagen…</p>
      <p v-else-if="guardando" role="status">Guardando receta…</p>
      <RouterLink v-if="editando && !guardando && !contenidoGuardado" :to="{ name: administrativa ? 'admin' : 'mis-recetas' }">Cancelar sin guardar</RouterLink>
    </template>
  </section>
</template>

<style>
.crear-receta { max-width: 850px; margin-inline: auto; }
.crear-receta fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.crear-receta section { margin-block: .85rem; padding-top: .85rem; border-top: 1px solid var(--borde); }
.crear-receta h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin-bottom: .75rem; }
.crear-receta h2 { margin-bottom: .5rem; }
.crear-receta section p { margin-bottom: .5rem; }
.crear-receta input, .crear-receta select, .crear-receta button { padding: .45rem .65rem; min-height: 44px; min-width: 0; }
.crear-receta textarea { display: block; width: 100%; resize: vertical; font: inherit; color: inherit; background: var(--superficie); border: 1px solid var(--borde-control); border-radius: 10px; padding: .5rem .65rem; margin: .25rem 0 .65rem; }
.crear-receta .campo { min-width: 0; margin-bottom: .65rem; }
.crear-receta .campo label { margin-bottom: .25rem; }
.crear-receta .informacion-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: .75rem; align-items: start; }
.crear-receta .informacion-grid textarea { margin-bottom: 0; }
.crear-receta .datos-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.crear-receta .guardar-receta { padding-top: .75rem; border-top: 1px solid var(--borde); }
.crear-receta .lista-editor { list-style: none; padding: 0; margin-block: .5rem 0; }
.crear-receta .lista-editor li { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .5rem 0; border-bottom: 1px solid var(--borde); }
.crear-receta .lista-editor span { overflow-wrap: anywhere; min-width: 0; }
.crear-receta .acciones-editor { display: flex; gap: .5rem; flex-wrap: wrap; }
.crear-receta .pasos-editor { list-style: none; padding: 0; margin-block: .5rem 0; }
.crear-receta .pasos-editor li { margin-block: .5rem; }
.crear-receta .mensaje-error { margin-top: 1rem; }
.crear-receta .motivo-rechazo { white-space: pre-wrap; }
.crear-receta .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); }
/* Solo el formulario público: las vistas y la edición administrativa conservan su ancho. */
.crear-receta--amplia { max-width: 1280px; }
.crear-receta--amplia .receta-columnas { display: grid; grid-template-columns: minmax(0, 1fr); gap: .85rem; margin-block: .85rem; }
.crear-receta--amplia .receta-columna { min-width: 0; display: grid; align-content: start; gap: .85rem; }
.crear-receta--amplia .receta-columna > section { min-width: 0; margin-block: 0; }
.crear-receta--amplia .datos-grid { align-items: end; }
.crear-receta--amplia .guardar-receta { display: flex; justify-content: flex-end; padding-block: 1rem; }
@media (min-width: 1100px) {
  main.contenedor.contenido:has(.crear-receta--amplia) { width: min(1280px, calc(100% - 3rem)); }
  .crear-receta--amplia .receta-columnas { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 1.5rem; }
  .crear-receta--amplia .informacion-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
@media (max-width: 600px) {
  .crear-receta .informacion-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .crear-receta .datos-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .crear-receta .datos-grid .campo:last-child { grid-column: 1 / -1; }
  .crear-receta .guardar-receta button { width: 100%; }
}
</style>
