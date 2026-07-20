/**
 * syncpay-webhook
 * Recebe eventos de cashin da SyncPay pra checkouts que foram criados direto
 * no dashboard hospedado da Sync (fora da nossa API/checkout proprio -- ex:
 * os produtos da Jocimara Anjos). Diferente do mp-webhook, aqui NAO existe
 * uma venda pre-criada pra atualizar: a venda inteira nasce a partir do
 * webhook.
 *
 * Atribuicao de parceira/produto: o ideal e registrar o webhook na SyncPay
 * (via POST /api/partner/v1/webhooks) escopado por product_tokens, com a
 * URL desta function + ?produto_id=<uuid> -- mas nao existe (ainda) um jeito
 * confirmado de obter esse token pelo dashboard/API da Sync. Enquanto isso,
 * quando produto_id NAO vem na URL (webhook "pega tudo" da conta, event=all
 * ou cashin sem product_tokens), a funcao tenta casar a venda por VALOR
 * exato contra parceiros_produtos.preco (so entre produtos com
 * syncpay_checkout_url configurado) -- funciona bem enquanto os precos dos
 * produtos SyncPay forem distintos entre si. Se achar 0 ou mais de 1 match,
 * NAO insere (fica so no log) em vez de arriscar atribuir a venda errada.
 * O payload bruto sempre fica salvo em raw_payload pra ajuste fino depois.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_MAP: Record<string, string> = {
  completed: 'aprovado',
  approved: 'aprovado',
  paid: 'aprovado',
  pending: 'pendente',
  failed: 'recusado',
  refunded: 'estornado',
  med: 'estornado',
};

function pick(...vals: unknown[]) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let produtoId = url.searchParams.get('produto_id');

    const body = await req.json().catch(() => ({} as any));
    const d = body?.data ?? body;

    const transactionId = String(pick(d?.id, d?.identifier, d?.reference_id, d?.transaction_id) ?? '');
    const statusRaw = String(pick(d?.status, body?.event) ?? 'pending').toLowerCase();
    const status = STATUS_MAP[statusRaw] ?? 'pendente';
    const valor = Number(pick(d?.final_amount, d?.amount, d?.value) ?? 0);
    const cliente = d?.client ?? d?.debtor_account ?? {};
    const compradorNome = pick(cliente?.name, cliente?.nome, d?.payer_name);
    const compradorEmail = pick(cliente?.email, d?.payer_email);
    const compradorWhatsapp = pick(cliente?.phone, cliente?.telefone);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (transactionId) {
      const { data: existente } = await supabase
        .from('parceiros_vendas')
        .select('id, status')
        .eq('syncpay_transaction_id', transactionId)
        .maybeSingle();

      if (existente) {
        if (existente.status !== status) {
          await supabase.from('parceiros_vendas').update({ status, raw_payload: body }).eq('id', existente.id);
        }
        return new Response(JSON.stringify({ ok: true, status, atualizado: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Webhook "pega tudo" (sem produto_id na URL): tenta descobrir o produto
    // casando o valor exato contra os produtos que tem checkout SyncPay configurado.
    if (!produtoId) {
      const { data: candidatos } = await supabase
        .from('parceiros_produtos')
        .select('id')
        .not('syncpay_checkout_url', 'is', null)
        .eq('preco', valor);

      if (!candidatos || candidatos.length !== 1) {
        console.error('syncpay-webhook: sem produto_id na URL e nao achei match unico por valor', { valor, candidatos: candidatos?.length ?? 0, raw: body });
        return new Response(JSON.stringify({ ok: true, aviso: 'sem match de produto', valor }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      produtoId = candidatos[0].id;
    }

    const { data: produto } = await supabase
      .from('parceiros_produtos')
      .select('id, comissao_idm_pct')
      .eq('id', produtoId).maybeSingle();

    if (!produto) {
      console.error('syncpay-webhook: produto nao encontrado', produtoId);
      return new Response(JSON.stringify({ ok: true, aviso: 'produto nao encontrado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const comissaoIdm = produto.comissao_idm_pct != null ? +(valor * (produto.comissao_idm_pct / 100)).toFixed(2) : null;

    await supabase.from('parceiros_vendas').insert({
      produto_id: produtoId,
      comprador_nome: compradorNome,
      comprador_email: compradorEmail,
      comprador_whatsapp: compradorWhatsapp,
      valor_bruto: valor,
      comissao_idm: comissaoIdm,
      status,
      origem: 'syncpay',
      syncpay_transaction_id: transactionId || null,
      raw_payload: body,
    });

    return new Response(JSON.stringify({ ok: true, status }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('syncpay-webhook error:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
