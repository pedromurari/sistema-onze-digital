'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
} from 'framer-motion'
import { ArrowRight, MessageCircle, Clock, Ticket, CalendarDays, Check, Quote, Sparkles, GraduationCap, Users, Award } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useCheckoutModal } from '@/components/checkout/CheckoutModal'
import { LeadFormModal } from './LeadFormModal'
import { VideoPlayer } from './VideoPlayer'
import { SiteFooter } from '@/components/marketing/SiteFooter'

// Vídeo provisório — trocar pelo vídeo de vendas real assim que estiver pronto.
const VIDEO_VENDAS_YOUTUBE_ID = 'megMz1qsixU'

// Próxima turma: 08/08/2026 é uma exceção manual (combinada com a Jocimara).
// A partir de setembro/2026 em diante, sempre o primeiro sábado do mês —
// calculado automaticamente, não precisa mexer aqui todo mês.
const PROXIMA_TURMA_EXCECAO = new Date(2026, 7, 8) // mês 7 = agosto (índice 0-based)
const HORARIO_TURMA = 'Das 09h30 às 12h'

function primeiroSabado(ano: number, mesIndex: number) {
  const d = new Date(ano, mesIndex, 1)
  const offset = (6 - d.getDay() + 7) % 7
  d.setDate(1 + offset)
  return d
}

function proximaTurma(hoje = new Date()): Date {
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  if (hojeSemHora <= PROXIMA_TURMA_EXCECAO) return PROXIMA_TURMA_EXCECAO

  let ano = hoje.getFullYear()
  let mes = hoje.getMonth()
  if (ano === 2026 && mes === 7) mes = 8 // pula reto pra setembro depois da excecao de agosto

  let candidata = primeiroSabado(ano, mes)
  if (candidata < hojeSemHora) {
    mes += 1
    if (mes > 11) { mes = 0; ano += 1 }
    candidata = primeiroSabado(ano, mes)
  }
  return candidata
}

function formatarProximaTurma(data: Date) {
  const texto = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(data)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const WA_URL = 'https://wa.me/5511919434040?text=Ol%C3%A1!%20Quero%20garantir%20minha%20vaga%20no%20Cicatrizes%20que%20Curam.'

const bonusStack = [
  { t: 'Kit de reflexão pós-workshop', d: 'Um guia em PDF com exercícios pra continuar o processo em casa, nos dias seguintes ao encontro.' },
  { t: 'Prioridade nas próximas turmas', d: 'Acesso antecipado pra garantir vaga nos próximos workshops, antes da abertura geral.' },
  { t: 'Grupo de apoio no WhatsApp', d: 'Espaço com as outras participantes da sua turma, pra continuar a troca depois do encontro.' },
]

const paraQuemE = [
  'Quem sente que carrega marcas do passado que ainda pesam no presente',
  'Quem já fez terapia, mas quer um espaço vivencial e coletivo, além da sessão individual',
  'Quem está começando a se interessar por autoconhecimento e psicanálise integrativa',
  'Quem ganhou este workshop de bônus em outro produto do IDM e quer aproveitar a vivência',
]

const faqItems = [
  {
    q: 'O que exatamente acontece nas 3 horas?',
    a: 'Um workshop vivencial guiado pela Jocimara, combinando psicanálise integrativa e dinâmicas em grupo — você sai com clareza sobre marcas emocionais que ainda influenciam suas decisões, não só com teoria.',
  },
  {
    q: 'Preciso já fazer terapia pra participar?',
    a: 'Não. O workshop recebe tanto quem nunca fez terapia quanto quem já tem processo em andamento e quer um espaço coletivo complementar.',
  },
  {
    q: 'Tem algum desconto disponível?',
    a: 'De vez em quando a Jocimara libera cupons pra quem a acompanha de perto. Se você tiver um código, é só aplicar na etapa de pagamento do checkout.',
  },
  {
    q: 'Com que frequência o workshop acontece?',
    a: 'Uma turma por mês, sempre no primeiro sábado, das 9h30 às 12h — com vagas limitadas de propósito, pra manter o espaço de escuta próximo, não lotar a sala.',
  },
  {
    q: 'Ganhei o Cicatrizes que Curam de bônus em outro produto. Preciso pagar?',
    a: 'Não — se você recebeu o workshop como bônus de outro produto do IDM, sua vaga já está garantida sem custo adicional.',
  },
]

/* ============================================================
   Primitivos de animação
   ============================================================ */

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' as `${number}px` })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function RevealWords({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' as `${number}px` })
  const reduce = useReducedMotion()
  const words = text.split(' ')
  return (
    <span ref={ref} className={className} style={style}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ opacity: 0, y: reduce ? 0 : 16, filter: 'blur(4px)' }}
          animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.55, delay: i * 0.045, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="flex items-center gap-3 mb-5"
    >
      <span className="h-px w-8 bg-gradient-to-r from-[#FFB800] to-transparent" />
      <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#FFB800]/80">{children}</span>
    </motion.div>
  )
}

