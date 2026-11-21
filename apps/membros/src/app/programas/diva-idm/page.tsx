import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { DivaContent } from './DivaContent'

export const metadata = {
  title: 'Divã IDM — Terapia acessível com psicanalistas do Instituto · Instituto Despertamente',
  description:
    'Sessões de psicanálise online a partir de R$70, com psicanalistas formados pelo Instituto Despertamente. Sem fila de espera, sem plano de saúde.',
  openGraph: {
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

      <DivaContent />

      <SiteFooter />
    </div>
  )
}
