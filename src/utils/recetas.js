export function resolverImagen(path, supabaseUrl) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  // Un path de Storage debe incluir el bucket: "bucket/carpeta/archivo.jpg".
  const ruta = path.replace(/^\/+/, '')
  if (ruta.startsWith('storage/v1/object/public/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/${ruta}`
  }
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${ruta.split('/').map(encodeURIComponent).join('/')}`
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
    categorias: (version.version_categorias ?? [])
      .filter((relacion) => relacion.categorias)
      .map((relacion) => relacion.categorias.nombre),
    ingredientes: (version.version_ingredientes ?? [])
      .filter((relacion) => relacion.ingredientes)
      .map((relacion) => ({
        id: relacion.ingredientes.id,
        nombre: relacion.ingredientes.nombre,
        cantidad: relacion.cantidad,
        unidad: relacion.unidad,
      })),
    pasos: [...(version.version_pasos ?? [])].sort((a, b) => a.orden - b.orden),
  }
}
