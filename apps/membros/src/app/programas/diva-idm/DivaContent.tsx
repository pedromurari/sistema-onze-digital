'use client'

import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'
/**
 * Página institucional do Divã IDM.
 *
 * Difere das páginas de formação: aqui não se vende curso, se vende SESSÃO.
 * Por isso não tem módulo, nem certificado, nem formulário de matrícula -- o
 * CTA manda pro fluxo que já existe e funciona (sistema.idmpsi.com.br/diva),
 * onde a pessoa escolhe terapeuta e horário.
 *
 * Preços vêm da tabela `diva_planos` do CRM (conferidos em 21/11/2026):
 * 1 sessão R$80 · 2 R$160 · 3 R$210 · 4 R$280 · 5 R$350. O "a partir de R$70"
 * é o pacote de 5 dividido por sessão -- é verdade, não é arredondamento pra
 * baixo inventado.
 *
 * Sem depoimentos: `diva_config.depoimentos` está vazio (conferido no banco).
 * Qualquer depoimento aqui seria inventado, e em página de saúde mental isso
 * é especialmente grave.
 */

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

// A grade de terapeutas fica nesta mesma página e já registra o lead com o
// terapeuta escolhido; não tem por que mandar a pessoa pra outro site.
const AGENDAR_URL = '#terapeutas'
const WA_URL =
  'https://wa.me/5511930439385?text=Olá! Quero saber mais sobre o Divã IDM (terapia).'

const planos = [
  { nome: '1 sessão', sessoes: 'avulsa', valor: 80, porSessao: 80 },
  { nome: '2 sessões', sessoes: 'avulsas', valor: 160, porSessao: 80 },
  { nome: '3 sessões', sessoes: 'pacote', valor: 210, porSessao: 70 },
  { nome: '4 sessões', sessoes: 'pacote', valor: 280, porSessao: 70 },
  { nome: '5 sessões', sessoes: 'pacote', valor: 350, porSessao: 70 },
]

const comoFunciona = [
  {
    n: '01',
    t: 'Você escolhe',
    d: 'Vê os horários disponíveis dos terapeutas e escolhe o que cabe na sua rotina. Sem fila de espera.',
  },
  {
    n: '02',
    t: 'Agenda e paga',
    d: 'Sessão avulsa ou pacote, no Pix ou cartão. O link da sala chega no seu WhatsApp.',
  },
  {
    n: '03',
    t: 'Atendimento online',
    d: 'Sessão por vídeo, do lugar onde você se sentir à vontade. Sem deslocamento.',
  },
]

const paraQuem = [
  'Quem quer começar terapia e trava no preço',
  'Quem já tentou pelo plano de saúde e esbarrou na fila',
  'Quem precisa de horário fora do comercial',
  'Quem mora longe de centro urbano e não acha atendimento perto',
  'Quem prefere atendimento online, sem deslocamento',
]

