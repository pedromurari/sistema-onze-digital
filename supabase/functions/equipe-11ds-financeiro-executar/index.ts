import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

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

// ── Interpretacao do periodo pedido na ordem ───────────────────────────────────
// A IA aqui SO extrai duas datas (inicio/fim) e uma descricao curta do periodo a
// partir do texto livre da ordem -- ela nunca ve nem gera nenhum numero
// financeiro. Todos os valores/contagens do resumo continuam vindo 100% de SQL
// deterministico sobre `alunos`/`pagamentos`, sem risco de alucinacao.
type Periodo = { desde: string; ate: string; resumoPeriodo: string };

async function interpretarPeriodo(openaiKey: string, ordemTexto: string, hoje: string): Promise<Periodo> {
  const fallback: Periodo = { desde: hoje, ate: hoje, resumoPeriodo: 'hoje' };
  if (!ordemTexto?.trim()) return fallback;

  try {
    const systemPrompt = [
      `Extraia APENAS o periodo de datas que o usuario esta pedindo num resumo financeiro. Hoje e ${hoje} (formato YYYY-MM-DD).`,
      `Regras: pedido generico/sem periodo especifico ou tarefa automatica recorrente -> desde=ate=hoje, resumo_periodo="hoje".`,
      `"essa semana" -> desde = segunda-feira desta semana, ate = hoje.`,
      `"esse mes"/"mes atual"/"desse mes" -> desde = primeiro dia do mes de hoje, ate = hoje.`,
      `"mes passado"/"mes anterior" -> mes civil completo anterior (do dia 1 ao ultimo dia daquele mes).`,
      `Datas explicitas mencionadas na ordem -> use exatamente elas.`,
      `Responda SOMENTE com um JSON: {"desde": "YYYY-MM-DD", "ate": "YYYY-MM-DD", "resumo_periodo": "descricao curta em portugues, ex: hoje | julho de 2026 | 01/07 a 13/07"}`,
    ].join(' ');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: ordemTexto },
        ],
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
    if (ate > hoje) ate = hoje; // nunca busca "futuro" como se ja tivesse acontecido
    const resumoPeriodo = typeof parsed.resumo_periodo === 'string' && parsed.resumo_periodo.trim() ? parsed.resumo_periodo : 'hoje';

    return { desde, ate, resumoPeriodo };
  } catch (e) {
    console.error('Interpretacao de periodo falhou:', (e as Error).message);
    return fallback;
  }
}

type PagamentoRaw = {
  id: string;
  aluno_id: string | null;
  valor: number | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  numero_parcela: number | null;
  cobranca_contatado_em: string | null;
  alunos: { nome: string; whatsapp: string | null; cobranca_telefone: string | null } | null;
};

type MatriculaRaw = {
  id: string;
  nome: string;
  produto: string | null;
  valor_mensalidade: number | null;
  data_matricula: string | null;
  whatsapp: string | null;
};

type ItemResumo = {
  pagamento_id: string;
  aluno_id: string | null;
  nome: string;
  valor: number;
  telefone: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  numero_parcela: number | null;
  dias_atraso: number | null;
  cobranca_contatado_em: string | null;
};

