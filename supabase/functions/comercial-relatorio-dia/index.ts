/**
 * comercial-relatorio-dia
 * Manda pro grupo "DP - Comercial" o relatório automático do dia que passou:
 * leads diretos (anúncio -> WhatsApp, puxados do Meta Ads), vendas e
 * pré-matrículas fechadas, e envios das campanhas de disparo em massa.
 * Pedido do Pedro 11/11/2026, ajustado 12/11/2026 (horário + fonte dos leads).
 *
 * Roda à 00:05 de Brasília com os números do DIA ANTERIOR já fechado.
 *
 * Por que os leads vêm do Meta e não da tabela `leads`: a campanha de lead
 * direto é Click-to-WhatsApp -- a pessoa clica no anúncio e cai na conversa,
 * sem preencher formulário nenhum, então nunca vira linha em `leads`. O Meta
 * conta isso como "conversa por mensagem iniciada"
 * (onsite_conversion.messaging_conversation_started_7d). Achado real
 * 12/11/2026: relatório saiu "0 leads" num dia com 13 conversas no Ads.
 *
 * Chamada só pelo cron interno (ver migração comercial_relatorio_dia_cron):
 * exige header x-cron-key.
 *
 * Body opcional: { preview?: boolean, data?: 'YYYY-MM-DD' }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

const GRAPH_VERSION = 'v21.0';

// Mesma lista/prioridade do meta-ads: campanha de formulário reporta `lead`,
// campanha de Click-to-WhatsApp reporta conversa iniciada. Pega só o primeiro
// que existir -- somar duplicaria quem reporta mais de um.
const ACOES_LEAD = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
];

const ACOES_MENSAGEM = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
];

/**
 * "Lead direto" = quem o Pedro quer contar aqui: anúncio que joga a pessoa
 * direto na conversa (Click-to-WhatsApp), mais qualquer campanha que ELE
 * marcou com "(LEAD DIRETO)" no nome. Fica de fora a captação de formulário
 * de curso gratuito/Semana do Despertar (ex: "#48 BLACK IDM", "WEB 01"), que
 * ele pediu explicitamente pra não entrar na conta -- esses leads já aparecem
 * no CRM como canal SDD/Lançamento.
 */
function ehLeadDireto(nome: string, tipoAcao: string) {
  return ACOES_MENSAGEM.includes(tipoAcao) || nome.toUpperCase().includes('LEAD DIRETO');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function ontemBrasilia() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dataCurta(iso: string) {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/** Conversas/leads por campanha no dia, direto da Meta Marketing API. */
async function leadsDoMeta(dia: string): Promise<{ total: number; porCampanha: { nome: string; leads: number }[]; erro?: string }> {
  const token = Deno.env.get('META_MARKETING_ACCESS_TOKEN') ?? '';
  const conta = Deno.env.get('META_ADS_ACCOUNT_ID') ?? '';
  if (!token || !conta) return { total: 0, porCampanha: [], erro: 'Meta Ads não configurado' };

  try {
    const fields = [
      'name',
      `insights.time_range({"since":"${dia}","until":"${dia}"}){actions}`,
    ].join(',');
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${conta}/campaigns?fields=${encodeURIComponent(fields)}&limit=200&access_token=${token}`,
    );
    const body = await res.json();
    if (!res.ok) return { total: 0, porCampanha: [], erro: body?.error?.message ?? 'erro na Meta API' };

    const porCampanha: { nome: string; leads: number }[] = [];
    for (const c of body.data ?? []) {
      const actions: { action_type: string; value: string }[] = c.insights?.data?.[0]?.actions ?? [];
      const achou = ACOES_LEAD.map((t) => actions.find((a) => a.action_type === t)).find(Boolean);
      const leads = achou ? Number(achou.value) : 0;
      if (leads > 0 && ehLeadDireto(c.name ?? '', achou!.action_type)) {
        porCampanha.push({ nome: c.name, leads });
      }
    }
    porCampanha.sort((a, b) => b.leads - a.leads);
    return { total: porCampanha.reduce((s, c) => s + c.leads, 0), porCampanha };
  } catch (e) {
    return { total: 0, porCampanha: [], erro: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: secretRow } = await sb
      .from('cron_segredos_internos')
      .select('valor')
      .eq('nome', 'comercial_relatorio_dia')
      .single();
    const chaveEsperada = secretRow?.valor;
    const chaveRecebida = req.headers.get('x-cron-key');
    if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
      return json({ ok: false, erro: 'não autorizado' }, 401);
    }

    const { preview, data: dataPedida } = await req.json().catch(() => ({})) as { preview?: boolean; data?: string };
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(dataPedida ?? '') ? dataPedida! : ontemBrasilia();

    const [{ data: dados, error: erroDados }, meta] = await Promise.all([
      sb.rpc('comercial_relatorio_dia_dados', { p_data: dia }),
      leadsDoMeta(dia),
    ]);
    if (erroDados || !dados) return json({ ok: false, erro: erroDados?.message ?? 'sem dados' }, 500);

    const disparos = (dados.disparos ?? []) as { nome: string; enviados: number }[];

    const linhasLeads = meta.erro
      ? `🎯 Leads diretos: não consegui ler o Gestor de Tráfego (${meta.erro})`
      : [
          `🎯 Leads diretos (anúncio → WhatsApp): ${meta.total}`,
          ...meta.porCampanha.map((c) => `   • ${c.nome}: ${c.leads}`),
        ].join('\n');

    const linhasDisparos = disparos.length
      ? disparos.map((d) => `   • ${d.nome}: ${d.enviados} enviado(s)`).join('\n')
      : '   • Nenhum disparo hoje.';

    const texto = [
      `📊 *Comercial — ${dataCurta(dia)}*`,
      '',
      linhasLeads,
      '',
      `💼 Vendas fechadas: ${dados.vendas}`,
      `📋 Pré-matrículas: ${dados.pre_matriculas}`,
      '',
      '📨 *Disparos de campanha:*',
      linhasDisparos,
    ].join('\n');

    if (preview) return json({ ok: true, dia, texto });

    const { data: grupo } = await sb
      .from('ceo_rotina_grupos')
      .select('grupo_jid, instancia, ativo')
      .eq('departamento', 'comercial')
      .single();
    if (!grupo || !grupo.ativo) return json({ ok: false, erro: 'grupo comercial não configurado/ativo' }, 400);

    const envioRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({
        numero: grupo.grupo_jid,
        mensagem: texto,
        instance_name: grupo.instancia,
      }),
    });
    const envioJson = await envioRes.json().catch(() => ({}));

    return json({ ok: true, dia, texto, envio: envioJson });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
