import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Redireciona para a URL personalizada do lead: /semanadodespertar-38/{userId}
export default async function Semana38Page({
  searchParams,
}: {
  searchParams: Promise<{ nome?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const nomeParam = params.nome ? `?nome=${encodeURIComponent(params.nome)}` : ''
  redirect(`/semanadodespertar-38/${user.id}${nomeParam}`)
}
