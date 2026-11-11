/**
 * comercial-relatorio-dia
 * Manda pro grupo "DP - Comercial" o relatório automático de fim de dia:
 * leads diretos, vendas e pré-matrículas fechadas, e envios de campanhas
 * de disparo em massa ativas. Pedido do Pedro 11/11/2026, mesmo padrão do
 * ceo-relatorio-financeiro.
 *
 * Chamada só pelo cron interno (ver migração comercial_relatorio_dia_cron):
 * exige header x-cron-key.
 *
 * Body opcional: { preview?: boolean } -- com preview, devolve o texto sem
 * enviar pro grupo (pra conferir os números antes de ativar de verdade).
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
      .eq('nome', 'comercial_relatorio_dia')
      .single();
    const chaveEsperada = secretRow?.valor;
    const chaveRecebida = req.headers.get('x-cron-key');
    if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
      return json({ ok: false, erro: 'não autorizado' }, 401);
    }

    const { preview } = await req.json().catch(() => ({})) as { preview?: boolean };

    const { data: texto, error: erroTexto } = await sb.rpc('comercial_relatorio_dia_texto');
    if (erroTexto || !texto) return json({ ok: false, erro: erroTexto?.message ?? 'relatório vazio' }, 500);

    if (preview) return json({ ok: true, texto });

    const { data: grupo } = await sb
      .from('ceo_rotina_grupos')
      .select('grupo_jid, instancia, ativo')
      .eq('departamento', 'comercial')
      .single();
    if (!grupo || !grupo.ativo) return json({ ok: false, erro: 'grupo comercial não configurado/ativo' }, 400);

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

    return json({ ok: true, texto, envio: envioJson });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
