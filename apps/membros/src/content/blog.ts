/**
 * Posts do blog do Instituto Despertamente.
 *
 * Ficam em arquivo, não em banco: o Pedro não quer tela de autoatendimento
 * pra conteúdo -- ele manda o material e a gente publica direto. Assim o
 * post fica versionado no git (dá pra ver quem mudou o quê e voltar atrás)
 * e não precisa de CMS nem de migração pra subir artigo novo.
 *
 * PRA PUBLICAR UM POST NOVO:
 *   1. adiciona um objeto aqui, com `publicado: true`
 *   2. `corpo` é uma lista de blocos (ver `Bloco` abaixo). Texto puro vira
 *      parágrafo; texto que começa com '## ' vira subtítulo (e entra no
 *      índice lateral). Os blocos visuais deixam o post menos "texto e fundo
 *      preto" -- pedido do Pedro em 24/11/2026: usar pelo menos um diagrama
 *      ou imagem, um destaque e um bloco prático por post.
 *   3. pronto -- /blog e a home se atualizam sozinhas
 *
 * REGRA: nada de post inventado pra "encher" o blog. Até 21/11/2026 a seção
 * de blog da home mostrava 6 cards com foto de banco de imagem, data de
 * junho/2025 e "Ler mais" que não levava a lugar nenhum -- não existia
 * artigo nenhum atrás. Isso saiu. Blog vazio é melhor que blog de mentira:
 * o visitante que clica e cai no nada aprende que o site não é sério.
 */

export type Bloco =
  | string
  /** Frase grande em destaque, no meio do texto. */
  | { tipo: 'destaque'; texto: string }
  /** Foto com legenda (caminho em /public ou URL do R2). */
  | { tipo: 'imagem'; src: string; legenda: string }
  /** Diagrama animado em SVG (src/components/blog/PostVisual.tsx). */
  | { tipo: 'diagrama'; nome: 'ciclo' | 'tripe' | 'arvore'; legenda?: string }
  /** Grade de cartões numerados. */
  | { tipo: 'cards'; itens: { titulo: string; texto: string }[] }
  /** Caixa de exercício prático, com passos numerados. */
  | { tipo: 'pratica'; titulo: string; passos: string[] }
  /** Pergunta de reflexão, com moldura dourada. */
  | { tipo: 'pergunta'; texto: string }
  /** Chamada pra um programa do Instituto. */
  | { tipo: 'cta'; titulo: string; texto: string; botao: string; href: string }

export interface BlogPost {
  slug: string
  titulo: string
  categoria: string
  resumo: string
  /** ISO (yyyy-mm-dd) — usado pra ordenar e pra <time dateTime>. */
  data: string
  autor: string
  /** Imagem de capa (caminho em /public ou URL do R2). Vira o banner do post. */
  capa?: string
  /** Minutos estimados de leitura. */
  leitura: number
  corpo: Bloco[]
  publicado: boolean
}

