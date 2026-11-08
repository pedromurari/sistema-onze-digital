import { NextRequest, NextResponse } from 'next/server'
import { criarPixSyncPay, PRODUTOS_CHECKOUT } from '@/lib/syncpay'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Cria uma cobrança Pix via SyncPay para produtos vendidos fora do member-area
// (checkout público, sem login — ex: Workshop Cicatrizes que Curam).
//
// Variáveis necessárias:
//   SYNCPAY_CLIENT_ID=...
//   SYNCPAY_CLIENT_SECRET=...
//   NEXT_PUBLIC_SITE_URL=https://www.idmpsi.com.br
// ─────────────────────────────────────────────────────────────────────────────

function apenasDigitos(v: string) {
  return v.replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const produtoSlug = String(body?.produtoSlug ?? '')
    const comprador = body?.comprador ?? {}

    const produto = PRODUTOS_CHECKOUT[produtoSlug]
    if (!produto) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    }

    const nome = String(comprador.nome ?? '').trim()
    const cpf = apenasDigitos(String(comprador.cpf ?? ''))
    const email = String(comprador.email ?? '').trim()
    const telefone = apenasDigitos(String(comprador.telefone ?? ''))

    if (!nome || cpf.length !== 11 || !email || telefone.length < 10) {
      return NextResponse.json({ error: 'Dados do comprador incompletos ou inválidos.' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.idmpsi.com.br'

    const pix = await criarPixSyncPay({
      amount: produto.valor,
      description: produto.nome,
      webhookUrl: `${siteUrl}/api/payments/syncpay/webhook`,
      client: { name: nome, cpf, email, phone: telefone },
      split: produto.split,
    })

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('pedidos_syncpay') as any).insert({
      produto_slug: produtoSlug,
      produto_nome: produto.nome,
      valor: produto.valor,
      comprador_nome: nome,
      comprador_cpf: cpf,
      comprador_email: email,
      comprador_telefone: telefone,
      status: 'pending',
      syncpay_identifier: pix.identifier,
      pix_code: pix.pix_code,
      split_config: produto.split ?? null,
    })

    return NextResponse.json({
      identifier: pix.identifier,
      pixCode: pix.pix_code,
    })
  } catch (err) {
    console.error('[syncpay/create] erro:', err)
    const message = err instanceof Error ? err.message : 'Erro interno ao criar cobrança.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
