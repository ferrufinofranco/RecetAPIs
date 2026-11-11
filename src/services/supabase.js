import { createClient } from '@supabase/supabase-js'

let client

export function getSupabase() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) throw new Error('Falta la configuración pública de Supabase en .env.')
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
