/**
 * webinario-track
 * Endpoint publico de tracking comportamental da sala ao vivo (enter,
 * heartbeat, cta, offer). watch_stage so avanca, nunca volta -- mesma
 * regra do prototipo original (E:\webnar-idm).
 *
 * Quando o lead chega em 'cta_seen' (viu o pitch), faz o handoff pro
 * funil comercial existente: leads.status='interessado' + atribuicao de
 * vendedor via rodizio (mesmo mecanismo de time-comercial-atribuir-vendedor,
 * canal 'Webinario', hoje so a Helen -- mesma lista/motivo documentado la).
 *
 * Body: { trackingId, evento: 'enter'|'heartbeat'|'cta'|'offer',
 *         currentSecond?, totalSeconds? }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mesma lista/motivo de time-comercial-atribuir-vendedor: Miguel saiu do
// time (set/2026), so a Helen no rodizio por enquanto.
const VENDEDORES_WEBINARIO = [
  { nome: 'Helen Magna', telefone: '5511965781940' },
] as const;

const ORDEM_ESTAGIOS = [
  'registered', 'entered', 'watched_25', 'watched_50', 'watched_75',
  'completed', 'cta_seen', 'offer_clicked',
] as const;
type Estagio = typeof ORDEM_ESTAGIOS[number];

function maiorEstagio(atual: Estagio, alvo: Estagio): Estagio {
  return ORDEM_ESTAGIOS.indexOf(alvo) > ORDEM_ESTAGIOS.indexOf(atual) ? alvo : atual;
}

function estagioPorPercentual(pct: number): Estagio | null {
  if (pct >= 1) return 'completed';
  if (pct >= 0.75) return 'watched_75';
  if (pct >= 0.5) return 'watched_50';
  if (pct >= 0.25) return 'watched_25';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);

  let entrada: Record<string, unknown>;
  try {
    entrada = await req.json();
  } catch {
    return json({ ok: false, erro: 'corpo invalido' }, 400);
  }

  const trackingId = typeof entrada.trackingId === 'string' ? entrada.trackingId : null;
  const evento = typeof entrada.evento === 'string' ? entrada.evento : null;
  if (!trackingId || !evento) return json({ ok: false, erro: 'trackingId e evento sao obrigatorios' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: tracking, error: errTracking } = await supabase
    .from('webinario_tracking')
    .select('id, lead_id, watch_stage, entered_at')
    .eq('id', trackingId)
    .maybeSingle();

  if (errTracking || !tracking) return json({ ok: false, erro: 'tracking nao encontrado' }, 404);

  const atual = tracking.watch_stage as Estagio;
  let novoEstagio: Estagio = atual;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (evento === 'enter') {
    novoEstagio = maiorEstagio(atual, 'entered');
    if (!tracking.entered_at) update.entered_at = new Date().toISOString();
  } else if (evento === 'heartbeat') {
    const currentSecond = Number(entrada.currentSecond ?? 0);
    const totalSeconds = Number(entrada.totalSeconds ?? 0);
    update.current_second = currentSecond;
    update.total_seconds = totalSeconds || null;
    if (totalSeconds > 0) {
      const alvo = estagioPorPercentual(currentSecond / totalSeconds);
      if (alvo) novoEstagio = maiorEstagio(atual, alvo);
    }
  } else if (evento === 'cta') {
    novoEstagio = maiorEstagio(atual, 'cta_seen');
  } else if (evento === 'offer') {
    novoEstagio = maiorEstagio(atual, 'offer_clicked');
  } else {
    return json({ ok: false, erro: 'evento invalido' }, 400);
  }

  update.watch_stage = novoEstagio;

  const { error: errUpdate } = await supabase
    .from('webinario_tracking')
    .update(update)
    .eq('id', trackingId);

  if (errUpdate) {
    console.error('webinario-track: falha ao atualizar tracking', errUpdate);
    return json({ ok: false, erro: 'nao foi possivel atualizar' }, 500);
  }

  // Handoff pro funil comercial: so na TRANSICAO pra cta_seen (nao em todo
  // heartbeat que ja esta em cta_seen pra frente).
  const cruzouParaInteresse =
    ORDEM_ESTAGIOS.indexOf(novoEstagio) >= ORDEM_ESTAGIOS.indexOf('cta_seen') &&
    ORDEM_ESTAGIOS.indexOf(atual) < ORDEM_ESTAGIOS.indexOf('cta_seen');

  if (cruzouParaInteresse) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, vendedor')
      .eq('id', tracking.lead_id)
      .maybeSingle();

    if (lead && lead.status !== 'interessado') {
      await supabase.from('leads').update({ status: 'interessado' }).eq('id', lead.id);
    }

    if (lead && !lead.vendedor) {
      const { data: idx } = await supabase.rpc('time_comercial_proximo_indice', {
        p_canal: 'Webinario',
        p_total: VENDEDORES_WEBINARIO.length,
      });
      if (idx !== null && idx !== undefined) {
        const escolhido = VENDEDORES_WEBINARIO[Number(idx) % VENDEDORES_WEBINARIO.length];
        await supabase.from('leads').update({ vendedor: escolhido.nome }).eq('id', lead.id).is('vendedor', null);
      }
    }
  }

  return json({ ok: true, watchStage: novoEstagio });
});
