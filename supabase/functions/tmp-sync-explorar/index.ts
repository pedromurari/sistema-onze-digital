/**
 * tmp-sync-explorar -- sonda quais endpoints de consulta a SyncPay expoe.
 * Uso pontual: descobrir se da pra ler saldo, extrato e saques (cash-out).
 * Atras da x-financeiro-key porque devolve dado financeiro cru.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const API = 'https://api.syncpayments.com.br/api/partner/v1';
const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-financeiro-key') !== FINANCEIRO_KEY) {
    return new Response(JSON.stringify({ erro: 'nao autorizado' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const r = await fetch(`${API}/auth-token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('SYNCPAY_CLIENT_ID'),
      client_secret: Deno.env.get('SYNCPAY_CLIENT_SECRET'),
    }),
  });
  const auth = await r.json().catch(() => ({}));
  const token = auth?.access_token;
  if (!token) return new Response(JSON.stringify({ erro: 'sem token', auth }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

  const caminhos = [
    'balance', 'wallet', 'account', 'profile', 'me',
    'cash-out', 'cashout', 'withdraw', 'withdrawals', 'transfers',
    'transactions', 'transaction', 'extract', 'statement', 'movements',
  ];

  const out: Record<string, unknown> = {};
  for (const c of caminhos) {
    try {
      const res = await fetch(`${API}/${c}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const txt = (await res.text()).slice(0, 600);
      out[c] = { status: res.status, body: txt };
    } catch (e) {
      out[c] = { erro: (e as Error).message };
    }
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
