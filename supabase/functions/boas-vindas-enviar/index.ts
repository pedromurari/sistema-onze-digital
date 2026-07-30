import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// ── Áudio: conserto de MP4 não-streamable ───────────────────────────────────
// A Evolution entrega o áudio ao ffmpeg por um pipe (não-seekable). MP4 com o
// atom `moov` (o índice) no fim do arquivo não é demuxável assim: o ffmpeg
// precisaria voltar atrás pra ler os dados que já passaram. Ele falha, e aí um
// bug da Evolution resolve `Buffer.concat([])` -- buffer vazio passa no teste
// `Buffer.isBuffer()` e vira uma mensagem de 0 byte. O WhatsApp mostra "áudio
// não disponível" e a API ainda responde 200. Exports de áudio do WhatsApp
// (o que costuma vir do Drive) têm o `moov` no fim. A correção é mover o
// `moov` pra frente antes de mandar -- sem recodificar, só reordenando os
// boxes e corrigindo as tabelas de offset de chunk (absolutas no arquivo).

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
      size = v.getUint32(off + 8) * 2 ** 32 + v.getUint32(off + 12); // tamanho de 64 bits
      payload = off + 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < 8 || off + size > end) return out; // estrutura inesperada -- para aqui
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

/** Devolve o MP4 com o `moov` no início, ou null se não precisar/não der pra mexer. */
function faststartMp4(input: Uint8Array): Uint8Array | null {
  const v = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const top = readBoxes(v, input, 0, input.length);
  const moov = top.find(x => x.type === 'moov');
  const mdat = top.find(x => x.type === 'mdat');
  if (!moov || !mdat) return null;          // não é MP4 -- segue como está
  if (moov.start < mdat.start) return null; // já está streamable

  const moovBytes = input.slice(moov.start, moov.end); // cópia: não mexe no original
  const mv = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
  // O mdat vai ser empurrado pra frente exatamente pelo tamanho do moov, então
  // cada offset de chunk soma esse mesmo delta.
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
  // Se os boxes não cobriram o arquivo inteiro, algo escapou da leitura -- não arrisca.
  return pos === input.length ? out : null;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

/**
 * Decide o que mandar no campo `audio` da Evolution: base64 já corrigido quando
 * o arquivo precisa de faststart, ou a própria URL quando já está streamable
 * (aí a Evolution baixa sozinha, como antes). Qualquer falha cai na URL.
 */
async function prepareAudioPayload(mediaUrl: string): Promise<string> {
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return mediaUrl;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fixed = faststartMp4(bytes);
    if (!fixed) return mediaUrl;
    console.log(`boas-vindas-enviar: audio remuxado pra faststart (${bytes.length} bytes)`);
    return toBase64(fixed);
  } catch (e: unknown) {
    console.warn('boas-vindas-enviar: falha ao preparar audio, usando a URL crua:', (e as Error).message);
    return mediaUrl;
  }
}

function toGroupJid(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('@g.us')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `${trimmed}@g.us`;
  return trimmed; // número individual
}

type EvoInstance = { id: string; api_url: string; api_key: string; instance_name: string };

// Resolução da instância: override específico do funil (wpp_instance_name) -> instância(s)
// escolhida(s) na tela de Boas-vindas (evolution_task_config, task 'boas_vindas') -> todas
// as instâncias ativas por prioridade global. Mesmo padrão do enviar-cobranca.
async function resolveInstances(
  db: ReturnType<typeof createClient>,
  cfg: { wpp_instance_name?: string | null },
  allActive: EvoInstance[],
): Promise<EvoInstance[]> {
  if (cfg.wpp_instance_name) {
    const scoped = allActive.filter(r => r.instance_name === cfg.wpp_instance_name);
    if (scoped.length) return scoped;
  }

  const { data: taskCfg } = await db
    .from('evolution_task_config')
    .select('instance_ids')
    .eq('task', 'boas_vindas')
    .maybeSingle();
  if (taskCfg?.instance_ids?.length) {
    const byId = new Map(allActive.map(i => [i.id, i]));
    const scoped = (taskCfg.instance_ids as string[]).map(id => byId.get(id)).filter(Boolean) as EvoInstance[];
    if (scoped.length) return scoped;
  }

  return allActive;
}

