// Supabase Edge Function: meta-ads
//
// Proxy autenticado para a Meta Marketing API. O token de sistema (META_MARKETING_ACCESS_TOKEN)
// nunca chega ao navegador -- fica só aqui, como secret do projeto.
//
// Ações suportadas (POST { action, ... }):
//   - "listar"           -> lista campanhas da conta com insights dos últimos N dias
//   - "listar_conjuntos" -> lista conjuntos (ad sets) de uma campanha com orçamento/insights (campaign_id)
//   - "atualizar_status" -> pausa/ativa uma campanha OU conjunto (campaign_id = id do objeto, status: 'ACTIVE' | 'PAUSED')
//   - "targeting"        -> lista conjuntos de anuncios de uma campanha com segmentacao (geo, idade, etc)
//   - "contas"           -> lista as contas de anúncio que o token de sistema enxerga
//
// "listar" e "atualizar_status" aceitam `ad_account_id` opcional (ex: "act_123") para
// trocar de conta sem mudar o secret -- se omitido, usa META_ADS_ACCOUNT_ID.
//
// GET simples (sem body) == "listar" com padrão de 7 dias.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const GRAPH_VERSION = 'v21.0';
const META_TOKEN = Deno.env.get('META_MARKETING_ACCESS_TOKEN') ?? '';
const DEFAULT_AD_ACCOUNT_ID = Deno.env.get('META_ADS_ACCOUNT_ID') ?? ''; // ex: act_1460391561359802

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Cotação do dia (sem API key). Falha não quebra a tela -- só não converte.
async function buscarCotacaoParaBRL(moedaOrigem: string): Promise<{ taxa: number; atualizado_em: string } | null> {
  if (moedaOrigem === 'BRL') return null;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${moedaOrigem}`);
    const json = await res.json();
    const taxa = json?.rates?.BRL;
    if (!res.ok || typeof taxa !== 'number') return null;
    return { taxa, atualizado_em: json.time_last_update_utc ?? new Date().toISOString() };
  } catch {
    return null;
  }
}

async function buscarConta(adAccountId: string): Promise<{ id: string; nome: string; moeda: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}?fields=name,currency&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Meta API error (conta): ${JSON.stringify(json)}`);
  return { id: adAccountId, nome: json.name ?? adAccountId, moeda: json.currency ?? 'USD' };
}

