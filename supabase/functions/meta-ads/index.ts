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

async function listarCampanhas(dias: number, adAccountId: string) {
  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

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
    const actions: Array<{ action_type: string; value: string }> = insight?.actions ?? [];
    const leads = actions.find((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value;
    const purchases = actions.find((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value;
    const custoPorAcao: Array<{ action_type: string; value: string }> = insight?.cost_per_action_type ?? [];
    const custoPorLead = custoPorAcao.find((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value;

    const orcamentoDiario = c.daily_budget ? Number(c.daily_budget) / 100 : null;
    const orcamentoTotal = c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null;
    const gasto = insight?.spend ? Number(insight.spend) : 0;
    const custoPorLeadNum = custoPorLead ? Number(custoPorLead) : null;

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
      leads: leads ? Number(leads) : 0,
      compras: purchases ? Number(purchases) : 0,
      custo_por_lead: custoPorLeadNum,
      custo_por_lead_brl: converter(custoPorLeadNum),
    };
  });

  return {
    periodo: { since, until, dias },
    conta,
    cambio: taxa !== null ? { moeda_origem: conta.moeda, taxa, atualizado_em: cambio!.atualizado_em } : null,
    campanhas,
  };
}

async function listarConjuntos(campaignId: string, dias: number, adAccountId: string) {
  if (!campaignId) throw new Error('campaign_id é obrigatório');
  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

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
    const actions: Array<{ action_type: string; value: string }> = insight?.actions ?? [];
    const leads = actions.find((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value;
    const custoPorAcao: Array<{ action_type: string; value: string }> = insight?.cost_per_action_type ?? [];
    const custoPorLead = custoPorAcao.find((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value;
    const orcamentoDiario = c.daily_budget ? Number(c.daily_budget) / 100 : null;
    const gasto = insight?.spend ? Number(insight.spend) : 0;
    const custoPorLeadNum = custoPorLead ? Number(custoPorLead) : null;

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
      leads: leads ? Number(leads) : 0,
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

async function atualizarStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED') {
  if (!campaignId || !['ACTIVE', 'PAUSED'].includes(status)) {
    throw new Error('campaign_id e status (ACTIVE|PAUSED) são obrigatórios');
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
    }

    const adAccountId = typeof payload.ad_account_id === 'string' && payload.ad_account_id.startsWith('act_')
      ? payload.ad_account_id
      : DEFAULT_AD_ACCOUNT_ID;

    if (action === 'listar') {
      const dias = Number(payload.dias) > 0 ? Number(payload.dias) : 7;
      const data = await listarCampanhas(dias, adAccountId);
      return jsonResponse({ ok: true, ...data });
    }

    if (action === 'listar_conjuntos') {
      const dias = Number(payload.dias) > 0 ? Number(payload.dias) : 7;
      const data = await listarConjuntos(payload.campaign_id, dias, adAccountId);
      return jsonResponse({ ok: true, ...data });
    }

    if (action === 'contas') {
      const contas = await listarContas();
      return jsonResponse({ ok: true, contas });
    }

    if (action === 'atualizar_status') {
      const result = await atualizarStatus(payload.campaign_id, payload.status);
      return jsonResponse({ ok: true, result });
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
