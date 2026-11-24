import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SociedadeContent } from './SociedadeContent'

export const metadata = {
  title: 'Sociedade IDM — a comunidade de quem cuida da mente',
  description:
    'Assinatura mensal de R$ 150 com aperfeiçoamento contínuo, acompanhamento, aulas e cursos internos e networking. Aberta a todos, e porta de entrada pra atender pelo Divã IDM.',
  alternates: { canonical: '/programas/sociedade-idm' },
  openGraph: {
    url: '/programas/sociedade-idm',
    type: 'website',
    title: 'Sociedade IDM',
    description: 'A comunidade de quem cuida da mente dos outros. Aperfeiçoamento, acompanhamento e networking por R$ 150/mês.',
  },
}

export default function SociedadeIdmPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SociedadeContent />
      <SiteFooter />
    </div>
  )
}
