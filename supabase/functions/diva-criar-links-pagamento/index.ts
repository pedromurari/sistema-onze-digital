/**
 * diva-criar-links-pagamento — cria (uma vez) os links de pagamento PADRÃO
 * de cada plano do Divã IDM: Asaas (PIX/boleto) + Mercado Pago (cartão),
 * mesma separação já usada no resto do CRM (ver matricula-pagamento-criar).
 * Não é split automático -- isso é Fase 7, precisa da conversa com o
 * gerente de conta Asaas primeiro. O dinheiro cai na conta principal do
 * IDM; repasse ao terapeuta continua manual.
 *
 * Idempotente: só cria link pro que ainda não tem (link_pix_boleto/
 * link_cartao nulos) -- pode rodar de novo sem duplicar.
 *
 * Chamada administrativa única (não é cron) -- POST sem body, autenticado
 * por x-cron-key igual aos outros crons internos.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key' };
function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const ASAAS_API = 'https://api.asaas.com/v3';
const MP_API = 'https://api.mercadopago.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const chaveEsperada = await supabase.rpc('get_equipe_11ds_cron_secret').then((r) => r.data as string | null);
  const chaveRecebida = req.headers.get('x-cron-key');
  if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
    return respond(401, { error: 'Unauthorized' });
  }

  const asaasKey = Deno.env.get('ASAAS_API_KEY');
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!asaasKey || !mpToken) {
    return respond(500, { error: 'Faltam ASAAS_API_KEY ou MP_ACCESS_TOKEN nos secrets do projeto.' });
  }

  const { data: planos, error: planosError } = await supabase
    .from('diva_planos' as never)
    .select('id, nome, valor, link_pix_boleto, link_cartao');
  if (planosError) return respond(500, { error: planosError.message });

  const resultados: Record<string, unknown>[] = [];

  for (const plano of (planos ?? []) as { id: string; nome: string; valor: number; link_pix_boleto: string | null; link_cartao: string | null }[]) {
    const atualizacao: Record<string, unknown> = {};
    const erros: string[] = [];

    if (!plano.link_pix_boleto) {
      const resp = await fetch(`${ASAAS_API}/paymentLinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: asaasKey },
        body: JSON.stringify({
          name: `Divã IDM — ${plano.nome}`,
          description: 'Terapia social Divã IDM — Instituto Despertamente',
          billingType: 'BOLETO', // fatura Asaas mostra boleto + Pix juntos na mesma página
          chargeType: 'DETACHED',
          value: Number(plano.valor),
          dueDateLimitDays: 3,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) erros.push(`Asaas: ${data?.errors?.[0]?.description ?? resp.status}`);
      else { atualizacao.link_pix_boleto = data.url; atualizacao.asaas_link_id = data.id; }
    }

    if (!plano.link_cartao) {
      const resp = await fetch(`${MP_API}/checkout/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mpToken}` },
        body: JSON.stringify({
          items: [{ title: `Divã IDM — ${plano.nome}`, quantity: 1, unit_price: Number(plano.valor), currency_id: 'BRL' }],
          // Exclui boleto ("ticket") e Pix ("bank_transfer") pra ficar só
          // cartão -- Asaas já cobre PIX/boleto no outro link. Se o Pix ainda
          // aparecer aqui (a Mercado Pago pode mudar o id interno), não
          // quebra nada: só fica uma opção a mais, confirmar manualmente.
          payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }] },
          external_reference: `diva-${plano.id}`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) erros.push(`Mercado Pago: ${data?.message ?? resp.status}`);
      else { atualizacao.link_cartao = data.init_point; atualizacao.mp_preference_id = data.id; }
    }

    if (Object.keys(atualizacao).length > 0) {
      atualizacao.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase.from('diva_planos' as never).update(atualizacao as never).eq('id', plano.id);
      if (updateError) erros.push(`salvar: ${updateError.message}`);
    }

    resultados.push({ plano: plano.nome, atualizado: Object.keys(atualizacao), erros });
  }

  return respond(200, { resultados });
});
