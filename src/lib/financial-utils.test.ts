import { describe, it, expect } from 'vitest';
import {
  isAlunoAtivo,
  isPagamentoRealizado,
  filtrarPagamentosPorPeriodo,
  isPagamentoInadimplente,
  calcInadimplencia,
  calcMRR,
  makeGetOwnerShare,
} from './financial-utils';

/**
 * Regras financeiras canônicas.
 *
 * Estas funções já eram compartilhadas por Dashboard, Financeiro, CFO e Cobrança — e ainda
 * assim as telas mostravam números diferentes, porque cada uma alimentava a mesma fórmula
 * com um conjunto diferente de dados. A entrada foi unificada na sprint 2; aqui trancamos
 * a fórmula, para que a próxima divergência não venha da regra.
 */

const HOJE = new Date('2026-08-22T12:00:00Z');

describe('isAlunoAtivo', () => {
  it('ativo é ativo', () => {
    expect(isAlunoAtivo({ status: 'ativo' }, HOJE)).toBe(true);
  });

  it('cancelado e concluído não contam', () => {
    expect(isAlunoAtivo({ status: 'cancelado' }, HOJE)).toBe(false);
    expect(isAlunoAtivo({ status: 'concluido' }, HOJE)).toBe(false);
  });

  it('pré-matrícula vira ativo no dia em que a matrícula chega', () => {
    expect(isAlunoAtivo({ status: 'pre_matricula', data_matricula: '2026-08-21' }, HOJE)).toBe(true);
    expect(isAlunoAtivo({ status: 'pre_matricula', data_matricula: '2026-08-22' }, HOJE)).toBe(true);
    expect(isAlunoAtivo({ status: 'pre_matricula', data_matricula: '2026-08-23' }, HOJE)).toBe(false);
  });

  it('pré-matrícula sem data não conta', () => {
    expect(isAlunoAtivo({ status: 'pre_matricula', data_matricula: null }, HOJE)).toBe(false);
  });
});

describe('isPagamentoRealizado', () => {
  it('exige status pago E data de pagamento', () => {
    expect(isPagamentoRealizado({ status: 'pago', data_pagamento: '2026-08-01' })).toBe(true);
    expect(isPagamentoRealizado({ status: 'pago', data_pagamento: null })).toBe(false);
    expect(isPagamentoRealizado({ status: 'pendente', data_pagamento: '2026-08-01' })).toBe(false);
  });
});

describe('filtrarPagamentosPorPeriodo', () => {
  it('usa a data em que o dinheiro entrou, não o mês da parcela', () => {
    // Parcela de junho quitada em agosto conta em agosto — é quando o caixa recebeu.
    const pagos = filtrarPagamentosPorPeriodo(
      [
        { status: 'pago', data_pagamento: '2026-08-05' },
        { status: 'pago', data_pagamento: '2026-07-31' },
        { status: 'pago', data_pagamento: '2026-08-31' },
        { status: 'pendente', data_pagamento: '2026-08-10' },
      ],
      '2026-08-01',
      '2026-08-31',
    );
    expect(pagos).toHaveLength(2);
    expect(pagos.map(p => p.data_pagamento)).toEqual(['2026-08-05', '2026-08-31']);
  });
});

describe('isPagamentoInadimplente', () => {
  it('atrasado conta sempre', () => {
    expect(isPagamentoInadimplente({ status: 'atrasado' }, HOJE)).toBe(true);
  });

  it('pendente só conta depois do vencimento', () => {
    expect(isPagamentoInadimplente({ status: 'pendente', data_vencimento: '2026-08-21' }, HOJE)).toBe(true);
    expect(isPagamentoInadimplente({ status: 'pendente', data_vencimento: '2026-08-22' }, HOJE)).toBe(false);
    expect(isPagamentoInadimplente({ status: 'pendente', data_vencimento: '2026-09-01' }, HOJE)).toBe(false);
  });

  it('pago nunca é inadimplente, mesmo vencido há muito tempo', () => {
    expect(isPagamentoInadimplente({ status: 'pago', data_vencimento: '2020-01-01' }, HOJE)).toBe(false);
  });
});

describe('calcInadimplencia', () => {
  it('count é quantidade de ALUNOS inadimplentes, não de parcelas', () => {
    // Ambiguidade que este teste existe para fixar: são 3 parcelas vencidas, mas de
    // apenas 2 alunos. `count` responde "quantas pessoas estão devendo" — é assim que a
    // Cobrança usa o número. Quem quiser parcelas soma `parcelas` em `porAluno`.
    const r = calcInadimplencia(
      [
        { aluno_id: 'a', valor: 100, status: 'atrasado', data_vencimento: '2026-07-01' },
        { aluno_id: 'a', valor: 150, status: 'pendente', data_vencimento: '2026-08-01' },
        { aluno_id: 'b', valor: 200, status: 'atrasado', data_vencimento: '2026-06-01' },
        { aluno_id: 'c', valor: 999, status: 'pago', data_vencimento: '2026-01-01' },
      ],
      HOJE,
    );

    expect(r.count).toBe(2);
    expect(r.valorTotal).toBe(450);
    expect(r.porAluno['a']).toEqual({ valor: 250, parcelas: 2 });
    expect(r.porAluno['b']).toEqual({ valor: 200, parcelas: 1 });
    expect(r.porAluno['c']).toBeUndefined();
  });

  it('parcela vencida sem aluno_id entra no valor mas não em count', () => {
    // Comportamento sutil: o valor devido cresce sem que apareça ninguém devendo.
    // Se um dia o total não bater com a soma por aluno, é por aqui.
    const r = calcInadimplencia(
      [{ aluno_id: null, valor: 500, status: 'atrasado', data_vencimento: '2026-01-01' }],
      HOJE,
    );
    expect(r.valorTotal).toBe(500);
    expect(r.count).toBe(0);
  });

  it('lista vazia devolve zero, não NaN', () => {
    const r = calcInadimplencia([], HOJE);
    expect(r.count).toBe(0);
    expect(r.valorTotal).toBe(0);
  });
});

