import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { getSupabase } from '@/services/supabase'
import { obtenerPerfil } from '@/services/profiles'

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef(null)
  const perfil = ref(null)
  const inicializado = ref(false)
  const errorPerfil = ref('')
  const autenticado = computed(() => !!user.value)
  const esAdmin = computed(() => autenticado.value && perfil.value?.rol === 'admin')
  let inicializacion
  let revision = 0
  let consultaPerfil = 0
  let perfilPendiente

  function aplicarSesion(session) {
    revision++
    if (user.value?.id !== session?.user?.id || !session) {
      consultaPerfil++
      perfil.value = null
      errorPerfil.value = ''
    }
    user.value = session?.user ?? null
  }

  function actualizarPerfil() {
    const id = user.value?.id
    if (perfilPendiente?.id === id && perfilPendiente.revision === consultaPerfil) {
      return perfilPendiente.promesa
    }
    const consulta = ++consultaPerfil
    errorPerfil.value = ''
    if (!id) {
      perfil.value = null
      return Promise.resolve(null)
    }
    // Conservar el perfil del mismo usuario mientras se refresca evita parpadeos.
    // Los guards siguen esperando el resultado de la consulta antes de autorizar.
    const promesa = (async () => {
      try {
        const resultado = await obtenerPerfil(id)
        if (consulta !== consultaPerfil || user.value?.id !== id) return null
        if (!resultado || resultado.id !== id) {
          perfil.value = null
          errorPerfil.value = 'No se encontró tu perfil. No se habilitarán accesos por rol.'
          return null
        }
        perfil.value = resultado
        return resultado
      } catch {
        if (consulta === consultaPerfil && user.value?.id === id) {
          perfil.value = null
          errorPerfil.value = 'No pudimos consultar tu perfil. Revisá la conexión y los permisos de lectura.'
        }
        return null
      } finally {
        if (perfilPendiente?.revision === consulta) perfilPendiente = null
      }
    })()
    perfilPendiente = { id, revision: consulta, promesa }
    return promesa
  }

  function inicializar() {
    if (!inicializacion) {
      inicializacion = (async () => {
        try {
          const { auth } = getSupabase()
          // No esperar métodos Auth ni consultas Axios dentro del callback:
          // getSession podría quedar bloqueado por el lock interno de Supabase.
          auth.onAuthStateChange((evento, session) => {
            aplicarSesion(session)
            if (session && ['SIGNED_IN', 'USER_UPDATED'].includes(evento)) {
              setTimeout(() => { actualizarPerfil() }, 0)
            }
          })
          const antes = revision
          const { data, error } = await auth.getSession()
          if (error) throw error
          if (antes === revision) aplicarSesion(data.session)
          await actualizarPerfil()
        } catch {
          aplicarSesion(null)
        } finally {
          inicializado.value = true
        }
      })()
    }
    return inicializacion
  }

  async function ingresar(email, password) {
    await inicializar()
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
    aplicarSesion(data.session)
    await actualizarPerfil()
  }

  async function registrar(nombre, email, password) {
    await inicializar()
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { nombre },
        emailRedirectTo: new URL(`${import.meta.env.BASE_URL}login`, window.location.origin).href,
      },
    })
    if (error) throw error
    if (data.session) {
      aplicarSesion(data.session)
      await actualizarPerfil()
    }
    return { requiereConfirmacion: !data.session }
  }

  async function cerrarSesion() {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
    aplicarSesion(null)
  }

  return {
    user, perfil, inicializado, autenticado, esAdmin, errorPerfil,
    inicializar, actualizarPerfil, ingresar, registrar, cerrarSesion,
  }
})
