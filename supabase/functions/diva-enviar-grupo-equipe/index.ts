/**
 * diva-enviar-grupo-equipe — função avulsa, uma chamada só (pedido do
 * Pedro, 12/11/2026): manda a esteira do Divã, os links de pagamento por
 * plano e o aviso sobre conta Asaas pro grupo interno "ANOTAÇÕES - Divã
 * iDM" (JID 120363431692639971@g.us, que o próprio número "Divã IDM" já
 * é dono/superadmin). Não precisa virar rotina -- é só esse envio.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRUPO_JID = '120363431692639971@g.us';

const MENSAGEM_ESTEIRA = `📋 *Esteira do Divã IDM* — como funciona, ponta a ponta:

1️⃣ *Captação* — lead se cadastra na página /diva (tráfego pago/orgânico) ou chega por campanha de WhatsApp. Recebe boas-vindas automática + pergunta de abertura, já pelo nosso número.

2️⃣ *Match/negociação* — Camila pega o lead no Funil (dentro do sistema), entende a necessidade, confere a aba Agenda pra ver qual terapeuta tem horário livre, indica o terapeuta certo e negocia pacote ou sessão avulsa.

3️⃣ *Venda* — manda o link de pagamento certo (próxima mensagem aqui no grupo) e registra a sessão fechada no sistema (aba Sessões).

4️⃣ *Sessão* — acontece por videochamada, no horário combinado com o terapeuta.

5️⃣ *Repasse* — hoje o repasse pro terapeuta é manual (PIX, depois de confirmar o pagamento). Em breve vai ficar automático via split do Asaas.`;

const MENSAGEM_LINKS = `💳 *Links de pagamento por plano* — PIX/Boleto (Asaas) ou Cartão (Mercado Pago):

*1 sessão avulsa — R$80*
PIX/Boleto: https://www.asaas.com/000/c/i2hkn8x1niihoj7w
Cartão: https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1836829122-0359f2a3-de10-4da8-aa6f-60c2dca93660

*2 sessões avulsas — R$160*
PIX/Boleto: https://www.asaas.com/000/c/vmbfvovvgoja6owp
Cartão: https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1836829122-16324bd4-982e-4c08-a9ec-50e1ca1fe2de

*Pacote 3 sessões — R$210*
PIX/Boleto: https://www.asaas.com/000/c/0zpx5n311rcqdk97
Cartão: https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1836829122-6143415c-534f-4062-b8b1-33a68d766b23

*Pacote 4 sessões — R$280*
PIX/Boleto: https://www.asaas.com/000/c/e6ynuppovrcxcds4
Cartão: https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1836829122-afe34433-bf99-4846-9eb9-affdd8a8fa2d

*Pacote 5 sessões — R$350*
PIX/Boleto: https://www.asaas.com/000/c/529sg92zhnrwqudz
Cartão: https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1836829122-5c704dc1-2aec-4b75-9d1b-68f5097a222e`;

const MENSAGEM_ASAAS = `⚠️ *Aviso pros terapeutas credenciados*: em breve o repasse vai ficar automático (split direto na cobrança). Pra isso, cada terapeuta vai precisar ter uma conta no Asaas (gratuita, aceita pessoa física/autônomo). Assim que o split estiver pronto no sistema, mando aqui o passo a passo certinho de como criar.`;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key' };
function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const chaveEsperada = await supabase.rpc('get_equipe_11ds_cron_secret').then((r) => r.data as string | null);
  const chaveRecebida = req.headers.get('x-cron-key');
  if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
    return respond(401, { error: 'Unauthorized' });
  }

  const resultados: Record<string, unknown>[] = [];
  for (const [nome, mensagem] of [['esteira', MENSAGEM_ESTEIRA], ['links', MENSAGEM_LINKS], ['asaas', MENSAGEM_ASAAS]]) {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ numero: GRUPO_JID, mensagem, instance_name: 'Divã IDM' }),
    });
    const corpo = await resp.text().catch(() => '');
    resultados.push({ nome, ok: resp.ok, status: resp.status, corpo: corpo.slice(0, 300) });
    if (!resp.ok) break;
    await new Promise((r) => setTimeout(r, 2500));
  }

  return respond(200, { resultados });
});
