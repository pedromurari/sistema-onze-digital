import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    console.log(`npa-bv-trigger: audio remuxado pra faststart (${bytes.length} bytes)`);
    return toBase64(fixed);
  } catch (e: unknown) {
    console.warn('npa-bv-trigger: falha ao preparar audio, usando a URL crua:', (e as Error).message);
    return mediaUrl;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: 'lead_id required' }), { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Busca o lead ───────────────────────────────────────────────────────
    const { data: lead } = await supabase
      .from('npa_evento_leads')
      .select('id, nome, email, whatsapp, turma, npa_evento_id, bv_enviado, ingresso_pago')
      .eq('id', lead_id)
      .single();

    if (!lead?.ingresso_pago || lead.bv_enviado || !lead.whatsapp) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // ── Busca o evento ─────────────────────────────────────────────────────
    const { data: evento } = await supabase
      .from('npa_eventos')
      .select('nome, data_evento')
      .eq('id', lead.npa_evento_id)
      .single();

    if (!evento) return new Response(JSON.stringify({ error: 'evento not found' }), { status: 200 });

    // ── Busca funnel_configs (links de grupo) e boas_vindas_config (mensagens) ─
    const [{ data: fConfig }, { data: bvCfg }] = await Promise.all([
      supabase.from('funnel_configs').select('variaveis').eq('funnel_name', evento.nome).maybeSingle(),
      supabase.from('boas_vindas_config')
        .select('ativo, wpp_ativo, wpp_mensagem, wpp_mensagem_tarde, wpp_message_type, wpp_media_url, email_ativo, email_assunto, email_corpo')
        .eq('funnel_name', evento.nome)
        .maybeSingle(),
    ]);

    const vars: Record<string, string> = (fConfig as any)?.variaveis ?? {};

    // Sem linha em boas_vindas_config ainda: mantém comportamento antigo (manda
    // WhatsApp por padrão). Com linha, respeita o toggle wpp_ativo -- é o que
    // dá pra ligar/desligar pela tela de Boas-vindas.
    const wppEnabled = bvCfg ? bvCfg.wpp_ativo === true : true;

    const tplNovo = lead.turma === 'tarde'
      ? (bvCfg?.wpp_mensagem_tarde || bvCfg?.wpp_mensagem)
      : bvCfg?.wpp_mensagem;
    const tplLegado = lead.turma === 'tarde'
      ? (vars['bv_wpp_tarde'] || vars['bv_wpp_manha'])
      : vars['bv_wpp_manha'];
    const tpl = tplNovo || tplLegado;

    const fallback = `🌟 Bem-vindo(a) ao ${evento.nome}!\nSua inscrição está confirmada! 🙌\n\nAguarde as próximas mensagens com todas as informações do evento.\n\nQualquer dúvida, estamos por aqui!`;

    const linkGrupo = lead.turma === 'tarde'
      ? (vars['link_grupo_tarde'] || vars['link_grupo_2'] || vars['link_grupo_manha'] || '')
      : (vars['link_grupo_manha'] || vars['link_grupo_1'] || '');

    const dataEvento = evento.data_evento
      ? new Date(evento.data_evento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      : '';

    const templateVars: Record<string, string> = {
      nome: lead.nome || 'você',
      evento_nome: evento.nome,
      turma: lead.turma === 'manha' ? 'Manhã' : 'Tarde',
      link_grupo: linkGrupo,
      link_grupo_manha: vars['link_grupo_manha'] || vars['link_grupo_1'] || '',
      link_grupo_tarde: vars['link_grupo_tarde'] || vars['link_grupo_2'] || '',
      data_evento: dataEvento,
    };

    const mensagem = applyVars(tpl || fallback, templateVars);

    // ── Envia WPP (se wpp_ativo) ────────────────────────────────────────────
    let wppStatus: 'sent' | 'error' | 'skipped' = 'skipped';
    let wppError: string | null = null;
    let sent = false;

    if (wppEnabled) {
      try {
        const { data: evoRows } = await supabase
          .from('evolution_config')
          .select('api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true })
          .limit(1);

        if (!evoRows?.length) throw new Error('nenhuma instância Evolution ativa');

        const evo = evoRows[0];
        const rawBase = (evo.api_url as string).replace(/\/$/, '');
        const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
        const phone = lead.whatsapp.replace(/\D/g, '');
        const number = `${phone}@whatsapp.net`;

        const sendMsg = async (text: string) => {
          const r = await fetch(`${evoBase}/message/sendText/${evo.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
            body: JSON.stringify({ number, text, delay: 1200 }),
          });
          const txt = await r.text();
          if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt.slice(0, 200)}`);
        };

        const msgType = (bvCfg?.wpp_message_type as string) || 'text';
        if (msgType === 'text') {
          await sendMsg(mensagem);
        } else {
          const mediaUrl = applyVars(bvCfg?.wpp_media_url ?? '', templateVars);
          if (!mediaUrl) throw new Error('wpp_media_url não configurada para o tipo de mensagem escolhido');
          // Áudio tem endpoint próprio -- no /sendMedia a Evolution deduz o
          // mimetype do Content-Type da origem (o Drive devolve "video/mp4"),
          // responde 200 e o WhatsApp não toca nada. Ver boas-vindas-enviar.
          const instPath = encodeURIComponent(evo.instance_name as string);
          const audioPayload = msgType === 'audio' ? await prepareAudioPayload(mediaUrl) : '';
          const r = msgType === 'audio'
            ? await fetch(`${evoBase}/message/sendWhatsAppAudio/${instPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
                body: JSON.stringify({ number, audio: audioPayload, encoding: true, delay: 1200 }),
              })
            : await fetch(`${evoBase}/message/sendMedia/${instPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
                body: JSON.stringify({ number, mediatype: msgType, media: mediaUrl, caption: mensagem, delay: 1200 }),
              });
          const txt = await r.text();
          if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt.slice(0, 200)}`);
        }
        sent = true;
        wppStatus = 'sent';
        console.log(`npa-bv-trigger: lead=${lead_id} evento="${evento.nome}" sent=true`);

        // Envia link do grupo separado se o template não incluiu o link
        if (linkGrupo && !mensagem.includes(linkGrupo)) {
          await new Promise(r => setTimeout(r, 2000));
          await sendMsg(
            `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento serão enviadas pelo grupo dos alunos.\n\n👉 Entre agora:\n${linkGrupo}`,
          );
        }
      } catch (e: unknown) {
        wppStatus = 'error';
        wppError = (e as Error).message;
        console.error(`npa-bv-trigger wpp error: ${wppError}`);
      }
    }

    // ── Envia Email (se configurado em boas_vindas_config) ────────────────
    let emailStatus: 'sent' | 'error' | 'skipped' = 'skipped';
    let emailError: string | null = null;
    if (lead.email && bvCfg?.email_ativo && bvCfg.email_assunto && bvCfg.email_corpo) {
      try {
        const assunto = applyVars(bvCfg.email_assunto, templateVars);
        const corpo   = applyVars(bvCfg.email_corpo,   templateVars);

        const { data: emailRes } = await supabase.functions.invoke('email-enviar', {
          body: {
            to:      lead.email,
            to_name: lead.nome || undefined,
            subject: assunto,
            html:    corpo,
          },
        });

        if ((emailRes as any)?.error) throw new Error((emailRes as any).error);
        emailStatus = 'sent';
        console.log(`npa-bv-trigger: email sent to ${lead.email}`);
      } catch (e: unknown) {
        emailStatus = 'error';
        emailError = (e as Error).message;
        console.error(`npa-bv-trigger email error: ${emailError}`);
      }
    }

    // ── Log unificado (mesma tabela usada pelas Turmas/Lançamentos) ────────
    await supabase.from('boas_vindas_logs').insert({
      funnel_name: evento.nome,
      nome: lead.nome || null,
      whatsapp: lead.whatsapp || null,
      email: lead.email || null,
      wpp_status: wppStatus,
      email_status: emailStatus,
      wpp_error: wppError,
      email_error: emailError,
    });

    if (sent || !wppEnabled) {
      await supabase
        .from('npa_evento_leads')
        .update({ bv_enviado: true, bv_enviado_em: new Date().toISOString() })
        .eq('id', lead_id);
    }

    return new Response(JSON.stringify({ ok: sent || !wppEnabled, wpp_status: wppStatus, email_status: emailStatus }), { status: 200 });

  } catch (e: unknown) {
    console.error('npa-bv-trigger error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }
});
