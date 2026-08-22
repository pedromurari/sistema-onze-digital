import { describe, it, expect } from 'vitest';
import { chaves, invalidacaoCruzada } from './keys';

/**
 * A fiação que faz uma tela perceber o que a outra gravou.
 *
 * O sintoma que abriu esta reforma foi "as informações divergem entre telas". A fórmula
 * já era compartilhada (`financial-utils`); o que divergia era a ENTRADA — cinco telas
 * financeiras liam as mesmas cinco tabelas por conta própria e nenhuma avisava as outras
 * ao gravar. Dar baixa num pagamento no Financeiro não mexia no Dashboard.
 *
 * Agora todas passam pelos hooks de `src/lib/db`, e gravar invalida um DOMÍNIO. Este
 * arquivo tranca esse mapa: é uma tabela de dados pura, fácil de quebrar sem perceber
 * (basta um repositório novo sem entrada aqui) e impossível de perceber quebrada olhando
 * a tela — o número simplesmente fica velho.
 */

/** Toda chave é um array de strings, e a raiz é prefixo das derivadas. */
function ehPrefixo(raiz: readonly string[], derivada: readonly string[]) {
  return raiz.every((parte, i) => derivada[i] === parte);
}

describe('chaves de cache', () => {
  it('cada chave derivada começa pela raiz do seu domínio', () => {
    // O React Query invalida por prefixo. Se uma derivada não começar pela raiz,
    // invalidar o domínio não a alcança e aquela tela nunca atualiza.
    const dominios = Object.entries(chaves) as [string, Record<string, unknown>][];

    for (const [nome, grupo] of dominios) {
      const raiz = grupo.raiz as readonly string[];
      expect(Array.isArray(raiz), `${nome}.raiz precisa ser um array`).toBe(true);

      for (const [campo, valor] of Object.entries(grupo)) {
        if (campo === 'raiz' || typeof valor !== 'function') continue;
        const derivada = (valor as (...a: string[]) => readonly string[])('x');
        expect(
          ehPrefixo(raiz, derivada),
          `${nome}.${campo}() não começa por ${JSON.stringify(raiz)}`,
        ).toBe(true);
      }
    }
  });
});

describe('invalidação cruzada', () => {
  it('todo domínio invalida a si mesmo', () => {
    for (const [dominio, alvos] of Object.entries(invalidacaoCruzada)) {
      const raizPropria = (chaves as Record<string, { raiz: readonly string[] }>)[dominio].raiz;
      const invalidaSiMesmo = alvos.some(a => ehPrefixo(a, raizPropria) && a.length === raizPropria.length);
      expect(invalidaSiMesmo, `${dominio} não invalida a própria raiz`).toBe(true);
    }
  });

  it('todo alvo é a raiz de um domínio que existe', () => {
    const raizes = Object.values(chaves).map(g => (g as { raiz: readonly string[] }).raiz.join('/'));
    for (const [dominio, alvos] of Object.entries(invalidacaoCruzada)) {
      for (const alvo of alvos) {
        expect(raizes, `${dominio} invalida uma chave desconhecida: ${alvo.join('/')}`)
          .toContain(alvo.join('/'));
      }
    }
  });

  it('gravar pagamento alcança aluno — a baixa muda o status do aluno', () => {
    const alvos = invalidacaoCruzada.pagamentos.map(a => a.join('/'));
    expect(alvos).toContain(chaves.alunos.raiz.join('/'));
  });

  it('mexer no split alcança pagamentos — muda o repasse de toda a turma', () => {
    // Sem isto, corrigir o split no Balanço deixaria o CFO com o repasse antigo. Foi
    // exatamente esse caminho que escondeu R$ 1.093,90 atribuídos ao sócio errado.
    const alvos = invalidacaoCruzada.responsaveis.map(a => a.join('/'));
    expect(alvos).toContain(chaves.pagamentos.raiz.join('/'));
    expect(alvos).toContain(chaves.turmas.raiz.join('/'));
  });

  it('criar turma alcança alunos — a turma nova muda o cálculo de quem está nela', () => {
    const alvos = invalidacaoCruzada.turmas.map(a => a.join('/'));
    expect(alvos).toContain(chaves.alunos.raiz.join('/'));
  });

  it('todo domínio de cache tem regra de invalidação', () => {
    // Repositório novo sem entrada aqui grava e não avisa ninguém — o bug original.
    // `integridade` é exceção declarada: é diagnóstico, não número de tela.
    const semRegra = Object.keys(chaves)
      .filter(d => !(d in invalidacaoCruzada))
      .filter(d => d !== 'integridade');
    expect(semRegra, 'domínios sem invalidação cruzada').toEqual([]);
  });
});
