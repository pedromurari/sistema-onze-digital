/**
 * tmp-mp-consultar -- consulta um pagamento no Mercado Pago pelo id.
 *
 * 23/11/2026: ficou atrás da x-financeiro-key. Antes era pública, e a
 * resposta é o objeto cru do MP -- valor, taxa, e-mail e dados do pagador.
 * Mesmo exigindo o id (que é um número grande), não há motivo pra deixar
 * aberto: o MP devolve 404 pra id inexistente, então dava pra varrer.
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
    return new Response(JSON.stringify({ ok: false, erro: 'não autorizado' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ erro: 'sem id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
