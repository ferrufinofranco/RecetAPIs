// Solo lecturas anónimas. No autentica usuarios, no invoca RPC, no usa Storage
// para escribir y no imprime credenciales, URLs ni contenido de registros.
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd())
const base = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!base || !key) throw new Error('Falta configuración pública de Supabase.')
if (key.startsWith('sb_secret_')) throw new Error('Se rechaza una clave secreta.')
if (!key.startsWith('sb_publishable_')) {
  let role
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch {}
  if (role !== 'anon') throw new Error('La clave no se identifica como publishable/anon.')
}

const casos = [
  {
    nombre: 'catalogo_publico', privada: false,
    tabla: 'receta_versiones', params: {
      select: 'id,receta:recetas!inner(id),receta_categorias(categorias(id)),receta_ingredientes(ingredientes(id)),receta_pasos(orden)',
      estado: 'eq.publicada', 'receta.eliminada_en': 'is.null', limit: '1',
    },
  },
  {
    nombre: 'versiones_no_publicas_visitante', privada: true,
    tabla: 'receta_versiones', params: { select: 'id', estado: 'in.(pendiente,rechazada,anterior,descartada)', limit: '1' },
  },
  {
    nombre: 'solicitudes_visitante', privada: true,
    tabla: 'solicitudes_ingredientes', params: { select: 'id', limit: '1' },
  },
  {
    nombre: 'perfiles_visitante', privada: true,
    tabla: 'profiles', params: { select: 'id', limit: '1' },
  },
]

const resultados = []
for (const caso of casos) {
  try {
    const url = new URL(`rest/v1/${caso.tabla}`, `${base.replace(/\/+$/, '')}/`)
    url.search = new URLSearchParams(caso.params).toString()
    const response = await fetch(url, {
      method: 'GET', headers: { apikey: key, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(12000),
    })
    const data = await response.json().catch(() => null)
    const filas = Array.isArray(data) ? data.length : null
    const resultado = {
      caso: caso.nombre, http: response.status, filas_visibles: filas,
      conclusion: caso.privada
        ? [401, 403].includes(response.status) ? 'lectura_denegada'
          : response.ok && filas === 0 ? 'sin_filas_visibles_no_prueba_RLS'
            : response.ok && filas > 0 ? 'ALERTA_exposicion_anonima' : 'inconcluso'
        : response.ok && Array.isArray(data) ? 'consulta_publica_compatible' : 'consulta_publica_no_verificada',
    }
    if (!caso.privada && Array.isArray(data)) {
      resultado.relaciones_categoria_no_visibles = data.flatMap((item) => item.receta_categorias ?? []).filter((item) => !item.categorias).length
      resultado.relaciones_ingrediente_no_visibles = data.flatMap((item) => item.receta_ingredientes ?? []).filter((item) => !item.ingredientes).length
    }
    resultados.push(resultado)
    if (resultado.conclusion.startsWith('ALERTA') || ['inconcluso', 'consulta_publica_no_verificada'].includes(resultado.conclusion)) process.exitCode = 1
  } catch {
    resultados.push({ caso: caso.nombre, conclusion: 'inconcluso_error_red_o_configuracion' })
    process.exitCode = 1
  }
}
console.log(JSON.stringify({
  alcance: 'GET anonimo en proyecto configurado; no es un entorno de pruebas verificado',
  escrituras: 0,
  advertencia: 'Una respuesta vacía no demuestra aislamiento sin datos privados conocidos. No se verifican RPC, persistencia ni permisos autenticados.',
  resultados,
}, null, 2))
