// ── Geração/sincronização de parcelas de aluno ─────────────────────────────
// Extraído de src/components/crm/Financeiro.tsx (sincronizarParcelasAluno +
// quickAssignTurma + helpers de pagamento) para ser reaproveitado em outros
// pontos do CRM — hoje: TimeComercial.tsx (aba Operação, "Alunos aguardando
// turma"), onde um vendedor atribui a turma de um aluno que ele mesmo
// reivindicou, sem precisar de acesso à tela de Financeiro.
//
// Mantém exatamente a mesma lógica que já existia em Financeiro.tsx —
// nenhuma regra de negócio foi alterada nesta extração.

import { supabase } from '@/integrations/supabase/client';

export type PaymentMethod = 'boleto' | 'cartao' | 'avista';

export const todayDateInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDateOnly = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0);
};

export const normalizePaymentMethod = (value?: string | null): PaymentMethod => {
  const normalized = (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (normalized === 'cartao') return 'cartao';
  if (normalized === 'pix' || normalized === 'avista' || normalized === 'a_vista' || normalized === 'a vista') return 'avista';
  return 'boleto';
};

export const paymentMethodTotal = (method?: string | null) => {
  const normalized = normalizePaymentMethod(method);
  if (normalized === 'cartao') return 1;
  if (normalized === 'avista') return 1;
  return 15;
};

const readDueDay = (value?: string | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

export const extractDueDay = (value?: string | number | null) => readDueDay(value) || 10;

export const buildInstallments = ({
  alunoId,
  turmaId,
  produto,
  valor,
  method,
  diaVencimento,
  dataMatricula,
  dataSegundaParcela,
  existingPaidNumbers = new Set<number>(),
  minTotal,
  isIsento = false,
}: {
  alunoId: string;
  turmaId: string;
  produto: string;
  valor: number;
  method: PaymentMethod;
  diaVencimento: number;
  dataMatricula?: string | null;
  dataSegundaParcela?: Date | null;
  existingPaidNumbers?: Set<number>;
  minTotal?: number;
  isIsento?: boolean;
}) => {
  const matricula = parseDateOnly(dataMatricula) || new Date();
  const targetTotal = (minTotal != null && minTotal > 0) ? minTotal : paymentMethodTotal(method);
  const matriculaDate = formatLocalDate(matricula);

  return Array.from({ length: targetTotal }, (_, index) => {
    const numeroParcela = index + 1;
    if (existingPaidNumbers.has(numeroParcela)) return null;

    let dueDate: Date;
    if (index === 0) {
      dueDate = matricula;
    } else if (dataSegundaParcela) {
      // Âncora na 2ª parcela: parcela 2 = anchor, parcela 3 = anchor+1m, etc.
      dueDate = dateWithClampedDay(
        dataSegundaParcela.getFullYear(),
        dataSegundaParcela.getMonth() + (index - 1),
        dataSegundaParcela.getDate(),
      );
    } else {
      dueDate = dateWithClampedDay(matricula.getFullYear(), matricula.getMonth() + index, diaVencimento);
    }
    const dueDateText = formatLocalDate(dueDate);
    const mesReferencia = formatLocalDate(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1, 12, 0, 0));
    const paidByPlan = method === 'cartao' || method === 'avista' || (method === 'boleto' && index === 0);

    return {
      aluno_id: alunoId,
      turma_id: turmaId,
      produto,
      valor: isIsento ? 0 : valor,
      mes_referencia: mesReferencia,
      data_vencimento: dueDateText,
      numero_parcela: numeroParcela,
      status: isIsento ? 'isento' : (paidByPlan ? 'pago' : 'pendente'),
      data_pagamento: isIsento ? null : (paidByPlan ? matriculaDate : null),
      observacoes: index === 0 ? 'Ato de matricula' : null,
    };
  }).filter(Boolean);
};

export const sincronizarParcelasAluno = async ({
  alunoId,
  turmaId,
  produto,
  method,
  diaVencimento,
  dataMatricula,
  dataSegundaParcela,
  valor,
  customTotal,
  isIsento = false,
}: {
  alunoId: string;
  turmaId: string;
  produto: string;
  method: PaymentMethod;
  diaVencimento: number;
  dataMatricula?: string | null;
  dataSegundaParcela?: Date | null;
  valor: number;
  customTotal?: number;
  isIsento?: boolean;
}) => {
  // Busca direto do banco para garantir estado atual completo (evita duplicatas por estado React desatualizado)
  const { data: dbPagamentos } = await supabase
    .from('pagamentos')
    .select('id, aluno_id, turma_id, produto, valor, mes_referencia, data_vencimento, data_pagamento, numero_parcela, status, created_at')
    .eq('aluno_id', alunoId);
  const existentes = (dbPagamentos ?? [])
    .sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0));

  if (isIsento) {
    if (existentes.length > 0) {
      const { error } = await supabase.from('pagamentos').delete().in('id', existentes.map(p => p.id));
      if (error) throw error;
    }
    const total = (customTotal && customTotal > 0) ? customTotal : paymentMethodTotal(method);
    const rows = buildInstallments({ alunoId, turmaId, produto, valor: 0, method, diaVencimento, dataMatricula, dataSegundaParcela, minTotal: total, isIsento: true });
    if (rows.length > 0) {
      const { error } = await supabase.from('pagamentos').insert(rows as any[]);
      if (error) throw error;
    }
    const { error } = await supabase.from('alunos').update({ mensalidades_pagas: 0, total_mensalidades: total }).eq('id', alunoId);
    if (error) throw error;
    return;
  }

  const pagas = existentes.filter(p => p.status === 'pago');
  const numerosPagos = new Set(pagas.map(p => p.numero_parcela || 0).filter(Boolean));
  const maiorParcelaPaga = Math.max(0, ...Array.from(numerosPagos));
  const baseTotal = (customTotal && customTotal > 0) ? customTotal : paymentMethodTotal(method);
  const total = Math.max(baseTotal, maiorParcelaPaga, pagas.length);
  const abertas = existentes.filter(p => p.status !== 'pago');

  if (abertas.length > 0) {
    const { error } = await supabase.from('pagamentos').delete().in('id', abertas.map(p => p.id));
    if (error) throw error;
  }

  if (pagas.length > 0) {
    const { error } = await supabase
      .from('pagamentos')
      .update({ turma_id: turmaId, produto })
      .eq('aluno_id', alunoId)
      .eq('status', 'pago');
    if (error) throw error;
  }

  const rows = buildInstallments({
    alunoId,
    turmaId,
    produto,
    valor,
    method,
    diaVencimento,
    dataMatricula,
    dataSegundaParcela,
    existingPaidNumbers: numerosPagos,
    minTotal: total,
  });

  if (rows.length > 0) {
    const { error } = await supabase.from('pagamentos').insert(rows as any[]);
    if (error) throw error;
  }

  const pagasNoPlano = rows.filter((row: any) => row.status === 'pago').length + pagas.length;
  const { error } = await supabase
    .from('alunos')
    .update({ mensalidades_pagas: pagasNoPlano, total_mensalidades: total })
    .eq('id', alunoId);
  if (error) throw error;
};