describe('calcMRR', () => {
  const semRepasse = () => 1;

  it('conta só aluno ativo', () => {
    const mrr = calcMRR(
      [
        { id: '1', turma_id: 't', status: 'ativo', valor_mensalidade: 100 },
        { id: '2', turma_id: 't', status: 'cancelado', valor_mensalidade: 100 },
      ],
      [{ id: 't', valor_mensalidade: 100 }],
      semRepasse,
      HOJE,
    );
    expect(mrr).toBe(100);
  });

  it('valor do aluno vence o da turma', () => {
    const mrr = calcMRR(
      [{ id: '1', turma_id: 't', status: 'ativo', valor_mensalidade: 250 }],
      [{ id: 't', valor_mensalidade: 100 }],
      semRepasse,
      HOJE,
    );
    expect(mrr).toBe(250);
  });

  it('cai no valor da turma quando o aluno não tem o seu', () => {
    const mrr = calcMRR(
      [{ id: '1', turma_id: 't', status: 'ativo', valor_mensalidade: null }],
      [{ id: 't', valor_mensalidade: 180 }],
      semRepasse,
      HOJE,
    );
    expect(mrr).toBe(180);
  });

  it('aplica a fatia do dono da turma', () => {
    // Turma com sócio: metade da mensalidade é repasse, não fica na empresa.
    const mrr = calcMRR(
      [{ id: '1', turma_id: 't', status: 'ativo', valor_mensalidade: 200 }],
      [{ id: 't', valor_mensalidade: 200 }],
      () => 0.5,
      HOJE,
    );
    expect(mrr).toBe(100);
  });

  it('turma desconhecida e aluno sem valor não viram NaN', () => {
    const mrr = calcMRR(
      [{ id: '1', turma_id: 'inexistente', status: 'ativo', valor_mensalidade: null }],
      [],
      semRepasse,
      HOJE,
    );
    expect(mrr).toBe(0);
  });
});

/**
 * Quanto de uma turma pertence a um socio.
 *
 * A regra do negocio: o investidor fica com 50% e o instituto com 50%; a excecao e o
 * primeiro pagamento, que e comercial e vai para a 11ds (isso vive em calcRepassePagamento,
 * nao aqui). O que se tranca aqui e a PRECEDENCIA: por muito tempo `turmas.responsavel_id`
 * vinha antes do split e devolvia 100%, entao filtrar o CFO por "Keila" mostrava o dobro
 * do que e dela — enquanto a propria tela dizia "ponderado pela % em turma_responsaveis".
 */
describe('makeGetOwnerShare — o split manda, responsavel_id e so o fallback', () => {
  const responsaveis = [
    { id: 'r-keila', nome: 'Keila' },
    { id: 'r-idm',   nome: 'IDM'   },
  ];

  it('turma de investidor devolve a fatia do split, nao 100%', () => {
    // Esta era a regressao: responsavel_id aponta para Keila E existe split de 50%.
    const share = makeGetOwnerShare(
      'Keila',
      [{ id: 't1', responsavel_id: 'r-keila' }],
      [{ id: 's1', turma_id: 't1', user_id: 'r-keila', nome_ref: 'Keila', percentual: 50 }],
      responsaveis,
    );
    expect(share('t1')).toBe(0.5);
  });

  it('quem nao esta no split da turma nao leva nada dela', () => {
    const share = makeGetOwnerShare(
      'IDM',
      [{ id: 't1', responsavel_id: 'r-keila' }],
      [{ id: 's1', turma_id: 't1', user_id: 'r-keila', nome_ref: 'Keila', percentual: 50 }],
      responsaveis,
    );
    expect(share('t1')).toBe(0);
  });

  it('sem split, cai no dono binario da turma', () => {
    const share = makeGetOwnerShare(
      'Keila',
      [{ id: 't2', responsavel_id: 'r-keila' }],
      [],
      responsaveis,
    );
    expect(share('t2')).toBe(1);
  });

  it('split de 100% (o investidor e o proprio instituto) devolve a turma inteira', () => {
    const share = makeGetOwnerShare(
      'IDM',
      [{ id: 't3', responsavel_id: 'r-idm' }],
      [{ id: 's3', turma_id: 't3', user_id: 'r-idm', nome_ref: 'IDM', percentual: 100 }],
      responsaveis,
    );
    expect(share('t3')).toBe(1);
  });

  it('sem filtro de socio, nada e ponderado', () => {
    const share = makeGetOwnerShare('', [{ id: 't1' }], [], responsaveis);
    expect(share('t1')).toBe(1);
  });

  it('turma sem dono e sem split nao pertence a socio nenhum', () => {
    const share = makeGetOwnerShare('Keila', [{ id: 't9' }], [], responsaveis);
    expect(share('t9')).toBe(0);
  });
});
