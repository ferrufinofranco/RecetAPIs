// Recibe el store explícitamente para poder verificar la autorización sin red.
export function crearAuthGuard(auth) {
  return async (to) => {
    await auth.inicializar()
    if (to.meta.requiereAuth && !auth.autenticado) return { name: 'login' }
    if (to.meta.rol) {
      const id = auth.user?.id
      const perfil = await auth.actualizarPerfil()
      if (!auth.autenticado) return { name: 'login' }
      if (!id || auth.user?.id !== id || perfil?.id !== id || perfil?.rol !== to.meta.rol) {
        return { name: 'acceso-denegado' }
      }
    }
    if (to.meta.soloInvitados && auth.autenticado) return { name: 'catalogo' }
    return true
  }
}