async function listarContas() {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts?fields=name,currency,account_status&limit=100&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Meta API error (contas): ${JSON.stringify(json)}`);
  return (json.data ?? []).map((c: any) => ({
    id: c.id,
    nome: c.name,
    moeda: c.currency,
    ativa: c.account_status === 1,
  }));
}

// O que conta como "lead" muda conforme o objetivo da campanha: campanha de
// formulário/pixel reporta `lead`, campanha de Click-to-WhatsApp (objetivo
// ENGAGEMENT/MESSAGES) reporta conversa iniciada. Sem isso, campanha de
// WhatsApp aparecia com "Leads 0" mesmo tendo conversa -- achado real
// 12/11/2026 na campanha "(WPP-HELEN)(LEAD DIRETO) - PÚBLICO FRIO", que
// tinha 13 conversas no Ads Manager e 0 no painel. Ordem = prioridade; pega
// só o PRIMEIRO que existir (somar duplicaria quem reporta mais de um).
const ACOES_LEAD = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
];

type Acao = { action_type: string; value: string };

function acharLead(actions: Acao[], custoPorAcao: Acao[]) {
  for (const tipo of ACOES_LEAD) {
    const achou = actions.find((a) => a.action_type === tipo);
    if (achou) {
      const custo = custoPorAcao.find((a) => a.action_type === tipo)?.value;
      return { leads: Number(achou.value), custo: custo ? Number(custo) : null };
    }
  }
  return { leads: 0, custo: null };
}

type Periodo = { since: string; until: string };

function resolverPeriodo(payload: Record<string, unknown>): Periodo {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const formato = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if (payload.since !== undefined || payload.until !== undefined) {
    const since = String(payload.since ?? '');
    const until = String(payload.until ?? '');
    if (!formato.test(since) || !formato.test(until) || Number.isNaN(Date.parse(since)) || Number.isNaN(Date.parse(until)) || new Date(`${since}T12:00:00Z`).toISOString().slice(0, 10) !== since || new Date(`${until}T12:00:00Z`).toISOString().slice(0, 10) !== until || since > until || until > hoje || Date.parse(until) - Date.parse(since) > 366 * 86400000) {
      throw new Error('Intervalo de datas inválido (máximo de 366 dias, até hoje).');
    }
    return { since, until };
  }
  const dias = Number(payload.dias || 7);
  if (!Number.isInteger(dias) || dias < 1 || dias > 366) throw new Error('Período inválido.');
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - dias + 1);
  return { since: inicio.toISOString().slice(0, 10), until: hoje };
}

async function listarCampanhas(periodo: Periodo, adAccountId: string) {
  const { since, until } = periodo;

  const [conta, cambio] = await Promise.all([
    buscarConta(adAccountId),
    buscarConta(adAccountId).then((c) => buscarCotacaoParaBRL(c.moeda)),
  ]);
  const taxa = cambio?.taxa ?? null;
  const converter = (v: number | null) => (v === null || taxa === null ? null : Math.round(v * taxa * 100) / 100);

  const fields = [
    'id',
    'name',
    'status',
    'effective_status',
    'objective',
    'daily_budget',
    'lifetime_budget',
    `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,reach}`,
  ].join(',');

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}/campaigns` +
    `?fields=${encodeURIComponent(fields)}&limit=100&access_token=${META_TOKEN}`;

  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(json)}`);
  }

  const campanhas = (json.data ?? []).map((c: any) => {
    const insight = c.insights?.data?.[0];
    const actions: Acao[] = insight?.actions ?? [];
    const purchases = actions.find((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value;
    const custoPorAcao: Acao[] = insight?.cost_per_action_type ?? [];
    const { leads, custo: custoPorLeadNum } = acharLead(actions, custoPorAcao);

    const orcamentoDiario = c.daily_budget ? Number(c.daily_budget) / 100 : null;
    const orcamentoTotal = c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null;
    const gasto = insight?.spend ? Number(insight.spend) : 0;

    return {
      id: c.id,
      nome: c.name,
      status: c.status,
      status_efetivo: c.effective_status,
      objetivo: c.objective,
      orcamento_diario: orcamentoDiario,
      orcamento_diario_brl: converter(orcamentoDiario),
      orcamento_total: orcamentoTotal,
      orcamento_total_brl: converter(orcamentoTotal),
      gasto,
      gasto_brl: converter(gasto),
      impressoes: insight?.impressions ? Number(insight.impressions) : 0,
      cliques: insight?.clicks ? Number(insight.clicks) : 0,
      ctr: insight?.ctr ? Number(insight.ctr) : 0,
      cpc: insight?.cpc ? Number(insight.cpc) : 0,
      alcance: insight?.reach ? Number(insight.reach) : 0,
      leads,
      compras: purchases ? Number(purchases) : 0,
      custo_por_lead: custoPorLeadNum,
      custo_por_lead_brl: converter(custoPorLeadNum),
    };
  });

  return {
    periodo,
    conta,
    cambio: taxa !== null ? { moeda_origem: conta.moeda, taxa, atualizado_em: cambio!.atualizado_em } : null,
    campanhas,
  };
}

async function listarConjuntos(campaignId: string, periodo: Periodo, adAccountId: string) {
  if (!campaignId) throw new Error('campaign_id é obrigatório');
  const { since, until } = periodo;

  const conta = await buscarConta(adAccountId);
  const cambio = await buscarCotacaoParaBRL(conta.moeda);
  const taxa = cambio?.taxa ?? null;
  const converter = (v: number | null) => (v === null || taxa === null ? null : Math.round(v * taxa * 100) / 100);

  const fields = [
    'id',
    'name',
    'status',
    'effective_status',
    'daily_budget',
    'lifetime_budget',
    `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,actions,cost_per_action_type}`,
  ].join(',');

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}/adsets` +
    `?fields=${encodeURIComponent(fields)}&limit=200&access_token=${META_TOKEN}`;

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Meta API error (conjuntos): ${JSON.stringify(json)}`);

  const conjuntos = (json.data ?? []).map((c: any) => {
    const insight = c.insights?.data?.[0];
    const actions: Acao[] = insight?.actions ?? [];
    const custoPorAcao: Acao[] = insight?.cost_per_action_type ?? [];
    const { leads, custo: custoPorLeadNum } = acharLead(actions, custoPorAcao);
    const orcamentoDiario = c.daily_budget ? Number(c.daily_budget) / 100 : null;
    const gasto = insight?.spend ? Number(insight.spend) : 0;

    return {
      id: c.id,
      nome: c.name,
      status: c.status,
      status_efetivo: c.effective_status,
      orcamento_diario: orcamentoDiario,
      orcamento_diario_brl: converter(orcamentoDiario),
      orcamento_total: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      gasto,
      gasto_brl: converter(gasto),
      cliques: insight?.clicks ? Number(insight.clicks) : 0,
      leads,
      custo_por_lead: custoPorLeadNum,
      custo_por_lead_brl: converter(custoPorLeadNum),
    };
  });

  return {
    conta,
    cambio: taxa !== null ? { moeda_origem: conta.moeda, taxa, atualizado_em: cambio!.atualizado_em } : null,
    conjuntos,
  };
}

async function atualizarStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED', adAccountId: string) {
  if (!/^\d+$/.test(campaignId ?? '') || !['ACTIVE', 'PAUSED'].includes(status)) {
    throw new Error('campaign_id e status (ACTIVE|PAUSED) são obrigatórios');
  }
  const conferir = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}?fields=id,account_id,status&access_token=${META_TOKEN}`);
  const atual = await conferir.json();
  if (!conferir.ok) throw new Error(`Meta API: ${JSON.stringify(atual)}`);
  if ((String(atual.account_id).startsWith('act_') ? atual.account_id : `act_${atual.account_id}`) !== adAccountId || !['ACTIVE', 'PAUSED'].includes(atual.status)) {
    throw new Error('Campanha/conjunto não pertence à conta selecionada ou não pode ser alterado.');
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}?access_token=${META_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(json)}`);
  }
  return json;
}

async function atualizarOrcamento(id: string, tipo: 'campanha' | 'conjunto', adAccountId: string, centavos: number) {
  if (!/^\d+$/.test(id ?? '') || !['campanha', 'conjunto'].includes(tipo) || !Number.isSafeInteger(centavos) || centavos < 100 || centavos > 10000000) {
    throw new Error('Orçamento diário inválido (entre 1 e 100.000 na moeda da conta).');
  }
  const fields = tipo === 'conjunto' ? 'id,account_id,campaign_id,daily_budget,lifetime_budget' : 'id,account_id,daily_budget,lifetime_budget';
  const consultar = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}?fields=${fields}&access_token=${META_TOKEN}`);
  const atual = await consultar.json();
  if (!consultar.ok) throw new Error(`Meta API: ${JSON.stringify(atual)}`);
  if ((String(atual.account_id).startsWith('act_') ? atual.account_id : `act_${atual.account_id}`) !== adAccountId || (tipo === 'conjunto' && !atual.campaign_id) || (tipo === 'campanha' && atual.campaign_id)) {
    throw new Error('Campanha/conjunto não pertence à conta selecionada.');
  }
  if (!atual.daily_budget) throw new Error('Este orçamento não é diário neste nível. Edite o nível que possui orçamento no Ads Manager.');
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}?access_token=${META_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ daily_budget: String(centavos) }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Meta API: ${JSON.stringify(result)}`);
  return { result, anterior_centavos: Number(atual.daily_budget), novo_centavos: centavos };
}

async function targeting(campaignId: string) {
  if (!campaignId) throw new Error('campaign_id é obrigatório');
  const fields = ['id', 'name', 'status', 'targeting', 'optimization_goal'].join(',');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}/adsets` +
    `?fields=${encodeURIComponent(fields)}&limit=100&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(json)}`);
  }
  return json.data ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!META_TOKEN || !DEFAULT_AD_ACCOUNT_ID) {
    return jsonResponse({ ok: false, error: 'META_MARKETING_ACCESS_TOKEN ou META_ADS_ACCOUNT_ID não configurados' }, 500);
  }

  try {
    const bearer = req.headers.get('authorization') ?? '';
    if (!bearer.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'Não autorizado.' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: bearer } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ ok: false, error: 'Não autorizado.' }, 401);
    const { data: podeVer } = await userClient.rpc('tem_permissao', { p_recurso: 'trafego_gestor', p_acao: 'ver' });
    if (!podeVer) return jsonResponse({ ok: false, error: 'Sem permissão de Gestor de Tráfego.' }, 403);
    let action = 'listar';
    let payload: any = {};

    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}));
      action = payload.action ?? 'listar';
    } else {
      const url = new URL(req.url);
      action = url.searchParams.get('action') ?? 'listar';
      payload.dias = url.searchParams.get('dias');
      payload.campaign_id = url.searchParams.get('campaign_id');
      payload.ad_account_id = url.searchParams.get('ad_account_id');
      payload.since = url.searchParams.get('since') ?? undefined;
      payload.until = url.searchParams.get('until') ?? undefined;
    }

    const adAccountId = typeof payload.ad_account_id === 'string' && payload.ad_account_id.startsWith('act_')
      ? payload.ad_account_id
      : DEFAULT_AD_ACCOUNT_ID;

    if (action === 'listar') {
      const data = await listarCampanhas(resolverPeriodo(payload), adAccountId);
      return jsonResponse({ ok: true, ...data });
    }

    if (action === 'listar_conjuntos') {
      const data = await listarConjuntos(payload.campaign_id, resolverPeriodo(payload), adAccountId);
      return jsonResponse({ ok: true, ...data });
    }

    if (action === 'contas') {
      const contas = await listarContas();
      return jsonResponse({ ok: true, contas });
    }

    if (action === 'atualizar_status') {
      const { data: podeEditar } = await userClient.rpc('tem_permissao', { p_recurso: 'trafego_gestor', p_acao: 'editar' });
      if (!podeEditar) return jsonResponse({ ok: false, error: 'Sem permissão para alterar campanhas.' }, 403);
      const result = await atualizarStatus(payload.campaign_id, payload.status, adAccountId);
      console.info('meta-ads status manual', { usuario: authData.user.id, objeto: payload.campaign_id, status: payload.status });
      return jsonResponse({ ok: true, result });
    }

    if (action === 'atualizar_orcamento') {
      const { data: podeEditar } = await userClient.rpc('tem_permissao', { p_recurso: 'trafego_gestor', p_acao: 'editar' });
      if (!podeEditar) return jsonResponse({ ok: false, error: 'Sem permissão para alterar orçamento.' }, 403);
      const result = await atualizarOrcamento(payload.id, payload.tipo, adAccountId, payload.centavos);
      console.info('meta-ads orçamento manual', { usuario: authData.user.id, conta: adAccountId, objeto: payload.id, tipo: payload.tipo, anterior: result.anterior_centavos, novo: result.novo_centavos });
      return jsonResponse({ ok: true, ...result });
    }

    if (action === 'targeting') {
      const result = await targeting(payload.campaign_id);
      return jsonResponse({ ok: true, adsets: result });
    }

    return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error('meta-ads error:', err);
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
