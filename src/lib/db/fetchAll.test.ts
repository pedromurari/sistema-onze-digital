import { describe, it, expect } from 'vitest';
import { fetchAll, TAMANHO_PAGINA } from './fetchAll';

/**
 * Paginação.
 *
 * O bug que originou este arquivo: o PostgREST corta toda resposta em 1.000 linhas sem
 * avisar, e a tela de Lançamentos mostrava 1.000 dos 2.223 leads do maior lançamento. O
 * mesmo laço acabou copiado em cinco telas, cada cópia com um detalhe diferente — uma
 * delas sem `.order()`, o que faz a paginação repetir e pular linhas.
 *
 * Nada aqui toca a rede: a função recebe uma "página" e o teste devolve dados de mentira.
 */

/** Simula o servidor: uma lista qualquer, servida em páginas de 1.000. */
function servidorFake(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  let chamadas = 0;

  return {
    get chamadas() { return chamadas; },
    pagina: async (de: number, ate: number) => {
      chamadas++;
      return { data: linhas.slice(de, ate + 1), error: null };
    },
  };
}

describe('fetchAll', () => {
  it('traz tudo quando passa de uma página', async () => {
    const s = servidorFake(2223);   // o maior lançamento real
    const linhas = await fetchAll(s.pagina);

    expect(linhas).toHaveLength(2223);
    expect(s.chamadas).toBe(3);     // 1000 + 1000 + 223
  });

  it('para na primeira página quando cabe tudo nela', async () => {
    const s = servidorFake(42);
    const linhas = await fetchAll(s.pagina);

    expect(linhas).toHaveLength(42);
    expect(s.chamadas).toBe(1);
  });

  it('tabela vazia devolve lista vazia sem laço infinito', async () => {
    const s = servidorFake(0);
    const linhas = await fetchAll(s.pagina);

    expect(linhas).toEqual([]);
    expect(s.chamadas).toBe(1);
  });

  it('página exatamente cheia faz mais uma chamada para confirmar o fim', async () => {
    // Caso de borda que quebra implementação ingênua: com exatamente 1.000 linhas não dá
    // para saber se acabou sem perguntar de novo.
    const s = servidorFake(TAMANHO_PAGINA);
    const linhas = await fetchAll(s.pagina);

    expect(linhas).toHaveLength(TAMANHO_PAGINA);
    expect(s.chamadas).toBe(2);
  });

  it('propaga erro em vez de devolver lista pela metade', async () => {
    // As cópias antigas faziam `if (error) break` e retornavam o que tinham — a tela
    // mostrava dado incompleto como se estivesse completo.
    let chamadas = 0;
    const paginaComFalha = async (de: number, ate: number) => {
      chamadas++;
      if (chamadas === 2) return { data: null, error: { message: 'boom' } as never };
      return { data: Array.from({ length: TAMANHO_PAGINA }, (_, i) => ({ id: de + i })), error: null };
    };

    await expect(fetchAll(paginaComFalha)).rejects.toBeTruthy();
  });

  it('trava de segurança impede varrer o banco inteiro no navegador', async () => {
    const s = servidorFake(TAMANHO_PAGINA * 101);
    await expect(fetchAll(s.pagina)).rejects.toThrow(/view ou RPC/);
  });

  it('pede a faixa certa a cada página', async () => {
    const faixas: Array<[number, number]> = [];
    const espiao = async (de: number, ate: number) => {
      faixas.push([de, ate]);
      return { data: de === 0 ? Array.from({ length: TAMANHO_PAGINA }, (_, i) => ({ id: i })) : [], error: null };
    };

    await fetchAll(espiao);
    expect(faixas).toEqual([[0, 999], [1000, 1999]]);
  });
});
