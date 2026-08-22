import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';
import type { ResponsavelRow, TurmaResponsavelRow } from '@/lib/financial-utils';

/**
 * Sócios e o split de receita por turma.
 *
 * `turma_responsaveis` responde "quanto dessa turma é de quem" — a regra é investidor 50%
 * e instituto 50%, com o primeiro pagamento (comercial) indo para a 11ds. Dashboard,
 * Balanço e FinanceiroCFO liam essa tabela com exatamente as mesmas cinco colunas, cada
 * um por conta própria, e o Balanço e o CFO ainda tinham um `reloadTurmaResponsaveis`
 * particular para depois de editar o split — que atualizava só a própria tela.
 *
 * Os tipos vêm de `financial-utils` de propósito: é lá que `calcRepasses` e
 * `makeGetOwnerShare` os consomem, e assim o retorno destes hooks entra direto nelas sem
 * cast no meio do caminho.
 */
export const COLUNAS_RESPONSAVEL = 'id, nome, email, ativo';
export const COLUNAS_TURMA_RESPONSAVEL = 'id, turma_id, user_id, nome_ref, percentual';

export async function buscarResponsaveis(): Promise<ResponsavelRow[]> {
  const { data, error } = await supabase
    .from('responsaveis')
    .select(COLUNAS_RESPONSAVEL)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as unknown as ResponsavelRow[];
}

export function useResponsaveis() {
  return useQuery({
    queryKey: chaves.responsaveis.lista(),
    queryFn: buscarResponsaveis,
  });
}

export async function buscarTurmaResponsaveis(): Promise<TurmaResponsavelRow[]> {
  const { data, error } = await supabase
    .from('turma_responsaveis')
    .select(COLUNAS_TURMA_RESPONSAVEL);
  if (error) throw error;
  return (data ?? []) as unknown as TurmaResponsavelRow[];
}

/**
 * O split. Quem edita deve invalidar `responsaveis` depois de gravar (via
 * `useInvalidarDados`), para o Balanço e o CFO recalcularem juntos em vez de cada um
 * recarregar o seu.
 */
export function useTurmaResponsaveis() {
  return useQuery({
    queryKey: chaves.responsaveis.porTurma(),
    queryFn: buscarTurmaResponsaveis,
  });
}

export type { ResponsavelRow, TurmaResponsavelRow };
