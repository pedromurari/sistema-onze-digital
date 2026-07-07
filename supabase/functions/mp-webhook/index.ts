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

function normalizeNumero(raw: string) {
  return raw.replace(/\D/g, '');
}

async function liberarAcesso(supabase: ReturnType<typeof createClient>, venda: {
  id: string; produto_id: string; comprador_nome: string; comprador_email: string; comprador_whatsapp: string | null; bump_incluido: boolean;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

  const { data: produto } = await supabase
    .from('parceiros_produtos')
    .select('nome, descricao, integra_seu_numerologo, bump_nome')
    .eq('id', venda.produto_id).maybeSingle();

  if (!produto) return;

  const nomeCompra = venda.bump_incluido && produto.bump_nome ? `${produto.nome} + ${produto.bump_nome}` : produto.nome;

  // ── E-mail de boas-vindas ──────────────────────────────────────────────────
  if (venda.comprador_email) {
    await fetch(`${supabaseUrl}/functions/v1/email-enviar`, {
      method: 'POST', headers: fnHeaders,
      body: JSON.stringify({
        to: venda.comprador_email,
        to_name: venda.comprador_nome,
        subject: `Pagamento confirmado: ${nomeCompra}`,
        html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${venda.comprador_nome}!</p><p>Confirmamos o pagamento de <strong>${nomeCompra}</strong>.</p>${produto.integra_seu_numerologo ? '<p>Seu Mapa Numerológico está sendo preparado — nossa equipe vai te chamar no WhatsApp para confirmar sua data de nascimento e finalizar o seu mapa.</p>' : `<p>${produto.descricao ?? ''}</p>`}<p>Qualquer dúvida, é só responder este e-mail.</p>`,
      }),
    }).catch((e) => console.error('mp-webhook: falha ao enviar email', e));
  }

  // ── WhatsApp de boas-vindas ─────────────────────────────────────────────────
  if (venda.comprador_whatsapp) {
    const numero = normalizeNumero(venda.comprador_whatsapp);
    const mensagem = produto.integra_seu_numerologo
      ? `🎉 Pagamento confirmado, ${venda.comprador_nome}!\n\nSeu *${nomeCompra}* está sendo preparado com carinho.\n\nEm breve nossa equipe vai te chamar aqui pra confirmar sua data de nascimento e finalizar o seu mapa. Fique de olho! ✨`
      : `🎉 Pagamento confirmado, ${venda.comprador_nome}!\n\nObrigado por comprar *${nomeCompra}*. Em breve você recebe mais informações por aqui.`;

    await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
      method: 'POST', headers: fnHeaders,
      body: JSON.stringify({ numero, mensagem }),
    }).catch((e) => console.error('mp-webhook: falha ao enviar whatsapp', e));
  }

  // ── Integração Seu Numerólogo (Kanban "Pago — Mapa Pendente") ──────────────
  if (produto.integra_seu_numerologo) {
    const { data: leadExistente } = await supabase
      .from('seu_numerologo_leads')
      .select('id')
      .eq('email', venda.comprador_email)
      .limit(1).maybeSingle();

    if (leadExistente) {
      await supabase.from('seu_numerologo_leads')
        .update({ status: 'pago', pago_at: new Date().toISOString(), nome: venda.comprador_nome, whatsapp: venda.comprador_whatsapp ? normalizeNumero(venda.comprador_whatsapp) : null })
        .eq('id', leadExistente.id);
    } else {
      await supabase.from('seu_numerologo_leads').insert({
        nome: venda.comprador_nome,
        email: venda.comprador_email,
        whatsapp: venda.comprador_whatsapp ? normalizeNumero(venda.comprador_whatsapp) : null,
        produto: nomeCompra,
        data_nascimento: 'Não informado (compra via checkout IDM — confirmar com o cliente)',
        status: 'pago',
        pago_at: new Date().toISOString(),
        comprou_at: new Date().toISOString(),
      });
    }
  }

  await supabase.from('parceiros_vendas')
    .update({ acesso_liberado: true, acesso_liberado_em: new Date().toISOString() })
    .eq('id', venda.id);
}

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
      .select('id, produto_id, status, comissao_afiliado, cupom_id, comprador_nome, comprador_email, comprador_whatsapp, bump_incluido, acesso_liberado')
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

    if (novoStatus === 'aprovado' && !venda.acesso_liberado) {
      await liberarAcesso(supabase, venda as any).catch((e) => console.error('mp-webhook: falha ao liberar acesso', e));
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