function SectionDivider() {
  return (
    <div className="relative h-px w-full max-w-5xl mx-auto">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rotate-45 bg-[#FFB800]/50" />
    </div>
  )
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] origin-left z-[70] pointer-events-none"
      style={{
        scaleX: scrollYProgress,
        background: 'linear-gradient(90deg, #FFC933, #FFB800)',
        boxShadow: '0 0 12px rgba(255,184,0,0.6)',
      }}
    />
  )
}

function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 260, damping: 22 })
  const sry = useSpring(ry, { stiffness: 260, damping: 22 })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    ry.set(px * 7)
    rx.set(-py * 7)
  }
  function onLeave() {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function StickyCTACicatrizes({ onAbrir }: { onAbrir: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const threshold = window.innerHeight * 0.3
    const handler = () => setVisible(window.scrollY > threshold)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div
      className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A1232]/96 backdrop-blur-xl border-t border-white/8 px-4 py-3 flex gap-2.5 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!visible}
    >
      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#25D366]/30 text-sm font-bold text-[#25D366] hover:bg-[#25D366]/8 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
      <button
        onClick={onAbrir}
        className="flex flex-1 items-center justify-center py-3 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] text-sm font-bold text-[#0D1638] hover:brightness-[1.06] transition-all"
      >
        Quero garantir meu ingresso
      </button>
    </div>
  )
}

