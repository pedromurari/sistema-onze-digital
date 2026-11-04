import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from './fetchAll';
import { chaves } from './keys';

interface RespostaCobranca {
  grupo_envio_id: string | null;
  id: string;
  aluno_id: string | null;
  enviado_em: string | null;
  respondeu_em: string | null;
}

/** Coorte de envios, não de alunos: cada disparo respondido conta uma vez.
 * Paginação evita truncar meses movimentados; não traz texto nem telefone. */
export function useRespostasCobranca(inicio: string, fim: string) {
  return useQuery({
    queryKey: chaves.cobrancaRespostas.periodo(inicio, fim),
    queryFn: () => fetchAll<RespostaCobranca>((de, ate) => supabase
      .from('cobranca_logs')
      .select('id, aluno_id, enviado_em, respondeu_em, grupo_envio_id')
      .eq('status', 'enviado')
      .gte('enviado_em', inicio).lt('enviado_em', fim)
      .order('enviado_em').order('id').range(de, ate) as never),
    refetchInterval: 60_000,
  });
}

/**
 * Colunas de `pagamentos`. Dashboard, Financeiro, FinanceiroCFO e Cobrança pediam quatro
 * conjuntos diferentes e cada uma reimplementava o mesmo laço de paginação — o laço já
 * estava copiado literalmente entre Dashboard.tsx e Financeiro.tsx, com o comentário
 * "mesmo padrão de Financeiro.tsx" no de cima.
 */
export const COLUNAS_PAGAMENTO_RESUMO =
  'id, aluno_id, turma_id, valor, mes_referencia, status, data_pagamento, data_vencimento, created_at';

export const COLUNAS_PAGAMENTO_COMPLETO =
  'id, aluno_id, turma_id, produto, valor, mes_referencia, data_vencimento, data_pagamento, ' +
  'numero_parcela, status, canal_cobranca, taxa_valor, data_prevista_pagamento, created_at, ' +
  'link_pagamento_asaas, link_pagamento_mp, asaas_payment_id, conta_recebimento, ' +
  'nf_status, nf_numero, nf_link, nf_emitida_em';

/** Genérico pelo mesmo motivo de `buscarAlunos`: cada tela tem a sua interface. */
export async function buscarPagamentos<T = Record<string, unknown>>(colunas: string = COLUNAS_PAGAMENTO_RESUMO) {
  return fetchAll<T>((de, ate) =>
    supabase
      .from('pagamentos')
      .select(colunas)
      .order('created_at', { ascending: false })
      .order('id')
      .range(de, ate) as never,
  );
}

export function usePagamentos<T = Record<string, unknown>>(colunas: string = COLUNAS_PAGAMENTO_RESUMO) {
  return useQuery({
    queryKey: [...chaves.pagamentos.lista(), colunas],
    queryFn: () => buscarPagamentos<T>(colunas),
  });
}

/** Parcelas de um aluno só — não precisa de paginação, mas passa pela mesma porta. */
export function usePagamentosDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chaves.pagamentos.porAluno(alunoId ?? ''),
    enabled: Boolean(alunoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagamentos')
        .select(COLUNAS_PAGAMENTO_COMPLETO)
        .eq('aluno_id', alunoId!)
        .order('data_vencimento');
      if (error) throw error;
      return data ?? [];
    },
  });
}
