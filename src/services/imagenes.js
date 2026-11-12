import { getSupabase } from './supabase'
import { api } from './api'
import { exigirIdEnteroSeguro } from '@/utils/ids'

export const bucketRecetas = 'recetas-imagenes'
const formatos = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }

export function validarImagen(archivo) {
  const extension = archivo.name.split('.').at(-1)?.toLowerCase()
  if (!formatos[archivo.type]?.includes(extension)) throw new Error('Elegí una imagen JPG, PNG o WebP con extensión y formato válidos.')
  if (!archivo.size || archivo.size > 5 * 1024 * 1024) throw new Error('La imagen debe pesar como máximo 5 MB y no estar vacía.')
}

export async function subirImagen(archivo, usuarioId) {
  validarImagen(archivo)
  if (!usuarioId || /[\/\\]/.test(usuarioId)) throw new Error('Iniciá sesión para subir una imagen.')
  const extension = archivo.type === 'image/jpeg' ? 'jpg' : archivo.type.split('/')[1]
  const ruta = `${usuarioId}/${crypto.randomUUID()}.${extension}`
  const { error } = await getSupabase().storage.from(bucketRecetas).upload(ruta, archivo, {
    upsert: false, contentType: archivo.type,
  })
  if (error) throw new Error('No se pudo subir la imagen a Storage. Podés continuar sin cambiar la imagen.')
  return ruta
}

export function obtenerVersionGuardada(resultado, versionPendiente = null) {
  // Un escalar podría ser recetas.id: nunca adivinar la versión a modificar.
  const id = resultado?.version_id ?? versionPendiente
  if (id == null || !/^\d+$/.test(String(id))) {
    throw new Error('La RPC no devolvió version_id. El contenido ya se guardó: abrí su propuesta pendiente desde Mis recetas para adjuntar la imagen.')
  }
  exigirIdEnteroSeguro(id, 'identificador de la versión')
  return id
}

export async function asignarImagen(versionId, ruta) {
  exigirIdEnteroSeguro(versionId, 'identificador de la versión')
  await api.post('rpc/asignar_imagen_receta', { p_version_id: versionId, p_imagen_path: ruta })
}
