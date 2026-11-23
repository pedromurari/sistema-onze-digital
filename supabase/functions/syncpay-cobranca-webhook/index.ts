/**
 * syncpay-cobranca-webhook — dá baixa na parcela do aluno quando a SyncPay
 * avisa que o PIX foi pago (23/11/2026).
 *
 * NÃO confundir com `syncpay-webhook`, que é de outro fluxo (vendas de
 * parceiro no checkout hospedado da Sync, grava em `parceiros_vendas`).
 * Este aqui só mexe em `pagamentos`.
 *
 * Como casa o pagamento com a parcela, em três tentativas, nesta ordem:
 *   1. `pagamentos.syncpay_identifier` = id da transação no payload.
 *   2. Se não achou, consulta GET /transaction/{id} e lê o `description`,
 *      onde o gerador embute `[ref:<pagamento_id>]`.
 *   3. Nada disso bateu -> NÃO inventa. Grava em syncpay_webhook_logs com
 *      resultado explicando, e devolve 200 pra Sync não ficar reenviando.
 *
 * ── INCIDENTE 23/11/2026, e o que mudou por causa dele ────────────────────
 * Entre ~14h e 17h30 TODOS os webhooks foram rejeitados com "Authorization
 * não confere" e dois pagamentos reais ficaram presos (Mirna R$ 109,90 e
 * Julvana R$ 100,00): a aluna pagava, o dinheiro entrava na SyncPay, e o
 * sistema seguia mostrando a parcela em aberto, sem confirmação nenhuma.
 * Três defeitos encadeados:
 *
 *   a) O token do painel da SyncPay não é o que ela manda no header. A
 *      autenticação virou, por isso, uma trava FRÁGIL pra ser a única porta.
 *   b) O CHECK de `pagamentos.conta_recebimento` não aceitava 'syncpay',
 *      então a baixa falharia no UPDATE mesmo com a auth passando.
 *   c) O vocabulário de status: a SyncPay manda `PAID_OUT` no webhook, e
 *      não o `completed` que a documentação da CONSULTA descreve.
 *
 * A lição é que autenticar na porta não pode ser a única defesa contra
 * pagamento forjado (foi o que aconteceu com o syncpay-webhook antigo, ver
 * incidente de 19-22/11). Agora a defesa real é outra: ANTES de marcar
 * qualquer parcela como paga, este webhook confirma a transação na API da
 * SyncPay e exige `completed` + valor conferindo. Um payload forjado não
 * sobrevive a essa checagem, nem com o token certo. O token continua sendo
 * verificado, mas como sinal registrado no log, não como porta fechada --
 * trocar recebimento de dinheiro por uma string que a gente não controla
 * já provou custar caro.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API = 'https://api.syncpayments.com.br/api/partner/v1';

// Vocabulário observado na prática: o WEBHOOK manda PAID_OUT /
// WAITING_FOR_APPROVAL; a CONSULTA de transação devolve completed / pending.
// Os dois conjuntos ficam aqui porque os dois aparecem.
const PAGO = new Set(['completed', 'paid', 'approved', 'paid_out']);
const NEGATIVO = new Set(['refunded', 'med', 'failed', 'chargeback', 'canceled', 'cancelled']);

function primeiro(...vals: unknown[]) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return null;
}

async function token(): Promise<string | null> {
  const client_id = Deno.env.get('SYNCPAY_CLIENT_ID');
  const client_secret = Deno.env.get('SYNCPAY_CLIENT_SECRET');
  if (!client_id || !client_secret) return null;
  const r = await fetch(`${API}/auth-token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return j?.access_token ?? null;
}

// Nome do produto como o aluno conhece, pra mensagem não sair com o slug.
const PRODUTO_LABEL: Record<string, string> = {
  psicanalise: 'curso de Psicanálise',
  numerologia: 'Mentoria NPS',
  nps: 'Mentoria NPS',
  'pnl-master': 'Master em PNL',
  'pnl-practitioner': 'PNL Practitioner',
  'sociedade-idm': 'Sociedade IDM',
  'diva-idm': 'Divã IDM',
  npa: 'NPA — O Despertar dos Números',
};

// Produtos de assinatura nunca falam "parcela X de Y" -- é recorrente, e
// dizer "parcela 7 de 10" dá a entender que tem fim.
const ASSINATURAS = new Set(['numerologia', 'nps', 'sociedade-idm', 'diva-idm']);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Confirmação de pagamento pro aluno, pra QUALQUER produto.
 *
 * Existia só pro NPS (dentro de nps-matricula-status) e, antes disso, no
 * webhook do Asaas -- que morreu com a conta. Resultado: desde a troca pra
 * SyncPay, aluno de Psicanálise/PNL pagava e não recebia confirmação
 * nenhuma. Pego em 23/11/2026 com a Mirna.
 *
 * Sai sempre pelo número do Financeiro IDM e fica registrado em
 * `cobranca_logs`, igual a qualquer outra mensagem financeira.
 */
