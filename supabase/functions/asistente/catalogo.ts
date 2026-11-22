type Id = string | number
type Nombre = { nombre: string }
type Version = {
  id: Id
  receta_id: Id
  estado: string
  receta: { eliminada_en: string | null } | null
  titulo: string
  tiempo_minutos: number | null
  dificultad: string | null
  categorias: Nombre[]
  ingredientes: Nombre[]
}

export type Candidato = {
  id: string
  versionId: string
  titulo: string
  tiempoMinutos: number | null
  dificultad: string | null
  categorias: string[]
  ingredientes: string[]
}

type Buscar = (params: URLSearchParams) => Promise<Version[]>

const MAX_CANDIDATOS = 5
const palabrasComunes = new Set(`aca algo alguna algun alternativas bien cocinar cocina comer como comida cuanto cuales cual
  cuando con consulta contra cosa dar dame del desde decir dime donde dos ella ellas ellos entre esa ese eso esta
  estas este esto falta faltan faltaria faltarian faltante faltantes general hacer hasta hice hoy hora idea ideas ingrediente
  ingredientes lado limite maximo maxima media menos mientras minuto minutos necesito otra otras otros para paso pero poco puedo
  plan plato platos poner por prefiero puede porque preparacion preparar pregunta primera que queda quiero quisiera
  rapida rapido rato receta recetas recetapis recomienda recomendas recomendar recomendame rico rica saber solo son sobre sugerencia sugerime
  tambien tengo tenes tiempo tipo todo todos una unas unos usted usar vamos variante ver vez`.split(/\s+/))

export function normalizar(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function idSeguro(id: unknown): string | null {
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return String(id)
  if (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n) return id
  return null
}

function palabras(texto: string) {
  return normalizar(texto).match(/[a-z]+/g) ?? []
}

function terminos(texto: string) {
  const positivos = normalizar(texto).replace(/\b(?:sin|evito|no tengo)\s+[a-z]+/g, '')
  return [...new Set(palabras(positivos).filter((palabra) => palabra.length >= 3 && palabra.length <= 32 && !palabrasComunes.has(palabra)))]
}

function maximoMinutos(textos: string[]) {
  for (const texto of textos) {
    const frase = normalizar(texto)
    const minutos = frase.match(/\b(menos de\s+)?(\d{1,4})\s*(?:min(?:uto)?s?)\b/)
    if (minutos) return Number(minutos[2]) - Number(Boolean(minutos[1]))
    if (/\bmedia hora\b/.test(frase)) return 30
  }
  return null
}

const vocales: Record<string, string> = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' }

function singular(termino: string) {
  return termino.length > 3 ? termino.replace(/(?:ces|s)$/, (final) => final === 'ces' ? 'z' : '') : termino
}

function patron(termino: string) {
  const raiz = singular(termino).replace(/z$/, '[zc]')
  return `"[[:<:]]${raiz.replace(/[aeioun]/g, (letra) => vocales[letra] ?? letra)}"`
}

function filtrosPublicos(limite: number, columnas: string) {
  return new URLSearchParams({
    select: `${columnas},estado,receta:recetas!inner(eliminada_en)`,
    estado: 'eq.publicada',
    'receta.eliminada_en': 'is.null',
    limit: String(limite),
  })
}

function esPublica(version: Version) {
  return version.estado === 'publicada' && version.receta?.eliminada_en === null
}

function nombres(relaciones: Nombre[], limite: number) {
  return (relaciones ?? []).map(({ nombre }) => nombre.trim()).filter(Boolean).sort().slice(0, limite)
}

export async function buscarCandidatos(buscar: Buscar, textos: string[], referencias: string[]) {
  const actual = terminos(textos[0] ?? '').slice(0, 8)
  const anteriores = [...new Set(textos.slice(1).flatMap(terminos))]
  const palabrasBusqueda = [...new Set([...actual, ...anteriores])].slice(0, 8)
  const tiempo = maximoMinutos(textos)
  const params = filtrosPublicos(36, 'id,receta_id,titulo,tiempo_minutos,dificultad,categorias(nombre),ingredientes(nombre)')
  const filtros: string[] = []

  if (palabrasBusqueda.length) {
    // Embeds vacíos para filtrar sin recortar los ingredientes/categorías devueltos.
    params.set('select', `${params.get('select')},ing:ingredientes(),cat:categorias()`)
    const patrones = palabrasBusqueda.map(patron)
    const porNombre = `(${patrones.map((valor) => `nombre.imatch.${valor}`).join(',')})`
    params.set('ing.or', porNombre)
    params.set('cat.or', porNombre)
    filtros.push(...patrones.map((valor) => `titulo.imatch.${valor}`), 'ing.not.is.null', 'cat.not.is.null')
  }
  if (referencias.length) filtros.push(`receta_id.in.(${referencias.join(',')})`)
  if (filtros.length) params.set('or', `(${filtros.join(',')})`)
  if (tiempo !== null) params.set('tiempo_minutos', `lte.${tiempo}`)
  params.set('order', tiempo === null ? 'id.desc' : 'tiempo_minutos.asc,id.desc')

  const candidatas = (await buscar(params)).filter(esPublica).flatMap((version) => {
    const id = idSeguro(version.receta_id)
    const versionId = idSeguro(version.id)
    if (!id || !versionId) return []
    return [{
      id, versionId,
      titulo: version.titulo,
      tiempoMinutos: version.tiempo_minutos,
      dificultad: version.dificultad,
      categorias: nombres(version.categorias, 12),
      ingredientes: nombres(version.ingredientes, 32),
    }]
  })

  function puntaje(receta: Candidato) {
    const principales = new Set(palabras([receta.titulo, ...receta.categorias].join(' ')).map(singular))
    const ingredientes = new Set(palabras(receta.ingredientes.join(' ')).map(singular))
    return palabrasBusqueda.reduce((total, termino) => {
      const peso = actual.includes(termino) ? 3 : 1
      const raiz = singular(termino)
      return total + peso * (Number(principales.has(raiz)) + 2 * Number(ingredientes.has(raiz)))
    }, referencias.includes(receta.id) ? (actual.length ? 2 : 9) : 0)
  }

  return candidatas.map((receta) => ({ receta, puntaje: puntaje(receta) }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, MAX_CANDIDATOS).map(({ receta }) => receta)
}

export async function versionesPublicadas(buscar: Buscar, ids: string[]) {
  const params = filtrosPublicos(ids.length, 'id,receta_id')
  params.set('receta_id', `in.(${ids.join(',')})`)
  const versiones = (await buscar(params)).filter(esPublica)
  return new Map(versiones.map((version) => [idSeguro(version.receta_id), idSeguro(version.id)]))
}
