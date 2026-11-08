import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLives } from '@/lib/actions/lives'
import { MENTORIA_NPA_PRODUCT_ID } from '@/lib/constants'
import { NpaCalendarioClient } from './NpaCalendarioClient'

export const metadata = { title: 'Calendário — Mentoria NPA' }

export default async function MentoriaNpaCalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const { data: enrollment } = await sb
    .from('enrollments')
    .select('id, products!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('products.slug', 'mentoria-npa')
    .maybeSingle()

  if (!isAdmin && !enrollment) redirect('/mentoria-npa')

  const lives = await getLives(MENTORIA_NPA_PRODUCT_ID)

  return <NpaCalendarioClient lives={lives} />
}
