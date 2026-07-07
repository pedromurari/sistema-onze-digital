/**
 * checkout-criar-pagamento
 * Cria o pagamento no Mercado Pago usando o access_token da parceira dona
 * do produto (o split acontece na hora: ela recebe o liquido, o IDM recebe
 * a application_fee, que cobre a comissao do IDM + a comissao de afiliada
 * quando ha cupom de outra parceira -- essa comissao de afiliada e repassada
 * depois pelo webhook, ja que o split nativo do Mercado Pago e so de duas
 * pontas).
 *
 * Body: { produto_id, cupom_codigo?, comprador: { nome, email, whatsapp?, cpf? },
 *         pagamento: { metodo: 'pix' | 'cartao', token?, payment_method_id?, installments?, issuer_id? } }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function round2(n: number) { return Math.round(n * 100) / 100; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const produtoId = String(body?.produto_id ?? '');
    const cupomCodigo = body?.cupom_codigo ? String(body.cupom_codigo).trim().toUpperCase() : null;
    const comprador = body?.comprador ?? {};
    const pagamento = body?.pagamento ?? {};
    const incluirBump = Boolean(body?.incluir_bump);

    if (!produtoId || !comprador?.email || !comprador?.nome) {
      return new Response(JSON.stringify({ error: 'Dados obrigatórios ausentes.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: produto, error: produtoErr } = await supabase
      .from('parceiros_produtos')
      .select('id, nome, preco, status, parceiro_id, comissao_idm_pct, bump_ativo, bump_nome, bump_preco')
      .eq('id', produtoId).eq('status', 'ativo').maybeSingle();

    if (produtoErr || !produto) {
      return new Response(JSON.stringify({ error: 'Produto não encontrado ou não está ativo.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: dona, error: donaErr } = await supabase
      .from('parceiros').select('id, mp_access_token').eq('id', produto.parceiro_id).maybeSingle();

    if (donaErr || !dona?.mp_access_token) {
      return new Response(JSON.stringify({ error: 'A parceira dona deste produto ainda não conectou o Mercado Pago.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let cupom: { id: string; comissao_pct: number | null } | null = null;
    if (cupomCodigo) {
      const { data: cupomData } = await supabase
        .from('parceiros_cupons').select('id, comissao_pct')
        .eq('produto_id', produtoId).eq('codigo', cupomCodigo).eq('ativo', true).maybeSingle();
      cupom = cupomData ?? null;
    }

    const bumpIncluido = incluirBump && produto.bump_ativo && produto.bump_preco != null;
    const valorBruto = round2(Number(produto.preco) + (bumpIncluido ? Number(produto.bump_preco) : 0));
    const comissaoIdm = round2(valorBruto * ((produto.comissao_idm_pct ?? 0) / 100));
    const comissaoAfiliado = cupom ? round2(valorBruto * ((cupom.comissao_pct ?? 0) / 100)) : 0;
    const applicationFee = round2(comissaoIdm + comissaoAfiliado);
    const valorLiquido = round2(valorBruto - applicationFee);

    const [firstName, ...rest] = String(comprador.nome).trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    const descricaoPagamento = bumpIncluido ? `${produto.nome} + ${produto.bump_nome}` : produto.nome;

    const mpPayload: Record<string, unknown> = {
      transaction_amount: valorBruto,
      description: descricaoPagamento,
      application_fee: applicationFee,
      payer: {
        email: comprador.email,
        first_name: firstName,
        last_name: lastName,
        ...(comprador.cpf ? { identification: { type: 'CPF', number: String(comprador.cpf).replace(/\D/g, '') } } : {}),
      },
      metadata: { produto_id: produtoId, cupom_codigo: cupomCodigo ?? undefined },
    };

    if (pagamento.metodo === 'pix') {
      mpPayload.payment_method_id = 'pix';
    } else {
      mpPayload.token = pagamento.token;
      mpPayload.payment_method_id = pagamento.payment_method_id;
      mpPayload.installments = pagamento.installments ?? 1;
      if (pagamento.issuer_id) mpPayload.issuer_id = pagamento.issuer_id;
    }

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dona.mp_access_token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('checkout-criar-pagamento: erro Mercado Pago', mpData);
      return new Response(JSON.stringify({ error: mpData?.message || 'Erro ao processar pagamento no Mercado Pago.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const statusMap: Record<string, string> = { approved: 'aprovado', pending: 'pendente', in_process: 'pendente', rejected: 'recusado' };
    const status = statusMap[mpData.status] ?? 'pendente';

    await supabase.from('parceiros_vendas').insert({
      produto_id: produtoId,
      cupom_id: cupom?.id ?? null,
      comprador_nome: comprador.nome,
      comprador_email: comprador.email,
      comprador_whatsapp: comprador.whatsapp ?? null,
      valor_bruto: valorBruto,
      valor_liquido: valorLiquido,
      comissao_idm: comissaoIdm,
      comissao_afiliado: comissaoAfiliado,
      bump_incluido: bumpIncluido,
      mp_payment_id: String(mpData.id),
      status,
    });

    return new Response(JSON.stringify({
      status,
      mp_payment_id: mpData.id,
      qr_code: mpData.point_of_interaction?.transaction_data?.qr_code ?? null,
      qr_code_base64: mpData.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
      ticket_url: mpData.point_of_interaction?.transaction_data?.ticket_url ?? null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('checkout-criar-pagamento error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno: ' + (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
