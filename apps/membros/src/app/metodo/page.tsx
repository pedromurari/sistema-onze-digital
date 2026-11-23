import Image from 'next/image'
import Link from 'next/link'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'

/**
 * O Método Despertamente — quem somos, o que o método faz, quem conduz.
 *
 * A bio do Rodrygo é a mesma das páginas do IDM pelo Brasil (texto que ele
 * já aprovou). O Pedro vai mandar a página pra ele revisar e trocar o que
 * quiser.
 */

export const metadata = {
  title: 'O Método Despertamente',
  description:
    'Uma metodologia própria, construída em 9 anos de prática, que une psicanálise, neurociência e PNL. Teoria, análise pessoal e supervisão em toda formação.',
  alternates: { canonical: '/metodo' },
  openGraph: {
    url: '/metodo',
    type: 'website',
    title: 'O Método Despertamente',
    description: 'Psicanálise, neurociência e PNL numa metodologia só. Conheça o método e quem conduz.',
  },
}

const PILARES = [
  { titulo: 'Teoria', texto: 'Psicanálise, neurociência e PNL numa base só — não três cursos colados.' },
  { titulo: 'Análise pessoal', texto: 'Você passa pelo processo antes de conduzir alguém por ele. Quem nunca se olhou não sustenta a escuta do outro.' },
  { titulo: 'Supervisão', texto: 'Atendimento real com alguém mais experiente olhando junto, corrigindo o que você não vê.' },
]

const NUMEROS = [
  { valor: '12.000+', rotulo: 'pessoas já passaram pelas formações' },
  { valor: '9 anos', rotulo: 'construindo e corrigindo o método' },
  { valor: 'MEC', rotulo: 'certificação via parceria com a Anhanguera' },
]

export default function MetodoPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#08090d] text-[#f2f2f3]">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <div className="fds">
        {/* Capa */}
        <section className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--fds-line)' }}>
          <Image
            src="/images/turmas/turma-escada.jpg"
            alt="Turma do Instituto reunida ao fim de uma formação"
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: 'center 30%' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(8,9,13,0.97) 0%, rgba(8,9,13,0.92) 50%, rgba(8,9,13,0.6) 100%)' }} />
          <div className="fds-wrap relative" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
            <div className="max-w-[680px]">
              <p className="fds-eyebrow block">O método</p>
              <h1 className="fds-display mt-5">Nem toda mudança começa do lado de fora.</h1>
              <p className="fds-body mt-6" style={{ color: '#d4d5d9', fontSize: 18 }}>
                Muitas pessoas passam a vida tentando mudar seus resultados. Poucas aprendem a compreender os
                padrões que produzem esses resultados.
              </p>
            </div>
          </div>
        </section>

        {/* O que é */}
        <section className="fds-section">
          <div className="fds-wrap grid gap-16 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 className="fds-h2">Aquilo que você ilumina na consciência deixa de comandar você no escuro.</h2>
              <p className="fds-body mt-6">
                O Método Despertamente nasceu de nove anos de prática clínica e de sala de aula. Ele não escolheu
                entre psicanálise, neurociência e PNL: usa as três, porque cada uma enxerga uma parte do mesmo
                problema.
              </p>
              <p className="fds-body mt-4">
                A psicanálise escuta o que se repete. A neurociência explica por que o corpo insiste. A PNL dá a
                ferramenta pra interromper o ciclo. Separadas, são teorias. Juntas, viram método.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {NUMEROS.map(n => (
                <div key={n.rotulo} className="fds-card" style={{ padding: 'var(--fds-6)' }}>
                  <p className="fds-h2" style={{ color: 'var(--fds-accent)', fontSize: 36, lineHeight: 1 }}>{n.valor}</p>
                  <p className="fds-small mt-2">{n.rotulo}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* O tripé */}
        <section className="fds-band fds-section">
          <div className="fds-wrap">
            <h2 className="fds-h2">O tripé de toda formação daqui</h2>
            <p className="fds-body mt-4">
              Nenhum curso do Instituto termina na teoria. Os três pés sustentam juntos — tira um e a formação
              vira videoaula.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {PILARES.map((p, i) => (
                <div key={p.titulo} className="fds-card" style={{ padding: 'var(--fds-8)' }}>
                  <p className="fds-h2" style={{ color: 'var(--fds-accent)', fontSize: 32 }}>{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="fds-h3 mt-4">{p.titulo}</h3>
                  <p className="fds-body mt-3">{p.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quem conduz */}
        <section className="fds-section">
          <div className="fds-wrap grid items-center gap-14 md:grid-cols-[360px_1fr]">
            <div className="relative aspect-square overflow-hidden" style={{ borderRadius: 10 }}>
              <Image src="/images/rodrygo-murari.jpg" alt="Rodrygo Murari, fundador do Instituto Despertamente" fill sizes="360px" className="object-cover" />
            </div>
            <div>
              <p className="fds-eyebrow block">Quem conduz</p>
              <h2 className="fds-h2 mt-4">Rodrygo Murari</h2>
              <p className="fds-small mt-2" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>Fundador e professor especialista</p>
              <p className="fds-body mt-6">
                Com mais de 5.000 horas de atendimentos somados em setting terapêutico, experiências, treinamentos
                e mentorias, Rodrygo Murari é especialista em Metafísica Comportamental e PNL Sistêmica.
              </p>
              <p className="fds-body mt-4">
                Seu propósito é levar uma psicanálise descomplicada. Sua abordagem da Psicanálise Integrativa tem
                transformado a vida de pessoas no Brasil e na Europa.
              </p>
            </div>
          </div>
        </section>

        {/* Missão */}
        <section className="fds-band--deep">
          <div className="fds-wrap text-center" style={{ paddingBlock: 'var(--fds-24)' }}>
            <h2 className="fds-h2 mx-auto max-w-3xl">Conhecimento informa.<br />Consciência transforma.</h2>
            <p className="fds-body mx-auto mt-6 max-w-2xl">
              Nossa missão é democratizar o acesso ao autoconhecimento sério — o que explica tanto a formação com
              certificado reconhecido quanto a sessão de terapia a partir de R$ 70.
            </p>
            <Link href="/#programas" className="fds-btn fds-btn--primary mt-9">Ver as formações</Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  )
}