const faqItems = [
  {
    q: 'Por que é mais barato que uma sessão comum?',
    a: 'Porque os terapeutas são psicanalistas formados pelo Instituto Despertamente, em início ou consolidação de carreira clínica, com supervisão do Instituto. O valor menor vem do momento de carreira deles, não de sessão mais curta ou de atendimento reduzido.',
  },
  {
    q: 'Quem são os terapeutas?',
    a: 'Psicanalistas formados na metodologia do Instituto Despertamente, que concluíram a formação e seguem vinculados ao Instituto. Você vê o perfil de cada um antes de escolher.',
  },
  {
    q: 'Posso escolher e trocar de terapeuta?',
    a: 'Pode. Você escolhe quem atende você e, se não houver sintonia, pode trocar — vínculo terapêutico depende de encaixe, e isso não é falha de ninguém.',
  },
  {
    q: 'Como funciona o pacote?',
    a: 'No pacote, o valor por sessão cai de R$80 para R$70. As sessões são agendadas conforme a sua disponibilidade e a do terapeuta, no ritmo combinado entre vocês.',
  },
  {
    q: 'E se eu não souber o que falar na primeira sessão?',
    a: 'Ninguém sabe, e tudo bem. A primeira sessão existe pra isso: você chega com o que estiver na cabeça e quem conduz é o psicanalista. Não precisa ter um problema definido nem saber explicar direito.',
  },
  {
    q: 'A sessão é online ou presencial?',
    a: 'Online, por vídeo. É o que permite manter o valor acessível e atender pessoas de qualquer lugar do país.',
  },
  {
    q: 'É terapia de verdade ou é aconselhamento?',
    a: 'É atendimento psicanalítico conduzido por profissional formado, com supervisão. Não é aconselhamento, não é coaching e não substitui acompanhamento psiquiátrico quando ele é necessário — nesses casos, o próprio terapeuta orienta o encaminhamento.',
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
      <p className="fds-eyebrow">Sessão online</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="fds-h1" style={{ lineHeight: 1 }}>R$ 80</span>
        <span className="fds-small" style={{ paddingBottom: 4, color: 'var(--fds-ink-4)' }}>avulsa</span>
      </div>
      <p className="fds-small mt-2">
        ou <span style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>R$ 70 por sessão</span> no pacote
      </p>

      <a
        href={AGENDAR_URL}
        className="fds-btn fds-btn--primary mt-7 w-full"
        style={{ paddingBlock: 'var(--fds-4)' }}
      >
        Ver horários disponíveis
        <ArrowRight className="h-3.5 w-3.5" />
      </a>

      <p className="text-center mt-4" style={{ fontSize: 'var(--fds-caption)', color: 'var(--fds-ink-3)' }}>
        Pix ou cartão · você escolhe o terapeuta
      </p>

      {/* Até a dúvida vira lead no funil do Divã antes de abrir o WhatsApp. */}
      <LeadWhatsappCta
        texto="Prefiro tirar uma dúvida antes"
        variante="ghost"
        className="mt-3 w-full"
        endpoint="/api/diva-lead"
        whatsappUrl={WA_URL}
        eyebrow="Divã IDM"
        titulo="Tire sua dúvida"
        descricao="Deixe seu nome e WhatsApp: a gente responde por lá, sem compromisso."
        textoBotao="Falar com a equipe"
      />
    </div>
  )
}

