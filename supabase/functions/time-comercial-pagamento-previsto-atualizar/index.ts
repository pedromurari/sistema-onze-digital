/**
 * time-comercial-pagamento-previsto-atualizar
 * Coluna "Pagamento previsto" da Minhas Vendas: a vendedora pode mudar a data
 * programada da entrada de uma pré-matrícula (boleto), sem pedir pro dono.
 * Pedido dele (2026-09-30): "junto com essa edição, ela precisa ter a opção de
 * somente salvar visual ou também alterar o link de pagamento" -- ou seja,
 * mudar só o que aparece na tela (alunos.data_matricula) OU também mover o
 * boleto de verdade (parcela 1 em `pagamentos` + o vencimento real no Asaas).
 *
 * A permissão (quem pode mexer em qual aluno) e a regra "só vale pra
 * pré-matrícula em boleto" são checadas pela RPC
 * time_comercial_atualizar_pagamento_previsto (SECURITY DEFINER, chamada aqui
 * com o JWT de quem chamou -- nunca com a service role). A service role só
 * entra depois, e só pra mexer no boleto real quando pedido.
 *
 * Body: { aluno_id, nova_data (YYYY-MM-DD), atualizar_boleto?: boolean }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const service = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { aluno_id, nova_data, atualizar_boleto } = body as { aluno_id?: string; nova_data?: string; atualizar_boleto?: boolean };
    if (!aluno_id || !nova_data) return json({ ok: false, erro: 'aluno_id e nova_data são obrigatórios' }, 400);

    // A RPC checa sozinha permissão (admin/gestor ou dono do lead) e a regra
    // "só pré-matrícula em boleto" -- se recusar, não muda nada, nem no visual.
    const { data: upd, error: rpcErro } = await userClient.rpc('time_comercial_atualizar_pagamento_previsto', {
      p_aluno_id: aluno_id, p_nova_data: nova_data,
    });
    if (rpcErro) return json({ ok: false, erro: rpcErro.message }, 400);
    if (!upd?.ok) return json({ ok: false, erro: upd?.erro ?? 'falha ao atualizar' }, 400);

    let boletoAtualizado = false;
    let boletoErro: string | null = null;

    if (atualizar_boleto) {
      const { data: parcela1 } = await service
        .from('pagamentos')
        .select('id, asaas_payment_id, status')
        .eq('aluno_id', aluno_id)
        .eq('numero_parcela', 1)
        .maybeSingle();

      if (parcela1?.status === 'pago') {
        boletoErro = 'a 1ª parcela já foi paga, não dá pra mudar o vencimento dela';
      } else if (parcela1) {
        if (parcela1.asaas_payment_id) {
          try {
            const r = await fetch(`${ASAAS_API}/payments/${parcela1.asaas_payment_id}`, {
              method: 'PUT',
              headers: { access_token: ASAAS_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ dueDate: nova_data }),
            });
            const rj = await r.json().catch(() => ({}));
            if (r.ok && rj?.dueDate === nova_data) {
              boletoAtualizado = true;
            } else {
              boletoErro = rj?.errors?.[0]?.description ?? `Asaas respondeu ${r.status}`;
            }
          } catch (e) {
            boletoErro = (e as Error).message;
          }
        } else {
          // Boleto ainda não foi gerado no Asaas -- só existe a linha local,
          // que vai virar o boleto real depois usando essa data.
          boletoAtualizado = true;
        }
        if (boletoAtualizado) {
          await service.from('pagamentos').update({ data_vencimento: nova_data }).eq('id', parcela1.id);
        }
      } else {
        boletoErro = 'não achei a 1ª parcela desse aluno pra atualizar';
      }
    }

    return json({ ok: true, boletoAtualizado, boletoErro });
  } catch (e) {
    console.error('time-comercial-pagamento-previsto-atualizar error:', e);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
