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
 *      É o caminho normal: o `syncpay-gerar-pix` grava o `identifier` na
 *      parcela no momento em que cria a cobrança.
 *   2. Se não achou, consulta GET /transaction/{id} e lê o `description`,
 *      onde o gerador embute `[ref:<pagamento_id>]`. Rede de segurança pra
 *      quando a gravação do identifier falhou, ou quando a SyncPay manda um
 *      id diferente do que devolveu no cash-in (a documentação deles não
 *      garante que `id` do webhook == `identifier` do cash-in).
 *   3. Nada disso bateu -> NÃO inventa. Grava em syncpay_webhook_logs com
 *      resultado explicando, e devolve 200 pra Sync não ficar reenviando.
 *
 * Fecha fechado de propósito: nunca marca parcela como paga por aproximação
 * de valor. Pagamento não identificado fica no log pra conferência manual.
 *
 * Auth: a SyncPay não assina os webhooks (sem HMAC). O painel deles gera um
 * token por endpoint, mandado em `Authorization: Bearer <token>`. Se o
 * secret SYNCPAY_WEBHOOK_TOKEN estiver configurado, exigimos que bata; se
 * não estiver, aceitamos e registramos no log (pra não perder pagamento
 * enquanto o token não foi cadastrado).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API = 'https://api.syncpayments.com.br/api/partner/v1';

// Da documentação da consulta de transação: pending, completed, failed,
// refunded, med. Só `completed` vira baixa.
const PAGO = new Set(['completed', 'paid', 'approved']);
const NEGATIVO = new Set(['refunded', 'med', 'failed', 'chargeback']);

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

    const esperado = Deno.env.get('SYNCPAY_WEBHOOK_TOKEN');
    if (esperado) {
      const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
      if (recebido !== esperado) {
        await sb.from('syncpay_webhook_logs').insert({
          evento: String(primeiro(payload?.event, '') ?? ''),
          resultado: 'REJEITADO: Authorization não confere',
          payload,
        });
        return new Response('unauthorized', { status: 401, headers: cors });
      }
    }

    const transacaoId = String(primeiro(d?.id, d?.identifier, d?.reference_id, d?.transaction_id) ?? '');
    const statusRaw = String(primeiro(d?.status, payload?.status) ?? '').toLowerCase();
    const valor = Number(primeiro(d?.amount, d?.final_amount, d?.value) ?? 0);
    const evento = String(primeiro(payload?.event, d?.event, '') ?? '');

    if (!transacaoId) {
      resultado = 'sem id de transação no payload';
      await sb.from('syncpay_webhook_logs').insert({ evento, status_recebido: statusRaw, valor, resultado, payload });
      return ok({ aviso: resultado });
    }

    // --- tentativa 1: identifier gravado na parcela
    let { data: parcela } = await sb
      .from('pagamentos')
      .select('id, aluno_id, numero_parcela, valor, status')
      .eq('syncpay_identifier', transacaoId)
      .maybeSingle();

    // --- tentativa 2: ler o description da transação e extrair [ref:<uuid>]
    if (!parcela) {
      const t = await token();
      if (t) {
        const r = await fetch(`${API}/transaction/${transacaoId}`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${t}` },
        });
        const j = await r.json().catch(() => ({}));
        const desc = String(j?.data?.description ?? '');
        const m = desc.match(/\[ref:([0-9a-f-]{36})\]/i);
        if (m) {
          const { data: p2 } = await sb
            .from('pagamentos')
            .select('id, aluno_id, numero_parcela, valor, status')
            .eq('id', m[1])
            .maybeSingle();
          if (p2) {
            parcela = p2;
            // aproveita e conserta o vínculo que faltou
            await sb.from('pagamentos').update({ syncpay_identifier: transacaoId }).eq('id', p2.id);
          }
        }
      }
    }

    if (!parcela) {
      resultado = `transação ${transacaoId} não casou com nenhuma parcela (status '${statusRaw}', R$ ${valor})`;
      await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, resultado, payload });
      return ok({ aviso: resultado });
    }

    pagamentoId = parcela.id;

    if (NEGATIVO.has(statusRaw)) {
      resultado = `status '${statusRaw}' — parcela ${parcela.numero_parcela} NÃO foi marcada paga (conferir manualmente)`;
      await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, pagamento_id: pagamentoId, resultado, payload });
      return ok({ aviso: resultado });
    }

    if (!PAGO.has(statusRaw)) {
      resultado = `status '${statusRaw}' ainda não é pagamento — nada a fazer`;
      await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, pagamento_id: pagamentoId, resultado, payload });
      return ok({ ignorado: statusRaw });
    }

    if (parcela.status === 'pago') {
      resultado = `parcela ${parcela.numero_parcela} já estava paga — nenhuma alteração (evento repetido)`;
      await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, pagamento_id: pagamentoId, resultado, payload });
      return ok({ ja_pago: true });
    }

    // Confere o valor antes de dar baixa. Tolerância de 2 centavos, mesmo
    // critério já usado no voomp-webhook.
    if (valor > 0 && Math.abs(valor - Number(parcela.valor)) > 0.02) {
      resultado = `valor divergente: webhook R$ ${valor} x parcela R$ ${parcela.valor} — NÃO dei baixa`;
      await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, pagamento_id: pagamentoId, resultado, payload });
      return ok({ aviso: resultado });
    }

    const liquido = Number(primeiro(d?.final_amount, 0) ?? 0);
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

    await sb.from('syncpay_webhook_logs').insert({ evento, transacao_id: transacaoId, status_recebido: statusRaw, valor, pagamento_id: pagamentoId, resultado, payload });

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
