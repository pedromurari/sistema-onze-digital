import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: le o webhook configurado agora em cada instancia Evolution
// ativa (so leitura, nao altera nada) -- usado pra confirmar que
// evo-configurar-webhook realmente aplicou a configuracao esperada.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

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

    const resultados: { instancia: string; webhook?: unknown; erro?: string }[] = [];
    for (const inst of (instancias ?? []) as { instance_name: string; api_url: string; api_key: string }[]) {
      const rawBase = inst.api_url.replace(/\/$/, '');
      const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      try {
        const res = await fetch(`${base}/webhook/find/${encodeURIComponent(inst.instance_name)}`, {
          headers: { apikey: inst.api_key },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
        resultados.push({ instancia: inst.instance_name, webhook: await res.json() });
      } catch (e: unknown) {
        resultados.push({ instancia: inst.instance_name, erro: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, resultados }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
