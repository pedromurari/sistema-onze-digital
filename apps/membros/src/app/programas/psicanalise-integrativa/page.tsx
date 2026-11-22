import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { PsicanaliseContent } from './PsicanaliseContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'

/**
 * Não busca mais preço em `products`: o conteúdo desta página veio da
 * `formacao.idmpsi.com.br`, onde a oferta (R$3.750 original, R$1.500 no Pix,
 * 12x ou 15x de R$150) é fixa. Preço no banco E preço no texto = duas fontes
 * pra mesma informação, e a hora que divergirem a gente anuncia valor errado.
 */

export const metadata = {
  title: 'Formação em Psicanálise Clínica Integrativa',
  description:
    'Formação em Psicanálise Clínica Integrativa: 14 meses, 100% online, com certificado de Extensão Universitária nas diretrizes do MEC em parceria com a Anhanguera. Teoria, análise pessoal e supervisão.',
  alternates: { canonical: '/programas/psicanalise-integrativa' },
  openGraph: {
    url: '/programas/psicanalise-integrativa',
    type: 'website',
    title: 'Formação em Psicanálise Clínica Integrativa — IDM',
    description:
      'Desperte o psicanalista que há dentro de você. 14 meses, certificado nas diretrizes do MEC, acesso vitalício.',
  },
}

export default function PsicanaliseIntegrativaPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SchemaCurso slug="psicanalise-integrativa" />

      <PsicanaliseContent />

      <SiteFooter />
    </div>
  )
}
