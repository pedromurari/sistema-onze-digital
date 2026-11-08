import { redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { getFormacaoLibrary, isEnrolledInFormacao } from '@/lib/formacao-queries'
import { BibliotecaClient } from './BibliotecaClient'

export const metadata = { title: 'Biblioteca — Formação em Psicanálise' }

export default async function FormacaoBibliotecaPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)
  const isAdmin = profile?.role === 'admin'

  const enrolled = isAdmin || (await isEnrolledInFormacao())
  if (!enrolled) redirect('/formacao')

  const files = await getFormacaoLibrary()
  return <BibliotecaClient files={files} />
}
