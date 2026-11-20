'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, MessageCircle, Check } from 'lucide-react'
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

const pilares = [
  { numero: '01', titulo: 'Conhecimento', texto: 'Fundamentos que organizam o olhar.' },
  { numero: '02', titulo: 'Percepção', texto: 'Presença para observar sem antecipar.' },
  { numero: '03', titulo: 'Experiência', texto: 'Vivências que aproximam teoria e vida.' },
  { numero: '04', titulo: 'Prática', texto: 'Recursos sistêmicos aplicados.' },
  { numero: '05', titulo: 'Integração', texto: 'Aprendizado elaborado e consciente.' },
]

const ambientes = [
  {
    titulo: 'Ao vivo no Meet',
    sub: 'Encontros quinzenais de 1h30 a 2h',
    texto: 'Aula dialogada · demonstrações · vivências · estudos de caso',
  },
  {
    titulo: 'Plataforma online',
    sub: 'Aprofundamento entre os encontros',
    texto: 'Aulas gravadas · artigos · filmes indicados · atividades · materiais',
  },
  {
    titulo: 'Acompanhamento',
    sub: 'Aprender, aplicar e integrar',
    texto: 'Entregas orientadas · registros · devolutivas · preparação para certificação',
  },
]

const modulos = [
  {
    numero: '01',
    titulo: 'O olhar sistêmico',
    aulas: 'Aula 1',
    conteudo: [
      'O que significa pensar sistemicamente e como a abordagem se desenvolveu',
      'O indivíduo como parte de diferentes sistemas',
      'Família de origem e família constituída',
      'Diferença entre olhar individual e olhar sistêmico',
      'Possibilidades, limites, mitos e expectativas',
      'Postura de respeito diante da história do outro',
    ],
    vivencia: 'Mapa dos sistemas aos quais o aluno pertence.',
  },
  {
    numero: '02',
    titulo: 'Ordens que organizam os vínculos',
    aulas: 'Aulas 2, 3 e 4',
    conteudo: [
      'Pertencimento, exclusões, esquecimentos e silenciamentos',
      'Reconhecimento do sistema sem julgamento',
      'Precedência, lugar, pais, filhos, irmãos e relacionamentos anteriores',
      'Famílias recompostas e trocas de papéis',
      'Dar e receber nos vínculos familiares, afetivos e profissionais',
      'Reciprocidade, culpa, dívida emocional, limites e sobrecarga',
    ],
    vivencia: 'Reconhecimento do sistema, construção espacial com papéis e estudo de caso sobre salvamento, dependência e cobrança.',
  },
  {
    numero: '03',
    titulo: 'Heranças emocionais e repetição',
    aulas: 'Aulas 5 e 6',
    conteudo: [
      'Lealdades familiares e repetições conscientes ou inconscientes',
      'Identificações com pais e ancestrais',
      'Culpa ao seguir um caminho diferente e necessidade de pertencer',
      'Introdução à leitura do genograma e organização das gerações',
      'Acontecimentos, transições e crenças familiares recorrentes',
      'Investigação responsável: hipóteses não são certezas',
    ],
    vivencia: 'Vivência "O que carrego por amor e o que escolho transformar?" e elaboração orientada de genograma simplificado.',
  },
  {
    numero: '04',
    titulo: 'A linguagem do campo',
    aulas: 'Aula 7',
    conteudo: [
      'O que é uma representação sistêmica',
      'Campo, percepção corporal, espacial e relacional',
      'Distância, direção, aproximação e afastamento',
      'Sensações, emoções e imagens internas',
      'Diferença entre percepção e interpretação',
      'Silêncio, perguntas abertas e investigação fenomenológica',
      'Registro de hipóteses sem transformá-las em fatos',
    ],
    vivencia: 'Exercício de posicionamento espacial com representantes ou âncoras.',
  },
  {
    numero: '05',
    titulo: 'Recursos sistêmicos individuais',
    aulas: 'Aulas 8 e 9',
    conteudo: [
      'Escolha e posicionamento de bonecos, pedras, objetos, cartões e papéis',
      'Proximidade, distância, direção e hierarquia',
      'Movimentos espontâneos e sugeridos; limites da interpretação',
      'Técnica dos bonecos flutuantes e preparação dos elementos',
      'Aproximações, afastamentos, direções e agrupamentos',
      'O recurso é exploratório: não diagnostica, prevê ou comprova acontecimentos',
    ],
    vivencia: 'Configuração com bonecos e vivência com bonecos na água, seguida de observação e registro.',
  },
  {
    numero: '06',
    titulo: 'Condução da prática',
    aulas: 'Aula 10',
    conteudo: [
      'Acolhimento, definição da questão e identificação do tema central',
      'Perguntas essenciais e levantamento de fatos relevantes',
      'Escolha de representantes e montagem da imagem inicial',
      'Movimentos de aproximação, diferenciação e reconhecimento',
      'Frases sistêmicas sem automatismos e o silêncio como intervenção',
      'Encerramento e retorno ao presente',
    ],
    vivencia: 'Demonstração conduzida pelo professor a partir de um roteiro completo de sessão introdutória.',
  },
  {
    numero: '07',
    titulo: 'Aplicações do pensamento sistêmico',
    aulas: 'Aula 11',
    conteudo: [
      'Questões familiares, afetivas, casais e relacionamentos anteriores',
      'Pais, filhos e famílias recompostas',
      'Trabalho, carreira e pertencimento profissional',
      'Conflitos, liderança, sucessão e hierarquia nas organizações',
      'Dinheiro e prosperidade como temas de investigação',
      'Escolha do formato adequado e situações em que não se deve realizar a prática',
    ],
    vivencia: 'Estudos de caso envolvendo família, relacionamento e organização.',
  },
  {
    numero: '08',
    titulo: 'Ética, integração e prática supervisionada',
    aulas: 'Aula 12',
    conteudo: [
      'Postura, presença, escuta, consentimento e confidencialidade',
      'Acolhimento sem promessas de resultado',
      'Evitar diagnósticos e interpretações deterministas',
      'Situações que exigem encaminhamento',
      'Limites entre facilitação, aconselhamento e psicoterapia',
      'Cuidados com exposição em grupo e integração emocional',
    ],
    vivencia: 'Prática em pequenos grupos, alternando os papéis de facilitador, participante e observador.',
  },
]

