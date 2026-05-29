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
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
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
          .select('api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });
        const evoInstancesQS = (evoRowsQS ?? []).map((inst: { api_url: string; instance_name: string; api_key: string }) => {
          const rawBase = inst.api_url.replace(/\/$/, '');
          return { base: /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`, instance: inst.instance_name, apikey: inst.api_key };
        });

        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', body.funnel_name ?? '')
          .maybeSingle();

        let lastErr: Error | null = null;
        for (const { base, instance, apikey } of evoInstancesQS) {
          try {
            await processMessage(body, base, instance, apikey, supabase, funnelCfg);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e as Error;
            console.warn(`funil-processar: instância ${instance} falhou:`, (e as Error).message);
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
    const now    = new Date();
    const window = new Date(now.getTime() + 6 * 60 * 1000); // próximos 6 min (cron a cada 5min)

    // EARLY EXIT: COUNT barato antes de buscar dados ou abrir conexão com Evolution
    const { count } = await supabase
      .from('funnel_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .lte('scheduled_at', window.toISOString());

    if (!count) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só busca Evolution config se há mensagens para enviar
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    if (!evoRows?.length) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada ou sem instâncias ativas' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evoInstances = evoRows.map((inst: { api_url: string; instance_name: string; api_key: string }) => {
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
      .lte('scheduled_at', window.toISOString())
      .order('scheduled_at', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!pending?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    for (const msg of pending) {
      try {
        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', msg.funnel_name)
          .maybeSingle();

        let lastErr: Error | null = null;
        for (const { base, instance, apikey } of evoInstances) {
          try {
            await processMessage(msg, base, instance, apikey, supabase, funnelCfg);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e as Error;
            console.warn(`funil-processar: instância ${instance} falhou:`, (e as Error).message);
          }
        }
        if (lastErr) throw lastErr;

        await supabase
          .from('funnel_messages')
          .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
          .eq('id', msg.id);

        processed++;
        // Pequena pausa entre mensagens para não sobrecarregar a API
        await new Promise(r => setTimeout(r, 1500));
      } catch (e: unknown) {
        await supabase
          .from('funnel_messages')
          .update({ status: 'error', error_message: (e as Error).message })
          .eq('id', msg.id);
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
  const imgRes = await fetch(cdnUrl, { redirect: 'follow' });
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

  // ── Imagem de cabeçalho ───────────────────────────────────────────────────
  const msgType = (p.message_type as string) ?? 'text';
  const headerSubtipo = (p.subtipo as string) ?? '';
  const scheduledAt = (p.scheduled_at as string) ?? new Date().toISOString();

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

      await sendEvolution(`${base}/message/sendMedia/${instance}`, {
        number,
        mediatype: 'image',
        media: headerUrl,
        delay: 1200,
      }, apikey);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // ── Mensagem principal ────────────────────────────────────────────────────
  switch (msgType) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document': {
      const mediaUrl = applyVars(p.media_url as string, vars);
      await sendEvolution(`${base}/message/sendMedia/${instance}`, {
        number,
        mediatype: msgType,
        media: mediaUrl,
        caption: applyVars(p.message_text as string, vars) || undefined,
        delay: 1200,
        mentionsEveryOne: (p.mention_everyone as boolean) ?? false,
      }, apikey);
      break;
    }

    case 'poll': {
      await sendEvolution(`${base}/message/sendPoll/${instance}`, {
        number,
        name: (p.poll_name as string) || 'Enquete',
        selectableCount: (p.poll_selectable_count as number) ?? 1,
        values: (p.poll_options as string[]) ?? [],
        delay: 1200,
      }, apikey);
      break;
    }

    default: { // text
      const text = applyVars(p.message_text as string, vars);
      await sendEvolution(`${base}/message/sendText/${instance}`, {
        number,
        text,
        linkPreview: (p.link_preview as boolean) ?? false,
        mentionsEveryOne: (p.mention_everyone as boolean) ?? false,
        delay: 1200,
      }, apikey);
      break;
    }
  }
}
