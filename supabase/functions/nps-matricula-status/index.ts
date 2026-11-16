/**
 * nps-matricula-status
 * Polling do status do PIX gerado por nps-matricula-criar (mesma UX de
 * matricula-pagamento-criar, mas isolado -- essa assinatura não tem N
 * parcelas fixas, então a lógica de "o que fazer quando paga" é diferente
 * (gera só a próxima, nunca um lote) e fica duplicada aqui de propósito,
 * assim como entre as demais edge functions deste projeto.
 *
 * O MESMO "o que fazer quando paga" também roda no webhook real do Asaas
 * (branch "numerologia" dentro de asaas-webhook-time-comercial) -- o
 * polling existe só pra UX (o aluno não fica esperando o webhook, que pode
 * demorar) e corre risco de "ganhar a corrida" do webhook; por isso o
 * UPDATE atômico (status<>'pago') abaixo, idêntico ao padrão já usado nas
 * outras functions de pagamento deste projeto.
 *
 * Body: { paymentId: string }
 * Resposta: { ok, status: 'approved'|'pending' }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY, ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

// Mesma regra de "dia travado" do resto do projeto (ex.: matricula-pagamento-criar):
// ancora no dia-do-mês da turma, sem passar do último dia de um mês mais curto.
function proximoVencimento(diaVencimento: number): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1; // mês seguinte
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaVencimento, ultimoDia);
  const d = new Date(ano, mes, dia, 12, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function liberarAcessoMembros(supabaseUrl: string, serviceKey: string, alunoId: string) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/membros-liberar-acesso-aluno`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'x-cron-key': Deno.env.get('MEMBROS_LIBERAR_KEY') ?? '',
      },
      body: JSON.stringify({ alunoId }),
    });
  } catch (e) {
    console.error('nps-matricula-status: falha ao liberar acesso à área de membros', alunoId, e);
  }
}

async function enviarConfirmacaoNps(
  supabaseUrl: string, serviceKey: string,
  aluno: { nome: string | null; email: string | null; whatsapp: string | null; cobranca_telefone: string | null },
  valor: number, mesReferencia: string,
) {
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const financeiroKey = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
  const nome = aluno.nome || 'aluno(a)';
  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const [ano, mes] = mesReferencia.split('-');
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const refMes = `${meses[Number(mes) - 1]}/${ano}`;

  const numero = aluno.cobranca_telefone || aluno.whatsapp;
  if (numero) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
        method: 'POST', headers: { ...fnHeaders, 'x-financeiro-key': financeiroKey },
        body: JSON.stringify({
          numero,
          mensagem: `✅ Pagamento confirmado, ${nome}!\n\nRecebemos sua mensalidade da *Mentoria NPS* (${refMes}), no valor de *R$ ${valorFmt}*.\n\nA próxima cobrança será gerada automaticamente e enviada por aqui.\n\nQualquer dúvida, é só chamar. Financeiro IDM.`,
          instance_name: 'Financeiro IDM',
        }),
      });
    } catch (e) {
      console.error('nps-matricula-status: falha ao enviar whatsapp de confirmação', e);
    }
  }
  if (aluno.email) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/email-enviar`, {
        method: 'POST', headers: fnHeaders,
        body: JSON.stringify({
          to: aluno.email, to_name: nome,
          subject: 'Pagamento confirmado - Mentoria NPS',
          html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${nome}!</p><p>Confirmamos sua mensalidade da Mentoria NPS (${refMes}), no valor de <strong>R$ ${valorFmt}</strong>.</p><p>Qualquer dúvida, é só responder este e-mail.</p>`,
        }),
      });
    } catch (e) {
      console.error('nps-matricula-status: falha ao enviar email de confirmação', e);
    }
  }
}

async function gerarProximaParcela(
  supabase: ReturnType<typeof createClient>,
  aluno: { id: string; dia_vencimento: number | null; valor_mensalidade: number | null; nome: string | null },
  numeroParcelaAtual: number,
) {
  const { data: fresh } = await supabase.from('alunos').select('asaas_customer_id, status').eq('id', aluno.id).maybeSingle();
  if (!fresh?.asaas_customer_id || fresh.status !== 'ativo') return;

  const diaVencimento = Number(aluno.dia_vencimento) || 10;
  const valor = Number(aluno.valor_mensalidade) || 100;
  const dueDate = proximoVencimento(diaVencimento);

  const { data: pagamentoRow, error: pagErr } = await supabase
    .from('pagamentos')
    .insert({
      aluno_id: aluno.id, produto: 'numerologia', valor,
      mes_referencia: primeiroDiaDoMes(dueDate), data_vencimento: dueDate,
      numero_parcela: numeroParcelaAtual + 1, status: 'pendente',
    })
    .select('id')
    .single();
  if (pagErr || !pagamentoRow) {
    console.error('nps-matricula-status: falha ao criar próxima parcela', aluno.id, pagErr);
    return;
  }

  const { ok, data } = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: fresh.asaas_customer_id, billingType: 'PIX', value: valor, dueDate,
      description: `Mentoria NPS - mensalidade - ${aluno.nome ?? aluno.id}`,
      externalReference: pagamentoRow.id,
    }),
  });
  if (!ok || !data?.id) {
    console.error('nps-matricula-status: falha ao gerar cobrança da próxima parcela', aluno.id, data);
    return;
  }
  await supabase.from('pagamentos').update({
    asaas_payment_id: String(data.id), link_pagamento_asaas: data.invoiceUrl ?? null,
  }).eq('id', pagamentoRow.id);
}

export async function processarPagamentoNpsAprovado(
  supabase: ReturnType<typeof createClient>,
  pagamentoId: string,
) {
  const { data: pagamento } = await supabase
    .from('pagamentos')
    .update({ status: 'pago', data_pagamento: hojeSP(), conta_recebimento: 'asaas' })
    .eq('id', pagamentoId)
    .neq('status', 'pago')
    .select('id, aluno_id, valor, numero_parcela, mes_referencia')
    .maybeSingle();
  if (!pagamento) return; // já processado (webhook ou polling ganhou antes)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { data: aluno } = await supabase
    .from('alunos')
    .select('id, nome, email, whatsapp, cobranca_telefone, dia_vencimento, valor_mensalidade, mensalidades_pagas')
    .eq('id', pagamento.aluno_id)
    .maybeSingle();
  if (!aluno) return;

  await supabase.from('alunos').update({ mensalidades_pagas: Number(aluno.mensalidades_pagas ?? 0) + 1 }).eq('id', aluno.id);

  await enviarConfirmacaoNps(supabaseUrl, serviceKey, aluno as any, Number(pagamento.valor), String(pagamento.mes_referencia)).catch(e =>
    console.error('processarPagamentoNpsAprovado: falha ao enviar confirmação', e));

  if (pagamento.numero_parcela === 1) {
    await liberarAcessoMembros(supabaseUrl, serviceKey, aluno.id as string);
  }

  await gerarProximaParcela(supabase, aluno as any, Number(pagamento.numero_parcela)).catch(e =>
    console.error('processarPagamentoNpsAprovado: falha ao gerar próxima parcela', e));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    if (!ASAAS_API_KEY) {
      console.error('nps-matricula-status: ASAAS_API_KEY não configurado');
      return json({ ok: false, erro: 'Indisponível no momento.' }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.paymentId ?? '');
    if (!paymentId) return json({ ok: false, erro: 'paymentId ausente' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { ok, data } = await asaasFetch(`/payments/${paymentId}`, { method: 'GET' });
    if (!ok) {
      console.error('nps-matricula-status: erro ao consultar status', data);
      return json({ ok: false, erro: 'Erro ao consultar status do pagamento.' }, 400);
    }

    const pago = data.status === 'RECEIVED' || data.status === 'CONFIRMED';
    if (pago && data.externalReference) {
      await processarPagamentoNpsAprovado(supabase, String(data.externalReference));
    }

    return json({ ok: true, status: pago ? 'approved' : (data.status === 'OVERDUE' ? 'rejected' : 'pending') });
  } catch (error) {
    console.error('nps-matricula-status error:', error);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
