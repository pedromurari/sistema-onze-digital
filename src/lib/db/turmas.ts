import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';

/**
 * Colunas de `turmas`, num conjunto só.
 *
 * Quatro telas pediam quatro conjuntos diferentes da mesma tabela: o Dashboard oito
 * colunas, o FinanceiroCFO seis, o Balanço quatro e a Cobrança duas. Nenhuma estava
 * errada isoladamente — mas o Balanço, sem `responsavel_id`, não conseguia aplicar o
 * `getOwnerShare` do mesmo jeito que o CFO, e a mesma turma rendia números diferentes
 * conforme a tela que você abrisse.
 *
 * São 13 turmas no total. Buscar as 11 colunas sempre custa nada e elimina a classe
 * inteira de divergência.
 */
export const COLUNAS_TURMA =
  'id, nome, tipo, produto, valor_mensalidade, total_mensalidades, ' +
  'dia_vencimento, data_inicio, data_fim, responsavel_id, vagas, created_at';

/** O formato que as telas financeiras consomem. Superconjunto das interfaces locais. */
export interface Turma {
  id: string;
  nome: string;
  tipo?: string | null;
  produto?: string | null;
  valor_mensalidade?: number | null;
  total_mensalidades?: number | null;
  dia_vencimento?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  responsavel_id?: string | null;
  vagas?: number | null;
  created_at?: string | null;
}

export async function buscarTurmas(): Promise<Turma[]> {
  const { data, error } = await supabase
    .from('turmas')
    .select(COLUNAS_TURMA)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as unknown as Turma[];
}

export function useTurmas() {
  return useQuery({
    queryKey: chaves.turmas.lista(),
    queryFn: buscarTurmas,
  });
}
