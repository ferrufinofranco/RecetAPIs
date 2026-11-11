import axios from 'axios'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// La misma configuración pública para categorías y recetas. No requiere sesión.
export const api = axios.create({
  baseURL: `${(url ?? '').replace(/\/+$/, '')}/rest/v1/`,
  headers: { apikey: publishableKey },
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  if (!url || !publishableKey) {
    throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env.')
  }
  return config
})
