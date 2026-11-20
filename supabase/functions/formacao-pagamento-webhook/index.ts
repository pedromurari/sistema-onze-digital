/**
 * formacao-pagamento-webhook
 *
 * Recebe a notificação do Mercado Pago dos pagamentos criados pela
 * `formacao-inscricao-criar` (conta institucional do IDM). É o que fecha o
 * ciclo do Pix: o QR Code é pago minutos depois que a pessoa sai da ficha,
 * então sem webhook a inscrição ficaria "pendente" pra sempre e o lead nunca
 * viraria "fechado" no Kanban.
 *
 * Verifica o pagamento consultando a API do Mercado Pago com o nosso próprio
 * token (não confia no corpo da notificação, que é público e não autenticado).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') ?? url.searchParams.get('id');

    if (!paymentId) {
      const body = await req.json().catch(() => ({}));
      paymentId = body?.data?.id ? String(body.data.id) : (body?.id ? String(body.id) : null);
      const tipo = body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
      if (tipo && tipo !== 'payment') return new Response('ok', { headers: cors });
    }

    if (!paymentId) return new Response('ok', { headers: cors });

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) {
      console.error('formacao-pagamento-webhook: MP_ACCESS_TOKEN ausente');
      return new Response('ok', { headers: cors });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      console.error('formacao-pagamento-webhook: pagamento não encontrado', paymentId);
      return new Response('ok', { headers: cors });
    }
    const mp = await mpRes.json();

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: inscricao } = await db
      .from('formacao_inscricoes')
      .select('id, lead_id, status')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle();

    // Pagamento de outro fluxo (matrícula, workshop, Divã) cai aqui também se
    // alguém apontar o webhook errado -- ignorar em silêncio é o certo.
    if (!inscricao) return new Response('ok', { headers: cors });

    const statusMap: Record<string, string> = {
      approved: 'aprovado',
      pending: 'pendente',
      in_process: 'pendente',
      rejected: 'recusado',
      cancelled: 'cancelado',
      refunded: 'cancelado',
      charged_back: 'cancelado',
    };
    const status = statusMap[mp.status] ?? 'pendente';

    if (status === inscricao.status) return new Response('ok', { headers: cors });

    await db.from('formacao_inscricoes')
      .update({ status, atualizado_em: new Date().toISOString() })
      .eq('id', inscricao.id);

    if (status === 'aprovado' && inscricao.lead_id) {
      await db.from('leads')
        .update({
          status: 'fechado',
          matriculado_em: new Date().toISOString(),
          ultima_atividade: new Date().toISOString(),
        })
        .eq('id', inscricao.lead_id);
    }

    console.log(`formacao-pagamento-webhook: inscrição ${inscricao.id} → ${status}`);
    return new Response('ok', { headers: cors });
  } catch (error) {
    console.error('formacao-pagamento-webhook:', error);
    return new Response('ok', { headers: cors });
  }
});
