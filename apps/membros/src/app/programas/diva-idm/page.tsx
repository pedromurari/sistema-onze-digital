import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'
import { DivaContent } from './DivaContent'
import { TerapeutasDiva, type TerapeutaPublico } from './TerapeutasDiva'
import { createSistema11Client } from '@/lib/sistema11'

// Terapeuta aprovado, foto ou bio nova no CRM aparece aqui em até 5 min.
export const revalidate = 300

async function buscarTerapeutas(): Promise<TerapeutaPublico[]> {
  // Só colunas públicas: Pix, WhatsApp e dados de pagamento ficam no CRM.
  try {
    const { data, error } = await createSistema11Client()
      .from('diva_terapeutas')
      .select('id, nome, especialidade, foto_url, bio')
      .eq('status', 'aprovado')
      .order('nome')
    if (error) throw error
    return (data ?? []) as TerapeutaPublico[]
  } catch (erro) {
    // Sem a lista, a página continua de pé -- só não mostra a grade.
    console.error('[diva-idm] falha ao buscar terapeutas:', erro)
    return []
  }
}

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

export default async function DivaIdmPage() {
  const terapeutas = await buscarTerapeutas()
  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SchemaCurso slug="diva-idm" />

      <DivaContent terapeutas={<TerapeutasDiva terapeutas={terapeutas} />} />

      <SiteFooter />
    </div>
  )
}
