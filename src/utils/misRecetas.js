export function resumirRecetaPropia(receta) {
  const versiones = [...(receta.receta_versiones ?? [])].sort((a, b) => b.numero - a.numero)
  const publicada = versiones.find((version) => version.estado === 'publicada')
  const propuesta = versiones.find((version) => ['pendiente', 'rechazada'].includes(version.estado))
  const principal = publicada ?? propuesta
  if (!principal) return null
  const cambiosPendientes = !!publicada && versiones.some((version) => version.estado === 'pendiente')
  // Un rechazo de una propuesta posterior no cambia el estado de la versión pública.
  const rechazo = principal.estado === 'rechazada' ? principal
    : propuesta?.estado === 'rechazada' && propuesta.numero > principal.numero ? propuesta : null
  return {
    id: String(receta.id),
    titulo: principal.titulo,
    creadaEn: receta.creada_en,
    estado: principal.estado,
    versionEditableId: publicada ? versiones.find((version) => version.estado === 'pendiente')?.id ?? null : principal.id,
    cambiosPendientes,
    motivoRechazo: rechazo?.motivo_rechazo ?? null,
  }
}

export function filtrarMisRecetas(recetas, estado) {
  return estado === 'todas' ? recetas : recetas.filter((receta) => receta.estado === estado)
}
