export interface TemaWebinario {
  slug: string;
  titulo: string;
  headline: string;
  heroLinhaUm: string;
  heroLinhaDois: string;
  heroSubheadline: string;
  fechamento: string;
  subheadline: string;
  destaque: string;
  aprendizados: string[];
  paraQuem: string;
  chamadaVideo: string;
  pilares: { titulo: string; descricao: string }[];
  perguntas: { pergunta: string; resposta: string }[];
  cta: string;
  perguntaCentral: string;
  transformacao: string;
  publico: string[];
  professorRodrygo: string;
  professorJocimara: string;
  heroVarianteB?: { heroLinhaUm: string; heroLinhaDois: string; heroSubheadline: string };
}

export const TEMAS_WEBINARIO: Record<string, TemaWebinario> = {
  'escuta-psicanalitica': {
    slug: 'escuta-psicanalitica',
    titulo: 'A escuta que vai além do conselho',
    headline: 'Você ouve as pessoas. Mas sabe o que significa escutá-las de verdade?',
    heroLinhaUm: 'Ouvir não é o mesmo que',
    heroLinhaDois: 'escutar — e isso muda tudo',
    heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos mostram a diferença entre ouvir, aconselhar e escutar — com exemplos reais da prática clínica.',
    fechamento: 'a escuta que vai além do conselho',
    subheadline: 'Nesta aula gratuita, descubra o que muda quando saímos do conselho e começamos a estudar a escuta psicanalítica — com exemplos, ética e um caminho claro para aprofundar sua formação.',
    destaque: 'A escuta clínica não é uma coleção de frases prontas. É estudo, ética e prática supervisionada.',
    aprendizados: ['O que diferencia acolhimento, conselho e escuta clínica', 'Como formular perguntas sem conduzir a resposta', 'Quais são os próximos passos de uma formação em psicanálise'],
    paraQuem: 'Para quem se interessa por comportamento humano e quer estudar psicanálise com responsabilidade. Não é atendimento clínico nem habilitação profissional.',
    chamadaVideo: 'Rodrygo apresenta três cenas de conversa, mostra o que muda quando paramos de aconselhar e explica o caminho de estudo da Psicanálise Integrativa.',
    pilares: [
      { titulo: 'Do conselho à escuta', descricao: 'Entenda por que ajudar não significa oferecer uma resposta pronta — e onde começa a escuta psicanalítica.' },
      { titulo: 'Perguntas que abrem espaço', descricao: 'Observe, em exemplos educativos, como uma pergunta pode acolher sem conduzir a história do outro.' },
      { titulo: 'O caminho de formação', descricao: 'Veja o que estudar para desenvolver uma escuta com base teórica, ética e supervisão.' },
    ],
    perguntas: [
      { pergunta: 'Preciso trabalhar na área para acompanhar?', resposta: 'Não. A aula foi pensada para quem está conhecendo a psicanálise e para quem deseja aprofundar seus estudos.' },
      { pergunta: 'A aula me habilita a atender?', resposta: 'Não. É uma introdução educativa, não uma formação nem uma autorização para prática clínica.' },
    ],
    cta: 'QUERO ENTENDER A ESCUTA PSICANALÍTICA',
    perguntaCentral: 'Quando alguém te conta um problema, você tenta encontrar a frase certa — ou consegue abrir espaço para a pessoa escutar a própria história?',
    transformacao: 'Saia desta aula sabendo distinguir uma conversa acolhedora de uma escuta orientada por estudo, limites e responsabilidade. O objetivo não é decorar uma técnica: é descobrir as perguntas que um futuro estudante de psicanálise precisa aprender a fazer.',
    publico: ['Você gosta de ouvir pessoas, mas percebe que aconselhar nem sempre ajuda.', 'Você trabalha com gente e quer conhecer a diferença entre acolhimento e escuta clínica.', 'Você considera estudar psicanálise e quer conhecer a seriedade exigida por esse caminho.'],
    professorRodrygo: 'Rodrygo conduz a aula ao lado da Jocimara e mostra, com exemplos reais, por que confundir conselho com escuta é um dos erros mais comuns de quem quer ajudar alguém de verdade.',
    professorJocimara: 'Jocimara, psicanalista clínica integrativa e coordenadora pedagógica do IDM, participa da aula apresentando a diferença entre ouvir, aconselhar e escutar na prática clínica.',
    heroVarianteB: {
      heroLinhaUm: 'Você dá conselhos.',
      heroLinhaDois: 'Mas sabe escutar de verdade?',
      heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos mostram a diferença entre ouvir, aconselhar e escutar — com exemplos reais da prática clínica.',
    },
  },
  'padroes-emocionais': {
    slug: 'padroes-emocionais',
    titulo: 'Por que repetimos padrões?',
    headline: 'Por que algumas histórias parecem se repetir, mesmo quando você tenta fazer diferente?',
    heroLinhaUm: 'Aula Gratuita sobre',
    heroLinhaDois: 'Padrões Emocionais!',
    heroSubheadline: 'Uma aula ONLINE e gratuita sobre as histórias que se repetem em nossas relações.',
    fechamento: 'os padrões que se repetem',
    subheadline: 'Uma aula gratuita para olhar as repetições nas relações pela lente da psicanálise, sem rótulos ou respostas mágicas — e conhecer um caminho de estudo para ir além da primeira percepção.',
    destaque: 'Reconhecer uma repetição é o início de uma pergunta, não uma resposta pronta.',
    aprendizados: ['O que significa repetição na leitura psicanalítica', 'Como observar a própria história sem rotular pessoas', 'Como aprofundar esse estudo numa formação completa'],
    paraQuem: 'Para estudantes, profissionais de cuidado e pessoas curiosas sobre o comportamento humano. A aula tem caráter educativo.',
    chamadaVideo: 'Rodrygo conduz exemplos fictícios, propõe um exercício de observação e apresenta a trilha de formação em Psicanálise Integrativa.',
    pilares: [
      { titulo: 'Perceber a repetição', descricao: 'Olhe para situações que parecem mudar de cenário, mas repetem perguntas ou posições parecidas.' },
      { titulo: 'Investigar sem rotular', descricao: 'Conheça uma leitura que considera história e contexto, sem transformar pessoas em diagnósticos rápidos.' },
      { titulo: 'Estudar com método', descricao: 'Descubra como teoria, análise pessoal e supervisão ajudam a aprofundar essa investigação.' },
    ],
    perguntas: [
      { pergunta: 'Esta aula é terapia?', resposta: 'Não. Os exemplos são educativos e fictícios; a aula não oferece avaliação individual nem atendimento clínico.' },
      { pergunta: 'Preciso conhecer psicanálise antes?', resposta: 'Não. Os conceitos serão apresentados de forma introdutória.' },
    ],
    cta: 'QUERO EXPLORAR OS PADRÕES EMOCIONAIS',
    perguntaCentral: 'Muda a pessoa, muda o cenário, mas a sensação de estar vivendo a mesma história continua?',
    transformacao: 'A aula mostra como transformar a pergunta sobre a repetição em uma investigação mais cuidadosa sobre história e relações. Sem diagnóstico à distância e sem prometer mudar a vida de ninguém em uma hora.',
    publico: ['Você se interessa por comportamento humano e pelas histórias que se repetem.', 'Você estuda ou trabalha com pessoas e quer fugir dos rótulos fáceis.', 'Você pensa em uma formação que aprofunde o tema com teoria e prática responsável.'],
    professorRodrygo: 'Rodrygo conduz exemplos de histórias que parecem se repetir e mostra como a psicanálise olha pra esses padrões sem rotular ninguém.',
    professorJocimara: 'Jocimara participa da proposta pedagógica desta aula, trazendo a leitura clínica sobre contexto, repetição e os limites de uma análise à distância.',
  },
  'formacao-psicanalise': {
    slug: 'formacao-psicanalise',
    titulo: 'O caminho de formação em psicanálise',
    headline: 'Quer estudar psicanálise, mas não sabe por onde começar — nem em qual formação confiar?',
    heroLinhaUm: 'Aula Gratuita sobre',
    heroLinhaDois: 'Formação em Psicanálise!',
    heroSubheadline: 'Uma aula ONLINE e gratuita para entender como escolher seu caminho de formação.',
    fechamento: 'seu caminho de formação',
    subheadline: 'Nesta aula gratuita, conheça os pilares de uma formação responsável: teoria, escuta, ética e prática supervisionada. Saia com perguntas concretas para escolher seu próximo passo com mais clareza.',
    destaque: 'Uma formação responsável precisa de tempo, leitura, supervisão e limites claros de atuação.',
    aprendizados: ['Os pilares de estudo de uma formação', 'Perguntas para avaliar um programa de ensino', 'Como funciona a proposta de Psicanálise Integrativa do IDM'],
    paraQuem: 'Para quem está considerando iniciar estudos em psicanálise e quer comparar percursos com mais clareza.',
    chamadaVideo: 'Rodrygo abre os bastidores da jornada de formação, explica a diferença entre estudar e estar pronto para atuar, e apresenta a proposta do IDM.',
    pilares: [
      { titulo: 'O que se estuda', descricao: 'Conheça o papel da teoria, da leitura e da discussão de casos no percurso de formação.' },
      { titulo: 'Ética e prática', descricao: 'Entenda por que limites de atuação, análise pessoal e supervisão importam tanto quanto o conteúdo.' },
      { titulo: 'Escolher com critério', descricao: 'Leve perguntas concretas para comparar propostas de formação antes de tomar uma decisão.' },
    ],
    perguntas: [
      { pergunta: 'A aula já é parte da formação?', resposta: 'Não. É uma apresentação gratuita do percurso de estudo e da proposta do IDM.' },
      { pergunta: 'Preciso ter experiência prévia?', resposta: 'Não. A aula ajuda justamente quem está avaliando por onde começar.' },
    ],
    cta: 'QUERO CONHECER O CAMINHO DE FORMAÇÃO',
    perguntaCentral: 'Um certificado é suficiente para saber escutar, estudar casos e reconhecer os próprios limites?',
    transformacao: 'Você vai sair com critérios para avaliar uma formação: o que se estuda, como se pratica, onde entram ética e supervisão e quais perguntas fazer antes de investir seu tempo e dinheiro.',
    publico: ['Você quer começar a estudar psicanálise, mas encontra ofertas muito diferentes.', 'Você precisa entender a diferença entre uma introdução e um percurso de formação.', 'Você quer conhecer a proposta do IDM antes de decidir se ela faz sentido para você.'],
    professorRodrygo: 'Rodrygo abre os bastidores da jornada de formação e mostra os critérios pra avaliar um caminho de estudo sério antes de investir tempo e dinheiro.',
    professorJocimara: 'Jocimara participa da proposta pedagógica desta aula, representando a coordenação pedagógica da Formação em Psicanálise Integrativa do IDM.',
  },
};

