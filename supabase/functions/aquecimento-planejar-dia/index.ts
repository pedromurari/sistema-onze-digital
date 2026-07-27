import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron 1x/dia: gera os jobs de aquecimento (DM + grupo) de cada chip ativo,
// com base na curva de rampa em aquecimento_config. Idempotente -- não
// duplica se já existem jobs agendados pra hoje (horário BR) daquele chip.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type RampaEstagio = { dia_inicio: number; dia_fim: number | null; min: number; max: number };

type Chip = {
  id: string;
  evolution_config_id: string;
  numero_whatsapp: string;
  ativo: boolean;
  data_inicio: string;
  status: string;
  dia_contagem: string;
};

type Grupo = { id: string; membros: string[]; ativo: boolean };

type Mensagem = { id: string; texto: string; tipo: string; ativo: boolean };

function randInt(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function estagioParaDia(rampa: RampaEstagio[], dia: number): RampaEstagio | null {
  return rampa.find(e => dia >= e.dia_inicio && (e.dia_fim === null || dia <= e.dia_fim)) ?? rampa[rampa.length - 1] ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: cfg } = await supabase
      .from('aquecimento_config')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!cfg?.ativo) return ok({ ok: true, skipped: true, reason: 'aquecimento inativo' });

    const rampa = (cfg.rampa ?? []) as RampaEstagio[];
    if (!rampa.length) return ok({ ok: true, skipped: true, reason: 'rampa não configurada' });

    const now = new Date();
    // Mesmo padrão de conversão BR usado em disparo-runner: UTC-3, sem DST.
    const nowBR = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBRDateStr = nowBR.toISOString().split('T')[0];
    const anchorUTC = new Date(`${todayBRDateStr}T03:00:00.000Z`); // meia-noite BR
    const anchorEndUTC = new Date(anchorUTC.getTime() + 24 * 60 * 60 * 1000);

    const { data: chips, error: chipsErr } = await supabase
      .from('aquecimento_chips')
      .select('*')
      .eq('ativo', true)
      .neq('status', 'pausado');
    if (chipsErr) throw new Error(`falha ao ler aquecimento_chips: ${chipsErr.message}`);
    if (!chips?.length) return ok({ ok: true, planned: 0, reason: 'nenhum chip ativo' });

    const { data: grupos } = await supabase
      .from('aquecimento_grupos')
      .select('id, membros, ativo')
      .eq('ativo', true);

    const { data: mensagens } = await supabase
      .from('aquecimento_mensagens')
      .select('id, texto, tipo, ativo')
      .eq('ativo', true);

    const msgsDm    = (mensagens ?? []).filter((m: Mensagem) => m.tipo === 'dm' || m.tipo === 'ambos');
    const msgsGrupo = (mensagens ?? []).filter((m: Mensagem) => m.tipo === 'grupo' || m.tipo === 'ambos');

    let planned = 0;
    const detalhes: Record<string, unknown>[] = [];

    for (const chip of chips as Chip[]) {
      // Reset diário do contador de enviados quando o dia BR muda
      if (chip.dia_contagem !== todayBRDateStr) {
        await supabase.from('aquecimento_chips')
          .update({ enviados_hoje: 0, dia_contagem: todayBRDateStr })
          .eq('id', chip.id);
      }

      // Idempotência: já existe job agendado pra hoje pra esse chip?
      const { count: existentes } = await supabase
        .from('aquecimento_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('chip_origem_id', chip.id)
        .gte('scheduled_at', anchorUTC.toISOString())
        .lt('scheduled_at', anchorEndUTC.toISOString());

      if ((existentes ?? 0) > 0) {
        detalhes.push({ chip: chip.numero_whatsapp, skipped: 'já planejado hoje' });
        continue;
      }

      const dia = Math.floor((new Date(todayBRDateStr).getTime() - new Date(chip.data_inicio).getTime()) / 86_400_000) + 1;
      const estagio = estagioParaDia(rampa, dia);
      if (!estagio) { detalhes.push({ chip: chip.numero_whatsapp, skipped: 'sem estágio de rampa' }); continue; }

      const alvo   = randInt(estagio.min, estagio.max);
      const pctDm  = cfg.pct_dm ?? 50;
      let nDm      = Math.round(alvo * pctDm / 100);
      let nGrupo   = alvo - nDm;

      const gruposDoChip = (grupos ?? []).filter((g: Grupo) => g.membros.includes(chip.id));
      if (gruposDoChip.length === 0) { nDm += nGrupo; nGrupo = 0; }

      const outrosChips = (chips as Chip[]).filter(c => c.id !== chip.id);

      const jobsToInsert: Record<string, unknown>[] = [];

      if (nDm > 0 && outrosChips.length && msgsDm.length) {
        const destinos = pickRandom(outrosChips, Math.min(nDm, outrosChips.length));
        for (const destino of destinos) {
          const msg = msgsDm[Math.floor(Math.random() * msgsDm.length)];
          const offsetSec = estagio ? randInt(cfg.safe_hour_start * 3600, cfg.safe_hour_end * 3600) : 0;
          jobsToInsert.push({
            tipo: 'dm',
            chip_origem_id: chip.id,
            chip_destino_id: destino.id,
            mensagem_texto: msg.texto,
            scheduled_at: new Date(anchorUTC.getTime() + offsetSec * 1000).toISOString(),
          });
        }
      }

      if (nGrupo > 0 && gruposDoChip.length && msgsGrupo.length) {
        for (let i = 0; i < nGrupo; i++) {
          const grupo = gruposDoChip[i % gruposDoChip.length];
          const msg = msgsGrupo[Math.floor(Math.random() * msgsGrupo.length)];
          const offsetSec = randInt(cfg.safe_hour_start * 3600, cfg.safe_hour_end * 3600);
          jobsToInsert.push({
            tipo: 'grupo',
            chip_origem_id: chip.id,
            grupo_id: grupo.id,
            mensagem_texto: msg.texto,
            scheduled_at: new Date(anchorUTC.getTime() + offsetSec * 1000).toISOString(),
          });
        }
      }

      if (jobsToInsert.length) {
        const { error: insertErr } = await supabase.from('aquecimento_jobs').insert(jobsToInsert);
        if (insertErr) {
          detalhes.push({ chip: chip.numero_whatsapp, erro: insertErr.message });
          continue;
        }
        planned += jobsToInsert.length;
        detalhes.push({ chip: chip.numero_whatsapp, dia, alvo, jobs: jobsToInsert.length });
      } else {
        detalhes.push({ chip: chip.numero_whatsapp, dia, alvo, skipped: 'sem destinos/mensagens disponíveis' });
      }
    }

    return ok({ ok: true, planned, detalhes });

  } catch (e: unknown) {
    console.error('aquecimento-planejar-dia error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
