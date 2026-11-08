import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AulaNarcisismo } from './AulaNarcisismo'

const AULA_SLUG = 'narcisismo-psicanalise'

export default async function AulaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quizRow } = await (supabase as any)
    .from('aula_quiz_respostas')
    .select('acertos, total')
    .eq('user_id', user.id)
    .eq('aula_slug', AULA_SLUG)
    .maybeSingle()

  const firstName = (profile?.full_name ?? 'Aluno').split(' ')[0]

  return (
    <AulaNarcisismo
      firstName={firstName}
      quizResult={quizRow ? { acertos: quizRow.acertos, total: quizRow.total } : null}
    />
  )
}
