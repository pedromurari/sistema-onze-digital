import type { PostgrestError } from '@supabase/supabase-js';

/**
 * O PostgREST corta TODA resposta em 1.000 linhas, independente do `.limit()` pedido.
 * Pedir `.limit(5000)` devolve 1.000 e não avisa nada — nem erro, nem flag.
 *
 * Isso já custou caro neste sistema: a tela de Lançamentos mostrava 1.000 dos 2.223 leads
 * do maior lançamento, e os filtros de campanha do DisparosMonitor eram montados a partir
 * de 1.000 dos 13.670 leads unificados. Nos dois casos a tela parecia funcionar.
 *
 * Duas telas já tinham resolvido isso copiando o mesmo laço de paginação uma pra outra
 * (Dashboard e Financeiro). Este helper é esse laço, num lugar só.
 *
 * IMPORTANTE: a query precisa ter `.order()` por uma coluna estável. Sem ordenação
 * definida o Postgres não garante a mesma ordem entre as páginas, e a paginação passa a
 * repetir e pular linhas.
 */
export const TAMANHO_PAGINA = 1000;

type RespostaPagina<T> = { data: T[] | null; error: PostgrestError | null };

export async function fetchAll<T>(
  montarPagina: (de: number, ate: number) => PromiseLike<RespostaPagina<T>>,
): Promise<T[]> {
  const todas: T[] = [];

  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await montarPagina(de, de + TAMANHO_PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    todas.push(...data);
    if (data.length < TAMANHO_PAGINA) break;

    // Trava de segurança: 100 páginas = 100 mil linhas. Se chegou aqui, é consulta
    // que não deveria estar sendo feita no cliente — melhor falhar alto do que
    // travar o navegador em silêncio.
    if (todas.length >= TAMANHO_PAGINA * 100) {
      throw new Error(
        `fetchAll passou de ${todas.length} linhas. Essa agregação precisa virar view ou RPC no banco.`,
      );
    }
  }

  return todas;
}
