<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({ registro: { type: Boolean, default: false } })
const auth = useAuthStore()
const router = useRouter()
const nombre = ref('')
const email = ref('')
const password = ref('')
const enviando = ref(false)
const error = ref('')
const mensaje = ref('')

async function enviar() {
  if (enviando.value) return
  enviando.value = true
  error.value = ''
  mensaje.value = ''
  try {
    if (props.registro) {
      if (!nombre.value.trim()) {
        error.value = 'Ingresá tu nombre.'
        return
      }
      const resultado = await auth.registrar(nombre.value.trim(), email.value.trim(), password.value)
      if (resultado.requiereConfirmacion) {
        mensaje.value = 'Revisá tu correo y confirmá tu dirección antes de iniciar sesión. Si la cuenta ya existe, intentá ingresar.'
        return
      }
    } else {
      await auth.ingresar(email.value.trim(), password.value)
    }
    await router.replace({ name: 'catalogo' })
  } catch (err) {
    if (err.code === 'email_not_confirmed') {
      error.value = 'Confirmá tu correo electrónico antes de iniciar sesión.'
    } else if (err.code === 'invalid_credentials') {
      error.value = 'Email o contraseña incorrectos.'
    } else if (err.code === 'weak_password') {
      error.value = 'La contraseña no cumple los requisitos de seguridad de Supabase.'
    } else {
      error.value = 'No se pudo completar la solicitud. Revisá los datos, la conexión y volvé a intentar.'
    }
  } finally {
    password.value = ''
    enviando.value = false
  }
}
</script>

<template>
  <form class="auth-form" :aria-busy="enviando" @submit.prevent="enviar">
    <fieldset :disabled="enviando">
      <div v-if="registro" class="campo">
        <label for="nombre">Nombre</label>
        <input id="nombre" v-model="nombre" name="nombre" autocomplete="name" required maxlength="120">
      </div>
      <div class="campo">
        <label for="email">Email</label>
        <input id="email" v-model="email" name="email" type="email" autocomplete="email" required>
      </div>
      <div class="campo">
        <label for="password">Contraseña</label>
        <input id="password" v-model="password" name="password" type="password"
          :autocomplete="registro ? 'new-password' : 'current-password'"
          :minlength="registro ? 6 : undefined" required>
      </div>
      <p v-if="registro" class="dato">Usá al menos 6 caracteres. Supabase puede exigir requisitos adicionales.</p>
      <button type="submit">{{ enviando ? 'Procesando…' : registro ? 'Crear cuenta' : 'Iniciar sesión' }}</button>
    </fieldset>
    <p v-if="error" role="alert" class="mensaje-error">{{ error }}</p>
    <p v-if="mensaje" role="status" class="mensaje-info">{{ mensaje }}</p>
  </form>
</template>
