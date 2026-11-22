import { jsonLdCurso, scriptJsonLd } from '@/lib/seo'

/**
 * Dado estruturado de Curso para as páginas de programa.
 *
 * Por que existe como componente e não copiado em cada página: o schema de
 * Course é o que alimenta resultado rico no Google e é a fonte que o
 * ChatGPT/Perplexity lê pra responder "quanto custa", "quanto dura", "é
 * online". Sete cópias de JSON na mão divergem na primeira alteração de
 * preço -- aqui é um lugar só.
 *
 * O preço vem do banco (`products.price`), não daqui: schema com preço
 * errado é pior que schema sem preço -- o Google penaliza e a IA passa a
 * citar valor que a gente não cobra. Quando o banco não tem preço, o
 * `offers` simplesmente não sai.
 */

type Catalogo = Record<
  string,
  {
    nome: string
    descricao: string
    modalidade: 'online' | 'presencial' | 'blended'
    duracaoMeses?: number
    /**
     * Preco real quando ele nao vive em `products` deste app. Usado so como
     * fallback -- o banco, quando tem valor, manda.
     */
    precoPadrao?: number
  }
>

const CURSOS: Catalogo = {
  'psicanalise-integrativa': {
    nome: 'Formação em Psicanálise Integrativa',
    descricao:
      'Formação completa em Psicanálise Integrativa: teoria psicanalítica, análise pessoal e supervisão clínica, integrando psicanálise, neurociência e PNL. Com certificação.',
    modalidade: 'blended',
    duracaoMeses: 24,
  },
  'constelacao-familiar': {
    nome: 'Despertar Sistêmico — Formação em Constelação Familiar Sistêmica',
    descricao:
      'Formação em Constelação Familiar Sistêmica em 8 módulos e 12 aulas, com encontros ao vivo e plataforma de aprendizagem. Reconhecer a origem, compreender os vínculos e ocupar o próprio lugar.',
    modalidade: 'online',
    duracaoMeses: 3,
    // R$497 a vista no Pix (ou 12x R$50,88). O preco desta formacao mora em
    // `formacao_ofertas` no CRM, nao em `products` daqui.
    precoPadrao: 497,
  },
  'mentoria-nps': {
    nome: 'Mentoria NPS — Numerologia Pitagórica',
    descricao:
      'Mentoria em Numerologia Pitagórica com dois encontros ao vivo por mês, gravações e mapas numerológicos (Mapa 7 Esferas) para aplicar o método na prática.',
    modalidade: 'online',
  },
  'mentoria-npa': {
    nome: 'Mentoria NPA — Numerologia Pitagórica Aplicada',
    descricao:
      'Mentoria em Numerologia Pitagórica Aplicada: grupo de mentoria, curso gravado e material de apoio da metodologia exclusiva do Instituto Despertamente de leitura de padrões numéricos.',
    modalidade: 'online',
  },
  'practitioner-pnl': {
    nome: 'Practitioner em Programação Neurolinguística (PNL)',
    descricao:
      'Formação Practitioner em PNL: rapport, ancoragem, submodalidades e reformulação, aplicados à reprogramação de padrões mentais.',
    modalidade: 'online',
  },
  'idm-pelo-brasil': {
    nome: 'IDM pelo Brasil — Imersão Presencial',
    descricao:
      'Imersão presencial de quatro dias em Psicanálise Integrativa e PNL, realizada em cidades do Brasil pelo Instituto Despertamente.',
    modalidade: 'presencial',
  },
  'diva-idm': {
    nome: 'Divã IDM — Atendimento psicanalítico online',
    descricao:
      'Sessões de psicanálise online com psicanalistas formados pelo Instituto Despertamente, a partir de R$70, sem fila de espera e sem plano de saúde.',
    modalidade: 'online',
  },
}

export function SchemaCurso({
  slug,
  preco,
  assinatura,
}: {
  slug: string
  preco?: number | null
  /** true quando o valor cobrado e mensalidade (NPS, por exemplo). */
  assinatura?: boolean
}) {
  const curso = CURSOS[slug]
  if (!curso) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={scriptJsonLd(
        jsonLdCurso({
          nome: curso.nome,
          descricao: curso.descricao,
          slug,
          preco: preco ?? curso.precoPadrao ?? null,
          modalidade: curso.modalidade,
          duracaoMeses: curso.duracaoMeses,
          assinatura,
        }),
      )}
    />
  )
}
