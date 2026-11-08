import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { isEnrolledInFormacao } from '@/lib/formacao-queries'
import type { Profile } from '@/types'

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)

  if (!profile) redirect('/login')

  const supabase = await createClient()

  const isAdmin = profile.role === 'admin'

  // Mentoria NPA e NPA Presencial (ebook+telas) são produtos separados — qualquer um dos
  // dois libera o link "Mentoria NPA" na navegação (a própria página trata o que cada um vê).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: npaEnrollments } = await (supabase.from('enrollments') as any)
    .select('id, products!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('products.slug', ['mentoria-npa', 'ebook-telas-npa'])

  // Mentoria NPS: só conta matrícula ativa E dentro da validade (assinatura mensal).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: npsEnrollments } = await (supabase.from('enrollments') as any)
    .select('id, expires_at, products!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('products.slug', 'mentoria-nps')

  const hasNpaAccess = isAdmin || (npaEnrollments ?? []).length > 0
  const hasNpsAccess =
    isAdmin ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (npsEnrollments ?? []).some((e: any) => !e.expires_at || new Date(e.expires_at).getTime() > Date.now())
  const formacaoEnrolled = isAdmin || (await isEnrolledInFormacao())

  return (
    <div className="min-h-screen bg-[#0D1638]">
      <TopNavbar profile={profile as Profile} hasNpaAccess={hasNpaAccess} hasNpsAccess={hasNpsAccess} formacaoEnrolled={formacaoEnrolled} />
      <main className="pb-20 md:pb-8">
        {children}
      </main>
      <MobileTabBar hasNpaAccess={hasNpaAccess} hasNpsAccess={hasNpsAccess} />
    </div>
  )
}
