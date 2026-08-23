import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cron a cada poucos minutos: para cada lead do Time Comercial que não é o dono
// de ninguém (não tem `followup_pausado`), acha a sequência de follow-up do
// vendedor dele que casa com produto/lançamento, e manda o próximo passo se o
// lead está sem responder há tempo suficiente — pela instância Evolution DO
// VENDEDOR (mesmo padrão de `aquecimento-lead-enviar-isca`), não por número
// da empresa.
//
// Gatilho é "sem resposta", não "tempo parado na fase": só dispara se a última
// mensagem trocada com o lead foi ENVIADA (por humano ou por um passo anterior
// deste mesmo follow-up) e já passou `intervalo_horas` daquele envio sem o lead
// responder.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function baseUrl(rawApiUrl: string): string {
  const raw = rawApiUrl.replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

// Mesma normalização de src/lib/chat-utils.ts (normalizePhone) — telefone sem
// DDI, últimos 11 dígitos, pra bater com `whatsapp_mensagens.telefone`.
function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

const BATCH_SIZE = 30;
const HORAS_MS = 60 * 60 * 1000;

type Passo = {
  id: string; sequencia_id: string; ordem: number; intervalo_horas: number;
  tipo_midia: string; texto: string | null; media_url: string | null;
};
type Sequencia = {
  id: string; vendedor_id: string; produto: string | null;
  lancamento_id: string | null; npa_evento_id: string | null; ativo: boolean;
};
type Lead = {
  id: string; nome: string | null; telefone: string | null; whatsapp: string | null;
  vendedor: string | null; produto: string | null; lancamento_id: string | null; status: string | null;
  followup_pausado: boolean; followup_sequencia_id: string | null;
  followup_passo_atual: number; followup_ultimo_envio: string | null;
};

