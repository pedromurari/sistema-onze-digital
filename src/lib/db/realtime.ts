import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves, invalidacaoCruzada } from './keys';

/**
 * Ponte entre mudança no banco e cache da aplicação.
 *
 * Antes, cada tela abria o próprio canal de realtime e recarregava tudo sozinha. Isso
 * criava dois problemas: telas diferentes reagiam a conjuntos diferentes de tabelas (o
 * Dashboard escutava cinco, o resto nenhuma), e o Dashboard em particular escutava
 * `alunos`, `pagamentos` e `tarefas` — que não estavam publicadas no realtime, então
 * aquele código nunca disparou. Parecia reativo e não era.
 *
 * Aqui é um canal só, montado uma vez no CRMLayout, que traduz "mudou no banco" para
 * "invalida essas chaves". Qualquer tela que use os hooks de `src/lib/db` passa a se
 * atualizar sozinha, sem escrever uma linha de realtime.
 */

/**
 * Tabela no banco -> domínio de cache.
 *
 * Só entra aqui tabela que está de fato na publicação `supabase_realtime`. Escutar uma
 * tabela não publicada é código morto que finge funcionar — era o caso de `turmas` e
 * `leads` até 22/08/2026, e foi assim que o Dashboard antigo parecia reativo sem ser.
 *
 * `leads` fica de fora de propósito: são 11.778 linhas e, durante um lançamento, chegam
 * centenas por minuto. Publicá-la transformaria cada lead novo em recarga de uma lista
 * grande. Se algum dia for publicada, é aqui que entra.
 */
const DOMINIO_POR_TABELA: Record<string, keyof typeof invalidacaoCruzada> = {
  alunos:             'alunos',
  pagamentos:         'pagamentos',
  turmas:             'turmas',
  responsaveis:       'responsaveis',
  turma_responsaveis: 'responsaveis',
};

/**
 * Importação em lote e baixa de várias parcelas disparam dezenas de eventos seguidos.
 * Sem agrupar, cada um viraria um refetch. Um segundo é curto o bastante para parecer
 * instantâneo e longo o bastante para juntar a rajada.
 */
const ESPERA_AGRUPAMENTO_MS = 1000;

export function useRealtimeInvalidation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pendentes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const descarregar = () => {
      timer = null;
      const dominios = [...pendentes];
      pendentes.clear();

      for (const dominio of dominios) {
        for (const chave of invalidacaoCruzada[dominio] ?? []) {
          queryClient.invalidateQueries({ queryKey: chave });
        }
      }
    };

    const agendar = (tabela: string) => {
      const dominio = DOMINIO_POR_TABELA[tabela];
      if (!dominio) return;
      pendentes.add(dominio);
      if (timer) clearTimeout(timer);
      timer = setTimeout(descarregar, ESPERA_AGRUPAMENTO_MS);
    };

    let canal = supabase.channel('dados-globais');
    for (const tabela of Object.keys(DOMINIO_POR_TABELA)) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        () => agendar(tabela),
      );
    }
    canal.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [queryClient]);
}

/**
 * Invalidação manual, para depois de gravar. O realtime já cobre a maior parte, mas
 * chamar isto logo após a mutação evita a janela de ~1s até o evento chegar — e cobre o
 * caso de a tabela não estar publicada no realtime.
 */
export function useInvalidarDados() {
  const queryClient = useQueryClient();

  return (dominio: keyof typeof invalidacaoCruzada) => {
    for (const chave of invalidacaoCruzada[dominio] ?? []) {
      queryClient.invalidateQueries({ queryKey: chave });
    }
  };
}

export { chaves };
