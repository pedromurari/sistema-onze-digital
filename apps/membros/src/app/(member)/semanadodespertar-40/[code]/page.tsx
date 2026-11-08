import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SemanaDespertar40 } from '@/app/(member)/lancamento/SemanaDespertar40'
import { MetaPixelEvent } from '@/components/MetaPixelEvent'

export default async function SemanaDespertar40Page({
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
    redirect(`/semanadodespertar-40/${user.id}${nomeParam}`)
  }

  const firstName =
    (sp.nome ?? '').split(' ')[0] ||
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    ''

  return (
    <>
      <MetaPixelEvent event="CompleteRegistration" email={user.email} phone={user.user_metadata?.whatsapp} name={user.user_metadata?.full_name} />
      <SemanaDespertar40 firstName={firstName} />
    </>
  )
}
