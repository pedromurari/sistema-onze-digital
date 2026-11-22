import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

/**
 * robots.txt do site institucional.
 *
 * DECISÃO DE NEGÓCIO (22/11/2026): os crawlers de IA ficam LIBERADOS.
 *
 * GPTBot, ClaudeBot, PerplexityBot e Google-Extended são quem alimenta as
 * respostas do ChatGPT, do Claude, do Perplexity e do AI Overview. Bloquear
 * protege o texto de virar treino, mas tira o Instituto das respostas
 * quando alguém pergunta "onde fazer formação em psicanálise". Pra quem
 * vende formação, aparecer vale mais que proteger parágrafo.
 *
 * Se um dia a decisão mudar, é só mover esses agentes para `disallow`.
 *
 * Fora do índice: área de membros, admin, API, checkout e formulário
 * interno -- nada disso é conteúdo de site e indexar só dilui o domínio.
 */

const FORA_DO_INDICE = [
  '/api/',
  '/admin/',
  '/dashboard',
  '/aula',
  '/cursos/',
  '/formacao',
  '/certificados',
  '/perfil',
  '/loja',
  '/login',
  '/register',
  '/reset-password',
  '/forgot-password',
  '/briefing-blog',
  '/parceiras',
  '/parceiras-login',
  '/semanadodespertar-',
  '/npa-presencial/',
]

const CRAWLERS_DE_IA = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: FORA_DO_INDICE },
      // Explícito de propósito: sem a regra nomeada, vários desses bots
      // assumem o padrão do site e alguns param de rastrear na dúvida.
      ...CRAWLERS_DE_IA.map(userAgent => ({
        userAgent,
        allow: '/',
        disallow: FORA_DO_INDICE,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
