/**
 * time-comercial-aluno-atualizar
 * Usado pelo "olhinho" da tabela Minhas Vendas (Time Comercial): a vendedora
 * abre o cadastro do PRÓPRIO aluno (ou o dono/gestor, de qualquer um), corrige
 * dados pessoais (nunca parcelas/pagamento) e, se o e-mail mudou, pode pedir
 * pra reenviar o contrato pro e-mail novo -- sem precisar passar pelo dono.
 * Pedido do dono (2026-09-30): "ela clica, altera o e-mail, e ao salvar o
 * sistema pergunta se quer que eu reenvie o contrato nesse novo e-mail".
 *
 * A permissão de quem pode editar qual aluno é checada pela própria RPC
 * time_comercial_aluno_atualizar_dados_pessoais (SECURITY DEFINER, mesma
 * trava de admin/gestor vs vendedor_id que a Minhas Vendas já usa) -- chamada
 * aqui com o JWT de quem chamou, nunca com a service role. A service role só
 * entra depois, e só pra: 1) ler o e-mail ANTES de mudar (saber se mudou de
 * verdade) e 2) reenviar o contrato quando pedido.
 *
 * Body: {
 *   aluno_id, nome, email, whatsapp, cpf, rg, data_nascimento (YYYY-MM-DD),
 *   sexo, pais, cep, cidade_estado, endereco,
 *   reenviar_contrato?: boolean  -- só importa se o e-mail realmente mudou
 * }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Cliente com o JWT de quem chamou -- é ele quem roda a RPC de update, que
    // checa sozinha se essa pessoa pode mexer nesse aluno (admin/gestor ou
    // dono do lead). Nunca usamos a service role pra essa parte.
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const service = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      aluno_id, nome, email, whatsapp, cpf, rg, data_nascimento, sexo, pais, cep, cidade_estado, endereco,
      reenviar_contrato,
    } = body as Record<string, unknown>;

    if (!aluno_id || !nome) return json({ ok: false, erro: 'aluno_id e nome são obrigatórios' }, 400);

    const { data: antes } = await service
      .from('alunos')
      .select('email, autentique_documento_id, status, mp_status')
      .eq('id', aluno_id)
      .maybeSingle();

    const { data: upd, error: rpcErro } = await userClient.rpc('time_comercial_aluno_atualizar_dados_pessoais', {
      p_aluno_id: aluno_id,
      p_nome: nome,
      p_email: email ?? null,
      p_whatsapp: whatsapp ?? null,
      p_cpf: cpf ?? null,
      p_rg: rg ?? null,
      p_data_nascimento: data_nascimento || null,
      p_sexo: sexo ?? null,
      p_pais: pais ?? null,
      p_cep: cep ?? null,
      p_cidade_estado: cidade_estado ?? null,
      p_endereco: endereco ?? null,
    });

    if (rpcErro) return json({ ok: false, erro: rpcErro.message }, 400);
    if (!upd?.ok) return json({ ok: false, erro: upd?.erro ?? 'falha ao atualizar' }, 400);

    const emailAntes = String(antes?.email ?? '').trim().toLowerCase();
    const emailDepois = String(email ?? '').trim().toLowerCase();
    const emailMudou = emailAntes !== emailDepois && emailDepois !== '';

    let contratoReenviado = false;
    let contratoErro: string | null = null;

    if (reenviar_contrato && emailMudou) {
      // Documento antigo estava ligado ao e-mail errado -- apaga antes de gerar
      // outro, mesmo passo que o dono vem fazendo manualmente o dia todo
      // (Nathalia, Mariland, Patrícia, Adriana) quando o contrato sai errado.
      if (antes?.autentique_documento_id) {
        try {
          await fetch('https://api.autentique.com.br/v2/graphql', {
            method: 'POST',
            headers: { Authorization: `Bearer ${Deno.env.get('AUTENTIQUE_TOKEN')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `mutation { deleteDocument(id: "${antes.autentique_documento_id}") }` }),
          });
        } catch (e) {
          console.error('time-comercial-aluno-atualizar: falha ao apagar contrato antigo', e);
        }
      }

      await service.from('alunos').update({
        autentique_documento_id: null,
        autentique_link_assinatura: null,
        contrato_enviado: false,
        contrato_enviado_em: null,
        contrato_link_enviado_em: null,
      }).eq('id', aluno_id);

      if (!cpf || !data_nascimento || !endereco || !cidade_estado) {
        contratoErro = 'faltam CPF, data de nascimento, endereço ou cidade/estado pra gerar o contrato';
      } else {
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/autentique-criar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({ aluno_id, cpf, data_nascimento, endereco, cep: cep ?? '', cidade_estado }),
          });
          const rj = await r.json().catch(() => ({}));
          if (r.ok && rj?.link_assinatura) {
            contratoReenviado = true;
          } else {
            contratoErro = rj?.error ?? `Autentique respondeu ${r.status}`;
          }
        } catch (e) {
          contratoErro = (e as Error).message;
        }

        // autentique-criar marca status='ativo' incondicionalmente ao enviar o
        // contrato -- se essa matrícula ainda não tinha pagamento nenhum antes
        // disso (era mesmo só pré-matrícula), desfaz essa ativação indevida
        // (mesmo cuidado manual repetido a sessão inteira).
        if (antes?.status !== 'ativo' && !antes?.mp_status) {
          const { data: temPago } = await service.from('pagamentos').select('id').eq('aluno_id', aluno_id).eq('status', 'pago').limit(1);
          if (!temPago?.length) {
            await service.from('alunos').update({ status: 'pre_matricula' }).eq('id', aluno_id).eq('status', 'ativo');
          }
        }
      }
    }

    return json({ ok: true, emailMudou, contratoReenviado, contratoErro });
  } catch (e) {
    console.error('time-comercial-aluno-atualizar error:', e);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
