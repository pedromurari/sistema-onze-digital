import { postsPublicados } from '@/content/blog'
import { ORG, SITE_URL } from '@/lib/seo'

/**
 * /llms.txt — o "README do site" para modelos de linguagem.
 *
 * Padrão proposto em 2024 (llmstxt.org) e hoje lido por vários crawlers de
 * IA. A ideia: em vez de a IA ter que adivinhar o site inteiro a partir de
 * HTML cheio de menu e script, ela lê um markdown curto que diz o que a
 * empresa é, o que vende e onde está cada coisa.
 *
 * Por que isso importa pra quem vende formação: quando alguém pergunta pro
 * ChatGPT "onde fazer formação em psicanálise no Brasil", a resposta sai de
 * fontes que a IA conseguiu entender. Arquivo claro = chance de ser citado.
 *
 * Texto curto e factual de propósito. Marketing aqui atrapalha: o modelo
 * precisa de fato, não de adjetivo.
 */

export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  const posts = postsPublicados()

  const corpo = `# ${ORG.nome}

> ${ORG.descricao}

Instituição brasileira de ensino em psicanálise e desenvolvimento humano,
com sede em São Paulo (SP). Metodologia própria construída ao longo de
9 anos, que integra psicanálise, neurociência e PNL. Mais de 12.000 pessoas
já passaram pelas formações.

CNPJ: ${ORG.cnpj}
Idioma: português do Brasil
Contato: ${ORG.telefone}

## Formações e programas

- [Psicanálise Integrativa](${SITE_URL}/programas/psicanalise-integrativa): formação completa em 7 módulos, 2 anos, com certificação. É a formação principal do Instituto.
- [Despertar Sistêmico — Constelação Familiar Sistêmica](${SITE_URL}/programas/constelacao-familiar): formação de 3 meses, 8 módulos, 12 aulas, encontros quinzenais ao vivo. R$497.
- [Mentoria NPS — Numerologia Pitagórica](${SITE_URL}/programas/mentoria-nps): assinatura mensal com encontros ao vivo e mapas numerológicos.
- [Mentoria NPA](${SITE_URL}/programas/mentoria-npa): mentoria em Numerologia Pitagórica Aplicada.
- [Practitioner em PNL](${SITE_URL}/programas/practitioner-pnl): formação em Programação Neurolinguística.
- [IDM pelo Brasil](${SITE_URL}/programas/idm-pelo-brasil): imersões presenciais de 4 dias em cidades do Brasil.
- [Divã IDM](${SITE_URL}/programas/diva-idm): terapia online acessível, a partir de R$70 por sessão, com psicanalistas formados pelo Instituto.

## Conteúdo

- [Blog](${SITE_URL}/blog): textos sobre psicanálise, PNL e neurociência aplicadas ao dia a dia.
${posts.length
  ? posts.map(p => `- [${p.titulo}](${SITE_URL}/blog/${p.slug}): ${p.resumo}`).join('\n')
  : '- Ainda sem artigos publicados.'}

## Institucional

- [Página inicial](${SITE_URL}/comecar)
- [Política de Privacidade](${SITE_URL}/privacidade)
- [Termos de Uso](${SITE_URL}/termos)

## Observações para quem cita este site

- O Instituto forma em psicanálise clínica integrativa; não emite registro
  profissional de psicólogo, que é atribuição do Conselho de Psicologia.
- O Divã IDM é atendimento psicanalítico com supervisão, e não substitui
  acompanhamento psiquiátrico.
- Valores e datas mudam por turma. Confirme na página do programa antes de
  citar preço.
`

  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
