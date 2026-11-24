'use client'

import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'
import { useRef, type ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, MessageCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const WA_NUMBER = '5511930439385'

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

/**
 * Modelo reaproveitável das páginas de programa (Mentoria NPS, Mentoria NPA,
 * Practitioner em PNL).
 *
 * ESTRUTURA (21/11/2026): mesma da página do Despertar Sistêmico -- oferta e
 * CTA dentro do hero, acima da dobra, em vez de só lá embaixo na seção de
 * investimento. Quem chega de anúncio decide nos primeiros segundos; obrigar
 * a rolar a página inteira pra descobrir o preço custa venda.
 *
 * VISUAL: design system em `src/app/design-system.css` (carregado no layout).
 * Nenhuma cor fica fixa aqui -- trocar a paleta do site é editar aquele
 * arquivo. Regra do destaque: dourado só no botão primário, em 2-3 palavras
 * do título e em ícones pequenos.
 *
 * Diferença deliberada pra página da Psicanálise: esta versão NÃO tem seção
 * de depoimentos nem de fundador com citação -- a tabela `testimonials` está
 * vazia (conferido em 06/11/2026), então qualquer depoimento nominal aqui
 * seria inventado. No lugar, a faixa de números reais (a mesma da home).
 */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
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

/** Turma ainda fechada: a página mostra a previsão e capta lista de espera. */
export type ProximaTurma = {
  previsao: string
  detalhe?: string
  /** Slug aceito por /api/lista-espera; é o que separa a lista de cada produto. */
  listaEspera: string
}

function PriceBlock({
  product, waUrl, proximaTurma,
}: { product: ProductData | null; waUrl: string; proximaTurma?: ProximaTurma }) {
  // Turma fechada manda sobre o preço: sem turma aberta não existe checkout,
  // mesmo que o produto tenha preço cadastrado.
  if (proximaTurma) {
    return (
      <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
        <p className="fds-eyebrow">Próxima turma</p>
        <p className="fds-small mt-3" style={{ color: 'var(--fds-ink-3)' }}>Previsão de início</p>
        <p className="fds-h2 mt-1" style={{ lineHeight: 1.1 }}>{proximaTurma.previsao}</p>
        {proximaTurma.detalhe && <p className="fds-small mt-3">{proximaTurma.detalhe}</p>}
        {/* Grava a pessoa no CRM como base (canal "Lista de espera — X")
            antes de abrir o WhatsApp: é dessa lista que sai o disparo
            quando a turma abrir. */}
        <LeadWhatsappCta
          texto="Entrar na lista de espera"
          className="mt-7 w-full"
          style={{ paddingBlock: 'var(--fds-4)' }}
          endpoint="/api/lista-espera"
          corpoExtra={{ produto: proximaTurma.listaEspera }}
          whatsappUrl={waUrl}
          eyebrow="Lista de espera"
          titulo="Te avisamos primeiro"
          descricao="Deixe seu nome e WhatsApp: você é avisado antes de todo mundo quando a turma abrir e garante condição especial."
          textoBotao="Entrar na lista"
        />
        <p className="fds-small mt-4 text-center">Quem está na lista é avisado antes e garante condição especial.</p>
      </div>
    )
  }

  if (!product?.price) {
    return (
      <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
        <p className="fds-eyebrow">Próxima turma</p>
        <p className="fds-body mt-3">Vagas para a próxima turma em breve.</p>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fds-btn fds-btn--ghost mt-6 w-full"
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
      <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
        <p className="fds-eyebrow">Mensalidade</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="fds-h1" style={{ lineHeight: 1 }}>
            R$ {product.price.toLocaleString('pt-BR')}
          </span>
          <span className="fds-small" style={{ paddingBottom: 4, color: 'var(--fds-ink-4)' }}>/mês</span>
        </div>
        <p className="fds-small mt-2">Assinatura mensal: pagou, tem acesso a tudo; parou de pagar, o acesso é suspenso. Sem fidelidade.</p>
        <a href={checkoutUrl} className="fds-btn fds-btn--primary mt-7 w-full" style={{ paddingBlock: 'var(--fds-4)' }}>
          {product.cta_label ?? 'Começar agora'}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2"
          style={{ fontSize: 'var(--fds-small)', color: 'var(--fds-ink-3)' }}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Prefiro tirar uma dúvida antes
        </a>
      </div>
    )
  }

  const parcelamento = Math.ceil(product.price / 12)
  const pixPrice = Math.floor(product.price * 0.9)

  return (
    <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
      <p className="fds-eyebrow">Investimento</p>

      {product.original_price && (
        <p className="fds-small mt-3" style={{ textDecoration: 'line-through', color: 'var(--fds-ink-4)' }}>
          R$ {product.original_price.toLocaleString('pt-BR')}
        </p>
      )}

      <div className="mt-2 flex items-end gap-3">
        <span className="fds-h1" style={{ lineHeight: 1 }}>R$ {pixPrice.toLocaleString('pt-BR')}</span>
        <span className="fds-small" style={{ paddingBottom: 4, color: 'var(--fds-ink-4)' }}>à vista no Pix</span>
      </div>
      <p className="fds-small mt-2">
        ou até <span style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>12x de R$ {parcelamento.toLocaleString('pt-BR')}</span> no cartão
      </p>

      <a href={checkoutUrl} className="fds-btn fds-btn--primary mt-7 w-full" style={{ paddingBlock: 'var(--fds-4)' }}>
        {product.cta_label ?? 'Garantir minha vaga'}
        <ArrowRight className="h-3.5 w-3.5" />
      </a>

      <p className="text-center mt-4" style={{ fontSize: 'var(--fds-caption)', color: 'var(--fds-ink-3)' }}>
        Garantia de 7 dias · Pix ou cartão
      </p>

      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2"
        style={{ fontSize: 'var(--fds-small)', color: 'var(--fds-ink-3)' }}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Prefiro tirar uma dúvida antes
      </a>
    </div>
  )
}

export function ProgramaContent({
  product, waMessage, eyebrow, titulo, tagline, statsLine, manifesto, incluso, modulos, faqItems, proximaTurma,
}: {
  product: ProductData | null
  proximaTurma?: ProximaTurma
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
            <p className="fds-eyebrow block">{eyebrow}</p>
            <h1 className="fds-display mx-auto mt-4 max-w-4xl">
              {titulo.map((linha, i) => (
                <span key={i} className={i === titulo.length - 1 && titulo.length > 1 ? 'fds-accent' : undefined}>
                  {linha}
                  {i < titulo.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="fds-lead mx-auto mt-5 text-center">{tagline}</p>
            <p className="fds-meta mt-5">{statsLine}</p>
          </motion.div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
            <div>
              <hr className="fds-rule" style={{ width: 64 }} />
              <p className="fds-h3 mt-6" style={{ fontWeight: 400, color: 'var(--fds-ink-2)' }}>
                {manifesto}
              </p>
              {incluso.length > 0 && (
                <ul className="mt-8 space-y-3">
                  {incluso.slice(0, 4).map(item => (
                    <li key={item} className="fds-small flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div id="investimento">
              <PriceBlock product={product} waUrl={waUrl} proximaTurma={proximaTurma} />
            </div>
          </div>
        </div>
      </section>

      {/* ── O QUE ESTÁ INCLUSO ───────────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap">
          <Reveal>
            <h2 className="fds-h2">
              O que está <span className="fds-accent">incluso.</span>
            </h2>
            <ul className="mt-12 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {incluso.map(item => (
                <li key={item} className="fds-small flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)', opacity: 0.6 }} />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── CONTEÚDO ─────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap" style={{ maxWidth: 880 }}>
          <Reveal>
            <div className="mb-12 flex items-end justify-between gap-4">
              <h2 className="fds-h2">O conteúdo.</h2>
              <p className="fds-meta pb-1 whitespace-nowrap">{modulos.length} frentes</p>
            </div>

            <Accordion type="single" collapsible>
              <div>
                {modulos.map(m => (
                  <AccordionItem
                    key={m.numero}
                    value={m.numero}
                    className="border-0"
                    style={{ borderTop: '1px solid var(--fds-line)' }}
                  >
                    <AccordionTrigger className="group w-full py-5 text-left hover:no-underline">
                      <div className="flex w-full items-center gap-5 pr-4">
                        <span className="fds-meta w-5 shrink-0">{m.numero}</span>
                        <span
                          className="flex-1"
                          style={{ fontSize: 'var(--fds-small)', fontWeight: 500, color: 'var(--fds-ink-2)' }}
                        >
                          {m.titulo}
                        </span>
                        {m.carga && <span className="fds-meta hidden shrink-0 sm:block">{m.carga}</span>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pl-10">
                      <ul className="space-y-2">
                        {m.conteudo.map(c => (
                          <li key={c} className="fds-small">{c}</li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── NÚMEROS REAIS ────────────────────────── */}
      <section className="fds-band" style={{ paddingBlock: 'var(--fds-16)' }}>
        <div className="fds-wrap">
          <Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3">
              {[
                { n: '12.000+', l: 'Pessoas impactadas pelo método' },
                { n: '20 anos', l: 'De experiência' },
                { n: 'Nacional', l: 'Alunos em todo o Brasil' },
              ].map((item, i) => (
                <div
                  key={item.l}
                  className="py-8 text-center sm:px-10 sm:py-0"
                  style={i > 0 ? { borderTop: '1px solid var(--fds-line)' } : undefined}
                >
                  <p className="fds-h3" style={{ fontSize: '2.25rem' }}>{item.n}</p>
                  <p className="fds-meta mt-2">{item.l}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="fds-section">
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
              Ainda tem dúvida?{' '}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: 'var(--fds-ink-2)' }}
              >
                Fale diretamente com a equipe.
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
                Comece quando <span className="fds-accent">você decidir.</span>
              </h2>
              <p className="fds-body mt-6">{tagline}</p>
              <p className="fds-meta mt-8 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" style={{ color: 'var(--fds-accent)' }} />
                {statsLine}
              </p>
            </Reveal>
            <Reveal>
              <PriceBlock product={product} waUrl={waUrl} proximaTurma={proximaTurma} />
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  )
}