/**
 * Aluno mínimo necessário para atribuir turma + recalcular parcelas.
 * Formato compatível com a linha `alunos` do Supabase (superset opcional).
 */
export interface AlunoParaAtribuirTurma {
  produto: string;
  forma_pagamento?: string | null;
  dia_vencimento?: number | string | null;
  dia_vencimento_contrato?: string | null;
  tipo_pagamento?: string | null;
  data_matricula?: string | null;
  valor_mensalidade?: number | null;
  total_mensalidades?: number | null;
}

/**
 * Equivalente exato do antigo `quickAssignTurma` de Financeiro.tsx:
 * atualiza `alunos.turma_id` e recalcula as parcelas (`pagamentos`) do aluno
 * a partir dos seus próprios dados de pagamento.
 */
export async function assignTurmaEAtualizarParcelas(
  alunoId: string,
  turmaId: string,
  aluno: AlunoParaAtribuirTurma,
): Promise<void> {
  const { error } = await supabase.from('alunos').update({ turma_id: turmaId }).eq('id', alunoId);
  if (error) throw error;

  const method = normalizePaymentMethod(aluno.forma_pagamento);
  const diaVenc = extractDueDay(aluno.dia_vencimento || aluno.dia_vencimento_contrato);
  const isIsento = aluno.tipo_pagamento === 'bolsa' || aluno.tipo_pagamento === 'cortesia';

  let valorEfetivo = Number(aluno.valor_mensalidade ?? NaN);
  if (aluno.valor_mensalidade == null) {
    const { data: turma } = await supabase.from('turmas').select('valor_mensalidade').eq('id', turmaId).maybeSingle();
    valorEfetivo = Number(turma?.valor_mensalidade ?? 109.90);
  }

  await sincronizarParcelasAluno({
    alunoId,
    turmaId,
    produto: aluno.produto,
    method,
    diaVencimento: diaVenc,
    dataMatricula: aluno.data_matricula || todayDateInput(),
    dataSegundaParcela: null,
    valor: valorEfetivo,
    customTotal: aluno.total_mensalidades ?? undefined,
    isIsento,
  });
}
