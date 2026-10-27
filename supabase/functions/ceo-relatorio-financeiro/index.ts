/**
 * ceo-relatorio-financeiro
 * Manda pro grupo "DP - Financeiro" o relatório automático (faturamento,
 * novas matrículas, inadimplência) — diário (final do dia), semanal
 * (início da semana, relação da semana passada) e mensal (início do mês,
 * relação do mês passado). Pedido do Pedro 26/10/2026.
 *
 * Chamada só pelo cron interno (ver migração ceo_relatorio_financeiro_grupo):
 * exige header x-cron-key.
 *
 * Body: { periodo: 'diario' | 'semanal' | 'mensal' }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: secretRow } = await sb
      .from('cron_segredos_internos')
      .select('valor')
      .eq('nome', 'ceo_relatorio_financeiro')
      .single();
    const chaveEsperada = secretRow?.valor;
    const chaveRecebida = req.headers.get('x-cron-key');
    if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
      return json({ ok: false, erro: 'não autorizado' }, 401);
    }

    const { periodo } = await req.json().catch(() => ({})) as { periodo?: string };
    if (!periodo || !['diario', 'semanal', 'mensal'].includes(periodo)) {
      return json({ ok: false, erro: 'periodo deve ser diario, semanal ou mensal' }, 400);
    }

    const { data: texto, error: erroTexto } = await sb.rpc('ceo_relatorio_financeiro_texto', { p_periodo: periodo });
    if (erroTexto || !texto) return json({ ok: false, erro: erroTexto?.message ?? 'relatório vazio' }, 500);

    const { data: grupo } = await sb
      .from('ceo_rotina_grupos')
      .select('grupo_jid, instancia, ativo')
      .eq('departamento', 'financeiro')
      .single();
    if (!grupo || !grupo.ativo) return json({ ok: false, erro: 'grupo financeiro não configurado/ativo' }, 400);

    const envioRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({
        numero: grupo.grupo_jid,
        mensagem: texto,
        instance_name: grupo.instancia,
      }),
    });
    const envioJson = await envioRes.json().catch(() => ({}));

    return json({ ok: true, periodo, envio: envioJson });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
