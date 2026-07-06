/**
 * mp-webhook
 * Recebe as notificacoes de pagamento do Mercado Pago (webhooks/IPN) e
 * atualiza o status da venda em parceiros_vendas com o status real da API.
 *
 * NAO faz repasse automatico da comissao de afiliada -- o Mercado Pago nao
 * tem uma API publica simples de transferencia conta-a-conta pra isso (o
 * split nativo dele e so de duas pontas: vendedora + application_fee do
 * IDM). O repasse da afiliada fica marcado como pendente e visivel pro
 * admin pagar manualmente (Pix), na aba Vendas.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_MAP: Record<string, string> = {
  approved: 'aprovado',
  pending: 'pendente',
  in_process: 'pendente',
  rejected: 'recusado',
  cancelled: 'recusado',
  refunded: 'estornado',
  charged_back: 'estornado',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    let topic = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!paymentId) {
      const body = await req.json().catch(() => ({}));
      paymentId = body?.data?.id ?? null;
      topic = topic || body?.type;
    }

    if (topic && topic !== 'payment') {
      return new Response(JSON.stringify({ ok: true, ignorado: topic }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ ok: true, aviso: 'sem payment id' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: venda, error: vendaErr } = await supabase
      .from('parceiros_vendas')
      .select('id, produto_id, status, comissao_afiliado, cupom_id')
      .eq('mp_payment_id', String(paymentId)).maybeSingle();

    if (vendaErr || !venda) {
      console.warn('mp-webhook: venda nao encontrada para payment_id', paymentId);
      return new Response(JSON.stringify({ ok: true, aviso: 'venda nao encontrada' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: produto } = await supabase
      .from('parceiros_produtos').select('parceiro_id').eq('id', venda.produto_id).maybeSingle();
    const { data: dona } = await supabase
      .from('parceiros').select('mp_access_token').eq('id', produto?.parceiro_id).maybeSingle();

    if (!dona?.mp_access_token) {
      console.error('mp-webhook: sem token da parceira pra consultar o pagamento', paymentId);
      return new Response(JSON.stringify({ ok: true, aviso: 'sem token' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${dona.mp_access_token}` },
    });
    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('mp-webhook: erro ao consultar pagamento', mpData);
      return new Response(JSON.stringify({ ok: true, aviso: 'erro ao consultar pagamento' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const novoStatus = STATUS_MAP[mpData.status] ?? venda.status;

    if (novoStatus !== venda.status) {
      await supabase.from('parceiros_vendas').update({ status: novoStatus }).eq('id', venda.id);
    }

    return new Response(JSON.stringify({ ok: true, status: novoStatus }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('mp-webhook error:', error);
    // Sempre responde 200 pro Mercado Pago nao ficar re-tentando indefinidamente por erro nosso
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
