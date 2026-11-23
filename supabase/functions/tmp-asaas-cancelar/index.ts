/**
 * tmp-asaas-cancelar (23/11/2026)
 *
 * A conta Asaas foi reprovada em definitivo, mas os boletos/links que ela
 * gerou continuam PAGAVEIS -- e caem numa conta bloqueada. Entao, antes de
 * migrar um aluno pra SyncPay, as cobrancas Asaas abertas dele precisam ser
 * canceladas, senao ele pode pagar no lugar errado.
 *
 * Body: { pagamento_ids: string[] }  -- so cancela parcela nao-paga.
 * Auth: x-financeiro-key (mesmo padrao das outras).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key' };
const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
const ASAAS_API = 'https://api.asaas.com/v3';

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-financeiro-key') !== FINANCEIRO_KEY) return json({ ok: false, erro: 'nao autorizado' }, 403);

  const key = Deno.env.get('ASAAS_API_KEY');
  if (!key) return json({ ok: false, erro: 'ASAAS_API_KEY ausente' }, 500);

  const { pagamento_ids } = await req.json().catch(() => ({})) as { pagamento_ids?: string[] };
  if (!Array.isArray(pagamento_ids) || !pagamento_ids.length) return json({ ok: false, erro: 'pagamento_ids obrigatorio' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: linhas } = await sb.from('pagamentos')
    .select('id, numero_parcela, status, asaas_payment_id').in('id', pagamento_ids);

  const res: unknown[] = [];
  for (const p of linhas ?? []) {
    if (p.status === 'pago') { res.push({ id: p.id, parcela: p.numero_parcela, pulado: 'ja pago' }); continue; }
    if (!p.asaas_payment_id) { res.push({ id: p.id, parcela: p.numero_parcela, pulado: 'sem asaas_payment_id' }); continue; }
    const r = await fetch(`${ASAAS_API}/payments/${p.asaas_payment_id}`, { method: 'DELETE', headers: { access_token: key } });
    const body = await r.json().catch(() => ({}));
    const ok = r.ok && body?.deleted === true;
    if (ok) {
      await sb.from('pagamentos')
        .update({ asaas_payment_id: null, link_pagamento_asaas: null })
        .eq('id', p.id);
    }
    res.push({ id: p.id, parcela: p.numero_parcela, asaas: p.asaas_payment_id, cancelado: ok, http: r.status, detalhe: ok ? null : body });
  }
  return json({ ok: true, resultado: res });
});
