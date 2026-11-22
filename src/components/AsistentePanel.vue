<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CategoriaEtiquetas from '@/components/CategoriaEtiquetas.vue'
import IconoAsistente from '@/components/IconoAsistente.vue'
import { consultarAsistente, MAX_HISTORIAL, MAX_MENSAJE } from '@/services/asistente'
import { useAsistenteStore } from '@/stores/asistente'
import { useAuthStore } from '@/stores/auth'
import { dificultadLegible, duracionLegible } from '@/utils/presentacionReceta'

const props = defineProps({ abierto: Boolean })
const emit = defineEmits(['cerrar'])
const auth = useAuthStore()
const asistente = useAsistenteStore()
const texto = ref('')
const pendiente = ref('')
const error = ref('')
const campo = ref(null)
const conversacion = ref(null)
const panel = ref(null)
const botonCerrar = ref(null)
let seguirFinal = true
let solicitud

const sugerencias = [
  'Tengo arroz, pollo y cebolla',
  'Quiero preparar algo rápido',
  '¿Con qué puedo reemplazar la manteca?',
  'Busco una receta vegetariana',
]
const errores = {
  sesion: 'Iniciá sesión para utilizar el asistente',
  limite_diario: 'Alcanzaste tu límite de consultas de hoy',
  mensaje_invalido: `Ingresá un mensaje de hasta ${MAX_MENSAJE} caracteres.`,
  ocupado: 'El asistente está temporalmente ocupado',
}
const sePuedeEnviar = computed(() => auth.autenticado && !pendiente.value && !!texto.value.trim() && texto.value.length <= MAX_MENSAJE)

function cancelar() {
  solicitud?.abort()
  solicitud = undefined
  pendiente.value = ''
}

function limpiarEditor() {
  cancelar()
  texto.value = ''
  error.value = ''
}

async function nuevaConversacion() {
  limpiarEditor()
  asistente.limpiar()
  await nextTick()
  campo.value?.focus({ preventScroll: true })
}

watch(() => auth.user?.id, limpiarEditor, { flush: 'sync' })
const viewport = window.visualViewport
function ajustarViewport() {
  if (!props.abierto || !viewport) return
  panel.value?.style.setProperty('--asistente-alto', `${viewport.height}px`)
  panel.value?.style.setProperty('--asistente-arriba', `${viewport.offsetTop}px`)
}

function sincronizarPanel() {
  if (props.abierto && !panel.value.open) {
    ajustarViewport()
    panel.value.showModal()
    botonCerrar.value?.focus({ preventScroll: true })
    desplazarConversacion()
  } else if (!props.abierto && panel.value.open) {
    panel.value.close()
  }
}

onMounted(() => {
  sincronizarPanel()
  viewport?.addEventListener('resize', ajustarViewport)
  viewport?.addEventListener('scroll', ajustarViewport)
})
onBeforeUnmount(() => {
  cancelar()
  viewport?.removeEventListener('resize', ajustarViewport)
  viewport?.removeEventListener('scroll', ajustarViewport)
})
watch(() => props.abierto, sincronizarPanel, { flush: 'post' })

function registrarScroll() {
  const cuerpo = conversacion.value
  if (props.abierto && cuerpo) seguirFinal = cuerpo.scrollHeight - cuerpo.clientHeight - cuerpo.scrollTop < 48
}

function desplazarConversacion() {
  if (props.abierto && seguirFinal && conversacion.value) conversacion.value.scrollTop = conversacion.value.scrollHeight
}
watch([() => asistente.turnos.length, pendiente], desplazarConversacion, { flush: 'post' })

function elegirSugerencia(sugerencia) {
  texto.value = sugerencia
  conversacion.value?.focus({ preventScroll: true })
  void enviar()
}

function enviarConEnter(evento) {
  if (evento.shiftKey || evento.isComposing || evento.keyCode === 229) return
  evento.preventDefault()
  void enviar()
}

async function enviar() {
  if (!sePuedeEnviar.value) return
  const pregunta = texto.value.trim()
  const historial = asistente.turnos.slice(-(MAX_HISTORIAL / 2)).flatMap(({ pregunta, resultado }) => [
    { role: 'user', content: pregunta },
    { role: 'assistant', content: resultado.respuesta, recetas: resultado.recomendaciones.map(({ id }) => id) },
  ])
  const controlador = new AbortController()
  solicitud = controlador
  seguirFinal = true
  error.value = ''
  pendiente.value = pregunta
  texto.value = ''

  try {
    const resultado = await consultarAsistente(pregunta, historial, controlador.signal)
    if (solicitud !== controlador) return
    if (typeof resultado?.respuesta !== 'string' || !Array.isArray(resultado.recomendaciones)) {
      error.value = errores[resultado?.codigo] ?? errores.ocupado
      texto.value = pregunta
      return
    }
    asistente.turnos.push({ pregunta, resultado })
  } catch {
    if (solicitud !== controlador) return
    error.value = errores.ocupado
    texto.value = pregunta
  } finally {
    if (solicitud === controlador) {
      solicitud = undefined
      pendiente.value = ''
    }
  }
}
</script>

