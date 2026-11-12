import { api } from './api'
import { adaptarReceta } from '@/utils/recetas'

const filtrosPendientes = {
  estado: 'eq.pendiente',
  'receta.eliminada_en': 'is.null',
}

export async function obtenerPropuestasPendientes(signal) {
  const propuestas = []
  let offset = 0
  while (true) {
    const { data } = await api.get('receta_versiones', {
      params: {
        select: 'id,titulo,numero,creada_en,receta:recetas!inner(id)',
        ...filtrosPendientes,
        order: 'creada_en.asc,id.asc',
        offset,
        limit: 1000,
      },
      signal,
    })
    if (!data.length) break
    propuestas.push(...data)
    offset += data.length
  }
  return propuestas
}

export async function obtenerPropuesta(versionId, signal) {
  const { data } = await api.get('receta_versiones', {
    params: {
      select: [
        'id,receta_id,numero,creada_en,titulo,descripcion,porciones,tiempo_minutos,dificultad,imagen_path',
        'receta:recetas!inner(id)',
        'receta_categorias(categorias(id,nombre))',
        'receta_ingredientes(cantidad,unidad,ingredientes(id,nombre))',
        'receta_pasos(orden,descripcion)',
      ].join(','),
      ...filtrosPendientes,
      id: `eq.${versionId}`,
      limit: 1,
    },
    signal,
  })
  if (!data.length) return null
  return {
    ...adaptarReceta(data[0], import.meta.env.VITE_SUPABASE_URL),
    numero: data[0].numero,
    creadaEn: data[0].creada_en,
  }
}

export async function aprobarReceta(versionId) {
  await api.post('rpc/aprobar_receta', { p_version_id: versionId })
}

export async function rechazarReceta(versionId, motivo) {
  await api.post('rpc/rechazar_receta', {
    p_version_id: versionId,
    p_motivo: motivo?.trim() || null,
  })
}

export function mensajeErrorModeracion(error) {
  if ([401, 403].includes(error.response?.status) || error.response?.data?.code === '42501') {
    return 'No tenés permisos para moderar o tu sesión venció.'
  }
  if (!error.response) {
    return 'No se pudo confirmar la operación. Revisá la conexión y actualizá el listado antes de volver a intentarlo.'
  }
  return 'No se pudo moderar la propuesta. Puede haber sido procesada por otro administrador o la receta ya no estar disponible. Actualizá el listado.'
}
