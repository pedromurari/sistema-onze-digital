'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, MessageCircle, MapPin } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const WA_URL = 'https://wa.me/5511930439385?text=Olá! Quero saber mais sobre o IDM pelo Brasil.'

const diasPrograma = [
  {
    numero: '01',
    titulo: 'Mapeamento do Inconsciente',
    conteudo: [
      'O que são padrões inconscientes e como se formam',
      'Técnica de mapeamento de comportamentos automáticos',
      'Identificação dos principais pontos de travamento pessoal',
      'Introdução à escuta analítica — como ouvir o que não é dito',
    ],
  },
  {
    numero: '02',
    titulo: 'Técnicas Integrativas ao Vivo',
    conteudo: [
      'Regressão terapêutica guiada em grupo supervisionado',
      'Trabalho corporal: o corpo como mapa emocional',
      'Constelações familiares — dinâmica ao vivo',
      'Integração das experiências do dia anterior',
    ],
  },
  {
    numero: '03',
    titulo: 'PNL Aplicada',
    conteudo: [
      'Fundamentos de PNL para transformação de padrões',
      'Ancoragem: como criar novos estados mentais no corpo',
      'Ressignificação rápida — técnicas práticas ao vivo',
      'Como integrar PNL ao dia a dia imediatamente',
    ],
  },
  {
    numero: '04',
    titulo: 'Supervisão e Integração',
    conteudo: [
      'Revisão e consolidação dos quatro dias',
      'Sessão de supervisão em grupos pequenos',
      'Plano de aplicação individual — o que você faz na semana seguinte',
      'Emissão do certificado de conclusão',
    ],
  },
]

const incluso = [
  '4 dias de imersão presencial com o time IDM',
  'Materiais didáticos físicos',
  'Supervisão clínica em grupos (máx. 15 pessoas)',
  'Acesso à plataforma IDM Membros por 30 dias',
  'Certificado digital de conclusão',
  'Comunidade exclusiva de alunos IDM',
]

const cidades = [
  { cidade: 'São Paulo — SP', status: 'Em breve' },
  { cidade: 'Rio de Janeiro — RJ', status: 'Em breve' },
  { cidade: 'Belo Horizonte — MG', status: 'Em breve' },
  { cidade: 'Curitiba — PR', status: 'Em breve' },
]


const faqItems = [
  {
    q: 'Quando serão as próximas edições?',
    a: 'As próximas datas estão sendo definidas. Entre na lista de espera pelo WhatsApp — você será notificado quando as inscrições abrirem para sua cidade.',
  },
  {
    q: 'Em quais cidades vocês estarão?',
    a: 'O IDM pelo Brasil já passou por São Paulo, Rio de Janeiro, Belo Horizonte, Curitiba, Porto Alegre e Recife. Se sua cidade não está na lista, entre em contato — a demanda determina o calendário.',
  },
  {
    q: 'O certificado é o mesmo da formação online?',
    a: 'O workshop emite um certificado de conclusão do IDM pelo Brasil. É diferente da Formação completa em Psicanálise Integrativa, que exige o percurso completo. O workshop pode ser aproveitado como módulo prático dentro da formação.',
  },
  {
    q: 'Quanto custa? Tem parcelamento?',
    a: 'O investimento varia por cidade e data. Parcelamos em até 6x no cartão. Pix tem desconto à vista. Entre em contato pelo WhatsApp para saber o valor atual da sua região.',
  },
  {
    q: 'Posso levar acompanhante?',
    a: 'O workshop é individual. Mas é comum alunos virem com parceiros ou colegas — cada um com inscrição individual.',
  },
  {
    q: 'Há desconto para alunos já matriculados no IDM?',
    a: 'Sim. Alunos ativos da plataforma IDM Membros têm desconto no workshop. O código é enviado diretamente na plataforma.',
  },
  {
    q: 'Qual é a política de cancelamento?',
    a: 'Cancelamento até 15 dias antes: reembolso integral. Entre 15 e 7 dias: crédito para outra edição. Menos de 7 dias: sem reembolso (mas você pode transferir a vaga para outra pessoa).',
  },
]

export interface ProductData {
  price: number | null
  original_price: number | null
  highlights: string[] | null
  cta_label: string | null
  checkout_url: string | null
}

