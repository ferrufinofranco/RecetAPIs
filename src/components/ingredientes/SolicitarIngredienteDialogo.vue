<script setup>
import { nextTick, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { solicitarIngrediente, errorSolicitud } from '@/services/solicitudes'

const auth = useAuthStore()
const emit = defineEmits(['enviada'])
const abierto = ref(false)
const dialogo = ref(null)
const disparador = ref(null)
const entrada = ref(null)
const volver = ref(null)
const nombre = ref('')
const enviando = ref(false)
const error = ref('')
const exito = ref('')

async function abrir() {
  error.value = ''
  exito.value = ''
  abierto.value = true
  await nextTick()
  dialogo.value.showModal()
  entrada.value.focus()
}

async function cerrar() {
  if (enviando.value) return
  dialogo.value.close()
  abierto.value = false
  await nextTick()
  disparador.value?.focus()
}

async function enviar() {
  if (enviando.value || !auth.autenticado) return
  enviando.value = true
  error.value = ''
  try {
    await solicitarIngrediente(nombre.value)
    emit('enviada')
    nombre.value = ''
    exito.value = 'Solicitud enviada. Quedó pendiente de resolución. No se agregó a la receta.'
    await nextTick()
    volver.value?.focus()
  } catch (err) {
    error.value = errorSolicitud(err)
    await nextTick()
    entrada.value?.focus()
  }
  finally { enviando.value = false }
}
</script>

<template>
  <button ref="disparador" type="button" class="boton-solicitud" aria-haspopup="dialog" @click="abrir">¿No encontrás el ingrediente? Solicitá uno nuevo</button>
  <Teleport to="body">
    <dialog v-if="abierto" ref="dialogo" class="solicitud-dialogo" aria-labelledby="titulo-solicitud" aria-describedby="ayuda-solicitud" @cancel.prevent="cerrar">
      <h2 id="titulo-solicitud">Solicitar ingrediente</h2>
      <p id="ayuda-solicitud">Ingresá el nombre del ingrediente. La solicitud no lo agrega a la receta. Podrás consultar su estado en «Ver mis solicitudes», dentro de Ingredientes.</p>
      <form v-if="!exito" :aria-busy="enviando" @submit.prevent.stop="enviar">
        <label for="nombre-solicitado">Nombre del ingrediente</label>
        <input id="nombre-solicitado" ref="entrada" v-model="nombre" required maxlength="120" :readonly="enviando" :aria-invalid="!!error" :aria-describedby="error ? 'error-solicitud' : undefined">
        <p v-if="error" id="error-solicitud" class="mensaje-error" role="alert">{{ error }}</p>
        <p v-if="enviando" role="status">Enviando solicitud…</p>
        <div class="dialogo-acciones">
          <button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Solicitar ingrediente' }}</button>
          <button type="button" class="boton-secundario" :disabled="enviando" @click="cerrar">Cancelar</button>
        </div>
      </form>
      <template v-else>
        <p class="mensaje-info" role="status">{{ exito }}</p>
        <button ref="volver" type="button" @click="cerrar">Volver a la receta</button>
      </template>
    </dialog>
  </Teleport>
</template>

<style scoped>
.boton-solicitud { margin-top: .65rem; text-align: left; background: transparent; color: #365f40; border: 0; border-radius: 0; }
.boton-solicitud:hover { text-decoration: underline; text-underline-offset: 4px; }
.boton-solicitud:focus-visible { outline: 3px solid #b56825; outline-offset: 3px; }
.solicitud-dialogo { width: min(480px, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 1.25rem; border: 1px solid #b9c5b7; border-radius: 14px; color: #27372b; background: #faf9f5; }
.solicitud-dialogo::backdrop { background: #27372b99; }
.solicitud-dialogo h2 { margin-bottom: .5rem; }
.solicitud-dialogo input, .solicitud-dialogo button { min-height: 44px; }
label { display: block; font-weight: 600; margin-bottom: .35rem; }
.dialogo-acciones { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
</style>
