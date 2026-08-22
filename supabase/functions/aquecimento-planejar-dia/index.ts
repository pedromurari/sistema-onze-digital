import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron 1x/dia: gera o plano COMPLETO do dia pra todos os chips ativos.
// Garante: (1) todo par de chips troca pelo menos 1 sessão de DM, (2) todo
// chip posta pelo menos 1x em cada grupo ativo do qual participa e recebe
// uma "reação" (outro membro responde logo em seguida), (3) nenhum chip
// fica escalado em 2 conversas ao mesmo tempo, (4) volume extra por cima
// disso cresce conforme a rampa (progressivo). Idempotente por dia via
// aquecimento_config.ultimo_plano_data.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type RampaEstagio = { dia_inicio: number; dia_fim: number | null; min: number; max: number };
type Chip = { id: string; evolution_config_id: string; numero_whatsapp: string; ativo: boolean; data_inicio: string; status: string; dia_contagem: string };
type Grupo = { id: string; membros: string[]; ativo: boolean };
type Mensagem = { id: string; texto: string; tipo: string; ativo: boolean };
type Roteiro = { textos: string[] };

function randInt(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function estagioParaDia(rampa: RampaEstagio[], dia: number): RampaEstagio | null {
  return rampa.find(e => dia >= e.dia_inicio && (e.dia_fim === null || dia <= e.dia_fim)) ?? rampa[rampa.length - 1] ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  const isCron = !!cronSecret && cronKeyHeader === cronSecret;
  if (!isCron && !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { data: cfg } = await supabase.from('aquecimento_config').select('*').eq('id', 'default').maybeSingle();
    if (!cfg?.ativo) return ok({ ok: true, skipped: true, reason: 'aquecimento inativo' });

    const rampa = (cfg.rampa ?? []) as RampaEstagio[];
    if (!rampa.length) return ok({ ok: true, skipped: true, reason: 'rampa não configurada' });

    const now = new Date();
    const nowBR = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBRDateStr = nowBR.toISOString().split('T')[0];

    if (cfg.ultimo_plano_data === todayBRDateStr) {
      return ok({ ok: true, skipped: true, reason: 'já planejado hoje' });
    }

    const anchorUTC = new Date(`${todayBRDateStr}T03:00:00.000Z`); // meia-noite BR

    const intervaloMinS    = cfg.delay_min_s ?? 20;
    const intervaloMaxS    = cfg.delay_max_s ?? 90;
    const safeStartSec     = cfg.safe_hour_start * 3600;
    const safeEndSec       = cfg.safe_hour_end * 3600;

    const { data: chipsRaw, error: chipsErr } = await supabase
      .from('aquecimento_chips').select('*').eq('ativo', true).neq('status', 'pausado');
    if (chipsErr) throw new Error(`falha ao ler aquecimento_chips: ${chipsErr.message}`);
    const chips = (chipsRaw ?? []) as Chip[];
    if (!chips.length) return ok({ ok: true, planned: 0, reason: 'nenhum chip ativo' });

    // Reset diário do contador de enviados
    for (const chip of chips) {
      if (chip.dia_contagem !== todayBRDateStr) {
        await supabase.from('aquecimento_chips').update({ enviados_hoje: 0, dia_contagem: todayBRDateStr }).eq('id', chip.id);
      }
    }

    const { data: gruposRaw } = await supabase.from('aquecimento_grupos').select('id, membros, ativo').eq('ativo', true);
    const grupos = (gruposRaw ?? []) as Grupo[];

    const { data: mensagensRaw } = await supabase.from('aquecimento_mensagens').select('id, texto, tipo, ativo').eq('ativo', true);
    const mensagens = (mensagensRaw ?? []) as Mensagem[];
    const msgsGrupo = mensagens.filter(m => m.tipo === 'grupo' || m.tipo === 'ambos');

    // Roteiros de DM: diálogos reais em sequência (ver aquecimento_roteiros_dm),
    // em vez de frases soltas escolhidas ao acaso -- isso é o que fazia a troca
    // parecer aleatória (ex.: "Bom dia!" respondido com "Boa noite!").
    const { data: roteirosRaw } = await supabase
      .from('aquecimento_roteiros_dm')
      .select('id, aquecimento_roteiro_mensagens(ordem, texto)')
      .eq('ativo', true);
    const roteirosDm: Roteiro[] = ((roteirosRaw ?? []) as { aquecimento_roteiro_mensagens: { ordem: number; texto: string }[] }[])
      .map(r => ({
        textos: [...(r.aquecimento_roteiro_mensagens ?? [])]
          .sort((a, b) => a.ordem - b.ordem)
          .map(m => m.texto),
      }))
      .filter(r => r.textos.length > 0);

    // ── Controle de sobreposição por chip ──────────────────────────────────
    const busy = new Map<string, Array<[number, number]>>();
    function overlaps(chipId: string, start: number, end: number): boolean {
      return (busy.get(chipId) ?? []).some(([s, e]) => start < e && s < end);
    }
    function reserve(chipId: string, start: number, end: number) {
      if (!busy.has(chipId)) busy.set(chipId, []);
      busy.get(chipId)!.push([start, end]);
    }
    // Acha um horário de início livre pros chips envolvidos, dentro do horário seguro.
    function acharSlot(chipIds: string[], duracao: number): number {
      const maxInicio = Math.max(safeStartSec, safeEndSec - duracao);
      for (let tentativa = 0; tentativa < 40; tentativa++) {
        const inicio = randInt(safeStartSec, maxInicio);
        if (chipIds.every(id => !overlaps(id, inicio, inicio + duracao))) return inicio;
      }
      // Fallback: encaixa logo após o último compromisso desses chips
      const ultimoFim = Math.max(safeStartSec, ...chipIds.flatMap(id => (busy.get(id) ?? []).map(([, e]) => e)));
      return Math.min(ultimoFim + randInt(30, 120), maxInicio);
    }

    const jobs: Record<string, unknown>[] = [];
    let sessions = 0;

    function agendarDm(chipA: Chip, chipB: Chip) {
      if (!roteirosDm.length) return;
      const roteiro = roteirosDm[Math.floor(Math.random() * roteirosDm.length)];
      const k = roteiro.textos.length;
      const gaps: number[] = [];
      for (let m = 0; m < k - 1; m++) gaps.push(randInt(intervaloMinS, intervaloMaxS));
      const duracao = gaps.reduce((a, b) => a + b, 0);
      const inicio = acharSlot([chipA.id, chipB.id], duracao);
      let cursor = inicio;
      const sessaoId = crypto.randomUUID();
      let sender = chipA, receiver = chipB;
      for (let m = 0; m < k; m++) {
        jobs.push({
          tipo: 'dm', chip_origem_id: sender.id, chip_destino_id: receiver.id,
          mensagem_texto: roteiro.textos[m], sessao_id: sessaoId,
          scheduled_at: new Date(anchorUTC.getTime() + cursor * 1000).toISOString(),
        });
        [sender, receiver] = [receiver, sender];
        if (m < gaps.length) cursor += gaps[m];
      }
      reserve(chipA.id, inicio, inicio + duracao + 60);
      reserve(chipB.id, inicio, inicio + duracao + 60);
      sessions++;
    }

    function agendarGrupoPost(chip: Chip, grupo: Grupo, kMax = 2): number {
      if (!msgsGrupo.length) return -1;
      const k = randInt(1, kMax);
      const gaps: number[] = [];
      for (let m = 0; m < k - 1; m++) gaps.push(randInt(intervaloMinS, intervaloMaxS));
      const duracao = gaps.reduce((a, b) => a + b, 0);
      const inicio = acharSlot([chip.id], duracao);
      let cursor = inicio;
      const sessaoId = crypto.randomUUID();
      for (let m = 0; m < k; m++) {
        const msg = msgsGrupo[Math.floor(Math.random() * msgsGrupo.length)];
        jobs.push({
          tipo: 'grupo', chip_origem_id: chip.id, grupo_id: grupo.id,
          mensagem_texto: msg.texto, sessao_id: sessaoId,
          scheduled_at: new Date(anchorUTC.getTime() + cursor * 1000).toISOString(),
        });
        if (m < gaps.length) cursor += gaps[m];
      }
      reserve(chip.id, inicio, cursor + 60);
      sessions++;
      return cursor; // fim da postagem, pra agendar reação depois
    }

    // ── 1. Todo par de chips troca pelo menos 1 sessão de DM ───────────────
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        agendarDm(chips[i], chips[j]);
      }
    }

    // ── 2. Todo chip posta em cada grupo do qual participa + reação de outro membro
    for (const grupo of grupos) {
      const membros = chips.filter(c => grupo.membros.includes(c.id));
      for (const chip of membros) {
        const fimPost = agendarGrupoPost(chip, grupo, 2);
        if (fimPost < 0) continue;
        const outros = membros.filter(c => c.id !== chip.id);
        if (!outros.length || !msgsGrupo.length) continue;
        const reagente = outros[Math.floor(Math.random() * outros.length)];
        const inicioReacao = Math.max(acharSlot([reagente.id], 0), fimPost + randInt(30, 150));
        const msg = msgsGrupo[Math.floor(Math.random() * msgsGrupo.length)];
        jobs.push({
          tipo: 'grupo', chip_origem_id: reagente.id, grupo_id: grupo.id,
          mensagem_texto: msg.texto, sessao_id: crypto.randomUUID(),
          scheduled_at: new Date(anchorUTC.getTime() + inicioReacao * 1000).toISOString(),
        });
        reserve(reagente.id, inicioReacao, inicioReacao + 60);
        sessions++;
      }
    }

    // ── 3. Volume extra progressivo (rampa) por cima da cobertura obrigatória
    const detalhesRampa: Record<string, unknown>[] = [];
    for (const chip of chips) {
      const dia = Math.floor((new Date(todayBRDateStr).getTime() - new Date(chip.data_inicio).getTime()) / 86_400_000) + 1;
      const estagio = estagioParaDia(rampa, dia);
      if (!estagio) continue;
      const extra = randInt(estagio.min, estagio.max);
      const pctDm = cfg.pct_dm ?? 50;
      const extraDm = Math.round(extra * pctDm / 100);
      const extraGrupo = extra - extraDm;

      const outrosChips = chips.filter(c => c.id !== chip.id);
      for (let s = 0; s < extraDm && outrosChips.length; s++) {
        const partner = outrosChips[Math.floor(Math.random() * outrosChips.length)];
        agendarDm(chip, partner);
      }
      const gruposDoChip = grupos.filter(g => g.membros.includes(chip.id));
      for (let s = 0; s < extraGrupo && gruposDoChip.length; s++) {
        const grupo = gruposDoChip[Math.floor(Math.random() * gruposDoChip.length)];
        agendarGrupoPost(chip, grupo, 3);
      }
      detalhesRampa.push({ chip: chip.numero_whatsapp, dia, extra });
    }

    if (jobs.length) {
      const { error: insertErr } = await supabase.from('aquecimento_jobs').insert(jobs);
      if (insertErr) throw new Error(`falha ao inserir jobs: ${insertErr.message}`);
    }

    await supabase.from('aquecimento_config').update({ ultimo_plano_data: todayBRDateStr }).eq('id', 'default');

    return ok({ ok: true, planned: jobs.length, sessions, chips: chips.length, grupos: grupos.length, detalhesRampa });

  } catch (e: unknown) {
    console.error('aquecimento-planejar-dia error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
