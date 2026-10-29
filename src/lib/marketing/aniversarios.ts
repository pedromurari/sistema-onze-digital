export type AlunoAniversario = { id: string; nome: string; data_nascimento: string | null; turma_id: string | null };

export function aniversariantesDoMes(alunos: AlunoAniversario[], mes: number) {
  return alunos.filter(aluno => {
    const data = aluno.data_nascimento?.slice(0, 10);
    return Boolean(data && /^\d{4}-\d{2}-\d{2}$/.test(data) && Number(data.slice(5, 7)) === mes);
  }).sort((a, b) => {
    const diaA = Number(a.data_nascimento!.slice(8, 10));
    const diaB = Number(b.data_nascimento!.slice(8, 10));
    return diaA - diaB || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}
