import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: reproduz exatamente a query que o disparo-runner usa pra
// selecionar campanhas elegiveis, mas devolvendo o erro do Supabase se
// houver -- o disparo-runner nao checa `error` nesse select, entao uma
// falha ali vira silenciosamente "processed: 0" sem pista nenhuma.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const now = new Date();

  const { data: campaigns, error } = await supabase
    .from('disparo_campanhas')
    .select('*')
    .eq('status', 'ativo')
    .lte('next_send_at', now.toISOString());

  const brazilHour = (now.getUTCHours() - 3 + 24) % 24;
  const diagnosticos = [];

  for (const camp of campaigns ?? []) {
    const diag: Record<string, unknown> = { id: camp.id, nome: camp.nome };
    diag.brazilHour = brazilHour;

    if (brazilHour < camp.safe_hour_start || brazilHour >= camp.safe_hour_end) {
      diag.parou_em = 'safe_hour';
      diagnosticos.push(diag);
      continue;
    }

    const todayBR = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { count: sentToday, error: sentTodayErr } = await supabase
      .from('disparo_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campanha_id', camp.id)
      .eq('status', 'enviado')
      .gte('sent_at', todayBR + 'T00:00:00+00:00');
    diag.sentToday = sentToday;
    diag.sentTodayErr = sentTodayErr ? sentTodayErr.message : null;

    if ((sentToday ?? 0) >= camp.daily_limit) {
      diag.parou_em = 'daily_limit';
      diagnosticos.push(diag);
      continue;
    }

    const { data: candidate, error: candErr } = await supabase
      .from('disparo_leads')
      .select('id, status, ordem')
      .eq('campanha_id', camp.id)
      .eq('status', 'pendente')
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle();
    diag.candidate = candidate;
    diag.candErr = candErr ? { message: candErr.message, code: candErr.code } : null;

    if (!candidate) {
      diag.parou_em = 'sem_candidato';
      diagnosticos.push(diag);
      continue;
    }

    diag.parou_em = 'chegaria_no_envio';
    diagnosticos.push(diag);
  }

  return new Response(JSON.stringify({
    ok: true,
    now: now.toISOString(),
    brazilHour,
    error: error ? { message: error.message, details: error.details, hint: error.hint, code: error.code } : null,
    count: campaigns?.length ?? null,
    diagnosticos,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