function paraItem(p: PagamentoRaw, hoje: string, comAtraso: boolean): ItemResumo {
  return {
    pagamento_id: p.id,
    aluno_id: p.aluno_id,
    nome: p.alunos?.nome ?? 'Aluno',
    valor: p.valor ?? 0,
    telefone: p.alunos?.cobranca_telefone || p.alunos?.whatsapp || null,
    data_vencimento: p.data_vencimento,
    data_pagamento: p.data_pagamento,
    numero_parcela: p.numero_parcela,
    dias_atraso: comAtraso && p.data_vencimento ? diasEntre(p.data_vencimento, hoje) : null,
    cobranca_contatado_em: p.cobranca_contatado_em,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // O Bearer e' validado de verdade contra o Supabase Auth (nao basta so comecar com "Bearer ").
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let tarefaId = '';
  let agenteId = '';

  try {
    const body = await req.json() as { tarefa_id: string };
    tarefaId = body.tarefa_id;
    if (!tarefaId) {
      return new Response(JSON.stringify({ ok: false, error: 'tarefa_id e obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas').select('id, agente_id, ordem_texto').eq('id', tarefaId).single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteId = tarefa.agente_id;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: 'Conferindo o financeiro...', updated_at: new Date().toISOString() }).eq('id', agenteId);

    const hoje = hojeSaoPaulo();
    const em7dias = addDias(hoje, 7);
    const amanha = addDias(hoje, 1);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const periodo = openaiKey ? await interpretarPeriodo(openaiKey, tarefa.ordem_texto ?? '', hoje) : { desde: hoje, ate: hoje, resumoPeriodo: 'hoje' };

    const selectComAluno = 'id, aluno_id, valor, data_pagamento, data_vencimento, numero_parcela, cobranca_contatado_em, alunos(nome, whatsapp, cobranca_telefone)';

    // Matriculas e pagamentos recebidos respeitam o periodo pedido na ordem.
    // Inadimplentes/vencendo7/vencendo1 sao sempre um retrato do "agora" (nao
    // fazem sentido "no mes passado" -- inadimplencia e status atual do aluno).
    const [pagosPeriodo, atrasados, pendentesVencidos, vencendo7, vencendo1, matriculasPeriodo] = await Promise.all([
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pago').gte('data_pagamento', periodo.desde).lte('data_pagamento', periodo.ate),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'atrasado').order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').lt('data_vencimento', hoje).order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').eq('data_vencimento', em7dias).order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').eq('data_vencimento', amanha).order('data_vencimento'),
      supabase.from('alunos').select('id, nome, produto, valor_mensalidade, data_matricula, whatsapp').gte('data_matricula', periodo.desde).lte('data_matricula', periodo.ate),
    ]);

    for (const [nome, r] of Object.entries({ pagosPeriodo, atrasados, pendentesVencidos, vencendo7, vencendo1, matriculasPeriodo })) {
      if (r.error) throw new Error(`Falha ao consultar ${nome}: ${r.error.message}`);
    }

    const inadimplentesRaw = [...(atrasados.data ?? []), ...(pendentesVencidos.data ?? [])] as unknown as PagamentoRaw[];
    const pagosPeriodoRaw = (pagosPeriodo.data ?? []) as unknown as PagamentoRaw[];
    const vencendo7Raw = (vencendo7.data ?? []) as unknown as PagamentoRaw[];
    const vencendo1Raw = (vencendo1.data ?? []) as unknown as PagamentoRaw[];
    const matriculasPeriodoRaw = (matriculasPeriodo.data ?? []) as unknown as MatriculaRaw[];

    const dados = {
      pagosHoje: pagosPeriodoRaw.map(p => paraItem(p, hoje, false)),
      inadimplentes: inadimplentesRaw.map(p => paraItem(p, hoje, true)),
      vencendo7: vencendo7Raw.map(p => paraItem(p, hoje, false)),
      vencendo1: vencendo1Raw.map(p => paraItem(p, hoje, false)),
      matriculasHoje: matriculasPeriodoRaw.map(a => ({
        aluno_id: a.id, nome: a.nome, produto: a.produto, valor: a.valor_mensalidade ?? 0, telefone: a.whatsapp,
      })),
      hoje,
      periodo: periodo.resumoPeriodo,
    };

    const totalPagoPeriodo = dados.pagosHoje.reduce((s, p) => s + p.valor, 0);
    const totalInadimplente = dados.inadimplentes.reduce((s, p) => s + p.valor, 0);
    const fmtValor = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const resposta = [
      `📊 Resumo financeiro — ${periodo.resumoPeriodo}`,
      `🎓 Novas matrículas: ${dados.matriculasHoje.length}`,
      `💰 Pagamentos recebidos: ${dados.pagosHoje.length} (${fmtValor(totalPagoPeriodo)})`,
      `⚠️ Inadimplentes (hoje): ${dados.inadimplentes.length} (${fmtValor(totalInadimplente)} em atraso)`,
      `🔔 Vencendo em 7 dias: ${dados.vencendo7.length}`,
      `🔴 Vencendo amanhã: ${dados.vencendo1.length}`,
      `Veja a lista detalhada abaixo, com link direto pro aluno e opção de marcar quem já foi cobrado.`,
    ].join('\n');

    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido',
      resposta_texto: resposta,
      anexos: [],
      dados,
      concluido_em: new Date().toISOString(),
    }).eq('id', tarefaId);

    await supabase.from('equipe_11ds_agentes').update({ status: 'livre', status_texto: null, updated_at: new Date().toISOString() }).eq('id', agenteId);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
    }
    if (agenteId) {
      await supabase.from('equipe_11ds_agentes').update({ status: 'erro', status_texto: 'Deu erro na ultima tarefa', updated_at: new Date().toISOString() }).eq('id', agenteId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
