export function formularioDesdePropuesta(version) {
  return {
    titulo: version.titulo,
    descripcion: version.descripcion ?? '',
    porciones: version.porciones,
    tiempo_minutos: version.tiempo_minutos ?? '',
    dificultad: version.dificultad ?? '',
    categorias: (version.receta_categorias ?? []).map((relacion) => relacion.categoria_id),
    ingredientes: (version.receta_ingredientes ?? []).map((relacion) => ({
      ingrediente_id: relacion.ingrediente_id,
      nombre: relacion.ingredientes?.nombre ?? 'Ingrediente no disponible',
      activo: relacion.ingredientes?.activo ?? false,
      cantidad: relacion.cantidad,
      unidad: relacion.unidad,
    })),
    pasos: [...(version.receta_pasos ?? [])].sort((a, b) => a.orden - b.orden)
      .map((paso, indice) => ({ clave: `original-${indice}`, texto: paso.descripcion })),
  }
}

export function ingredientesPermitidos(ingredientes, disponibles, originales = []) {
  const permitidos = new Set([
    ...disponibles.filter((item) => item.activo).map((item) => String(item.id)),
    ...originales.map((item) => String(item.ingrediente_id)),
  ])
  return ingredientes.every((item) => permitidos.has(String(item.ingrediente_id)))
}
