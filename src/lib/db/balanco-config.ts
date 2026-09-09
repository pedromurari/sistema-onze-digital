import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';

export const COLUNAS_BALANCO_CONFIG =
  'id, socios, taxas, parametros_cfo, saldo_inicial_contas, inicio_operacao_fiscal, updated_at';

/**
 * A configuração é uma linha por empresa e precisa compartilhar o mesmo cache entre o
 * Balanço, o CFO e o formulário. Centralizar a leitura aqui evita que cada consumidor
 * interprete uma versão diferente dos mesmos JSONs.
 */
export async function buscarBalancoConfig<T = Record<string, unknown>>(
  empresaId = 'onze_digital',
  colunas = COLUNAS_BALANCO_CONFIG,
) {
  const { data, error } = await supabase
    .from('balanco_config')
    .select(colunas)
    .eq('id', empresaId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as T | null;
}

export function useBalancoConfig<T = Record<string, unknown>>(
  empresaId = 'onze_digital',
  colunas = COLUNAS_BALANCO_CONFIG,
) {
  return useQuery({
    queryKey: [...chaves.balancoConfig.porEmpresa(empresaId), colunas],
    queryFn: () => buscarBalancoConfig<T>(empresaId, colunas),
  });
}
