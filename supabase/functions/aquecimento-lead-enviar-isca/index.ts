import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron a cada 1-2min: pega leads que terminaram as 4 fases e já passaram do
// horário agendado (isca_agendada_para), escolhe um vendedor ativo em
// rodízio e manda a isca pela instância Evolution DELE (não pelos números
// da empresa que aqueceram o lead) -- dali em diante a conversa é 100%
// humana, fora do CRM.

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

function toE164Digits(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function enviarIsca(
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
    if (msgType === 'text') {
      res = await fetch(`${base}/message/sendText/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, text: texto, delay: 1200 }),
        signal: AbortSignal.timeout(15_000),
      });
    } else if (msgType === 'audio') {
      res = await fetch(`${base}/message/sendWhatsAppAudio/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, audio: mediaUrl, encoding: true, delay: 1200 }),
        signal: AbortSignal.timeout(30_000),
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
    const { data: cfg } = await supabase
      .from('lead_aquecimento_config')
      .select('isca_message_type, isca_texto, isca_media_url')
      .eq('id', 'default')
      .maybeSingle();

    if (!cfg) return ok({ ok: false, error: 'lead_aquecimento_config não encontrada' });

    const { data: vendedores } = await supabase
      .from('lead_aquecimento_vendedores')
      .select('id, usuario_id, evolution_config_id, evolution_config:evolution_config_id(id, api_url, api_key, instance_name, ativo)')
      .eq('ativo', true);

    const vendedoresValidos = (vendedores ?? []).filter((v: any) => v.evolution_config?.ativo);
    if (!vendedoresValidos.length) return ok({ ok: true, processed: 0, aviso: 'nenhum vendedor ativo com instância válida' });

    const { data: leads, error: leadsErr } = await supabase
      .from('lead_aquecimento_leads')
      .select('id, phone, nome, produto')
      .eq('status', 'aguardando_isca')
      .lte('isca_agendada_para', new Date().toISOString())
      .order('isca_agendada_para', { ascending: true })
      .limit(BATCH_SIZE);

    if (leadsErr) throw new Error(`falha ao buscar leads: ${leadsErr.message}`);
    if (!leads?.length) return ok({ ok: true, processed: 0 });

    // Rodízio least-recently-used entre vendedores ativos, pelas iscas já enviadas.
    const { data: usoRecente } = await supabase
      .from('lead_aquecimento_leads')
      .select('vendedor_id')
      .not('vendedor_id', 'is', null)
      .gte('isca_enviada_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const usoCount = new Map<string, number>();
    for (const v of vendedoresValidos) usoCount.set(v.id, 0);
    for (const u of usoRecente ?? []) {
      const id = u.vendedor_id as string;
      usoCount.set(id, (usoCount.get(id) ?? 0) + 1);
    }

    const results: Record<string, unknown>[] = [];

    for (const lead of leads) {
      const ordenados = [...vendedoresValidos].sort((a, b) => (usoCount.get(a.id) ?? 0) - (usoCount.get(b.id) ?? 0));
      const escolhido: any = ordenados[0];
      const evo = escolhido.evolution_config;

      const resultado = await enviarIsca(evo, lead.phone, cfg.isca_message_type, cfg.isca_texto, cfg.isca_media_url);
      const now = new Date().toISOString();

      if (resultado.ok) {
        await supabase.from('lead_aquecimento_leads').update({
          status: 'isca_enviada',
          vendedor_id: escolhido.id,
          isca_enviada_em: now,
          error_msg: null,
        }).eq('id', lead.id);
        usoCount.set(escolhido.id, (usoCount.get(escolhido.id) ?? 0) + 1);

        // Cai pro vendedor em Leads Diretos (tabela `leads`, mesmo Kanban que
        // já mostra os leads do SDR/anúncio, distinguido pela origem).
        const { error: leadInsertErr } = await supabase.from('leads').insert({
          nome: lead.nome || `Lead WhatsApp ${lead.phone.slice(-8)}`,
          telefone: lead.phone,
          whatsapp: lead.phone,
          origem: 'Aquecimento',
          produto: lead.produto || 'direto',
          status: 'novo',
          responsavel_id: escolhido.usuario_id,
          ultima_atividade: now,
        });
        if (leadInsertErr) console.error('aquecimento-lead-enviar-isca: falha ao criar lead em Leads Diretos:', leadInsertErr.message);

        results.push({ lead: lead.id, result: 'enviado', vendedor: escolhido.id });
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
    console.error('aquecimento-lead-enviar-isca error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
