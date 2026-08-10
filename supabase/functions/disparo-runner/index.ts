import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    const allInstances = await getAllInstances(supabase);

    if (!allInstances?.length) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_instances' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // A Evolution API pode aceitar a chamada REST (HTTP 200/201) mesmo com a
    // sessao do WhatsApp fechada, e so falhar silenciosamente na entrega --
    // ja vimos isso marcar lead como "enviado" sem nada ter saido de verdade.
    // Checa o estado de conexao de cada instancia uma vez por execucao e
    // exclui da rotacao qualquer uma que nao esteja "open".
    const connectedIds = await getConnectedInstanceIds(allInstances);

    const now = new Date();
    const brazilHour = (now.getUTCHours() - 3 + 24) % 24;

    // Libera leads presos em "enviando" (execução anterior travou/caiu antes de concluir)
    await supabase
      .from('disparo_leads')
      .update({ status: 'pendente' })
      .eq('status', 'enviando')
      .lt('sent_at', new Date(now.getTime() - 3 * 60 * 1000).toISOString());

    const { data: campaigns, error: campaignsErr } = await supabase
      .from('disparo_campanhas')
      .select('*')
      .eq('status', 'ativo')
      .lte('next_send_at', now.toISOString());
    if (campaignsErr) console.error('disparo-runner: falha ao buscar campanhas elegiveis:', campaignsErr.message);

    if (!campaigns?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;

    for (const camp of campaigns) {
      if (brazilHour < camp.safe_hour_start || brazilHour >= camp.safe_hour_end) {
        const hoursUntilSafe = ((camp.safe_hour_start + 3 - now.getUTCHours() + 24) % 24) || 24;
        const nextSafe = new Date(now.getTime() + hoursUntilSafe * 60 * 60 * 1000);
        await supabase.from('disparo_campanhas')
          .update({ next_send_at: nextSafe.toISOString() })
          .eq('id', camp.id);
        continue;
      }

      const todayBR = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { count: sentToday } = await supabase
        .from('disparo_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', camp.id)
        .eq('status', 'enviado')
        .gte('sent_at', todayBR + 'T00:00:00+00:00');

      if ((sentToday ?? 0) >= camp.daily_limit) {
        const tomorrow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours((camp.safe_hour_start + 3) % 24, 0, 0, 0);
        await supabase.from('disparo_campanhas')
          .update({ next_send_at: tomorrow.toISOString() })
          .eq('id', camp.id);
        continue;
      }

      const { data: candidate } = await supabase
        .from('disparo_leads')
        .select('id')
        .eq('campanha_id', camp.id)
        .eq('status', 'pendente')
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!candidate) {
        await supabase.from('disparo_campanhas')
          .update({ status: 'concluido' })
          .eq('id', camp.id);
        continue;
      }

      // Claim atômico: marca 'enviando' ANTES de enviar — evita duplicata se o
      // cron sobrepõe (uma execução ainda processando quando a próxima começa).
      const { data: claimedRows, error: claimErr } = await supabase
        .from('disparo_leads')
        .update({ status: 'enviando', sent_at: now.toISOString() })
        .eq('id', candidate.id)
        .eq('status', 'pendente')
        .select('*');
      if (claimErr) console.error(`disparo-runner: falha ao reivindicar lead ${candidate.id}:`, claimErr.message);

      const lead = claimedRows?.[0];
      if (!lead) continue; // outra execução já pegou este lead (ou a reivindicação falhou -- ver log acima)

      const phone = formatPhone(lead.phone);
      if (!phone) {
        await supabase.from('disparo_leads')
          .update({ status: 'pulado', error_msg: 'Telefone inválido', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_skipped: (camp.leads_skipped ?? 0) + 1 })
          .eq('id', camp.id);
        continue;
      }

      // Nunca enviar pra quem já pediu pra parar (whatsapp_opt_out, gravado por
      // evo-resposta) -- risco de denuncia/ban de numero, checagem obrigatoria
      // antes de qualquer tentativa de envio.
      if (await estaOptOut(supabase, phone)) {
        await supabase.from('disparo_leads')
          .update({ status: 'pulado', error_msg: 'Opt-out: lead pediu pra parar de receber mensagem', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_skipped: (camp.leads_skipped ?? 0) + 1 })
          .eq('id', camp.id);
        continue;
      }

      const pinnedIds: string[] = (camp.evolution_config_ids?.length ? camp.evolution_config_ids : camp.evolution_config_id ? [camp.evolution_config_id] : []);
      const scoped = pinnedIds.length
        ? allInstances.filter((r: { id: string }) => pinnedIds.includes(r.id))
        : allInstances;
      const campInstances = (scoped.length ? scoped : allInstances).filter((r: { id: string }) => connectedIds.has(r.id));

      if (!campInstances.length) {
        // Nenhuma instância elegível está com sessão de WhatsApp aberta --
        // nem tenta enviar (evita o falso "enviado" que a Evolution API pode
        // devolver mesmo com a sessão fechada).
        const newErrors = (camp.consecutive_errors ?? 0) + 1;
        await supabase.from('disparo_leads')
          .update({ status: 'erro', error_msg: 'Nenhuma instância conectada disponível (sessão do WhatsApp fechada)', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({
            leads_error: (camp.leads_error ?? 0) + 1,
            consecutive_errors: newErrors,
            next_send_at: now.toISOString(),
            ...(newErrors >= camp.max_errors_seq ? { status: 'erro' } : {}),
          })
          .eq('id', camp.id);
        continue;
      }

      // Checagem síncrona: o número existe no WhatsApp de verdade? Não depende
      // de webhook (que nessa instalação da Evolution API não confirma entrega
      // de jeito nenhum -- confirmado via captura de payload). Se o número não
      // existe, nem tenta enviar -- evita o falso "enviado" pra número inválido.
      // null = checagem indisponível/deu erro -- não bloqueia, segue o envio normal.
      const numeroExiste = await checkWhatsappExists(campInstances[0], phone);
      if (numeroExiste === false) {
        const newErrors = (camp.consecutive_errors ?? 0) + 1;
        await supabase.from('disparo_leads')
          .update({ status: 'erro', error_msg: 'Número não está no WhatsApp', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({
            leads_error: (camp.leads_error ?? 0) + 1,
            consecutive_errors: newErrors,
            next_send_at: now.toISOString(),
            ...(newErrors >= camp.max_errors_seq ? { status: 'erro' } : {}),
          })
          .eq('id', camp.id);
        continue;
      }

      // Rodízio: a instância da vez é escolhida por quantas mensagens a campanha já mandou,
      // as demais entram como fallback (nessa ordem) se a da vez falhar.
      const rotateIdx = (camp.leads_sent ?? 0) % campInstances.length;
      const orderedInstances = [...campInstances.slice(rotateIdx), ...campInstances.slice(0, rotateIdx)];

      const vars: Record<string, string> = {
        nome:  lead.nome ?? '',
        phone: lead.phone,
        ...(lead.variaveis ?? {}),
      };
      const message = applyTemplate(camp.template ?? '', vars);

      // Baixa e conserta o áudio uma vez por lead (não por tentativa de
      // instância) -- reaproveita entre fallbacks se a primeira instância falhar.
      const audioPayload = camp.message_type === 'audio'
        ? await prepareAudioPayload(camp.media_url)
        : null;

      let sendOk    = false;
      let sendError = '';
      let sentInstanceId = '';
      let sentMessageId: string | null = null;
      let ambiguous = false;

      for (const inst of orderedInstances) {
        const rawBase = (inst.api_url as string).replace(/\/$/, '');
        const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
        try {
          const instPath = encodeURIComponent(inst.instance_name);
          let res: Response;
          if (camp.message_type === 'audio') {
            // Áudio NÃO pode ir por /sendMedia: lá a Evolution deduz o mimetype
            // do Content-Type da URL de origem (o Drive devolve "video/mp4"),
            // manda um audioMessage marcado como vídeo e o WhatsApp não toca --
            // a API responde 200 e o lead vira "enviado" sem nada chegar.
            // /sendWhatsAppAudio com encoding transcodifica pra ogg/opus e
            // envia como áudio de verdade (ptt), independente da URL de origem.
            // audioPayload já vem com o MP4 remuxado (moov no início) quando
            // precisava -- ver prepareAudioPayload/faststartMp4 mais abaixo.
            res = await fetch(`${base}/message/sendWhatsAppAudio/${instPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({
                number:   phone,
                audio:    audioPayload,
                encoding: true,
                delay:    1200,
              }),
            });
          } else if (camp.message_type && camp.message_type !== 'text') {
            res = await fetch(`${base}/message/sendMedia/${instPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({
                number:    phone,
                mediatype: camp.message_type,
                media:     camp.media_url,
                caption:   message || undefined,
                delay:     1200,
              }),
            });
          } else {
            res = await fetch(`${base}/message/sendText/${instPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({
                number: phone,
                text: message,
                delay: 1200,
                ...(camp.mention_everyone ? { mentionEveryone: true } : {}),
              }),
            });
          }
          const rawText = await res.text();
          if (!res.ok) throw new Error(`${res.status}: ${rawText.slice(0, 200)}`);

          let json: any = {};
          try { json = JSON.parse(rawText); } catch { /* resposta sem corpo json */ }
          sentMessageId = json?.key?.id ?? json?.data?.key?.id ?? null;

          sendOk = true;
          sentInstanceId = inst.id;
          break;
        } catch (e: unknown) {
          sendError = `[${inst.instance_name}] ${(e as Error).message}`;
          const isTimeout = e instanceof Error &&
            (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|timed out/i.test(e.message));
          if (isTimeout) {
            // Pode já ter entregue — não tenta outra instância pro mesmo lead
            ambiguous = true;
            console.warn(`disparo-runner: ${inst.instance_name} deu timeout (envio incerto), não tentando outra instância`);
            break;
          }
          console.warn(`disparo-runner: ${inst.instance_name} falhou, tentando próxima...`);
        }
      }

      const sentAt = now.toISOString();
      // Delay só se enviou com sucesso — erro passa pro próximo lead imediatamente
      const delayS     = camp.delay_min_s + Math.random() * (camp.delay_max_s - camp.delay_min_s);
      const nextSendAt = new Date(now.getTime() + delayS * 1000).toISOString();

      if (sendOk) {
        await registrarMensagemEnviada(supabase, phone, message, camp.message_type, sentInstanceId, orderedInstances, sentMessageId);
        await supabase.from('disparo_leads')
          .update({ status: 'enviado', sent_at: sentAt, error_msg: null, instance_id: sentInstanceId, evolution_message_id: sentMessageId })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_sent: (camp.leads_sent ?? 0) + 1, consecutive_errors: 0, next_send_at: nextSendAt })
          .eq('id', camp.id);
      } else {
        const newErrors = (camp.consecutive_errors ?? 0) + 1;
        await supabase.from('disparo_leads')
          .update({
            status: 'erro',
            error_msg: ambiguous ? `[verificar manualmente antes de reenviar] ${sendError}` : sendError,
            sent_at: sentAt,
          })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({
            leads_error:        (camp.leads_error ?? 0) + 1,
            consecutive_errors: newErrors,
            // sem delay — próximo lead é processado no cron seguinte sem espera
            next_send_at:       sentAt,
            ...(newErrors >= camp.max_errors_seq ? { status: 'erro' } : {}),
          })
          .eq('id', camp.id);
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('disparo-runner error:', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ── Áudio: conserto de MP4 não-streamable ───────────────────────────────────
// A Evolution entrega o áudio ao ffmpeg por um pipe (não-seekable). MP4 com o
// atom `moov` (o índice) no fim do arquivo não é demuxável assim: o ffmpeg
// precisaria voltar atrás pra ler os dados que já passaram. Ele falha, e aí um
// bug da Evolution resolve `Buffer.concat([])` -- buffer vazio passa no teste
// `Buffer.isBuffer()` e vira uma mensagem de 0 byte. O WhatsApp mostra "áudio
// não disponível" e a API ainda responde 200, marcando o lead como enviado.
// Exports de áudio do WhatsApp (que é o que costuma vir do Drive) têm o `moov`
// no fim. A solução é mover o `moov` pra frente antes de mandar. Não recodifica
// nada: reordena os boxes e corrige as tabelas de offset de chunk, que são
// absolutas em relação ao arquivo.

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
    console.log(`disparo-runner: audio remuxado pra faststart (${bytes.length} bytes)`);
    return toBase64(fixed);
  } catch (e: unknown) {
    console.warn('disparo-runner: falha ao preparar audio, usando a URL crua:', (e as Error).message);
    return mediaUrl;
  }
}

function formatPhone(raw: string): string | null {
  // JID de grupo — passa direto sem reformatar
  if (raw.includes('@g.us')) return raw;
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return d;
  if (d.length === 12 && d.startsWith('55')) return d;
  if (d.length === 11) return '55' + d;
  if (d.length === 10) return '55' + d;
  return null;
}

// Historico de conversa (tabela whatsapp_mensagens) -- alimenta a aba Chat.
// Best-effort: se falhar, so loga. O envio ja aconteceu de verdade neste ponto,
// entao nada aqui pode derrubar o processamento do lead.
//
// Grupo (@g.us) fica de fora de proposito: evo-resposta descarta mensagem de
// grupo no inbound, entao gravar o outbound criaria uma "conversa" que nunca
// pode receber resposta.
async function registrarMensagemEnviada(
  supabase: any,
  phoneComDdi: string,
  conteudo: string,
  messageType: string | null | undefined,
  instanceId: string,
  instancias: { id: string; instance_name: string }[],
  evolutionMessageId: string | null,
): Promise<void> {
  try {
    if (phoneComDdi.includes('@g.us')) return;
    const instanceName = instancias.find(i => i.id === instanceId)?.instance_name ?? null;
    const { error } = await supabase.from('whatsapp_mensagens').insert({
      telefone: toOptOutKey(phoneComDdi),
      direcao: 'enviada',
      conteudo,
      tipo: messageType || 'text',
      origem: 'disparo',
      evolution_instance: instanceName,
      evolution_message_id: evolutionMessageId,
    });
    if (error) console.error('registrarMensagemEnviada:', error.message);
  } catch (e: unknown) {
    console.error('registrarMensagemEnviada falhou:', (e as Error).message);
  }
}

// Chave de opt-out usa o mesmo formato de normalizePhone() em evo-resposta
// (sem DDI 55, 11 digitos) -- formatPhone() acima devolve COM o 55, entao
// precisa converter antes de consultar whatsapp_opt_out.
function toOptOutKey(phoneComDdi: string): string {
  const d = phoneComDdi.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

async function estaOptOut(supabase: any, phoneComDdi: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_opt_out')
    .select('telefone')
    .eq('telefone', toOptOutKey(phoneComDdi))
    .maybeSingle();
  return Boolean(data);
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Confere se o número existe no WhatsApp antes de enviar (checagem síncrona,
 * não depende de webhook). Retorna null se a checagem falhar/endpoint não
 * suportado nessa versão -- nesse caso não bloqueia, segue com o envio normal.
 */
async function checkWhatsappExists(
  inst: { api_url: string; api_key: string; instance_name: string },
  phone: string,
): Promise<boolean | null> {
  if (phone.includes('@g.us')) return true; // grupo -- checagem não se aplica
  const rawBase = (inst.api_url as string).replace(/\/$/, '');
  const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  try {
    const res = await fetch(`${base}/chat/whatsappNumbers/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ numbers: [phone] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : (data?.numbers ?? data?.data ?? []);
    const suffix = phone.slice(-8);
    const entry = list.find((n) => {
      const num = String(n.number ?? n.jid ?? '').replace(/\D/g, '');
      return num.endsWith(suffix);
    }) ?? list[0];
    if (!entry) return null;
    return Boolean(entry.exists);
  } catch {
    return null;
  }
}

async function getAllInstances(
  db: ReturnType<typeof createClient>,
): Promise<Array<{ id: string; api_url: string; api_key: string; instance_name: string }>> {
  const { data: rows } = await db
    .from('evolution_config')
    .select('id, api_url, api_key, instance_name')
    .eq('ativo', true)
    .order('prioridade', { ascending: true });
  return rows ?? [];
}

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
      console.warn(`disparo-runner: falha ao checar conexao de ${inst.instance_name}:`, (e as Error).message);
    }
  }));
  return connected;
}
