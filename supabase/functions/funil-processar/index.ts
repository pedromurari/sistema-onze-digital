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

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Evolution API config ──────────────────────────────────────────────────
    const { data: evoCfg } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    if (!evoCfg?.api_url || !evoCfg?.api_key || !evoCfg?.instance_name) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBase  = evoCfg.api_url.replace(/\/$/, '');
    const base     = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const apikey   = evoCfg.api_key;
    const instance = evoCfg.instance_name;

    const body = await req.json();

    // ── Quick send (envio imediato pelo UI) ───────────────────────────────────
    if (body.quick_send) {
      try {
        // Carrega config do funil para substituição de variáveis
        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', body.funnel_name ?? '')
          .maybeSingle();

        await processMessage(body, base, instance, apikey, supabase, funnelCfg);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: unknown) {
        // Retorna 200 com erro no body para que o cliente veja a mensagem real
        return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Scheduled batch (chamado pelo pg_cron ou cron externo) ────────────────
    const now    = new Date();
    const window = new Date(now.getTime() + 2 * 60 * 1000); // próximos 2 min

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
        // Carrega config do funil para substituição de variáveis
        const { data: funnelCfg } = await supabase
          .from('funnel_configs')
          .select('*')
          .eq('funnel_name', msg.funnel_name)
          .maybeSingle();

        await processMessage(msg, base, instance, apikey, supabase, funnelCfg);

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

async function updateGroupPicture(
  base: string,
  instance: string,
  apikey: string,
  groupJid: string,
  imageUrl: string,
) {
  try {
    // Busca a imagem e converte para base64
    const imgRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imgRes.ok) {
      console.warn(`updateGroupPicture: falha ao buscar imagem (${imgRes.status})`);
      return;
    }
    const buffer = await imgRes.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mime   = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0];

    const res = await fetch(`${base}/group/updateGroupPicture/${instance}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({ groupJid, image: `data:${mime};base64,${base64}` }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`updateGroupPicture: Evolution ${res.status} — ${txt.slice(0, 200)}`);
    }
  } catch (e: unknown) {
    // Não deixa erro de foto do grupo quebrar o envio da mensagem
    console.warn('updateGroupPicture falhou:', (e as Error).message);
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
  if (p.send_header_image !== false && funnelCfg) {
    const imagens = (funnelCfg.imagens as Record<string, string>) ?? {};
    const subtipo = (p.subtipo as string) ?? '';
    let headerUrl = '';

    if (subtipo && imagens[subtipo]) {
      // Seleção por subtipo (manha, tarde, noite, aula_manha, aula_tarde,
      // contagem_3h/2h/1h, live, provocacao, aula_1/2/3)
      headerUrl = imagens[subtipo];
    } else {
      // Fallback: seleção por horário
      const hour = hourOf((p.scheduled_at as string) ?? new Date().toISOString());
      if      (hour >= 6  && hour < 12) headerUrl = imagens['manha'] || (funnelCfg.imagem_manha as string) || '';
      else if (hour >= 12 && hour < 18) headerUrl = imagens['tarde'] || (funnelCfg.imagem_tarde as string) || '';
      else                              headerUrl = imagens['noite'] || (funnelCfg.imagem_noite as string) || '';
    }

    if (headerUrl) {
      if (number.endsWith('@g.us') && (p.update_group_picture as boolean) === true) {
        await updateGroupPicture(base, instance, apikey, number, headerUrl);
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
  const msgType = (p.message_type as string) ?? 'text';

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
