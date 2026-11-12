import { api } from './api'
import { ErrorIngrediente, validarNombreIngrediente } from '@/utils/ingredientes'

const select = 'id,nombre,activo'

export async function obtenerIngredientes() {
  const { data } = await api.get('ingredientes', {
    params: { select, order: 'nombre.asc' },
  })
  return data
}

export async function crearIngrediente(nombre) {
  const { data } = await api.post('ingredientes', {
    nombre: validarNombreIngrediente(nombre),
  }, {
    params: { select },
    headers: { Prefer: 'return=representation' },
  })
  if (data.length !== 1) {
    throw new ErrorIngrediente('No se pudo confirmar la creación. Recargá el listado antes de reintentar.', 'SIN_CONFIRMACION')
  }
  return data[0]
}

export async function renombrarIngrediente(ingrediente, nombre) {
  const { data } = await api.patch('ingredientes', {
    nombre: validarNombreIngrediente(nombre),
  }, {
    params: { id: `eq.${ingrediente.id}`, select },
    headers: { Prefer: 'return=representation' },
  })
  // RLS puede responder con una lista vacía si no hay filas autorizadas para UPDATE.
  if (data.length !== 1) {
    throw new ErrorIngrediente('No se modificó el ingrediente: ya no está disponible o no tenés permisos.', 'SIN_CAMBIOS')
  }
  return data[0]
}

export async function desactivarIngrediente(ingrediente) {
  if (!ingrediente.activo) {
    throw new ErrorIngrediente('El ingrediente ya está inactivo.', 'INGREDIENTE_INACTIVO')
  }
  // Solo la RPC valida permisos y cambia el estado, sin tocar las recetas.
  await api.post('rpc/desactivar_ingrediente', { p_ingrediente_id: ingrediente.id })
}
