'use client'

/**
 * Página institucional do Seu Numerólogo.
 *
 * Difere das formações: aqui o produto é ASSINATURA, não curso com começo e
 * fim. Por isso não tem módulo nem certificado -- tem o que entra todo mês
 * enquanto a pessoa for assinante, e o direito de cancelar quando quiser
 * (pedido explícito do Pedro).
 *
 * Preço: R$100/mês, lido do produto `mentoria-nps` (payment_type
 * subscription) na Área de Membros, conferido em 21/11/2026. O Mapa das 7
 * Esferas é a porta de entrada e tem domínio próprio
 * (mapa.seunumerologo.com.br) -- por isso o CTA de topo manda pra lá, e não
 * pro checkout.
 *
 * ATENÇÃO (sobreposição real): esta oferta é a mesma da página
 * /programas/mentoria-nps, com outra marca na frente. As duas no mesmo menu
 * competem entre si. Levantado pro Pedro em 21/11/2026 -- decidir se vira
 * marca única, se uma redireciona pra outra, ou se cada uma fala com um
 * público.
 */

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Check, ArrowRight, MessageCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const MAPA_URL = 'https://mapa.seunumerologo.com.br'
const WA_URL =
  'https://wa.me/5511919434040?text=Olá! Quero saber mais sobre a assinatura do Seu Numerólogo.'

const incluso = [
  'Encontros ao vivo todo mês, com análise de mapas reais',
  'Acesso à plataforma com as gravações e os materiais',
  'Mapas numerológicos pela ferramenta, enquanto a assinatura estiver ativa',
  'Grupo de acompanhamento com a turma e a equipe',
  'Conteúdos novos entrando no catálogo ao longo dos meses',
]

const esferas = [
  {
    n: '01',
    t: 'O que os números dizem',
    d: 'Número da alma, da imagem, de expressão e de destino — o que cada um revela e, principalmente, o que nenhum deles determina.',
  },
  {
    n: '02',
    t: 'Como se lê na prática',
    d: 'Cálculo correto, leitura do mapa inteiro e o erro mais comum: interpretar número isolado sem olhar o conjunto.',
  },
  {
    n: '03',
    t: 'Onde isso se aplica',
    d: 'Decisões, ciclos, ano pessoal, relações e trabalho. Numerologia como ferramenta de leitura, não como previsão de futuro.',
  },
]

const faqItems = [
  {
    q: 'O Mapa das 7 Esferas é gratuito mesmo?',
    a: 'Sim. Você preenche nome e data de nascimento e recebe o mapa na hora, sem pagar nada. É a porta de entrada — serve pra você ver se a numerologia faz sentido pra você antes de assinar qualquer coisa.',
  },
  {
    q: 'Preciso saber alguma coisa de numerologia pra assinar?',
    a: 'Não. Os encontros partem do zero e vão aprofundando. Quem já estuda acompanha pela análise de mapas reais; quem está começando acompanha pela base.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Pode, a qualquer momento, sem multa e sem fidelidade. Você mantém o acesso até o fim do período já pago.',
  },
  {
    q: 'Os encontros ficam gravados?',
    a: 'Ficam. Tudo fica na plataforma, junto com os materiais, pra você assistir depois no seu ritmo se não puder estar ao vivo.',
  },
  {
    q: 'Isso forma numerólogo profissional?',
    a: 'A assinatura é de estudo e acompanhamento contínuo, não uma formação certificante com percurso fechado. Se o seu objetivo é atuar profissionalmente, fale com a equipe — a recomendação depende de onde você está hoje.',
  },
  {
    q: 'Numerologia prevê o futuro?',
    a: 'Não, e aqui não é tratada assim. É uma ferramenta de leitura de padrões e ciclos, que ajuda a enxergar tendências e tomar decisão com mais clareza. Qualquer um que prometa previsão garantida está vendendo outra coisa.',
  },
]

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' as `${number}px` })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function BlocoOferta() {
  return (
    <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
      <p className="fds-eyebrow">Assinatura mensal</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="fds-h1" style={{ lineHeight: 1 }}>R$ 100</span>
        <span className="fds-small" style={{ paddingBottom: 4, color: 'var(--fds-ink-4)' }}>/mês</span>
      </div>
      <p className="fds-small mt-2">Sem fidelidade — cancele quando quiser</p>

      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="fds-btn fds-btn--primary mt-7 w-full"
        style={{ paddingBlock: 'var(--fds-4)' }}
      >
        Quero assinar
        <ArrowRight className="h-3.5 w-3.5" />
      </a>

      <a href={MAPA_URL} className="fds-btn fds-btn--ghost mt-3 w-full" style={{ paddingBlock: 'var(--fds-3)' }}>
        Antes, ver meu mapa grátis
      </a>

      <p className="text-center mt-4" style={{ fontSize: 'var(--fds-caption)', color: 'var(--fds-ink-3)' }}>
        Encontros ao vivo todo mês · gravações na plataforma
      </p>
    </div>
  )
}

