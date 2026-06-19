import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS aberto — Evolution API chama de servidor externo
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits.slice(-11);
}

function extractText(message: Record<string, unknown>): { text: string; tipo: string } {
  if (message.conversation)
    return { text: String(message.conversation), tipo: 'text' };
  if ((message.extendedTextMessage as Record<string, unknown>)?.text)
    return { text: String((message.extendedTextMessage as Record<string, unknown>).text), tipo: 'text' };
  if (message.imageMessage)
    return { text: (message.imageMessage as Record<string, unknown>).caption as string ?? '[imagem]', tipo: 'image' };
  if (message.videoMessage)
    return { text: (message.videoMessage as Record<string, unknown>).caption as string ?? '[vídeo]', tipo: 'video' };
  if (message.audioMessage)
    return { text: '[áudio]', tipo: 'audio' };
  if (message.documentMessage)
    return { text: (message.documentMessage as Record<string, unknown>).fileName as string ?? '[documento]', tipo: 'document' };
  if (message.stickerMessage)
    return { text: '[sticker]', tipo: 'sticker' };
  return { text: '[mensagem]', tipo: 'unknown' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validação de secret opcional
    const webhookSecret = Deno.env.get('EVO_RESPOSTA_SECRET');
    if (webhookSecret) {
      const incoming = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret');
      if (incoming !== webhookSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return ok({ ok: true, skipped: true, reason: 'invalid JSON' });
    }

    const event    = String(body.event ?? body.type ?? '').toLowerCase();
    const instance = String(body.instance ?? body.instanceName ?? '');

    console.log(JSON.stringify({ event, instance, ts: new Date().toISOString() }));

    // Só processa mensagens recebidas
    if (!event.includes('message')) {
      return ok({ ok: true, skipped: true, reason: `event="${event}" ignored` });
    }

    const data = (body.data ?? {}) as Record<string, unknown>;
    const key  = (data.key ?? {}) as Record<string, unknown>;

    const remoteJid = String(key.remoteJid ?? '');
    const fromMe    = Boolean(key.fromMe);

    // Ignora mensagens enviadas por nós ou mensagens de grupo
    if (fromMe)                       return ok({ ok: true, skipped: true, reason: 'fromMe=true' });
    if (remoteJid.includes('@g.us'))  return ok({ ok: true, skipped: true, reason: 'group message' });
    if (!remoteJid)                   return ok({ ok: true, skipped: true, reason: 'no remoteJid' });

    const rawPhone = remoteJid.split('@')[0];
    const phone    = normalizePhone(rawPhone);
    const s8       = phone.slice(-8);

    const message    = (data.message ?? {}) as Record<string, unknown>;
    const { text: mensagem, tipo: mensagemTipo } = extractText(message);

    // Busca leads na planilha pelo sufixo do telefone
    const { data: leads, error: leadsErr } = await supabase
      .from('lancamento_leads')
      .select('id, lancamento_id, whatsapp, nome')
      .filter('whatsapp', 'ilike', `%${s8}`);

    if (leadsErr) {
      console.error('leads query error:', leadsErr.message);
      return ok({ ok: false, error: leadsErr.message });
    }

    if (!leads?.length) {
      console.log(`phone suffix ${s8} not found in lancamento_leads — ignoring`);
      return ok({ ok: true, skipped: true, reason: 'phone not in planilha' });
    }

    const now = new Date().toISOString();
    const saved: string[] = [];

    for (const lead of leads) {
      // Salva histórico
      const { error: insertErr } = await supabase.from('lead_respostas').insert({
        lead_id:            lead.id,
        lancamento_id:      lead.lancamento_id,
        phone,
        mensagem,
        mensagem_tipo:      mensagemTipo,
        evolution_instance: instance,
        recebido_em:        now,
      });

      if (insertErr) {
        console.error(`insert resposta lead=${lead.id}:`, insertErr.message);
        continue;
      }

      // Atualiza última resposta no lead
      await supabase.from('lancamento_leads').update({
        ultima_resposta_at: now,
        ultima_resposta:    mensagem.slice(0, 500),
      }).eq('id', lead.id);

      console.log(`resposta salva lead=${lead.id} nome="${lead.nome}" phone=${phone}`);
      saved.push(lead.id);
    }

    return ok({ ok: true, saved: saved.length, leads: saved });

  } catch (e: unknown) {
    console.error('evo-resposta fatal:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
