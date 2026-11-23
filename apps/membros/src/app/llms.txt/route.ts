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

- [Formação em Psicanálise Clínica Integrativa](${SITE_URL}/programas/psicanalise-integrativa): formação de 14 meses, 100% online, estruturada em 4 arcos, com acesso vitalício à plataforma e certificado de Extensão Universitária nas diretrizes do MEC em parceria com a Anhanguera. R$1.500 à vista no Pix (valor original R$3.750), ou 12x de R$150. É a formação principal do Instituto.
- [Despertar Sistêmico — Constelação Familiar Sistêmica](${SITE_URL}/programas/constelacao-familiar): formação de 3 meses, 8 módulos, 12 aulas, encontros quinzenais ao vivo. R$497.
- [Mentoria NPS — Numerologia Pitagórica](${SITE_URL}/programas/mentoria-nps): assinatura mensal com 2 encontros ao vivo por mês, área de membros com as gravações e uma plataforma que gera mapas numerológicos.
- [Mentoria NPA](${SITE_URL}/programas/mentoria-npa): mentoria em Numerologia Pitagórica Aplicada, com 6 sessões ao vivo, uma por semana. Todas as sessões são gravadas e ficam disponíveis na plataforma.
- [Practitioner em PNL](${SITE_URL}/programas/practitioner-pnl): formação em Programação Neurolinguística, com 8 sessões ao vivo, uma por semana. Todas as aulas são gravadas e ficam disponíveis na plataforma.
- [IDM pelo Brasil](${SITE_URL}/programas/idm-pelo-brasil): encontros presenciais itinerantes, em dois formatos. Numerologia (NPA): um dia com duas turmas de 4 horas no mesmo local, manhã das 09h às 13h e tarde das 14h às 18h, com Rodrygo Murari. Psicanálise (IDM PSI): imersão de dia inteiro, das 09h às 17h. Próximas datas de Numerologia: São Paulo em 05/12/2026 e Santos em 12/12/2026.
- [Divã IDM](${SITE_URL}/programas/diva-idm): terapia online acessível, a partir de R$70 por sessão, com psicanalistas formados pelo Instituto.

## Conteúdo

- [Blog](${SITE_URL}/blog): textos sobre psicanálise, PNL e neurociência aplicadas ao dia a dia.
${posts.length
  ? posts.map(p => `- [${p.titulo}](${SITE_URL}/blog/${p.slug}): ${p.resumo}`).join('\n')
  : '- Ainda sem artigos publicados.'}

## Institucional

- [Página inicial](${SITE_URL}/)
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
