/**
 * Home do site institucional (www.idmpsi.com.br, em breve
 * institutodespertamente.com.br).
 *
 * Esta pagina era `/comecar` e a raiz so redirecionava pra ela -- inclusive
 * mandando quem estava logado direto pro /dashboard, o que fazia o logo do
 * cabecalho jogar o visitante na area de membros em vez de voltar pro site.
 * Agora a home MORA aqui: dominio na barra de endereco abre o site, e
 * `/comecar` virou redirecionamento permanente pra ca (link de anuncio
 * antigo continua funcionando).
 *
 * Nao reintroduzir redirect por sessao aqui: aluno logado tambem quer ver o
 * site institucional, e tem o menu pra entrar na area dele.
 */

import Link from 'next/link'
import Image from 'next/image'
import { getTestimonials } from '@/lib/actions/store'
import { createClient } from '@/lib/supabase/server'
import { ComecarAnimated, type Programa } from './comecar/ComecarAnimated'
import { NavbarComecar } from './comecar/NavbarComecar'
import { WhatsAppButton } from './comecar/WhatsAppButton'
import { StickyCTA } from './comecar/StickyCTA'
import { CookieBanner } from './comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'

export const metadata = {
  title: 'Instituto Despertamente — Método Despertamente',
  description: 'Desperte a mente que decide por você. Uma metodologia própria, construída em 9 anos de prática, que une neurociência, psicanálise e PNL.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    type: 'website',
    title: 'Instituto Despertamente — Método Despertamente',
    description: 'Desperte a mente que decide por você. Neurociência, psicanálise e PNL numa metodologia própria.',
    images: [{ url: '/despertamente-simbolo.png' }],
  },
}

export default async function HomePage() {
  const sb = await createClient()
  const [testimonials, { data: productsRaw }] = await Promise.all([
    getTestimonials(),
    sb.from('products').select('id, title, slug, short_description, thumbnail_url').eq('is_published', true).order('sort_order'),
  ])

  const depos = testimonials.length > 0
    ? testimonials.slice(0, 6).map(t => ({
        nome: t.author_name,
        papel: t.author_role ?? '',
        texto: t.content,
        estrelas: t.rating ?? 5,
      }))
    : []

  const programas: Programa[] = (productsRaw ?? []).map(p => ({
    id: p.id as string,
    title: p.title as string,
    slug: p.slug as string,
    short_description: p.short_description as string | null,
    thumbnail_url: p.thumbnail_url as string | null,
  }))

  return (
    <div className="min-h-screen bg-[#0D1638] text-white overflow-x-hidden">

      {/* Navbar */}
      <NavbarComecar />

      {/* Floating WhatsApp button (desktop) */}
      <WhatsAppButton />

      {/* Sticky CTA bar (mobile) */}
      <StickyCTA />

      {/* Cookie banner (LGPD) */}
      <CookieBanner />

      {/* All animated sections */}
      <ComecarAnimated depos={depos} programas={programas} />

      {/* ── FOOTER ── */}
      <SiteFooter />
    </div>
  )
}
