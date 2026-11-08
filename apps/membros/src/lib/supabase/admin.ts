import { createClient } from '@supabase/supabase-js'

// Client com service role — bypassa RLS. Usar SOMENTE em server-side (API routes, server actions).
// Requer SUPABASE_SERVICE_ROLE_KEY no .env.local e nas variáveis de ambiente da Vercel.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada. Adicione ao .env.local e às variáveis de ambiente da Vercel.')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
