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

import { NavbarComecar } from './comecar/NavbarComecar'
import { HomeContent } from './HomeContent'
import { WhatsAppButton } from './comecar/WhatsAppButton'
import { StickyCTA } from './comecar/StickyCTA'
import { CookieBanner } from './comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'

export const metadata = {
  title: 'Instituto Despertamente — Método Despertamente',
  description: 'Desperte a mente que decide por você. Uma metodologia própria, construída em 20 anos de experiência, que une neurociência, psicanálise e PNL.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    type: 'website',
    title: 'Instituto Despertamente — Método Despertamente',
    description: 'Desperte a mente que decide por você. Neurociência, psicanálise e PNL numa metodologia própria.',
    images: [{ url: '/despertamente-simbolo.png' }],
  },
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#08090d] text-white overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <HomeContent />
      <SiteFooter />
    </div>
  )
}
