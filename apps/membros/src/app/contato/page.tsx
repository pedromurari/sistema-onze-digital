import Link from 'next/link'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { ContatoForm } from './ContatoForm'

export const metadata = {
  title: 'Contato',
  description:
    'Fale com o Instituto Despertamente: formações, Divã IDM, IDM pelo Brasil ou suporte de aluno. Atendimento todos os dias, em horário comercial.',
  alternates: { canonical: '/contato' },
}

const card = { border: '1px solid var(--fds-line)', borderRadius: 10, padding: 'var(--fds-6)' }

export default function ContatoPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#08090d] text-[#f2f2f3]">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <div className="fds">
        <section className="fds-section">
          <div className="fds-wrap grid gap-16 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="fds-eyebrow block">Contato</p>
              <h1 className="fds-display mt-5" style={{ fontSize: 'clamp(2.5rem, 6vw, 3.25rem)' }}>Fala com a gente.</h1>
              <p className="fds-body mt-6 mb-10" style={{ fontSize: 18 }}>
                Dúvida sobre formação, sobre o Divã, sobre levar o IDM pra sua cidade — ou só pra entender se é
                pra você.
              </p>
              <ContatoForm />
            </div>

            <aside className="flex flex-col gap-4">
              <a
                href="https://wa.me/5511930439385"
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...card, border: '1px solid var(--fds-accent)', background: 'var(--fds-deep)' }}
              >
                <p className="fds-eyebrow block">Mais rápido</p>
                <p className="fds-h3 mt-2">WhatsApp</p>
                <p className="fds-body mt-1" style={{ color: '#d4d5d9' }}>+55 11 93043-9385</p>
              </a>
              <div style={card}>
                <p className="fds-meta block">Onde ficamos</p>
                <p className="fds-body mt-2">Av. Paulista, 1636 — sala 1105<br />Bela Vista, São Paulo — SP</p>
              </div>
              <div style={card}>
                <p className="fds-meta block">Atendimento</p>
                <p className="fds-body mt-2">Todos os dias, sem folga, em horário comercial.</p>
              </div>
              <div style={card}>
                <p className="fds-meta block">Já é aluno?</p>
                <p className="fds-body mt-2">Suporte de turma, acesso e certificado ficam na sua área.</p>
                <Link href="/login" className="fds-small mt-3 inline-block" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
                  Entrar na minha área →
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  )
}
