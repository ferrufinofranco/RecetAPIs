import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

function envFile(name) {
  try {
    return parseEnv(readFileSync(name, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error(`No se pudo leer ${name}; revisar el archivo sin publicar su contenido.`)
  }
}

function projectRef(value, label) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${label}: falta una URL válida.`) }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)
  if (!match || url.protocol !== 'https:' || url.port || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label}: se requiere la URL HTTPS canónica de un proyecto Supabase alojado.`)
  }
  return match[1]
}

// Solo lee la configuración principal para comparar destinos; nunca reutiliza su clave.
export function loadRlsConfig(environment = process.env, read = envFile) {
  const env = { ...read('.env.rls.local'), ...environment }
  const singleProject = env.RLS_ALLOW_SINGLE_PROJECT_TESTING === 'I_CONFIRM_NO_REAL_DATA'
  if (env.RLS_ALLOW_SINGLE_PROJECT_TESTING && !singleProject) {
    throw new Error('La autorización explícita de proyecto único no es válida.')
  }
  const required = [
    'RLS_SUPABASE_URL', 'RLS_TEST_PROJECT_REF',
    'RLS_CONFIRM_TEST_ONLY', 'RLS_SUPABASE_PUBLISHABLE_KEY',
    'RLS_USER_A_EMAIL', 'RLS_USER_A_PASSWORD', 'RLS_USER_B_EMAIL',
    'RLS_USER_B_PASSWORD', 'RLS_ADMIN_EMAIL', 'RLS_ADMIN_PASSWORD',
  ]
  if (!singleProject) required.push('RLS_PRIMARY_SUPABASE_URL')
  const missing = required.filter((name) => !env[name]?.trim())
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(', ')}.`)
  const ref = projectRef(env.RLS_SUPABASE_URL, 'RLS_SUPABASE_URL')
  if (ref !== env.RLS_TEST_PROJECT_REF || env.RLS_CONFIRM_TEST_ONLY !== `TEST_ONLY:${ref}`) {
    throw new Error('La referencia y la confirmación TEST_ONLY no identifican el destino de testing.')
  }
  const primaryUrls = [env.RLS_PRIMARY_SUPABASE_URL, env.VITE_SUPABASE_URL]
  // Vite puede elegir distintos archivos por modo; bloquear cualquier coincidencia conocida.
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local',
    '.env.production', '.env.production.local']) {
    primaryUrls.push(read(name).VITE_SUPABASE_URL)
  }
  for (const url of primaryUrls.filter(Boolean)) {
    if (projectRef(url, 'URL del proyecto principal') === ref && !singleProject) {
      throw new Error('Ejecución bloqueada: testing coincide con un proyecto principal configurado.')
    }
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.RLS_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Usar únicamente una publishable key sb_publishable_; no JWT anon, secret ni service_role.')
  }
  const accounts = Object.fromEntries(['A', 'B', 'ADMIN'].map((name) => {
    const prefix = name === 'ADMIN' ? 'RLS_ADMIN' : `RLS_USER_${name}`
    return [name, { email: env[`${prefix}_EMAIL`], password: env[`${prefix}_PASSWORD`],
      role: name === 'ADMIN' ? 'admin' : 'usuario' }]
  }))
  if (new Set(Object.values(accounts).map(({ email }) => email.trim().toLowerCase())).size !== 3) {
    throw new Error('Las tres cuentas deben ser distintas y exclusivas de testing.')
  }
  return { singleProject, url: env.RLS_SUPABASE_URL.replace(/\/$/, ''),
    key: env.RLS_SUPABASE_PUBLISHABLE_KEY, accounts }
}
