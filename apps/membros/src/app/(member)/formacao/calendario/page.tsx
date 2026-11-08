import { redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { getLives } from '@/lib/actions/lives'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import { getFormacaoDeadlines, isEnrolledInFormacao } from '@/lib/formacao-queries'
import { CalendarioClient } from './CalendarioClient'

export const metadata = { title: 'Calendário — Formação em Psicanálise' }

export default async function FormacaoCalendarioPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)
  const isAdmin = profile?.role === 'admin'

  const enrolled = isAdmin || (await isEnrolledInFormacao())
  if (!enrolled) redirect('/formacao')

  const [lives, deadlines] = await Promise.all([
    getLives(FORMACAO_PRODUCT_ID),
    getFormacaoDeadlines(),
  ])

  return <CalendarioClient lives={lives} deadlines={deadlines} />
}