function Reveal({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' as `${number}px` })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function IdmBrasilContent({ product }: { product: ProductData | null }) {

  return (
    <div className="fds">
      {/* ── HERO ─────────────────────────────────── */}
      <section
        className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}
      >

        <div className="fds-wrap space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-7"
          >
            <p className="fds-eyebrow">
              Instituto Despertamente · Workshop presencial
            </p>
            <h1
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-[64px] sm:text-[80px] lg:text-[100px] font-bold leading-[0.97] text-[#f0f0f0] tracking-tight"
            >
              IDM pelo<br />Brasil.
            </h1>
            <div className="w-full max-w-3xl h-px bg-white/6" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="grid sm:grid-cols-[1fr_auto] gap-8 items-end max-w-3xl"
          >
            <p className="text-base text-[#4a4a4a] leading-relaxed max-w-md">
              Imersão presencial de Psicanálise Integrativa e PNL em cidades do Brasil. Aprenda ao vivo, com supervisão e certificação incluída.
            </p>
            <div className="flex flex-col items-start sm:items-end gap-3">
              <a
                href="#cidades"
                className="fds-btn fds-btn--primary group whitespace-nowrap"
              >
                Ver datas e cidades
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <p className="fds-meta">4 dias · Tour nacional · Vagas limitadas</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── MANIFESTO ────────────────────────────── */}
      <section className="fds-band">
        <Reveal className="fds-wrap fds-section" style={{ maxWidth: 680 }}>
          <p
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-2xl sm:text-3xl font-light leading-relaxed text-[#888888]"
          >
            Conteúdo online transforma. Mas{' '}
            <span className="text-[#c8c8c8]">
              a transformação mais profunda acontece ao vivo, com pessoas, com o corpo presente.
            </span>{' '}
            O IDM pelo Brasil foi criado para quem quer mais do que assistir aulas —{' '}
            quer viver o processo. Quatro dias intensivos. Uma cidade de cada vez.
          </p>
        </Reveal>
      </section>

      {/* ── OS 4 DIAS ────────────────────────────── */}
      <Reveal>
        <section className="fds-wrap fds-section">
          <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
            <h2
              className="fds-h2"
            >
              Os 4 dias.
            </h2>
            <p className="fds-meta pb-1">Jornada progressiva</p>
          </div>

          <Accordion type="single" collapsible defaultValue="01">
            <div className="divide-y divide-white/5">
              {diasPrograma.map((d) => (
                <AccordionItem key={d.numero} value={d.numero} className="border-0">
                  <AccordionTrigger className="hover:no-underline py-5 text-left group w-full">
                    <div className="flex items-center gap-5 w-full pr-4">
                      <span className="text-xs font-mono text-[#383838] w-5 shrink-0">{d.numero}</span>
                      <span className="text-sm font-medium text-[#c0c0c0] group-hover:text-[#f0f0f0] transition-colors flex-1">
                        {d.titulo}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pl-10">
                    <ul className="space-y-2">
                      {d.conteudo.map((c) => (
                        <li key={c} className="fds-small">{c}</li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </div>
          </Accordion>
        </section>
      </Reveal>

      {/* ── O QUE ESTÁ INCLUÍDO ───────────────────── */}
      <Reveal>
        <section className="fds-band">
          <div className="fds-wrap fds-section grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <h2
              className="fds-h2"
            >
              O que está<br />incluído.
            </h2>
            <ul className="divide-y divide-white/5">
              {incluso.map((item) => (
                <li key={item} className="py-4 text-sm text-[#505050] first:pt-0">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* ── PRÓXIMAS CIDADES ─────────────────────── */}
      <Reveal>
        <section id="cidades" className="fds-wrap fds-section">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                className="fds-h2"
              >
                Próximas<br />edições.
              </h2>
              <p className="fds-small">
                Datas sendo confirmadas. Entre na lista de espera para ter prioridade nas inscrições.
              </p>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#505050] hover:text-[#808080] transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Entrar na lista de espera
              </a>
            </div>
            <div className="divide-y divide-white/5">
              {cidades.map((c) => (
                <div key={c.cidade} className="py-5 flex items-center justify-between first:pt-0">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-3.5 w-3.5 text-[#383838] shrink-0" />
                    <p className="text-sm text-[#c0c0c0]">{c.cidade}</p>
                  </div>
                  <span className="text-xs font-mono text-[#383838]">{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <Reveal>
        <section className="fds-wrap fds-section">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                className="fds-h2"
              >
                Investimento.
              </h2>
              <p className="fds-small">
                O valor varia por cidade e data. Entre em contato para saber o valor da próxima edição na sua região.
              </p>
              <p className="fds-small">Pix com desconto · Parcelamento em até 6x · Desconto para alunos IDM</p>
            </div>
            <div className="space-y-5 pt-2">
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="fds-btn fds-btn--primary w-full"
              >
                <MessageCircle className="h-4 w-4" />
                Saber o valor da minha cidade
              </a>
              <p className="text-xs text-[#383838] text-center">Garantia de 7 dias · Política de cancelamento no FAQ abaixo</p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── FAQ ──────────────────────────────────── */}
      <Reveal>
        <section className="fds-band">
          <div className="fds-wrap fds-section" style={{ maxWidth: 760 }}>
            <h2
              className="fds-h2"
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
              Outras dúvidas?{' '}
              <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="text-[#555555] hover:text-[#888888] transition-colors underline underline-offset-2">
                Fale diretamente com a equipe.
              </a>
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section
        className="relative overflow-hidden py-32"
      >
        <Reveal className="relative max-w-3xl mx-auto px-6 sm:px-10 space-y-10">
          <h2
            className="fds-h1"
          >
            O IDM está<br />chegando até você.
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="fds-btn fds-btn--primary group"
            >
              <MessageCircle className="h-4 w-4" />
              Entrar na lista de espera
            </a>
            <Link
              href="/programas/psicanalise-integrativa"
              className="inline-flex items-center py-4 text-sm text-[#444444] hover:text-[#707070] transition-colors"
            >
              → Ver formação online
            </Link>
          </div>
          <p className="text-xs font-mono text-[#303030]">
            Vagas limitadas por cidade · Prioridade para lista de espera
          </p>
        </Reveal>
      </section>
    </div>
  )
}
