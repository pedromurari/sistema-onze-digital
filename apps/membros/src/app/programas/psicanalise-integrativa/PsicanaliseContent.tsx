'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, MessageCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const WA_URL = 'https://wa.me/5511919434040?text=Olá! Tenho interesse na Formação em Psicanálise Integrativa.'

const modulos = [
  {
    numero: '01',
    titulo: 'Fundamentos da Psicanálise',
    carga: '8 semanas',
    conteudo: [
      'Freud, Jung e Lacan: estruturas do inconsciente',
      'Transferência, contratransferência e mecanismos de defesa',
      'Interpretação de sonhos aplicada à prática',
      'Formação do sujeito e constituição do sintoma',
    ],
  },
  {
    numero: '02',
    titulo: 'Análise Pessoal',
    carga: 'Processo individual',
    conteudo: [
      'Sessões de análise pessoal incluídas na formação',
      'Mapeamento dos próprios padrões e pontos cegos',
      'Desenvolvimento da escuta analítica a partir da experiência',
      'O tripé clássico: teoria, análise e supervisão',
    ],
  },
  {
    numero: '03',
    titulo: 'Técnicas Integrativas',
    carga: '10 semanas',
    conteudo: [
      'Regressão terapêutica: origens e aplicação segura',
      'Abordagem somática: o corpo como mapa emocional',
      'Constelações Familiares sistêmicas',
      'Integração de diferentes abordagens em um mesmo percurso clínico',
    ],
  },
  {
    numero: '04',
    titulo: 'Neurociência Aplicada',
    carga: '6 semanas',
    conteudo: [
      'Como o cérebro cria e mantém padrões automáticos',
      'Neuroplasticidade: o que é e como se aplica clinicamente',
      'Trauma, memória e reprogramação neural',
      'Conexão entre emoções, corpo e comportamento',
    ],
  },
  {
    numero: '05',
    titulo: 'PNL na Prática Clínica',
    carga: '8 semanas',
    conteudo: [
      'Fundamentos da Programação Neurolinguística',
      'Técnicas de ressignificação rápida',
      'Ancoragem e mudança de estado',
      'Integração da PNL à escuta psicanalítica',
    ],
  },
  {
    numero: '06',
    titulo: 'Supervisão e Prática Clínica',
    carga: 'Processo contínuo',
    conteudo: [
      'Supervisão de casos reais com profissionais certificados',
      'Grupos de estudo supervisionados',
      'Desenvolvimento da identidade como psicanalista',
      'Ética profissional e limites da atuação',
    ],
  },
  {
    numero: '07',
    titulo: 'Certificação',
    carga: 'Etapa final',
    conteudo: [
      'Avaliação integrativa — teoria e prática',
      'Apresentação de caso clínico supervisionado',
      'Emissão do certificado reconhecido pela ICF e ABNLP',
      'Credencial digital + versão física por demanda',
    ],
  },
]

const passos = [
  { titulo: 'Inscrição', desc: 'Você garante sua vaga, define a forma de pagamento e recebe acesso imediato à plataforma.' },
  { titulo: 'Semana de imersão', desc: 'Primeira semana intensiva: você entende o método e inicia sua análise pessoal.' },
  { titulo: 'Formação progressiva', desc: 'Semana a semana — teoria, prática e supervisão. Sem sobrecarregar, sem ser superficial.' },
  { titulo: 'Certificação', desc: 'Avaliação final, supervisão do caso clínico e emissão da credencial ICF/ABNLP.' },
]