async function confirmarPagamento(
  sb: ReturnType<typeof createClient>,
  parcela: { id: string; aluno_id: string; numero_parcela: number; valor: number | string; produto: string | null },
) {
  const { data: aluno } = await sb
    .from('alunos')
    .select('id, nome, whatsapp, cobranca_telefone, total_mensalidades')
    .eq('id', parcela.aluno_id)
    .maybeSingle();

  const numero = (aluno?.cobranca_telefone || aluno?.whatsapp || '').trim();
  if (!aluno || !numero) return;

  // Sem nome no cadastro a saudação sai sem vocativo, nunca com placeholder.
  const primeiroNome = String(aluno.nome ?? '').trim().split(/\s+/)[0] ?? '';
  const vocativo = primeiroNome ? `, ${primeiroNome}` : '';
  const produto = String(parcela.produto ?? '');
  const label = PRODUTO_LABEL[produto] ?? 'seu curso';
  const valorFmt = Number(parcela.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const oQueFoiPago = ASSINATURAS.has(produto)
    ? `a mensalidade de ${MESES[agora.getMonth()]} da *${label}*`
    : `a parcela ${parcela.numero_parcela}${aluno.total_mensalidades ? ` de ${aluno.total_mensalidades}` : ''} do *${label}*`;

  // Confirmação é a boa notícia do mês pro aluno -- vai com a mesma cara da
  // do NPS (emoji + negrito), e não com o tom seco da cobrança.
  const mensagem =
    `✅ Pagamento confirmado${vocativo}!\n\n` +
    `Recebemos ${oQueFoiPago}, no valor de *R$ ${valorFmt}*. Está tudo certo por aqui 💙\n\n` +
    `Qualquer dúvida, é só chamar. Financeiro IDM.`;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'x-financeiro-key': Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026',
    },
    body: JSON.stringify({ numero, mensagem, instance_name: 'Financeiro IDM', typing_delay_ms: 2000 }),
  }).catch(() => null);

  await sb.from('cobranca_logs').insert({
    aluno_id: aluno.id,
    pagamento_id: parcela.id,
    aluno_nome: String(aluno.nome ?? ''),
    telefone: numero,
    mensagem,
    template_nome: 'Confirmação de pagamento (SyncPay)',
    template_tipo: 'quitacao',
    status: r?.ok ? 'enviado' : 'erro',
    enviado_em: r?.ok ? new Date().toISOString() : null,
    manual: false,
  });
}

