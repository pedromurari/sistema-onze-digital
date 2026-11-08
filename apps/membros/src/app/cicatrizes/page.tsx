import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { CicatrizesContent } from './CicatrizesContent'

export const metadata = {
  title: 'Cicatrizes que Curam — Workshop com Jocimara Anjos | Instituto Despertamente',
  description: 'Workshop vivencial de 3 horas com Jocimara Anjos, Coordenadora Pedagógica da Formação em Psicanálise do IDM. Vagas limitadas, uma turma por mês.',
  openGraph: {
    title: 'Cicatrizes que Curam — Jocimara Anjos',
    description: 'Um encontro de 3 horas para entender as marcas que você carrega — e transformá-las em ponto de virada.',
  },
}

export default function CicatrizesPage() {
  return (
    <div className="min-h-screen bg-[#0D1638] text-white overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <CicatrizesContent />
    </div>
  )
}
