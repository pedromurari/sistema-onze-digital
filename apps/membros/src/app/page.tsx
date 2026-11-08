import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Usuário logado → dashboard; visitante → landing page
  if (user) redirect('/dashboard')
  redirect('/comecar')
}
