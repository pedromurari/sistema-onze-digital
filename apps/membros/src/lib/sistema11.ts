import { createClient } from '@supabase/supabase-js'

// Client server-only para o Sistema 11ds (o CRM "Sistema 11 Digital", projeto Supabase
// separado deste app). Usar SOMENTE em server-side (API routes, server actions) — nunca
// em Client Component. Requer SISTEMA11_SUPABASE_URL/SISTEMA11_SUPABASE_SERVICE_ROLE_KEY
// no .env.local e nas variáveis de ambiente da Vercel.
export function createSistema11Client() {
  const url = process.env.SISTEMA11_SUPABASE_URL
  const key = process.env.SISTEMA11_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'SISTEMA11_SUPABASE_URL / SISTEMA11_SUPABASE_SERVICE_ROLE_KEY não configuradas.'
    )
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