const depoimentos = [
  {
    featured: true,
    nome: 'Luciana P.',
    papel: 'Psicóloga Clínica · São Paulo',
    texto: 'Já tinha graduação em Psicologia e me sentia limitada pelos modelos que conhecia. A Psicanálise Integrativa do IDM abriu um nível de compreensão que eu não tinha. Meus atendimentos mudaram completamente.',
  },
  {
    nome: 'Rafael M.',
    papel: 'Coach Executivo · Belo Horizonte',
    texto: 'Minha prática ficou muito mais profunda. Entendo agora o que está por trás das resistências dos meus clientes.',
  },
  {
    nome: 'Carla S.',
    papel: 'Terapeuta Holística · Porto Alegre',
    texto: 'A análise pessoal incluída foi o que mais me transformou. Não é só um curso. É um processo.',
  },
  {
    nome: 'Eduardo T.',
    papel: 'Professor e Facilitador · Curitiba',
    texto: 'O rigor teórico aliado à supervisão clínica é o que diferencia essa formação de qualquer outro curso online.',
  },
]

const faqItems = [
  {
    q: 'Esse certificado me permite clinicar como psicanalista?',
    a: 'O certificado habilita você a atuar como psicanalista integrativo — sessões de escuta, análise de padrões e trabalho com o inconsciente. Para o exercício regulamentado pelo CFP/CRP, a formação complementa a graduação em Psicologia.',
  },
  {
    q: 'Preciso ter formação em Psicologia antes?',
    a: 'Não. A formação foi desenhada tanto para profissionais de saúde quanto para pessoas sem formação anterior. O programa parte do zero e constrói uma base progressivamente.',
  },
  {
    q: 'Como funciona a análise pessoal incluída?',
    a: 'Você recebe sessões de análise pessoal como parte da formação. Acontece com um analista certificado do IDM, de forma individual. É um requisito formativo — a mesma tradição do tripé psicanalítico clássico.',
  },
  {
    q: 'O certificado é reconhecido pelo MEC?',
    a: 'A Psicanálise não é regulamentada pelo MEC no Brasil. Nosso certificado é reconhecido pela ICF e pela ABNLP — os maiores organismos internacionais da área.',
  },
  {
    q: 'Quantas horas por semana preciso dedicar?',
    a: 'De 6 a 8 horas por semana — entre aulas, supervisão e análise pessoal. É um percurso que demanda comprometimento, não apenas consumo de conteúdo.',
  },
  {
    q: 'As aulas ao vivo são obrigatórias?',
    a: 'As aulas são gravadas e ficam disponíveis na plataforma. A supervisão em grupo tem horários fixos — esses requerem presença ou justificativa prévia.',
  },
  {
    q: 'Tem garantia de reembolso?',
    a: 'Garantia total de 7 dias. Se nos primeiros 7 dias você sentir que não é para você, devolvemos 100% do investimento.',
  },
  {
    q: 'Aceita parcelamento? Tem desconto no Pix?',
    a: 'Parcelamos em até 12x no cartão sem juros. Pagamento via Pix tem desconto especial. Ambas as opções aparecem no checkout.',
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

function PriceBlock({ product }: { product: ProductData | null }) {
  if (!product?.price) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-[#505050]">Vagas para a próxima turma em breve.</p>
        <a
          href={WA_URL}
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

  const parcelamento = Math.ceil(product.price / 12)
  const pixPrice = Math.floor(product.price * 0.9)
  const checkoutUrl = product.checkout_url ?? '/loja'

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
        <div className="fds-card space-y-3" style={{ padding: 'var(--fds-6)' }}>
          <p className="fds-eyebrow">Pix · à vista</p>
          {product.original_price && (
            <p className="text-xs text-[#383838] line-through">R$ {product.original_price.toLocaleString('pt-BR')}</p>
          )}
          <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0] leading-none">
            R$ {pixPrice.toLocaleString('pt-BR')}
          </p>
          <p className="text-[11px] text-[#404040]">10% de desconto</p>
          <a
            href={checkoutUrl}
            className="fds-btn fds-btn--primary mt-2 w-full"
          >
            Pagar com Pix
          </a>
        </div>
        <div className="fds-card space-y-3" style={{ padding: 'var(--fds-6)' }}>
          <p className="fds-eyebrow">Cartão · parcelado</p>
          <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-4xl font-bold text-[#f0f0f0] leading-none">
            12×
          </p>
          <p className="text-sm text-[#505050]">R$ {parcelamento.toLocaleString('pt-BR')} por mês</p>
          <a
            href={checkoutUrl}
            className="fds-btn fds-btn--ghost mt-2 w-full"
          >
            Parcelar agora
          </a>
        </div>
      </div>
      <p className="fds-small">Garantia de 7 dias. Se não fizer sentido, devolvemos tudo.</p>
    </div>
  )
}

export function PsicanaliseContent({ product }: { product: ProductData | null }) {
  const checkoutHref = product?.checkout_url ?? '#investimento'
  const featuredDepo = depoimentos.find(d => d.featured) ?? depoimentos[0]
  const otherDepos = depoimentos.filter(d => !d.featured).slice(0, 3)

  return (
    <div className="fds">
      {/* ── HERO ─────────────────────────────────── */}
      {/* Oferta dentro do hero, acima da dobra -- antes o preço só aparecia
          lá embaixo e quem vinha de anúncio tinha que rolar a página toda
          pra descobrir quanto custa. */}
      <section className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
        <div className="fds-wrap">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            <p className="fds-eyebrow block">Instituto Despertamente · Formação certificante</p>
            <h1 className="fds-display mx-auto mt-4 max-w-4xl">
              Psicanálise <span className="fds-accent">Integrativa</span>
            </h1>
            <p className="fds-lead mx-auto mt-5 text-center">
              Do inconsciente à prática clínica. Teoria, análise pessoal e supervisão — o tripé
              clássico, integrado a neurociência e PNL.
            </p>
            <p className="fds-meta mt-5">7 módulos · 2 anos · ICF / ABNLP</p>
          </motion.div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
            <div>
              <hr className="fds-rule" style={{ width: 64 }} />
              <p className="fds-h3 mt-6" style={{ fontWeight: 400, color: 'var(--fds-ink-2)' }}>
                Psicanálise Integrativa não é mais uma modalidade terapêutica.{' '}
                <span style={{ color: 'var(--fds-ink)' }}>
                  É um método de investigação do inconsciente
                </span>{' '}
                que une a tradição clássica à neurociência, PNL e abordagens somáticas.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Formação completa em 7 módulos, ao longo de 2 anos',
                  'Teoria, análise pessoal e supervisão — o tripé clássico',
                  'Certificação ICF / ABNLP',
                  'Acesso à plataforma com todo o material',
                ].map(i => (
                  <li key={i} className="fds-small flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                    {i}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <PriceBlock product={product} />
            </div>
          </div>
        </div>
      </section>

      {/* ── MANIFESTO ────────────────────────────── */}
      <section className="fds-band">
        <Reveal className="fds-wrap fds-section" style={{ maxWidth: 680 }}>
          <p
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-2xl sm:text-3xl font-light leading-relaxed text-[#888888]"
          >
            Psicanálise Integrativa não é mais uma modalidade terapêutica.{' '}
            <span className="text-[#c8c8c8]">É um método de investigação do inconsciente</span>{' '}
            que une a tradição clássica à neurociência, PNL e abordagens somáticas. O percurso
            exige rigor — teoria, análise pessoal e supervisão. Se você quer entender o
            comportamento humano em profundidade,{' '}
            <span className="text-[#c8c8c8]">esta formação foi feita para você.</span>
          </p>
        </Reveal>
      </section>

      {/* ── PROGRAMA ─────────────────────────────── */}
      <Reveal>
        <section className="fds-wrap fds-section">
          <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
            <h2
              className="fds-h2"
            >
              O programa.
            </h2>
            <p className="fds-meta pb-1">7 módulos</p>
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
                      <span className="hidden sm:block text-[11px] font-mono text-[#333333] shrink-0">{m.carga}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pl-10">
                    <ul className="space-y-2">
                      {m.conteudo.map((c) => (
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

      {/* ── PERCURSO ─────────────────────────────── */}
      <Reveal>
        <section className="fds-band">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20 grid sm:grid-cols-2 gap-12 items-start">
            <h2
              className="fds-h2"
            >
              Da inscrição<br />à certificação.
            </h2>
            <div className="relative pl-8 space-y-8 border-l border-white/8">
              {passos.map((p, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-[33px] top-0.5 w-4 h-4 rounded-full border border-[#FFB800]/20 bg-[#0d0d0d] flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]/40" />
                  </span>
                  <p className="text-sm font-semibold text-[#d0d0d0]">{p.titulo}</p>
                  <p className="text-xs text-[#484848] mt-1 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── FUNDADOR ─────────────────────────────── */}
      <Reveal>
        <section className="fds-wrap fds-section">
          <div className="grid md:grid-cols-[200px_1fr] gap-12 lg:gap-20">
            <div>
              <div
                className="w-full aspect-square rounded-2xl bg-[#0d0d0d] flex items-center justify-center"
                style={{ border: '1px solid rgba(255,184,0,0.12)' }}
              >
                <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-7xl font-black text-[#1c1c1c]">
                  F
                </span>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl font-bold text-[#f0f0f0]">
                  Nome do Fundador
                </h2>
                <p className="text-xs font-mono text-[#FFB800]/70 mt-1.5 tracking-wider">
                  FUNDADOR · PSICANALISTA INTEGRATIVO · MASTER PNL
                </p>
              </div>
              <p className="fds-small">
                Desenvolvi a Formação em Psicanálise Integrativa depois de perceber que os modelos existentes
                eram ou muito teóricos para a prática clínica real, ou superficiais demais para produzir
                transformação genuína.
              </p>
              <p className="fds-small">
                O IDM reúne psicanálise, neurociência e PNL porque o ser humano não funciona em
                compartimentos. A formação que você vai fazer é o mesmo percurso que eu percorri —
                e que mais de 1.200 profissionais já concluíram.
              </p>
              <blockquote
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="border-l border-[#FFB800]/20 pl-6 text-lg sm:text-xl italic text-[#707070] leading-relaxed"
              >
                "Um psicanalista que não se analisou não pode analisar. Um formador que não se formou não
                pode formar. Essa formação exige que você vá fundo — em você mesmo."
              </blockquote>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── DEPOIMENTOS ──────────────────────────── */}
      <Reveal>
        <section className="fds-band">
          <div className="fds-wrap fds-section">
            <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
              {/* Featured */}
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

              {/* Others */}
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
        <section id="investimento" className="fds-wrap fds-section">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                className="fds-h2"
              >
                Investimento.
              </h2>
              <p className="fds-small">
                Formação completa — teoria, análise pessoal, supervisão clínica e certificação.
              </p>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-[#383838] hover:text-[#606060] transition-colors"
              >
                <MessageCircle className="h-3 w-3" />
                Tirar dúvidas pelo WhatsApp
              </a>
            </div>
            <PriceBlock product={product} />
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
              Ainda tem dúvida?{' '}
              <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="text-[#555555] hover:text-[#888888] transition-colors underline underline-offset-2">
                Fale diretamente com a equipe.
              </a>
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="relative overflow-hidden py-32">
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />
        <Reveal className="relative max-w-3xl mx-auto px-6 sm:px-10 space-y-10">
          <h2
            className="fds-h1"
          >
            A formação começa<br />quando você decide.
          </h2>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href={checkoutHref}
              className="fds-btn fds-btn--primary group"
            >
              Garantir minha vaga
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-4 text-sm text-[#444444] hover:text-[#707070] transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
          <p className="text-xs font-mono text-[#303030]">
            Vagas limitadas por turma · Garantia de 7 dias
          </p>
        </Reveal>
      </section>
    </div>
  )
}