<template>
  <dialog id="asistente-panel" ref="panel" class="asistente" aria-labelledby="titulo-asistente"
    aria-describedby="descripcion-asistente" @cancel.prevent="emit('cerrar')" @click.self="emit('cerrar')">
    <header class="asistente-cabecera">
      <div class="asistente-identidad">
        <span class="asistente-icono"><IconoAsistente /></span>
        <div>
          <h2 id="titulo-asistente">Asistente RecetAPIs</h2>
          <p id="descripcion-asistente">Tu compañero de cocina</p>
        </div>
        <button ref="botonCerrar" type="button" class="boton-secundario asistente-cerrar"
          aria-label="Cerrar asistente y volver al sitio" autofocus @click="emit('cerrar')">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <button v-if="auth.autenticado" type="button" class="boton-secundario asistente-nueva"
        :disabled="!(asistente.turnos.length || pendiente || texto)" @click="nuevaConversacion">Nueva conversación</button>
    </header>

    <div ref="conversacion" class="asistente-cuerpo" role="region" aria-label="Contenido de la conversación"
      tabindex="0" @scroll="registrarScroll">
      <div v-if="!auth.autenticado" class="mensaje-info">
        <p>{{ errores.sesion }}</p>
        <RouterLink :to="{ name: 'login', query: { volver: 'asistente' } }">Iniciar sesión</RouterLink>
      </div>
      <template v-else>
        <div v-if="!asistente.turnos.length && !pendiente" class="asistente-inicio">
          <h3>¿Qué cocinamos hoy?</h3>
          <p>Puedo ayudarte a encontrar recetas, aprovechar tus ingredientes o resolver dudas de cocina</p>
          <ul class="asistente-sugerencias" aria-label="Preguntas sugeridas">
            <li v-for="sugerencia in sugerencias" :key="sugerencia">
              <button type="button" class="boton-secundario" @click="elegirSugerencia(sugerencia)">{{ sugerencia }}</button>
            </li>
          </ul>
        </div>

        <div v-show="asistente.turnos.length || pendiente" class="asistente-conversacion"
          role="log" aria-label="Historial de mensajes">
          <ol>
            <template v-for="({ pregunta, resultado }, indice) in asistente.turnos" :key="indice">
              <li class="asistente-mensaje asistente-usuario">
                <strong>Vos</strong>
                <p>{{ pregunta }}</p>
              </li>
              <li class="asistente-mensaje asistente-respuesta">
                <strong>Asistente</strong>
                <p>{{ resultado.respuesta }}</p>
                <p v-if="resultado.sinCoincidencias">No encontré recetas que coincidan, pero puedo sugerirte otras alternativas</p>
                <div v-if="resultado.recomendaciones.length" class="asistente-recomendaciones">
                  <h3>Recetas del catálogo</h3>
                  <article v-for="receta in resultado.recomendaciones" :key="receta.id" class="asistente-receta">
                    <h4><RouterLink :to="{ name: 'receta', params: { id: receta.id } }">{{ receta.titulo }}</RouterLink></h4>
                    <p v-if="receta.tiempoMinutos || receta.dificultad" class="dato">
                      {{ [duracionLegible(receta.tiempoMinutos), dificultadLegible(receta.dificultad)].filter(Boolean).join(' · ') }}
                    </p>
                    <CategoriaEtiquetas v-if="receta.categorias.length" :categorias="receta.categorias" />
                    <p>{{ receta.motivo }}</p>
                    <p v-if="receta.faltantes.length"><strong>Podrían faltarte</strong> {{ receta.faltantes.join(', ') }}.</p>
                  </article>
                </div>
                <p v-if="resultado.avisoAlergias" class="asistente-alergias">
                  Revisá los ingredientes, las etiquetas y el riesgo de contaminación cruzada antes de cocinar.
                </p>
              </li>
            </template>
            <li v-if="pendiente" class="asistente-mensaje asistente-usuario">
              <strong>Vos</strong>
              <p>{{ pendiente }}</p>
            </li>
          </ol>
        </div>

        <p v-if="pendiente" class="dato asistente-espera" role="status">El asistente está preparando su respuesta…</p>
        <p v-if="error" class="mensaje-error asistente-error" role="alert">{{ error }}</p>
      </template>
    </div>

    <form v-if="auth.autenticado" class="asistente-form campo" @submit.prevent="enviar()">
      <label for="asistente-mensaje">Tu mensaje</label>
      <div class="asistente-compositor">
        <textarea id="asistente-mensaje" ref="campo" v-model="texto" :maxlength="MAX_MENSAJE" rows="1"
          placeholder="Escribí tu consulta" :readonly="!!pendiente" @keydown.enter="enviarConEnter"></textarea>
        <button type="submit" :disabled="!sePuedeEnviar">Enviar</button>
      </div>
      <p class="dato asistente-teclado">Enter para enviar · Shift+Enter para un salto de línea</p>
    </form>
  </dialog>
</template>

