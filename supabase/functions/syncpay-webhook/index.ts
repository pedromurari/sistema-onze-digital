/**
 * syncpay-webhook
 * Recebe eventos de cashin da SyncPay pra checkouts que foram criados direto
 * no dashboard hospedado da Sync (fora da nossa API/checkout proprio -- ex:
 * os produtos da Jocimara Anjos). Diferente do mp-webhook, aqui NAO existe
 * uma venda pre-criada pra atualizar: a venda inteira nasce a partir do
 * webhook.
 *
 * Atribuicao de parceira/produto: o webhook e registrado na SyncPay (via
 * POST /api/partner/v1/webhooks, escopado por product_tokens) com a URL
 * desta function + ?produto_id=<uuid>. Isso garante que sabemos de quem e
 * a venda mesmo sem depender do formato exato do payload -- que ainda nao
 * temos 100% confirmado, entao o parsing de valor/status/comprador abaixo
 * e defensivo e tenta varios formatos conhecidos da API da Sync. O payload
 * bruto sempre fica salvo em raw_payload pra ajuste fino depois do primeiro
 * evento real.
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
    const produtoId = url.searchParams.get('produto_id');
    if (!produtoId) {
      console.error('syncpay-webhook: sem produto_id na URL do webhook');
      return new Response(JSON.stringify({ ok: true, aviso: 'sem produto_id' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
