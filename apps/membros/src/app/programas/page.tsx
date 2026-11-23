import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'

/**
 * Todos os programas do Instituto, numa página pública.
 *
 * Existe porque "Ver todos os programas" no menu apontava pra /loja, que é da
 * área de membros e jogava o visitante na tela de login. A ordem é a mesma do
 * menu, definida pelo Pedro em 23/11/2026. Sem preço de formação, como na home:
 * cada card diz a situação real da turma.
 */

export const metadata = {
  title: 'Programas e formações',
  description:
    'Todas as formações, mentorias e atendimentos do Instituto Despertamente: Psicanálise Integrativa, Divã IDM, PNL, Numerologia (NPA e NPS), IDM pelo Brasil e Constelação Familiar.',
  alternates: { canonical: '/programas' },
}

type Programa = {
  href: string
  titulo: string
  tipo: string
  descricao: string
  situacao: string
  imagem?: string
}

const PROGRAMAS: Programa[] = [
  {
    href: '/programas/psicanalise-integrativa',
    titulo: 'Formação em Psicanálise Clínica Integrativa',
    tipo: 'Formação principal',
    descricao: '14 meses, 100% online, em 4 arcos. Certificado de Extensão Universitária nas diretrizes do MEC, em parceria com a Anhanguera.',
    situacao: 'Matrículas abertas · turmas iniciando todo mês',
    imagem: '/images/turmas/turma-certificados.jpg',
  },
  {
    href: '/programas/diva-idm',
    titulo: 'Divã IDM — terapia online',
    tipo: 'Atendimento',
    descricao: 'Sessões de psicanálise online com psicanalistas formados pelo Instituto, em supervisão.',
    situacao: 'A partir de R$ 70 a sessão',
  },
  {
    href: '/programas/practitioner-pnl',
    titulo: 'Practitioner em PNL',
    tipo: 'Formação',
    descricao: '8 sessões ao vivo, uma por semana, todas gravadas na plataforma.',
    situacao: 'Próxima turma: previsão 2 de março',
  },
  {
    href: '/programas/mentoria-npa',
    titulo: 'Mentoria NPA — Numerologia Aplicada',
    tipo: 'Mentoria',
    descricao: '6 sessões ao vivo, uma por semana, todas gravadas na plataforma.',
    situacao: 'Próxima turma: previsão 12 de janeiro',
  },
  {
    href: '/programas/mentoria-nps',
    titulo: 'Mentoria NPS — Numerologia Pitagórica',
    tipo: 'Mentoria',
    descricao: '2 encontros ao vivo por mês, gravações na área de membros e a plataforma que gera mapas numerológicos.',
    situacao: 'Assinatura mensal · entre quando quiser',
  },
  {
    href: '/programas/idm-pelo-brasil',
    titulo: 'IDM pelo Brasil',
    tipo: 'Presencial',
    descricao: 'Numerologia em turmas de 4 horas (manhã ou tarde) e Psicanálise em imersão de dia inteiro, na sua cidade.',
    situacao: 'Próximas: São Paulo em 05/12 · Santos em 12/12',
    imagem: '/images/turmas/aula-sala-cheia.jpg',
  },
  {
    href: '/programas/constelacao-familiar',
    titulo: 'Despertar Sistêmico — Constelação Familiar',
    tipo: 'Formação',
    descricao: '3 meses, 8 módulos, 12 aulas, encontros quinzenais ao vivo.',
    situacao: 'Turma 01 começa em 03 de dezembro',
  },
]

export default function ProgramasPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#08090d] text-[#f2f2f3]">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <div className="fds">
        <section className="fds-band--deep" style={{ borderBottom: '1px solid var(--fds-line)' }}>
          <div className="fds-wrap" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-16)' }}>
            <p className="fds-eyebrow block">Programas</p>
            <h1 className="fds-display mt-5" style={{ fontSize: 'clamp(2.5rem, 6vw, 3.5rem)' }}>Tudo o que o Instituto oferece.</h1>
            <p className="fds-body mt-6" style={{ fontSize: 18 }}>
              Formações, mentorias, encontros presenciais e atendimento. Todos com o mesmo método por trás.
            </p>
          </div>
        </section>

        <section className="fds-section">
          <div className="fds-wrap grid gap-6 md:grid-cols-2">
            {PROGRAMAS.map((p, i) => (
              <Link
                key={p.href}
                href={p.href}
                className={`group flex flex-col overflow-hidden ${i === 0 ? 'md:col-span-2 md:flex-row' : ''}`}
                style={{
                  border: `1px solid ${i === 0 ? 'var(--fds-accent)' : 'var(--fds-line)'}`,
                  borderRadius: 10,
                  background: i === 0 ? 'var(--fds-deep)' : 'transparent',
                }}
              >
                {p.imagem && (
                  <div className={`relative ${i === 0 ? 'aspect-video md:aspect-auto md:w-[440px]' : 'aspect-video'}`}>
                    <Image src={p.imagem} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-3" style={{ padding: 'var(--fds-8)' }}>
                  <p className="fds-eyebrow block">{p.tipo}</p>
                  <h2 className="fds-h3">{p.titulo}</h2>
                  <p className="fds-body flex-1">{p.descricao}</p>
                  <p className="fds-small" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>{p.situacao}</p>
                  <span className="fds-small inline-flex items-center gap-1.5" style={{ color: 'var(--fds-ink)' }}>
                    Ver o programa <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  )
}
