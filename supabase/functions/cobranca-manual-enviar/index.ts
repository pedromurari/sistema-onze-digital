/**
 * cobranca-manual-enviar
 * Ponte entre o botão "Cobrar pelo WhatsApp do Financeiro" (ficha do aluno,
 * Financeiro.tsx) e o wpp-enviar.
 *
 * Achado 18/11/2026: depois do incidente de 03/11 (campanha de marketing
 * saindo pelo número do financeiro), o wpp-enviar passou a exigir o header
 * `x-financeiro-key` pra liberar a instância reservada -- só que o botão da
 * ficha chamava o wpp-enviar DIRETO do navegador, sem essa chave (e não dava
 * pra simplesmente colar a chave no código do front: qualquer um abre o
 * DevTools e usa ela pra mandar mensagem por qualquer número reservado).
 * Essa function existe só pra isso: guarda a chave no servidor, confere que
 * quem está chamando é um funcionário logado com permissão de cobrança, e só
 * então repassa pro wpp-enviar.
 *
 * Auth: verify_jwt=true (exige usuário logado) + confere tem_permissao
 * ('cobranca', 'editar') como esse usuário (RLS normal, via Authorization
 * repassado). Sem isso, nao aceita.
 *
 * Body: { pagamento_id: string, mensagem: string }
 * Repete o mesmo registro que o botão fazia antes (cobranca_logs manual +
 * pagamentos.cobranca_contatado_em/canal_cobranca), agora do lado do
 * servidor, pra não duplicar nem perder se o front falhar no meio.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, erro: 'não autenticado' }, 401);

    // Cliente "como o usuário" -- pra tem_permissao() resolver auth.uid()
    // certo via RLS normal, igual qualquer chamada feita do navegador.
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: podeEnviar, error: permErr } = await userClient.rpc('tem_permissao', {
      p_recurso: 'cobranca',
      p_acao: 'editar',
    });
    if (permErr || !podeEnviar) {
      return json({ ok: false, erro: 'sem permissão de cobrança' }, 403);
    }

    const { pagamento_id, mensagem } = await req.json().catch(() => ({})) as { pagamento_id?: string; mensagem?: string };
    if (!pagamento_id || !mensagem) {
      return json({ ok: false, erro: 'pagamento_id e mensagem são obrigatórios' }, 400);
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: pagamento, error: pagErr } = await sb
      .from('pagamentos')
      .select('id, aluno_id, numero_parcela, alunos(nome, whatsapp)')
      .eq('id', pagamento_id)
      .single();
    if (pagErr || !pagamento) return json({ ok: false, erro: 'parcela não encontrada' }, 404);

    const aluno = (pagamento as any).alunos;
    const numero = aluno?.whatsapp;
    if (!numero) return json({ ok: false, erro: 'aluno não tem WhatsApp cadastrado' }, 400);

    const envioRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'x-financeiro-key': FINANCEIRO_KEY,
      },
      body: JSON.stringify({ numero, mensagem, instance_name: 'Financeiro IDM' }),
    });
    const envioJson = await envioRes.json().catch(() => ({}));
    if (!envioRes.ok || envioJson?.ok === false) {
      return json({ ok: false, erro: envioJson?.error ?? `falha no envio (status ${envioRes.status})` }, 502);
    }

    const agora = new Date().toISOString();
    const { error: logErr } = await sb.from('cobranca_logs').insert({
      aluno_id: pagamento.aluno_id,
      pagamento_id: pagamento.id,
      aluno_nome: aluno?.nome ?? '',
      telefone: String(numero),
      mensagem,
      template_nome: 'Cobrança manual (Financeiro)',
      template_tipo: 'manual',
      status: 'enviado',
      manual: true,
      enviado_em: agora,
    });
    if (logErr) console.error('cobranca-manual-enviar: erro ao gravar log', logErr);

    const { error: updErr } = await sb
      .from('pagamentos')
      .update({ cobranca_contatado_em: agora, canal_cobranca: 'Financeiro' })
      .eq('id', pagamento.id);
    if (updErr) console.error('cobranca-manual-enviar: erro ao atualizar pagamento', updErr);

    return json({ ok: true });
  } catch (e) {
    console.error('cobranca-manual-enviar error:', e);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
