import { api } from './api'

export async function obtenerPerfil(userId) {
  const { data } = await api.get('profiles', {
    params: { select: 'id,email,nombre,rol', id: `eq.${userId}`, limit: 1 },
  })
  return data[0] ?? null
}
