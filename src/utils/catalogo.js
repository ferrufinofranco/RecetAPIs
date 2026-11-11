export function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function filtrarRecetas(recetas, titulo, categoria) {
  return recetas.filter((receta) =>
    normalizar(receta.titulo).includes(normalizar(titulo)) &&
    (!categoria || receta.categorias.some((nombre) => normalizar(nombre) === normalizar(categoria))),
  )
}
