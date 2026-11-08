'use client'

import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
} from 'framer-motion'
import { ArrowRight, MessageCircle, Check, Quote, GraduationCap, Users, HeartHandshake, PlayCircle, Info, Sparkles } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useCheckoutModal } from '@/components/checkout/CheckoutModal'
import { LeadFormModal } from './LeadFormModal'
import { SiteFooter } from '@/components/marketing/SiteFooter'

// Produto ainda em construção (nome, preço, formato e duração pendentes —
// Renata vai enviar essas infos pro time). Enquanto isso, a página captura
// lista de espera em vez de vender direto. Trocar pro fluxo de venda
// completo (igual /cicatrizes) assim que o produto estiver definido.
const WA_URL = 'https://wa.me/5511919434040?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20programa%20de%20Depend%C3%AAncia%20Qu%C3%ADmica%20com%20Psican%C3%A1lise%20da%20Renata.'

const paraQuemE = [
  'Quem convive com a dependência química de alguém que ama — filho, cônjuge, pai, mãe, irmão',
  'Quem usa e sente que "só força de vontade" nunca foi suficiente pra parar',
  'Quem já passou por internação ou tratamento e não sabe por que a recaída aconteceu de novo',
  'Quem quer entender a raiz do vício antes de decidir o próximo passo',
]

const faqItems = [
  {
    q: 'O programa já existe? Dá pra comprar agora?',
    a: 'Ainda não — está sendo estruturado pela Renata junto com o time do Instituto Despertamente. Quem entra na lista de espera é avisado em primeira mão assim que abrir, com condição especial de lançamento.',
  },
  {
    q: 'Qual vai ser o formato?',
    a: 'Curso, mentoria ou sessões — ainda em definição, junto com preço e duração. A ideia é desenhar o formato que realmente atende quem tá vivendo isso, não encaixar o problema num formato pronto.',
  },
  {
    q: 'Sobre o que é, exatamente?',
    a: 'Dependência química com o olhar da psicanálise integrativa — não é sobre "parar de usar", é sobre entender o que a substância está preenchendo, pra quem usa e pra quem ama alguém que usa.',
  },
  {
    q: 'Como eu acompanho enquanto o programa não abre?',
    a: 'A Renata publica conteúdo em vídeo toda semana, no Instagram e no YouTube, respondendo dúvidas reais sobre o tema. Segue o Instituto Despertamente e o perfil dela pra acompanhar de perto.',
  },
]

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
          {i < words.length - 1 ? ' ' : ''}
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

function StickyCTADependencia({ onAbrir }: { onAbrir: () => void }) {
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
        Entrar na lista de espera
      </button>
    </div>
  )
}

