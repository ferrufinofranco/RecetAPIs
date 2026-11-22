import { getSupabase } from './supabase'

export const MAX_MENSAJE = 600
export const MAX_HISTORIAL = 6

export async function consultarAsistente(mensaje, historial, signal) {
  const { data, error } = await getSupabase().functions.invoke('asistente', {
    body: { mensaje, historial },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!error) return data

  const status = error.context?.status
  if (status === 401 || status === 403) return { codigo: 'sesion' }
  if (status === 429) {
    const cuerpo = await error.context.json().catch(() => null)
    if (cuerpo?.codigo === 'limite_diario') return { codigo: 'limite_diario' }
  }
  return { codigo: status === 400 ? 'mensaje_invalido' : 'ocupado' }
}
