import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Bia (time Operacoes) le os logs de disparo ja existentes no sistema --
// boas-vindas (email/whatsapp), mensagens de funil/grupo, disparos em massa e
// adicao a grupos -- e devolve onde estao os gargalos. Mesmo principio da Ana
// (Financeiro): todo numero vem de SQL deterministico; a IA so interpreta o
// periodo pedido em texto livre, nunca gera nem resume os numeros em si.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

const VOLUME_MINIMO = 5; // abaixo disso, taxa de erro e' ruido, nao gargalo real
const MARGEM_TENDENCIA = 2; // pontos percentuais de folga antes de chamar de "piorando/melhorando"

function hojeSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function addDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(deISO: string, ateISO: string): number {
  const de = new Date(`${deISO}T00:00:00Z`).getTime();
  const ate = new Date(`${ateISO}T00:00:00Z`).getTime();
  return Math.round((ate - de) / 86_400_000);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Interpretacao do periodo pedido na ordem (mesmo molde da Ana/Financeiro) ───

type Periodo = { desde: string; ate: string; resumoPeriodo: string };

async function interpretarPeriodo(openaiKey: string, ordemTexto: string, hoje: string): Promise<Periodo> {
  const fallback: Periodo = { desde: hoje, ate: hoje, resumoPeriodo: 'hoje' };
  if (!ordemTexto?.trim()) return fallback;

  try {
    const systemPrompt = [
      `Extraia APENAS o periodo de datas que o usuario esta pedindo num relatorio de disparos. Hoje e ${hoje} (formato YYYY-MM-DD).`,
      `Regras: pedido generico/sem periodo especifico -> desde=ate=hoje, resumo_periodo="hoje".`,
      `"ontem" ou "de ontem" -> desde=ate= dia anterior a hoje.`,
      `"essa semana" -> desde = segunda-feira desta semana, ate = hoje.`,
      `"esse mes"/"mes atual" -> desde = primeiro dia do mes de hoje, ate = hoje.`,
      `"mes passado"/"mes anterior" -> mes civil completo anterior (do dia 1 ao ultimo dia daquele mes).`,
      `Datas explicitas mencionadas na ordem -> use exatamente elas.`,
      `Responda SOMENTE com um JSON: {"desde": "YYYY-MM-DD", "ate": "YYYY-MM-DD", "resumo_periodo": "descricao curta em portugues, ex: ontem | essa semana | julho de 2026"}`,
    ].join(' ');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: ordemTexto }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`Interpretacao de periodo falhou (${res.status}):`, (await res.text()).slice(0, 300));
      return fallback;
    }
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { desde?: unknown; ate?: unknown; resumo_periodo?: unknown };

    const desde = typeof parsed.desde === 'string' && ISO_DATE.test(parsed.desde) ? parsed.desde : hoje;
    let ate = typeof parsed.ate === 'string' && ISO_DATE.test(parsed.ate) ? parsed.ate : hoje;
    if (ate > hoje) ate = hoje;
    const resumoPeriodo = typeof parsed.resumo_periodo === 'string' && parsed.resumo_periodo.trim() ? parsed.resumo_periodo : 'hoje';

    return { desde, ate, resumoPeriodo };
  } catch (e) {
    console.error('Interpretacao de periodo falhou:', (e as Error).message);
    return fallback;
  }
}

// ── Agregacao deterministica -- zero espaco pra numero inventado ──────────────

function taxaErro(sucesso: number, erro: number): number | null {
  const total = sucesso + erro;
  if (total === 0) return null;
  return Math.round((erro / total) * 1000) / 10;
}

function top3(mapa: Map<string, number>): { erro: string; count: number }[] {
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([erro, count]) => ({ erro, count }));
}

const fmtPct = (n: number | null) => n === null ? 'sem dados' : `${n}%`;

type AccCanal = { sent: number; error: number; skipped: number };
type AccBoasVindas = { wpp: AccCanal; email: AccCanal; errosWpp: Map<string, number>; errosEmail: Map<string, number> };
type AccFunil = { sent: number; error: number; scheduled: number; draft: number; erros: Map<string, number> };
type AccCampanha = { enviado: number; erro: number; erros: Map<string, number> };
type AccGrupo = { adicionado: number; erro: number; falhouAdd: number; detalhes: Map<string, number> };