export function CicatrizesContent() {
  const lead = useCheckoutModal()
  const dataProximaTurma = proximaTurma()
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(heroProgress, [0, 1], [0, 30])
  const heroScale = useTransform(heroProgress, [0, 1], [1, 1.04])

  return (
    <>
      <LeadFormModal open={lead.open} onClose={lead.fechar} />
      <ScrollProgress />
      <StickyCTACicatrizes onAbrir={lead.abrir} />

      {/* ── HERO ─────────────────────────────────── */}
      <section ref={heroRef} className="relative overflow-hidden pt-[72px] bg-[#0D1638]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full aspect-[1909/824] overflow-hidden"
        >
          <motion.div className="absolute inset-0" style={{ y: heroY, scale: heroScale }}>
            <Image
              src="/banner-cicatrizes.png"
              alt="Workshop Cicatrizes que Curam — Jocimara Anjos × Instituto DespertaMENTE"
              fill
              priority
              className="object-cover object-center"
            />
          </motion.div>
          <div
            className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, #0D1638)' }}
          />
        </motion.div>

        {/* Badges + CTA, abaixo do banner (sem sobrepor a imagem) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-4xl mx-auto px-6 sm:px-10 pt-6 pb-10 sm:pt-10 sm:pb-14 flex flex-col items-center gap-6 sm:gap-8 text-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-[13px] text-white/55">
            {[
              { icon: Clock, label: '3 horas de duração' },
              { icon: Ticket, label: 'Vagas limitadas' },
              { icon: CalendarDays, label: formatarProximaTurma(dataProximaTurma) },
              { icon: Clock, label: HORARIO_TURMA },
            ].map(({ icon: Icon, label }, i, arr) => (
              <span key={label} className="inline-flex items-center gap-x-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-[#FFC933]" strokeWidth={1.75} />
                  {label}
                </span>
                {i < arr.length - 1 && <span className="text-white/20">·</span>}
              </span>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <button
              onClick={lead.abrir}
              className="group relative inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] px-8 py-3.5 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-[#0D1638] transition-all duration-200 hover:brightness-[1.06] active:scale-[0.98] whitespace-nowrap w-fit"
              style={{ boxShadow: '0 16px 44px -10px rgba(255,184,0,0.5), 0 1px 0 rgba(255,255,255,0.4) inset' }}
            >
              <motion.span
                className="absolute inset-0 rounded-xl"
                animate={{ boxShadow: ['0 0 0 0 rgba(255,184,0,0.35)', '0 0 0 12px rgba(255,184,0,0)'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              />
              QUERO GARANTIR MEU INGRESSO
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <p className="flex items-center gap-2 text-[11px] text-white/35 tracking-wide">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFB800]/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FFB800]" />
              </span>
              Turma fecha assim que as vagas esgotam
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── AUTORIDADE / PROVA SOCIAL ─────────────── */}
      <section className="relative bg-[#0A1232] border-y border-white/5 overflow-hidden">
        <Reveal className="relative max-w-2xl mx-auto px-6 sm:px-10 py-8 text-center">
          <p className="text-[15px] sm:text-base text-white/60 leading-relaxed">
            Conduzido pela equipe pedagógica do <span className="text-white font-semibold">Instituto Despertamente</span>,
            com uma metodologia já aplicada a mais de <span className="text-[#FFB800] font-semibold">12.000 alunos em todo o país</span>.
          </p>
        </Reveal>
      </section>

      {/* ── VÍDEO DE APRESENTAÇÃO ─────────────────── */}
      <section className="relative bg-[#0A1232] overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,184,0,0.08), transparent)' }}
        />
        <Reveal className="relative max-w-2xl mx-auto px-6 sm:px-10 py-12 space-y-7">
          <Quote className="h-6 w-6 text-[#FFB800]/40 mx-auto" strokeWidth={1.5} />
          <p
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-xl sm:text-[26px] font-light leading-snug text-white/85 text-center"
          >
            Assista a esse vídeo, a Jocimara Anjos está te apresentando o que é o &ldquo;Cicatrizes que Curam&rdquo;.
          </p>
          <div className="rounded-[20px] p-[1px] bg-gradient-to-br from-[#FFB800]/25 via-white/5 to-transparent">
            <VideoPlayer youtubeId={VIDEO_VENDAS_YOUTUBE_ID} title="Cicatrizes que Curam — vídeo de apresentação" />
          </div>
        </Reveal>
      </section>

      {/* ── O QUE É ──────────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <Eyebrow>O workshop</Eyebrow>
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-white mb-14 max-w-lg leading-[1.08]"
          >
            <RevealWords text="O que é o workshop." />
          </h2>
          <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/[0.06] border border-white/[0.06]">
            {[
              { n: '01', t: 'Vivência guiada', d: '3 horas de imersão prática, conduzida pela Jocimara, unindo psicanálise integrativa e acolhimento em grupo.' },
              { n: '02', t: 'Autoconhecimento aplicado', d: 'Identifique as marcas emocionais que ainda influenciam suas decisões — e o que fazer com elas a partir de hoje.' },
              { n: '03', t: 'Turma pequena', d: 'Vagas limitadas de propósito: mais espaço de escuta, mais profundidade, menos gente por sessão.' },
            ].map((c) => (
              <TiltCard key={c.t} className="group relative bg-[#0D1638] p-8 space-y-4 transition-colors duration-300 hover:bg-[#0F1B45]">
                <span
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  className="block text-sm font-semibold text-[#FFB800]/50 group-hover:text-[#FFB800]/80 transition-colors"
                >
                  {c.n}
                </span>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-lg font-semibold text-white">{c.t}</p>
                <p className="text-sm text-white/45 leading-relaxed">{c.d}</p>
              </TiltCard>
            ))}
          </div>
        </section>
      </Reveal>

      <SectionDivider />

      {/* ── QUEM CONDUZ ──────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <Eyebrow>Quem conduz</Eyebrow>
          <div className="grid sm:grid-cols-[auto_1fr] gap-8 sm:gap-12 items-center">
            <div className="relative mx-auto sm:mx-0 shrink-0">
              <div
                className="absolute -inset-3 rounded-full opacity-40 blur-xl"
                style={{ background: 'radial-gradient(circle, #FFB800, transparent 70%)' }}
              />
              <div className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden border-2 border-[#FFB800]/40">
                <Image src="/jocimara-anjos.jpg" alt="Jocimara Anjos" fill className="object-cover" />
              </div>
            </div>
            <div className="space-y-4 text-center sm:text-left">
              <div>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl sm:text-3xl font-bold text-white">
                  Jocimara Anjos
                </p>
                <p className="text-sm text-[#FFB800]/80 mt-1">Coordenadora Pedagógica da Formação em Psicanálise do IDM</p>
              </div>
              <p className="text-sm text-white/50 leading-relaxed max-w-lg mx-auto sm:mx-0">
                Em constante prática clínica, Jocimara conduz o workshop com uma escuta que une técnica e acolhimento —
                a mesma abordagem que forma os profissionais de psicanálise integrativa do Instituto Despertamente.
              </p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                {[
                  { icon: GraduationCap, label: 'Psicanálise Integrativa' },
                  { icon: Users, label: 'Facilitação em grupo' },
                  { icon: Award, label: 'Formação certificada' },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/50">
                    <Icon className="h-3 w-3 text-[#FFB800]/70" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── PRA QUEM É ───────────────────────────── */}
      <Reveal>
        <section className="max-w-3xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <Eyebrow>É pra você?</Eyebrow>
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-white mb-12 leading-[1.08]"
          >
            <RevealWords text="Pra quem é." />
          </h2>
          <div className="space-y-0 divide-y divide-white/[0.06]">
            {paraQuemE.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-4 py-6"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFB800]/10 border border-[#FFB800]/25">
                  <Check className="h-3.5 w-3.5 text-[#FFB800]" strokeWidth={2.5} />
                </span>
                <p className="text-[15px] text-white/65 leading-relaxed pt-0.5">{item}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <Reveal>
        <section id="investimento" className="relative bg-[#0A1232] border-y border-white/5 overflow-hidden">
          <motion.div
            className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[36rem] rounded-full pointer-events-none blur-3xl"
            animate={{ opacity: [0.15, 0.28, 0.15] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'radial-gradient(circle, #FFB800, transparent 70%)' }}
          />
          <div className="relative max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
            <Eyebrow>Sua vaga</Eyebrow>
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-white mb-3 leading-[1.08]"
            >
              <RevealWords text="Investimento." />
            </h2>
            <p className="text-sm text-white/45 leading-relaxed mb-12 max-w-md">
              Valor de referência R$250 — o ingresso avulso sai por bem menos, e ainda vem com bônus.
            </p>

            <div className="grid sm:grid-cols-[1fr_1.3fr] gap-6 items-start">
              {/* Ticket-style price card */}
              <div className="relative">
                <div
                  className="relative rounded-2xl border p-8 space-y-3 overflow-hidden"
                  style={{
                    borderColor: 'rgba(255,184,0,0.35)',
                    background: 'linear-gradient(160deg, rgba(255,184,0,0.10), rgba(10,18,50,0.5))',
                    boxShadow: '0 24px 60px -20px rgba(255,184,0,0.18)',
                  }}
                >
                  <motion.div
                    className="absolute -top-10 -right-10 h-28 w-28 rounded-full pointer-events-none"
                    animate={{ opacity: [0.2, 0.35, 0.2] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ background: '#FFB800', filter: 'blur(24px)' }}
                  />
                  <motion.div
                    className="absolute inset-y-0 w-16 pointer-events-none"
                    style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.10), transparent)' }}
                    animate={{ left: ['-20%', '120%'] }}
                    transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
                  />
                  <div className="relative flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-[#FFB800]" />
                    <p className="text-[11px] font-mono uppercase tracking-widest text-[#FFB800]">Seu ingresso hoje</p>
                  </div>
                  <p className="relative text-xs text-white/30 line-through">R$ 250,00</p>
                  <p
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                    className="relative text-5xl font-bold text-white leading-none pt-1"
                  >
                    R$ 47,90
                  </p>
                  <p className="relative text-[11px] text-white/40 pt-1">Pix à vista ou em até 5x de R$ 10,53 no cartão</p>
                  <button
                    onClick={lead.abrir}
                    className="relative w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] text-sm font-bold text-[#0D1638] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200"
                    style={{ boxShadow: '0 10px 28px -8px rgba(255,184,0,0.4)' }}
                  >
                    Quero garantir meu ingresso
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-white/30 mb-1">Ao garantir sua vaga, você também leva</p>
                {bonusStack.map((b, i) => (
                  <motion.div
                    key={b.t}
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="group flex items-start gap-4 rounded-xl border border-white/[0.07] bg-[#0D1638] p-5 transition-colors duration-200 hover:border-[#FFB800]/25"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFB800]/10 border border-[#FFB800]/20 text-[10px] font-bold text-[#FFB800] font-mono">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{b.t}</p>
                      <p className="text-xs text-white/40 mt-1 leading-relaxed">{b.d}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <p className="text-xs text-white/30 mt-10 max-w-md">
              Ganhou o workshop de bônus em outro produto do IDM? Sua vaga já está garantida, sem custo adicional.
            </p>

            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-xs text-white/35 hover:text-[#FFB800]/80 transition-colors"
            >
              <MessageCircle className="h-3 w-3" />
              Tirar dúvidas pelo WhatsApp
            </a>
          </div>
        </section>
      </Reveal>

      {/* ── FAQ ──────────────────────────────────── */}
      <Reveal>
        <section className="max-w-3xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <Eyebrow>Perguntas frequentes</Eyebrow>
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-white mb-12 leading-[1.08]"
          >
            <RevealWords text="Dúvidas." />
          </h2>
          <Accordion type="single" collapsible>
            <div className="space-y-2.5">
              {faqItems.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border border-white/[0.06] rounded-xl bg-white/[0.02] px-5 data-[state=open]:border-[#FFB800]/20 data-[state=open]:bg-[#FFB800]/[0.03] transition-colors"
                >
                  <AccordionTrigger className="hover:no-underline py-5 text-left text-sm font-medium text-white/70 hover:text-white transition-colors">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-white/45 leading-relaxed pb-5">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </div>
          </Accordion>
        </section>
      </Reveal>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="relative overflow-hidden py-20 bg-[#0A1232] border-t border-white/5">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full pointer-events-none blur-[100px]"
          animate={{ x: [0, 24, 0], y: [0, -18, 0], opacity: [0.2, 0.32, 0.2] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(circle, #FFB800, transparent 70%)' }}
        />
        <Reveal className="relative max-w-3xl mx-auto px-6 sm:px-10 space-y-10">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-5xl sm:text-6xl font-bold text-white leading-[1.0]"
          >
            <RevealWords text="Sua próxima turma" />
            <br />
            <RevealWords text="está quase fechando." />
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <button
              onClick={lead.abrir}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] px-8 py-4 text-base font-bold text-[#0D1638] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200"
              style={{ boxShadow: '0 12px 40px -8px rgba(255,184,0,0.45), 0 1px 0 rgba(255,255,255,0.4) inset' }}
            >
              Quero garantir meu ingresso
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
          <p className="text-xs font-mono text-white/25 tracking-wide">
            Vagas limitadas · turma pequena de propósito
          </p>
        </Reveal>
      </section>

      {/* pb extra no mobile pra nao ficar tampado pela StickyCTACicatrizes fixa no rodape */}
      <div className="pb-20 md:pb-0">
        <SiteFooter parceira="Jocimara Anjos" />
      </div>
    </>
  )
}
