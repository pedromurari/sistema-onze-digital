import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const tipo = url.searchParams.get('type') ?? body?.type ?? body?.topic;
    const paymentId = url.searchParams.get('data.id') ?? body?.data?.id ?? body?.id;
    if (tipo !== 'payment' || !paymentId) return new Response('ok');
    const token = Deno.env.get('MP_ACCESS_TOKEN');
    if (!token) return new Response('gateway unavailable', { status: 503 });
    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return new Response('retry', { status: 502 });
    const pagamento = await resposta.json();
    if (pagamento.status !== 'approved' || !pagamento.external_reference) return new Response('ok');
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: inscricao } = await db.from('workshop_inscricoes')
      .select('id,workshop_id,status').eq('id', pagamento.external_reference).maybeSingle();
    if (!inscricao || inscricao.status === 'pago' || inscricao.status === 'interessado') return new Response('ok');
    const { data: edicao } = await db.from('workshop_edicoes')
      .select('id,valor_centavos,modalidade').eq('id', inscricao.workshop_id).maybeSingle();
    if (!edicao || edicao.modalidade !== 'pago' || Math.round(Number(pagamento.transaction_amount) * 100) !== edicao.valor_centavos) {
      return new Response('amount mismatch', { status: 409 });
    }
    const { error } = await db.from('workshop_inscricoes').update({
      status: 'pago', pagamento_id: String(pagamento.id), pago_em: new Date().toISOString(),
    }).eq('id', inscricao.id).eq('status', 'pendente_pagamento');
    return new Response(error ? 'retry' : 'ok', { status: error ? 500 : 200 });
  } catch (error) {
    console.error('workshop-pagamento-webhook:', error);
    return new Response('retry', { status: 500 });
  }
});