async function taxaErroDaFonte(supabase: any, fonte: string, desde: string, ate: string): Promise<number | null> {
  const desdeTs = `${desde}T00:00:00`;
  const ateTs = `${ate}T23:59:59`;
  if (fonte === 'Boas-vindas (WhatsApp)') {
    const { data } = await supabase.from('boas_vindas_logs').select('wpp_status').gte('sent_at', desdeTs).lte('sent_at', ateTs);
    const rows = (data ?? []) as { wpp_status: string | null }[];
    return taxaErro(rows.filter(r => r.wpp_status === 'sent').length, rows.filter(r => r.wpp_status === 'error').length);
  }
  if (fonte === 'Boas-vindas (E-mail)') {
    const { data } = await supabase.from('boas_vindas_logs').select('email_status').gte('sent_at', desdeTs).lte('sent_at', ateTs);
    const rows = (data ?? []) as { email_status: string | null }[];
    return taxaErro(rows.filter(r => r.email_status === 'sent').length, rows.filter(r => r.email_status === 'error').length);
  }
  if (fonte === 'Mensagens de funil/grupo') {
    const { data } = await supabase.from('funnel_messages').select('status').gte('scheduled_at', desdeTs).lte('scheduled_at', ateTs);
    const rows = (data ?? []) as { status: string }[];
    return taxaErro(rows.filter(r => r.status === 'sent').length, rows.filter(r => r.status === 'error').length);
  }
  if (fonte === 'Disparo em massa') {
    const { data } = await supabase.from('disparo_leads').select('status').gte('sent_at', desdeTs).lte('sent_at', ateTs);
    const rows = (data ?? []) as { status: string }[];
    return taxaErro(rows.filter(r => r.status === 'enviado').length, rows.filter(r => r.status === 'erro').length);
  }
  if (fonte === 'Adição a grupos') {
    const { data } = await supabase.from('grupo_add_jobs').select('result').gte('done_at', desdeTs).lte('done_at', ateTs);
    const rows = (data ?? []) as { result: string }[];
    return taxaErro(rows.filter(r => r.result === 'adicionado').length, rows.filter(r => r.result === 'erro' || r.result === 'falhou_add').length);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  let authorized = false;
  if (cronKeyHeader) {
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    authorized = Boolean(cronSecret) && cronKeyHeader === cronSecret;
  }
  if (!authorized && authHeader.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    authorized = Boolean(user);
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let tarefaId = '';
  let agenteId = '';

  try {
    const body = await req.json() as { tarefa_id: string };
    tarefaId = body.tarefa_id;
    if (!tarefaId) {
      return new Response(JSON.stringify({ ok: false, error: 'tarefa_id e obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas').select('id, agente_id, ordem_texto').eq('id', tarefaId).single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteId = tarefa.agente_id;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: 'Conferindo os disparos...', updated_at: new Date().toISOString() }).eq('id', agenteId);

    const hoje = hojeSaoPaulo();
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const periodo = openaiKey ? await interpretarPeriodo(openaiKey, tarefa.ordem_texto ?? '', hoje) : { desde: hoje, ate: hoje, resumoPeriodo: 'hoje' };

    const desdeTs = `${periodo.desde}T00:00:00`;
    const ateTs = `${periodo.ate}T23:59:59`;

    const [bv, fm, dl, gaj] = await Promise.all([
      supabase.from('boas_vindas_logs').select('funnel_name, wpp_status, email_status, wpp_error, email_error').gte('sent_at', desdeTs).lte('sent_at', ateTs),
      supabase.from('funnel_messages').select('funnel_name, status, error_message').gte('scheduled_at', desdeTs).lte('scheduled_at', ateTs),
      supabase.from('disparo_leads').select('status, error_msg, disparo_campanhas(nome)').gte('sent_at', desdeTs).lte('sent_at', ateTs),
      supabase.from('grupo_add_jobs').select('action, result, result_detail').gte('done_at', desdeTs).lte('done_at', ateTs),
    ]);
    for (const [nome, r] of Object.entries({ bv, fm, dl, gaj })) {
      if (r.error) throw new Error(`Falha ao consultar ${nome}: ${r.error.message}`);
    }

    // ── Boas-vindas (email/whatsapp), por funil ──────────────────────────────
    const porFunilBV = new Map<string, AccBoasVindas>();
    for (const r of (bv.data ?? []) as { funnel_name: string | null; wpp_status: string | null; email_status: string | null; wpp_error: string | null; email_error: string | null }[]) {
      const key = r.funnel_name || '(sem funil)';
      if (!porFunilBV.has(key)) porFunilBV.set(key, { wpp: { sent: 0, error: 0, skipped: 0 }, email: { sent: 0, error: 0, skipped: 0 }, errosWpp: new Map(), errosEmail: new Map() });
      const acc = porFunilBV.get(key)!;
      if (r.wpp_status === 'sent') acc.wpp.sent++;
      else if (r.wpp_status === 'error') { acc.wpp.error++; if (r.wpp_error) acc.errosWpp.set(r.wpp_error, (acc.errosWpp.get(r.wpp_error) ?? 0) + 1); }
      else if (r.wpp_status === 'skipped') acc.wpp.skipped++;
      if (r.email_status === 'sent') acc.email.sent++;
      else if (r.email_status === 'error') { acc.email.error++; if (r.email_error) acc.errosEmail.set(r.email_error, (acc.errosEmail.get(r.email_error) ?? 0) + 1); }
      else if (r.email_status === 'skipped') acc.email.skipped++;
    }

    // ── Mensagens de funil/grupo, por funil ──────────────────────────────────
    const porFunilFM = new Map<string, AccFunil>();
    for (const r of (fm.data ?? []) as { funnel_name: string | null; status: string; error_message: string | null }[]) {
      const key = r.funnel_name || '(sem funil)';
      if (!porFunilFM.has(key)) porFunilFM.set(key, { sent: 0, error: 0, scheduled: 0, draft: 0, erros: new Map() });
      const acc = porFunilFM.get(key)!;
      if (r.status === 'sent') acc.sent++;
      else if (r.status === 'error') { acc.error++; if (r.error_message) acc.erros.set(r.error_message, (acc.erros.get(r.error_message) ?? 0) + 1); }
      else if (r.status === 'scheduled') acc.scheduled++;
      else if (r.status === 'draft') acc.draft++;
    }

    // ── Disparos em massa, por campanha ───────────────────────────────────────
    const porCampanha = new Map<string, AccCampanha>();
    for (const r of (dl.data ?? []) as unknown as { status: string; error_msg: string | null; disparo_campanhas: { nome: string } | null }[]) {
      const key = r.disparo_campanhas?.nome ?? '(campanha removida)';
      if (!porCampanha.has(key)) porCampanha.set(key, { enviado: 0, erro: 0, erros: new Map() });
      const acc = porCampanha.get(key)!;
      if (r.status === 'enviado') acc.enviado++;
      else if (r.status === 'erro') { acc.erro++; if (r.error_msg) acc.erros.set(r.error_msg, (acc.erros.get(r.error_msg) ?? 0) + 1); }
    }

    // ── Adicao a grupos, por acao ──────────────────────────────────────────────
    const porAcao = new Map<string, AccGrupo>();
    for (const r of (gaj.data ?? []) as { action: string | null; result: string; result_detail: string | null }[]) {
      const key = r.action || '(sem acao)';
      if (!porAcao.has(key)) porAcao.set(key, { adicionado: 0, erro: 0, falhouAdd: 0, detalhes: new Map() });
      const acc = porAcao.get(key)!;
      if (r.result === 'adicionado') acc.adicionado++;
      else if (r.result === 'erro') { acc.erro++; if (r.result_detail) acc.detalhes.set(r.result_detail, (acc.detalhes.get(r.result_detail) ?? 0) + 1); }
      else if (r.result === 'falhou_add') { acc.falhouAdd++; if (r.result_detail) acc.detalhes.set(r.result_detail, (acc.detalhes.get(r.result_detail) ?? 0) + 1); }
    }

    // ── Gargalo: pior taxa de erro entre quem tem volume suficiente ──────────
    type Candidato = { fonte: string; detalhe: string; sucesso: number; erro: number };
    const candidatos: Candidato[] = [];
    for (const [funil, acc] of porFunilBV) {
      candidatos.push({ fonte: 'Boas-vindas (WhatsApp)', detalhe: funil, sucesso: acc.wpp.sent, erro: acc.wpp.error });
      candidatos.push({ fonte: 'Boas-vindas (E-mail)', detalhe: funil, sucesso: acc.email.sent, erro: acc.email.error });
    }
    for (const [funil, acc] of porFunilFM) candidatos.push({ fonte: 'Mensagens de funil/grupo', detalhe: funil, sucesso: acc.sent, erro: acc.error });
    for (const [campanha, acc] of porCampanha) candidatos.push({ fonte: 'Disparo em massa', detalhe: campanha, sucesso: acc.enviado, erro: acc.erro });
    for (const [acao, acc] of porAcao) candidatos.push({ fonte: 'Adição a grupos', detalhe: acao, sucesso: acc.adicionado, erro: acc.erro + acc.falhouAdd });

    const qualificados = candidatos
      .map(c => ({ ...c, total: c.sucesso + c.erro, taxa: taxaErro(c.sucesso, c.erro) }))
      .filter(c => c.total >= VOLUME_MINIMO && c.taxa !== null)
      .sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0));
    const gargalo = qualificados[0] ?? null;

    let tendencia: 'piorando' | 'melhorando' | 'estavel' | null = null;
    let taxaAnterior: number | null = null;
    if (gargalo) {
      const duracaoDias = diasEntre(periodo.desde, periodo.ate) + 1;
      const anteriorAte = addDias(periodo.desde, -1);
      const anteriorDesde = addDias(anteriorAte, -(duracaoDias - 1));
      taxaAnterior = await taxaErroDaFonte(supabase, gargalo.fonte, anteriorDesde, anteriorAte);
      if (taxaAnterior !== null && gargalo.taxa !== null) {
        const diff = gargalo.taxa - taxaAnterior;
        tendencia = diff > MARGEM_TENDENCIA ? 'piorando' : diff < -MARGEM_TENDENCIA ? 'melhorando' : 'estavel';
      }
    }

    const somar = <T,>(mapa: Map<string, T>, campo: (v: T) => number) => [...mapa.values()].reduce((s, v) => s + campo(v), 0);
    const totalBvWppSent = somar(porFunilBV, a => a.wpp.sent);
    const totalBvWppError = somar(porFunilBV, a => a.wpp.error);
    const totalBvWppSkipped = somar(porFunilBV, a => a.wpp.skipped);
    const totalBvEmailSent = somar(porFunilBV, a => a.email.sent);
    const totalBvEmailError = somar(porFunilBV, a => a.email.error);
    const totalFmSent = somar(porFunilFM, a => a.sent);
    const totalFmError = somar(porFunilFM, a => a.error);
    const totalDlEnviado = somar(porCampanha, a => a.enviado);
    const totalDlErro = somar(porCampanha, a => a.erro);
    const totalGajAdd = somar(porAcao, a => a.adicionado);
    const totalGajErro = somar(porAcao, a => a.erro + a.falhouAdd);

    const dados = {
      periodo: periodo.resumoPeriodo, desde: periodo.desde, ate: periodo.ate,
      boasVindas: [...porFunilBV.entries()].map(([funil, acc]) => ({
        funil,
        wpp: { ...acc.wpp, taxaErro: taxaErro(acc.wpp.sent, acc.wpp.error) },
        email: { ...acc.email, taxaErro: taxaErro(acc.email.sent, acc.email.error) },
        topErrosWpp: top3(acc.errosWpp),
        topErrosEmail: top3(acc.errosEmail),
      })),
      funil: [...porFunilFM.entries()].map(([funil, acc]) => ({
        funil, sent: acc.sent, error: acc.error, scheduled: acc.scheduled, draft: acc.draft,
        taxaErro: taxaErro(acc.sent, acc.error), topErros: top3(acc.erros),
      })),
      disparoMassa: [...porCampanha.entries()].map(([campanha, acc]) => ({
        campanha, enviado: acc.enviado, erro: acc.erro, taxaErro: taxaErro(acc.enviado, acc.erro), topErros: top3(acc.erros),
      })),
      grupos: [...porAcao.entries()].map(([acao, acc]) => ({
        acao, adicionado: acc.adicionado, erro: acc.erro + acc.falhouAdd, taxaErro: taxaErro(acc.adicionado, acc.erro + acc.falhouAdd), topDetalhes: top3(acc.detalhes),
      })),
      gargalo: gargalo ? { fonte: gargalo.fonte, detalhe: gargalo.detalhe, taxaErro: gargalo.taxa, tendencia, taxaAnterior } : null,
    };

    const resposta = [
      `📡 Relatório de disparos — ${periodo.resumoPeriodo}`,
      `📧 Boas-vindas (e-mail): ${totalBvEmailSent} enviados, ${totalBvEmailError} com erro (${fmtPct(taxaErro(totalBvEmailSent, totalBvEmailError))} de erro)`,
      `📱 Boas-vindas (WhatsApp): ${totalBvWppSent} enviados, ${totalBvWppError} com erro, ${totalBvWppSkipped} não tentados`,
      `💬 Mensagens de funil/grupo: ${totalFmSent} enviadas, ${totalFmError} com erro (${fmtPct(taxaErro(totalFmSent, totalFmError))} de erro)`,
      `📣 Disparos em massa: ${totalDlEnviado} enviados, ${totalDlErro} com erro (${fmtPct(taxaErro(totalDlEnviado, totalDlErro))} de erro)`,
      `👥 Adição a grupos: ${totalGajAdd} adicionados, ${totalGajErro} falharam (${fmtPct(taxaErro(totalGajAdd, totalGajErro))} de erro)`,
      gargalo
        ? `🚨 Maior gargalo: ${gargalo.fonte} — "${gargalo.detalhe}" com ${gargalo.taxa}% de erro${tendencia ? ` (${tendencia}${taxaAnterior !== null ? `, era ${taxaAnterior}% no período anterior` : ''})` : ''}.`
        : `✅ Nenhum canal com volume suficiente pra apontar um gargalo com confiança neste período.`,
    ].join('\n');

    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido', resposta_texto: resposta, anexos: [], dados, concluido_em: new Date().toISOString(),
    }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'livre', status_texto: null, updated_at: new Date().toISOString() }).eq('id', agenteId);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
    }
    if (agenteId) {
      await supabase.from('equipe_11ds_agentes').update({ status: 'erro', status_texto: 'Deu erro na última tarefa', updated_at: new Date().toISOString() }).eq('id', agenteId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
