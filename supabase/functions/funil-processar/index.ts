import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyVars(text: string | null | undefined, vars: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// Opt-out global (mesma chave normalizada usada em evo-resposta/disparo-runner:
// sem DDI 55, 11 digitos). So se aplica a envio INDIVIDUAL -- mensagem de grupo
// (@g.us) nao tem como pular so 1 pessoa, entao nao e checado aqui.
function toOptOutKey(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

function isGroupJidOrGroupNumber(numberOrJid: string): boolean {
  return numberOrJid.includes('@g.us') || (/^\d+$/.test(numberOrJid) && numberOrJid.length >= 18);
}

async function estaOptOut(supabase: ReturnType<typeof createClient>, numberOrJid: string): Promise<boolean> {
  if (isGroupJidOrGroupNumber(numberOrJid)) return false;
  const { data } = await supabase
    .from('whatsapp_opt_out')
    .select('telefone')
    .eq('telefone', toOptOutKey(numberOrJid))
    .maybeSingle();
  return Boolean(data);
}

// Historico de conversa (tabela whatsapp_mensagens) -- alimenta a aba Chat.
// Mesmo padrao do disparo-runner/boas-vindas-enviar/enviar-cobranca: so grava
// envio individual (grupo fica de fora -- evo-resposta descarta grupo no
// inbound, gravar o outbound criaria uma "conversa" que nunca recebe resposta).
// Best-effort: a mensagem ja foi entregue quando isso roda, erro aqui so loga.
async function registrarMensagemEnviada(
  supabase: ReturnType<typeof createClient>,
  numberOuJid: string,
  conteudo: string,
  tipo: string,
  instanceName: string,
  origem: 'funil' | 'boas_vindas',
  evolutionMessageId: string | null,
): Promise<void> {
  try {
    if (isGroupJidOrGroupNumber(numberOuJid)) return;
    const telefone = toOptOutKey(numberOuJid);
    if (!telefone) return;
    const { error } = await supabase.from('whatsapp_mensagens').insert({
      telefone,
      direcao: 'enviada',
      conteudo,
      tipo: tipo || 'text',
      origem,
      evolution_instance: instanceName || null,
      evolution_message_id: evolutionMessageId,
    });
    if (error) console.error('registrarMensagemEnviada:', error.message);
  } catch (e: unknown) {
    console.error('registrarMensagemEnviada falhou:', (e as Error).message);
  }
}

function hourOf(iso: string): number {
  try { return new Date(iso).getHours(); } catch { return 12; }
}

function localHourMinuteOf(iso: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 12);
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
    return { hour, minute };
  } catch {
    return { hour: hourOf(iso), minute: 0 };
  }
}

function isCountdownDaySubtipo(subtipo: string): boolean {
  return /^contagem_dia_\d+$/.test(subtipo);
}

function canSendHeaderImage(subtipo: string, msgType: string, scheduledAt: string): boolean {
  if (msgType === 'poll' || subtipo === 'enquete') return false;
  if (!isCountdownDaySubtipo(subtipo)) return true;
  const { hour, minute } = localHourMinuteOf(scheduledAt);
  return hour === 20 && minute === 0;
}

function toGroupJid(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('@g.us')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `${trimmed}@g.us`;
  return '';
}

async function sendEvolution(endpoint: string, body: unknown, apikey: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function extractMessageId(evolutionResponse: any): string | null {
  return evolutionResponse?.key?.id ?? evolutionResponse?.data?.key?.id ?? null;
}

// Erro "ambíguo": não sabemos se a Evolution API chegou a entregar a mensagem
// antes do timeout/erro de rede. Nesses casos NUNCA tentamos outra instância
// nem reagendamos automaticamente — reenviar às cegas é o que causa disparos
// duplicados em grupo. Só erros claros (4xx/5xx com resposta) são retry-seguros.
function isAmbiguousError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|timed out|network/i.test(e.message);
}

class AmbiguousSendError extends Error {}

