'use client'

/**
 * Página de vendas do Despertar Sistêmico (Constelação Familiar).
 *
 * ESTRUTURA: a da LP que converte de verdade --
 * idmpelobrasil.com.br/npa/sao-paulo (VSL no topo, oferta e formulário
 * logo abaixo, pilares do conteúdo, urgência no fim).
 *
 * VISUAL: o design system em `src/app/design-system.css` (carregado no
 * layout, vale pro site inteiro),
 * extraído do estilo que o Pedro escolheu no Refero e adaptado pra marca
 * (dourado como destaque único, Fraunces no serif, design plano, separação
 * por linha de 1px, escala tipográfica e espaçamento em base 4px).
 *
 * Esta é a referência das próximas formações: duplica a pasta, troca o
 * conteúdo e o slug. Nenhuma cor fica fixa no JSX -- tudo vem do CSS, então
 * mudar a paleta do site inteiro é editar um arquivo só.
 */

import { useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Play, Check, ArrowRight, MessageCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { FormacaoInscricaoForm } from '@/components/marketing/FormacaoInscricaoForm'

const SLUG = 'constelacao-familiar'
const WA_URL =
  'https://wa.me/5511919434040?text=Olá! Quero saber mais sobre o Despertar Sistêmico (Formação em Constelação Familiar Sistêmica).'

// VSL do Despertar Sistêmico: gravação do Rodrygo + a professora da formação
// (combinado 21/11/2026), ainda não existe. Enquanto a URL for null a página
// esconde o bloco inteiro em vez de mostrar player vazio.
const VIDEO_URL: string | null = null
const VIDEO_POSTER: string | null = null

// Data de início da Turma 01 — pendente com o Rodrygo. Enquanto for null, a
// página fala em "próxima turma" em vez de inventar data.
const DATA_INICIO: string | null = null

const pilares = [
  {
    titulo: 'A base que organiza o olhar',
    resumo: 'Módulos 1 a 3 · Aulas 1 a 6',
    fecho: 'Você para de olhar o sintoma e passa a enxergar o sistema.',
    itens: [
      'O que é pensar sistemicamente e como a abordagem se desenvolveu',
      'Pertencimento, ordem e equilíbrio — as forças que organizam todo vínculo',
      'Exclusões, lealdades invisíveis e repetições que atravessam gerações',
      'Leitura de genograma: organizar três gerações e enxergar o padrão',
    ],
  },
  {
    titulo: 'A prática com responsabilidade',
    resumo: 'Módulos 4 a 6 · Aulas 7 a 10',
    fecho: 'Você conduz um exercício introdutório sabendo exatamente onde parar.',
    itens: [
      'Leitura do campo: percepção corporal, espacial e relacional',
      'Bonecos, objetos, âncoras e a técnica dos bonecos na água',
      'Perguntas sem indução — e a diferença entre perceber e interpretar',
      'Condução completa: da questão inicial ao encerramento',
    ],
  },
  {
    titulo: 'A aplicação e os limites',
    resumo: 'Módulos 7 e 8 · Aulas 11 e 12',
    fecho: 'Você sai sabendo o que pode fazer, e principalmente o que não deve.',
    itens: [
      'Família, casais, carreira, dinheiro e organizações',
      'Quando a prática não deve ser realizada — e para onde encaminhar',
      'O limite entre facilitação, aconselhamento e psicoterapia',
      'Prática supervisionada em grupo, alternando os papéis',
    ],
  },
]

const modulos = [
  { numero: '01', titulo: 'O olhar sistêmico', aulas: 'Aula 1', conteudo: ['O que significa pensar sistemicamente e como a abordagem se desenvolveu', 'O indivíduo como parte de diferentes sistemas', 'Família de origem e família constituída', 'Diferença entre olhar individual e olhar sistêmico', 'Possibilidades, limites, mitos e expectativas'], vivencia: 'Mapa dos sistemas aos quais o aluno pertence.' },
  { numero: '02', titulo: 'Ordens que organizam os vínculos', aulas: 'Aulas 2, 3 e 4', conteudo: ['Pertencimento, exclusões, esquecimentos e silenciamentos', 'Reconhecimento do sistema sem julgamento', 'Precedência, lugar, pais, filhos, irmãos e relacionamentos anteriores', 'Famílias recompostas e trocas de papéis', 'Dar e receber: reciprocidade, culpa, dívida emocional e sobrecarga'], vivencia: 'Construção espacial com papéis e estudo de caso sobre salvamento, dependência e cobrança.' },
  { numero: '03', titulo: 'Heranças emocionais e repetição', aulas: 'Aulas 5 e 6', conteudo: ['Lealdades familiares e repetições conscientes ou inconscientes', 'Identificações com pais e ancestrais', 'Culpa ao seguir um caminho diferente', 'Introdução ao genograma e organização das gerações', 'Investigação responsável: hipóteses não são certezas'], vivencia: 'Vivência "O que carrego por amor e o que escolho transformar?" e genograma simplificado.' },
  { numero: '04', titulo: 'A linguagem do campo', aulas: 'Aula 7', conteudo: ['O que é uma representação sistêmica', 'Campo, percepção corporal, espacial e relacional', 'Distância, direção, aproximação e afastamento', 'Diferença entre percepção e interpretação', 'Silêncio, perguntas abertas e investigação fenomenológica'], vivencia: 'Exercício de posicionamento espacial com representantes ou âncoras.' },
  { numero: '05', titulo: 'Recursos sistêmicos individuais', aulas: 'Aulas 8 e 9', conteudo: ['Escolha e posicionamento de bonecos, pedras, objetos e papéis', 'Proximidade, distância, direção e hierarquia', 'Técnica dos bonecos flutuantes e preparação dos elementos', 'Perguntas sem indução e o momento de interromper', 'O recurso é exploratório: não diagnostica nem prevê'], vivencia: 'Configuração com bonecos e vivência com bonecos na água, com observação e registro.' },
  { numero: '06', titulo: 'Condução da prática', aulas: 'Aula 10', conteudo: ['Acolhimento, definição da questão e tema central', 'Perguntas essenciais e levantamento de fatos relevantes', 'Escolha de representantes e montagem da imagem inicial', 'Movimentos de aproximação, diferenciação e reconhecimento', 'Frases sistêmicas sem automatismo e o silêncio como intervenção'], vivencia: 'Demonstração conduzida pelo professor, com roteiro completo de sessão introdutória.' },
  { numero: '07', titulo: 'Aplicações do pensamento sistêmico', aulas: 'Aula 11', conteudo: ['Questões familiares, afetivas, casais e relacionamentos anteriores', 'Trabalho, carreira e pertencimento profissional', 'Conflitos, liderança, sucessão e hierarquia nas organizações', 'Dinheiro e prosperidade como temas de investigação', 'Quando não se deve realizar a prática'], vivencia: 'Estudos de caso envolvendo família, relacionamento e organização.' },
  { numero: '08', titulo: 'Ética, integração e prática supervisionada', aulas: 'Aula 12', conteudo: ['Postura, presença, escuta, consentimento e confidencialidade', 'Acolhimento sem promessas de resultado', 'Evitar diagnósticos e interpretações deterministas', 'Situações que exigem encaminhamento', 'Limites entre facilitação, aconselhamento e psicoterapia'], vivencia: 'Prática em pequenos grupos, alternando facilitador, participante e observador.' },
]

const paraQuem = [
  'Quem quer entender a própria história familiar',
  'Terapeutas e profissionais de práticas integrativas',
  'Psicanalistas e psicólogos que querem ampliar o olhar sistêmico',
  'Educadores e líderes que trabalham com grupos e relacionamentos',
  'Quem vai começar agora — não exige conhecimento prévio',
]

const incluso = [
  'Apostila digital dos oito módulos',
  'Caderno de práticas e registros',
  'Modelo de genograma e roteiro de entrevista',
  'Ficha de observação sistêmica',
  'Guia de práticas com bonecos e objetos',
  'Manual dos bonecos na água',
  'Banco de perguntas sistêmicas',
  'Guia de ética e limites de atuação',
  'Estudos de caso comentados',
  'Certificado conforme critérios institucionais',
]

const comoFunciona = [
  { t: 'Ao vivo no Meet', s: '1h30 a 2h · quinzenal', d: 'Aula dialogada, demonstrações, vivências e estudos de caso.' },
  { t: 'Plataforma', s: 'entre os encontros', d: 'Aulas gravadas, artigos, filmes indicados, atividades e materiais.' },
  { t: 'Acompanhamento', s: 'durante os 3 meses', d: 'Entregas orientadas, registros, devolutivas e preparação para o certificado.' },
]

const faqItems = [
  { q: 'Preciso ter conhecimento prévio em Constelação Familiar?', a: 'Não. Essa é a porta de entrada — não é necessário nenhum conhecimento prévio.' },
  { q: 'Como funciona o formato?', a: '3 meses, 8 módulos, 12 aulas, em 6 ciclos quinzenais. Cada ciclo combina um encontro ao vivo pelo Meet (1h30 a 2h) com uma semana de integração na plataforma — estudo, leitura e atividade orientada.' },
  { q: 'As aulas ficam gravadas?', a: 'Sim. Os conteúdos gravados ficam na plataforma para revisar e aprofundar, junto com apostilas, artigos, filmes indicados e as atividades de cada módulo.' },
  { q: 'Como funciona a certificação?', a: 'O certificado representa participação e percurso — as entregas não ficam concentradas no último encontro. Exige frequência mínima, participação nas vivências, atividades na plataforma, entrega do genograma, participação na prática supervisionada e aceite das orientações éticas.' },
  { q: 'Essa formação substitui terapia ou uma formação em Psicanálise?', a: 'Não. É uma formação introdutória em Constelação Familiar Sistêmica, com limites éticos claros entre facilitação, aconselhamento e psicoterapia. Não promete resultado nem substitui acompanhamento clínico.' },
  { q: 'Quais as formas de pagamento?', a: 'R$ 497 à vista no Pix, ou em até 12x de R$ 50,88 no cartão.' },
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
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function VideoVsl() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState(false)

  if (!VIDEO_URL) return null

  return (
    <div
      className="fds-card relative w-full aspect-video overflow-hidden cursor-pointer group"
      onClick={() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) void v.play().catch(() => {})
        else v.pause()
      }}
    >
      <video
        ref={videoRef}
        src={VIDEO_URL}
        poster={VIDEO_POSTER ?? undefined}
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
      />
      {!tocando && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 transition-colors group-hover:bg-black/35">
          <span
            className="flex h-16 w-16 md:h-[72px] md:w-[72px] items-center justify-center rounded-full transition-transform group-hover:scale-105"
            style={{ background: 'var(--fds-accent)' }}
          >
            <Play className="h-6 w-6 md:h-7 md:w-7 translate-x-0.5" style={{ color: 'var(--fds-accent-ink)', fill: 'var(--fds-accent-ink)' }} />
          </span>
          <p className="fds-small" style={{ color: 'var(--fds-ink)' }}>Assista antes de se inscrever</p>
        </div>
      )}
    </div>
  )
}

