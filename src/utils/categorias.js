export class ErrorCategoria extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export function validarNombreCategoria(nombre) {
  const limpio = nombre.trim()
  if (!limpio) throw new ErrorCategoria('Ingresá un nombre para la categoría.', 'NOMBRE_VACIO')
  return limpio
}

export function esCategoriaGeneral(categoria) {
  return categoria.nombre.trim().toLowerCase() === 'general'
}

export function mensajeErrorCategoria(error, accion = 'guardar') {
  if (error instanceof ErrorCategoria) return error.message
  if (error.response?.data?.code === '23505') {
    return 'Ya existe una categoría con ese nombre. Elegí otro.'
  }
  if ([401, 403].includes(error.response?.status) || error.response?.data?.code === '42501') {
    return 'No tenés permisos para realizar esta operación o tu sesión venció.'
  }
  if (error.response?.status === 409) return 'El nombre genera un conflicto. Probá con otro.'
  return `No se pudo ${accion} la categoría. Revisá la conexión y volvé a intentar.`
}