const paraQuem = [
  'Pessoas interessadas em autoconhecimento e desenvolvimento pessoal',
  'Terapeutas e profissionais de práticas integrativas',
  'Psicanalistas, psicólogos e profissionais do cuidado que desejam ampliar o olhar sistêmico, respeitando suas atribuições',
  'Educadores, líderes e profissionais que trabalham com grupos e relacionamentos',
  'Pessoas que desejam compreender melhor sua história familiar',
  'Alunos que pretendem iniciar seus estudos em Constelação Familiar Sistêmica',
  'Profissionais que buscam recursos sistêmicos complementares, dentro dos limites de sua formação',
]

const competencias = [
  'Compreender fundamentos do pensamento sistêmico',
  'Reconhecer padrões e repetições familiares',
  'Diferenciar fatos, interpretações, hipóteses e projeções',
  'Desenvolver percepção, presença e escuta',
  'Compreender pertencimento, ordem e equilíbrio',
  'Conhecer formatos de trabalho sistêmico',
  'Utilizar bonecos, objetos, papéis e âncoras',
  'Formular perguntas com mais clareza',
  'Conduzir exercícios introdutórios com responsabilidade',
  'Reconhecer limites éticos e integrar aprendizados',
]

const materiais = [
  'Apostila digital dos oito módulos',
  'Caderno de práticas e registros',
  'Modelo de genograma',
  'Roteiro de entrevista inicial',
  'Ficha de observação sistêmica',
  'Guia de práticas com bonecos e objetos',
  'Manual introdutório dos bonecos na água',
  'Banco de perguntas sistêmicas',
  'Guia de ética e limites de atuação',
  'Estudos de caso comentados',
  'Acesso à plataforma durante o período definido',
  'Certificado conforme critérios institucionais',
]

const certificacao = [
  'Frequência mínima definida pelo Instituto Despertamente',
  'Participação nas vivências e práticas propostas',
  'Realização das atividades na plataforma',
  'Entrega do genograma ou atividade integradora',
  'Participação na prática supervisionada',
  'Aceite e aplicação das orientações éticas',
]

