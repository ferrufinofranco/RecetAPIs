import { crearAsistente } from './handler.ts'

const claves = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')

Deno.serve(crearAsistente({
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  publishableKey: claves.default || Deno.env.get('SUPABASE_ANON_KEY') || '',
  groqKey: Deno.env.get('GROQ_API_KEY') || '',
  modelo: Deno.env.get('GROQ_MODEL'),
}))
