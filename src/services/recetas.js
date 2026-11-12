import { api } from './api'
import { adaptarReceta } from '@/utils/recetas'
import { prepararDatosReceta } from '@/utils/crearReceta'

const select = [
  'id,receta_id,numero,titulo,descripcion,tiempo_minutos,porciones,dificultad,imagen_path',
  'receta:recetas!inner(id)',
  'receta_categorias(categorias(id,nombre))',
  'receta_ingredientes(cantidad,unidad,ingredientes(id,nombre))',
  'receta_pasos(orden,descripcion)',
].join(',')

function parametrosPublicos() {
  return {
    select,
    estado: 'eq.publicada',
    'receta.eliminada_en': 'is.null',
    order: 'numero.desc,id.desc',
  }
}

export async function obtenerRecetas() {
  const recetas = new Map()
  // Evita truncar el catálogo si PostgREST limita el tamaño de las respuestas.
  let offset = 0
  while (true) {
    const { data } = await api.get('receta_versiones', {
      params: { ...parametrosPublicos(), offset, limit: 1000 },
    })
    if (!data.length) break
    for (const version of data) {
      // Las versiones vienen en orden descendente: conservar la última publicada.
      if (!recetas.has(version.receta_id)) {
        recetas.set(version.receta_id, adaptarReceta(version, import.meta.env.VITE_SUPABASE_URL))
      }
    }
    offset += data.length
  }
  return [...recetas.values()]
}

export async function obtenerReceta(id, signal) {
  if (!/^\d+$/.test(String(id))) return null
  const { data } = await api.get('receta_versiones', {
    params: { ...parametrosPublicos(), receta_id: `eq.${id}`, limit: 1 },
    signal,
  })
  return data.length ? adaptarReceta(data[0], import.meta.env.VITE_SUPABASE_URL) : null
}

export async function crearReceta(formulario) {
  const { data } = await api.post('rpc/crear_receta', {
    p_datos: prepararDatosReceta(formulario),
  })
  return data
}
