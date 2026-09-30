/**
 * autentique-contrato-checar-assinaturas
 * Rede de segurança pro webhook da Autentique: achado real em 2026-09-30 --
 * o webhook (autentique-webhook) parou de receber eventos há pelo menos 13
 * dias (último "contrato assinado" automático foi 17/09), sem eu ter mexido
 * em nada -- provavelmente a configuração de webhook no painel da Autentique
 * está quebrada/desconfigurada, e isso não é algo que dá pra checar/consertar
 * por API. Achou 6 alunos com contrato JÁ assinado de verdade (confirmado
 * direto na API da Autentique) que o sistema não sabia (Adriana, Nathalia,
 * Patrícia, Elis, Eliel, Gisele) -- inclusive um assinado no mesmo dia.
 *
 * Em vez de depender só do webhook deles, este cron consulta periodicamente
 * TODO aluno com contrato enviado e ainda não marcado como assinado, e
 * pergunta direto pra API da Autentique se o ALUNO (não a Contratada, não a
 * testemunha) já assinou. Roda a cada 30 min (ver cron
 * autentique-contrato-checar-assinaturas-cron).
 *
 * Auth: x-cron-key = get_equipe_11ds_cron_secret() (mesmo padrão dos outros
 * crons deste projeto).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await sb.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const token = Deno.env.get('AUTENTIQUE_TOKEN') ?? '';
  if (!token) return new Response(JSON.stringify({ ok: true, aviso: 'sem AUTENTIQUE_TOKEN' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { data: pendentes, error: erroSelect } = await sb
      .from('alunos')
      .select('id, nome, email, whatsapp, autentique_documento_id')
      .eq('contrato_enviado', true)
      .eq('contrato_assinado', false)
      .not('autentique_documento_id', 'is', null)
      .limit(60); // teto por rodada, roda a cada 30min, dá conta sozinho

    if (erroSelect) throw erroSelect;

    let assinados = 0;
    for (const a of pendentes ?? []) {
      try {
        const r = await fetch('https://api.autentique.com.br/v2/graphql', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `query { document(id: "${a.autentique_documento_id}") { signatures { email action { name } signed { created_at } } } }` }),
        });
        const j = await r.json();
        const sigs = j?.data?.document?.signatures;
        if (!Array.isArray(sigs)) continue; // documento apagado/erro -- pula, não derruba o lote

        const emailAluno = String(a.email ?? '').trim().toLowerCase();
        const dele = sigs.find((s: any) => s?.action?.name === 'SIGN' && String(s?.email ?? '').trim().toLowerCase() === emailAluno);
        if (!dele?.signed?.created_at) continue;

        await sb.from('alunos').update({
          contrato_assinado: true,
          contrato_assinado_em: dele.signed.created_at,
        }).eq('id', a.id).eq('contrato_assinado', false); // idempotente

        try {
          await sb.from('audit_logs').insert({ action: 'contrato_assinado', target_id: a.id, details: { document_id: a.autentique_documento_id, aluno_nome: a.nome, origem: 'poll_autentique' } });
        } catch { /* audit log best-effort */ }

        if (a.whatsapp) {
          try {
            await sb.functions.invoke('wpp-enviar', {
              body: { numero: a.whatsapp, instance_name: 'disp3', mensagem: `Excelente dia, ${(a.nome ?? '').split(' ')[0]}!\n\nAqui e o Financeiro do Instituto Despertamente. Confirmamos que seu contrato foi assinado com sucesso. Seja bem-vindo(a)!` },
            });
          } catch (e) {
            console.error('autentique-contrato-checar-assinaturas: falha ao avisar aluno', a.id, e);
          }
        }

        assinados++;
      } catch (e) {
        console.error('autentique-contrato-checar-assinaturas: falha num aluno', a.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, checados: pendentes?.length ?? 0, assinados }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('autentique-contrato-checar-assinaturas erro:', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
