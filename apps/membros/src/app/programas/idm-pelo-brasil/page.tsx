import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'
import { createSistema11Client } from '@/lib/sistema11'
import { IdmBrasilContent, type EventoPublico } from './IdmBrasilContent'

/**
 * IDM pelo Brasil. As cidades e datas vêm de `npa_eventos` no CRM: evento
 * novo cadastrado lá aparece aqui sozinho, e evento que passou sai da agenda
 * e vai pra "por onde já passou". Revalida a cada 10 minutos.
 */
export const revalidate = 600

export const metadata = {
  title: 'IDM pelo Brasil — encontros presenciais na sua cidade',
  description:
    'Encontros presenciais com Rodrygo Murari: Numerologia em turmas de 4 horas (manhã ou tarde) e Psicanálise em imersão de dia inteiro, com certificado no fim.',
  alternates: { canonical: '/programas/idm-pelo-brasil' },
  openGraph: {
    url: '/programas/idm-pelo-brasil',
    type: 'website',
    title: 'IDM pelo Brasil — o método na sua cidade',
    description: 'Numerologia em turmas de 4 horas e Psicanálise em imersão de dia inteiro. Certificado no fim do dia.',
  },
}

async function buscarEventos(): Promise<{ proximos: EventoPublico[]; passados: EventoPublico[] }> {
  try {
    const hoje = new Date().toISOString().slice(0, 10)
    const sb = createSistema11Client()
    const campos = 'nome, slug, data_evento, local, professor_convidado'
    const [proximos, passados] = await Promise.all([
      sb.from('npa_eventos').select(campos).gte('data_evento', hoje).order('data_evento'),
      sb.from('npa_eventos').select(campos).lt('data_evento', hoje).not('data_evento', 'is', null)
        .order('data_evento', { ascending: false }).limit(6),
    ])
    return {
      proximos: (proximos.data ?? []) as EventoPublico[],
      passados: (passados.data ?? []) as EventoPublico[],
    }
  } catch (erro) {
    // Sem a agenda a página continua de pé, só sem os cards de data.
    console.error('[idm-pelo-brasil] falha ao buscar eventos:', erro)
    return { proximos: [], passados: [] }
  }
}

export default async function IdmPeloBrasilPage() {
  const { proximos, passados } = await buscarEventos()

  return (
    <div className="min-h-screen bg-[#08090d] text-[#f2f2f3] overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SchemaCurso slug="idm-pelo-brasil" />

      <IdmBrasilContent proximos={proximos} passados={passados} />

      <SiteFooter />
    </div>
  )
}
