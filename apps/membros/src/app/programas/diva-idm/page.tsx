import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'
import { DivaContent } from './DivaContent'

export const metadata = {
  title: 'Divã IDM — Terapia acessível com psicanalistas do Instituto',
  description:
    'Sessões de psicanálise online a partir de R$70, com psicanalistas formados pelo Instituto Despertamente. Sem fila de espera, sem plano de saúde.',
  alternates: { canonical: '/programas/diva-idm' },
  openGraph: {
    url: '/programas/diva-idm',
    type: 'website',
    title: 'Divã IDM — Terapia acessível',
    description: 'Sessões de psicanálise online a partir de R$70, com quem foi formado no método IDM.',
  },
}

export default function DivaIdmPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SchemaCurso slug="diva-idm" />

      <DivaContent />

      <SiteFooter />
    </div>
  )
}