export const temaPorSlug = (slug: string) => TEMAS_WEBINARIO[slug] ?? {
  slug: 'psicanalise',
  titulo: 'Psicanálise Integrativa',
  headline: 'Conheça a Psicanálise Integrativa',
  heroLinhaUm: 'Aula Gratuita de',
  heroLinhaDois: 'Psicanálise Integrativa!',
  heroSubheadline: 'Uma aula ONLINE e gratuita sobre escuta, estudo e caminhos de formação.',
  fechamento: 'o estudo da psicanálise',
  subheadline: 'Uma aula gratuita sobre escuta, estudo e caminhos de formação.',
  destaque: 'Conheça fundamentos e tire suas dúvidas antes de decidir seu próximo passo.',
  aprendizados: ['Fundamentos da escuta', 'Percurso de estudo', 'Próximos passos'],
  paraQuem: 'Para quem deseja estudar psicanálise com responsabilidade.',
  chamadaVideo: 'Uma introdução educativa ao percurso de formação do IDM.',
  pilares: [
    { titulo: 'Escuta', descricao: 'Conheça os fundamentos da escuta psicanalítica.' },
    { titulo: 'Estudo', descricao: 'Entenda a importância da teoria e da ética.' },
    { titulo: 'Próximos passos', descricao: 'Veja como avaliar um percurso de formação.' },
  ],
  perguntas: [
    { pergunta: 'Preciso de conhecimento prévio?', resposta: 'Não. Esta é uma introdução educativa.' },
  ],
  cta: 'QUERO ASSISTIR À AULA GRATUITA',
  perguntaCentral: 'O que vale observar antes de iniciar seus estudos em psicanálise?',
  transformacao: 'Conheça fundamentos, limites e caminhos possíveis para aprofundar seu estudo com responsabilidade.',
  publico: ['Pessoas interessadas em comportamento humano.', 'Quem considera estudar psicanálise.', 'Quem quer conhecer a proposta do IDM.'],
  professorRodrygo: 'Rodrygo apresenta o tema com exemplos e mostra como esse estudo se conecta à Psicanálise Integrativa no IDM.',
  professorJocimara: 'Jocimara participa da proposta pedagógica desta aula, representando a coordenação pedagógica do Instituto Despertamente.',
};
