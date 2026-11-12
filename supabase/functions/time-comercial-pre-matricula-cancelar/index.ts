/**
 * time-comercial-pre-matricula-cancelar
 * Botão "Cancelar pré-matrícula" da Minhas Vendas -- pedido do dono do
 * produto (2026-11-12): "o aluno fala que não vai fechar, a vendedora não
 * pode precisar passar pra mim toda vez cancelar a ficha dela, tem que ter
 * um botão que cancela tudo: as parcelas no Asaas, o contrato, tudo."
 *
 * A RPC time_comercial_cancelar_pre_matricula (chamada com o JWT de quem
 * chamou, nunca service role) checa a permissão (admin/gestor ou vendedor
 * dono do lead) e a regra "só pré-matrícula" -- se recusar, esta function
 * nem chega a tocar em Asaas/Autentique. Só depois do RPC confirmar é que a
 * service role entra, e só pra cancelar nas APIs externas (nenhuma delas
 * pode ser chamada com o JWT do usuário).
 *
 * Body: { aluno_id }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';
const AUTENTIQUE_URL = 'https://api.autentique.com.br/v2/graphql';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function autentiqueGql(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(AUTENTIQUE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  try { return await res.json(); } catch (_) { return null; }
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
    const { aluno_id } = body as { aluno_id?: string };
    if (!aluno_id) return json({ ok: false, erro: 'aluno_id é obrigatório' }, 400);

    // A RPC checa sozinha permissão e a regra "só pré-matrícula" -- se
    // recusar, não cancela nada, nem no Asaas nem na Autentique.
    const { data: rpcData, error: rpcErro } = await userClient.rpc('time_comercial_cancelar_pre_matricula', {
      p_aluno_id: aluno_id,
    });
    if (rpcErro) return json({ ok: false, erro: rpcErro.message }, 400);
    const rpc = rpcData as { ok?: boolean; erro?: string; aluno_nome?: string; asaas_payment_ids?: string[]; autentique_documento_id?: string | null } | null;
    if (!rpc?.ok) return json({ ok: false, erro: rpc?.erro ?? 'falha ao cancelar' }, 400);

    const asaasPaymentIds = rpc.asaas_payment_ids ?? [];
    const asaasResultados = await Promise.all(asaasPaymentIds.map(async (id) => {
      try {
        const r = await fetch(`${ASAAS_API}/payments/${id}`, {
          method: 'DELETE',
          headers: { access_token: ASAAS_API_KEY },
        });
        const rj = await r.json().catch(() => ({}));
        return { id, ok: r.ok || rj?.deleted === true };
      } catch (e) {
        console.error('time-comercial-pre-matricula-cancelar: falha ao cancelar boleto Asaas', id, e);
        return { id, ok: false };
      }
    }));
    const asaasFalhas = asaasResultados.filter((r) => !r.ok).map((r) => r.id);
    if (asaasFalhas.length) {
      console.error('time-comercial-pre-matricula-cancelar: boletos que não cancelaram no Asaas', aluno_id, asaasFalhas);
    }

    let contratoCancelado: boolean | null = null;
    const autentiqueToken = Deno.env.get('AUTENTIQUE_TOKEN') ?? '';
    if (rpc.autentique_documento_id && autentiqueToken) {
      try {
        const r = await autentiqueGql(autentiqueToken, 'mutation($id: UUID!) { deleteDocument(id: $id) }', { id: rpc.autentique_documento_id });
        contratoCancelado = r?.data?.deleteDocument === true;
        if (!contratoCancelado) console.error('time-comercial-pre-matricula-cancelar: Autentique não confirmou exclusão', aluno_id, r);
      } catch (e) {
        console.error('time-comercial-pre-matricula-cancelar: falha ao cancelar contrato Autentique', aluno_id, e);
        contratoCancelado = false;
      }
      await service.from('alunos').update({ autentique_documento_id: null, autentique_link_assinatura: null }).eq('id', aluno_id);
    }

    return json({
      ok: true,
      aluno_nome: rpc.aluno_nome,
      boletosCancelados: asaasPaymentIds.length - asaasFalhas.length,
      boletosComFalha: asaasFalhas.length,
      contratoCancelado,
    });
  } catch (e) {
    console.error('time-comercial-pre-matricula-cancelar error:', e);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
