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

    // ── Aquecimento de chips: ACK de entrega/leitura ──────────────────────────
    // Shape não documentado pela Evolution neste repo (greenfield) -- best
    // effort com múltiplos fallbacks, validar contra o payload real de teste.
    if (event === 'messages.update' || event === 'message.update') {
      console.log('RAW messages.update:', JSON.stringify(body).slice(0, 2000));
      return await handleMessagesUpdate(supabase, body);
    }

    // ── Aquecimento de chips: estabilidade de conexão ─────────────────────────
    if (event === 'connection.update') {
      return await handleConnectionUpdate(supabase, instance, body);
    }

    // Só processa mensagens recebidas (upsert)
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

    const now = new Date().toISOString();

    // Busca leads na planilha pelo sufixo do telefone. Nao retorna cedo se nao
    // achar nada aqui -- um lead que so existe em disparo_leads (CSV, turma,
    // grupo de WPP) nunca teria linha em lancamento_leads, e antes isso fazia
    // a funcao inteira parar antes mesmo de checar disparo_leads.
    const { data: leads, error: leadsErr } = await supabase
      .from('lancamento_leads')
      .select('id, lancamento_id, whatsapp, nome')
      .filter('whatsapp', 'ilike', `%${s8}`);

    if (leadsErr) {
      console.error('leads query error:', leadsErr.message);
      return ok({ ok: false, error: leadsErr.message });
    }

    const saved: string[] = [];

    for (const lead of leads ?? []) {
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

    // Marca como quente e grava a resposta em disparo_leads para qualquer
    // campanha que tenha esse telefone (mesmo sufixo dos ultimos 8 digitos).
    // Alimenta a tela de Campanhas de Disparo -- "respondeu_em"/"ultima_resposta"
    // e' o que faz a coluna de resposta aparecer la, independente do lead
    // tambem existir em lancamento_leads ou nao.
    const { data: disparoLeads } = await supabase
      .from('disparo_leads')
      .select('id, phone, temperatura')
      .filter('phone', 'ilike', `%${s8}`);

    if (disparoLeads?.length) {
      const ids = disparoLeads.map((l: { id: string }) => l.id);
      await supabase
        .from('disparo_leads')
        .update({ temperatura: 'quente', respondeu_em: now, ultima_resposta: mensagem.slice(0, 500) })
        .in('id', ids);
      console.log(`resposta gravada em ${ids.length} disparo_leads para phone suffix=${s8}`);
    }

    // Mesma lógica pros logs de boas-vindas (Semana do Despertar + IDM Pelo
    // Brasil, ambos gravam em boas_vindas_logs) -- alimenta a coluna de
    // resposta na tela de Boas-vindas, independente do funil de origem.
    const { data: bvLogs } = await supabase
      .from('boas_vindas_logs')
      .select('id, whatsapp')
      .filter('whatsapp', 'ilike', `%${s8}`);

    if (bvLogs?.length) {
      const ids = bvLogs.map((l: { id: string }) => l.id);
      await supabase
        .from('boas_vindas_logs')
        .update({ respondeu_em: now, ultima_resposta: mensagem.slice(0, 500) })
        .in('id', ids);
      console.log(`resposta gravada em ${ids.length} boas_vindas_logs para phone suffix=${s8}`);
    }

    if (!saved.length && !disparoLeads?.length && !bvLogs?.length) {
      console.log(`phone suffix ${s8} not found in lancamento_leads, disparo_leads nem boas_vindas_logs — ignoring`);
      return ok({ ok: true, skipped: true, reason: 'phone not found' });
    }

    return ok({
      ok: true,
      saved: saved.length,
      leads: saved,
      disparoLeadsAtualizados: disparoLeads?.length ?? 0,
      boasVindasLogsAtualizados: bvLogs?.length ?? 0,
    });

  } catch (e: unknown) {
    console.error('evo-resposta fatal:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

// ── ACK (messages.update): casa com aquecimento_jobs.evolution_message_id ────
// Status Baileys/Evolution: 0=erro, 1=pendente, 2=servidor, 3=entregue, 4=lido, 5=tocado
function ackStatusFromNumero(status: number | undefined): 'entregue' | 'lido' | 'falhou' | null {
  if (status === undefined || status === null) return null;
  if (status <= 0) return 'falhou';
  if (status >= 4) return 'lido';
  if (status === 3) return 'entregue';
  return null; // pendente/servidor ainda não é sinal suficiente
}

async function handleMessagesUpdate(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const data = body.data ?? {};
  const updates = Array.isArray(data) ? data : [data];
  let atualizados = 0;

  for (const upd of updates as Record<string, unknown>[]) {
    const key = (upd.key ?? {}) as Record<string, unknown>;
    const messageId = String(key.id ?? upd.keyId ?? upd.id ?? '');
    if (!messageId) continue;

    const statusRaw = (upd.update as Record<string, unknown>)?.status ?? upd.status;
    const statusNum = typeof statusRaw === 'number' ? statusRaw : Number(statusRaw);
    const ackStatus = ackStatusFromNumero(Number.isFinite(statusNum) ? statusNum : undefined);
    if (!ackStatus) continue;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { ack_status: ackStatus };
    if (ackStatus === 'entregue') patch.entregue_em = now;
    if (ackStatus === 'lido') patch.lido_em = now;

    const { data: updated } = await supabase
      .from('aquecimento_jobs')
      .update(patch)
      .eq('evolution_message_id', messageId)
      .select('id');

    if (updated?.length) atualizados += updated.length;

    const { data: updatedDisparo } = await supabase
      .from('disparo_leads')
      .update(patch)
      .eq('evolution_message_id', messageId)
      .select('id');

    if (updatedDisparo?.length) atualizados += updatedDisparo.length;
  }

  return ok({ ok: true, tipo: 'messages.update', atualizados });
}

// ── Conexão (connection.update): histórico de estabilidade por instância ────
async function handleConnectionUpdate(
  supabase: ReturnType<typeof createClient>,
  instance: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!instance) return ok({ ok: true, skipped: true, reason: 'connection.update sem instance' });

  const data = (body.data ?? {}) as Record<string, unknown>;
  const state = String(
    data.state ?? (data.instance as Record<string, unknown>)?.state ?? data.connection ?? '',
  ).toLowerCase();
  if (!state) return ok({ ok: true, skipped: true, reason: 'connection.update sem state' });

  const { data: evoConfig } = await supabase
    .from('evolution_config')
    .select('id')
    .eq('instance_name', instance)
    .maybeSingle();

  await supabase.from('evolution_conexao_eventos').insert({
    evolution_config_id: evoConfig?.id ?? null,
    instance_name: instance,
    state,
  });

  return ok({ ok: true, tipo: 'connection.update', instance, state });
}