export function DivaContent({ terapeutas }: { terapeutas?: React.ReactNode } = {}) {
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
            <p className="fds-eyebrow block">Instituto Despertamente · Terapia acessível</p>
            <h1 className="fds-display mx-auto mt-4 max-w-4xl">
              Divã <span className="fds-accent">IDM</span>
            </h1>
            <p className="fds-lead mx-auto mt-5 text-center">
              Sessões de psicanálise online com terapeutas formados no método do Instituto.
              Sem fila de espera, sem plano de saúde, sem sair de casa.
            </p>
            <p className="fds-meta mt-5">a partir de R$70 por sessão · 100% online</p>
          </motion.div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
            <div>
              <hr className="fds-rule" style={{ width: 64 }} />
              <p className="fds-h3 mt-6" style={{ fontWeight: 400, color: 'var(--fds-ink-2)' }}>
                Terapia deixou de ser cara por acaso.{' '}
                <span style={{ color: 'var(--fds-ink)' }}>
                  O Divã existe pra tirar o preço da frente de quem precisa começar.
                </span>
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Psicanalistas formados pelo Instituto, com supervisão',
                  'Você escolhe o terapeuta e o horário',
                  'Atendimento por vídeo, de qualquer lugar do país',
                  'Avulsa ou pacote — sem fidelidade e sem mensalidade',
                ].map(i => (
                  <li key={i} className="fds-small flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                    {i}
                  </li>
                ))}
              </ul>
            </div>

            <div id="agendar">
              <BlocoOferta />
            </div>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">Como funciona</p>
            <h2 className="fds-h2 mt-3 max-w-2xl">
              Do primeiro clique <span className="fds-accent">à primeira sessão.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-px md:grid-cols-3" style={{ background: 'var(--fds-line)' }}>
            {comoFunciona.map(c => (
              <Reveal key={c.n}>
                <div className="h-full" style={{ background: 'var(--fds-surface)', padding: 'var(--fds-8)' }}>
                  <span className="fds-meta" style={{ color: 'var(--fds-accent)', opacity: 0.7 }}>{c.n}</span>
                  <h3 className="fds-h3 mt-3" style={{ fontSize: '1.375rem' }}>{c.t}</h3>
                  <p className="fds-small mt-4">{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {terapeutas}

      {/* ── PLANOS ───────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap" style={{ maxWidth: 880 }}>
          <Reveal>
            <div className="mb-12 flex items-end justify-between gap-4">
              <h2 className="fds-h2">Valores.</h2>
              <p className="fds-meta pb-1 whitespace-nowrap">sem mensalidade</p>
            </div>

            <div>
              {planos.map(p => (
                <div
                  key={p.nome}
                  className="flex items-baseline justify-between gap-4 py-5"
                  style={{ borderTop: '1px solid var(--fds-line)' }}
                >
                  <div>
                    <p style={{ fontSize: 'var(--fds-body)', fontWeight: 500, color: 'var(--fds-ink)' }}>
                      {p.nome}
                    </p>
                    <p className="fds-meta mt-1">{p.sessoes}</p>
                  </div>
                  <div className="text-right">
                    <p style={{ fontSize: 'var(--fds-body-lg)', fontWeight: 600, color: 'var(--fds-ink)' }}>
                      R$ {p.valor}
                    </p>
                    <p className="fds-meta mt-1">R$ {p.porSessao} por sessão</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="fds-small mt-8">
              A partir de 3 sessões o valor por sessão cai de R$80 para R$70. As sessões do pacote
              são agendadas no ritmo combinado entre você e o terapeuta.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── PARA QUEM ────────────────────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap">
          <Reveal>
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="fds-h2" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }}>
                  Para quem é.
                </h2>
                <ul className="fds-list mt-8">
                  {paraQuem.map(i => <li key={i} className="fds-small">{i}</li>)}
                </ul>
              </div>
              <div>
                <h2 className="fds-h2" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }}>
                  Quem atende.
                </h2>
                <p className="fds-body mt-8">
                  Psicanalistas formados na metodologia do Instituto Despertamente, que concluíram
                  a formação e seguem vinculados ao Instituto, com supervisão.
                </p>
                <p className="fds-body mt-4">
                  O valor acessível vem do momento de carreira deles — não de sessão mais curta,
                  nem de atendimento reduzido. Você vê o perfil de cada um antes de escolher.
                </p>
              </div>
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
          </Reveal>
        </div>
      </section>

      {/* ── AVISO DE EMERGÊNCIA ──────────────────────
          Página de terapia sem isso é irresponsável: quem chega aqui em
          crise precisa saber na hora onde buscar ajuda imediata. */}
      <section className="fds-wrap" style={{ paddingBottom: 'var(--fds-16)' }}>
        <div className="fds-card" style={{ padding: 'var(--fds-6)', maxWidth: 860 }}>
          <p className="fds-small" style={{ maxWidth: 'none' }}>
            O Divã IDM é atendimento psicanalítico com supervisão e não substitui acompanhamento médico ou
            psiquiátrico. Em situação de emergência, ligue para o CVV no <strong style={{ color: 'var(--fds-ink)' }}>188</strong> (24 horas,
            gratuito) ou procure um serviço de saúde.
          </p>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-30)' }}>
        <div className="fds-wrap">
          <div className="grid gap-14 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-20">
            <Reveal>
              <h2 className="fds-h1">
                Começar terapia não precisa <span className="fds-accent">esperar sobrar dinheiro.</span>
              </h2>
              <p className="fds-body mt-6">
                Uma sessão avulsa custa menos que um jantar fora. E não exige plano, indicação
                nem lista de espera — é escolher o horário e começar.
              </p>
              <p className="fds-meta mt-8 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" style={{ color: 'var(--fds-accent)' }} />
                100% online · você escolhe o terapeuta
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
