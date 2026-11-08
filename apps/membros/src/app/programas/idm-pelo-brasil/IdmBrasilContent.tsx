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

const WA_URL = 'https://wa.me/5511919434040?text=Olá! Quero saber mais sobre o IDM pelo Brasil.'

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

const depoimentos = [
  {
    featured: true,
    nome: 'Mariana C.',
    papel: 'Coach · Rio de Janeiro',
    texto: 'Já tinha feito cursos online de PNL e psicanálise. O IDM pelo Brasil foi diferente de tudo. Em 4 dias ao vivo aconteceu mais do que em 6 meses de conteúdo gravado.',
  },
  {
    nome: 'Thiago R.',
    papel: 'Terapeuta · Curitiba',
    texto: 'A constelação familiar ao vivo foi transformadora. Não tem como substituir a experiência presencial.',
  },
  {
    nome: 'Andressa M.',
    papel: 'Facilitadora · Porto Alegre',
    texto: 'Finalmente o IDM chegou aqui. Valeu cada centavo e cada hora dos 4 dias.',
  },
  {
    nome: 'Fábio L.',
    papel: 'Psicólogo · Belo Horizonte',
    texto: 'O rigor do método IDM no presencial superou minhas expectativas. Saí com um plano claro de aplicação.',
  },
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

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
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

export function IdmBrasilContent({ product }: { product: ProductData | null }) {
  const featuredDepo = depoimentos.find(d => d.featured) ?? depoimentos[0]
  const otherDepos = depoimentos.filter(d => !d.featured).slice(0, 3)

  return (
    <>
      {/* ── HERO ─────────────────────────────────── */}
      <section
        className="relative min-h-screen flex flex-col justify-end pb-20 pt-32 overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      >
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full bg-[#FFB800]/4 blur-[250px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 sm:px-10 w-full space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-7"
          >
            <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-[#404040]">
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
                className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-7 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors whitespace-nowrap"
              >
                Ver datas e cidades
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <p className="text-[11px] font-mono text-[#303030]">4 dias · Tour nacional · Vagas limitadas</p>
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
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
            >
              Os 4 dias.
            </h2>
            <p className="text-xs font-mono text-[#383838] pb-1">Jornada progressiva</p>
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
                        <li key={c} className="text-sm text-[#505050] leading-relaxed">{c}</li>
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
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20 grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] leading-tight"
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
        <section id="cidades" className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                Próximas<br />edições.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
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

      {/* ── DEPOIMENTOS ──────────────────────────── */}
      <Reveal>
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
            <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
              <div className="space-y-6">
                <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="block text-[80px] leading-none text-[#FFB800]/8 select-none -mb-6">
                  "
                </span>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-xl sm:text-2xl text-[#888888] leading-relaxed font-light italic">
                  {featuredDepo.texto}
                </p>
                <div>
                  <p className="text-sm font-semibold text-[#d0d0d0]">{featuredDepo.nome}</p>
                  <p className="text-xs text-[#404040] mt-0.5">{featuredDepo.papel}</p>
                </div>
              </div>

              <div className="divide-y divide-white/5">
                {otherDepos.map((d, i) => (
                  <div key={i} className="py-6 space-y-3 first:pt-0">
                    <p className="text-sm text-[#484848] leading-relaxed italic">"{d.texto}"</p>
                    <div>
                      <p className="text-xs font-semibold text-[#808080]">{d.nome}</p>
                      <p className="text-[11px] text-[#383838] mt-0.5">{d.papel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                Investimento.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
                O valor varia por cidade e data. Entre em contato para saber o valor da próxima edição na sua região.
              </p>
              <p className="text-xs text-[#383838]">Pix com desconto · Parcelamento em até 6x · Desconto para alunos IDM</p>
            </div>
            <div className="space-y-5 pt-2">
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 py-4 rounded-xl bg-[#FFB800] text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
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
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-3xl mx-auto px-6 sm:px-10 py-20">
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
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      >
        <Reveal className="relative max-w-3xl mx-auto px-6 sm:px-10 space-y-10">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-[#f0f0f0] leading-[1.0]"
          >
            O IDM está<br />chegando até você.
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-8 py-4 text-base font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
              style={{ boxShadow: '0 8px 32px rgba(255,184,0,0.22)' }}
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
    </>
  )
}
