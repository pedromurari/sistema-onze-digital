import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function randomCode(userId: string) {
  return `SDW38-${userId.replace(/-/g, '').substring(0, 8).toUpperCase()}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { palavra1?: string; palavra2?: string; palavra3?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const { palavra1, palavra2, palavra3 } = body
  if (!palavra1?.trim() || !palavra2?.trim() || !palavra3?.trim()) {
    return NextResponse.json({ error: 'Insira as 3 palavras-chave.' }, { status: 400 })
  }

  const p1 = normalize(palavra1), p2 = normalize(palavra2), p3 = normalize(palavra3)
  const k1 = normalize(process.env.CERT_PALAVRA_1 ?? '')
  const k2 = normalize(process.env.CERT_PALAVRA_2 ?? '')
  const k3 = normalize(process.env.CERT_PALAVRA_3 ?? '')

  if (!k1 || !k2 || !k3) {
    return NextResponse.json({ error: 'Certificado não configurado ainda.' }, { status: 503 })
  }

  if (p1 !== k1 || p2 !== k2 || p3 !== k3) {
    return NextResponse.json({ error: 'Palavras-chave incorretas. Revise e tente novamente.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const nome = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Aluno'
  const certCode = randomCode(user.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (admin.from('user_certificates') as any).upsert(
    { user_id: user.id, full_name: nome, certificate_code: certCode, certificate_type: 'launch', issued_at: new Date().toISOString() },
    { onConflict: 'user_id,certificate_type' }
  )

  if (insertError) {
    return NextResponse.json({ error: 'Erro ao emitir certificado. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, certCode })
}