async function enviar(
  evo: { api_url: string; api_key: string; instance_name: string },
  phone: string,
  tipoMidia: string,
  texto: string,
  mediaUrl: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = baseUrl(evo.api_url);
  const headers = { 'Content-Type': 'application/json', apikey: evo.api_key };
  const instPath = encodeURIComponent(evo.instance_name);
  const number = phone;

  try {
    let res: Response;
    if (tipoMidia === 'texto') {
      res = await fetch(`${base}/message/sendText/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, text: texto, delay: 1200 }),
        signal: AbortSignal.timeout(15_000),
      });
    } else if (tipoMidia === 'audio') {
      res = await fetch(`${base}/message/sendWhatsAppAudio/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, audio: mediaUrl, encoding: true, delay: 1200 }),
        signal: AbortSignal.timeout(30_000),
      });
    } else {
      // imagem, imagem_legenda, video — sendMedia com mediatype apropriado.
      const mediatype = tipoMidia === 'video' ? 'video' : 'image';
      res = await fetch(`${base}/message/sendMedia/${instPath}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, mediatype, media: mediaUrl, caption: texto || undefined, delay: 1200 }),
        signal: AbortSignal.timeout(20_000),
      });
    }
    const rawText = await res.text();
    if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${rawText.slice(0, 200)}` };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Sequência mais específica primeiro: lançamento/NPA > produto > geral. */
function especificidade(s: Sequencia): number {
  if (s.lancamento_id || s.npa_evento_id) return 2;
  if (s.produto) return 1;
  return 0;
}

function sequenciaCasa(s: Sequencia, lead: Lead): boolean {
  if (s.produto && s.produto !== lead.produto) return false;
  if (s.lancamento_id && s.lancamento_id !== lead.lancamento_id) return false;
  // npa_evento_id não tem coluna correspondente em `leads` (leads do Time Comercial
  // não vêm de NPA) — sequência com esse filtro só serve leads de origem NPA, que
  // este cron não processa hoje.
  if (s.npa_evento_id) return false;
  return true;
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
    const { data: sequenciasRaw } = await supabase
      .from('followup_sequencias' as any)
      .select('id, vendedor_id, produto, lancamento_id, npa_evento_id, ativo')
      .eq('ativo', true);
    const sequencias = (sequenciasRaw ?? []) as Sequencia[];
    if (!sequencias.length) return ok({ ok: true, processed: 0, aviso: 'nenhuma sequência ativa' });

    const { data: passosRaw } = await supabase
      .from('followup_passos' as any)
      .select('id, sequencia_id, ordem, intervalo_horas, tipo_midia, texto, media_url')
      .in('sequencia_id', sequencias.map(s => s.id))
      .order('ordem', { ascending: true });
    const passos = (passosRaw ?? []) as Passo[];
    const passosPorSequencia = new Map<string, Passo[]>();
    for (const p of passos) {
      const arr = passosPorSequencia.get(p.sequencia_id) ?? [];
      arr.push(p);
      passosPorSequencia.set(p.sequencia_id, arr);
    }

    // Instância Evolution de cada vendedor (mesmo vínculo do Chat do Time Comercial).
    const { data: vendedoresRaw } = await supabase
      .from('lead_aquecimento_vendedores' as any)
      .select('usuario_id, evolution_config:evolution_config_id(api_url, api_key, instance_name, ativo)');
    const evoPorVendedor = new Map<string, { api_url: string; api_key: string; instance_name: string }>();
    for (const v of (vendedoresRaw ?? []) as any[]) {
      if (v.evolution_config?.ativo) evoPorVendedor.set(v.usuario_id, v.evolution_config);
    }

    // Nome de cada vendedor, pra casar com `leads.vendedor` (texto livre) além do
    // `responsavel_id` — o funil do Time Comercial ainda gira em cima do nome.
    const { data: profilesRaw } = await supabase
      .from('profiles' as any)
      .select('id, nome')
      .in('id', sequencias.map(s => s.vendedor_id));
    const nomePorVendedor = new Map<string, string>();
    for (const p of (profilesRaw ?? []) as any[]) nomePorVendedor.set(p.id, p.nome);

    const { data: leadsRaw, error: leadsErr } = await supabase
      .from('leads' as any)
      .select('id, nome, telefone, whatsapp, vendedor, produto, lancamento_id, status, responsavel_id, followup_pausado, followup_sequencia_id, followup_passo_atual, followup_ultimo_envio')
      .eq('origem', 'Time Comercial')
      .eq('followup_pausado', false)
      .neq('status', 'matricula')
      .limit(500);
    if (leadsErr) throw new Error(`falha ao buscar leads: ${leadsErr.message}`);

    const results: Record<string, unknown>[] = [];
    let enviados = 0;

    for (const lead of (leadsRaw ?? []) as any[]) {
      if (enviados >= BATCH_SIZE) break;

      // Vendedor do lead: por responsavel_id (conta real) ou, na falta, pelo nome
      // em `vendedor` — as duas formas convivem no funil hoje.
      const vendedorId = sequencias.find(s =>
        s.vendedor_id === lead.responsavel_id || nomePorVendedor.get(s.vendedor_id) === lead.vendedor,
      )?.vendedor_id;
      if (!vendedorId) continue;

      const evo = evoPorVendedor.get(vendedorId);
      if (!evo) continue; // vendedor sem WhatsApp conectado — nada a fazer

      const candidatas = sequencias.filter(s => s.vendedor_id === vendedorId && sequenciaCasa(s, lead));
      if (!candidatas.length) continue;
      candidatas.sort((a, b) => especificidade(b) - especificidade(a));
      const sequencia = candidatas[0];

      // Lead trocou de sequência aplicável (ex.: mudou de produto) — reinicia o progresso.
      let passoAtual = lead.followup_passo_atual ?? 0;
      if (lead.followup_sequencia_id !== sequencia.id) {
        passoAtual = 0;
      }

      const passosDaSequencia = passosPorSequencia.get(sequencia.id) ?? [];
      const proximoPasso = passosDaSequencia.find(p => p.ordem === passoAtual + 1);
      if (!proximoPasso) continue; // sequência esgotada pra esse lead

      const telefone = normalizePhone(lead.whatsapp || lead.telefone);
      if (!telefone) continue;

      const { data: ultimasMsgs } = await supabase
        .from('whatsapp_mensagens' as any)
        .select('direcao, created_at')
        .eq('telefone', telefone)
        .order('created_at', { ascending: false })
        .limit(1);
      const ultima = (ultimasMsgs ?? [])[0] as { direcao: string; created_at: string } | undefined;

      // Só segue follow-up se a ÚLTIMA troca foi uma mensagem enviada (sem resposta
      // do lead depois dela) — se o lead respondeu por último, a conversa virou
      // manual e o automático para de avançar.
      if (!ultima || ultima.direcao !== 'enviada') continue;

      const referencia = new Date(ultima.created_at).getTime();
      const horasSemResposta = (Date.now() - referencia) / HORAS_MS;
      if (horasSemResposta < proximoPasso.intervalo_horas) continue;

      const resultado = await enviar(evo, telefone, proximoPasso.tipo_midia, proximoPasso.texto ?? '', proximoPasso.media_url);
      const now = new Date().toISOString();

      if (resultado.ok) {
        await supabase.from('whatsapp_mensagens' as any).insert({
          telefone,
          direcao: 'enviada',
          origem: 'followup_vendedor',
          tipo: proximoPasso.tipo_midia,
          conteudo: proximoPasso.texto || (proximoPasso.tipo_midia === 'audio' ? '[Áudio]' : proximoPasso.tipo_midia === 'video' ? '[Vídeo]' : '[Imagem]'),
          evolution_instance: evo.instance_name,
        });
        await supabase.from('leads' as any).update({
          followup_sequencia_id: sequencia.id,
          followup_passo_atual: proximoPasso.ordem,
          followup_ultimo_envio: now,
        }).eq('id', lead.id);
        enviados++;
        results.push({ lead: lead.id, passo: proximoPasso.ordem, result: 'enviado' });
      } else {
        results.push({ lead: lead.id, passo: proximoPasso.ordem, result: 'erro', reason: resultado.error });
      }

      const jitterSec = 2 + Math.random() * 3;
      await new Promise(r => setTimeout(r, jitterSec * 1000));
    }

    return ok({ ok: true, processed: results.length, results });

  } catch (e: unknown) {
    console.error('followup-vendedor-enviar error:', (e as Error).message);
    return ok({ ok: false, error: (e as Error).message });
  }
});
