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
 *
 * Se o produto vendido for um plano do Divã IDM (produto.parceiro_id tem
 * um diva_terapeutas vinculado), cria a sessão em diva_sessoes automático
 * -- antes disso, quem vendia por fora do checkout (link manual ou vendedora
 * nao usava esse link) tinha que registrar na mao na aba Sessões, e a
 * terapeuta só ficava sabendo se alguém avisasse. Agora o pagamento aprovado
 * já cai direto no painel dela, sem depender de ninguém lembrar.
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

async function wppEnviar(supabaseUrl: string, serviceKey: string, numero: string, mensagem: string, instanceName?: string) {
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  return fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
    method: 'POST', headers: fnHeaders,
    body: JSON.stringify({ numero, mensagem, instance_name: instanceName }),
  }).catch((e) => console.error('mp-webhook: falha ao enviar whatsapp', e));
}

// Nome do produto segue sempre "Divã IDM — <plano> (<primeiro nome>)" (ver
// diva-terapeuta-conectar-mp) -- extrai quantidade/tipo direto do nome em vez
// de precisar de outra tabela de referência.
function lerPlanoDivaDoNome(nomeProduto: string): { tipo: 'avulsa' | 'pacote'; quantidade: number } {
  const match = nomeProduto.match(/(\d+)\s*sess/i);
  const quantidade = match ? Number(match[1]) : 1;
  const tipo = /pacote/i.test(nomeProduto) ? 'pacote' : 'avulsa';
  return { tipo, quantidade };
}

async function criarSessaoDivaSeAplicavel(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  venda: {
    comprador_nome: string; comprador_whatsapp: string | null;
    valor_bruto: number; valor_liquido: number; comissao_idm: number;
  },
  produto: { nome: string; parceiro_id: string | null },
  paymentId: string,
) {
  if (!produto.parceiro_id) return;

  const { data: terapeuta } = await supabase
    .from('diva_terapeutas')
    .select('id, nome, whatsapp')
    .eq('parceiro_id', produto.parceiro_id)
    .eq('status', 'aprovado')
    .maybeSingle();
  if (!terapeuta) return; // produto não é de um terapeuta do Divã -- não faz nada

  const { tipo, quantidade } = lerPlanoDivaDoNome(produto.nome);

  const { error: insertError } = await supabase.from('diva_sessoes').insert({
    cliente_nome: venda.comprador_nome,
    cliente_whatsapp: venda.comprador_whatsapp,
    terapeuta_id: terapeuta.id,
    tipo,
    quantidade_sessoes: quantidade,
    valor_total: venda.valor_bruto,
    valor_terapeuta: venda.valor_liquido,
    valor_idm: venda.comissao_idm,
    status_pagamento: 'pago',
    status_repasse: 'pago', // split automático via MP, dinheiro já foi direto pra conta da terapeuta
    observacoes: `Venda automática via checkout -- mp_payment_id ${paymentId}`,
  });
  if (insertError) { console.error('mp-webhook: falha ao criar sessão do Divã', insertError); return; }

  if (terapeuta.whatsapp) {
    const primeiroNome = (terapeuta.nome as string).split(' ')[0];
    const descricaoPacote = tipo === 'pacote' ? `pacote de ${quantidade} sessões` : `${quantidade} sessão${quantidade > 1 ? 'ões' : ''} avulsa${quantidade > 1 ? 's' : ''}`;
    const mensagem = `Oi, ${primeiroNome}! Aqui é o time do Divã IDM 💙\n\nSaiu uma venda nova pra você (pagamento confirmado automático):\n\n👤 Cliente: ${venda.comprador_nome}\n📦 ${descricaoPacote}\n💰 Valor: R$ ${Number(venda.valor_bruto).toFixed(2).replace('.', ',')}\n\nJá atualizei isso no seu painel (aba "Minhas sessões"). Só falta combinar com ${venda.comprador_nome.split(' ')[0]} o dia e horário — pode marcar direto lá na sua agenda, no mesmo link que você já tem.`;
    await wppEnviar(supabaseUrl, serviceKey, terapeuta.whatsapp as string, mensagem, 'Divã IDM');
  }
}

async function liberarAcesso(supabase: ReturnType<typeof createClient>, venda: {
  id: string; produto_id: string; comprador_nome: string; comprador_email: string; comprador_whatsapp: string | null; bump_incluido: boolean;
  valor_bruto: number; valor_liquido: number; comissao_idm: number;
}, paymentId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

  const { data: produto } = await supabase
    .from('parceiros_produtos')
    .select('nome, descricao, integra_seu_numerologo, bump_nome, parceiro_id')
    .eq('id', venda.produto_id).maybeSingle();

  if (!produto) return;

  await criarSessaoDivaSeAplicavel(supabase, supabaseUrl, serviceKey, venda, produto, paymentId)
    .catch((e) => console.error('mp-webhook: falha no fluxo Divã', e));

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

    await wppEnviar(supabaseUrl, serviceKey, numero, mensagem);
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
      .select('id, produto_id, status, comissao_afiliado, cupom_id, comprador_nome, comprador_email, comprador_whatsapp, bump_incluido, acesso_liberado, valor_bruto, valor_liquido, comissao_idm')
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
      await liberarAcesso(supabase, venda as any, String(paymentId)).catch((e) => console.error('mp-webhook: falha ao liberar acesso', e));
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
