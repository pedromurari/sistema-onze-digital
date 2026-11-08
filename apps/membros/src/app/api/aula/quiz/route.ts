import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const AULA_SLUG = 'narcisismo-psicanalise'

// Gabarito fica só no servidor — nunca exposto ao client
const GABARITO = [1, 1, 0, 1, 1]

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { respostas?: number[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const respostas = body.respostas
  if (!Array.isArray(respostas) || respostas.length !== GABARITO.length) {
    return NextResponse.json({ error: 'Responda todas as perguntas.' }, { status: 400 })
  }

  const acertos = respostas.reduce((acc, r, i) => acc + (r === GABARITO[i] ? 1 : 0), 0)
  const total = GABARITO.length

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('aula_quiz_respostas') as any).upsert(
    { user_id: user.id, aula_slug: AULA_SLUG, respostas, acertos, total, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,aula_slug' }
  )

  if (error) {
    return NextResponse.json({ error: 'Erro ao salvar suas respostas. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, acertos, total })
}
