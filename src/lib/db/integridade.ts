import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';
import { useInvalidarDados } from './realtime';

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

/**
 * As correções que o painel aplica no lugar.
 *
 * Antes o painel só listava e você tinha que ir consertar em outra tela — o que na prática
 * significa que a lista fica lá parada. Só três dos sete problemas têm conserto óbvio o
 * bastante para virar botão; os outros pedem julgamento e continuam sendo só diagnóstico.
 *
 * Conferido antes de expor: nenhum gatilho de UPDATE em `alunos` ou `pagamentos` dispara
 * mensagem. Só os de INSERT geram parcela e vínculo de pessoa.
 */

/** Turma faltando no aluno — é o que o tira da cobrança e do rateio por investidor. */
export function useDefinirTurmaDoAluno() {
  const invalidar = useInvalidarDados();
  return useMutation({
    mutationFn: async ({ alunoId, turmaId }: { alunoId: string; turmaId: string }) => {
      const { error } = await supabase
        .from('alunos')
        .update({ turma_id: turmaId })
        .eq('id', alunoId);
      if (error) throw error;
    },
    onSuccess: () => { invalidar('alunos'); },
  });
}

/**
 * Forma de pagamento em branco — `get_alunos_para_cobranca` exige `boleto`, então quem
 * está sem forma nunca entra na fila, mesmo com a cobrança aparecendo ligada na ficha.
 *
 * Definir `boleto` em quem tem parcela vencida faz a pessoa ENTRAR na fila de cobrança.
 * A tela avisa isso antes de aplicar — não é efeito colateral escondido.
 */
export function useDefinirFormaDePagamento() {
  const invalidar = useInvalidarDados();
  return useMutation({
    mutationFn: async ({ alunoId, forma }: { alunoId: string; forma: string }) => {
      const { error } = await supabase
        .from('alunos')
        .update({ forma_pagamento: forma })
        .eq('id', alunoId);
      if (error) throw error;
    },
    onSuccess: () => { invalidar('alunos'); },
  });
}

/**
 * Parcela de bolsista registrada como `pago` de R$ 0 em vez de `isento`. Não muda dinheiro
 * — os dois são zero — mas infla a contagem de pagamentos e distorce média por parcela.
 */
export function useMarcarParcelasComoIsentas() {
  const invalidar = useInvalidarDados();
  return useMutation({
    mutationFn: async ({ alunoId }: { alunoId: string }) => {
      const { error } = await supabase
        .from('pagamentos')
        .update({ status: 'isento' })
        .eq('aluno_id', alunoId)
        .eq('status', 'pago')
        .lte('valor', 0);
      if (error) throw error;
    },
    onSuccess: () => { invalidar('pagamentos'); },
  });
}