const faqItems = [
  {
    q: 'Preciso ter conhecimento prévio em Constelação Familiar?',
    a: 'Não. Essa é a porta de entrada — não é necessário possuir conhecimento prévio em Constelação Familiar Sistêmica para começar.',
  },
  {
    q: 'Como funciona a carga horária e o formato?',
    a: '3 meses, 8 módulos, 12 aulas, em 6 ciclos quinzenais. Cada ciclo combina um encontro ao vivo pelo Meet (1h30 a 2h) com uma semana de integração na plataforma — estudo, leitura e atividade orientada.',
  },
  {
    q: 'O que recebo além das aulas ao vivo?',
    a: 'Apostila digital dos oito módulos, caderno de práticas, modelo de genograma, roteiros, fichas, guias e estudos de caso — todo material fica disponível na plataforma durante o período da formação.',
  },
  {
    q: 'Como funciona a certificação?',
    a: 'O certificado representa participação, aprendizagem e compromisso com a jornada — as entregas não ficam concentradas no último encontro. Exige frequência mínima, participação nas vivências e práticas, atividades realizadas na plataforma, entrega do genograma (ou atividade integradora), participação na prática supervisionada e aceite das orientações éticas.',
  },
  {
    q: 'Essa formação substitui terapia ou uma formação em Psicanálise?',
    a: 'Não. É uma formação introdutória em Constelação Familiar Sistêmica, com limites éticos claros entre facilitação, aconselhamento e psicoterapia. Não promete resultado nem substitui acompanhamento clínico — quando a situação exige, o encaminhamento faz parte do próprio conteúdo ensinado.',
  },
  {
    q: 'Quais as formas de pagamento?',
    a: 'R$ 497 à vista no Pix, ou em até 12x de R$ 50,88 no cartão.',
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ConstelacaoContent({ product }: { product: ProductData | null }) {
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
              Instituto Despertamente · Formação em Constelação Familiar Sistêmica
            </p>
            <h1
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-[56px] sm:text-[76px] lg:text-[92px] font-bold leading-[0.97] text-[#f0f0f0] tracking-tight"
            >
              Despertar<br />Sistêmico.
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
              Reconhecer a origem. Compreender os vínculos. Ocupar o próprio lugar. Escolher um novo movimento.
            </p>
            <div className="flex flex-col items-start sm:items-end gap-3">
              <a
                href="#investimento"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-7 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors whitespace-nowrap"
              >
                Garantir minha vaga
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <p className="text-[11px] font-mono text-[#303030]">3 meses · 8 módulos · 12 aulas</p>
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
            Existem experiências que parecem se repetir mesmo quando mudamos de ambiente, relacionamento ou fase da vida.{' '}
            <span className="text-[#c8c8c8]">
              O convite é olhar além do comportamento aparente, perceber os vínculos que sustentam cada história
            </span>{' '}
            e construir novas possibilidades de posicionamento diante da própria vida.
          </p>
        </Reveal>
      </section>

      {/* ── PROPÓSITO (5 PILARES) ────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
            >
              Conhecimento que se<br />transforma em experiência.
            </h2>
            <p className="text-xs font-mono text-[#383838] pb-1">Propósito da formação</p>
          </div>
          <p className="text-sm text-[#484848] leading-relaxed max-w-2xl mb-10">
            Formar alunos capazes de compreender os princípios do pensamento sistêmico, reconhecer padrões
            familiares recorrentes e utilizar recursos introdutórios da abordagem com responsabilidade, respeito,
            presença e consciência dos limites da prática.
          </p>
          <div className="divide-y divide-white/5">
            {pilares.map((p) => (
              <div key={p.numero} className="py-5 flex items-center gap-5 first:pt-0">
                <span className="text-xs font-mono text-[#383838] w-5 shrink-0">{p.numero}</span>
                <p className="text-sm font-medium text-[#c0c0c0] w-32 shrink-0">{p.titulo}</p>
                <p className="text-sm text-[#505050]">{p.texto}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── DOIS AMBIENTES ───────────────────────── */}
      <Reveal>
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] mb-10"
            >
              Uma formação em<br />dois ambientes.
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {ambientes.map((a) => (
                <div key={a.titulo} className="space-y-2 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-xs font-mono text-[#FFB800]/70 uppercase tracking-wide">{a.titulo}</p>
                  <p className="text-sm font-semibold text-[#d0d0d0]">{a.sub}</p>
                  <p className="text-sm text-[#505050] leading-relaxed">{a.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── OS 8 MÓDULOS ──────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-[1fr_auto] items-end gap-4 mb-10">
            <h2
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
            >
              O mapa completo<br />da formação.
            </h2>
            <p className="text-xs font-mono text-[#383838] pb-1">8 módulos · 12 aulas</p>
          </div>

          <Accordion type="single" collapsible defaultValue="01">
            <div className="divide-y divide-white/5">
              {modulos.map((m) => (
                <AccordionItem key={m.numero} value={m.numero} className="border-0">
                  <AccordionTrigger className="hover:no-underline py-5 text-left group w-full">
                    <div className="flex items-center gap-5 w-full pr-4">
                      <span className="text-xs font-mono text-[#383838] w-5 shrink-0">{m.numero}</span>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-[#c0c0c0] group-hover:text-[#f0f0f0] transition-colors block">
                          {m.titulo}
                        </span>
                        <span className="text-[11px] font-mono text-[#383838]">{m.aulas}</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 pl-10 space-y-4">
                    <ul className="space-y-2">
                      {m.conteudo.map((c) => (
                        <li key={c} className="text-sm text-[#505050] leading-relaxed">{c}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-[#FFB800]/70 leading-relaxed border-l-2 border-[#FFB800]/20 pl-3">
                      Experiência de aprendizagem: {m.vivencia}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </div>
          </Accordion>
        </section>
      </Reveal>

      {/* ── PARA QUEM É ───────────────────────────── */}
      <Reveal>
        <section className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20 grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] leading-tight"
              >
                Para quem deseja<br />olhar além do<br />aparente.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
                Não é necessário possuir conhecimento prévio em Constelação Familiar.
              </p>
            </div>
            <ul className="divide-y divide-white/5">
              {paraQuem.map((item) => (
                <li key={item} className="py-4 text-sm text-[#505050] first:pt-0 leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* ── COMPETÊNCIAS ──────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <h2
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            className="text-4xl sm:text-5xl font-bold text-[#f0f0f0] mb-10"
          >
            O que você vai<br />desenvolver.
          </h2>
          <div className="grid sm:grid-cols-2 gap-x-12">
            <ul className="divide-y divide-white/5">
              {competencias.slice(0, 5).map((c) => (
                <li key={c} className="py-4 flex items-start gap-3 first:pt-0">
                  <Check className="h-4 w-4 text-[#FFB800]/60 shrink-0 mt-0.5" />
                  <span className="text-sm text-[#505050] leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-white/5">
              {competencias.slice(5).map((c) => (
                <li key={c} className="py-4 flex items-start gap-3 first:pt-0">
                  <Check className="h-4 w-4 text-[#FFB800]/60 shrink-0 mt-0.5" />
                  <span className="text-sm text-[#505050] leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* ── MATERIAIS DO ALUNO ────────────────────── */}
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
              {materiais.map((item) => (
                <li key={item} className="py-4 text-sm text-[#505050] first:pt-0">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* ── CERTIFICAÇÃO ──────────────────────────── */}
      <Reveal>
        <section className="max-w-5xl mx-auto px-6 sm:px-10 py-20">
          <div className="grid sm:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                Certificação.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
                O certificado representa participação, aprendizagem e compromisso com a jornada. Por isso, as
                entregas não ficam concentradas no último encontro.
              </p>
            </div>
            <ul className="divide-y divide-white/5">
              {certificacao.map((item) => (
                <li key={item} className="py-4 text-sm text-[#505050] first:pt-0">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* ── INVESTIMENTO ─────────────────────────── */}
      <Reveal>
        <section id="investimento" className="bg-[#0d0d0d] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20 grid sm:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="space-y-4">
              <h2
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className="text-4xl sm:text-5xl font-bold text-[#f0f0f0]"
              >
                Investimento.
              </h2>
              <p className="text-sm text-[#484848] leading-relaxed">
                3 meses de formação, encontros quinzenais ao vivo, plataforma completa e certificação.
              </p>
            </div>
            <div className="space-y-6 p-8 rounded-2xl bg-white/[0.02] border border-white/5">
              <div>
                <p className="text-xs font-mono text-[#383838] uppercase tracking-wide mb-1">À vista no Pix</p>
                <p
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  className="text-5xl font-bold text-[#FFB800]"
                >
                  R$ 497
                </p>
              </div>
              <div className="h-px bg-white/5" />
              <div>
                <p className="text-xs font-mono text-[#383838] uppercase tracking-wide mb-1">Ou parcelado</p>
                <p className="text-lg text-[#c0c0c0]">até 12x de <span className="font-bold text-[#f0f0f0]">R$ 50,88</span> no cartão</p>
              </div>
              <div className="h-px bg-white/5" />
              <FormacaoInscricaoForm slug={SLUG} />
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs text-[#505050] hover:text-[#808080] transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Prefiro tirar uma dúvida antes
              </a>
            </div>
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
            Outras dúvidas?{' '}
            <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="text-[#555555] hover:text-[#888888] transition-colors underline underline-offset-2">
              Fale diretamente com a equipe.
            </a>
          </p>
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
            Você não precisa<br />rejeitar sua história<br />para mudar de rumo.
          </h2>
          <p className="text-sm text-[#484848] max-w-lg leading-relaxed">
            Conhecer o próprio sistema não significa procurar culpados ou transformar o passado em sentença.
            Significa reconhecer os vínculos que nos formaram e perceber que pertencimento não precisa significar repetição.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href="#investimento"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-[#FFB800] px-8 py-4 text-base font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
              style={{ boxShadow: '0 8px 32px rgba(255,184,0,0.22)' }}
            >
              Garantir minha vaga
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              href="/programas/psicanalise-integrativa"
              className="inline-flex items-center py-4 text-sm text-[#444444] hover:text-[#707070] transition-colors"
            >
              → Ver outras formações
            </Link>
          </div>
          <p className="text-xs font-mono text-[#303030]">
            3 meses · 8 módulos · 12 aulas · Encontros ao vivo + plataforma + certificação
          </p>
        </Reveal>
      </section>
    </>
  )
}
