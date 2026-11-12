import { api } from './api'
import { ErrorCategoria, esCategoriaGeneral, validarNombreCategoria } from '@/utils/categorias'

export interface Categoria {
  id: number | string
  nombre: string
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  const { data } = await api.get<Categoria[]>('categorias', {
    params: {
      select: 'id,nombre',
      activa: 'eq.true',
      order: 'nombre.asc',
    },
  })

  return data
}

export async function crearCategoria(nombre: string): Promise<Categoria> {
  const { data } = await api.post<Categoria[]>('categorias', {
    nombre: validarNombreCategoria(nombre)
  }, {
    params: { select: 'id,nombre' },
    headers: { Prefer: 'return=representation' },
  })
  if (data.length !== 1) {
    throw new ErrorCategoria('No se pudo confirmar la creación. Recargá el listado antes de reintentar.', 'SIN_CONFIRMACION')
  }
  return data[0]!
}

export async function renombrarCategoria(categoria: Categoria, nombre: string): Promise<Categoria> {
  if (esCategoriaGeneral(categoria)) {
    throw new ErrorCategoria('La categoría General está protegida y no se puede modificar.', 'GENERAL_PROTEGIDA')
  }
  const { data } = await api.patch<Categoria[]>('categorias', {
    nombre: validarNombreCategoria(nombre),
  }, {
    params: {
      id: `eq.${categoria.id}`,
      activa: 'eq.true',
      nombre: 'neq.General',
      select: 'id,nombre',
    },
    headers: { Prefer: 'return=representation' },
  })
  // RLS puede responder 200 con [] cuando ninguna fila está habilitada para UPDATE.
  if (data.length !== 1) {
    throw new ErrorCategoria('No se modificó la categoría: ya no está disponible, está protegida o no tenés permisos.', 'SIN_CAMBIOS')
  }
  return data[0]!
}

export async function eliminarCategoria(categoria: Categoria): Promise<void> {
  if (esCategoriaGeneral(categoria)) {
    throw new ErrorCategoria('La categoría General está protegida y no se puede eliminar.', 'GENERAL_PROTEGIDA')
  }
  // La RPC valida permisos y resuelve la desactivación y reasignación de categorías.
  await api.post('rpc/eliminar_categoria', { p_categoria_id: categoria.id })
}
