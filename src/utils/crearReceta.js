import { exigirIdEnteroSeguro } from './ids.js'

export const unidadesReceta = ['g', 'kg', 'ml', 'l', 'unidades', 'cucharaditas', 'cucharadas', 'tazas', 'pizcas']

export class ErrorCrearReceta extends Error {}

// Límites de las columnas SQL: integer de 32 bits y numeric(12,3).
const MAXIMO_INTEGER = 2147483647
const MAXIMA_CANTIDAD = 999999999.999

const vacio = (valor) => valor == null || String(valor).trim() === ''

export function prepararDatosReceta(formulario) {
  const titulo = formulario.titulo.trim()
  if (!titulo) throw new ErrorCrearReceta('Ingresá un título.')
  const porciones = Number(formulario.porciones)
  if (!Number.isSafeInteger(porciones) || porciones <= 0 || porciones > MAXIMO_INTEGER) {
    throw new ErrorCrearReceta('Las porciones deben ser un número entero positivo.')
  }
  const tiempo = vacio(formulario.tiempo_minutos) ? null : Number(formulario.tiempo_minutos)
  if (tiempo !== null && (!Number.isSafeInteger(tiempo) || tiempo <= 0 || tiempo > MAXIMO_INTEGER)) {
    throw new ErrorCrearReceta('El tiempo debe ser un número entero positivo de minutos o quedar vacío.')
  }
  const dificultad = vacio(formulario.dificultad) ? null : formulario.dificultad
  if (dificultad !== null && !['facil', 'media', 'dificil'].includes(dificultad)) {
    throw new ErrorCrearReceta('Seleccioná una dificultad válida.')
  }
  if (!formulario.ingredientes.length) throw new ErrorCrearReceta('Agregá al menos un ingrediente.')
  const idsIngredientes = new Set()
  const ingredientes = formulario.ingredientes.map((item) => {
    exigirIdEnteroSeguro(item.ingrediente_id, 'identificador del ingrediente')
    if (vacio(item.ingrediente_id) || idsIngredientes.has(String(item.ingrediente_id))) {
      throw new ErrorCrearReceta('Seleccioná ingredientes válidos y sin duplicados.')
    }
    idsIngredientes.add(String(item.ingrediente_id))
    const cantidad = Number(item.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ErrorCrearReceta('Cada ingrediente debe tener una cantidad positiva.')
    // numeric(12,3): máximo tres decimales. Se rechaza también lo que SQL
    // redondearía (cuatro o más decimales, o un valor que caería a 0.000).
    if (cantidad > MAXIMA_CANTIDAD || Number(cantidad.toFixed(3)) !== cantidad) {
      throw new ErrorCrearReceta('Cada cantidad debe ser positiva, de hasta tres decimales y como máximo 999999999.999.')
    }
    if (!unidadesReceta.includes(item.unidad)) throw new ErrorCrearReceta('Seleccioná una unidad válida para cada ingrediente.')
    return { ingrediente_id: item.ingrediente_id, cantidad, unidad: item.unidad }
  })
  const categorias = formulario.categorias
  if (!categorias.length || categorias.some(vacio)) throw new ErrorCrearReceta('Seleccioná al menos una categoría.')
  for (const id of categorias) exigirIdEnteroSeguro(id, 'identificador de la categoría')
  if (new Set(categorias.map(String)).size !== categorias.length) throw new ErrorCrearReceta('No se pueden repetir categorías.')
  const pasos = formulario.pasos.map((paso) => paso.trim())
  if (!pasos.length || pasos.some((paso) => !paso)) throw new ErrorCrearReceta('Agregá al menos un paso y completá todos los pasos.')

  // Lista explícita: no enviar autor, estado, IDs generados ni números de versión.
  return {
    titulo,
    descripcion: formulario.descripcion?.trim() || null,
    porciones,
    tiempo_minutos: tiempo,
    dificultad,
    categorias: [...categorias],
    ingredientes,
    pasos,
  }
}

export function mensajeErrorCrearReceta(error, accion = 'crear la receta') {
  if (error instanceof ErrorCrearReceta) return error.message
  if ([401, 403].includes(error.response?.status) || error.response?.data?.code === '42501') {
    return `No se pudo ${accion}. Verificá que tu sesión esté activa y tenga permisos.`
  }
  if (/version posterior/i.test(error.response?.data?.message ?? '')) {
    return 'Existe una versión posterior de esta receta: esta propuesta ya no se puede editar. Volvé a Mis recetas y trabajá sobre la versión más reciente.'
  }
  if (!error.response) {
    return 'No se pudo confirmar el guardado. Revisá la conexión; la solicitud pudo haberse procesado. Verificá antes de volver a enviarla.'
  }
  return `No se pudo ${accion}. Revisá los datos, las categorías e ingredientes permitidos y que la propuesta siga siendo editable.`
}
