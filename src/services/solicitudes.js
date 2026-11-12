import { api } from './api'

export async function obtenerSolicitudes({ usuarioId, pendientes = false, signal } = {}) {
  if (!pendientes && !usuarioId) throw new Error('Iniciá sesión para consultar tus solicitudes.')
  const filas = []
  let offset = 0
  while (true) {
    const { data } = await api.get('solicitudes_ingredientes', {
      params: {
        select: '*', order: pendientes ? 'id.asc' : 'id.desc',
        ...(pendientes ? { estado: 'eq.pendiente' } : { solicitante_id: `eq.${usuarioId}` }),
        offset, limit: 1000,
      }, signal,
    })
    if (!data.length) break
    filas.push(...data)
    offset += data.length
  }
  return filas
}

export async function solicitarIngrediente(nombre) {
  const limpio = nombre.trim()
  if (!limpio || limpio.length > 120) throw new Error('Indicá un nombre de entre 1 y 120 caracteres.')
  const { data } = await api.post('rpc/solicitar_ingrediente', { p_nombre: limpio })
  return data
}

export async function resolverSolicitud(solicitudId, accion, ingredienteId = null) {
  if (!['aprobar', 'rechazar', 'asociar'].includes(accion)) throw new Error('Acción inválida.')
  if (accion === 'asociar' && !ingredienteId) throw new Error('Seleccioná un ingrediente activo.')
  const { data } = await api.post('rpc/resolver_solicitud_ingrediente', {
    p_solicitud_id: solicitudId, p_accion: accion,
    p_ingrediente_id: accion === 'asociar' ? ingredienteId : null,
  })
  return data
}

export function errorSolicitud(error) {
  if (error.response?.data?.code === '23505') return 'Ya existe ese ingrediente. Utilizá Asociar con un ingrediente activo.'
  if ([401, 403].includes(error.response?.status)) return 'La sesión venció o no tenés permisos para esta operación.'
  if (error.response?.data?.code === '22023') return error.response.data.message
  return error.response ? 'No se pudo completar la solicitud. Actualizá el listado y volvé a intentar.'
    : error.message === 'Network Error' ? 'No hay conexión. Verificá el listado antes de reenviar.' : error.message || 'No se pudo completar la operación.'
}
