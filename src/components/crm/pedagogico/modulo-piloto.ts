// Proposta autoral de avaliação para revisão pedagógica. Não é a apostila oficial.
// Ementa interna: supabase/functions/leads-ia-responder/index.ts (Arco 1).
// Referência primária: Freud, Introductory Lectures on Psycho-analysis (1915–17).
export const MODULO_PILOTO = {
  titulo: 'Piloto — Fundamentos da Psicanálise',
  modulo: 'Arco 1 · Fundamentos da Psicanálise',
  instrucoes: 'PROPOSTA PARA REVISÃO DA COORDENAÇÃO PEDAGÓGICA. Responda com suas palavras e diferencie conceitos teóricos de conclusões sobre pessoas reais. Não está liberada para alunos nem para correção automática.',
  fonte: 'https://www.gutenberg.org/ebooks/75810',
  questoes: [
    {
      enunciado: 'Na perspectiva introdutória de Freud, o que significa dizer que nem todos os processos psíquicos são conscientes? Explique a diferença entre observar uma experiência consciente e formular uma hipótese sobre processos inconscientes.',
      resposta_esperada: 'Reconhece que, na teoria freudiana, processos psíquicos podem não estar acessíveis diretamente à consciência e que o inconsciente é inferido a partir de manifestações e do trabalho de interpretação, não observado como um fato imediato. Não equipara inconsciente a qualquer esquecimento nem apresenta a hipótese como diagnóstico individual.',
      criterios_correcao: '1 ponto: distingue consciência e processos inconscientes na teoria. 0,5 ponto: explica o caráter inferencial da interpretação. 0,5 ponto: evita generalização ou diagnóstico sem contexto.',
    },
    {
      enunciado: 'Freud inicia suas conferências por atos falhos. Como um lapso pode ser abordado em uma investigação psicanalítica? Por que um lapso isolado não autoriza afirmar com certeza o desejo de alguém?',
      resposta_esperada: 'Descreve o lapso como possível ponto de investigação de sentidos e associações, considerando o contexto e o que a própria pessoa relata. Reconhece que uma interpretação única e conclusiva a partir do erro isolado não é justificada.',
      criterios_correcao: '1 ponto: relaciona ato falho a investigação de sentido na teoria. 0,5 ponto: considera associações e contexto. 0,5 ponto: explicita limite da interpretação isolada.',
    },
    {
      enunciado: 'Explique, em linhas gerais, o papel da associação livre no método psicanalítico e como a resistência pode aparecer durante esse processo.',
      resposta_esperada: 'Associação livre: convite a relatar pensamentos/associações sem seleção deliberada, como material para investigação conjunta. Resistência: dificuldade, interrupção ou oposição que pode surgir diante de determinados conteúdos; não deve ser rotulada automaticamente em qualquer silêncio.',
      criterios_correcao: '1 ponto: descreve associação livre. 0,5 ponto: caracteriza resistência como conceito do método. 0,5 ponto: evita aplicação automática ou coercitiva.',
    },
    {
      enunciado: 'Uma pessoa troca uma palavra ao falar em público. Um colega diz que isso prova um conflito inconsciente específico. Formule uma resposta crítica, coerente com o método psicanalítico, sobre o que seria e não seria possível concluir.',
      resposta_esperada: 'O episódio pode motivar perguntas e exploração das associações da pessoa, mas não prova por si só um conflito específico. Uma leitura responsável evita impor sentido, considera contexto e admite outras explicações possíveis.',
      criterios_correcao: '0,5 ponto: rejeita a conclusão categórica. 0,5 ponto: propõe investigação por contexto e associações. 0,5 ponto: reconhece explicações alternativas. 0,5 ponto: respeita a autonomia da pessoa.',
    },
    {
      enunciado: 'Compare teoria e prática no início da formação: por que conhecer conceitos como inconsciente, ato falho e resistência não basta para interpretar clinicamente uma pessoa? Cite dois cuidados necessários.',
      resposta_esperada: 'Diferencia aprendizagem conceitual de prática clínica. Aponta ao menos dois cuidados, como escuta contextualizada, não impor interpretações, supervisão/formação adequada, respeito à pessoa e limites do que se sabe a partir de um relato breve.',
      criterios_correcao: '1 ponto: diferencia conhecimento teórico e atuação clínica. 0,5 ponto por cada cuidado pertinente, até 1 ponto.',
    },
  ],
} as const;