// A Evolution API pode responder 200 mesmo com a sessão do WhatsApp fechada e só falhar
// silenciosamente na entrega — checa o estado real de conexão antes de usar a instância
// (mesmo mecanismo do disparo-runner e enviar-cobranca).
async function isInstanceConnected(inst: { api_url: string; api_key: string; instance_name: string }): Promise<boolean> {
  const rawBase = inst.api_url.replace(/\/$/, '');
  const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  try {
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { instance?: { state?: string } };
    return data.instance?.state === 'open';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const {
      funnel_name,
      nome        = '',
      whatsapp    = '',
      email       = '',
    }: {
      funnel_name: string;
      nome?: string;
      whatsapp?: string;
      email?: string;
    } = body;

    if (!funnel_name) {
      return new Response(JSON.stringify({ error: 'funnel_name obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Carrega configuração de boas-vindas ───────────────────────────────────
    const { data: cfg } = await supabase
      .from('boas_vindas_config')
      .select('*')
      .eq('funnel_name', funnel_name)
      .maybeSingle();

    if (!cfg?.ativo) {
      return new Response(JSON.stringify({ error: 'Boas-vindas não está ativo para este funil' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vars: Record<string, string> = {
      nome,
      turma: funnel_name,
      whatsapp,
      email,
    };

    let wppStatus  = 'skipped';
    let emailStatus = 'skipped';
    let wppError: string | null = null;
    let emailError: string | null = null;

    // ── Envio WhatsApp ────────────────────────────────────────────────────────
    if (cfg.wpp_ativo && whatsapp) {
      try {
        // Instâncias Evolution
        const { data: evoRows } = await supabase
          .from('evolution_config')
          .select('id, api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });

        if (!evoRows?.length) throw new Error('Nenhuma instância Evolution ativa');

        const candidateInstances = await resolveInstances(supabase, cfg, evoRows as EvoInstance[]);
        const connectedFlags = await Promise.all(candidateInstances.map(isInstanceConnected));
        const activeInstances = candidateInstances.filter((_: unknown, i: number) => connectedFlags[i]);

        if (!activeInstances.length) throw new Error('Nenhuma instância conectada disponível (sessão do WhatsApp fechada)');

        const mensagem = applyVars(cfg.wpp_mensagem, vars);
        const number   = toGroupJid(whatsapp);
        const msgType  = (cfg.wpp_message_type as string) || 'text';
        const mediaUrl = msgType !== 'text' ? applyVars(cfg.wpp_media_url ?? '', vars) : '';
        if (msgType !== 'text' && !mediaUrl) throw new Error('wpp_media_url não configurada para o tipo de mensagem escolhido');
        // Baixa e conserta o áudio uma vez (não por tentativa de instância).
        const audioPayload = msgType === 'audio' ? await prepareAudioPayload(mediaUrl) : '';

        let lastErr: Error | null = null;
        for (const inst of activeInstances) {
          const rawBase = (inst.api_url as string).replace(/\/$/, '');
          const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
          const apikey  = inst.api_key as string;
          const instance = inst.instance_name as string;

          try {
            // Áudio tem endpoint próprio: no /sendMedia a Evolution deduz o
            // mimetype do Content-Type da URL de origem (o Drive devolve
            // "video/mp4") e o WhatsApp não toca o áudio -- a API responde 200
            // e o envio é dado como certo sem nada chegar. /sendWhatsAppAudio
            // transcodifica pra ogg/opus e manda como áudio de verdade (ptt).
            const instPath = encodeURIComponent(instance);
            const endpoint =
              msgType === 'audio' ? `${base}/message/sendWhatsAppAudio/${instPath}` :
              msgType === 'text'  ? `${base}/message/sendText/${instPath}` :
                                    `${base}/message/sendMedia/${instPath}`;
            const payload =
              msgType === 'audio' ? { number, audio: audioPayload, encoding: true, delay: 1200 } :
              msgType === 'text'  ? { number, text: mensagem, delay: 1200 } :
                                    { number, mediatype: msgType, media: mediaUrl, caption: mensagem, delay: 1200 };
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey },
              body: JSON.stringify(payload),
            });
            const txt = await res.text();
            if (!res.ok) throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e as Error;
          }
        }

        if (lastErr) throw lastErr;
        wppStatus = 'sent';

      } catch (e: unknown) {
        wppStatus = 'error';
        wppError  = (e as Error).message;
      }
    }

    // ── Envio Email ───────────────────────────────────────────────────────────
    if (cfg.email_ativo && email) {
      try {
        const assunto = applyVars(cfg.email_assunto, vars);
        const corpo   = applyVars(cfg.email_corpo, vars);

        const { data: emailRes } = await supabase.functions.invoke('email-enviar', {
          body: {
            to:      email,
            to_name: nome || undefined,
            subject: assunto,
            html:    corpo,
          },
        });

        if ((emailRes as any)?.error) throw new Error((emailRes as any).error);
        emailStatus = 'sent';

      } catch (e: unknown) {
        emailStatus = 'error';
        emailError  = (e as Error).message;
      }
    }

    // ── Log ───────────────────────────────────────────────────────────────────
    await supabase.from('boas_vindas_logs').insert({
      funnel_name,
      nome:         nome || null,
      whatsapp:     whatsapp || null,
      email:        email || null,
      wpp_status:   wppStatus,
      email_status: emailStatus,
      wpp_error:    wppError,
      email_error:  emailError,
    });

    const allOk = (wppStatus !== 'error') && (emailStatus !== 'error');

    return new Response(JSON.stringify({
      ok: allOk,
      wpp_status:   wppStatus,
      email_status: emailStatus,
      wpp_error:    wppError,
      email_error:  emailError,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
