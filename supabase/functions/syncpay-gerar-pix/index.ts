/**
 * syncpay-gerar-pix — gera o PIX de uma parcela de aluno pela SyncPay.
 * Mesmo contrato do `tmp-gerar-mp-pix`, trocando o gateway (23/11/2026).
 *
 * Body: { pagamento_id: string, forcar?: boolean }
 *
 * Duas diferenças importantes em relação ao Mercado Pago:
 *
 * 1. A SyncPay NÃO aceita referência externa no cash-in. Ela devolve um
 *    `identifier` dela, e é ele que volta no webhook. Então o vínculo só
 *    existe se a gente gravar esse identifier na parcela aqui. Se a
 *    gravação falhar depois da cobrança criada, o PIX vira órfão -- por
 *    isso o pagamento_id também vai dentro do `description`, como
 *    `[ref:<uuid>]`, que o `syncpay-cobranca-webhook` lê via
 *    GET /transaction/{id} quando o identifier não bate.
 *
 * 2. A SyncPay não documenta validade do QR nem endpoint de cancelamento,
 *    então não dá pra cancelar o PIX anterior ao regerar. Por isso o
 *    `forcar` consulta o status antes: se o anterior está `completed`,
 *    recusa (evita dois PIX vivos e pagamento em duplicidade).
 *
 * A restrição de IP da SyncPay vale só pra API de saque (cash-out), não
 * pro cash-in -- confirmado no painel deles. Por isso roda do Supabase.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API = 'https://api.syncpayments.com.br/api/partner/v1';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function token(): Promise<{ ok: true; token: string } | { ok: false; erro: string }> {
  const client_id = Deno.env.get('SYNCPAY_CLIENT_ID');
  const client_secret = Deno.env.get('SYNCPAY_CLIENT_SECRET');
  if (!client_id || !client_secret) {
    return { ok: false, erro: 'SYNCPAY_CLIENT_ID / SYNCPAY_CLIENT_SECRET não configurados nos secrets' };
  }
  const r = await fetch(`${API}/auth-token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.access_token) {
    return { ok: false, erro: `auth-token falhou (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 300)}` };
  }
  return { ok: true, token: j.access_token };
}

function digitos(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

// A SyncPay recusa (422) telefone que não tenha 10 ou 11 dígitos: ela quer
// DDD + número, sem o 55 do país. Nossos números ficam salvos no formato do
// WhatsApp (5511995311524, 13 dígitos), então o 55 precisa sair.
function telefoneBR(s: unknown): string {
  let d = digitos(s);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(-11);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { pagamento_id, forcar } = await req.json().catch(() => ({})) as {
      pagamento_id?: string; forcar?: boolean;
    };
    if (!pagamento_id) return json({ ok: false, erro: 'pagamento_id obrigatório' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: p, error: pErr } = await sb
      .from('pagamentos')
      .select('id, aluno_id, valor, numero_parcela, status, produto, syncpay_identifier, alunos(nome, cpf, email, whatsapp)')
      .eq('id', pagamento_id)
      .single();

    if (pErr || !p) return json({ ok: false, erro: 'pagamento não encontrado', detalhe: pErr?.message }, 404);
    if (p.status !== 'pendente' && p.status !== 'atrasado') {
      return json({ ok: false, erro: `status já é '${p.status}'` }, 400);
    }

    const aluno: any = p.alunos ?? {};
    const cpf = digitos(aluno.cpf);
    if (!aluno.nome || cpf.length < 11 || !aluno.email) {
      return json({
        ok: false,
        erro: 'aluno sem nome, CPF ou e-mail — a SyncPay valida o dígito do documento e recusa sem esses campos',
        faltando: { nome: !aluno.nome, cpf: cpf.length < 11, email: !aluno.email },
      }, 400);
    }

    const auth = await token();
    if (!auth.ok) return json({ ok: false, erro: auth.erro }, 502);

    // Guard: já existe cobrança SyncPay nessa parcela?
    if (p.syncpay_identifier) {
      if (!forcar) {
        return json({ ok: false, erro: 'parcela já tem cobrança SyncPay — use forcar:true pra gerar outra' }, 400);
      }
      const r = await fetch(`${API}/transaction/${p.syncpay_identifier}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` },
      });
      const anterior = await r.json().catch(() => ({}));
      const st = String(anterior?.data?.status ?? '').toLowerCase();
      if (st === 'completed') {
        return json({
          ok: false, ja_pago: true,
          erro: `a cobrança anterior está '${st}' — NÃO gerar outra`,
          syncpay_identifier: p.syncpay_identifier,
        }, 409);
      }
    }

    const origem = Deno.env.get('SUPABASE_URL')!;
    const corpo = {
      amount: Number(Number(p.valor).toFixed(2)),
      description: `Parcela ${p.numero_parcela} - ${aluno.nome} [ref:${p.id}]`,
      webhook_url: `${origem}/functions/v1/syncpay-cobranca-webhook`,
      client: {
        name: String(aluno.nome).slice(0, 120),
        document: cpf,
        email: String(aluno.email),
        phone: telefoneBR(aluno.whatsapp) || '11999999999',
      },
    };

    const r = await fetch(`${API}/cash-in`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(corpo),
    });
    const resp = await r.json().catch(() => ({}));

    if (!r.ok || !resp?.pix_code) {
      return json({ ok: false, erro: `cash-in falhou (HTTP ${r.status})`, detalhe: resp }, 502);
    }

    const identifier = String(resp.identifier ?? '');
    const pixCode = String(resp.pix_code);

    const { error: upErr } = await sb
      .from('pagamentos')
      .update({ syncpay_identifier: identifier || null, link_pagamento_syncpay: pixCode })
      .eq('id', p.id);

    // Se a gravação falhou, a cobrança existe mas ficou sem vínculo. Avisa alto:
    // o `description` ainda carrega o [ref:], então o webhook consegue se virar.
    if (upErr) {
      console.error('syncpay-gerar-pix: cobranca criada mas NAO gravada', { pagamento_id: p.id, identifier, erro: upErr.message });
    }

    return json({
      ok: true,
      pagamento_id: p.id,
      aluno: aluno.nome,
      parcela: p.numero_parcela,
      valor: Number(p.valor),
      syncpay_identifier: identifier,
      pix_code: pixCode,
      gravado: !upErr,
      ...(upErr ? { aviso_gravacao: upErr.message } : {}),
    });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
