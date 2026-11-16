/**
 * asaas-webhook-time-comercial
 * Recebe as notificações do Asaas (PRODUCAO) pros boletos das parcelas 2-15
 * do plano "boleto" da matrícula do Time Comercial (gerados por
 * matricula-boleto-mensal-gerar). Mantém `pagamentos` sincronizado com o
 * status real no Asaas e recalcula `alunos.mensalidades_pagas` -- mesmo
 * papel que mp-webhook-time-comercial cumpre pro Mercado Pago (PIX/cartão),
 * só que aqui é sempre pela convenção "pagamentos.id" (nunca "alunos.id",
 * porque a 1ª parcela desse plano é PIX-MP, não passa por aqui).
 *
 * URL a cadastrar manualmente no painel Asaas → Integrações → Webhooks:
 *   https://<project-ref>.supabase.co/functions/v1/asaas-webhook-time-comercial
 * Marcar pelo menos os eventos: PAYMENT_RECEIVED e PAYMENT_CONFIRMED.
 *
 * Auth: Asaas manda de volta, em todo webhook, o header configurado como
 * "Token de autenticação" na hora de cadastrar o endpoint no painel --
 * validamos contra ASAAS_WEBHOOK_TOKEN (secret gerada por nós, não é a
 * ASAAS_API_KEY). Notificação sem esse header/valor batendo é rejeitada com
 * 401 antes de tocar em qualquer dado.
 *
 * Sempre responde 200 rápido em qualquer evento reconhecido/ignorado -- o
 * Asaas re-tenta agressivamente em resposta != 2xx (mesmo princípio do
 * mp-webhook-time-comercial).
 *
 * BRANCH "numerologia" (16/11/2026): mesma URL recebe também os pagamentos
 * da Mentoria NPS (link público /matricula/nps -> nps-matricula-criar),
 * porque o Asaas só permite UM webhook de pagamento por conta -- não dá pra
 * cadastrar uma URL separada só pra esse produto. Diferença real: NPS é
 * assinatura (1 parcela pendente por vez, nunca um lote de 15), então na 1ª
 * confirmação a gente gera a PRÓXIMA parcela (nunca contrato Autentique,
 * esse produto não tem) e libera acesso na Área de Membros. Ver
 * processarPagamentoNumerologia() abaixo -- duplicado de propósito de
 * nps-matricula-status (mesmo motivo de todo o resto deste arquivo: edge
 * functions Deno não importam entre si nesse projeto).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
const ASAAS_API = 'https://api.asaas.com/v3';

// Taxa REAL da transação: o Asaas devolve `netValue` (valor já com a taxa dele
// descontada) no próprio webhook. taxa = value - netValue. Se por algum motivo
// não vier no corpo, busca em GET /payments/{id}. Sem número confiável, deixa
// null -- melhor não gravar do que gravar chute (o Balanço/CFO leem taxa_valor
// pra montar o líquido real).
//
// ACHADO EM AUDITORIA (16/11/2026, Pedro reparou no extrato financeiro do
// Asaas): `netValue` só reflete a "Taxa do Pix"/"Taxa de boleto". O Asaas
// lança, em ALGUNS pagamentos (não todos -- conferido: 76 de 101 recebidos
// num período de 45 dias, ~75%), uma SEGUNDA taxa separada, "Taxa de
// mensageria" (R$0,99), direto no extrato da conta -- não entra no objeto
// do pagamento nem no `netValue`. Como não é universal, não dá pra somar
// um valor fixo "no escuro" (tentei isso primeiro e o Pedro corrigiu --
// teria inflado a taxa de pagamentos que não tiveram a segunda cobrança).
// Em vez disso, busca de verdade em /financialTransactions se existe uma
// linha "Taxa de mensageria" citando o número desta fatura, e só soma se
// achar.
async function buscarTaxaMensageria(invoiceNumber: string | null): Promise<number> {
  if (!invoiceNumber || !ASAAS_API_KEY) return 0;
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({ startDate: hoje, endDate: hoje, limit: '100' });
    const res = await fetch(`${ASAAS_API}/financialTransactions?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
    });
    const data = await res.json().catch(() => ({}));
    const itens = Array.isArray(data?.data) ? data.data : [];
    const linha = itens.find((t: { description?: string }) =>
      /mensageria/i.test(t.description ?? '') && (t.description ?? '').includes(invoiceNumber));
    return linha ? Math.abs(Number(linha.value) || 0) : 0;
  } catch (e) {
    console.error('asaas-webhook-time-comercial: falha ao buscar taxa de mensageria', invoiceNumber, e);
    return 0;
  }
}

async function calcularTaxaAsaas(
  paymentId: string,
  value: number,
  netValueDoWebhook: unknown,
  invoiceNumber: string | null,
): Promise<number | null> {
  let net = typeof netValueDoWebhook === 'number' ? netValueDoWebhook : null;
  if (net == null && ASAAS_API_KEY) {
    try {
      const res = await fetch(`${ASAAS_API}/payments/${paymentId}`, {
        headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.netValue === 'number') net = data.netValue;
    } catch (e) {
      console.error('asaas-webhook-time-comercial: falha ao buscar netValue', paymentId, e);
    }
  }
  if (net == null || !(value > 0) || net > value) return null;
  const taxaMensageria = await buscarTaxaMensageria(invoiceNumber);
  return Math.round((value - net + taxaMensageria) * 100) / 100;
}

// ── NPS (numerologia) -- assinatura, não lote de parcelas ────────────────────
// Ver comentário no topo do arquivo. Tudo abaixo até EVENTOS_PAGO só roda pra
// aluno.produto === 'numerologia'.

function primeiroDiaDoMesNps(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

// Mesma regra de "dia travado" do resto do projeto (ex.: matricula-pagamento-criar).
function proximoVencimentoNps(diaVencimento: number): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1; // mês seguinte
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaVencimento, ultimoDia);
  const d = new Date(ano, mes, dia, 12, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function liberarAcessoMembrosNps(supabaseUrl: string, serviceKey: string, alunoId: string) {
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
    console.error('asaas-webhook-time-comercial (NPS): falha ao liberar acesso à área de membros', alunoId, e);
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
      console.error('asaas-webhook-time-comercial (NPS): falha ao enviar whatsapp de confirmação', e);
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
      console.error('asaas-webhook-time-comercial (NPS): falha ao enviar email de confirmação', e);
    }
  }
}

async function gerarProximaParcelaNps(
  supabase: ReturnType<typeof createClient>,
  aluno: { id: string; dia_vencimento: number | null; valor_mensalidade: number | null; nome: string | null },
  numeroParcelaAtual: number,
) {
  const { data: fresh } = await supabase.from('alunos').select('asaas_customer_id, status').eq('id', aluno.id).maybeSingle();
  if (!fresh?.asaas_customer_id || fresh.status !== 'ativo') return;

  const diaVencimento = Number(aluno.dia_vencimento) || 10;
  const valor = Number(aluno.valor_mensalidade) || 100;
  const dueDate = proximoVencimentoNps(diaVencimento);

  const { data: pagamentoRow, error: pagErr } = await supabase
    .from('pagamentos')
    .insert({
      aluno_id: aluno.id, produto: 'numerologia', valor,
      mes_referencia: primeiroDiaDoMesNps(dueDate), data_vencimento: dueDate,
      numero_parcela: numeroParcelaAtual + 1, status: 'pendente',
    })
    .select('id')
    .single();
  if (pagErr || !pagamentoRow) {
    console.error('asaas-webhook-time-comercial (NPS): falha ao criar próxima parcela', aluno.id, pagErr);
    return;
  }

  const { ok, data } = await (async () => {
    const res = await fetch(`${ASAAS_API}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY ?? '' },
      body: JSON.stringify({
        customer: fresh.asaas_customer_id, billingType: 'PIX', value: valor, dueDate,
        description: `Mentoria NPS - mensalidade - ${aluno.nome ?? aluno.id}`,
        externalReference: pagamentoRow.id,
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, data: body };
  })();
  if (!ok || !data?.id) {
    console.error('asaas-webhook-time-comercial (NPS): falha ao gerar cobrança da próxima parcela', aluno.id, data);
    return;
  }
  await supabase.from('pagamentos').update({
    asaas_payment_id: String(data.id), link_pagamento_asaas: data.invoiceUrl ?? null,
  }).eq('id', pagamentoRow.id);
}

async function processarPagamentoNumerologia(
  supabase: ReturnType<typeof createClient>,
  pagamento: { id: string; aluno_id: string; valor: number; numero_parcela: number },
  aluno: { id: string; nome: string | null; email: string | null; whatsapp: string | null; cobranca_telefone: string | null; dia_vencimento: number | null; valor_mensalidade: number | null },
  mesReferencia: string,
) {
  // mensalidades_pagas já foi recalculado (recontagem, não incremento) pelo
  // chamador (marcarPago) antes de entrar aqui -- não repetir.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  await enviarConfirmacaoNps(supabaseUrl, serviceKey, aluno, Number(pagamento.valor), mesReferencia).catch(e =>
    console.error('processarPagamentoNumerologia: falha ao enviar confirmação', e));

  if (pagamento.numero_parcela === 1) {
    await liberarAcessoMembrosNps(supabaseUrl, serviceKey, aluno.id);
  }

  await gerarProximaParcelaNps(supabase, aluno, Number(pagamento.numero_parcela)).catch(e =>
    console.error('processarPagamentoNumerologia: falha ao gerar próxima parcela', e));
}

const EVENTOS_PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

// ── Contrato (Autentique) -- best-effort, só no 1º pagamento aprovado ────────
// Mesma função que mp-webhook-time-comercial já usa (não dá pra importar
// entre edge functions Deno separadas, duplicada de propósito). Reaproveita
// autentique-criar (mesmo fluxo de FormularioAluno.tsx) -- gera o contrato e
// manda o link de assinatura por WhatsApp; o e-mail ao signatário sai pela
// própria Autentique. Nunca lança -- falha aqui não derruba a resposta 200.
//
// BUG REAL corrigido em 2026-09-04: desde que o boleto passou a ser 100%
// Asaas (inclusive a 1ª parcela, que antes era PIX-MP e por isso passava
// pelo enviarContrato de mp-webhook-time-comercial), essa function nunca
// chamava enviarContrato -- nenhum aluno do plano boleto estava recebendo
// contrato automático. Corrigido chamando aqui, na 1ª parcela confirmada.
async function enviarContrato(
  supabaseUrl: string,
  serviceKey: string,
  aluno: {
    id: string; cpf: string | null; data_nascimento: string | null;
    endereco: string | null; cep: string | null; cidade_estado: string | null;
  },
): Promise<void> {
  if (!aluno.cpf || !aluno.data_nascimento || !aluno.endereco || !aluno.cidade_estado) {
    console.error('asaas-webhook-time-comercial: dados insuficientes pra gerar contrato', aluno.id);
    return;
  }
  try {
    await fetch(`${supabaseUrl}/functions/v1/autentique-criar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        aluno_id: aluno.id,
        cpf: aluno.cpf,
        data_nascimento: aluno.data_nascimento,
        endereco: aluno.endereco,
        cep: aluno.cep,
        cidade_estado: aluno.cidade_estado,
      }),
    });
  } catch (e) {
    console.error('asaas-webhook-time-comercial: falha ao gerar/enviar contrato', aluno.id, e);
  }
}

// ── Confirmação por WhatsApp + e-mail -- best-effort, nunca derruba o 200 ────
// Nome amigável do produto pra mensagem de confirmação não sair genérica
// ("sua matrícula no Instituto Despertamente") pra quem pagou Sociedade IDM,
// NPA ou PNL -- achado real 2026-11-02, pedido do dono: a confirmação tem
// que ser referente ao pagamento de verdade. Produto desconhecido/nulo cai
// no texto genérico de antes (fallback seguro).
function labelProduto(produto: string | null | undefined): string {
  switch (produto) {
    case 'psicanalise': return 'Psicanálise';
    case 'sociedade-idm': return 'mensalidade da Sociedade IDM';
    case 'npa-mentoria': return 'mentoria NPA';
    case 'pnl-master': return 'curso de PNL Master';
    case 'numerologia': return 'mensalidade de Numerologia (NPS)';
    default: return 'matrícula no Instituto Despertamente';
  }
}

async function enviarConfirmacoes(
  supabaseUrl: string,
  serviceKey: string,
  aluno: { nome: string | null; email: string | null; whatsapp: string | null; cobranca_telefone: string | null; produto?: string | null },
  valor: number,
  parcela: number,
  totalParcelas: number,
): Promise<void> {
  // x-financeiro-key: desde o hardening de 03/11 (incidente de campanha saindo pelo
  // disp3), wpp-enviar recusa com 403 qualquer pedido de instance_name='disp3' sem essa
  // chave -- achado real 04/11: confirmação de pagamento ficou muda (403 silencioso, só
  // logado) até esse header ser adicionado aqui.
  const financeiroKey = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'x-financeiro-key': financeiroKey };
  const nome = aluno.nome || 'aluno(a)';
  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  // totalParcelas vem de alunos.total_mensalidades -- antes fixo em "/15", errado
  // pra planos com outra contagem (ex: "125x18", 18 parcelas; "npa-mentoria",
  // pagamento único = 1). Achado real 2026-10-08, pedido do dono pra confirmação
  // automática ficar confiável antes de plugar emissão de nota fiscal nela.
  const refParcela = totalParcelas > 1 ? `a parcela ${parcela}/${totalParcelas}` : 'o pagamento';
  const refProduto = labelProduto(aluno.produto);

  const numero = aluno.cobranca_telefone || aluno.whatsapp;
  if (numero) {
    const mensagem = `✅ Pagamento confirmado, ${nome}!\n\nRecebemos ${refParcela} (*R$ ${valorFmt}*) da sua ${refProduto}.\n\nQualquer dúvida, é só chamar por aqui.`;
    try {
      await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
        method: 'POST', headers: fnHeaders,
        // instance_name fixo em 'disp3' (WhatsApp "Financeiro IDM") -- pedido
        // explícito do dono do produto pra esse número ser o wpp de
        // financeiro (2026-09-03), em vez de cair no rodízio por prioridade.
        body: JSON.stringify({ numero, mensagem, instance_name: 'disp3' }),
      });
    } catch (e) {
      console.error('asaas-webhook-time-comercial: falha ao enviar whatsapp de confirmação', e);
    }
  }

  if (aluno.email) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/email-enviar`, {
        method: 'POST', headers: fnHeaders,
        body: JSON.stringify({
          to: aluno.email,
          to_name: nome,
          subject: 'Pagamento confirmado - Instituto Despertamente',
          html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${nome}!</p><p>Confirmamos ${refParcela} (<strong>R$ ${valorFmt}</strong>) da sua ${refProduto}.</p><p>Qualquer dúvida, é só responder este e-mail.</p>`,
        }),
      });
    } catch (e) {
      console.error('asaas-webhook-time-comercial: falha ao enviar email de confirmação', e);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (ASAAS_WEBHOOK_TOKEN) {
      const tokenHeader = req.headers.get('asaas-access-token');
      if (tokenHeader !== ASAAS_WEBHOOK_TOKEN) {
        console.error('asaas-webhook-time-comercial: token ausente ou inválido');
        return new Response(JSON.stringify({ ok: false, erro: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const event = String(body?.event ?? '');
    const payment = body?.payment;

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ ok: true, aviso: 'sem event/payment' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!EVENTOS_PAGO.has(event)) {
      return new Response(JSON.stringify({ ok: true, ignorado: event }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: pagamento } = await supabase
      .from('pagamentos')
      .select('id, aluno_id, valor, numero_parcela, status, mes_referencia')
      .eq('asaas_payment_id', String(payment.id))
      .maybeSingle();

    if (!pagamento) {
      // externalReference é a mesma coisa que asaas_payment_id deveria bater,
      // mas por segurança tenta achar pelo externalReference também (id da
      // linha em `pagamentos`, gravado na criação -- ver
      // matricula-boleto-mensal-gerar).
      const externalReference = payment.externalReference ? String(payment.externalReference) : null;
      if (!externalReference) {
        return new Response(JSON.stringify({ ok: true, aviso: 'pagamento não encontrado' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: pagamentoPorRef } = await supabase
        .from('pagamentos')
        .select('id, aluno_id, valor, numero_parcela, status, mes_referencia')
        .eq('id', externalReference)
        .maybeSingle();

      if (!pagamentoPorRef) {
        return new Response(JSON.stringify({ ok: true, aviso: 'pagamento não encontrado (externalReference)' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return await marcarPago(supabase, pagamentoPorRef, String(payment.id), payment.netValue, payment.invoiceNumber ? String(payment.invoiceNumber) : null);
    }

    return await marcarPago(supabase, pagamento, String(payment.id), payment.netValue, payment.invoiceNumber ? String(payment.invoiceNumber) : null);
  } catch (error) {
    console.error('asaas-webhook-time-comercial error:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function marcarPago(
  supabase: ReturnType<typeof createClient>,
  pagamento: { id: string; aluno_id: string; valor: number; numero_parcela: number; status: string | null; mes_referencia?: string | null },
  asaasPaymentId: string,
  netValueDoWebhook?: unknown,
  invoiceNumber?: string | null,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const taxaValor = await calcularTaxaAsaas(asaasPaymentId, Number(pagamento.valor), netValueDoWebhook, invoiceNumber ?? null);

  // UPDATE...WHERE status<>'pago'...RETURNING (não confiar no `pagamento`
  // pré-carregado) de propósito: esse `pagamento` foi lido num SELECT
  // separado, antes desta function ser chamada -- entre esse SELECT e este
  // UPDATE, o polling de checkStatus (matricula-pagamento-criar, a cada 4s)
  // pode ter marcado a mesma parcela como paga primeiro. Sem essa checagem
  // atômica, os dois mandariam confirmação/contrato em dobro pro aluno.
  const { data: transicionou } = await supabase
    .from('pagamentos')
    .update({
      status: 'pago',
      // UTC, não a data de Brasília -- pagamento das ~21h às 23h59 (horário de
      // Brasília) virava o dia seguinte (UTC já passou da meia-noite). Achado
      // real 2026-09-30: venda das ~23h ficou registrada como 01/10.
      data_pagamento: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
      asaas_payment_id: asaasPaymentId,
      conta_recebimento: 'asaas',
      ...(taxaValor != null ? { taxa_valor: taxaValor } : {}),
    })
    .eq('id', pagamento.id)
    .neq('status', 'pago')
    .select('id')
    .maybeSingle();
  const jaEstavaPago = !transicionou;

  // Recalcula mensalidades_pagas -- mesma convenção usada por
  // mp-webhook-time-comercial (contagem de pagamentos status='pago').
  const { count } = await supabase
    .from('pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', pagamento.aluno_id)
    .eq('status', 'pago');
  await supabase.from('alunos').update({ mensalidades_pagas: count ?? 0 }).eq('id', pagamento.aluno_id);

  if (!jaEstavaPago) {
    const { data: aluno } = await supabase
      .from('alunos')
      .select('nome, email, whatsapp, cobranca_telefone, cpf, data_nascimento, endereco, cep, cidade_estado, total_mensalidades, produto, dia_vencimento, valor_mensalidade, forma_pagamento')
      .eq('id', pagamento.aluno_id)
      .maybeSingle();
    if (aluno) {
      // NPS (numerologia) é assinatura, não lote de parcelas -- fluxo
      // totalmente separado (gera a próxima, libera área de membros, sem
      // contrato Autentique). Ver comentário no topo do arquivo.
      //
      // IMPORTANTE: o discriminador não é só produto==='numerologia' --
      // os 22 alunos NPS que já existiam antes deste link (16/11/2026) têm
      // forma_pagamento='boleto' e JÁ têm as próprias parcelas 2-10
      // pré-criadas (plano antigo, de lote fixo). Se esse branch rodasse pra
      // eles também, geraria uma parcela NOVA em cima das que já existem
      // (duplicata) toda vez que pagassem. Só o link novo grava
      // forma_pagamento='pix' (nps-matricula-criar) -- é esse o sinal real
      // de "assinatura", não o produto sozinho.
      if ((aluno as any).produto === 'numerologia' && (aluno as any).forma_pagamento === 'pix') {
        await processarPagamentoNumerologia(
          supabase,
          pagamento,
          { id: pagamento.aluno_id, ...aluno } as any,
          String(pagamento.mes_referencia ?? new Date().toISOString().slice(0, 10)),
        ).catch((e) => console.error('asaas-webhook-time-comercial: falha ao processar pagamento NPS', e));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await enviarConfirmacoes(supabaseUrl, serviceKey, aluno as any, Number(pagamento.valor), pagamento.numero_parcela, Number((aluno as any).total_mensalidades) || 15).catch((e) =>
        console.error('asaas-webhook-time-comercial: falha ao enviar confirmações', e));

      // Contrato só na 1ª parcela do plano boleto (equivalente ao "primeiro
      // pagamento do aluno" que mp-webhook-time-comercial usa como gatilho
      // pra avista/cartão) -- nunca repete nas parcelas 2-15.
      if (pagamento.numero_parcela === 1) {
        await enviarContrato(supabaseUrl, serviceKey, { id: pagamento.aluno_id, ...aluno } as any).catch((e) =>
          console.error('asaas-webhook-time-comercial: falha ao enviar contrato', e));
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
