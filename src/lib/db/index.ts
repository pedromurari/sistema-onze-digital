/**
 * Camada de dados do sistema (sprint 2).
 *
 * Regra: componente não chama `supabase.from()` direto. Toda leitura passa por um
 * repositório daqui, para que exista UM lugar por domínio decidindo colunas, ordenação,
 * paginação e chave de cache.
 *
 * O que isso resolve, concretamente:
 *   - Truncamento silencioso em 1.000 linhas (ver `fetchAll.ts`), que já escondia 55% dos
 *     leads do maior lançamento e 93% dos leads unificados nos filtros de campanha.
 *   - Telas mostrando números diferentes por buscarem conjuntos diferentes da mesma
 *     tabela — `alunos` era lida de cinco jeitos, um deles filtrando por `created_at`.
 *   - Gravar num lugar e o resto do sistema não perceber: com as chaves de `keys.ts`,
 *     invalidar `pagamentos` recarrega Dashboard, Financeiro e Cobrança juntos.
 *
 * Migração em andamento — as telas antigas seguem funcionando enquanto não são movidas.
 */
export { fetchAll, TAMANHO_PAGINA } from './fetchAll';
export { chaves, invalidacaoCruzada } from './keys';

export {
  buscarAlunos, useAlunos,
  COLUNAS_ALUNO_RESUMO, COLUNAS_ALUNO_COMPLETO,
} from './alunos';

export {
  buscarPagamentos, usePagamentos, usePagamentosDoAluno,
  COLUNAS_PAGAMENTO_RESUMO, COLUNAS_PAGAMENTO_COMPLETO,
} from './pagamentos';

export { buscarTurmas, useTurmas, COLUNAS_TURMA } from './turmas';
export type { Turma } from './turmas';

export {
  buscarResponsaveis, useResponsaveis,
  buscarTurmaResponsaveis, useTurmaResponsaveis,
  COLUNAS_RESPONSAVEL, COLUNAS_TURMA_RESPONSAVEL,
} from './responsaveis';
export type { ResponsavelRow, TurmaResponsavelRow } from './responsaveis';

export { useRealtimeInvalidation, useInvalidarDados } from './realtime';

export {
  usePessoas, usePessoaPorId, usePessoaPorTelefone,
  useVinculosDaPessoa, useTimelineDaPessoa,
} from './pessoas';
export type { Pessoa, VinculoPessoa, EventoPessoa, PapelPessoa, TipoEventoPessoa } from './pessoas';

export {
  useIntegridadeFinanceira,
  useDefinirTurmaDoAluno, useDefinirFormaDePagamento, useMarcarParcelasComoIsentas,
} from './integridade';
export type { PontoDeIntegridade, GravidadeIntegridade } from './integridade';
