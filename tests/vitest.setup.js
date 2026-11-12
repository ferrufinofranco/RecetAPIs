import { afterEach, beforeEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

const supabaseMock = vi.hoisted(() => ({
  storage: { from: vi.fn() },
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
}))

export function getSupabaseMock() { return supabaseMock }

vi.mock('@/services/supabase', () => ({ getSupabase: () => supabaseMock }))

// Mock de transporte Axios: conserva interceptores y serialización reales,
// pero toda petición debe resolverse explícitamente en cada prueba.
import { api } from '@/services/api'

export const usuarioPrueba = { id: 'uuid-propio', email: 'ana@example.com' }

enableAutoUnmount(afterEach)
beforeEach(() => {
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-prueba', user: usuarioPrueba } }, error: null })
  supabaseMock.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  api.defaults.adapter = vi.fn(async (config) => {
    throw new Error(`Petición no simulada: ${config.method} ${config.url}`)
  })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Acceso real a red prohibido en pruebas') }))
})
afterEach(() => { vi.unstubAllGlobals() })
