/**
 * Base de SEO do site institucional.
 *
 * Duas frentes, construídas juntas em 22/11/2026:
 *
 * 1. SEO clássico — sitemap, robots, canonical, OpenGraph. Faz o Google
 *    encontrar e indexar. Antes disso o site não tinha nada: nem sitemap,
 *    nem robots, nem metadataBase.
 *
 * 2. SEO pra IA (GEO/AEO) — dado estruturado, llms.txt e crawler de IA
 *    liberado. Faz o ChatGPT, o Perplexity, o Claude e o AI Overview do
 *    Google conseguirem ler, entender e CITAR o Instituto quando alguém
 *    perguntar sobre formação em psicanálise. Quem não aparece na resposta
 *    da IA deixou de existir pra uma fatia crescente de gente.
 *
 * Tudo aqui é dado real. Nada de número inventado: schema com dado falso é
 * penalizado e, pior, vira citação errada na boca da IA.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.idmpsi.com.br').replace(/\/$/, '')

export const ORG = {
  nome: 'Instituto Despertamente',
  nomeLegal: 'Grupo Despertamente',
  cnpj: '55.184.481/0001-24',
  descricao:
    'Instituto de formação em Psicanálise Integrativa, PNL e Constelação Familiar Sistêmica, com metodologia própria que une psicanálise, PNL, terapia breve e numerologia.',
  logo: `${SITE_URL}/despertamente-simbolo.png`,
  telefone: '+55 11 93043-9385',
  endereco: {
    rua: 'Av. Paulista, 1636, sala 1105',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01310-200',
    pais: 'BR',
  },
  redes: [
    'https://instagram.com/institutodespertamente',
  ],
} as const

/** Organização + site. Vai no layout, vale pro site inteiro. */
export function jsonLdOrganizacao() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': `${SITE_URL}/#organizacao`,
        name: ORG.nome,
        legalName: ORG.nomeLegal,
        url: SITE_URL,
        logo: ORG.logo,
        description: ORG.descricao,
        taxID: ORG.cnpj,
        telephone: ORG.telefone,
        sameAs: ORG.redes,
        address: {
          '@type': 'PostalAddress',
          streetAddress: ORG.endereco.rua,
          addressLocality: ORG.endereco.cidade,
          addressRegion: ORG.endereco.estado,
          postalCode: ORG.endereco.cep,
          addressCountry: ORG.endereco.pais,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#site`,
        url: SITE_URL,
        name: ORG.nome,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${SITE_URL}/#organizacao` },
      },
    ],
  }
}

/**
 * Curso. É o schema mais valioso pra uma escola: alimenta resultado rico no
 * Google e é o que a IA lê pra responder "quanto custa", "quanto dura",
 * "é online ou presencial".
 */
export function jsonLdCurso(c: {
  nome: string
  descricao: string
  slug: string
  preco?: number | null
  moeda?: string
  modalidade?: 'online' | 'presencial' | 'blended'
  duracaoMeses?: number
  /** Programas curtos (uma sessão por semana) medem em semanas, não meses. */
  duracaoSemanas?: number
  /** true quando o valor e mensalidade, nao preco fechado do curso. */
  assinatura?: boolean
}) {
  const url = `${SITE_URL}/programas/${c.slug}`
  const modo =
    c.modalidade === 'presencial' ? 'Onsite' : c.modalidade === 'blended' ? 'Blended' : 'Online'

  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': `${url}#curso`,
    name: c.nome,
    description: c.descricao,
    url,
    inLanguage: 'pt-BR',
    provider: { '@id': `${SITE_URL}/#organizacao` },
    ...(c.preco
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: c.moeda ?? 'BRL',
            availability: 'https://schema.org/InStock',
            url,
            category: c.assinatura ? 'Subscription' : 'Paid',
            // Mensalidade precisa sair como recorrente. Mandar R$100 como
            // `price` seco faz o Google -- e a IA -- anunciarem "curso por
            // R$100", que nao e o que a gente cobra.
            ...(c.assinatura
              ? {
                  priceSpecification: {
                    '@type': 'UnitPriceSpecification',
                    price: c.preco,
                    priceCurrency: c.moeda ?? 'BRL',
                    billingDuration: 1,
                    billingIncrement: 1,
                    unitText: 'MON',
                  },
                }
              : { price: c.preco }),
          },
        }
      : {}),
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: modo,
      ...(c.duracaoMeses
        ? { courseWorkload: `P${c.duracaoMeses}M` }
        : c.duracaoSemanas
          ? { courseWorkload: `P${c.duracaoSemanas}W` }
          : {}),
    },
  }
}

/**
 * FAQ. Vale por dois: o Google pode mostrar as perguntas direto no
 * resultado, e é o formato que a IA mais aproveita -- pergunta e resposta
 * já separadas é exatamente o que ela precisa pra citar.
 *
 * Só usar com FAQ que existe de verdade na página. Schema de pergunta que
 * não está no texto é marcação enganosa e o Google trata como spam.
 */
export function jsonLdFaq(perguntas: { q: string; a: string }[], urlDaPagina: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${urlDaPagina}#faq`,
    mainEntity: perguntas.map(p => ({
      '@type': 'Question',
      name: p.q,
      acceptedAnswer: { '@type': 'Answer', text: p.a },
    })),
  }
}

/** Artigo do blog. É o que faz a IA citar o post como fonte. */
export function jsonLdPost(p: {
  titulo: string
  resumo: string
  slug: string
  data: string
  autor: string
  categoria: string
}) {
  const url = `${SITE_URL}/blog/${p.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    headline: p.titulo,
    description: p.resumo,
    url,
    mainEntityOfPage: url,
    datePublished: p.data,
    dateModified: p.data,
    inLanguage: 'pt-BR',
    articleSection: p.categoria,
    author: { '@type': 'Person', name: p.autor },
    publisher: { '@id': `${SITE_URL}/#organizacao` },
    isPartOf: { '@id': `${SITE_URL}/#site` },
  }
}

/**
 * Renderiza o JSON-LD. Precisa sair no HTML inicial (server component) --
 * schema injetado por useEffect o crawler não vê.
 */
export function scriptJsonLd(dados: object) {
  return {
    __html: JSON.stringify(dados).replace(/</g, '\\u003c'),
  }
}
