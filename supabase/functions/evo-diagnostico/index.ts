import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: checa o estado de conexao de cada instancia Evolution ativa
// (instancia desconectada/deslogada aceita a chamada REST e ainda assim nao
// entrega nada de verdade) e devolve o corpo cru da ultima tentativa de
// envio de uma campanha, pra ver se a Evolution API retornou algum erro
// dentro do corpo (200/201 com erro embutido) que o disparo-runner nao
// checa hoje (so olha res.ok).

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
      .select('instance_name, api_url, api_key, ativo')
      .eq('ativo', true);
    if (error) throw new Error(`Falha ao ler evolution_config: ${error.message}`);

    const resultados = [];
    for (const inst of (instancias ?? []) as { instance_name: string; api_url: string; api_key: string }[]) {
      const rawBase = inst.api_url.replace(/\/$/, '');
      const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      let estado: unknown = null;
      try {
        const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
          headers: { apikey: inst.api_key },
          signal: AbortSignal.timeout(15_000),
        });
        estado = res.ok ? await res.json() : { httpStatus: res.status, body: (await res.text()).slice(0, 300) };
      } catch (e: unknown) {
        estado = { erro: (e as Error).message };
      }
      resultados.push({ instancia: inst.instance_name, connectionState: estado });
    }

    return new Response(JSON.stringify({ ok: true, resultados }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
