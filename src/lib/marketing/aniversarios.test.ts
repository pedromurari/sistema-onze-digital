import { describe, expect, it } from 'vitest';
import { aniversariantesDoMes } from './aniversarios';

describe('aniversariantes do mês', () => {
  it('filtra por mês e ordena por dia sem deslocar a data por fuso', () => {
    const alunos = [
      { id: '1', nome: 'Bia', data_nascimento: '1990-10-20', turma_id: null },
      { id: '2', nome: 'Ana', data_nascimento: '1985-10-01', turma_id: null },
      { id: '3', nome: 'Outra', data_nascimento: '1990-11-01', turma_id: null },
      { id: '4', nome: 'Sem data', data_nascimento: null, turma_id: null },
    ];
    expect(aniversariantesDoMes(alunos, 10).map(aluno => aluno.nome)).toEqual(['Ana', 'Bia']);
  });
});