function saoPauloAgora(d: Date): { dateStr: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// A Evolution API pode responder 200 mesmo com a sessão do WhatsApp fechada e só falhar
// silenciosamente na entrega -- checa o estado real de conexão antes de usar a instância
// (mesmo mecanismo do disparo-runner).
async function getConnectedInstanceIds(
  instances: Array<{ id: string; api_url: string; api_key: string; instance_name: string }>,
): Promise<Set<string>> {
  const connected = new Set<string>();
  await Promise.all(instances.map(async (inst) => {
    const rawBase = inst.api_url.replace(/\/$/, '');
    const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    try {
      const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
        headers: { apikey: inst.api_key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const data = await res.json() as { instance?: { state?: string } };
      if (data.instance?.state === 'open') connected.add(inst.id);
    } catch (e: unknown) {
      console.warn(`funil-processar: falha ao checar conexão de ${inst.instance_name}:`, (e as Error).message);
    }
  }));
  return connected;
}

// Aplica a seleção feita em Configurações -> WhatsApp -> "Prioridade por Serviço"
// (tabela evolution_task_config, task = 'funil'). Sem seleção salva, cai no
// fallback: todas as instâncias ativas por prioridade global.
async function scopeInstancesByTask<T extends { id: string }>(
  supabase: ReturnType<typeof createClient>,
  task: string,
  allInstances: T[],
): Promise<T[]> {
  const { data: taskCfg } = await supabase
    .from('evolution_task_config')
    .select('instance_ids')
    .eq('task', task)
    .maybeSingle();
  const ids = (taskCfg as { instance_ids?: string[] } | null)?.instance_ids;
  if (!ids?.length) return allInstances;
  const byId = new Map(allInstances.map(i => [i.id, i]));
  const scoped = ids.map(id => byId.get(id)).filter(Boolean) as T[];
  return scoped.length ? scoped : allInstances;
}

// ── Áudio: conserto de MP4 não-streamable (mesmo fix de boas-vindas-enviar/
// disparo-runner -- ver comentário lá para o motivo do bug da Evolution API) ──

const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta']);

type Mp4Box = { type: string; start: number; end: number; payload: number };

function readBoxes(v: DataView, b: Uint8Array, start: number, end: number): Mp4Box[] {
  const out: Mp4Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = v.getUint32(off);
    const type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
    let payload = off + 8;
    if (size === 1) {
      size = v.getUint32(off + 8) * 2 ** 32 + v.getUint32(off + 12);
      payload = off + 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < 8 || off + size > end) return out;
    out.push({ type, start: off, end: off + size, payload });
    off += size;
  }
  return out;
}

function shiftChunkOffsets(v: DataView, b: Uint8Array, start: number, end: number, delta: number): number {
  let moved = 0;
  for (const box of readBoxes(v, b, start, end)) {
    if (box.type === 'stco') {
      const count = v.getUint32(box.payload + 4);
      for (let i = 0; i < count; i++) {
        const p = box.payload + 8 + i * 4;
        if (p + 4 > box.end) break;
        v.setUint32(p, v.getUint32(p) + delta);
        moved++;
      }
    } else if (box.type === 'co64') {
      const count = v.getUint32(box.payload + 4);
      for (let i = 0; i < count; i++) {
        const p = box.payload + 8 + i * 8;
        if (p + 8 > box.end) break;
        const val = v.getUint32(p) * 2 ** 32 + v.getUint32(p + 4) + delta;
        v.setUint32(p, Math.floor(val / 2 ** 32));
        v.setUint32(p + 4, val % 2 ** 32);
        moved++;
      }
    } else if (MP4_CONTAINERS.has(box.type)) {
      moved += shiftChunkOffsets(v, b, box.payload, box.end, delta);
    }
  }
  return moved;
}

function faststartMp4(input: Uint8Array): Uint8Array | null {
  const v = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const top = readBoxes(v, input, 0, input.length);
  const moov = top.find(x => x.type === 'moov');
  const mdat = top.find(x => x.type === 'mdat');
  if (!moov || !mdat) return null;
  if (moov.start < mdat.start) return null;

  const moovBytes = input.slice(moov.start, moov.end);
  const mv = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
  if (!shiftChunkOffsets(mv, moovBytes, 8, moovBytes.length, moovBytes.length)) return null;

  const out = new Uint8Array(input.length);
  let pos = 0;
  const ftyp = top.find(x => x.type === 'ftyp');
  if (ftyp) { out.set(input.subarray(ftyp.start, ftyp.end), pos); pos += ftyp.end - ftyp.start; }
  out.set(moovBytes, pos); pos += moovBytes.length;
  for (const box of top) {
    if (box.type === 'ftyp' || box.type === 'moov') continue;
    out.set(input.subarray(box.start, box.end), pos); pos += box.end - box.start;
  }
  return pos === input.length ? out : null;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

async function prepareAudioPayload(mediaUrl: string): Promise<string> {
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return mediaUrl;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fixed = faststartMp4(bytes);
    if (!fixed) return mediaUrl;
    console.log(`funil-processar: audio remuxado pra faststart (${bytes.length} bytes)`);
    return toBase64(fixed);
  } catch (e: unknown) {
    console.warn('funil-processar: falha ao preparar audio, usando a URL crua:', (e as Error).message);
    return mediaUrl;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: Bearer JWT (UI) ou x-cron-key (pg_cron)
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret     = Deno.env.get('CRON_SECRET') ?? 'funil-processar-internal-2026';
    const authHeader     = req.headers.get('authorization') ?? '';
    const cronKeyHeader  = req.headers.get('x-cron-key') ?? '';

    const isCron = cronKeyHeader === cronSecret;
    if (!isCron && !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body antes de abrir qualquer conexão
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron sem body — ok */ }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Quick send (envio imediato pelo UI) — processa antes do early-exit ────
    if (body.quick_send) {
      try {
        const { data: evoRowsQS } = await supabase
          .from('evolution_config')
          .select('id, api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });
        const scopedQS = await scopeInstancesByTask(supabase, 'funil', (evoRowsQS ?? []) as { id: string; api_url: string; api_key: string; instance_name: string }[]);
        const connectedQS = await getConnectedInstanceIds(scopedQS);
        const availableQS = scopedQS.filter(i => connectedQS.has(i.id));
        const evoInstancesQS = availableQS.map((inst: { api_url: string; instance_name: string; api_key: string }) => {
          const rawBase = inst.api_url.replace(/\/$/, '');
          return { base: /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`, instance: inst.instance_name, apikey: inst.api_key };
        });

        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', body.funnel_name ?? '')
          .maybeSingle();

        let lastErr: Error | null = evoInstancesQS.length === 0
          ? new Error('Nenhuma instância do Funil conectada no momento (verifique em Configurações → WhatsApp)')
          : null;
        for (const { base, instance, apikey } of evoInstancesQS) {
          try {
            await processMessage(body, base, instance, apikey, supabase, funnelCfg);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e as Error;
            console.warn(`funil-processar: instância ${instance} falhou:`, (e as Error).message);
            if (isAmbiguousError(e)) break; // pode já ter entregue — não tenta outra instância
          }
        }
        if (lastErr) throw lastErr;

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Scheduled batch (chamado pelo pg_cron ou cron externo) ────────────────
    const now         = new Date();
    const windowEnd   = new Date(now.getTime() + 6 * 60 * 1000);   // +6 min (próxima execução do cron)
    const windowStart = new Date(now.getTime() - 30 * 60 * 1000);  // -30 min (tolerância para atrasos + retries)

    // EARLY EXIT: COUNT barato antes de buscar dados ou abrir conexão com Evolution
    const [{ count: funnelCount }, { count: bvCount }] = await Promise.all([
      supabase
        .from('funnel_messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString()),
      supabase
        .from('boas_vindas_agendados')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente')
        .lte('agendado_para', now.toISOString()),
    ]);

    if (!funnelCount && !bvCount) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só busca Evolution config se há mensagens para enviar
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('id, api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    if (!evoRows?.length) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada ou sem instâncias ativas' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scopedFunil = await scopeInstancesByTask(supabase, 'funil', evoRows as { id: string; api_url: string; api_key: string; instance_name: string }[]);
    const connectedFunil = await getConnectedInstanceIds(scopedFunil);
    const availableFunil = scopedFunil.filter(i => connectedFunil.has(i.id));
    const evoInstances = availableFunil.map((inst: { api_url: string; instance_name: string; api_key: string }) => {
      const rawBase = inst.api_url.replace(/\/$/, '');
      return {
        base:     /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`,
        instance: inst.instance_name,
        apikey:   inst.api_key,
      };
    });

    const { data: pending, error: fetchErr } = await supabase
      .from('funnel_messages')
      .select('*')
      .eq('status', 'scheduled')
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', windowEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    if (fetchErr) throw fetchErr;

    let processed = 0;
    for (const msg of pending ?? []) {
      // Claim atômico: marca como 'sent' ANTES de enviar — evita duplicata se o cron sobrepõe
      const { data: claimedRows } = await supabase
        .from('funnel_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
        .eq('id', msg.id)
        .eq('status', 'scheduled')
        .select('id');

      if (!claimedRows?.length) {
        continue;
      }

      try {
        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', msg.funnel_name)
          .maybeSingle();

        let lastErr: Error | null = evoInstances.length === 0
          ? new Error('Nenhuma instância do Funil conectada no momento (verifique em Configurações → WhatsApp)')
          : null;
        let usedInstance = '';
        let ambiguous = false;
        for (const { base, instance, apikey } of evoInstances) {
          try {
            await processMessage(msg, base, instance, apikey, supabase, funnelCfg);
            lastErr = null;
            usedInstance = instance;
            break;
          } catch (e) {
            lastErr = e as Error;
            console.warn(`funil-processar: instância ${instance} falhou:`, (e as Error).message);
            if (isAmbiguousError(e)) { ambiguous = true; break; } // pode já ter entregue — não tenta outra instância
          }
        }
        if (lastErr) throw ambiguous ? new AmbiguousSendError(lastErr.message) : lastErr;

        await supabase
          .from('funnel_messages')
          .update({ error_message: `ok:${usedInstance}` })
          .eq('id', msg.id);

        processed++;
        await new Promise(r => setTimeout(r, 1500));
      } catch (e: unknown) {
        const errMsg = (e as Error).message;

        // Erro ambíguo (timeout): não sabemos se já foi entregue. Reenviar
        // automaticamente é exatamente o que causa mensagens duplicadas em
        // grupo — então NUNCA reagenda sozinho, marca erro pra revisão manual.
        if (e instanceof AmbiguousSendError) {
          await supabase
            .from('funnel_messages')
            .update({
              status: 'error',
              error_message: `[verificar manualmente antes de reenviar] ${errMsg}`,
            })
            .eq('id', msg.id);
          console.warn(`funil-processar: msg ${msg.id} — erro ambíguo (timeout), NÃO reagendado automaticamente`);
          continue;
        }

        const prevRetries = (msg.error_message ?? '').match(/\[retry (\d+)\]/);
        const retryCount = prevRetries ? parseInt(prevRetries[1]) : 0;
        const scheduledTime = new Date(msg.scheduled_at).getTime();
        const maxRetryWindow = 30 * 60 * 1000;

        if (retryCount < 3 && (now.getTime() - scheduledTime) < maxRetryWindow) {
          await supabase
            .from('funnel_messages')
            .update({ status: 'scheduled', sent_at: null, error_message: `[retry ${retryCount + 1}] ${errMsg}` })
            .eq('id', msg.id);
          console.warn(`funil-processar: msg ${msg.id} falhou, retry ${retryCount + 1}/3`);
        } else {
          await supabase
            .from('funnel_messages')
            .update({ status: 'error', error_message: errMsg })
            .eq('id', msg.id);
        }
      }
    }

    // ── Processar boas-vindas agendadas ──────────────────────────────────────
    // Anti-ban real por funil (mesmo padrao do disparo-runner): horario seguro, limite
    // diario, instancia escolhida em evolution_task_config (task 'boas_vindas') so' usada
    // se estiver com sessao aberta, e pausa automatica apos erros seguidos.
    if (bvCount) {
      const { data: bvPendentes } = await supabase
        .from('boas_vindas_agendados')
        .select('*')
        .eq('status', 'pendente')
        .lte('agendado_para', now.toISOString())
        .order('agendado_para', { ascending: true })
        .limit(20); // teto de seguranca por ciclo -- o gate real e' o daily_limit por funil

      const porFunil = new Map<string, typeof bvPendentes>();
      for (const bv of bvPendentes ?? []) {
        const lista = porFunil.get(bv.funnel_name) ?? [];
        lista.push(bv);
        porFunil.set(bv.funnel_name, lista);
      }

      if (porFunil.size > 0) {
        const nomesFunis = [...porFunil.keys()];
        const { data: bvConfigs } = await supabase
          .from('boas_vindas_config')
          .select('funnel_name, delay_min_s, delay_max_s, daily_limit, safe_hour_start, safe_hour_end, max_errors_seq, enviados_hoje, dia_contagem, erros_seq, pausado_por_erro, wpp_message_type, wpp_media_url')
          .in('funnel_name', nomesFunis);
        const cfgPorFunil = new Map((bvConfigs ?? []).map((c: any) => [c.funnel_name, c]));

        const sp = saoPauloAgora(now);

        const { data: evoRowsBV } = await supabase
          .from('evolution_config')
          .select('id, api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });
        const allBV = (evoRowsBV ?? []) as { id: string; api_url: string; api_key: string; instance_name: string }[];

        let scopedBV = allBV;
        const { data: taskCfg } = await supabase
          .from('evolution_task_config')
          .select('instance_ids')
          .eq('task', 'boas_vindas')
          .maybeSingle();
        if ((taskCfg as any)?.instance_ids?.length) {
          const byId = new Map(allBV.map(i => [i.id, i]));
          const scoped = ((taskCfg as any).instance_ids as string[]).map(id => byId.get(id)).filter(Boolean) as typeof allBV;
          if (scoped.length) scopedBV = scoped;
        }
        const connectedBV = await getConnectedInstanceIds(scopedBV);
        // A instância "ig" nunca pode disparar boas-vindas -- excluída antes de
        // qualquer outra seleção (evolution_task_config, prioridade, etc).
        const instancesBV = scopedBV
          .filter(i => connectedBV.has(i.id) && i.instance_name.toLowerCase() !== 'ig')
          .map(i => {
            const rawBase = i.api_url.replace(/\/$/, '');
            return { base: /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`, instance: i.instance_name, apikey: i.api_key };
          });

        for (const [funnelName, itens] of porFunil) {
          const cfgBV = cfgPorFunil.get(funnelName) ?? {
            delay_min_s: 20, delay_max_s: 60, daily_limit: 150,
            safe_hour_start: 8, safe_hour_end: 21, max_errors_seq: 3,
            enviados_hoje: 0, dia_contagem: sp.dateStr, erros_seq: 0, pausado_por_erro: false,
          };

          if (cfgBV.pausado_por_erro) continue;
          if (sp.hour < cfgBV.safe_hour_start || sp.hour >= cfgBV.safe_hour_end) continue;
          if (!instancesBV.length) continue; // nenhuma instancia conectada -- nao tenta enviar

          let enviadosHoje = cfgBV.dia_contagem === sp.dateStr ? cfgBV.enviados_hoje : 0;
          let errosSeq = cfgBV.erros_seq ?? 0;

          // Baixa e conserta o áudio uma vez por funil (não por lead) -- o
          // media_url é o mesmo pra todo mundo desse funil.
          const audioPayload = cfgBV.wpp_message_type === 'audio' && cfgBV.wpp_media_url
            ? await prepareAudioPayload(cfgBV.wpp_media_url)
            : null;

          for (const bv of itens ?? []) {
            if (enviadosHoje >= cfgBV.daily_limit) break;
            if (errosSeq >= cfgBV.max_errors_seq) break;

            if (await estaOptOut(supabase, bv.whatsapp)) {
              await supabase
                .from('boas_vindas_agendados')
                .update({ status: 'erro', erro_msg: 'Opt-out: lead pediu pra parar de receber mensagem' })
                .eq('id', bv.id);
              continue;
            }

            // Rodízio real: a instância da vez muda a cada envio (mesmo padrão
            // do disparo-runner), as demais entram como fallback se ela falhar.
            const rotateIdx = enviadosHoje % instancesBV.length;
            const orderedInstancesBV = [...instancesBV.slice(rotateIdx), ...instancesBV.slice(0, rotateIdx)];

            try {
              let lastBvErr: Error | null = null;
              let usedInstanceBV = '';
              let sentMessageIdBV: string | null = null;
              for (const { base, instance, apikey } of orderedInstancesBV) {
                try {
                  let evoRes: any;
                  if (cfgBV.wpp_message_type === 'audio' && audioPayload) {
                    evoRes = await sendEvolution(`${base}/message/sendWhatsAppAudio/${instance}`, {
                      number:   bv.whatsapp,
                      audio:    audioPayload,
                      encoding: true,
                      delay:    1200,
                    }, apikey);
                  } else if (cfgBV.wpp_message_type && cfgBV.wpp_message_type !== 'text' && cfgBV.wpp_media_url) {
                    evoRes = await sendEvolution(`${base}/message/sendMedia/${instance}`, {
                      number:    bv.whatsapp,
                      mediatype: cfgBV.wpp_message_type,
                      media:     cfgBV.wpp_media_url,
                      caption:   bv.mensagem || undefined,
                      delay:     1200,
                    }, apikey);
                  } else {
                    evoRes = await sendEvolution(`${base}/message/sendText/${instance}`, {
                      number: bv.whatsapp,
                      text:   bv.mensagem,
                      delay:  1200,
                    }, apikey);
                  }
                  lastBvErr = null;
                  usedInstanceBV = instance;
                  sentMessageIdBV = extractMessageId(evoRes);
                  break;
                } catch (e) {
                  lastBvErr = e as Error;
                  if (isAmbiguousError(e)) break;
                }
              }
              if (lastBvErr) throw lastBvErr;

              await supabase
                .from('boas_vindas_agendados')
                .update({ status: 'enviado', enviado_em: new Date().toISOString() })
                .eq('id', bv.id);
              // Áudio não aceita legenda (bv.mensagem só é enviado de verdade
              // pro WhatsApp nos ramos texto/mídia-com-legenda acima).
              await registrarMensagemEnviada(
                supabase, bv.whatsapp,
                cfgBV.wpp_message_type === 'audio' ? '' : (bv.mensagem ?? ''),
                cfgBV.wpp_message_type || 'text',
                usedInstanceBV, 'boas_vindas', sentMessageIdBV,
              );

              enviadosHoje++;
              errosSeq = 0;
              processed++;
              const delayS = cfgBV.delay_min_s + Math.random() * (cfgBV.delay_max_s - cfgBV.delay_min_s);
              await new Promise(r => setTimeout(r, delayS * 1000));
            } catch (e: unknown) {
              const ambiguous = isAmbiguousError(e);
              await supabase
                .from('boas_vindas_agendados')
                .update({ status: 'erro', erro_msg: (e as Error).message })
                .eq('id', bv.id);
              if (!ambiguous) errosSeq++;
            }
          }

          await supabase.from('boas_vindas_config').update({
            enviados_hoje: enviadosHoje,
            dia_contagem: sp.dateStr,
            erros_seq: errosSeq,
            ...(errosSeq >= cfgBV.max_errors_seq ? { pausado_por_erro: true } : {}),
          }).eq('funnel_name', funnelName);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── updateGroupPicture ────────────────────────────────────────────────────────

function toCdnUrl(url: string): string {
  if (url.includes('lh3.googleusercontent.com')) return url;
  // /file/d/{id}/ or /d/{id}=
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w800`;
  // ?id={id} or &id={id}
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w800`;
  return url;
}

async function updateGroupPicture(
  base: string,
  instance: string,
  apikey: string,
  groupJid: string,
  imageUrl: string,
): Promise<void> {
  const cdnUrl = toCdnUrl(imageUrl);
  const imgRes = await fetch(cdnUrl, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  if (!imgRes.ok) {
    console.warn(`updateGroupPicture: falha ao buscar imagem (${imgRes.status}): ${cdnUrl}`);
    return;
  }
  const buffer = await imgRes.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const url  = `${base}/group/updateGroupPicture/${instance}`;
  const body = JSON.stringify({ groupJid, image: base64 });
  const hdrs = { 'Content-Type': 'application/json', apikey };

  // Tenta PUT; se der 404/405 tenta POST (varia por versão da Evolution API)
  let res = await fetch(url, { method: 'PUT', headers: hdrs, body });
  if (res.status === 404 || res.status === 405) {
    console.warn(`updateGroupPicture: PUT retornou ${res.status}, tentando POST…`);
    res = await fetch(url, { method: 'POST', headers: hdrs, body });
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn(`updateGroupPicture: Evolution ${res.status} - ${txt.slice(0, 200)}`);
    // Não lança erro — a mensagem deve ser enviada mesmo assim
  }
}

// ── processMessage ─────────────────────────────────────────────────────────────

async function processMessage(
  p: Record<string, unknown>,
  base: string,
  instance: string,
  apikey: string,
  supabase: ReturnType<typeof createClient>,
  funnelCfg: Record<string, unknown> | null,
) {
  // Monta mapa de variáveis
  const vars: Record<string, string> = {};
  if (funnelCfg) {
    if (funnelCfg.grupo_1_id) vars['grupo_1'] = funnelCfg.grupo_1_id as string;
    if (funnelCfg.grupo_2_id) vars['grupo_2'] = funnelCfg.grupo_2_id as string;
    const customVars = (funnelCfg.variaveis as Record<string, string>) ?? {};
    Object.assign(vars, customVars);
  }

  // Resolve destinatário — se for variável, substitui pelo valor real
  const rawRecipient = (p.recipient_id as string) ?? '';
  const number = applyVars(rawRecipient, vars);

  if (!number || number.includes('{{')) {
    throw new Error(`Destinatário não resolvido: "${rawRecipient}" — configure o grupo em "Configurar funil"`);
  }

  // Opt-out so bloqueia envio individual -- mensagem de grupo nao tem como pular
  // 1 pessoa so (ver estaOptOut). Lanca erro nao-retryable/silencioso: quem chama
  // processMessage trata qualquer excecao marcando a mensagem como 'erro', o que
  // aqui e o comportamento certo (nunca deve virar retry automatico).
  if (await estaOptOut(supabase, number)) {
    throw new Error('Opt-out: destinatário pediu pra parar de receber mensagem');
  }

  // ── Imagem de cabeçalho ───────────────────────────────────────────────────
  const msgType = (p.message_type as string) ?? 'text';
  const headerSubtipo = (p.subtipo as string) ?? '';
  const scheduledAt = (p.scheduled_at as string) ?? new Date().toISOString();

  let headerCombinedWithText = false;

  if (p.send_header_image !== false && funnelCfg && canSendHeaderImage(headerSubtipo, msgType, scheduledAt)) {
    const imagens = (funnelCfg.imagens as Record<string, string>) ?? {};
    const subtipo = headerSubtipo;
    let headerUrl = '';

    if (subtipo && imagens[subtipo]) {
      // Seleção por subtipo (manha, tarde, noite, aula_manha, aula_tarde,
      // contagem_3h/2h/1h, live, provocacao, aula_1/2/3)
      headerUrl = imagens[subtipo];
    } else {
      // Fallback: seleção por horário
      const hour = hourOf(scheduledAt);
      if      (hour >= 6  && hour < 12) headerUrl = imagens['manha'] || (funnelCfg.imagem_manha as string) || '';
      else if (hour >= 12 && hour < 18) headerUrl = imagens['tarde'] || (funnelCfg.imagem_tarde as string) || '';
      else                              headerUrl = imagens['noite'] || (funnelCfg.imagem_noite as string) || '';
    }

    if (headerUrl) {
      if ((p.update_group_picture as boolean) === true) {
        const groupJid = toGroupJid(number);
        if (groupJid) {
          // Não-fatal: erro na foto não impede o envio da mensagem
          await updateGroupPicture(base, instance, apikey, groupJid, headerUrl).catch(e =>
            console.warn('updateGroupPicture (non-fatal):', e?.message ?? e),
          );
        } else {
          console.warn(`updateGroupPicture: JID inválido para "${number}", pulando`);
        }
      }

      if (msgType === 'text') {
        // Manda a imagem e o texto como UMA mensagem só (legenda), em vez de
        // duas mensagens separadas -- fica mais premium e evita a prévia de
        // link competindo com a imagem de capa.
        const text = applyVars(p.message_text as string, vars);
        const evoRes = await sendEvolution(`${base}/message/sendMedia/${instance}`, {
          number,
          mediatype: 'image',
          media: headerUrl,
          caption: text,
          delay: 1200,
          mentionsEveryOne: (p.mention_everyone as boolean) ?? false,
        }, apikey);
        await registrarMensagemEnviada(supabase, number, text, 'image', instance, 'funil', extractMessageId(evoRes));
        headerCombinedWithText = true;
      } else {
        const evoRes = await sendEvolution(`${base}/message/sendMedia/${instance}`, {
          number,
          mediatype: 'image',
          media: headerUrl,
          delay: 1200,
        }, apikey);
        await registrarMensagemEnviada(supabase, number, '', 'image', instance, 'funil', extractMessageId(evoRes));
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  if (headerCombinedWithText) return;

  // ── Mensagem principal ────────────────────────────────────────────────────
  switch (msgType) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document': {
      const mediaUrl = applyVars(p.media_url as string, vars);
      const caption  = applyVars(p.message_text as string, vars);
      const evoRes = await sendEvolution(`${base}/message/sendMedia/${instance}`, {
        number,
        mediatype: msgType,
        media: mediaUrl,
        caption: caption || undefined,
        delay: 1200,
        mentionsEveryOne: (p.mention_everyone as boolean) ?? false,
      }, apikey);
      await registrarMensagemEnviada(supabase, number, caption, msgType, instance, 'funil', extractMessageId(evoRes));
      break;
    }

    case 'poll': {
      const pollName = (p.poll_name as string) || 'Enquete';
      const evoRes = await sendEvolution(`${base}/message/sendPoll/${instance}`, {
        number,
        name: pollName,
        selectableCount: (p.poll_selectable_count as number) ?? 1,
        values: (p.poll_options as string[]) ?? [],
        delay: 1200,
      }, apikey);
      await registrarMensagemEnviada(supabase, number, pollName, 'poll', instance, 'funil', extractMessageId(evoRes));
      break;
    }

    default: { // text
      const text = applyVars(p.message_text as string, vars);
      const evoRes = await sendEvolution(`${base}/message/sendText/${instance}`, {
        number,
        text,
        linkPreview: (p.link_preview as boolean) ?? false,
        mentionsEveryOne: (p.mention_everyone as boolean) ?? false,
        delay: 1200,
      }, apikey);
      await registrarMensagemEnviada(supabase, number, text, 'text', instance, 'funil', extractMessageId(evoRes));
      break;
    }
  }
}