export function DependenciaContent() {
  const lead = useCheckoutModal()

  return (
    <>
      <LeadFormModal open={lead.open} onClose={lead.fechar} />
      <ScrollProgress />
      <StickyCTADependencia onAbrir={lead.abrir} />

      {/* ── HERO ─────────────────────────────────── */}
      <section className="relative overflow-hidden pt-[72px] bg-[#0D1638]">
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255,184,0,0.14), transparent)' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-3xl mx-auto px-6 sm:px-10 pt-16 pb-14 sm:pt-20 sm:pb-16 flex flex-col items-center gap-6 sm:gap-8 text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FFB800]/30 bg-[#FFB800]/10 px-4 py-1.5 text-[11px] font-mono uppercase tracking-widest text-[#FFB800]">
            <Sparkles className="h-3 w-3" />
            Em construção — lista de espera aberta
          </span>

          <h1
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-6xl font-bold leading-[1.05] text-white"
          >
            <RevealWords text="Dependência Química" />
            <br />
            <RevealWords text="com Psicanálise." />
          </h1>

          <p className="text-base sm:text-lg text-white/60 max-w-xl leading-relaxed">
            Renata Weigert, psicanalista, traz um olhar clínico e humano sobre dependência química —
            pra quem usa a substância, e pra quem ama alguém que usa.
          </p>

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
              QUERO ENTRAR NA LISTA DE ESPERA
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <p className="flex items-center gap-2 text-[11px] text-white/35 tracking-wide">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFB800]/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FFB800]" />
              </span>
              Você é avisada em primeira mão, com condição de lançamento
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── AUTORIDADE ─────────────────────────────── */}
      <section className="relative bg-[#0A1232] border-y border-white/5 overflow-hidden">
        <Reveal className="relative max-w-2xl mx-auto px-6 sm:px-10 py-8 text-center">
          <p className="text-[15px] sm:text-base text-white/60 leading-relaxed">
            Um programa do <span className="text-white font-semibold">Instituto Despertamente</span>, com a
            mesma metodologia pedagógica já aplicada a mais de <span className="text-[#FFB800] font-semibold">12.000 alunos em todo o país</span>.
          </p>
        </Reveal>
      </section>

      {/* ── VÍDEO (placeholder, em produção) ──────── */}
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
            O vídeo de apresentação da Renata está em produção — assim que gravar, ele entra aqui.
          </p>
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
            <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-[#111D48] to-[#0A1232]">
              <PlayCircle className="h-14 w-14 text-white/25" />
            </div>
            <div className="flex items-start gap-2.5 px-4 py-3 bg-white/[0.03] border-t border-white/5">
              <Info className="h-3.5 w-3.5 text-white/30 mt-0.5 shrink-0" />
              <p className="text-[11px] text-white/35 leading-relaxed">
                Espaço reservado pro vídeo de apresentação da Renata, assim que a gravação estiver pronta.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── O QUE É ──────────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
          <Eyebrow>O programa</Eyebrow>
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-white mb-14 max-w-lg leading-[1.08]"
          >
            <RevealWords text="O que está sendo construído." />
          </h2>
          <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/[0.06] border border-white/[0.06]">
            {[
              { n: '01', t: 'Conteúdo real, toda semana', d: 'Vídeos novos no YouTube e Reels, respondendo dúvidas reais de quem convive com dependência química.' },
              { n: '02', t: 'Olhar psicanalítico', d: 'Renata traz a psicanálise integrativa pra entender a raiz do vício — não só o sintoma na superfície.' },
              { n: '03', t: 'Formato em desenho', d: 'Curso, mentoria ou sessões — o formato final está sendo definido com base no que faz mais sentido pro tema.' },
            ].map((c) => (
              <div key={c.t} className="group relative bg-[#0D1638] p-8 space-y-4 transition-colors duration-300 hover:bg-[#0F1B45]">
                <span
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  className="block text-sm font-semibold text-[#FFB800]/50 group-hover:text-[#FFB800]/80 transition-colors"
                >
                  {c.n}
                </span>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-lg font-semibold text-white">{c.t}</p>
                <p className="text-sm text-white/45 leading-relaxed">{c.d}</p>
              </div>
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
              <div
                className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden border-2 border-[#FFB800]/40 flex items-center justify-center text-3xl sm:text-4xl font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1E2A52, #0D1638)' }}
              >
                RW
              </div>
            </div>
            <div className="space-y-4 text-center sm:text-left">
              <div>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl sm:text-3xl font-bold text-white">
                  Renata Weigert
                </p>
                <p className="text-sm text-[#FFB800]/80 mt-1">Psicanalista · Dependência Química com Psicanálise Integrativa</p>
              </div>
              <p className="text-sm text-white/50 leading-relaxed max-w-lg mx-auto sm:mx-0">
                Renata trabalha há anos com dependência química — com quem usa e com quem ama alguém que usa.
                Seu trabalho parte de um princípio simples: a substância raramente é o problema em si, é o sintoma
                de uma dor que ainda não encontrou espaço pra ser escutada.
              </p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                {[
                  { icon: GraduationCap, label: 'Psicanálise Integrativa' },
                  { icon: HeartHandshake, label: 'Dependência Química' },
                  { icon: Users, label: 'Atendimento a famílias' },
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

      {/* ── LISTA DE ESPERA (no lugar do investimento) ─ */}
      <Reveal>
        <section id="lista-de-espera" className="relative bg-[#0A1232] border-y border-white/5 overflow-hidden">
          <motion.div
            className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[36rem] rounded-full pointer-events-none blur-3xl"
            animate={{ opacity: [0.15, 0.28, 0.15] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'radial-gradient(circle, #FFB800, transparent 70%)' }}
          />
          <div className="relative max-w-3xl mx-auto px-6 sm:px-10 py-14 sm:py-16 text-center">
            <Eyebrow>Ainda não abriu</Eyebrow>
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-[1.08]"
            >
              <RevealWords text="Preço e formato saem em breve." />
            </h2>
            <p className="text-sm text-white/45 leading-relaxed mb-10 max-w-md mx-auto">
              O programa da Renata ainda está sendo desenhado. Quem entra na lista de espera é avisado em primeira
              mão assim que abrir — com condição especial de lançamento, antes de abrir pro público geral.
            </p>
            <button
              onClick={lead.abrir}
              className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] px-8 py-3.5 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-[#0D1638] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200"
              style={{ boxShadow: '0 16px 44px -10px rgba(255,184,0,0.5), 0 1px 0 rgba(255,255,255,0.4) inset' }}
            >
              Entrar na lista de espera
              <ArrowRight className="h-4 w-4" />
            </button>

            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center justify-center gap-2 text-xs text-white/35 hover:text-[#FFB800]/80 transition-colors"
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
            <RevealWords text="Você vai ser avisada" />
            <br />
            <RevealWords text="em primeira mão." />
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <button
              onClick={lead.abrir}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-[#FFC933] to-[#FFA800] px-8 py-4 text-base font-bold text-[#0D1638] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200"
              style={{ boxShadow: '0 12px 40px -8px rgba(255,184,0,0.45), 0 1px 0 rgba(255,255,255,0.4) inset' }}
            >
              Entrar na lista de espera
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
          <p className="text-xs font-mono text-white/25 tracking-wide">
            Condição de lançamento exclusiva pra quem entrar antes de abrir
          </p>
        </Reveal>
      </section>

      {/* pb extra no mobile pra nao ficar tampado pela StickyCTADependencia fixa no rodape */}
      <div className="pb-20 md:pb-0">
        <SiteFooter parceira="Renata Weigert" />
      </div>
    </>
  )
}