export function NumerologoContent() {
  return (
    <div className="fds">
      {/* ── HERO + OFERTA ────────────────────────── */}
      <section className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
        <div className="fds-wrap">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            <p className="fds-eyebrow block">Instituto Despertamente · Numerologia Pitagórica Aplicada</p>
            <h1 className="fds-display mx-auto mt-4 max-w-4xl">
              Seu <span className="fds-accent">Numerólogo</span>
            </h1>
            <p className="fds-lead mx-auto mt-5 text-center">
              Comece pelo mapa gratuito. Se fizer sentido, siga no acompanhamento mensal —
              com encontros ao vivo, plataforma e grupo. Sem fidelidade.
            </p>
            <p className="fds-meta mt-5">mapa grátis · assinatura a partir de R$100/mês</p>
          </motion.div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
            <div>
              <hr className="fds-rule" style={{ width: 64 }} />
              <p className="fds-h3 mt-6" style={{ fontWeight: 400, color: 'var(--fds-ink-2)' }}>
                Numerologia não serve pra adivinhar o que vai acontecer.{' '}
                <span style={{ color: 'var(--fds-ink)' }}>
                  Serve pra enxergar o padrão que já está acontecendo há anos.
                </span>
              </p>
              <ul className="mt-8 space-y-3">
                {incluso.slice(0, 4).map(i => (
                  <li key={i} className="fds-small flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                    {i}
                  </li>
                ))}
              </ul>
            </div>

            <div id="assinar">
              <BlocoOferta />
            </div>
          </div>
        </div>
      </section>

      {/* ── PORTA DE ENTRADA: MAPA GRÁTIS ────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap">
          <Reveal>
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
              <div>
                <p className="fds-eyebrow block">Comece por aqui</p>
                <h2 className="fds-h2 mt-3">
                  Mapa das <span className="fds-accent">7 Esferas.</span>
                </h2>
                <p className="fds-body mt-5">
                  Nome e data de nascimento. O mapa sai na hora, de graça, e já mostra seus
                  números de alma, imagem, expressão e destino.
                </p>
                <a href={MAPA_URL} className="fds-btn fds-btn--primary mt-7">
                  Ver meu mapa agora
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <p className="fds-meta mt-4">não pede cartão</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                {esferas.map(e => (
                  <div key={e.n} style={{ borderTop: '1px solid var(--fds-line)', paddingTop: 'var(--fds-6)' }}>
                    <span className="fds-meta" style={{ color: 'var(--fds-accent)', opacity: 0.7 }}>{e.n}</span>
                    <p className="mt-2" style={{ fontSize: 'var(--fds-small)', fontWeight: 600, color: 'var(--fds-ink)' }}>
                      {e.t}
                    </p>
                    <p className="fds-small mt-3">{e.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── O QUE VEM NA ASSINATURA ──────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="fds-h2">
                  O que entra <span className="fds-accent">todo mês.</span>
                </h2>
                <p className="fds-body mt-5">
                  Assinatura é acompanhamento contínuo, não curso com data pra acabar. Enquanto
                  estiver ativa, tudo abaixo é seu.
                </p>
              </div>
              <ul className="fds-list">
                {incluso.map(i => <li key={i} className="fds-small">{i}</li>)}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap" style={{ maxWidth: 760 }}>
          <Reveal>
            <h2 className="fds-h2 mb-12">Dúvidas.</h2>
            <Accordion type="single" collapsible>
              <div>
                {faqItems.map((item, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-0"
                    style={{ borderTop: '1px solid var(--fds-line)' }}
                  >
                    <AccordionTrigger
                      className="py-5 text-left hover:no-underline"
                      style={{ fontSize: 'var(--fds-small)', fontWeight: 500, color: 'var(--fds-ink-2)' }}
                    >
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="fds-small pb-5">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
            <p className="fds-small mt-8">
              Outra dúvida?{' '}
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: 'var(--fds-ink-2)' }}
              >
                Fale com a equipe.
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-30)' }}>
        <div className="fds-wrap">
          <div className="grid gap-14 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-20">
            <Reveal>
              <h2 className="fds-h1">
                Veja o seu mapa primeiro. <span className="fds-accent">Decide depois.</span>
              </h2>
              <p className="fds-body mt-6">
                O mapa é gratuito e sai na hora. Se o que você ler ali fizer sentido, a assinatura
                está aqui — e você cancela quando quiser.
              </p>
              <p className="fds-meta mt-8 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" style={{ color: 'var(--fds-accent)' }} />
                sem fidelidade · cancele quando quiser
              </p>
            </Reveal>
            <Reveal>
              <BlocoOferta />
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  )
}
