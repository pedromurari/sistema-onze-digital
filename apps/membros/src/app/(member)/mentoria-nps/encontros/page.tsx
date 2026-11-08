import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLives } from '@/lib/actions/lives'
import { MENTORIA_NPS_PRODUCT_ID } from '@/lib/constants'
import { NpaCalendarioClient } from '../../mentoria-npa/calendario/NpaCalendarioClient'

export const metadata = { title: 'Encontros — Mentoria NPS' }

export default async function MentoriaNpsEncontrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const { data: enrollments } = await sb
    .from('enrollments')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('product_id', MENTORIA_NPS_PRODUCT_ID)
    .eq('is_active', true)

  const now = Date.now()
  const ativo = (enrollments ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => !e.expires_at || new Date(e.expires_at).getTime() > now,
  )
  if (!isAdmin && !ativo) redirect('/dashboard')

  const lives = await getLives(MENTORIA_NPS_PRODUCT_ID)

  return <NpaCalendarioClient lives={lives} nomeProduto="Mentoria NPS" voltarHref="/mentoria-nps" />
}
