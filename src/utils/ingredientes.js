export class ErrorIngrediente extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export function validarNombreIngrediente(nombre) {
  const limpio = nombre.trim()
  if (!limpio) throw new ErrorIngrediente('Ingresá un nombre para el ingrediente.', 'NOMBRE_VACIO')
  return limpio
}

export function mensajeErrorIngrediente(error, accion = 'guardar') {
  if (error instanceof ErrorIngrediente) return error.message
  if (accion === 'guardar' && error.response?.data?.code === '23505') {
    return 'Ya existe un ingrediente con ese nombre, sin distinguir mayúsculas ni espacios laterales.'
  }
  if ([401, 403].includes(error.response?.status) || error.response?.data?.code === '42501') {
    return 'No tenés permisos para realizar esta operación o tu sesión venció.'
  }
  if (accion === 'guardar' && error.response?.status === 409) return 'El nombre genera un conflicto. Probá con otro.'
  return `No se pudo ${accion} el ingrediente. Revisá la conexión y volvé a intentar.`
}
