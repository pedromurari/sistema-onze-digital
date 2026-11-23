/**
 * checkout-parcela — alimenta a página pública /pagar/<token> (23/11/2026).
 *
 * Por que existe: a SyncPay não tem checkout hospedado. O `cash-in` dela
 * devolve só `pix_code` e `identifier`, sem nenhuma URL. Então a página de
 * pagamento é nossa e o motor é deles. Esta função é a ponte: o navegador
 * do aluno não fala com a SyncPay nem com o banco, só com ela.
 *
 * GET  ?token=<uuid>  -> dados da parcela + o PIX (gera na hora se faltar)
 * POST { token, acao: 'status' } -> só o status, pro polling da página
 *
 * Pública de propósito (verify_jwt=false): quem tem o token é o aluno. Em
 * troca, ela NUNCA devolve CPF, e-mail, telefone, id interno nem qualquer
 * outra parcela -- só o que precisa aparecer na tela de pagamento.
 *
 * Turma da Keila continua na Voomp: se a parcela for de aluno dessas
 * turmas, a página mostra o boleto guardado em vez de gerar PIX.
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

function digitos(s: unknown) { return String(s ?? '').replace(/\D/g, ''); }

function telefoneBR(s: unknown) {
  let d = digitos(s);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(-11);
}

async function syncToken(): Promise<string | null> {
  const client_id = Deno.env.get('SYNCPAY_CLIENT_ID');
  const client_secret = Deno.env.get('SYNCPAY_CLIENT_SECRET');
  if (!client_id || !client_secret) return null;
  const r = await fetch(`${API}/auth-token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret }),
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => ({})))?.access_token ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get('token');
    let acao = 'dados';

    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { token?: string; acao?: string };
      token = b.token ?? token;
      acao = b.acao ?? 'dados';
    }

    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      return json({ ok: false, erro: 'link inválido' }, 400);
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: p } = await sb
      .from('pagamentos')
      .select('id, numero_parcela, valor, status, data_vencimento, produto, syncpay_identifier, link_pagamento_syncpay, link_pagamento_voomp, aluno_id')
      .eq('checkout_token', token)
      .maybeSingle();

    if (!p) return json({ ok: false, erro: 'link não encontrado' }, 404);

    const { data: aluno } = await sb
      .from('alunos')
      .select('nome, cpf, email, whatsapp, turma_id, total_mensalidades')
      .eq('id', p.aluno_id)
      .maybeSingle();

    const primeiroNome = String(aluno?.nome ?? '').trim().split(/\s+/)[0] ?? '';

    const base = {
      ok: true,
      nome: primeiroNome,
      nome_completo: String(aluno?.nome ?? '').trim(),
      parcela: p.numero_parcela,
      total_parcelas: aluno?.total_mensalidades ?? null,
      valor: Number(p.valor),
      vencimento: p.data_vencimento,
      produto: p.produto,
      pago: p.status === 'pago',
    };

    if (acao === 'status' || p.status === 'pago') {
      return json({ ...base, pix_code: null });
    }

    // Turma da Keila cobra pela Voomp -- não gerar PIX, mostrar o boleto.
    if (aluno?.turma_id) {
      const { data: turma } = await sb.from('turmas').select('nome').eq('id', aluno.turma_id).maybeSingle();
      if (turma?.nome && /keila/i.test(turma.nome)) {
        return json({ ...base, gateway: 'voomp', boleto_url: p.link_pagamento_voomp, pix_code: null });
      }
    }

    // PIX já gerado antes: reusa.
    if (p.link_pagamento_syncpay) {
      return json({ ...base, gateway: 'syncpay', pix_code: p.link_pagamento_syncpay });
    }

    // Primeira visita: gera o PIX na hora.
    const cpf = digitos(aluno?.cpf);
    if (!aluno?.nome || cpf.length < 11 || !aluno?.email) {
      return json({ ...base, gateway: null, pix_code: null, erro_pix: 'cadastro incompleto' });
    }

    const t = await syncToken();
    if (!t) return json({ ...base, gateway: null, pix_code: null, erro_pix: 'gateway indisponível' });

    const r = await fetch(`${API}/cash-in`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        amount: Number(Number(p.valor).toFixed(2)),
        description: `Parcela ${p.numero_parcela} - ${aluno.nome} [ref:${p.id}]`,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/syncpay-cobranca-webhook`,
        client: {
          name: String(aluno.nome).trim().slice(0, 120),
          document: cpf,
          email: String(aluno.email).trim(),
          phone: telefoneBR(aluno.whatsapp) || '11999999999',
        },
      }),
    });
    const resp = await r.json().catch(() => ({}));

    if (!r.ok || !resp?.pix_code) {
      console.error('checkout-parcela: cash-in falhou', p.id, r.status, JSON.stringify(resp).slice(0, 300));
      return json({ ...base, gateway: null, pix_code: null, erro_pix: 'não consegui gerar o PIX agora' });
    }

    await sb.from('pagamentos')
      .update({ syncpay_identifier: String(resp.identifier ?? '') || null, link_pagamento_syncpay: String(resp.pix_code) })
      .eq('id', p.id);

    return json({ ...base, gateway: 'syncpay', pix_code: String(resp.pix_code) });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
