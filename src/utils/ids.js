// Límite de precisión documentado: los IDs bigint de PostgreSQL viajan como
// números JSON y la respuesta se parsea a Number antes de llegar al frontend.
// Un valor mayor a Number.MAX_SAFE_INTEGER puede llegar ya redondeado sin que
// el cliente pueda detectarlo. Esta validación solo rechaza los números que ya
// no son enteros seguros, antes de enviarlos a una RPC o filtro. No convierte
// el valor: serializarlo como string no recupera los dígitos originales.
export function exigirIdEnteroSeguro(valor, descripcion = 'identificador') {
  if (typeof valor === 'number' && !Number.isSafeInteger(valor)) {
    throw new Error(`El ${descripcion} no es un entero seguro. Recargá la página para actualizar los datos y volvé a intentar.`)
  }
  return valor
}
