import axios from 'axios'
import { getSupabase } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// apikey identifica al proyecto; Authorization lleva solamente el JWT del usuario.
export const api = axios.create({
  baseURL: `${(url ?? '').replace(/\/+$/, '')}/rest/v1/`,
  headers: { apikey: publishableKey },
  timeout: 10000,
})

api.interceptors.request.use(async (config) => {
  if (!url || !publishableKey) {
    throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env.')
  }
  const { data, error } = await getSupabase().auth.getSession()
  if (error) throw error
  if (data.session?.access_token) {
    config.headers.set('Authorization', `Bearer ${data.session.access_token}`)
  } else {
    config.headers.delete('Authorization')
  }
  return config
})
