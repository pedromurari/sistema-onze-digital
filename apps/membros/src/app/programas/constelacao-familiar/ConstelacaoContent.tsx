'use client'

/**
 * Página de vendas do Despertar Sistêmico (Constelação Familiar).
 *
 * Padrão pedido pelo Pedro (21/11/2026): mesma ESTRUTURA da página que
 * converte de verdade -- idmpelobrasil.com.br/npa/sao-paulo (VSL no topo,
 * oferta e formulário logo abaixo, pilares do conteúdo, urgência no fim) --
 * mas com acabamento de site institucional: paleta navy/dourado, Fraunces
 * nos títulos, faixas full-bleed (sem caixinha com borda lateral) e copy
 * mais curta. Nada do visual de página de isca (emoji, caixa amarela
 * piscando): é formação de R$497, não ingresso de R$29.
 *
 * Esta é a referência para as próximas formações -- duplica a pasta, troca
 * o conteúdo e o slug.
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

// VSL do Despertar Sistêmico. A gravação é do Rodrygo + a professora da
// formação (combinado em 21/11/2026) e ainda não existe -- enquanto a URL
// for null a página esconde o bloco inteiro em vez de mostrar player vazio.
// Quando o vídeo subir pro R2, é só preencher aqui.
const VIDEO_URL: string | null = null
const VIDEO_POSTER: string | null = null

// Data de início da Turma 01 — pendente com o Rodrygo (21/11/2026). Enquanto
// for null, a página fala em "próxima turma" em vez de inventar data.
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
  'Quem vai começar agora em Constelação Familiar — não exige conhecimento prévio',
]

const incluso = [
  'Apostila digital dos oito módulos',
  'Caderno de práticas e registros',
  'Modelo de genograma e roteiro de entrevista inicial',
  'Ficha de observação sistêmica',
  'Guia de práticas com bonecos e objetos',
  'Manual dos bonecos na água',
  'Banco de perguntas sistêmicas',
  'Guia de ética e limites de atuação',
  'Estudos de caso comentados',
  'Certificado conforme critérios institucionais',
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
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
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
      className="relative w-full aspect-video overflow-hidden rounded-2xl border border-[#FFB800]/20 bg-black cursor-pointer group"
      style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition-colors group-hover:bg-black/30">
          <span className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-[#FFB800] transition-transform group-hover:scale-105">
            <Play className="h-7 w-7 md:h-8 md:w-8 translate-x-0.5 text-[#09122C] fill-[#09122C]" />
          </span>
          <p className="text-sm font-semibold tracking-wide text-white/90">Assista antes de se inscrever</p>
        </div>
      )}
    </div>
  )
}

function BlocoOferta({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className={compacto ? '' : 'rounded-3xl bg-white/[0.03] p-8 sm:p-10'}>
      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#FFB800]/70">Investimento</p>
      <div className="mt-3 flex items-end gap-3">
        <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-5xl sm:text-6xl font-bold text-[#f0f0f0] leading-none">
          R$ 497
        </span>
        <span className="pb-1 text-sm text-[#6a6a6a]">à vista no Pix</span>
      </div>
      <p className="mt-2 text-sm text-[#8a8a8a]">
        ou até <span className="font-semibold text-[#c8c8c8]">12x de R$ 50,88</span> no cartão
      </p>

      <div className="mt-7">
        <FormacaoInscricaoForm slug={SLUG} />
      </div>

      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 text-xs text-[#555555] hover:text-[#8a8a8a] transition-colors"
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
    <>
      {/* ── HERO + VSL + OFERTA ──────────────────── */}
      <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,184,0,0.07), transparent 70%)',
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 sm:px-10">
          <div className="text-center">
            <Image
              src="/despertamente-simbolo-branco.png"
              alt="Instituto Despertamente"
              width={52}
              height={52}
              className="mx-auto object-contain opacity-90"
            />
            <p className="mt-5 text-[11px] font-mono uppercase tracking-[0.22em] text-[#FFB800]/80">
              Formação em Constelação Familiar Sistêmica
            </p>
            <h1
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="mx-auto mt-4 max-w-3xl text-[40px] sm:text-[58px] lg:text-[68px] font-bold leading-[1.02] tracking-tight text-[#f0f0f0]"
            >
              Despertar Sistêmico
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-[#9a9a9a]">
              Reconhecer a origem, compreender os vínculos e ocupar o próprio lugar — com método,
              prática supervisionada e limites éticos claros.
            </p>
            <p className="mt-3 text-sm text-[#5f5f5f]">
              3 meses · 8 módulos · 12 aulas · encontros quinzenais ao vivo
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl">
            <VideoVsl />
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="space-y-6">
              <div className="h-px w-16 bg-[#FFB800]/40" />
              <p
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-xl sm:text-2xl font-light leading-relaxed text-[#b0b0b0]"
              >
                Existem experiências que se repetem mesmo quando mudamos de ambiente, de
                relacionamento ou de fase da vida.{' '}
                <span className="text-[#e8e8e8]">
                  O que se repete raramente está só em você — está no sistema de onde você veio.
                </span>
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  'Encontros ao vivo com demonstração e vivência',
                  'Plataforma com aulas gravadas, materiais e atividades',
                  'Prática supervisionada em grupos pequenos',
                  'Certificado conforme critérios institucionais',
                ].map(i => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#8a8a8a]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB800]/70" />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="pt-2 text-xs font-mono uppercase tracking-wider text-[#4a4a4a]">
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
      <section className="border-y border-white/5 bg-[#0b0b0b]">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-10 py-20">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#FFB800]/70">
              O que você vai desenvolver
            </p>
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="mt-3 text-4xl sm:text-5xl font-bold leading-tight text-[#f0f0f0]"
            >
              Três movimentos,<br />do olhar à prática.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/[0.06] md:grid-cols-3">
            {pilares.map((p, i) => (
              <Reveal key={p.titulo} className="bg-[#0b0b0b]">
                <div className="h-full p-8">
                  <span className="text-xs font-mono text-[#FFB800]/60">0{i + 1}</span>
                  <h3
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                    className="mt-3 text-xl font-bold leading-snug text-[#e8e8e8]"
                  >
                    {p.titulo}
                  </h3>
                  <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[#4a4a4a]">
                    {p.resumo}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {p.itens.map(item => (
                      <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#7a7a7a]">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFB800]/50" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 border-l-2 border-[#FFB800]/25 pl-3 text-sm italic leading-relaxed text-[#9a9a9a]">
                    {p.fecho}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 sm:px-10 py-20">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold leading-tight text-[#f0f0f0]"
              >
                Como a<br />formação roda.
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-[#7a7a7a]">
                Seis ciclos quinzenais em três meses. Cada ciclo tem uma semana de encontro ao
                vivo e uma semana de integração na plataforma.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                { t: 'Ao vivo no Meet', s: '1h30 a 2h, quinzenal', d: 'Aula dialogada, demonstrações, vivências e estudos de caso.' },
                { t: 'Plataforma', s: 'entre os encontros', d: 'Aulas gravadas, artigos, filmes indicados, atividades e materiais.' },
                { t: 'Acompanhamento', s: 'durante os 3 meses', d: 'Entregas orientadas, registros, devolutivas e preparação para o certificado.' },
              ].map(c => (
                <div key={c.t} className="border-t border-white/10 pt-5">
                  <p className="text-sm font-semibold text-[#e0e0e0]">{c.t}</p>
                  <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-[#FFB800]/60">{c.s}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#6f6f6f]">{c.d}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── MAPA COMPLETO (ACCORDION) ────────────── */}
      <section className="border-y border-white/5 bg-[#0b0b0b]">
        <div className="mx-auto w-full max-w-4xl px-6 sm:px-10 py-20">
          <Reveal>
            <div className="mb-10 flex items-end justify-between gap-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                O conteúdo,<br />aula por aula.
              </h2>
              <p className="pb-1 text-xs font-mono text-[#3f3f3f]">8 módulos · 12 aulas</p>
            </div>
            <Accordion type="single" collapsible defaultValue="01">
              <div className="divide-y divide-white/5">
                {modulos.map(m => (
                  <AccordionItem key={m.numero} value={m.numero} className="border-0">
                    <AccordionTrigger className="group w-full py-5 text-left hover:no-underline">
                      <div className="flex w-full items-center gap-5 pr-4">
                        <span className="w-5 shrink-0 font-mono text-xs text-[#3f3f3f]">{m.numero}</span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-[#c0c0c0] transition-colors group-hover:text-[#f0f0f0]">
                            {m.titulo}
                          </span>
                          <span className="font-mono text-[11px] text-[#3f3f3f]">{m.aulas}</span>
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-6 pl-10">
                      <ul className="space-y-2">
                        {m.conteudo.map(c => (
                          <li key={c} className="text-sm leading-relaxed text-[#6f6f6f]">{c}</li>
                        ))}
                      </ul>
                      <p className="border-l-2 border-[#FFB800]/20 pl-3 text-xs leading-relaxed text-[#FFB800]/60">
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

      {/* ── PARA QUEM + INCLUSO ──────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 sm:px-10 py-20">
        <Reveal>
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <div>
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-3xl sm:text-4xl font-bold leading-tight text-[#f0f0f0]"
              >
                Para quem é.
              </h2>
              <ul className="mt-7 divide-y divide-white/5">
                {paraQuem.map(i => (
                  <li key={i} className="py-4 text-sm leading-relaxed text-[#7a7a7a] first:pt-0">{i}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-3xl sm:text-4xl font-bold leading-tight text-[#f0f0f0]"
              >
                O que vem junto.
              </h2>
              <ul className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {incluso.map(i => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#7a7a7a]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFB800]/50" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="border-y border-white/5 bg-[#0b0b0b]">
        <div className="mx-auto w-full max-w-3xl px-6 sm:px-10 py-20">
          <Reveal>
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="mb-10 text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
            >
              Dúvidas.
            </h2>
            <Accordion type="single" collapsible>
              <div className="divide-y divide-white/5">
                {faqItems.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border-0">
                    <AccordionTrigger className="py-5 text-left text-sm font-medium text-[#b0b0b0] transition-colors hover:text-[#f0f0f0] hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 text-sm leading-relaxed text-[#6f6f6f]">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────── */}
      <section className="relative overflow-hidden py-24">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 100%, rgba(255,184,0,0.07), transparent 70%)',
          }}
        />
        <div className="relative mx-auto w-full max-w-5xl px-6 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-16">
            <Reveal>
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] text-[#f0f0f0]"
              >
                Você não precisa<br />rejeitar sua história<br />para mudar de rumo.
              </h2>
              <p className="mt-6 max-w-lg text-sm leading-relaxed text-[#7a7a7a]">
                Reconhecer os vínculos que nos formaram é o que abre espaço para escolher um
                movimento diferente. Pertencer não precisa significar repetir.
              </p>
              <p className="mt-6 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#4a4a4a]">
                <ArrowRight className="h-3.5 w-3.5 text-[#FFB800]/50" />
                {DATA_INICIO ? `Turma 01 · início em ${DATA_INICIO}` : 'Turma 01 · vagas limitadas'}
              </p>
            </Reveal>
            <Reveal>
              <BlocoOferta />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
