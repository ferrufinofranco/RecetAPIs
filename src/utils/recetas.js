export function resolverImagen(path, supabaseUrl) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  // Las rutas actuales son UUID/archivo; también se aceptan URLs y rutas legacy.
  const ruta = path.replace(/^\/+/, '')
  if (ruta.startsWith('storage/v1/object/public/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/${ruta}`
  }
  // Contrato actual: UUID/archivo, bucket fijo. Conservar rutas legacy con bucket.
  const completa = /^(recetas|recetas-imagenes)\//.test(ruta) ? ruta : `recetas-imagenes/${ruta}`
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${completa.split('/').map(encodeURIComponent).join('/')}`
}

export function adaptarReceta(version, supabaseUrl) {
  return {
    id: String(version.receta_id),
    versionId: version.id,
    titulo: version.titulo,
    descripcion: version.descripcion ?? '',
    imagen: resolverImagen(version.imagen_path, supabaseUrl),
    porciones: version.porciones,
    tiempoMinutos: version.tiempo_minutos,
    dificultad: version.dificultad,
    categorias: (version.receta_categorias ?? [])
      .filter((relacion) => relacion.categorias)
      .map((relacion) => relacion.categorias.nombre),
    ingredientes: (version.receta_ingredientes ?? [])
      .filter((relacion) => relacion.ingredientes)
      .map((relacion) => ({
        id: relacion.ingredientes.id,
        nombre: relacion.ingredientes.nombre,
        cantidad: relacion.cantidad,
        unidad: relacion.unidad,
      })),
    pasos: [...(version.receta_pasos ?? [])].sort((a, b) => a.orden - b.orden),
  }
}
