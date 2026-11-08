import Link from 'next/link'
import Image from 'next/image'
import { Caveat } from 'next/font/google'
import { CalendarHeart, Sparkles } from 'lucide-react'

const caveat = Caveat({ subsets: ['latin'], weight: ['600', '700'], display: 'swap' })

export const metadata = {
  title: 'Jocimara Anjos — Terapeuta',
  description: 'Terapeuta, Psicanálise Integrativa. Agende sua sessão e conheça o Cicatrizes que Curam.',
}

const WA_SESSAO = 'https://wa.me/5519974084809?text=Ol%C3%A1!%20Gostaria%20de%20agendar%20uma%20sess%C3%A3o%20com%20a%20Jocimara.'

const links = [
  {
    href: WA_SESSAO,
    external: true,
    style: 'primary' as const,
    icon: CalendarHeart,
    title: 'Agendar minha sessão',
    sub: 'Atendimento individual comigo',
  },
  {
    href: '/cicatrizes',
    external: false,
    style: 'card' as const,
    icon: Sparkles,
    title: 'Workshop Cicatrizes que Curam',
    sub: '3h · vagas limitadas · uma vez por mês',
    tag: 'R$ 47,90',
  },
]

export default function JocimaraAnjosPage() {
  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center px-6 py-16" style={{ background: '#FBF3E7' }}>
      {/* watercolor blooms */}
      <div className="absolute -top-24 -left-28 w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(232,169,60,0.35), rgba(232,169,60,0) 70%)' }} />
      <div className="absolute -bottom-32 -right-24 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(30,42,82,0.28), rgba(30,42,82,0) 70%)' }} />
      <div className="absolute top-1/3 -right-16 w-[220px] h-[220px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(232,169,60,0.18), rgba(232,169,60,0) 70%)' }} />

      <div className="relative w-full max-w-[420px] flex flex-col items-center">
        <div
          className="w-[112px] h-[112px] rounded-full overflow-hidden mb-5 shrink-0"
          style={{ boxShadow: '0 0 0 5px rgba(255,255,255,0.9), 0 0 0 6.5px rgba(199,145,47,0.35), 0 14px 30px rgba(30,42,82,0.18)' }}
        >
          <Image
            src="/jocimara-anjos.jpg"
            alt="Jocimara Anjos"
            width={112}
            height={112}
            className="w-full h-full object-cover"
            priority
          />
        </div>

        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-[28px] font-bold text-[#1E2A52] text-center">
          Jocimara Anjos
        </h1>
        <p className={`${caveat.className} text-[26px] leading-none text-[#C7912F] text-center mt-1`}>
          Terapeuta · Psicanálise Integrativa
        </p>
        <p className="text-[11.5px] font-medium text-[#5B5344] text-center mt-2.5 max-w-[300px] leading-relaxed tracking-wide">
          Coordenadora Pedagógica da Formação em Psicanálise · Instituto Despertamente
        </p>

        <div className="w-full flex flex-col gap-3 mt-9">
          {links.map((l) => {
            const Icon = l.icon
            const Wrapper = l.external ? 'a' : Link
            const extraProps = l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
            const isPrimary = l.style === 'primary'
            return (
              <Wrapper
                key={l.title}
                href={l.href}
                {...extraProps}
                className={`group flex items-center gap-3.5 rounded-2xl px-5 py-4 transition-all duration-200 ${
                  isPrimary
                    ? 'active:scale-[0.98]'
                    : 'bg-white/70 border border-[#1E2A52]/10 hover:border-[#1E2A52]/25 hover:bg-white/90'
                }`}
                style={isPrimary ? { background: 'linear-gradient(135deg, #E8B056, #C7912F)' } : undefined}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isPrimary ? 'bg-white/25' : 'bg-[#1E2A52]/6'
                  }`}
                >
                  <Icon className={isPrimary ? 'text-white' : 'text-[#1E2A52]/70'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] font-semibold ${isPrimary ? 'text-white' : 'text-[#1E2A52]'}`}>
                    {l.title}
                  </p>
                  <p className={`text-[12px] mt-0.5 ${isPrimary ? 'text-white/75' : 'text-[#5B5344]/70'}`}>
                    {l.sub}
                  </p>
                </div>
                {l.tag && (
                  <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-[#C7912F] bg-[#C7912F]/10 border border-[#C7912F]/25 rounded-full px-2.5 py-1">
                    {l.tag}
                  </span>
                )}
              </Wrapper>
            )
          })}
        </div>

        <p className={`${caveat.className} text-[20px] text-[#C7912F]/70 mt-7`}>+ novos links em breve</p>

        <div className="flex items-center gap-2 mt-8 opacity-45">
          <Image src="/despertamente-simbolo.png" alt="Instituto Despertamente" width={15} height={15} className="object-contain" />
        </div>
      </div>
    </div>
  )
}
