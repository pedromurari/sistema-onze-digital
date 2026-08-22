import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from './fetchAll';
import { chaves } from './keys';

/**
 * Colunas de `alunos`. Antes cada tela escolhia as suas: o Dashboard pedia 11, o
 * Financeiro 47, a Cobrança 3, e o Balanço ainda filtrava por `created_at` dentro do
 * período — o que fazia o total de alunos do Balanço divergir do Financeiro.
 *
 * `COMPLETO` não inclui `token_acesso` nem `link_grupo_whatsapp`: as duas NÃO EXISTEM na
 * tabela. O `ALUNOS_SELECT_FULL` do Financeiro.tsx pedia as duas, então aquela consulta
 * sempre falhava e a tela sempre caía no fallback — duas requisições por carga, uma delas
 * condenada. (As mesmas colunas fantasma quebravam o portal do aluno em /membros.)
 */
// `pessoa_id` entra nos dois conjuntos: e o que permite abrir a ficha da pessoa a partir
// de qualquer tela que mostre um aluno. A coluna esta preenchida em 98,5% dos alunos desde
// a sprint 3 e nenhuma tela a pedia — a identidade unificada existia e nao era usada.
export const COLUNAS_ALUNO_RESUMO =
  'id, pessoa_id, nome, produto, status, turma_id, data_inicio, data_matricula, created_at, ' +
  'valor_mensalidade, mensalidades_pagas, total_mensalidades';

export const COLUNAS_ALUNO_COMPLETO =
  'id, pessoa_id, turma_id, produto, nome, whatsapp, email, cpf, rg, sexo, data_nascimento, endereco, ' +
  'cep, cidade_estado, pais, dia_vencimento, dia_vencimento_contrato, status, tipo_pagamento, ' +
  'mensalidades_pagas, total_mensalidades, data_inicio, data_fim, data_matricula, origem_lead, ' +
  'lancamento_id, valor_mensalidade, forma_pagamento, observacoes, grupo_turma_confirmado_em, ' +
  'grupo_turma_id, forms_respondido, forms_respondido_em, contrato_enviado, contrato_enviado_em, ' +
  'contrato_assinado, contrato_assinado_em, autentique_documento_id, autentique_link_assinatura, ' +
  'contrato_baixado, contrato_arquivo_url, contrato_arquivo_nome, asaas_integrado, asaas_link, ' +
  'voomp_integrado, voomp_link, contrato_token, created_at';

/**
 * Genérico no tipo de linha: cada tela já tem a sua interface `Aluno` (com o subconjunto
 * de colunas que pede), e forçar `Record<string, unknown>` obrigaria todo mundo a fazer
 * cast. O padrão continua sendo o resumo.
 */
export async function buscarAlunos<T = Record<string, unknown>>(colunas: string = COLUNAS_ALUNO_RESUMO) {
  return fetchAll<T>((de, ate) =>
    supabase
      .from('alunos')
      .select(colunas)
      .order('created_at', { ascending: false })
      .order('id')            // desempate estável: sem isso a paginação pode repetir linhas
      .range(de, ate) as never,
  );
}

export function useAlunos<T = Record<string, unknown>>(colunas: string = COLUNAS_ALUNO_RESUMO) {
  return useQuery({
    queryKey: [...chaves.alunos.lista(), colunas],
    queryFn: () => buscarAlunos<T>(colunas),
  });
}
