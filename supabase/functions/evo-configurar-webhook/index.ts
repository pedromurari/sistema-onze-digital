import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: configura o webhook de resposta (evo-resposta) em todas as
// instancias Evolution API ativas, direto via API deles -- sem precisar
// mexer manualmente no painel. Roda uma vez (ou toda vez que uma instancia
// nova entrar em producao), nao faz parte do pipeline diario.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

const WEBHOOK_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/evo-resposta';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { data: instancias, error } = await supabase
      .from('evolution_config')
      .select('instance_name, api_url, api_key')
      .eq('ativo', true);
    if (error) throw new Error(`Falha ao ler evolution_config: ${error.message}`);
    if (!instancias?.length) throw new Error('Nenhuma instancia Evolution ativa encontrada');

    const resultados: { instancia: string; antes: unknown; ok: boolean; erro?: string }[] = [];

    for (const inst of instancias as { instance_name: string; api_url: string; api_key: string }[]) {
      const rawBase = inst.api_url.replace(/\/$/, '');
      const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      const nome = inst.instance_name;
      let antes: unknown = null;

      try {
        const findRes = await fetch(`${base}/webhook/find/${encodeURIComponent(nome)}`, {
          headers: { apikey: inst.api_key },
          signal: AbortSignal.timeout(15_000),
        });
        if (findRes.ok) antes = await findRes.json();
      } catch { /* leitura do estado atual e' so informativa, segue mesmo se falhar */ }

      try {
        const setRes = await fetch(`${base}/webhook/set/${encodeURIComponent(nome)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: WEBHOOK_URL,
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!setRes.ok) throw new Error(`${setRes.status} ${(await setRes.text()).slice(0, 300)}`);
        resultados.push({ instancia: nome, antes, ok: true });
      } catch (e: unknown) {
        resultados.push({ instancia: nome, antes, ok: false, erro: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, webhook_url: WEBHOOK_URL, resultados }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
