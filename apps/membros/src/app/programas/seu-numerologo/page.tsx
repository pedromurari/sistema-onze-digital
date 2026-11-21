import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { NumerologoContent } from './NumerologoContent'

export const metadata = {
  title: 'Seu Numerólogo — Numerologia Pitagórica Aplicada · Instituto Despertamente',
  description:
    'Comece pelo Mapa das 7 Esferas e siga na assinatura: encontros ao vivo todo mês, mapas e acompanhamento em grupo. Cancele quando quiser.',
  openGraph: {
    title: 'Seu Numerólogo — Numerologia Pitagórica Aplicada',
    description: 'Do mapa gratuito à mentoria mensal. Sem fidelidade.',
  },
}

export default function SeuNumerologoPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />

      <NumerologoContent />

      <SiteFooter />
    </div>
  )
}
