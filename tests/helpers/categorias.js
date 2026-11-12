// Interacciones reales del selector: no se modifica el modelo desde las pruebas de formulario.
export async function seleccionarCategoria(wrapper, id) {
  if (wrapper.get('#agregar-categorias').attributes('aria-expanded') !== 'true') {
    await wrapper.get('#agregar-categorias').trigger('click')
  }
  await wrapper.get(`#categoria-opcion-${id}`).trigger('click')
  await wrapper.get('#buscar-categorias').trigger('keydown', { key: 'Escape' })
}

export function categoriasSeleccionadas(wrapper) {
  return wrapper.findAll('.categorias-etiquetas li').map(item => item.attributes('data-categoria-id'))
}
