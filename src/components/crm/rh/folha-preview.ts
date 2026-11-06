export type AulaFolha = {
  id: string;
  profissional_id: string | null;
  data: string;
  status: string;
};

export type PresencaProfessor = {
  aula_id: string;
  profissional_id: string | null;
  presente: boolean;
};

export type ProfissionalFolha = {
  id: string;
  nome: string;
  modelo_pagamento: string;
  valor_por_aula: number | null;
};

export function calcularPreviaFolha(
  profissionais: ProfissionalFolha[],
  aulas: AulaFolha[],
  presencas: PresencaProfessor[],
) {
  const confirmadas = new Set(
    presencas.filter((p) => p.presente && p.profissional_id).map((p) => `${p.aula_id}:${p.profissional_id}`),
  );

  return profissionais.map((profissional) => {
    const aulasValidas = aulas.filter((aula) =>
      aula.profissional_id === profissional.id &&
      aula.status === 'realizada' &&
      confirmadas.has(`${aula.id}:${profissional.id}`),
    );
    const valor = profissional.valor_por_aula;
    const calculaPorAula = profissional.modelo_pagamento === 'por_aula' || profissional.modelo_pagamento === 'hibrido';
    return {
      profissional,
      quantidade: aulasValidas.length,
      valorAulas: calculaPorAula && valor != null ? Math.round(aulasValidas.length * valor * 100) / 100 : null,
      requerRevisao: !calculaPorAula || valor == null,
    };
  });
}

export type ProfissionalFolhaCompleta = {
  id: string; nome: string; modelo_pagamento: string; valor_fixo: number | null;
  valor_por_aula: number | null; comissoes_vendedor: string | null;
};

export type LinhaFolhaCompleta = {
  profissional: ProfissionalFolhaCompleta;
  aulasConfirmadas: number;
  valorAulas: number;
  valorFixo: number;
  comissoesPendentes: number;
  jaPagoNoMes: number;
  totalSugerido: number;
  requerRevisao: boolean;
};

// Mesmo cálculo do fechamento (FechamentoFolha.tsx): aulas confirmadas ×
// valor por aula + fixo (modelo fixo/híbrido) + comissões pendentes do
// vendedor vinculado, menos o que já foi pago no período. Extraído pra cá
// pra "Contas a pagar" (RH.tsx) poder mostrar a mesma projeção do mês
// corrente sem duplicar a lógica em dois arquivos.
export function calcularFolhaCompleta(
  profissionais: ProfissionalFolhaCompleta[],
  aulas: AulaFolha[],
  presencas: PresencaProfessor[],
  pagoPorProfissional: Map<string, number>,
  comissoesPorVendedor: Map<string, number>,
): LinhaFolhaCompleta[] {
  const previa = calcularPreviaFolha(profissionais, aulas, presencas);
  const previaPorId = new Map(previa.map((l) => [l.profissional.id, l]));

  return profissionais.map((prof) => {
    const prevLinha = previaPorId.get(prof.id);
    const aulasConfirmadas = prevLinha?.quantidade ?? 0;
    const valorAulas = prevLinha?.valorAulas ?? 0;
    const temFixo = prof.modelo_pagamento === 'fixo' || prof.modelo_pagamento === 'hibrido';
    const valorFixo = temFixo ? Number(prof.valor_fixo ?? 0) : 0;
    const comissoesPendentes = prof.comissoes_vendedor ? (comissoesPorVendedor.get(prof.comissoes_vendedor) ?? 0) : 0;
    const jaPagoNoMes = pagoPorProfissional.get(prof.id) ?? 0;
    const totalBruto = valorAulas + valorFixo + comissoesPendentes;
    const totalSugerido = Math.max(0, Math.round((totalBruto - jaPagoNoMes) * 100) / 100);
    const requerRevisao = prof.modelo_pagamento === 'comissao' && !prof.comissoes_vendedor;
    return { profissional: prof, aulasConfirmadas, valorAulas, valorFixo, comissoesPendentes, jaPagoNoMes, totalSugerido, requerRevisao };
  }).filter((l) => l.aulasConfirmadas > 0 || l.valorFixo > 0 || l.comissoesPendentes > 0 || l.jaPagoNoMes > 0 || l.requerRevisao);
}