function BlocoOferta({ comMoldura = true }: { comMoldura?: boolean }) {
  return (
    <div className={comMoldura ? 'fds-card' : ''} style={comMoldura ? { padding: 'var(--fds-8)' } : undefined}>
      <p className="fds-eyebrow">Investimento</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="fds-h1" style={{ lineHeight: 1 }}>R$ 497</span>
        <span className="fds-small" style={{ paddingBottom: 4, color: 'var(--fds-ink-4)' }}>à vista no Pix</span>
      </div>
      <p className="fds-small mt-2">
        ou até <span style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>12x de R$ 50,88</span> no cartão
      </p>

      <div className="mt-7">
        <FormacaoInscricaoForm slug={SLUG} />
      </div>

      <a
        href={WA_URL}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ConstelacaoContent({ product }: { product: ProductData | null }) {
  return (
    <div className="fds">
      {/* ── HERO + VSL + OFERTA ──────────────────── */}
      <section className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
        <div className="fds-wrap">
          <div className="text-center">
            <Image
              src="/despertamente-simbolo-branco.png"
              alt="Instituto Despertamente"
              width={48}
              height={48}
              className="mx-auto object-contain"
            />
            <p className="fds-eyebrow mt-5 block">Formação em Constelação Familiar Sistêmica</p>
            <h1 className="fds-display mx-auto mt-4 max-w-4xl">
              Despertar <span className="fds-accent">Sistêmico</span>
            </h1>
            <p className="fds-lead mx-auto mt-5 text-center">
              Reconhecer a origem, compreender os vínculos e ocupar o próprio lugar — com método,
              prática supervisionada e limites éticos claros.
            </p>
            <p className="fds-meta mt-5">3 meses · 8 módulos · 12 aulas · encontros quinzenais ao vivo</p>
          </div>

          <div className="mx-auto mt-12" style={{ maxWidth: 820 }}>
            <VideoVsl />
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
            <div>
              <hr className="fds-rule" style={{ width: 64 }} />
              <p className="fds-h3 mt-6" style={{ fontWeight: 400, color: 'var(--fds-ink-2)' }}>
                O que se repete mesmo quando você muda de ambiente, de relacionamento ou de fase{' '}
                <span style={{ color: 'var(--fds-ink)' }}>raramente está só em você — está no sistema de onde você veio.</span>
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Encontros ao vivo com demonstração e vivência',
                  'Plataforma com aulas gravadas, materiais e atividades',
                  'Prática supervisionada em grupos pequenos',
                  'Certificado conforme critérios institucionais',
                ].map(i => (
                  <li key={i} className="fds-small flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="fds-meta mt-8">
                {DATA_INICIO ? `Turma 01 começa em ${DATA_INICIO}` : 'Próxima turma · vagas limitadas'}
              </p>
            </div>

            <div id="inscricao">
              <BlocoOferta />
            </div>
          </div>
        </div>
      </section>

      {/* ── OS 3 PILARES ─────────────────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">O que você vai desenvolver</p>
            <h2 className="fds-h2 mt-3 max-w-2xl">
              Três movimentos, <span className="fds-accent">do olhar à prática.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-px md:grid-cols-3" style={{ background: 'var(--fds-line)' }}>
            {pilares.map((p, i) => (
              <Reveal key={p.titulo}>
                <div className="h-full" style={{ background: 'var(--fds-surface)', padding: 'var(--fds-8)' }}>
                  <span className="fds-meta" style={{ color: 'var(--fds-accent)', opacity: 0.7 }}>0{i + 1}</span>
                  <h3 className="fds-h3 mt-3" style={{ fontSize: '1.375rem' }}>{p.titulo}</h3>
                  <p className="fds-meta mt-2">{p.resumo}</p>
                  <ul className="mt-6 space-y-3">
                    {p.itens.map(item => (
                      <li key={item} className="fds-small flex items-start gap-2.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fds-accent)', opacity: 0.6 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p
                    className="fds-small mt-6"
                    style={{ borderLeft: '1px solid var(--fds-accent)', paddingLeft: 'var(--fds-3)', color: 'var(--fds-ink-2)', fontStyle: 'italic' }}
                  >
                    {p.fecho}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
              <div>
                <h2 className="fds-h2">Como a formação <span className="fds-accent">roda.</span></h2>
                <p className="fds-body mt-5">
                  Seis ciclos quinzenais em três meses. Cada ciclo tem uma semana de encontro ao
                  vivo e uma semana de integração na plataforma.
                </p>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {comoFunciona.map(c => (
                  <div key={c.t} style={{ borderTop: '1px solid var(--fds-line)', paddingTop: 'var(--fds-6)' }}>
                    <p style={{ fontSize: 'var(--fds-small)', fontWeight: 600, color: 'var(--fds-ink)' }}>{c.t}</p>
                    <p className="fds-meta mt-1" style={{ color: 'var(--fds-accent)', opacity: 0.65 }}>{c.s}</p>
                    <p className="fds-small mt-3">{c.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CONTEÚDO AULA POR AULA ───────────────── */}
      <section className="fds-section fds-band">
        <div className="fds-wrap" style={{ maxWidth: 880 }}>
          <Reveal>
            <div className="mb-12 flex items-end justify-between gap-4">
              <h2 className="fds-h2">O conteúdo, <span className="fds-accent">aula por aula.</span></h2>
              <p className="fds-meta pb-1 whitespace-nowrap">8 módulos · 12 aulas</p>
            </div>
            <Accordion type="single" collapsible defaultValue="01">
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
                        <span className="flex-1">
                          <span className="block" style={{ fontSize: 'var(--fds-small)', fontWeight: 500, color: 'var(--fds-ink-2)' }}>
                            {m.titulo}
                          </span>
                          <span className="fds-meta">{m.aulas}</span>
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-6 pl-10">
                      <ul className="space-y-2">
                        {m.conteudo.map(c => (
                          <li key={c} className="fds-small">{c}</li>
                        ))}
                      </ul>
                      <p
                        className="mt-4"
                        style={{ borderLeft: '1px solid var(--fds-accent)', paddingLeft: 'var(--fds-3)', fontSize: 'var(--fds-caption)', color: 'var(--fds-ink-4)' }}
                      >
                        Experiência de aprendizagem: {m.vivencia}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── PARA QUEM + O QUE VEM JUNTO ──────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="fds-h2" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }}>Para quem é.</h2>
                <ul className="fds-list mt-8">
                  {paraQuem.map(i => <li key={i} className="fds-small">{i}</li>)}
                </ul>
              </div>
              <div>
                <h2 className="fds-h2" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }}>O que vem junto.</h2>
                <ul className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {incluso.map(i => (
                    <li key={i} className="fds-small flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fds-accent)', opacity: 0.6 }} />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
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
                    <AccordionContent className="pb-5 fds-small">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-30)' }}>
        <div className="fds-wrap">
          <div className="grid gap-14 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-20">
            <Reveal>
              <h2 className="fds-h1">
                Você não precisa rejeitar sua história para{' '}
                <span className="fds-accent">mudar de rumo.</span>
              </h2>
              <p className="fds-body mt-6">
                Reconhecer os vínculos que nos formaram é o que abre espaço para escolher um
                movimento diferente. Pertencer não precisa significar repetir.
              </p>
              <p className="fds-meta mt-8 flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" style={{ color: 'var(--fds-accent)' }} />
                {DATA_INICIO ? `Turma 01 · início em ${DATA_INICIO}` : 'Turma 01 · vagas limitadas'}
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
