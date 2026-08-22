/**
 * Chaves de cache do React Query, num lugar só.
 *
 * Por que isto existe: hoje cada tela busca o que precisa por conta própria, com
 * `useEffect` + `useState`. Duas telas abertas lado a lado carregam os mesmos dados em
 * momentos diferentes e nunca mais se falam — gravar um pagamento no Financeiro não faz
 * o Dashboard nem a Cobrança perceberem. É a raiz da informação divergente entre telas.
 *
 * Com chaves padronizadas, uma gravação invalida `chaves.pagamentos.raiz` e TODA tela que
 * depende de pagamento recarrega sozinha. O `QueryClient` já está configurado em
 * `src/App.tsx` (staleTime de 5 min) desde sempre — só nunca tinha sido usado.
 *
 * Convenção: sempre da chave mais geral para a mais específica, para que invalidar a raiz
 * alcance as derivadas. `['pagamentos']` invalida `['pagamentos','porAluno', id]`.
 */
export const chaves = {
  alunos: {
    raiz: ['alunos'] as const,
    lista: () => [...chaves.alunos.raiz, 'lista'] as const,
    porId: (id: string) => [...chaves.alunos.raiz, 'porId', id] as const,
    porTurma: (turmaId: string) => [...chaves.alunos.raiz, 'porTurma', turmaId] as const,
  },

  pagamentos: {
    raiz: ['pagamentos'] as const,
    lista: () => [...chaves.pagamentos.raiz, 'lista'] as const,
    porAluno: (alunoId: string) => [...chaves.pagamentos.raiz, 'porAluno', alunoId] as const,
  },

  turmas: {
    raiz: ['turmas'] as const,
    lista: () => [...chaves.turmas.raiz, 'lista'] as const,
  },

  responsaveis: {
    raiz: ['responsaveis'] as const,
    lista: () => [...chaves.responsaveis.raiz, 'lista'] as const,
    porTurma: () => [...chaves.responsaveis.raiz, 'porTurma'] as const,
  },

  leads: {
    raiz: ['leads'] as const,
    lista: () => [...chaves.leads.raiz, 'lista'] as const,
    unificados: () => [...chaves.leads.raiz, 'unificados'] as const,
  },

  pessoas: {
    raiz: ['pessoas'] as const,
    busca: () => [...chaves.pessoas.raiz, 'busca'] as const,
    vinculos: (pessoaId: string) => [...chaves.pessoas.raiz, 'vinculos', pessoaId] as const,
    timeline: (pessoaId: string) => [...chaves.pessoas.raiz, 'timeline', pessoaId] as const,
  },

  /**
   * Não tem invalidação cruzada de propósito: a view lê alunos, pagamentos e turmas, e
   * refazer essa varredura a cada baixa de parcela custaria mais do que vale. É um
   * diagnóstico para se olhar de vez em quando, não um número de tela.
   */
  integridade: {
    raiz: ['integridade'] as const,
    financeira: () => [...chaves.integridade.raiz, 'financeira'] as const,
  },

  lancamentos: {
    raiz: ['lancamentos'] as const,
    lista: () => [...chaves.lancamentos.raiz, 'lista'] as const,
    leads: (lancamentoId: string) => [...chaves.lancamentos.raiz, 'leads', lancamentoId] as const,
  },
} as const;

/**
 * Domínios que mudam juntos. Mexer num pagamento muda o status financeiro do aluno, então
 * quem invalida pagamento precisa invalidar aluno também — senão o Dashboard continua
 * mostrando o aluno como inadimplente depois da baixa.
 */
export const invalidacaoCruzada: Record<string, readonly (readonly string[])[]> = {
  pagamentos: [chaves.pagamentos.raiz, chaves.alunos.raiz, chaves.pessoas.raiz],
  alunos:     [chaves.alunos.raiz, chaves.pagamentos.raiz, chaves.pessoas.raiz],
  turmas:     [chaves.turmas.raiz, chaves.alunos.raiz],
  // Mexer no split de uma turma muda o repasse de todo pagamento dela — Balanço e CFO
  // precisam recalcular, não só a tela que editou.
  responsaveis: [chaves.responsaveis.raiz, chaves.pagamentos.raiz, chaves.turmas.raiz],
  leads:      [chaves.leads.raiz, chaves.pessoas.raiz],
  // Lead de lançamento vira lead do pool e pessoa canônica pelos gatilhos
  // `sync_lancamento_lead_to_time_comercial` e `trg_pessoa_vincular`. Sem esta linha,
  // mexer no Kanban do lançamento deixava o Time Comercial e a ficha da pessoa velhos.
  lancamentos: [chaves.lancamentos.raiz, chaves.leads.raiz, chaves.pessoas.raiz],
  pessoas:    [chaves.pessoas.raiz],
};
