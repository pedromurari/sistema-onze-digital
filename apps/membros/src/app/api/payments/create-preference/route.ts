import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO — preencha as variáveis no .env.local:
//
//   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...       (token do painel MP → Credenciais)
//   NEXT_PUBLIC_SITE_URL=https://seusite.com.br
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticar usuário via Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // 2. Receber productId do body
    const { productId } = await req.json()
    if (!productId) {
      return NextResponse.json({ error: 'productId obrigatório' }, { status: 400 })
    }

    // 3. Buscar produto no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: product, error: productError } = await (supabase.from('products') as any)
      .select('id, title, price, currency')
      .eq('id', productId)
      .eq('is_published', true)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    }

    if (!product.price) {
      return NextResponse.json({ error: 'Produto sem preço configurado' }, { status: 400 })
    }

    // 4. Verificar se já tem enrollment ativo (evitar dupla compra)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingEnrollment } = await (supabase.from('enrollments') as any)
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .eq('is_active', true)
      .single()

    if (existingEnrollment) {
      return NextResponse.json({ error: 'Você já possui acesso a este produto' }, { status: 409 })
    }

    // 5. Inicializar cliente Mercado Pago
    // SUBSTITUA pela sua variável de ambiente após configurar no painel MP
    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    })

    const preference = new Preference(mp)

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    // 6. Criar Preference no MP
    const result = await preference.create({
      body: {
        items: [
          {
            id: product.id,
            title: product.title,
            quantity: 1,
            currency_id: product.currency ?? 'BRL',
            unit_price: Number(product.price),
          },
        ],
        payer: {
          email: user.email,
        },
        back_urls: {
          success: `${siteUrl}/pagamento/sucesso?product=${productId}`,
          failure: `${siteUrl}/pagamento/falha?product=${productId}`,
          pending: `${siteUrl}/pagamento/pendente?product=${productId}`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/payments/webhook`,
        external_reference: `${user.id}|${productId}`,
      },
    })

    // 7. Salvar registro de pagamento pendente no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('payments') as any).insert({
      user_id: user.id,
      product_id: productId,
      mp_preference_id: result.id,
      status: 'pending',
      amount: product.price,
      currency: product.currency ?? 'BRL',
    })

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
    })
  } catch (err) {
    console.error('[create-preference] erro:', err)
    return NextResponse.json({ error: 'Erro interno ao criar preferência' }, { status: 500 })
  }
}
