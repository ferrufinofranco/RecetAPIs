import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'

export const useAsistenteStore = defineStore('asistente', () => {
  const auth = useAuthStore()
  const turnos = ref([])

  function limpiar() {
    turnos.value = []
  }

  watch(() => auth.user?.id, limpiar, { flush: 'sync' })

  return { turnos, limpiar }
})
