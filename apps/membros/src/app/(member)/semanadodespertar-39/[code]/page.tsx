import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SemanaDespertar39 } from '@/app/(member)/lancamento/SemanaDespertar39'
import { MetaPixelEvent } from '@/components/MetaPixelEvent'

export default async function SemanaDespertar39Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ nome?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { code } = await params
  const sp = await searchParams

  if (code !== user.id) {
    const nomeParam = sp.nome ? `?nome=${encodeURIComponent(sp.nome)}` : ''
    redirect(`/semanadodespertar-39/${user.id}${nomeParam}`)
  }

  const firstName =
    (sp.nome ?? '').split(' ')[0] ||
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    ''

  return (
    <>
      <MetaPixelEvent event="CompleteRegistration" email={user.email} phone={user.user_metadata?.whatsapp} name={user.user_metadata?.full_name} />
      <SemanaDespertar39 firstName={firstName} />
    </>
  )
}
