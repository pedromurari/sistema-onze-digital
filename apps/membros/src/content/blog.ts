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
 *   2. `corpo` é um array de parágrafos; item que começa com '## ' vira
 *      subtítulo da seção
 *   3. pronto -- /blog e a home se atualizam sozinhas
 *
 * REGRA: nada de post inventado pra "encher" o blog. Até 21/11/2026 a seção
 * de blog da home mostrava 6 cards com foto de banco de imagem, data de
 * junho/2025 e "Ler mais" que não levava a lugar nenhum -- não existia
 * artigo nenhum atrás. Isso saiu. Blog vazio é melhor que blog de mentira:
 * o visitante que clica e cai no nada aprende que o site não é sério.
 */

export interface BlogPost {
  slug: string
  titulo: string
  categoria: string
  resumo: string
  /** ISO (yyyy-mm-dd) — usado pra ordenar e pra <time dateTime>. */
  data: string
  autor: string
  /** Imagem de capa (caminho em /public ou URL do R2). Opcional. */
  capa?: string
  /** Minutos estimados de leitura. */
  leitura: number
  /** Parágrafos. Item iniciado por '## ' vira subtítulo. */
  corpo: string[]
  publicado: boolean
}

export const BLOG_POSTS: BlogPost[] = [
  // RASCUNHOS gerados pelo sistema em 24/11/2026 a partir do briefing
  // pré-preenchido. Ficam `publicado: false` até o Pedro/Rodrygo aprovarem:
  // só aparecem no `npm run dev`, nunca em produção.
  {
    slug: 'por-que-voce-repete-o-mesmo-padrao',
    titulo: 'Por que você repete o mesmo padrão, mesmo sabendo que ele te machuca',
    categoria: 'Psicanálise aplicada',
    resumo:
      'Você promete que dessa vez vai ser diferente, e se pega no mesmo lugar. A psicanálise tem um nome pra isso, e entender o mecanismo é o primeiro passo pra sair dele.',
    data: '2026-11-25',
    autor: 'Instituto Despertamente',
    leitura: 5,
    capa: '/images/turmas/aula-sala-cheia.jpg',
    publicado: false,
    corpo: [
      'Você termina um relacionamento e jura que o próximo vai ser diferente. Meses depois, percebe que está discutindo pelos mesmos motivos, com outra pessoa. Ou troca de emprego por causa de um chefe difícil e, no novo lugar, encontra outro chefe igualzinho. Parece azar. Quase nunca é.',
      '## O nome disso é repetição',
      'Freud percebeu, ainda no começo do século passado, que muitos pacientes voltavam sempre ao mesmo ponto de sofrimento. Não por gostarem de sofrer, mas porque havia algo não elaborado que insistia em voltar. Ele chamou isso de compulsão à repetição: aquilo que não conseguimos lembrar e entender, tendemos a encenar de novo.',
      'Em outras palavras, a repetição é uma tentativa da mente de resolver uma história antiga usando personagens novos. O problema é que, sem consciência do roteiro, a cena termina sempre igual.',
      '## Por que saber disso não basta',
      'Quem já tentou mudar um padrão só na força de vontade sabe como é. Você entende, promete, se esforça, e na hora em que a emoção sobe, faz exatamente o que fazia antes. Isso acontece porque o padrão não mora na parte da mente que toma decisões conscientes. Ele mora nas associações que você construiu cedo, quando ainda não tinha palavras pra elas.',
      'É por isso que, no Instituto, falamos tanto da mente que decide por você. Grande parte das escolhas que parecem suas foram feitas antes, por uma versão sua que estava tentando se proteger.',
      '## O que dá pra observar já essa semana',
      'Não existe atalho, mas existe um começo. Na próxima vez que você se pegar numa situação conhecida, tente notar três coisas: o que você sentiu um pouco antes de reagir, com quem aquela sensação se parece na sua história, e o que você esperava que acontecesse dessa vez. Não precisa responder certo. Só o fato de olhar já cria uma pequena distância entre você e o automático.',
      'Essa distância é o espaço onde a mudança começa. Na análise, ela é construída com tempo, escuta e alguém treinado pra perceber o que você ainda não consegue ver sozinho.',
      'Fica a pergunta pra semana: qual é a cena que você vive repetindo, e quem era o primeiro personagem dela?',
      'Se você sente que é hora de olhar pra isso com acompanhamento, o Divã IDM oferece sessões de psicanálise online com psicanalistas formados pelo Instituto.',
    ],
  },
  {
    slug: 'como-e-a-formacao-de-um-psicanalista',
    titulo: 'Como é, de verdade, a formação de um psicanalista',
    categoria: 'Ser terapeuta',
    resumo:
      'Teoria é só uma das partes. Entenda o tripé que sustenta a formação em psicanálise e o que observar antes de escolher onde estudar.',
    data: '2026-11-28',
    autor: 'Instituto Despertamente',
    leitura: 5,
    capa: '/images/turmas/turma-certificados.jpg',
    publicado: false,
    corpo: [
      'Muita gente chega até nós com a mesma dúvida: dá pra virar psicanalista fazendo um curso? A resposta honesta é que um curso, sozinho, não forma ninguém. O que forma um psicanalista é um caminho com três partes que precisam andar juntas.',
      '## O tripé da formação',
      'Desde Freud, a formação psicanalítica se apoia em três pilares: o estudo da teoria, a análise pessoal e a supervisão clínica. Faltando qualquer um deles, a formação fica manca.',
      'A teoria dá o mapa: como a mente se organiza, o que é o inconsciente, como funcionam a transferência, a defesa, o sintoma. Sem ela, o atendimento vira conversa de boa vontade.',
      'A análise pessoal é onde o futuro analista passa pelo que vai oferecer aos outros. Ninguém consegue escutar no outro aquilo que ainda não consegue escutar em si. É aqui que a teoria deixa de ser conteúdo e vira experiência.',
      'A supervisão é o espaço em que os primeiros atendimentos são discutidos com alguém mais experiente. É ela que dá segurança pra começar a clinicar, e é ela que protege o paciente enquanto o analista ainda está aprendendo.',
      '## O que observar antes de escolher onde estudar',
      'Algumas perguntas ajudam a separar uma formação séria de um curso rápido: a formação inclui análise pessoal e supervisão, ou só aulas? Quanto tempo dura? Existe prática clínica acompanhada? Que certificação você recebe no fim, e quem reconhece?',
      'Na Formação em Psicanálise Clínica Integrativa do Instituto, os 14 meses foram desenhados em torno desse tripé, com teoria, análise e supervisão ao longo do percurso, e certificado de extensão universitária em parceria com a Anhanguera.',
      '## Psicanálise é profissão regulamentada?',
      'A psicanálise não é uma profissão regulamentada por conselho no Brasil, e isso torna a escolha da formação ainda mais importante. É a seriedade da sua formação que vai sustentar o seu trabalho e a confiança de quem se senta na sua frente.',
      'Se você está pensando em seguir esse caminho, a pergunta que vale fazer é: você quer aprender sobre psicanálise ou quer aprender a ser psicanalista? São coisas diferentes.',
      'Conheça a Formação em Psicanálise Clínica Integrativa e veja como funciona cada etapa.',
    ],
  },
  {
    slug: 'lealdades-invisiveis-familia',
    titulo: 'Lealdades invisíveis: quando você carrega uma história que não é sua',
    categoria: 'Constelação familiar',
    resumo:
      'Às vezes o peso que você sente não começou em você. Entenda o que a abordagem sistêmica chama de lealdade familiar e como ela aparece no dia a dia.',
    data: '2026-12-02',
    autor: 'Instituto Despertamente',
    leitura: 5,
    capa: '/images/turmas/turma-grupo.jpg',
    publicado: false,
    corpo: [
      'Tem gente que nunca consegue juntar dinheiro, por mais que ganhe bem. Tem gente que sabota todo relacionamento que começa a dar certo. E tem gente que sente uma tristeza sem motivo aparente, como se estivesse de luto por alguém que nem conheceu. Quando olhamos pra família, muitas vezes a história começa a fazer sentido.',
      '## O que é uma lealdade invisível',
      'Na abordagem sistêmica, desenvolvida a partir do trabalho de Bert Hellinger, a família é vista como um sistema em que cada membro está ligado aos outros, inclusive aos que vieram antes. Por amor, e quase sempre sem perceber, uma pessoa pode repetir o destino de um avô, carregar uma culpa que era da mãe ou se impedir de ser feliz pra não ser diferente de quem sofreu.',
      'Não é uma escolha consciente. É uma forma de pertencer. Ser fiel ao sofrimento de alguém da família pode parecer, por dentro, um jeito de continuar ligado a essa pessoa.',
      '## Como isso aparece no dia a dia',
      'Alguns sinais costumam aparecer: sentir que não tem permissão pra ir além do que os pais conseguiram; viver as mesmas crises em idades parecidas com as de alguém da família; carregar responsabilidades que não são suas, como cuidar emocionalmente de um dos pais; ou sentir culpa quando a vida começa a melhorar.',
      'Nada disso é diagnóstico, e nem todo padrão tem origem familiar. Mas vale a pergunta: de quem é esse peso?',
      '## O que a constelação faz com isso',
      'A constelação familiar torna visível a dinâmica do sistema. Quando a pessoa enxerga o lugar que está ocupando, pode devolver o que não é dela e honrar a história da família sem precisar repeti-la. É um movimento de reconhecer, e não de culpar.',
      'Pra levar com você essa semana: que parte da sua história você sente que carrega por alguém?',
      'Se você quer aprender a conduzir esse olhar com outras pessoas, a formação Despertar Sistêmico, de Constelação Familiar, tem encontros semanais ao vivo durante três meses.',
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

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${dia} de ${meses[mes - 1]} de ${ano}`
}