<style scoped>
:global(html:has(.asistente[open])) { overflow: hidden; }
.asistente {
  position: fixed;
  inset: var(--asistente-arriba, 0px) 0 auto auto;
  width: min(420px, 100%);
  max-width: none;
  height: 100vh;
  height: var(--asistente-alto, 100dvh);
  max-height: none;
  container-type: size;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-inline-start: 1px solid var(--borde);
  background: var(--superficie);
  color: var(--texto);
  box-shadow: -8px 0 32px var(--sombra-desplegable);
}
.asistente[open] { display: flex; flex-direction: column; animation: deslizar .22s ease-out; }
.asistente::backdrop { background: var(--fondo-modal); }
@keyframes deslizar { from { transform: translateX(100%); } to { transform: translateX(0); } }
.asistente-cabecera, .asistente-cuerpo, .asistente-form {
  padding: .9rem max(1rem, env(safe-area-inset-right)) .9rem max(1rem, env(safe-area-inset-left));
}
.asistente-cabecera {
  flex: none;
  padding-top: max(.9rem, env(safe-area-inset-top));
  border-bottom: 1px solid var(--borde);
  background: var(--superficie-calida);
}
.asistente-identidad { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .65rem; align-items: center; }
.asistente-icono { display: grid; place-items: center; width: 2.45rem; height: 2.45rem; border-radius: 12px; background: var(--etiqueta-fondo); color: var(--enlace); }
.asistente-cabecera h2 { margin: 0; font-size: 1.12rem; }
.asistente-cabecera p { margin: .1rem 0 0; color: var(--texto-secundario); font-size: .85rem; }
.asistente-cerrar { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; }
.asistente-nueva { margin-top: .65rem; padding: .35rem .7rem; font-size: .85rem; }
.asistente-nueva:disabled { cursor: default; }
.asistente-cuerpo { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; overflow-wrap: anywhere; }
.asistente-cuerpo:focus-visible { outline-offset: -4px; }
.asistente .mensaje-info p { margin-bottom: .4rem; }
.asistente-inicio h3 { margin: .3rem 0 .4rem; font-size: 1.35rem; line-height: 1.3; }
.asistente-inicio > p { color: var(--texto-secundario); margin-bottom: 1rem; }
.asistente-sugerencias, .asistente-conversacion ol { padding: 0; margin: 0; list-style: none; }
.asistente-sugerencias { display: grid; gap: .5rem; }
.asistente-sugerencias button { width: 100%; text-align: start; padding: .6rem .75rem; }
.asistente .boton-secundario:hover:enabled { background: var(--etiqueta-fondo); }
.asistente-conversacion ol { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
.asistente-mensaje { padding: .85rem 1rem; border-radius: 14px; overflow-wrap: anywhere; min-width: 0; }
.asistente-usuario { justify-self: end; width: fit-content; max-width: 82%; background: var(--etiqueta-fondo); }
.asistente-respuesta { background: var(--superficie-calida); border: 1px solid var(--borde); }
.asistente-mensaje > p { white-space: pre-wrap; margin: .35rem 0 0; }
.asistente-recomendaciones { display: grid; gap: .65rem; margin-top: 1rem; }
.asistente-recomendaciones h3 { margin: 0; font-size: .95rem; }
.asistente-receta { border: 1px solid var(--borde); padding: .75rem; border-radius: 10px; background: var(--superficie); }
.asistente-receta h4 { margin: 0 0 .3rem; font-size: 1rem; }
.asistente-receta :deep(.etiquetas) { margin-bottom: .45rem; }
.asistente-receta p { margin-bottom: .35rem; }
.asistente-receta p:last-child { margin-bottom: 0; }
.asistente-alergias { padding: .75rem; border-radius: 10px; background: var(--advertencia-fondo); color: var(--advertencia-texto); }
.asistente-form { flex: none; border-top: 1px solid var(--borde); background: var(--superficie-calida); padding-bottom: max(.9rem, env(safe-area-inset-bottom)); }
.asistente-compositor { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: end; }
.asistente-compositor textarea {
  min-height: 3rem;
  max-height: min(8rem, 25dvh);
  width: 100%;
  resize: vertical;
  font: inherit;
  color: var(--texto-control);
  background: var(--superficie);
  padding: .65rem .8rem;
  border: 1px solid var(--borde-control);
  border-radius: 10px;
}
.asistente-error, .asistente-espera { margin: .75rem 0 0; }
.asistente-teclado { margin: .4rem 0 0; }
@media (min-width: 601px) and (max-width: 850px) {
  .asistente { width: clamp(350px, 55vw, 420px); }
}
@media (max-width: 600px) {
  .asistente { width: 100%; border: 0; }
  .asistente-usuario { max-width: 92%; }
}
@media (pointer: coarse), (max-height: 500px) { .asistente-teclado { display: none; } }
@container (max-height: 320px) {
  .asistente-cabecera { padding-block: max(.4rem, env(safe-area-inset-top)) .4rem; }
  .asistente-form { padding-block: .4rem max(.4rem, env(safe-area-inset-bottom)); }
  .asistente-cabecera p, .asistente-teclado { display: none; }
  .asistente-nueva { margin-top: .2rem; }
}
@media (prefers-reduced-motion: reduce) { .asistente[open] { animation: none; } }
</style>
