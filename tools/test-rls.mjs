import { spawnSync } from 'node:child_process'
import { loadRlsConfig } from '../tests/integration/rls/config.mjs'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--single-project-test-only')) {
  console.error('Argumento RLS desconocido. No se inició ninguna petición.')
  process.exit(1)
}
if (args.includes('--single-project-test-only')) {
  process.env.RLS_ALLOW_SINGLE_PROJECT_TESTING = 'I_CONFIRM_NO_REAL_DATA'
}

try {
  const config = loadRlsConfig()
  if (config.singleProject) {
    console.warn('RLS: modo proyecto único autorizado explícitamente como testing SIN datos reales; puede coincidir con la app.')
  }
} catch (error) {
  console.error(`RLS: ejecución detenida antes de cualquier petición. ${error.message}`)
  console.error('RLS-01 a RLS-08: NO EJECUTADAS (entorno no validado).')
  process.exit(1)
}

const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.rls.config.js',
], { stdio: 'inherit', env: process.env })
if (result.error) console.error('No se pudo iniciar Vitest RLS.')
process.exit(result.status ?? 1)