export const BLOG_POSTS: BlogPost[] = [
  // Primeiros 3 posts, escritos pelo sistema a partir do briefing
  // pré-preenchido e aprovados pelo Pedro em 24/11/2026. Aprofundados e com
  // blocos visuais no mesmo dia, a pedido dele ("tá raso, quero ludicidade").
  {
    slug: 'por-que-voce-repete-o-mesmo-padrao',
    titulo: 'Por que você repete o mesmo padrão, mesmo sabendo que ele te machuca',
    categoria: 'Psicanálise aplicada',
    resumo:
      'Você promete que dessa vez vai ser diferente, e se pega no mesmo lugar. A psicanálise tem um nome pra isso, e entender o mecanismo é o primeiro passo pra sair dele.',
    data: '2026-11-24',
    autor: 'Instituto Despertamente',
    leitura: 9,
    capa: '/images/turmas/aula-sala-cheia.jpg',
    publicado: true,
    corpo: [
      'Você termina um relacionamento e jura que o próximo vai ser diferente. Meses depois, percebe que está discutindo pelos mesmos motivos, com outra pessoa. Ou troca de emprego por causa de um chefe difícil e, no novo lugar, encontra outro chefe igualzinho. Ou decide que este ano vai cuidar do dinheiro, e em março já está no mesmo aperto de sempre. Parece azar. Quase nunca é.',
      'Este texto é sobre esse mecanismo: o que ele é, por que ele resiste tanto à força de vontade e o que dá pra começar a fazer com ele.',
      '## O nome disso é repetição',
      'Freud percebeu, ainda no começo do século passado, que muitos pacientes voltavam sempre ao mesmo ponto de sofrimento. Não por gostarem de sofrer, mas porque havia algo não elaborado que insistia em voltar. Ele chamou isso de compulsão à repetição: aquilo que não conseguimos lembrar e entender, tendemos a encenar de novo.',
      { tipo: 'destaque', texto: 'Aquilo que não é lembrado tende a ser repetido. A cena muda de cenário e de personagens, mas o roteiro é o mesmo.' },
      'Em outras palavras, a repetição é uma tentativa da mente de resolver uma história antiga usando personagens novos. Quem cresceu precisando conquistar a atenção de um pai distante pode passar a vida atraída por pessoas distantes, como se dessa vez, finalmente, fosse conseguir. O problema é que, sem consciência do roteiro, a cena termina sempre igual.',
      { tipo: 'diagrama', nome: 'ciclo', legenda: 'O ciclo da repetição: um gatilho parecido com o passado acorda uma emoção antiga, que dispara a reação de sempre e leva ao mesmo desfecho.' },
      '## Como o ciclo funciona, passo a passo',
      { tipo: 'cards', itens: [
        { titulo: 'Gatilho', texto: 'Algo no presente lembra, mesmo que de longe, uma situação antiga: um tom de voz, um silêncio, uma crítica.' },
        { titulo: 'Emoção antiga', texto: 'O corpo reage antes do pensamento. A sensação é desproporcional ao que está acontecendo agora, porque pertence a outra época.' },
        { titulo: 'Reação automática', texto: 'Você faz o que aprendeu a fazer para se proteger: briga, some, cede, se cala, compra, come.' },
        { titulo: 'Mesmo desfecho', texto: 'A história termina onde sempre termina, e vem a culpa e a promessa de que da próxima vez vai ser diferente.' },
      ] },
      '## Por que saber disso não basta',
      'Quem já tentou mudar um padrão só na força de vontade sabe como é. Você entende, promete, se esforça, e na hora em que a emoção sobe, faz exatamente o que fazia antes. Isso acontece porque o padrão não mora na parte da mente que toma decisões conscientes. Ele mora nas associações que você construiu cedo, quando ainda não tinha palavras pra elas.',
      'É por isso que, no Instituto, falamos tanto da mente que decide por você. Grande parte das escolhas que parecem suas foram feitas antes, por uma versão sua que estava tentando se proteger. Naquela época, a estratégia fazia sentido. Hoje, ela cobra um preço alto.',
      'A boa notícia é que um padrão que foi aprendido também pode ser reorganizado. Não com uma decisão de ano novo, mas com um trabalho de olhar, nomear e elaborar, que é exatamente o que acontece numa análise.',
      { tipo: 'imagem', src: '/images/turmas/rodrygo-alunas.jpg', legenda: 'Nas formações do Instituto, a teoria da repetição é estudada junto com a prática clínica e a análise pessoal.' },
      '## Sinais de que você está dentro de uma repetição',
      'Nem todo problema que volta é uma repetição no sentido psicanalítico. Mas alguns sinais costumam aparecer:',
      { tipo: 'cards', itens: [
        { titulo: 'Sensação de já ter vivido isso', texto: 'Você percebe que a situação é nova, mas a sensação por dentro é muito conhecida.' },
        { titulo: 'Reação maior que o fato', texto: 'Uma coisa pequena gera uma resposta enorme, e depois você se pergunta por quê.' },
        { titulo: 'Os outros mudam, a história não', texto: 'Muda o parceiro, o chefe, o emprego, a cidade, e o final é o mesmo.' },
      ] },
      '## O que dá pra observar já essa semana',
      'Não existe atalho, mas existe um começo. Na próxima vez que você se pegar numa situação conhecida, experimente este exercício. Não precisa responder certo. Só o fato de olhar já cria uma pequena distância entre você e o automático.',
      { tipo: 'pratica', titulo: 'Exercício: o diário da cena repetida', passos: [
        'Anote, no mesmo dia, a situação em que você sentiu que "lá vamos nós de novo".',
        'Escreva o que sentiu um pouco antes de reagir, no corpo e na emoção.',
        'Pergunte: com quem essa sensação se parece na minha história?',
        'Escreva o que você esperava que acontecesse dessa vez.',
        'No fim da semana, releia. Os padrões aparecem quando a gente olha o conjunto.',
      ] },
      'Essa distância é o espaço onde a mudança começa. Na análise, ela é construída com tempo, escuta e alguém treinado pra perceber o que você ainda não consegue ver sozinho.',
      { tipo: 'pergunta', texto: 'Qual é a cena que você vive repetindo, e quem era o primeiro personagem dela?' },
      { tipo: 'cta', titulo: 'Quer olhar pra isso com acompanhamento?', texto: 'O Divã IDM oferece sessões de psicanálise online com psicanalistas formados pelo Instituto.', botao: 'Conhecer o Divã IDM', href: '/programas/diva-idm' },
    ],
  },
  {
    slug: 'como-e-a-formacao-de-um-psicanalista',
    titulo: 'Como é, de verdade, a formação de um psicanalista',
    categoria: 'Ser terapeuta',
    resumo:
      'Teoria é só uma das partes. Entenda o tripé que sustenta a formação em psicanálise e o que observar antes de escolher onde estudar.',
    data: '2026-11-24',
    autor: 'Instituto Despertamente',
    leitura: 9,
    capa: '/images/turmas/turma-certificados.jpg',
    publicado: true,
    corpo: [
      'Muita gente chega até nós com a mesma dúvida: dá pra virar psicanalista fazendo um curso? A resposta honesta é que um curso, sozinho, não forma ninguém. O que forma um psicanalista é um caminho com três partes que precisam andar juntas, e um tempo que não dá pra encurtar.',
      'Se você está pensando em seguir essa profissão, ou só quer entender o que existe por trás do divã, este texto explica como a formação funciona e o que observar antes de escolher onde estudar.',
      '## O tripé da formação',
      'Desde Freud, a formação psicanalítica se apoia em três pilares: o estudo da teoria, a análise pessoal e a supervisão clínica. Faltando qualquer um deles, a formação fica manca.',
      { tipo: 'diagrama', nome: 'tripe', legenda: 'Os três pilares sustentam o psicanalista juntos. Tirar um deles derruba o resto.' },
      { tipo: 'cards', itens: [
        { titulo: 'Teoria', texto: 'O mapa: como a mente se organiza, o que é o inconsciente, como funcionam a transferência, as defesas e o sintoma. Sem ela, o atendimento vira conversa de boa vontade.' },
        { titulo: 'Análise pessoal', texto: 'Onde o futuro analista passa pelo que vai oferecer aos outros. Ninguém consegue escutar no outro aquilo que ainda não consegue escutar em si.' },
        { titulo: 'Supervisão', texto: 'O espaço em que os primeiros atendimentos são discutidos com alguém mais experiente. Dá segurança pra começar e protege o paciente enquanto o analista aprende.' },
      ] },
      { tipo: 'destaque', texto: 'Você não aprende psicanálise só lendo sobre ela. Você aprende passando por ela.' },
      '## Por que a análise pessoal é obrigatória',
      'Esse é o pilar que mais surpreende quem está começando. Por que o aluno precisa fazer análise? Porque o principal instrumento de trabalho do psicanalista é a própria escuta, e ela é atravessada pela história de quem escuta.',
      'Sem ter olhado pras próprias questões, o analista corre o risco de confundir o que é do paciente com o que é dele: se irritar com o que o incomoda em si, se identificar demais, dar conselhos onde deveria escutar. A análise pessoal é o que permite separar uma coisa da outra.',
      'Na prática, é também onde a teoria deixa de ser conteúdo de prova e vira experiência. Um conceito como transferência é uma coisa no livro e outra bem diferente quando você sente ela acontecer na sua própria sessão.',
      '## Como é o dia a dia de quem está em formação',
      'Uma formação séria tem ritmo. Em geral, o aluno passa por aulas teóricas regulares, encontros de prática, a própria análise em paralelo e, a partir de certo ponto, os primeiros atendimentos supervisionados.',
      { tipo: 'imagem', src: '/images/turmas/turma-grupo.jpg', legenda: 'Turma do Instituto reunida no fim de um encontro. A troca entre colegas também faz parte da formação.' },
      { tipo: 'cards', itens: [
        { titulo: 'Primeiros meses', texto: 'Fundamentos: aparelho psíquico, inconsciente, mecanismos de defesa, os grandes autores.' },
        { titulo: 'Meio do caminho', texto: 'Infância, estruturas clínicas, sintomas, e a análise pessoal já em andamento.' },
        { titulo: 'Reta final', texto: 'Técnica, ética, atendimentos supervisionados e o trabalho de conclusão.' },
      ] },
      '## O que observar antes de escolher onde estudar',
      'Algumas perguntas ajudam a separar uma formação séria de um curso rápido. Leve esta lista quando for conversar com qualquer instituição, inclusive a nossa.',
      { tipo: 'pratica', titulo: 'Checklist pra avaliar uma formação', passos: [
        'A formação inclui análise pessoal e supervisão, ou só aulas?',
        'Quanto tempo dura? Formações de poucas semanas não dão conta do tripé.',
        'Existe prática clínica acompanhada antes de você atender sozinho?',
        'Quem são os professores e supervisores, e eles atendem de verdade?',
        'Que certificação você recebe no fim, e quem reconhece esse certificado?',
      ] },
      'Na Formação em Psicanálise Clínica Integrativa do Instituto, os 14 meses foram desenhados em torno desse tripé, com teoria, análise e supervisão ao longo do percurso, e certificado de extensão universitária em parceria com a Anhanguera.',
      '## Psicanálise é profissão regulamentada?',
      'A psicanálise não é uma profissão regulamentada por conselho no Brasil, e isso torna a escolha da formação ainda mais importante. A atividade de psicanalista é reconhecida na Classificação Brasileira de Ocupações (CBO 2515-50), mas é a seriedade da sua formação que vai sustentar o seu trabalho e a confiança de quem se senta na sua frente.',
      { tipo: 'pergunta', texto: 'Você quer aprender sobre psicanálise, ou quer aprender a ser psicanalista? São coisas diferentes.' },
      { tipo: 'cta', titulo: 'Conheça a formação por dentro', texto: 'Veja como funciona cada etapa da Formação em Psicanálise Clínica Integrativa, da teoria à supervisão.', botao: 'Ver a formação', href: '/programas/psicanalise-integrativa' },
    ],
  },
  {
    slug: 'lealdades-invisiveis-familia',
    titulo: 'Lealdades invisíveis: quando você carrega uma história que não é sua',
    categoria: 'Constelação familiar',
    resumo:
      'Às vezes o peso que você sente não começou em você. Entenda o que a abordagem sistêmica chama de lealdade familiar e como ela aparece no dia a dia.',
    data: '2026-11-24',
    autor: 'Instituto Despertamente',
    leitura: 9,
    capa: '/images/turmas/turma-grupo.jpg',
    publicado: true,
    corpo: [
      'Tem gente que nunca consegue juntar dinheiro, por mais que ganhe bem. Tem gente que sabota todo relacionamento que começa a dar certo. E tem gente que sente uma tristeza sem motivo aparente, como se estivesse de luto por alguém que nem conheceu. Quando olhamos pra família, muitas vezes a história começa a fazer sentido.',
      'Este texto apresenta uma ideia central da abordagem sistêmica, a lealdade invisível, e mostra como ela costuma aparecer na vida de quem a carrega.',
      '## O que é uma lealdade invisível',
      'Na abordagem sistêmica, desenvolvida a partir do trabalho de Bert Hellinger, a família é vista como um sistema em que cada membro está ligado aos outros, inclusive aos que vieram antes. Por amor, e quase sempre sem perceber, uma pessoa pode repetir o destino de um avô, carregar uma culpa que era da mãe ou se impedir de ser feliz pra não ser diferente de quem sofreu.',
      { tipo: 'diagrama', nome: 'arvore', legenda: 'Uma história não resolvida em uma geração pode seguir viagem até as seguintes, como se pedisse pra ser vista.' },
      'Não é uma escolha consciente. É uma forma de pertencer. Ser fiel ao sofrimento de alguém da família pode parecer, por dentro, um jeito de continuar ligado a essa pessoa.',
      { tipo: 'destaque', texto: 'Por amor, a criança tenta carregar o que é dos pais. Por amor, o adulto pode aprender a devolver.' },
      '## As três ordens que a abordagem sistêmica observa',
      'Hellinger descreveu algumas forças que organizam os sistemas familiares. Quando elas são desrespeitadas, costumam aparecer emaranhamentos: situações em que alguém ocupa um lugar que não é dele.',
      { tipo: 'cards', itens: [
        { titulo: 'Pertencimento', texto: 'Todos que fazem parte do sistema têm direito a pertencer, inclusive os excluídos, esquecidos ou de quem não se fala.' },
        { titulo: 'Hierarquia', texto: 'Quem veio antes tem precedência. Quando um filho tenta cuidar dos pais como se fosse o adulto, a ordem se inverte.' },
        { titulo: 'Equilíbrio', texto: 'Nas relações existe um movimento de dar e receber. Quando ele trava, alguém tenta compensar, muitas vezes às custas da própria vida.' },
      ] },
      '## Como isso aparece no dia a dia',
      'Alguns sinais costumam aparecer em quem carrega uma lealdade invisível. Nenhum deles, sozinho, é prova de nada, mas juntos podem indicar um caminho de investigação:',
      { tipo: 'cards', itens: [
        { titulo: 'Teto invisível', texto: 'Sentir que não tem permissão pra ir além do que os pais conseguiram, no dinheiro, nos estudos, no amor.' },
        { titulo: 'Datas que se repetem', texto: 'Viver crises parecidas em idades parecidas com as de alguém da família.' },
        { titulo: 'O filho que cuida', texto: 'Carregar responsabilidades que não são suas, como sustentar emocionalmente um dos pais.' },
        { titulo: 'Culpa de ficar bem', texto: 'Sentir um incômodo difícil de explicar justamente quando a vida começa a melhorar.' },
      ] },
      'Nada disso é diagnóstico, e nem todo padrão tem origem familiar. Mas vale a pergunta: de quem é esse peso?',
      { tipo: 'imagem', src: '/images/turmas/turma-escada.jpg', legenda: 'Encontro presencial do Instituto. Na constelação, o grupo ajuda a tornar visível a dinâmica de cada sistema.' },
      '## O que a constelação faz com isso',
      'A constelação familiar torna visível a dinâmica do sistema. Representantes ocupam os lugares dos membros da família, e a forma como se posicionam e se sentem revela relações que, no discurso, ficavam escondidas. Quando a pessoa enxerga o lugar que está ocupando, pode devolver o que não é dela e honrar a história da família sem precisar repeti-la.',
      'É um movimento de reconhecer, e não de culpar. Ninguém é acusado. O que se busca é que cada um volte pro seu lugar, e que quem estava excluído seja visto.',
      { tipo: 'pratica', titulo: 'Exercício: o mapa do peso', passos: [
        'Desenhe sua família em três gerações: avós, pais e você.',
        'Marque quem passou por perdas, exclusões, segredos ou destinos difíceis.',
        'Olhe pra sua vida hoje e anote o que você sente que carrega sem saber de onde vem.',
        'Pergunte, com calma: esse peso se parece com a história de alguém desse desenho?',
        'Se encontrar alguém, experimente dizer em silêncio: "Eu vejo você. Isso é seu, e eu deixo com você, com amor."',
      ] },
      { tipo: 'pergunta', texto: 'Que parte da sua história você sente que carrega por alguém?' },
      { tipo: 'cta', titulo: 'Quer aprender a conduzir esse olhar?', texto: 'A formação Despertar Sistêmico, de Constelação Familiar, tem encontros semanais ao vivo durante três meses.', botao: 'Conhecer a formação', href: '/programas/constelacao-familiar' },
    ],
  },
]

// Em `npm run dev` os rascunhos aparecem, pra revisar antes de publicar.
// Em produção, só o que tiver `publicado: true`.
const visivel = (p: BlogPost) => p.publicado || process.env.NODE_ENV === 'development'

export const postsPublicados = (): BlogPost[] =>
  BLOG_POSTS.filter(visivel).sort((a, b) => b.data.localeCompare(a.data))

export const buscarPost = (slug: string): BlogPost | undefined =>
  BLOG_POSTS.find(p => p.slug === slug && visivel(p))

/** Slug de um subtítulo, pra âncora do índice lateral. */
export const ancora = (titulo: string) =>
  titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${dia} de ${meses[mes - 1]} de ${ano}`
}
