/**
 * webinario-sessoes-cron
 * Gera a grade de sessões do dia (30 em 30 min, 06h-23h BRT) pra cada
 * webinário ativo -- idempotente (não duplica se já existir sessão no
 * mesmo horário). Chamado 1x/dia às 06h BRT via pg_cron, mesmo padrão do
 * Vercel Cron original (E:\webnar-idm\src\app\api\webhooks\cron).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'webinario-internal-2026';

function horariosDoDiaBRT(dataBase: Date): Date[] {
  // dataBase já em UTC; a grade é 06:00-23:00 horário de Brasília (UTC-3),
  // ou seja 09:00-02:00 UTC do dia seguinte às 23h30.
  const ano = dataBase.getUTCFullYear();
  const mes = dataBase.getUTCMonth();
  const dia = dataBase.getUTCDate();
  const horarios: Date[] = [];
  for (let h = 6; h <= 23; h++) {
    for (const m of [0, 30]) {
      if (h === 23 && m === 30) continue; // última sessão é 23:00
      // 06:00 BRT = 09:00 UTC (BRT = UTC-3, sem horário de verão)
      const utcHour = h + 3;
      horarios.push(new Date(Date.UTC(ano, mes, dia, utcHour, m, 0)));
    }
  }
  return horarios;
}

serve(async (req) => {
  const cronKey = req.headers.get('x-cron-key');
  if (cronKey !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: webinarios, error: errWeb } = await supabase
    .from('webinarios')
    .select('id, slug')
    .eq('ativo', true);

  if (errWeb) {
    return new Response(JSON.stringify({ error: errWeb.message }), { status: 500 });
  }

  const hoje = new Date();
  const horarios = horariosDoDiaBRT(hoje);
  const criadas: Record<string, number> = {};

  for (const webinario of webinarios ?? []) {
    const { data: existentes } = await supabase
      .from('webinario_sessoes')
      .select('inicio_em')
      .eq('webinario_id', webinario.id)
      .gte('inicio_em', horarios[0].toISOString())
      .lte('inicio_em', horarios[horarios.length - 1].toISOString());

    const jaExistem = new Set((existentes ?? []).map((s: { inicio_em: string }) => s.inicio_em));
    const novas = horarios
      .filter((h) => !jaExistem.has(h.toISOString()))
      .map((h) => ({ webinario_id: webinario.id, inicio_em: h.toISOString(), status: 'agendada' as const }));

    if (novas.length > 0) {
      const { error: insErr } = await supabase.from('webinario_sessoes').insert(novas);
      if (insErr) {
        console.error(`webinario-sessoes-cron: falha ao criar sessões de ${webinario.slug}:`, insErr.message);
        continue;
      }
    }
    criadas[webinario.slug] = novas.length;
  }

  return new Response(JSON.stringify({ ok: true, criadas }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
