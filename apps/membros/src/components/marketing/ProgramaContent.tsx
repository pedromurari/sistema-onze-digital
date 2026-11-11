'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, MessageCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const WA_NUMBER = '5511919434040'

export interface ProductData {
  price: number | null
  original_price: number | null
  highlights: string[] | null
  cta_label: string | null
  checkout_url: string | null
  payment_type?: string | null
}

export interface ModuloPrograma {
  numero: string
  titulo: string
  carga?: string
  conteudo: string[]
}

export interface FaqPrograma {
  q: string
  a: string
}

// Modelo reaproveitável pras páginas de programa que não têm (ainda) o
// mesmo volume de conteúdo editorial da Psicanálise Integrativa (currículo
// de 7 módulos, fundador, depoimentos). Diferença deliberada: esta versão
// NÃO tem seção de depoimentos nem de fundador com citação — a tabela
// `testimonials` está vazia hoje (06/11/2026, conferido no banco), então
// qualquer depoimento nominal aqui seria inventado. Em vez disso, mostra a
// faixa de números reais (mesma da home) como prova social honesta.
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' as `${number}px` })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function PriceBlock({ product, waUrl }: { product: ProductData | null; waUrl: string }) {
  if (!product?.price) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-[#505050]">Vagas para a próxima turma em breve.</p>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-7 py-4 rounded-xl border border-[#25D366]/25 text-sm font-bold text-[#25D366] hover:bg-[#25D366]/6 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Entrar na lista de espera
        </a>
      </div>
    )
  }

  const checkoutUrl = product.checkout_url ?? '/loja'
  const isSubscription = product.payment_type === 'subscription'

  if (isSubscription) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/8 bg-[#0A1232] p-6 space-y-3 max-w-xs">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#404040]">Mensalidade</p>
          <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0] leading-none">
            R$ {product.price.toLocaleString('pt-BR')}<span className="text-base text-[#505050]">/mês</span>
          </p>
          <p className="text-[11px] text-[#404040]">Sem fidelidade — cancele quando quiser</p>
          <a
            href={checkoutUrl}
            className="mt-2 flex items-center justify-center py-3 rounded-xl bg-[#FFB800] text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
          >
            Começar agora
          </a>
        </div>
      </div>
    )
  }

  const parcelamento = Math.ceil(product.price / 12)
  const pixPrice = Math.floor(product.price * 0.9)

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
        <div className="rounded-2xl border border-white/8 bg-[#0A1232] p-6 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#404040]">Pix · à vista</p>
          {product.original_price && (
            <p className="text-xs text-[#383838] line-through">R$ {product.original_price.toLocaleString('pt-BR')}</p>
          )}
          <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0] leading-none">
            R$ {pixPrice.toLocaleString('pt-BR')}
          </p>
          <p className="text-[11px] text-[#404040]">10% de desconto</p>
          <a
            href={checkoutUrl}
            className="mt-2 flex items-center justify-center py-3 rounded-xl bg-[#FFB800] text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
          >
            Pagar com Pix
          </a>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#0A1232] p-6 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#404040]">Cartão · parcelado</p>
          <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0] leading-none">
            12×
          </p>
          <p className="text-sm text-[#505050]">R$ {parcelamento.toLocaleString('pt-BR')} por mês</p>
          <a
            href={checkoutUrl}
            className="mt-2 flex items-center justify-center py-3 rounded-xl border border-white/10 text-sm font-bold text-[#d0d0d0] hover:border-white/20 transition-colors"
          >
            Parcelar agora
          </a>
        </div>
      </div>
      <p className="text-xs text-[#383838]">Garantia de 7 dias. Se não fizer sentido, devolvemos tudo.</p>
    </div>
  )
}

