import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePessoaPorId, usePessoaPorTelefone } from '@/lib/db';
import { FichaPessoa } from './FichaPessoa';

/**
 * Deixa a ficha da pessoa abrir de qualquer tela.
 *
 * A ficha foi construída e ficou ilhada: só a tela Pessoas conseguia abrir. Na prática o
 * problema que ela existe para resolver continuava — a vendedora olhando um lead no Time
 * Comercial, ou você olhando um aluno no Financeiro, ainda tinha que sair do módulo e
 * procurar a pessoa de novo para ver o histórico dela.
 *
 * Aqui a ficha é montada UMA vez, no topo do CRM, e qualquer tela abaixo pede a abertura
 * pelo hook. Nenhuma tela precisa importar a ficha, segurar estado ou repassar propriedade
 * em cadeia — o que na prática é o que impede esse tipo de peça de ser adotada.
 *
 * Duas portas de entrada, porque as telas têm informações diferentes em mãos:
 *   - `abrirFichaPorId(pessoa_id)`   — leads, alunos e lançamentos já têm a coluna
 *   - `abrirFichaPorTelefone(numero)` — o Chat conversa por número, sem `pessoa_id`
 */

interface Alvo {
  tipo: 'id' | 'telefone';
  valor: string;
}

interface FichaPessoaAPI {
  abrirFichaPorId: (pessoaId: string | null | undefined) => void;
  abrirFichaPorTelefone: (telefone: string | null | undefined) => void;
  fecharFicha: () => void;
  /**
   * Se a ficha está aberta. Existe para quem mais ocupa a borda direita da tela — hoje só
   * o ChatWidget — poder sair do caminho em vez de ficar embaixo do Sheet: a ficha é
   * `z-50` e o chat flutuante é `z-[60]`, então sem isso o chat sempre cobre a ficha.
   */
  fichaAberta: boolean;
}

const Contexto = createContext<FichaPessoaAPI | null>(null);

export function FichaPessoaProvider({ children }: { children: ReactNode }) {
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  // Só um dos dois hooks fica ativo por vez — o outro recebe undefined e não busca.
  const { data: porId }       = usePessoaPorId(alvo?.tipo === 'id' ? alvo.valor : undefined);
  const { data: porTelefone } = usePessoaPorTelefone(alvo?.tipo === 'telefone' ? alvo.valor : undefined);

  const pessoa = alvo?.tipo === 'id' ? porId ?? null : porTelefone ?? null;

  const api = useMemo<FichaPessoaAPI>(() => ({
    abrirFichaPorId: (pessoaId) => {
      if (pessoaId) setAlvo({ tipo: 'id', valor: pessoaId });
    },
    abrirFichaPorTelefone: (telefone) => {
      if (telefone) setAlvo({ tipo: 'telefone', valor: telefone });
    },
    fecharFicha: () => setAlvo(null),
    fichaAberta: alvo !== null,
  }), [alvo]);

  const fechar = useCallback(() => setAlvo(null), []);

  return (
    <Contexto.Provider value={api}>
      {children}
      <FichaPessoa pessoa={pessoa} aberta={alvo !== null} onFechar={fechar} />
    </Contexto.Provider>
  );
}

/**
 * Devolve as funções de abertura. Fora do provider devolve funções que não fazem nada, em
 * vez de quebrar: uma tela renderizada isoladamente (num teste, num storybook) não deve
 * cair por causa de um recurso acessório.
 */
export function useFichaPessoa(): FichaPessoaAPI {
  return useContext(Contexto) ?? {
    abrirFichaPorId: () => {},
    abrirFichaPorTelefone: () => {},
    fecharFicha: () => {},
    fichaAberta: false,
  };
}
