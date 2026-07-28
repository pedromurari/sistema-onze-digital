import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron a cada poucos minutos: reivindica jobs de aquecimento vencidos e
// envia via Evolution API direto (não delega ao wpp-enviar, que troca de
// instância em caso de falha -- quebraria a identidade do remetente que o
// aquecimento depende). Guarda o id da mensagem devolvido pra casar com o
// ACK que chega depois via webhook (evo-resposta).

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

// Lote pequeno de propósito: o espaçamento "humano" entre mensagens já vem
// dos horários planejados (aquecimento-planejar-dia gera sessões com
// intervalo realista) + do cron rodando a cada 1 min. Este batch é só uma
// rede de segurança pra atraso/reprocessamento, não o mecanismo de espaçamento.
const BATCH_SIZE = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth: Bearer JWT (UI, botão "Rodar agora") ou x-cron-key (pg_cron) -- mesmo padrão de funil-processar
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
      .from('aquecimento_config')
      .select('max_errors_seq')
      .eq('id', 'default')
      .maybeSingle();

    const maxErrorSeq = cfg?.max_errors_seq ?? 5;

    const { data: dueJobs, error: dueErr } = await supabase
      .from('aquecimento_jobs')
      .select('*')
      .eq('status', 'pendente')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (dueErr) throw new Error(`falha ao buscar jobs: ${dueErr.message}`);
    if (!dueJobs?.length) return ok({ ok: true, processed: 0 });

    const results: Record<string, unknown>[] = [];

    for (const job of dueJobs) {
      // Claim atômico -- evita double-send se o cron sobrepõe
      const { data: claimed } = await supabase
        .from('aquecimento_jobs')
        .update({ status: 'enviando' })
        .eq('id', job.id)
        .eq('status', 'pendente')
        .select('*');

      if (!claimed?.length) continue; // outra execução já pegou

      const result = await processarJob(supabase, claimed[0], maxErrorSeq);
      results.push(result);

      // Jitter anti-flood curto entre envios do MESMO tick -- não é o
      // espaçamento "de conversa" (esse já vem dos horários planejados),
      // só evita duas chamadas HTTP em sequência imediata quando mais de
      // um job vence ao mesmo tempo.
      const jitterSec = 2 + Math.random() * 3;
      await new Promise(r => setTimeout(r, jitterSec * 1000));
    }

    return ok({ ok: true, processed: results.length, results });

  } catch (e: unknown) {
    console.error('aquecimento-worker error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});

async function processarJob(
  supabase: ReturnType<typeof createClient>,
  job: Record<string, unknown>,
  maxErrorSeq: number,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  const { data: chipOrigem } = await supabase
    .from('aquecimento_chips')
    .select('id, evolution_config_id, numero_whatsapp, status, consecutive_errors, enviados_hoje')
    .eq('id', job.chip_origem_id as string)
    .maybeSingle();

  if (!chipOrigem || chipOrigem.status === 'pausado') {
    await supabase.from('aquecimento_jobs').update({
      status: 'erro', error_msg: 'chip origem pausado/inexistente', done_at: now,
    }).eq('id', job.id as string);
    return { job: job.id, result: 'erro', reason: 'chip pausado' };
  }

  const { data: evo } = await supabase
    .from('evolution_config')
    .select('api_url, api_key, instance_name')
    .eq('id', chipOrigem.evolution_config_id as string)
    .maybeSingle();

  if (!evo) {
    await marcarErro(supabase, job, chipOrigem, maxErrorSeq, 'instância evolution não encontrada');
    return { job: job.id, result: 'erro', reason: 'instância não encontrada' };
  }

  let numeroDestino = '';
  if (job.tipo === 'dm') {
    const { data: chipDestino } = await supabase
      .from('aquecimento_chips')
      .select('numero_whatsapp')
      .eq('id', job.chip_destino_id as string)
      .maybeSingle();
    numeroDestino = (chipDestino?.numero_whatsapp as string ?? '').replace(/\D/g, '');
  } else {
    const { data: grupo } = await supabase
      .from('aquecimento_grupos')
      .select('grupo_jid')
      .eq('id', job.grupo_id as string)
      .maybeSingle();
    numeroDestino = (grupo?.grupo_jid as string) ?? '';
  }

  if (!numeroDestino) {
    await marcarErro(supabase, job, chipOrigem, maxErrorSeq, 'destino sem número/jid');
    return { job: job.id, result: 'erro', reason: 'destino inválido' };
  }

  const base = baseUrl(evo.api_url as string);
  const headers = { 'Content-Type': 'application/json', apikey: evo.api_key as string };

  try {
    const res = await fetch(`${base}/message/sendText/${evo.instance_name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: numeroDestino, text: job.mensagem_texto, delay: 1200 }),
      signal: AbortSignal.timeout(15_000),
    });

    const rawText = await res.text();
    if (!res.ok) throw new Error(`Evolution ${res.status}: ${rawText.slice(0, 200)}`);

    let json: any = {};
    try { json = JSON.parse(rawText); } catch { /* resposta sem corpo json */ }
    const evolutionMessageId = json?.key?.id ?? json?.data?.key?.id ?? null;

    await supabase.from('aquecimento_jobs').update({
      status: 'enviado', done_at: now, error_msg: null, evolution_message_id: evolutionMessageId,
    }).eq('id', job.id as string);

    await supabase.from('aquecimento_chips').update({
      enviados_hoje: (chipOrigem.enviados_hoje as number ?? 0) + 1,
      consecutive_errors: 0,
    }).eq('id', chipOrigem.id as string);

    // Marca como lida no chip destino (melhor esforço, não-crítico) -- só faz
    // sentido pra DM (grupo tem vários membros, ambíguo quem "leu").
    if (job.tipo === 'dm' && evolutionMessageId) {
      marcarComoLidaNoDestino(supabase, job, chipOrigem.numero_whatsapp as string, evolutionMessageId).catch(() => {});
    }

    return { job: job.id, result: 'enviado' };

  } catch (e: unknown) {
    await marcarErro(supabase, job, chipOrigem, maxErrorSeq, (e as Error).message);
    return { job: job.id, result: 'erro', reason: (e as Error).message };
  }
}

async function marcarErro(
  supabase: ReturnType<typeof createClient>,
  job: Record<string, unknown>,
  chipOrigem: Record<string, unknown>,
  maxErrorSeq: number,
  motivo: string,
) {
  const now = new Date().toISOString();
  await supabase.from('aquecimento_jobs').update({
    status: 'erro', error_msg: motivo, done_at: now,
  }).eq('id', job.id as string);

  const newErrors = (chipOrigem.consecutive_errors as number ?? 0) + 1;
  await supabase.from('aquecimento_chips').update({
    consecutive_errors: newErrors,
    ...(newErrors >= maxErrorSeq ? { status: 'pausado' } : {}),
  }).eq('id', chipOrigem.id as string);
}

// Melhor esforço: pede pro chip destino marcar a mensagem recebida como
// lida, pro lado do WhatsApp registrar o ACK "lido" (e a troca ficar mais
// parecida com uso real). Não-crítico -- se falhar, o job já foi marcado
// como enviado e o ACK "entregue"/"lido" real ainda chega depois via
// webhook (evo-resposta), independente disso funcionar ou não.
// Nome exato do endpoint/shape a confirmar contra a versão instalada da
// Evolution API (mesma ressalva já registrada no plano).
async function marcarComoLidaNoDestino(
  supabase: ReturnType<typeof createClient>,
  job: Record<string, unknown>,
  numeroOrigem: string,
  evolutionMessageId: string,
) {
  const { data: chipDestino } = await supabase
    .from('aquecimento_chips')
    .select('evolution_config_id')
    .eq('id', job.chip_destino_id as string)
    .maybeSingle();
  if (!chipDestino) return;

  const { data: evoDestino } = await supabase
    .from('evolution_config')
    .select('api_url, api_key, instance_name')
    .eq('id', chipDestino.evolution_config_id as string)
    .maybeSingle();
  if (!evoDestino) return;

  const base = baseUrl(evoDestino.api_url as string);
  const headers = { 'Content-Type': 'application/json', apikey: evoDestino.api_key as string };
  // Do lado do destino, a mensagem chegou DE numeroOrigem -- remoteJid é o
  // número de quem mandou, fromMe=false porque o destino recebeu, não enviou.
  const remoteJid = `${numeroOrigem.replace(/\D/g, '')}@s.whatsapp.net`;
  const body = { readMessages: [{ remoteJid, fromMe: false, id: evolutionMessageId }] };

  try {
    const res = await fetch(`${base}/chat/markMessageAsRead/${evoDestino.instance_name}`, {
      method: 'PUT', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      await fetch(`${base}/chat/markMessageAsRead/${evoDestino.instance_name}`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      });
    }
  } catch { /* cosmético, não crítico */ }
}
