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
      .from('equipe_11ds_tarefas').select('id, agente_id').eq('id', tarefaId).single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteId = tarefa.agente_id;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: 'Conferindo o financeiro...', updated_at: new Date().toISOString() }).eq('id', agenteId);

    const hoje = hojeSaoPaulo();
    const em7dias = addDias(hoje, 7);
    const amanha = addDias(hoje, 1);

    const selectComAluno = 'id, aluno_id, valor, data_pagamento, data_vencimento, numero_parcela, cobranca_contatado_em, alunos(nome, whatsapp, cobranca_telefone)';

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

    const inadimplentesRaw = [...(atrasados.data ?? []), ...(pendentesVencidos.data ?? [])] as unknown as PagamentoRaw[];
    const pagosHojeRaw = (pagosHoje.data ?? []) as unknown as PagamentoRaw[];
    const vencendo7Raw = (vencendo7.data ?? []) as unknown as PagamentoRaw[];
    const vencendo1Raw = (vencendo1.data ?? []) as unknown as PagamentoRaw[];

    const dados = {
      pagosHoje: pagosHojeRaw.map(p => paraItem(p, hoje, false)),
      inadimplentes: inadimplentesRaw.map(p => paraItem(p, hoje, true)),
      vencendo7: vencendo7Raw.map(p => paraItem(p, hoje, false)),
      vencendo1: vencendo1Raw.map(p => paraItem(p, hoje, false)),
      hoje,
    };

    const totalPagoHoje = dados.pagosHoje.reduce((s, p) => s + p.valor, 0);
    const totalInadimplente = dados.inadimplentes.reduce((s, p) => s + p.valor, 0);
    const fmtValor = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const resposta = [
      `📊 Resumo financeiro de hoje`,
      `💰 Pagamentos de hoje: ${dados.pagosHoje.length} (${fmtValor(totalPagoHoje)})`,
      `⚠️ Inadimplentes: ${dados.inadimplentes.length} (${fmtValor(totalInadimplente)} em atraso)`,
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
