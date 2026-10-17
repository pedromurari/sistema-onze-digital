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
