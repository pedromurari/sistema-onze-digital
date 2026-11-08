import { createClient } from '@supabase/supabase-js'

// Cliente usado internamente pelo servidor pra gravar em partners/partner_links
// respeitando o RLS existente (role=admin) — autentica como a conta de serviço
// (PARCEIRAS_SERVICE_EMAIL/PASSWORD), sem depender de sessão no navegador nem
// da service_role key. Usar SOMENTE server-side, atrás do gate de /parceiras.
export async function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.PARCEIRAS_SERVICE_EMAIL
  const password = process.env.PARCEIRAS_SERVICE_PASSWORD

  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas.')
  }
  if (!email || !password) {
    throw new Error(
      'PARCEIRAS_SERVICE_EMAIL/PARCEIRAS_SERVICE_PASSWORD não configuradas — defina no .env.local e na Vercel.'
    )
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Falha ao autenticar conta de serviço das parceiras: ${error.message}`)
  }

  return supabase
}
