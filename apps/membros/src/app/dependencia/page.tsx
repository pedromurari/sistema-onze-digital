import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { DependenciaContent } from './DependenciaContent'

export const metadata = {
  title: 'Dependência Química com Psicanálise — Renata Weigert | Instituto Despertamente',
  description: 'Renata Weigert, psicanalista, traz o olhar da psicanálise integrativa pra dependência química — pra quem usa e pra quem ama alguém que usa. Entre na lista de espera.',
  openGraph: {
    title: 'Dependência Química com Psicanálise — Renata Weigert',
    description: 'Um olhar clínico e humano sobre dependência química, com Renata Weigert e o Instituto Despertamente.',
  },
}

export default function DependenciaPage() {
  return (
    <div className="min-h-screen bg-[#0D1638] text-white overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <DependenciaContent />
    </div>
  )
}
