import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { eliminarReceta } from '@/services/recetas'

export function useEliminarReceta({ administrativo = false } = {}) {
  const auth = useAuthStore()
  const eliminandoId = ref(null)
  const errorBaja = ref('')
  const exitoBaja = ref('')

  async function eliminar(receta, recargar) {
    if (eliminandoId.value !== null || !auth.autenticado || (administrativo && !auth.esAdmin)) return
    if (!window.confirm(`¿Eliminar la receta «${receta.titulo}»?\n\nDejará de estar disponible y sus propuestas pendientes se descartarán. Se conservará el historial. No hay restauración desde esta aplicación.`)) return
    eliminandoId.value = receta.id
    errorBaja.value = ''
    exitoBaja.value = ''
    try {
      if (administrativo) {
        const perfil = await auth.actualizarPerfil()
        if (!auth.autenticado || perfil?.id !== auth.user?.id || perfil?.rol !== 'admin') {
          errorBaja.value = 'No pudimos verificar tus permisos de administrador.'
          return
        }
      }
      await eliminarReceta(receta.id)
      exitoBaja.value = 'Receta eliminada correctamente. Se conserva su historial.'
      await recargar()
    } catch (error) {
      if ([401, 403].includes(error.response?.status) || error.response?.data?.code === '42501') {
        errorBaja.value = 'No tenés permisos para eliminar esta receta o tu sesión venció.'
      } else {
        errorBaja.value = 'No se pudo confirmar la eliminación. Actualizá el listado antes de reintentar; la receta puede haber sido eliminada por otra sesión.'
      }
    } finally {
      eliminandoId.value = null
    }
  }

  return { eliminandoId, errorBaja, exitoBaja, eliminar }
}
