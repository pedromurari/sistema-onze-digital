/**
 * nps-matricula-status
 * Polling do status do PIX gerado por nps-matricula-criar (mesma UX de
 * matricula-pagamento-criar, mas isolado -- essa assinatura não tem N
 * parcelas fixas, então a lógica de "o que fazer quando paga" é diferente
 * (gera só a próxima, nunca um lote) e fica duplicada aqui de propósito,
 * assim como entre as demais edge functions deste projeto.
 *
 * O MESMO "o que fazer quando paga" também roda no webhook real do gateway
 * -- o polling existe só pra UX (o aluno não fica esperando o webhook, que
 * pode demorar) e corre risco de "ganhar a corrida" do webhook; por isso a
 * trava de idempotência em `pagamentos.pos_processado_em` (ver posPagamentoNps).
 *
 * 23/11/2026 -- MOTOR TROCADO DE ASAAS PRA SYNCPAY (ver nps-matricula-criar).
 * Agora `paymentId` é o UUID da NOSSA parcela, e este endpoint só LÊ o
 * status no banco: quem confirma com a SyncPay é o syncpay-cobranca-webhook,
 * que já consulta a transação e confere o valor antes de marcar como paga.
 * De propósito NÃO consultamos a SyncPay aqui: a API dela aceita no máximo
 * 5 consultas por transação (depois 429), e um polling de 5 em 5 segundos
 * estouraria esse limite em menos de meio minuto, cegando justamente a
 * checagem que o webhook precisa fazer.
 *
 * Body: { paymentId: string }   // uuid de pagamentos.id
 * Resposta: { ok, status: 'approved'|'pending' }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  const { data: fresh } = await supabase.from('alunos').select('status').eq('id', aluno.id).maybeSingle();
  if (fresh?.status !== 'ativo') return;

  const diaVencimento = Number(aluno.dia_vencimento) || 10;
  const valor = Number(aluno.valor_mensalidade) || 100;
  const dueDate = proximoVencimento(diaVencimento);

  // Só a linha da parcela. O PIX da SyncPay NÃO é criado aqui de propósito:
  // seria um QR vivo por ~um mês inteiro antes de alguém olhar pra ele. O
  // checkout-parcela gera na primeira visita de /pagar/<token>, e a cobrança
  // manda esse link -- mesmo caminho das parcelas de todos os outros produtos.
  const { error: pagErr } = await supabase
    .from('pagamentos')
    .insert({
      aluno_id: aluno.id, produto: 'numerologia', valor,
      mes_referencia: primeiroDiaDoMes(dueDate), data_vencimento: dueDate,
      numero_parcela: numeroParcelaAtual + 1, status: 'pendente',
    });
  if (pagErr) console.error('nps-matricula-status: falha ao criar próxima parcela', aluno.id, pagErr);
}

/**
 * O que acontece DEPOIS que a mensalidade do NPS é paga: libera a área de
 * membros (só na 1ª), manda a confirmação e cria a próxima mensalidade.
 *
 * A trava de idempotência é `pagamentos.pos_processado_em`, e não mais o
 * próprio flip pra 'pago'. Motivo (23/11/2026): com a SyncPay existem dois
 * caminhos que podem marcar a parcela como paga -- o webhook e o polling da
 * tela -- e quem chegasse em segundo via "0 linhas" no UPDATE antigo e
 * pulava tudo isto. Resultado seria aluna pagando e não recebendo acesso.
 * Aqui o UPDATE atômico é só do marcador, então exatamente um dos dois roda.
 */
export async function posPagamentoNps(
  supabase: ReturnType<typeof createClient>,
  pagamentoId: string,
) {
  const { data: pagamento } = await supabase
    .from('pagamentos')
    .update({ pos_processado_em: new Date().toISOString() })
    .eq('id', pagamentoId)
    .eq('status', 'pago')
    .is('pos_processado_em', null)
    .select('id, aluno_id, valor, numero_parcela, mes_referencia')
    .maybeSingle();
  if (!pagamento) return; // já processado, ou ainda não está paga

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
    console.error('posPagamentoNps: falha ao enviar confirmação', e));

  if (pagamento.numero_parcela === 1) {
    await liberarAcessoMembros(supabaseUrl, serviceKey, aluno.id as string);
  }

  await gerarProximaParcela(supabase, aluno as any, Number(pagamento.numero_parcela)).catch(e =>
    console.error('posPagamentoNps: falha ao gerar próxima parcela', e));
}

/**
 * Compatibilidade com o fluxo antigo do Asaas (asaas-webhook-time-comercial
 * ainda importa este nome): marca como paga e então roda o pós-pagamento.
 */
export async function processarPagamentoNpsAprovado(
  supabase: ReturnType<typeof createClient>,
  pagamentoId: string,
) {
  await supabase
    .from('pagamentos')
    .update({ status: 'pago', data_pagamento: hojeSP(), conta_recebimento: 'asaas' })
    .eq('id', pagamentoId)
    .neq('status', 'pago');
  await posPagamentoNps(supabase, pagamentoId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.paymentId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return json({ ok: false, erro: 'paymentId ausente' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: parcela } = await supabase
      .from('pagamentos')
      .select('id, status')
      .eq('id', paymentId)
      .maybeSingle();
    if (!parcela) return json({ ok: false, erro: 'Cobrança não encontrada.' }, 404);

    // O webhook da SyncPay é quem confirma com o gateway e marca 'pago'. Aqui
    // só reagimos à transição -- e posPagamentoNps é idempotente pelo marcador
    // `pos_processado_em`, então chamar de novo no polling não duplica nada.
    if (parcela.status === 'pago') {
      await posPagamentoNps(supabase, paymentId);
      return json({ ok: true, status: 'approved' });
    }

    return json({ ok: true, status: 'pending' });
  } catch (error) {
    console.error('nps-matricula-status error:', error);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
