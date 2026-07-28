import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron 1x/dia: gera as SESSÕES de conversa de aquecimento (DM + grupo) de
// cada chip ativo, com base na curva de rampa em aquecimento_config. Uma
// "sessão" é uma rajada de várias mensagens em sequência (indo e voltando
// entre os dois chips numa DM, ou em fila num grupo), separadas por um
// intervalo humano (delay_min_s..delay_max_s) -- não é 1 mensagem isolada
// por dia, é assim que uma conversa de verdade acontece. Idempotente --
// não duplica se já existem jobs agendados pra hoje (horário BR) daquele chip.

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

function estagioParaDia(rampa: RampaEstagio[], dia: number): RampaEstagio | null {
  return rampa.find(e => dia >= e.dia_inicio && (e.dia_fim === null || dia <= e.dia_fim)) ?? rampa[rampa.length - 1] ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth: Bearer JWT (UI, botão "Rodar agora") ou x-cron-key (pg_cron) -- mesmo padrão de funil-processar
  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  const isCron = !!cronSecret && cronKeyHeader === cronSecret;
  if (!isCron && !authHeader.startsWith('Bearer ')) {
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

    const msgsPorSessaoMin = cfg.msgs_por_sessao_min ?? 3;
    const msgsPorSessaoMax = cfg.msgs_por_sessao_max ?? 8;
    const intervaloMinS    = cfg.delay_min_s ?? 20;
    const intervaloMaxS    = cfg.delay_max_s ?? 90;

    const now = new Date();
    // Mesmo padrão de conversão BR usado em disparo-runner: UTC-3, sem DST.
    const nowBR = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBRDateStr = nowBR.toISOString().split('T')[0];
    const anchorUTC = new Date(`${todayBRDateStr}T03:00:00.000Z`); // meia-noite BR
    const anchorEndUTC = new Date(anchorUTC.getTime() + 24 * 60 * 60 * 1000);

    const safeStartSec = cfg.safe_hour_start * 3600;
    const safeEndSec    = cfg.safe_hour_end * 3600;

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
    let sessions = 0;
    const detalhes: Record<string, unknown>[] = [];

    // Gera uma sessão de DM: rajada de k mensagens alternando quem manda,
    // separadas por um intervalo humano. Retorna os jobs prontos pra inserir.
    function gerarSessaoDm(chipA: Chip, chipB: Chip): Record<string, unknown>[] {
      const k = randInt(msgsPorSessaoMin, msgsPorSessaoMax);
      const duracaoEstimada = k * intervaloMaxS;
      const inicio = randInt(safeStartSec, Math.max(safeStartSec, safeEndSec - duracaoEstimada));
      const jobs: Record<string, unknown>[] = [];
      const sessaoId = crypto.randomUUID();
      let cursor = inicio;
      let sender = chipA, receiver = chipB;
      for (let m = 0; m < k; m++) {
        const msg = msgsDm[Math.floor(Math.random() * msgsDm.length)];
        jobs.push({
          tipo: 'dm',
          chip_origem_id: sender.id,
          chip_destino_id: receiver.id,
          mensagem_texto: msg.texto,
          scheduled_at: new Date(anchorUTC.getTime() + cursor * 1000).toISOString(),
          sessao_id: sessaoId,
        });
        [sender, receiver] = [receiver, sender]; // alterna quem responde
        cursor += randInt(intervaloMinS, intervaloMaxS);
      }
      return jobs;
    }

    // Sessão de grupo: uma pequena sequência de mensagens do mesmo chip
    // (alguém que solta 2-3 comentários seguidos), rajada mais curta que a DM.
    function gerarSessaoGrupo(chip: Chip, grupo: Grupo): Record<string, unknown>[] {
      const k = randInt(1, Math.min(3, msgsPorSessaoMax));
      const duracaoEstimada = k * intervaloMaxS;
      const inicio = randInt(safeStartSec, Math.max(safeStartSec, safeEndSec - duracaoEstimada));
      const jobs: Record<string, unknown>[] = [];
      const sessaoId = crypto.randomUUID();
      let cursor = inicio;
      for (let m = 0; m < k; m++) {
        const msg = msgsGrupo[Math.floor(Math.random() * msgsGrupo.length)];
        jobs.push({
          tipo: 'grupo',
          chip_origem_id: chip.id,
          grupo_id: grupo.id,
          mensagem_texto: msg.texto,
          scheduled_at: new Date(anchorUTC.getTime() + cursor * 1000).toISOString(),
          sessao_id: sessaoId,
        });
        cursor += randInt(intervaloMinS, intervaloMaxS);
      }
      return jobs;
    }

    for (const chip of chips as Chip[]) {
      // Reset diário do contador de enviados quando o dia BR muda
      if (chip.dia_contagem !== todayBRDateStr) {
        await supabase.from('aquecimento_chips')
          .update({ enviados_hoje: 0, dia_contagem: todayBRDateStr })
          .eq('id', chip.id);
      }

      // Idempotência: só pula se já tem sessão PENDENTE agendada pra hoje --
      // se o plano de hoje já foi todo processado (enviado/erro), permite
      // gerar mais sessões (ex.: rodou "Rodar agora" de novo mais tarde).
      const { count: existentes } = await supabase
        .from('aquecimento_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('chip_origem_id', chip.id)
        .eq('status', 'pendente')
        .gte('scheduled_at', anchorUTC.toISOString())
        .lt('scheduled_at', anchorEndUTC.toISOString());

      if ((existentes ?? 0) > 0) {
        detalhes.push({ chip: chip.numero_whatsapp, skipped: 'já tem sessão pendente hoje' });
        continue;
      }

      const dia = Math.floor((new Date(todayBRDateStr).getTime() - new Date(chip.data_inicio).getTime()) / 86_400_000) + 1;
      const estagio = estagioParaDia(rampa, dia);
      if (!estagio) { detalhes.push({ chip: chip.numero_whatsapp, skipped: 'sem estágio de rampa' }); continue; }

      const alvoSessoes = randInt(estagio.min, estagio.max);
      const pctDm       = cfg.pct_dm ?? 50;
      let nDmSessoes    = Math.round(alvoSessoes * pctDm / 100);
      let nGrupoSessoes = alvoSessoes - nDmSessoes;

      const gruposDoChip = (grupos ?? []).filter((g: Grupo) => g.membros.includes(chip.id));
      if (gruposDoChip.length === 0) { nDmSessoes += nGrupoSessoes; nGrupoSessoes = 0; }

      const outrosChips = (chips as Chip[]).filter(c => c.id !== chip.id);

      const jobsToInsert: Record<string, unknown>[] = [];

      if (nDmSessoes > 0 && outrosChips.length && msgsDm.length) {
        for (let s = 0; s < nDmSessoes; s++) {
          const partner = outrosChips[Math.floor(Math.random() * outrosChips.length)];
          jobsToInsert.push(...gerarSessaoDm(chip, partner));
          sessions++;
        }
      }

      if (nGrupoSessoes > 0 && gruposDoChip.length && msgsGrupo.length) {
        for (let s = 0; s < nGrupoSessoes; s++) {
          const grupo = gruposDoChip[Math.floor(Math.random() * gruposDoChip.length)];
          jobsToInsert.push(...gerarSessaoGrupo(chip, grupo));
          sessions++;
        }
      }

      if (jobsToInsert.length) {
        const { error: insertErr } = await supabase.from('aquecimento_jobs').insert(jobsToInsert);
        if (insertErr) {
          detalhes.push({ chip: chip.numero_whatsapp, erro: insertErr.message });
          continue;
        }
        planned += jobsToInsert.length;
        detalhes.push({ chip: chip.numero_whatsapp, dia, sessoes: alvoSessoes, mensagens: jobsToInsert.length });
      } else {
        detalhes.push({ chip: chip.numero_whatsapp, dia, sessoes: alvoSessoes, skipped: 'sem destinos/mensagens disponíveis' });
      }
    }

    return ok({ ok: true, planned, sessions, detalhes });

  } catch (e: unknown) {
    console.error('aquecimento-planejar-dia error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
