import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK IPN DO MERCADO PAGO
//
// Configure a URL de notificação no painel MP → Sua conta → Webhooks:
//   https://seusite.com.br/api/payments/webhook
//
// Variável necessária:
//   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // MP envia type=payment quando um pagamento é processado
    if (body.type !== 'payment') {
      return NextResponse.json({ ok: true })
    }

    const paymentId = String(body.data?.id)
    if (!paymentId) {
      return NextResponse.json({ error: 'payment id ausente' }, { status: 400 })
    }

    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    })

    // Buscar detalhes do pagamento na API do MP
    const paymentClient = new Payment(mp)
    const mpPayment = await paymentClient.get({ id: paymentId })

    // external_reference = "userId|productId" (definido no create-preference)
    const externalRef = mpPayment.external_reference ?? ''
    const [userId, productId] = externalRef.split('|')

    if (!userId || !productId) {
      return NextResponse.json({ error: 'external_reference inválida' }, { status: 400 })
    }

    const supabase = await createClient()

    // Atualizar status do pagamento no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('payments') as any)
      .update({
        mp_payment_id: paymentId,
        status: mpPayment.status ?? 'pending',
      })
      .eq('user_id', userId)
      .eq('product_id', productId)
      .eq('status', 'pending')

    // Se aprovado → criar enrollment automaticamente
    if (mpPayment.status === 'approved') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('enrollments') as any)
        .upsert(
          { user_id: userId, product_id: productId, is_active: true },
          { onConflict: 'user_id,product_id' }
        )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
