import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SemanaDespertar43 } from './SemanaDespertar43'

export default async function LancamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const firstName = (profile?.full_name ?? 'Aluno').split(' ')[0]

  return <SemanaDespertar43 firstName={firstName} />
}
