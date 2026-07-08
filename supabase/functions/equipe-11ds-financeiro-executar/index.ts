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

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatValor(v: number | null): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type PagamentoLinha = {
  valor: number | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  numero_parcela: number | null;
  alunos: { nome: string; whatsapp: string | null; cobranca_telefone: string | null } | null;
};

function formatLista(itens: PagamentoLinha[], hoje: string, comAtraso: boolean, limite = 25): string {
  if (itens.length === 0) return '  Nenhum.';
  const linhas = itens.slice(0, limite).map(p => {
    const nome = p.alunos?.nome ?? 'Aluno';
    const tel = p.alunos?.cobranca_telefone || p.alunos?.whatsapp || 'sem telefone';
    const parcela = p.numero_parcela ? ` (parcela ${p.numero_parcela})` : '';
    if (comAtraso && p.data_vencimento) {
      const atraso = diasEntre(p.data_vencimento, hoje);
      return `  • ${nome} — ${formatValor(p.valor)}${parcela}, venceu ${formatDataBR(p.data_vencimento)} (${atraso} dia${atraso === 1 ? '' : 's'} de atraso) — ${tel}`;
    }
    if (p.data_vencimento) {
      return `  • ${nome} — ${formatValor(p.valor)}${parcela}, vence ${formatDataBR(p.data_vencimento)} — ${tel}`;
    }
    return `  • ${nome} — ${formatValor(p.valor)}${parcela} — pago em ${p.data_pagamento ? formatDataBR(p.data_pagamento) : '?'}`;
  });
  if (itens.length > limite) linhas.push(`  ... e mais ${itens.length - limite}.`);
  return linhas.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  let isCron = false;
  if (cronKeyHeader) {
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    isCron = Boolean(cronSecret) && cronKeyHeader === cronSecret;
  }
  if (!isCron && !authHeader.startsWith('Bearer ')) {
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
      .from('equipe_11ds_tarefas').select('id, agente_id').eq('id', tarefaId).single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteId = tarefa.agente_id;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: 'Conferindo o financeiro...', updated_at: new Date().toISOString() }).eq('id', agenteId);

    const hoje = hojeSaoPaulo();
    const em7dias = addDias(hoje, 7);
    const amanha = addDias(hoje, 1);

    const selectComAluno = 'valor, data_pagamento, data_vencimento, numero_parcela, alunos(nome, whatsapp, cobranca_telefone)';

    const [pagosHoje, atrasados, pendentesVencidos, vencendo7, vencendo1] = await Promise.all([
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pago').eq('data_pagamento', hoje),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'atrasado').order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').lt('data_vencimento', hoje).order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').eq('data_vencimento', em7dias).order('data_vencimento'),
      supabase.from('pagamentos').select(selectComAluno).eq('status', 'pendente').eq('data_vencimento', amanha).order('data_vencimento'),
    ]);

    for (const [nome, r] of Object.entries({ pagosHoje, atrasados, pendentesVencidos, vencendo7, vencendo1 })) {
      if (r.error) throw new Error(`Falha ao consultar ${nome}: ${r.error.message}`);
    }

    const inadimplentes = [...(atrasados.data ?? []), ...(pendentesVencidos.data ?? [])] as unknown as PagamentoLinha[];
    const listaPagosHoje = (pagosHoje.data ?? []) as unknown as PagamentoLinha[];
    const lista7 = (vencendo7.data ?? []) as unknown as PagamentoLinha[];
    const lista1 = (vencendo1.data ?? []) as unknown as PagamentoLinha[];

    const totalPagoHoje = listaPagosHoje.reduce((s, p) => s + (p.valor ?? 0), 0);
    const totalInadimplente = inadimplentes.reduce((s, p) => s + (p.valor ?? 0), 0);

    const resposta = [
      `📊 Resumo financeiro de hoje (${formatDataBR(hoje)})`,
      '',
      `💰 Pagamentos de hoje (${listaPagosHoje.length}) — ${formatValor(totalPagoHoje)} — confira se bateu:`,
      formatLista(listaPagosHoje, hoje, false),
      '',
      `⚠️ Inadimplentes (${inadimplentes.length}) — ${formatValor(totalInadimplente)} em atraso:`,
      formatLista(inadimplentes, hoje, true),
      '',
      `🔔 Vencendo em 7 dias — ${formatDataBR(em7dias)} (${lista7.length}):`,
      formatLista(lista7, hoje, false),
      '',
      `🔴 Vencendo amanhã — ${formatDataBR(amanha)} (${lista1.length}):`,
      formatLista(lista1, hoje, false),
    ].join('\n');

    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido',
      resposta_texto: resposta,
      anexos: [],
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
