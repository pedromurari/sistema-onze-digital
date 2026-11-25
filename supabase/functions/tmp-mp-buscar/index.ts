/**
 * tmp-mp-buscar -- lista pagamentos recentes da conta do Mercado Pago.
 *
 * Historico: criada e DESATIVADA em 23/11/2026 no mesmo dia, porque tinha
 * ficado publica -- qualquer um com a URL listava os pagamentos da conta,
 * com valor, taxa, e-mail do pagador e descricao.
 *
 * Republicada em 25/11/2026 COM checagem de x-financeiro-key, como o
 * proprio aviso da versao anterior mandava fazer.
 *
 * GET ?dias=3
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-financeiro-key') !== FINANCEIRO_KEY) {
    return new Response(JSON.stringify({ ok: false, erro: 'nao autorizado' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const u = new URL(req.url);
  const dias = Number(u.searchParams.get('dias') ?? '3');
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();

  const params = new URLSearchParams({
    sort: 'date_created', criteria: 'desc', limit: '50',
    'range': 'date_created', 'begin_date': desde, 'end_date': 'NOW',
  });

  const r = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  const data = await r.json().catch(() => ({}));
  const results = (data?.results ?? []) as Record<string, unknown>[];

  const enxuto = results.map((p) => ({
    id: p.id,
    status: p.status,
    valor: p.transaction_amount,
    liquido: (p.transaction_details as Record<string, unknown> | undefined)?.net_received_amount,
    metodo: p.payment_method_id,
    criado: p.date_created,
    aprovado: p.date_approved,
    descricao: p.description,
    external_reference: p.external_reference,
    pagador: (p.payer as Record<string, unknown> | undefined)?.email,
    pagador_nome: (p.payer as Record<string, unknown> | undefined)?.first_name,
  }));

  return new Response(JSON.stringify({ ok: true, total: enxuto.length, pagamentos: enxuto }, null, 1), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
