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
  // Teste A/B/C/D/E: lista de variantes de headline pra sortear entre mais
  // de 2 opções. Quando presente, tem prioridade sobre heroVarianteB. Cada
  // `id` vai pro campo `variante_headline` em webinario_tracking, pra
  // comparar taxa de conversão por variante e manter só as melhores depois.
  heroVariantes?: { id: string; heroLinhaUm: string; heroLinhaDois: string; heroSubheadline: string }[];
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
    heroVariantes: [
      {
        id: 'A',
        heroLinhaUm: 'Ouvir não é o mesmo que',
        heroLinhaDois: 'escutar — e isso muda tudo',
        heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos mostram a diferença entre ouvir, aconselhar e escutar — com exemplos reais da prática clínica.',
      },
      {
        id: 'B',
        heroLinhaUm: 'Você dá conselhos.',
        heroLinhaDois: 'Mas sabe escutar de verdade?',
        heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos mostram a diferença entre ouvir, aconselhar e escutar — com exemplos reais da prática clínica.',
      },
      {
        id: 'C',
        heroLinhaUm: 'Você já ficou exausto(a)',
        heroLinhaDois: 'de ouvir o problema dos outros?',
        heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos mostram por que só ouvir cansa — e o que muda quando você aprende a escutar de verdade.',
      },
      {
        id: 'D',
        heroLinhaUm: 'Todo mundo vem até você',
        heroLinhaDois: 'contar os problemas. E agora?',
        heroSubheadline: 'Numa aula gratuita e ao vivo, descubra se essa escuta que você já tem de natureza pode virar uma formação séria em Psicanálise Integrativa.',
      },
      {
        id: 'E',
        heroLinhaUm: 'Existe uma pergunta que muda',
        heroLinhaDois: 'qualquer conversa. Você sabe qual?',
        heroSubheadline: 'Numa aula gratuita e ao vivo, Rodrygo Murari e Jocimara Anjos revelam a diferença entre ouvir, aconselhar e escutar — e por que isso muda tudo.',
      },
    ],
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

// Fallback: só entra em cena se algum link cair com um slug que não bate
// com nenhum tema cadastrado acima (não deveria acontecer em produção --
// os redirecionamentos internos sempre apontam pro slug real). Mesmo
// sendo uma rede de segurança, a copy segue o mesmo padrão AIDA dos temas
// reais (dor → causa → solução → ação), não um texto de manual.
export const temaPorSlug = (slug: string) => TEMAS_WEBINARIO[slug] ?? {
  slug: 'psicanalise',
  titulo: 'Psicanálise Integrativa',
  headline: 'Você já tentou de tudo pra ajudar — e ainda sente que falta alguma coisa?',
  heroLinhaUm: 'Você tenta ajudar as pessoas.',
  heroLinhaDois: 'Mas sente que falta algo mais profundo?',
  heroSubheadline: 'Numa aula gratuita e ao vivo, o Instituto Despertamente mostra por que ouvir não resolve, aconselhar nem sempre ajuda — e qual é o caminho de estudo pra escutar de verdade.',
  fechamento: 'o estudo da escuta que transforma',
  subheadline: 'Nesta aula gratuita, descubra por que a maioria das tentativas de ajudar alguém esbarram no mesmo limite — e qual é o caminho real pra desenvolver uma escuta que muda conversas, relações e vidas.',
  destaque: 'Ajudar de verdade não é dar a resposta certa. É saber abrir espaço pra pessoa encontrar a dela — e isso se aprende.',
  aprendizados: ['Por que aconselhar quase nunca resolve o problema de quem você quer ajudar', 'O que muda quando você escuta em vez de só ouvir', 'Qual é o caminho de formação pra desenvolver essa escuta com ética e responsabilidade'],
  paraQuem: 'Para quem já percebeu que "dar a dica certa" não é suficiente e quer entender, de verdade, o que está por trás de uma escuta que transforma.',
  chamadaVideo: 'Uma introdução direta ao caminho de formação em Psicanálise Integrativa do IDM — sem enrolação, com exemplos reais.',
  pilares: [
    { titulo: 'O limite do conselho', descricao: 'Entenda por que a boa intenção de "resolver o problema do outro" quase sempre esbarra no mesmo erro.' },
    { titulo: 'A escuta que muda tudo', descricao: 'Veja a diferença prática entre ouvir, aconselhar e escutar de verdade — com exemplos reais.' },
    { titulo: 'O caminho de formação', descricao: 'Descubra o que estudar pra desenvolver essa escuta com base teórica, ética e responsabilidade.' },
  ],
  perguntas: [
    { pergunta: 'Preciso de conhecimento prévio?', resposta: 'Não. Esta aula foi pensada pra quem está começando a se interessar pelo tema e também pra quem já estuda e quer aprofundar.' },
    { pergunta: 'A aula me habilita a atender?', resposta: 'Não. É uma introdução educativa, não uma formação nem uma autorização para prática clínica.' },
  ],
  cta: 'QUERO GARANTIR MINHA VAGA GRATUITA',
  perguntaCentral: 'Quantas vezes você tentou ajudar alguém com a resposta certa — e mesmo assim sentiu que não adiantou?',
  transformacao: 'Saia desta aula sabendo exatamente por que "ouvir e dar um conselho" não é o mesmo que escutar de verdade — e com um caminho claro de como desenvolver essa escuta com estudo, ética e responsabilidade.',
  publico: ['Você se pega dando conselho sem perceber e sente que não resolve nada.', 'Você já pensou em estudar psicanálise, mas não sabe por onde começar.', 'Você quer entender pessoas — e a si mesmo — num nível mais profundo.'],
  professorRodrygo: 'Rodrygo apresenta o tema com exemplos reais e mostra como essa escuta se desenvolve na prática da Psicanálise Integrativa do IDM.',
  professorJocimara: 'Jocimara, psicanalista clínica integrativa e coordenadora pedagógica do IDM, participa trazendo a experiência da prática clínica real.',
};
