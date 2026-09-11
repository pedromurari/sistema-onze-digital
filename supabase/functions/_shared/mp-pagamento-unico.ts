/**
 * Materializa no financeiro uma venda única aprovada no Mercado Pago.
 *
 * PIX à vista e cartão parcelado são uma única transação para o Instituto, mesmo quando
 * o comprador divide a fatura em várias parcelas com o emissor. Portanto criamos UMA
 * linha em `pagamentos` pelo bruto integral; as parcelas do cartão não são mensalidades.
 * A unicidade de `mp_payment_id` é a barreira definitiva contra webhook/polling concorrentes.
 */

type SupabaseAdmin = any;

export interface RegistroPagamentoUnico {
  aplicavel: boolean;
  criado: boolean;
  aluno: Record<string, any> | null;
  pagamento: Record<string, any> | null;
}

const moeda = (valor: number) => Math.round(valor * 100) / 100;

export function taxaEfetivaMercadoPago(payment: Record<string, any>): number | null {
  const bruto = Number(payment.transaction_amount);
  const liquido = Number(payment.transaction_details?.net_received_amount);
  if (Number.isFinite(bruto) && Number.isFinite(liquido) && bruto >= liquido) {
    return moeda(bruto - liquido);
  }

  const taxas = Array.isArray(payment.fee_details)
    ? payment.fee_details.reduce((total: number, item: Record<string, any>) => total + (Number(item?.amount) || 0), 0)
    : 0;
  return taxas > 0 ? moeda(taxas) : null;
}

export function montarLinhaPagamentoUnico(
  aluno: Record<string, any>,
  payment: Record<string, any>,
): Record<string, any> {
  const valor = Number(payment.transaction_amount);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`Valor inválido na venda MP ${payment.id}`);

  const dataPagamento = String(payment.date_approved || payment.date_created || new Date().toISOString()).slice(0, 10);
  const parcelasCartao = Math.max(1, Number(payment.installments) || 1);
  return {
    aluno_id: aluno.id,
    turma_id: aluno.turma_id || null,
    produto: aluno.produto || 'psicanalise',
    valor: moeda(valor),
    mes_referencia: `${dataPagamento.slice(0, 7)}-01`,
    data_vencimento: dataPagamento,
    data_pagamento: dataPagamento,
    numero_parcela: 1,
    status: 'pago',
    observacoes: aluno.forma_pagamento === 'cartao'
      ? `Venda única Mercado Pago (${parcelasCartao}x no cartão)`
      : 'Venda única Mercado Pago (Pix à vista)',
    forma_pagamento: aluno.forma_pagamento,
    conta_recebimento: 'mercado_pago',
    mp_payment_id: String(payment.id),
    taxa_valor: taxaEfetivaMercadoPago(payment),
  };
}

export async function registrarPagamentoUnicoMercadoPago(
  supabase: SupabaseAdmin,
  payment: Record<string, any>,
): Promise<RegistroPagamentoUnico> {
  const alunoId = payment.external_reference ? String(payment.external_reference) : '';
  const paymentId = payment.id != null ? String(payment.id) : '';
  if (payment.status !== 'approved' || !alunoId || !paymentId) {
    return { aplicavel: false, criado: false, aluno: null, pagamento: null };
  }

  const { data: aluno, error: alunoErro } = await supabase
    .from('alunos')
    .select('id, nome, email, whatsapp, cobranca_telefone, cpf, data_nascimento, endereco, cep, cidade_estado, turma_id, produto, forma_pagamento, autentique_documento_id, autentique_link_assinatura')
    .eq('id', alunoId)
    .maybeSingle();
  if (alunoErro) throw new Error(`Falha ao buscar aluno da venda MP: ${alunoErro.message}`);

  // Assinatura recorrente já consome as 15 parcelas previamente criadas. Esta função é
  // exclusiva para pagamentos únicos e jamais deve criar uma 16ª linha nesse fluxo.
  if (!aluno || !['avista', 'cartao'].includes(String(aluno.forma_pagamento))) {
    return { aplicavel: false, criado: false, aluno: aluno ?? null, pagamento: null };
  }

  const { data: existente, error: existenteErro } = await supabase
    .from('pagamentos')
    .select('id, aluno_id, valor, numero_parcela')
    .eq('mp_payment_id', paymentId)
    .maybeSingle();
  if (existenteErro) throw new Error(`Falha ao conferir pagamento MP: ${existenteErro.message}`);
  if (existente) return { aplicavel: true, criado: false, aluno, pagamento: existente };

  const linha = montarLinhaPagamentoUnico(aluno, payment);
  const { data: inserido, error: inserirErro } = await supabase
    .from('pagamentos')
    .insert(linha)
    .select('id, aluno_id, valor, numero_parcela')
    .single();

  if (inserirErro) {
    // A constraint única resolve a corrida webhook × polling. Quem perder recebe 23505
    // e trata como sucesso idempotente, sem repetir confirmação ao aluno.
    if (inserirErro.code === '23505') {
      const { data: concorrente } = await supabase
        .from('pagamentos')
        .select('id, aluno_id, valor, numero_parcela')
        .eq('mp_payment_id', paymentId)
        .maybeSingle();
      return { aplicavel: true, criado: false, aluno, pagamento: concorrente ?? null };
    }
    throw new Error(`Falha ao registrar venda MP no financeiro: ${inserirErro.message}`);
  }

  const { count } = await supabase
    .from('pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', aluno.id)
    .eq('status', 'pago');
  await supabase.from('alunos').update({ mensalidades_pagas: count ?? 1 }).eq('id', aluno.id);

  return { aplicavel: true, criado: true, aluno, pagamento: inserido };
}
