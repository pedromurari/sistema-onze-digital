import { redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { getMyPublishedFormacaoGrades, isEnrolledInFormacao } from '@/lib/formacao-queries'
import { NotasClient } from './NotasClient'

export const metadata = { title: 'Minhas Notas — Formação em Psicanálise' }

export default async function FormacaoNotasPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)
  const isAdmin = profile?.role === 'admin'

  const enrolled = isAdmin || (await isEnrolledInFormacao())
  if (!enrolled) redirect('/formacao')

  const grades = await getMyPublishedFormacaoGrades()
  return <NotasClient grades={grades} />
}
