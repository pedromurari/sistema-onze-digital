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
  // Nenhum artigo publicado ainda. Os textos reais entram aqui conforme o
  // time escrever (ou conforme o Pedro mandar o material pra publicar).
]

export const postsPublicados = (): BlogPost[] =>
  BLOG_POSTS.filter(p => p.publicado).sort((a, b) => b.data.localeCompare(a.data))

export const buscarPost = (slug: string): BlogPost | undefined =>
  BLOG_POSTS.find(p => p.slug === slug && p.publicado)

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${dia} de ${meses[mes - 1]} de ${ano}`
}