export function ProgramaContent({
  product, waMessage, eyebrow, titulo, tagline, statsLine, manifesto, incluso, modulos, faqItems,
}: {
  product: ProductData | null
  waMessage: string
  eyebrow: string
  titulo: string[]
  tagline: string
  statsLine: string
  manifesto: ReactNode
  incluso: string[]
  modulos: ModuloPrograma[]
  faqItems: FaqPrograma[]
}) {
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMessage)}`
  const checkoutHref = product?.checkout_url ?? '#investimento'

  return (
    <>
      {/* ── HERO ─────────────────────────────────── */}
      <section
        className="relative min-h-[85vh] flex flex-col justify-end pb-20 pt-32 overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      >
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full bg-[#FFB800]/4 blur-[250px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 sm:px-10 w-full space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-7"
          >
            <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-[#404040]">{eyebrow}</p>
            <h1
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-[56px] sm:text-[72px] lg:text-[88px] font-bold leading-[0.97] text-[#f0f0f0] tracking-tight"
            >
              {titulo.map((linha, i) => <span key={i}>{linha}{i < titulo.length - 1 && <br />}</span>)}
            </h1>
            <div className="w-full max-w-3xl h-px bg-white/6" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="grid sm:grid-cols-[1fr_auto] gap-8 items-end max-w-3xl"
          >
            <p className="text-base text-[#4a4a4a] leading-relaxed max-w-md">{tagline}</p>
            <div className="flex flex-col items-start sm:items-end gap-3">
              <a
                href={checkoutHref}
                className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-7 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors whitespace-nowrap"
              >
                Quero começar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <p className="text-[11px] font-mono text-[#303030]">{statsLine}</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── MANIFESTO ────────────────────────────── */}
      <section className="bg-[#0d0d0d] border-y border-white/5">
        <Reveal className="max-w-2xl mx-auto px-6 sm:px-10 py-20">
          <p
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-2xl sm:text-3xl font-light leading-relaxed text-[#888888]"
          >
            {manifesto}
          </p>
        </Reveal>
      </section>

      {/* ── O QUE ESTÁ INCLUSO ───────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] mb-10"
          >
            O que está incluso.
          </h2>
          <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-5 max-w-3xl">
            {incluso.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="h-4 w-4 text-[#FFB800] mt-0.5 shrink-0" />
                <span className="text-sm text-[#b0b0b0] leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      {/* ── PROGRAMA ─────────────────────────────── */}
      <Reveal>
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
            <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                O conteúdo.
              </h2>
              <p className="text-xs font-mono text-[#383838] pb-1">{modulos.length} frentes</p>
            </div>

            <Accordion type="single" collapsible>
              <div className="divide-y divide-white/5">
                {modulos.map((m) => (
                  <AccordionItem key={m.numero} value={m.numero} className="border-0">
                    <AccordionTrigger className="hover:no-underline py-5 text-left group w-full">
                      <div className="flex items-center gap-5 w-full pr-4">
                        <span className="text-xs font-mono text-[#383838] w-5 shrink-0">{m.numero}</span>
                        <span className="text-sm font-medium text-[#c0c0c0] group-hover:text-[#f0f0f0] transition-colors flex-1">
                          {m.titulo}
                        </span>
                        {m.carga && <span className="hidden sm:block text-[11px] font-mono text-[#333333] shrink-0">{m.carga}</span>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pl-10">
                      <ul className="space-y-2">
                        {m.conteudo.map((c) => (
                          <li key={c} className="text-sm text-[#505050] leading-relaxed">{c}</li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
          </div>
        </section>
      </Reveal>

      {/* ── RESULTADOS (números reais, sem depoimento inventado) ── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
            {[
              { n: '12.000+', l: 'Pessoas impactadas pelo método' },
              { n: '9 anos', l: 'De metodologia própria' },
              { n: 'Nacional', l: 'Alunos em todo o Brasil' },
            ].map((item) => (
              <div key={item.l} className="text-center pt-8 sm:pt-0 first:pt-0 sm:px-10 first:pl-0 last:pr-0">
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0]">{item.n}</p>
                <p className="text-[#484848] text-xs mt-1.5 uppercase tracking-wide">{item.l}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <Reveal>
        <section id="investimento" className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20 grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                Investimento.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
                {eyebrow.includes('Mentoria') ? 'Acompanhamento contínuo, direto com a equipe do IDM.' : 'Formação completa, com certificação ao final.'}
              </p>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-[#383838] hover:text-[#606060] transition-colors"
              >
                <MessageCircle className="h-3 w-3" />
                Tirar dúvidas pelo WhatsApp
              </a>
            </div>
            <PriceBlock product={product} waUrl={waUrl} />
          </div>
        </section>
      </Reveal>

      {/* ── FAQ ──────────────────────────────────── */}
      <Reveal>
        <section className="max-w-3xl mx-auto px-6 sm:px-10 py-20">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] mb-10"
          >
            Dúvidas.
          </h2>
          <Accordion type="single" collapsible>
            <div className="divide-y divide-white/5">
              {faqItems.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-0">
                  <AccordionTrigger className="hover:no-underline py-5 text-left text-sm font-medium text-[#b0b0b0] hover:text-[#f0f0f0] transition-colors">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-[#505050] leading-relaxed pb-5">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </div>
          </Accordion>
          <p className="text-xs text-[#383838] mt-8">
            Ainda tem dúvida?{' '}
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="text-[#555555] hover:text-[#888888] transition-colors underline underline-offset-2">
              Fale diretamente com a equipe.
            </a>
          </p>
        </section>
      </Reveal>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="relative overflow-hidden py-32 bg-[#0d0d0d] border-t border-white/5">
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />
        <Reveal className="relative max-w-3xl mx-auto px-6 sm:px-10 space-y-10">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-[#f0f0f0] leading-[1.0]"
          >
            Comece quando<br />você decidir.
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href={checkoutHref}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-8 py-4 text-base font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
              style={{ boxShadow: '0 8px 32px rgba(255,184,0,0.22)' }}
            >
              Quero começar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-4 text-sm text-[#444444] hover:text-[#707070] transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
          <p className="text-xs font-mono text-[#303030]">{statsLine}</p>
        </Reveal>
      </section>
    </>
  )
}
