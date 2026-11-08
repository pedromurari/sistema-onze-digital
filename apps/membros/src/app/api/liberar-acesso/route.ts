import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { criarAcessoMembro } from '@/lib/memberAccess'

// ─────────────────────────────────────────────────────────────────────────────
// Chamado pelo financeiro (Supabase da 11ds) quando um pagamento é confirmado:
// cria a conta (se não existir), matricula no produto e define até quando o
// acesso vale. Também revoga (acao: 'revogar'). Autenticado por bearer key
// (env LIBERAR_ACESSO_KEY — mesma chave que o financeiro guarda em
// AREA_MEMBROS_API_KEY).
// ─────────────────────────────────────────────────────────────────────────────

const LIMPA_INVISIVEIS = /[﻿​-‍]/g

export async function POST(request: NextRequest) {
  const esperada = process.env.LIBERAR_ACESSO_KEY?.replace(LIMPA_INVISIVEIS, '').trim()
  const recebida = request.headers.get('authorization')?.replace(LIMPA_INVISIVEIS, '').trim()
  if (!esperada || recebida !== `Bearer ${esperada}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  const nome = String(body?.nome ?? '').trim() || email.split('@')[0]
  const whatsapp = body?.whatsapp ? String(body.whatsapp) : undefined
  const produtoSlug = String(body?.produtoSlug ?? '').trim()
  const acao = body?.acao === 'revogar' ? 'revogar' : 'liberar'

  if (!email || !produtoSlug) {
    return NextResponse.json({ error: 'email e produtoSlug são obrigatórios' }, { status: 400 })
  }

  let expiraEm: Date | undefined
  if (body?.expiraEm) {
    expiraEm = new Date(body.expiraEm)
    if (Number.isNaN(expiraEm.getTime())) {
      return NextResponse.json({ error: 'expiraEm inválido' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: produto } = await (admin.from('products') as any)
    .select('id')
    .eq('slug', produtoSlug)
    .maybeSingle()
  if (!produto) {
    return NextResponse.json({ error: 'produto não encontrado' }, { status: 404 })
  }

  try {
    if (acao === 'revogar') {
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const usuario = lista?.users.find(u => u.email?.toLowerCase() === email)
      if (!usuario) return NextResponse.json({ ok: true, revogado: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('enrollments') as any)
        .update({ is_active: false })
        .eq('user_id', usuario.id)
        .eq('product_id', produto.id)
      return NextResponse.json({ ok: true, revogado: true })
    }

    const { userId, loginUrl } = await criarAcessoMembro({
      email,
      nome,
      whatsapp,
      produtoId: produto.id,
      expiraEm,
    })
    return NextResponse.json({ ok: true, userId, loginUrl, expiraEm: expiraEm?.toISOString() ?? null })
  } catch (err) {
    console.error('[liberar-acesso] erro:', err)
    return NextResponse.json({ error: 'falha ao liberar acesso' }, { status: 500 })
  }
}
