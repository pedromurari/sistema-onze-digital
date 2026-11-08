import { redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { getFormacaoModulesForStudent, isEnrolledInFormacao, getFormacaoProgressSummary, getMyFormacaoTurma } from '@/lib/formacao-queries'
import { getLives } from '@/lib/actions/lives'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import { FormacaoClient } from './FormacaoClient'

export const metadata = { title: 'Formação em Psicanálise — Instituto Despertamente' }

export default async function FormacaoPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)
  const isAdmin = profile?.role === 'admin'

  const enrolled = isAdmin || (await isEnrolledInFormacao())
  if (!enrolled) return <FormacaoClient modules={[]} enrolled={false} firstName={null} progress={null} nextLive={null} groupUrl={null} />

  const [modules, progress, lives, turma] = await Promise.all([
    getFormacaoModulesForStudent(),
    getFormacaoProgressSummary(),
    getLives(FORMACAO_PRODUCT_ID),
    getMyFormacaoTurma(),
  ])
  const nextLive = lives.find((l) => l.status === 'live') ?? lives.find((l) => l.status === 'scheduled') ?? null
  const firstName = (profile?.full_name as string | undefined)?.split(' ')[0] ?? null

  return (
    <FormacaoClient
      modules={modules}
      enrolled={enrolled}
      firstName={firstName}
      progress={progress}
      nextLive={nextLive}
      groupUrl={turma?.group_url ?? null}
    />
  )
}
