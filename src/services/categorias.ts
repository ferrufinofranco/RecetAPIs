import axios from 'axios'

export interface Categoria {
  id: number | string
  nombre: string
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env.',
    )
  }

  const { data } = await axios.get<Categoria[]>(`${url.replace(/\/+$/, '')}/rest/v1/categorias`, {
    headers: {
      apikey: publishableKey,
    },
    params: {
      select: 'id,nombre',
      order: 'nombre.asc',
    },
    timeout: 10000,
  })

  return data
}