/** Consulta a transação na SyncPay. É a prova de que o pagamento existe. */
async function consultar(transacaoId: string, bearer: string | null) {
  if (!bearer) return null;
  const r = await fetch(`${API}/transaction/${transacaoId}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${bearer}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return j?.data ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let payload: any = {};
  let resultado = '';
  let pagamentoId: string | null = null;

  const ok = (extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    payload = await req.json().catch(() => ({}));
    const d = payload?.data ?? payload;

    // Sinal de autenticação: registrado, nunca porta fechada (ver cabeçalho).
    // Guardamos só um prefixo, o bastante pra comparar com o painel sem
    // deixar segredo inteiro no banco.
    const esperado = Deno.env.get('SYNCPAY_WEBHOOK_TOKEN');
    const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const authOk = !esperado || recebido === esperado;
    const authNota = authOk
      ? ''
      : ` [auth não confere: recebido '${recebido.slice(0, 8)}…' (${recebido.length} chars)]`;

    const transacaoId = String(primeiro(d?.id, d?.identifier, d?.reference_id, d?.transaction_id) ?? '');
    const statusRaw = String(primeiro(d?.status, payload?.status) ?? '').toLowerCase();
    const valorPayload = Number(primeiro(d?.amount, d?.final_amount, d?.value) ?? 0);
    const evento = String(primeiro(payload?.event, d?.event, '') ?? '');

    const logar = (extra: Record<string, unknown> = {}) =>
      sb.from('syncpay_webhook_logs').insert({
        evento, transacao_id: transacaoId || null, status_recebido: statusRaw || null,
        valor: valorPayload || null, pagamento_id: pagamentoId,
        resultado: resultado + authNota, payload, ...extra,
      });

    if (!transacaoId) {
      resultado = 'sem id de transação no payload';
      await logar();
      return ok({ aviso: resultado });
    }

    // --- tentativa 1: identifier gravado na parcela
    let { data: parcela } = await sb
      .from('pagamentos')
      .select('id, aluno_id, numero_parcela, valor, status, produto')
      .eq('syncpay_identifier', transacaoId)
      .maybeSingle();

    let bearer: string | null = null;

    // --- tentativa 2: ler o description da transação e extrair [ref:<uuid>]
    if (!parcela) {
      bearer = await token();
      const t = await consultar(transacaoId, bearer);
      const m = String(t?.description ?? '').match(/\[ref:([0-9a-f-]{36})\]/i);
      if (m) {
        const { data: p2 } = await sb
          .from('pagamentos')
          .select('id, aluno_id, numero_parcela, valor, status, produto')
          .eq('id', m[1])
          .maybeSingle();
        if (p2) {
          parcela = p2;
          await sb.from('pagamentos').update({ syncpay_identifier: transacaoId }).eq('id', p2.id);
        }
      }
    }

    if (!parcela) {
      resultado = `transação ${transacaoId} não casou com nenhuma parcela (status '${statusRaw}', R$ ${valorPayload})`;
      await logar();
      return ok({ aviso: resultado });
    }

    pagamentoId = parcela.id;

    if (NEGATIVO.has(statusRaw)) {
      resultado = `status '${statusRaw}' — parcela ${parcela.numero_parcela} NÃO foi marcada paga (conferir manualmente)`;
      await logar();
      return ok({ aviso: resultado });
    }

    if (!PAGO.has(statusRaw)) {
      resultado = `status '${statusRaw}' ainda não é pagamento — nada a fazer`;
      await logar();
      return ok({ ignorado: statusRaw });
    }

    if (parcela.status === 'pago') {
      resultado = `parcela ${parcela.numero_parcela} já estava paga — nenhuma alteração (evento repetido)`;
      await logar();
      return ok({ ja_pago: true });
    }

    // ── A defesa de verdade: confirmar na fonte antes de mexer em dinheiro.
    if (!bearer) bearer = await token();
    const t = await consultar(transacaoId, bearer);
    if (!t) {
      resultado = `NÃO consegui confirmar a transação ${transacaoId} na SyncPay — baixa NÃO aplicada`;
      await logar();
      return ok({ aviso: resultado });
    }
    const statusApi = String(t?.status ?? '').toLowerCase();
    if (!PAGO.has(statusApi)) {
      resultado = `webhook dizia '${statusRaw}' mas a SyncPay responde '${statusApi}' — baixa NÃO aplicada`;
      await logar();
      return ok({ aviso: resultado });
    }

    // Valor conferido contra a API (não contra o payload, que é a parte que
    // alguém poderia forjar). Tolerância de 2 centavos, igual ao voomp-webhook.
    const valorApi = Number(t?.amount ?? 0);
    if (Math.abs(valorApi - Number(parcela.valor)) > 0.02) {
      resultado = `valor divergente: SyncPay R$ ${valorApi} x parcela R$ ${parcela.valor} — NÃO dei baixa`;
      await logar();
      return ok({ aviso: resultado });
    }

    const liquido = Number(primeiro(t?.final_amount, d?.final_amount, 0) ?? 0);
    const taxa = liquido > 0 ? Number((Number(parcela.valor) - liquido).toFixed(2)) : null;

    const { error: upErr } = await sb
      .from('pagamentos')
      .update({
        status: 'pago',
        data_pagamento: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10),
        conta_recebimento: 'syncpay',
        ...(taxa !== null && taxa >= 0 ? { taxa_valor: taxa } : {}),
      })
      .eq('id', parcela.id);

    resultado = upErr
      ? `ERRO ao dar baixa na parcela ${parcela.numero_parcela}: ${upErr.message}`
      : `parcela ${parcela.numero_parcela} marcada como paga (R$ ${parcela.valor}${taxa !== null ? `, taxa R$ ${taxa}` : ''})`;

    // A assinatura do NPS tem um pós-pagamento próprio (libera a área de
    // membros na 1ª mensalidade, manda a confirmação e cria a próxima).
    // Chamado por HTTP e não por import: o deploy de edge function sobe uma
    // pasta por vez, e importar '../nps-matricula-status' amarraria as duas.
    // É idempotente via `pagamentos.pos_processado_em`.
    if (!upErr && parcela.produto === 'numerologia') {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/nps-matricula-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({ paymentId: parcela.id }),
      }).catch((e) =>
        console.error('syncpay-cobranca-webhook: falha no pós-pagamento NPS', parcela.id, e));
    } else if (!upErr) {
      // Todo o resto (Psicanálise, PNL, Sociedade, Divã...) ganha a
      // confirmação aqui. O NPS fica de fora deste ramo de propósito: o
      // pós-pagamento dele já manda a dele, e as duas sairiam juntas.
      await confirmarPagamento(sb, parcela as any).catch((e) =>
        console.error('syncpay-cobranca-webhook: falha na confirmação', parcela.id, e));
    }

    await logar();

    return ok({ baixa: !upErr, parcela: parcela.numero_parcela });
  } catch (e) {
    await sb.from('syncpay_webhook_logs').insert({
      resultado: `EXCEÇÃO: ${(e as Error).message}`,
      pagamento_id: pagamentoId,
      payload,
    }).catch(() => {});
    // 200 de propósito: erro nosso não deve virar fila de reenvio na Sync.
    return ok({ erro: (e as Error).message });
  }
});
