import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';

/**
 * Pontos do financeiro que o sistema aceita calado e calcula errado.
 *
 * A view `integridade_financeira` no banco procura uma família específica de problema:
 * campo vazio que o código lê como valor válido. Três bugs desta sprint tinham essa forma —
 * turma de investidor sem linha em `turma_responsaveis` (recorrência ia 100% ao IDM),
 * aluno sem `dia_vencimento` (parcelas nunca eram geradas) e aluno sem turma (a cobrança
 * faz JOIN com `cobranca_turmas_ativas` e ele nunca entra na fila).
 *
 * Nenhum deles dá erro. O número só aparece do lado errado, ou não aparece.
 *
 * É uma FUNÇÃO `security definer`, não uma view. As checagens são `not exists`, e sob a
 * RLS de quem consulta a ausência por falta de permissão vira falso positivo — quem não lê
 * `pagamentos` veria todos os alunos como "sem parcela". O portão fica dentro dela: exige
 * `financeiro/ver` e `financeiro/ver_todos`. Quem não tem recebe lista vazia, não erro.
 */

export type GravidadeIntegridade = 'alto' | 'medio' | 'baixo';

export interface PontoDeIntegridade {
  problema: string;
  gravidade: GravidadeIntegridade;
  entidade: string;
  efeito: string;
  valor_em_risco: number;
  referencia: string;
}

const ORDEM: Record<GravidadeIntegridade, number> = { alto: 0, medio: 1, baixo: 2 };

export function useIntegridadeFinanceira() {
  return useQuery({
    queryKey: chaves.integridade.financeira(),
    queryFn: async (): Promise<PontoDeIntegridade[]> => {
      const { data, error } = await supabase.rpc('integridade_financeira');

      if (error) throw error;

      const linhas = (data ?? []) as unknown as PontoDeIntegridade[];
      return [...linhas].sort(
        (a, b) =>
          ORDEM[a.gravidade] - ORDEM[b.gravidade] ||
          b.valor_em_risco - a.valor_em_risco ||
          a.entidade.localeCompare(b.entidade, 'pt-BR'),
      );
    },
  });
}
