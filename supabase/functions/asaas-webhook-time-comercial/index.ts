/**
 * asaas-webhook-time-comercial
 * Recebe as notificações do Asaas (PRODUCAO) pros boletos das parcelas 2-15
 * do plano "boleto" da matrícula do Time Comercial (gerados por
 * matricula-boleto-mensal-gerar). Mantém `pagamentos` sincronizado com o
 * status real no Asaas e recalcula `alunos.mensalidades_pagas` -- mesmo
 * papel que mp-webhook-time-comercial cumpre pro Mercado Pago (PIX/cartão),
 * só que aqui é sempre pela convenção "pagamentos.id" (nunca "alunos.id",
 * porque a 1ª parcela desse plano é PIX-MP, não passa por aqui).
 *
 * URL a cadastrar manualmente no painel Asaas → Integrações → Webhooks:
 *   https://<project-ref>.supabase.co/functions/v1/asaas-webhook-time-comercial
 * Marcar pelo menos os eventos: PAYMENT_RECEIVED e PAYMENT_CONFIRMED.
 *
 * Auth: Asaas manda de volta, em todo webhook, o header configurado como
 * "Token de autenticação" na hora de cadastrar o endpoint no painel --
 * validamos contra ASAAS_WEBHOOK_TOKEN (secret gerada por nós, não é a
 * ASAAS_API_KEY). Notificação sem esse header/valor batendo é rejeitada com
 * 401 antes de tocar em qualquer dado.
 *
 * Sempre responde 200 rápido em qualquer evento reconhecido/ignorado -- o
 * Asaas re-tenta agressivamente em resposta != 2xx (mesmo princípio do
 * mp-webhook-time-comercial).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

const EVENTOS_PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

// ── Confirmação por WhatsApp + e-mail -- best-effort, nunca derruba o 200 ────
async function enviarConfirmacoes(
  supabaseUrl: string,
  serviceKey: string,
  aluno: { nome: string | null; email: string | null; whatsapp: string | null; cobranca_telefone: string | null },
  valor: number,
  parcela: number,
): Promise<void> {
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const nome = aluno.nome || 'aluno(a)';
  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const numero = aluno.cobranca_telefone || aluno.whatsapp;
  if (numero) {
    const mensagem = `✅ Pagamento confirmado, ${nome}!\n\nRecebemos a parcela ${parcela}/15 (*R$ ${valorFmt}*) da sua matrícula no *Instituto Despertamente*.\n\nQualquer dúvida, é só chamar por aqui.`;
    try {
      await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
        method: 'POST', headers: fnHeaders,
        // instance_name fixo em 'disp3' (WhatsApp "Financeiro IDM") -- pedido
        // explícito do dono do produto pra esse número ser o wpp de
        // financeiro (2026-09-03), em vez de cair no rodízio por prioridade.
        body: JSON.stringify({ numero, mensagem, instance_name: 'disp3' }),
      });
    } catch (e) {
      console.error('asaas-webhook-time-comercial: falha ao enviar whatsapp de confirmação', e);
    }
  }

  if (aluno.email) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/email-enviar`, {
        method: 'POST', headers: fnHeaders,
        body: JSON.stringify({
          to: aluno.email,
          to_name: nome,
          subject: 'Pagamento confirmado - Instituto Despertamente',
          html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${nome}!</p><p>Confirmamos o pagamento da parcela ${parcela}/15 (<strong>R$ ${valorFmt}</strong>) da sua matrícula no Instituto Despertamente.</p><p>Qualquer dúvida, é só responder este e-mail.</p>`,
        }),
      });
    } catch (e) {
      console.error('asaas-webhook-time-comercial: falha ao enviar email de confirmação', e);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (ASAAS_WEBHOOK_TOKEN) {
      const tokenHeader = req.headers.get('asaas-access-token');
      if (tokenHeader !== ASAAS_WEBHOOK_TOKEN) {
        console.error('asaas-webhook-time-comercial: token ausente ou inválido');
        return new Response(JSON.stringify({ ok: false, erro: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const event = String(body?.event ?? '');
    const payment = body?.payment;

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ ok: true, aviso: 'sem event/payment' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!EVENTOS_PAGO.has(event)) {
      return new Response(JSON.stringify({ ok: true, ignorado: event }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: pagamento } = await supabase
      .from('pagamentos')
      .select('id, aluno_id, valor, numero_parcela, status')
      .eq('asaas_payment_id', String(payment.id))
      .maybeSingle();

    if (!pagamento) {
      // externalReference é a mesma coisa que asaas_payment_id deveria bater,
      // mas por segurança tenta achar pelo externalReference também (id da
      // linha em `pagamentos`, gravado na criação -- ver
      // matricula-boleto-mensal-gerar).
      const externalReference = payment.externalReference ? String(payment.externalReference) : null;
      if (!externalReference) {
        return new Response(JSON.stringify({ ok: true, aviso: 'pagamento não encontrado' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: pagamentoPorRef } = await supabase
        .from('pagamentos')
        .select('id, aluno_id, valor, numero_parcela, status')
        .eq('id', externalReference)
        .maybeSingle();

      if (!pagamentoPorRef) {
        return new Response(JSON.stringify({ ok: true, aviso: 'pagamento não encontrado (externalReference)' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return await marcarPago(supabase, pagamentoPorRef, String(payment.id));
    }

    return await marcarPago(supabase, pagamento, String(payment.id));
  } catch (error) {
    console.error('asaas-webhook-time-comercial error:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function marcarPago(
  supabase: ReturnType<typeof createClient>,
  pagamento: { id: string; aluno_id: string; valor: number; numero_parcela: number; status: string | null },
  asaasPaymentId: string,
) {
  const jaEstavaPago = pagamento.status === 'pago';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  await supabase.from('pagamentos').update({
    status: 'pago',
    data_pagamento: new Date().toISOString().slice(0, 10),
    asaas_payment_id: asaasPaymentId,
  }).eq('id', pagamento.id);

  // Recalcula mensalidades_pagas -- mesma convenção usada por
  // mp-webhook-time-comercial (contagem de pagamentos status='pago').
  const { count } = await supabase
    .from('pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', pagamento.aluno_id)
    .eq('status', 'pago');
  await supabase.from('alunos').update({ mensalidades_pagas: count ?? 0 }).eq('id', pagamento.aluno_id);

  if (!jaEstavaPago) {
    const { data: aluno } = await supabase
      .from('alunos')
      .select('nome, email, whatsapp, cobranca_telefone')
      .eq('id', pagamento.aluno_id)
      .maybeSingle();
    if (aluno) {
      await enviarConfirmacoes(supabaseUrl, serviceKey, aluno as any, Number(pagamento.valor), pagamento.numero_parcela).catch((e) =>
        console.error('asaas-webhook-time-comercial: falha ao enviar confirmações', e));
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
