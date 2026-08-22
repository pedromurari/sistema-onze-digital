import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron a cada poucos minutos: manda a mensagem da fase atual pra leads em
// 'aguardando_envio_fase', escolhendo o próximo número da empresa em rodízio
// (least-recently-used entre evolution_config ativos). Envia via Evolution
// API direto (mesmo motivo do aquecimento-worker: precisa manter a mesma
// instância que o lead vai receber a resposta, senão o matching de
// engajamento em evo-resposta não bate).

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

function baseUrl(rawApiUrl: string): string {
  const raw = rawApiUrl.replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const BATCH_SIZE = 20;

// ── Áudio: conserto de MP4 não-streamable (mesmo helper usado em
// boas-vindas-enviar/disparo-runner/funil-processar) ────────────────────────
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
    return toBase64(fixed);
  } catch {
    return mediaUrl;
  }
}

function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits;
}

async function enviarMensagem(
  evo: { api_url: string; api_key: string; instance_name: string },
  phone: string,
  msgType: string,
  texto: string,
  mediaUrl: string | null,
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const base = baseUrl(evo.api_url);
  const headers = { 'Content-Type': 'application/json', apikey: evo.api_key };
  const instPath = encodeURIComponent(evo.instance_name);
  const number = toE164Digits(phone);

  try {
    let res: Response;
    if (msgType === 'audio') {
      const audioPayload = await prepareAudioPayload(mediaUrl ?? '');
      res = await fetch(`${base}/message/sendWhatsAppAudio/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, audio: audioPayload, encoding: true, delay: 1200 }),
        signal: AbortSignal.timeout(30_000),
      });
    } else if (msgType === 'text') {
      res = await fetch(`${base}/message/sendText/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, text: texto, delay: 1200 }),
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      res = await fetch(`${base}/message/sendMedia/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, mediatype: msgType, media: mediaUrl, caption: texto || undefined, delay: 1200 }),
        signal: AbortSignal.timeout(20_000),
      });
    }
    const rawText = await res.text();
    if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${rawText.slice(0, 200)}` };
    let json: any = {};
    try { json = JSON.parse(rawText); } catch { /* sem corpo json */ }
    return { ok: true, messageId: json?.key?.id ?? json?.data?.key?.id ?? null };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

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
    const { data: instancias } = await supabase
      .from('evolution_config')
      .select('id, api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    if (!instancias?.length) return ok({ ok: false, error: 'Nenhuma instância Evolution ativa' });

    const { data: fases } = await supabase
      .from('lead_aquecimento_fases')
      .select('fase_numero, message_type, mensagem_texto, media_url, ativo');
    const fasesPorNumero = new Map((fases ?? []).map(f => [f.fase_numero, f]));

    const { data: leads, error: leadsErr } = await supabase
      .from('lead_aquecimento_leads')
      .select('id, phone, fase_atual, campanha_id')
      .eq('status', 'aguardando_envio_fase')
      .order('criado_em', { ascending: true })
      .limit(BATCH_SIZE);

    if (leadsErr) throw new Error(`falha ao buscar leads: ${leadsErr.message}`);
    if (!leads?.length) return ok({ ok: true, processed: 0 });

    // Rodízio least-recently-used: conta quantos leads cada instância já enviou
    // (nas últimas 24h) e ordena da menos usada pra mais usada.
    const { data: usoRecente } = await supabase
      .from('lead_aquecimento_leads')
      .select('evolution_config_id_envio')
      .not('evolution_config_id_envio', 'is', null)
      .gte('fase_enviada_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const usoCount = new Map<string, number>();
    for (const inst of instancias) usoCount.set(inst.id, 0);
    for (const u of usoRecente ?? []) {
      const id = u.evolution_config_id_envio as string;
      usoCount.set(id, (usoCount.get(id) ?? 0) + 1);
    }

    const results: Record<string, unknown>[] = [];

    for (const lead of leads) {
      const fase = fasesPorNumero.get(lead.fase_atual);
      if (!fase || !fase.ativo) {
        // Fase pausada/inexistente: não tenta, fica parado até alguém reativar.
        continue;
      }

      const ordenadas = [...instancias].sort((a, b) => (usoCount.get(a.id) ?? 0) - (usoCount.get(b.id) ?? 0));
      const escolhida = ordenadas[0];

      const resultado = await enviarMensagem(
        escolhida as any, lead.phone, fase.message_type, fase.mensagem_texto, fase.media_url,
      );

      const now = new Date().toISOString();
      if (resultado.ok) {
        await supabase.from('lead_aquecimento_leads').update({
          status: 'aguardando_engajamento',
          evolution_config_id_envio: escolhida.id,
          fase_enviada_em: now,
          error_msg: null,
        }).eq('id', lead.id);
        usoCount.set(escolhida.id, (usoCount.get(escolhida.id) ?? 0) + 1);
        results.push({ lead: lead.id, result: 'enviado', fase: lead.fase_atual, instancia: escolhida.instance_name });
      } else {
        await supabase.from('lead_aquecimento_leads').update({
          error_msg: resultado.error,
        }).eq('id', lead.id);
        results.push({ lead: lead.id, result: 'erro', reason: resultado.error });
      }

      const jitterSec = 2 + Math.random() * 3;
      await new Promise(r => setTimeout(r, jitterSec * 1000));
    }

    return ok({ ok: true, processed: results.length, results });

  } catch (e: unknown) {
    console.error('aquecimento-lead-enviar-fase error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
