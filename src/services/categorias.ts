import { api } from './api'

export interface Categoria {
  id: number | string
  nombre: string
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  const { data } = await api.get<Categoria[]>('categorias', {
    params: {
      select: 'id,nombre',
      order: 'nombre.asc',
    },
  })

  return data
}
