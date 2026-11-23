/**
 * syncpay-webhook -- DESATIVADO em 23/11/2026.
 *
 * O que era: recebia eventos de cashin da SyncPay para vendas de parceiro
 * feitas no checkout hospedado deles, e criava a venda em `parceiros_vendas`
 * a partir do próprio webhook.
 *
 * Por que foi desativado, em uma frase: a função não autenticava nada e
 * alguém percebeu.
 *
 * Em 19/11/2026, entre 07:12 e 07:29, e de novo em 22/11 às 18:42, este
 * endpoint recebeu 10 payloads forjados e gravou todos como venda
 * 'aprovado'. Os ids de transação começavam com "forge-", os e-mails eram
 * @evil.example e @example.com, e os nomes eram "Attacker Probe",
 * "NoAuth Probe", "Arbitrary Amount Probe" e "Repasse Attacker". Um deles
 * gravou R$ 499,00 com comissao_afiliado de R$ 249,50 -- ou seja, dava pra
 * inventar uma venda e gerar comissão a pagar.
 *
 * Nenhuma venda REAL jamais entrou por aqui: o faturamento de parceiro de
 * verdade vem pelo Mercado Pago (origem 'checkout_idm'), e o Divã migrou
 * pra lá. Então desligar não perde receita nenhuma.
 *
 * A função continua publicada, em vez de deletada, para registrar quem
 * continua batendo aqui. Ela não escreve mais em `parceiros_vendas`.
 *
 * NÃO confundir com `syncpay-cobranca-webhook`, que é outro fluxo (parcela
 * de aluno) e esse sim valida Authorization.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let payload: unknown = null;
  try { payload = await req.json(); } catch (_) { payload = null; }

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await sb.from('syncpay_webhook_logs').insert({
      evento: 'parceiros (endpoint desativado)',
      resultado: 'RECUSADO: syncpay-webhook foi desativado em 23/11/2026 por aceitar payload forjado sem autenticacao. Nada foi gravado em parceiros_vendas.',
      payload: (payload ?? {}) as Record<string, unknown>,
    });
  } catch (_) { /* log é best-effort */ }

  return new Response(
    JSON.stringify({ ok: false, erro: 'endpoint desativado' }),
    { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
