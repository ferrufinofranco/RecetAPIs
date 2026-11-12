import { api } from './api'
import { adaptarReceta } from '@/utils/recetas'
import { prepararDatosReceta } from '@/utils/crearReceta'
import { resumirRecetaPropia } from '@/utils/misRecetas'
import { exigirIdEnteroSeguro } from '@/utils/ids'

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

export async function obtenerMisRecetas(autorId, signal) {
  if (!autorId) throw new Error('Iniciá sesión para consultar tus recetas.')
  const recetas = []
  let offset = 0
  while (true) {
    const { data } = await api.get('recetas', {
      params: {
        select: 'id,creada_en,receta_versiones(id,numero,estado,titulo,motivo_rechazo)',
        autor_id: `eq.${autorId}`,
        eliminada_en: 'is.null',
        order: 'creada_en.desc,id.desc',
        'receta_versiones.estado': 'in.(publicada,pendiente,rechazada)',
        'receta_versiones.order': 'numero.desc',
        offset,
        limit: 1000,
      },
      signal,
    })
    if (!data.length) break
    recetas.push(...data.map(resumirRecetaPropia).filter(Boolean))
    offset += data.length
  }
  return recetas
}

export async function obtenerPropuestaPropia(versionId, autorId, signal) {
  if (!autorId) throw new Error('Iniciá sesión para consultar tu propuesta.')
  if (!/^\d+$/.test(String(versionId))) return null
  const { data } = await api.get('receta_versiones', {
    params: {
      select: [
        'id,receta_id,numero,estado,motivo_rechazo,titulo,descripcion,porciones,tiempo_minutos,dificultad,imagen_path',
        'receta:recetas!inner(id,autor_id,receta_versiones(numero))',
        'receta_categorias(categoria_id)',
        'receta_ingredientes(ingrediente_id,cantidad,unidad,ingredientes(nombre,activo))',
        'receta_pasos(orden,descripcion)',
      ].join(','),
      id: `eq.${versionId}`,
      estado: 'in.(pendiente,rechazada)',
      'receta.autor_id': `eq.${autorId}`,
      'receta.eliminada_en': 'is.null',
      limit: 1,
    },
    signal,
  })
  const propuesta = data[0]
  if (!propuesta || propuesta.receta?.autor_id !== autorId || !['pendiente', 'rechazada'].includes(propuesta.estado)) return null
  // La RPC editar_propuesta_receta rechaza una propuesta si ya existe una
  // versión posterior (12:130-137). Descartarla en la precarga evita ofrecer
  // una edición que el backend va a rechazar; la RPC lo vuelve a imponer.
  if ((propuesta.receta?.receta_versiones ?? []).some((version) => version.numero > propuesta.numero)) return null
  return propuesta
}

export async function editarPropuestaReceta(versionId, formulario) {
  exigirIdEnteroSeguro(versionId, 'identificador de la versión')
  const { data } = await api.post('rpc/editar_propuesta_receta', {
    p_version_id: versionId,
    p_datos: prepararDatosReceta(formulario),
  })
  return data
}

export async function obtenerEdicionPublicada(recetaId, autorId, signal, { administrativa = false } = {}) {
  if (!autorId) throw new Error('Iniciá sesión para consultar tu receta.')
  if (!/^\d+$/.test(String(recetaId))) return null
  const { data } = await api.get('recetas', {
    params: {
      select: [
        'id,autor_id,receta_versiones(',
        'id,numero,estado,titulo,descripcion,porciones,tiempo_minutos,dificultad,imagen_path,',
        'receta_categorias(categoria_id),',
        'receta_ingredientes(ingrediente_id,cantidad,unidad,ingredientes(nombre,activo)),',
        'receta_pasos(orden,descripcion))',
      ].join(''),
      id: `eq.${recetaId}`,
      ...(administrativa ? {} : { autor_id: `eq.${autorId}` }),
      eliminada_en: 'is.null',
      'receta_versiones.estado': 'in.(publicada,pendiente)',
      'receta_versiones.order': 'numero.desc',
      limit: 1,
    },
    signal,
  })
  const receta = data[0]
  if (!receta || (!administrativa && receta.autor_id !== autorId)) return null
  const versiones = [...(receta.receta_versiones ?? [])].sort((a, b) => b.numero - a.numero)
  const publicada = versiones.find((version) => version.estado === 'publicada')
  if (!publicada) return null
  return {
    publicada: { ...publicada, receta_id: receta.id },
    pendienteId: versiones.find((version) => version.estado === 'pendiente')?.id ?? null,
  }
}

export async function proponerEdicionReceta(recetaId, formulario) {
  exigirIdEnteroSeguro(recetaId, 'identificador de la receta')
  const { data } = await api.post('rpc/proponer_edicion_receta', {
    p_receta_id: recetaId,
    p_datos: prepararDatosReceta(formulario),
  })
  return data
}

export async function eliminarReceta(recetaId) {
  exigirIdEnteroSeguro(recetaId, 'identificador de la receta')
  await api.post('rpc/eliminar_receta', { p_receta_id: recetaId })
}

export async function adminEditarReceta(recetaId, formulario, imagen = {}) {
  exigirIdEnteroSeguro(recetaId, 'identificador de la receta')
  const datos = prepararDatosReceta(formulario)
  if (Object.hasOwn(imagen, 'imagen_path')) datos.imagen_path = imagen.imagen_path
  const { data } = await api.post('rpc/admin_editar_receta', { p_receta_id: recetaId, p_datos: datos })
  return data
}

export async function obtenerRecetasAdministracion(signal) {
  const recetas = []
  let offset = 0
  while (true) {
    const { data } = await api.get('recetas', {
      params: {
        select: 'id,autor_id,creada_en,receta_versiones(id,numero,estado,titulo,motivo_rechazo)',
        eliminada_en: 'is.null',
        order: 'creada_en.desc,id.desc',
        'receta_versiones.order': 'numero.desc',
        offset,
        limit: 1000,
      },
      signal,
    })
    if (!data.length) break
    for (const receta of data) {
      const principal = resumirRecetaPropia(receta)
      const ultima = [...(receta.receta_versiones ?? [])].sort((a, b) => b.numero - a.numero)[0]
      recetas.push({
        ...(principal ?? {
          id: String(receta.id), titulo: ultima?.titulo ?? 'Receta sin versión visible',
          estado: ultima?.estado ?? 'sin_version',
        }),
        autorId: receta.autor_id,
      })
    }
    offset += data.length
  }
  return recetas
}
