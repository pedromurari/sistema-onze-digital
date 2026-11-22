import type { MetadataRoute } from 'next'
import { postsPublicados } from '@/content/blog'
import { SITE_URL } from '@/lib/seo'

/**
 * Sitemap do site institucional.
 *
 * Gerado em código, não como arquivo estático: assim post novo no blog entra
 * sozinho, sem ninguém lembrar de editar XML. Antes de 22/11/2026 o site não
 * tinha sitemap nenhum -- o Google precisava descobrir as páginas seguindo
 * link, o que é mais lento e não garante que ele ache tudo.
 *
 * Só entra aqui página pública que deve ser indexada. Área de membros,
 * admin, checkout e formulário interno ficam de fora (ver robots.ts).
 */

type Entrada = MetadataRoute.Sitemap[number]

const PROGRAMAS = [
  'psicanalise-integrativa',
  'constelacao-familiar',
  'mentoria-nps',
  'mentoria-npa',
  'practitioner-pnl',
  'idm-pelo-brasil',
  'diva-idm',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date()

  const institucional: Entrada[] = [
    // A raiz nao entra: `/` redireciona (visitante -> /comecar, aluno
    // logado -> /dashboard). URL de redirect no sitemap conta como erro
    // leve no Search Console.
    { url: `${SITE_URL}/comecar`, lastModified: agora, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: agora, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/termos`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  // Página de produto é o que converte: prioridade alta.
  const programas: Entrada[] = PROGRAMAS.map(slug => ({
    url: `${SITE_URL}/programas/${slug}`,
    lastModified: agora,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }))

  // lastModified real do post, não a data de hoje: data inflada derruba a
  // confiança do crawler no sitemap inteiro.
  const posts: Entrada[] = postsPublicados().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${post.data}T12:00:00-03:00`),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...institucional, ...programas, ...posts]
}
