'use client'

/**
 * Formação em Psicanálise Clínica Integrativa — página do site institucional.
 *
 * ORIGEM DO CONTEÚDO (22/11/2026): é a `formacao.idmpsi.com.br` (repositório
 * `lead-direto`), a página de captação que o time já roda em tráfego pago.
 * O Pedro pediu pra trazer ela "inteira" pro institucional: mesmo texto,
 * mesma ordem, mesmos números, mesmas ofertas. O que mudou é só a roupa --
 * saiu o visual de landing page (gradiente, sombra, dourado em tudo) e
 * entrou o design system do site (plano, linha de 1px, dourado contado).
 *
 * Por isso NÃO invente, resuma ou "melhore" copy aqui. Se o texto tiver que
 * mudar, muda nos dois lugares -- senão a pessoa que vê o anúncio e a que
 * chega pelo Google recebem promessas diferentes.
 *
 * Preços ficam fixos no código (R$3.750 original, R$1.500 Pix, 12x R$150,
 * 15x R$150) porque é assim na página de origem. Não vêm de `products`:
 * duas fontes de preço é a receita pra anunciar valor que a gente não cobra.
 */

import { useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Award,
  Brain,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Infinity as InfinityIcon,
  Lightbulb,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  X,
} from 'lucide-react'
import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'

/* ── Dados (texto literal da página de origem) ─────────────────────────── */

const SELOS = [
  'Certificado Universitário',
  'Diretrizes do MEC',
  'Anhanguera',
  'Validade Nacional',
]

const DESTAQUES = [
  {
    icone: Globe,
    titulo: 'Formação 100% online',
    texto: 'Estude no seu ritmo, de qualquer lugar do mundo',
  },
  {
    icone: Clock,
    titulo: 'Duração: 14 meses',
    texto: 'Tempo ideal para absorver todo o conhecimento',
  },
  {
    icone: Award,
    titulo: 'Certificado reconhecido',
    texto: 'Validação oficial da sua formação',
  },
  {
    icone: InfinityIcon,
    titulo: 'Acesso vitalício à plataforma',
    texto: 'Revise o conteúdo sempre que precisar',
  },
]

const POR_QUE = [
  {
    titulo: 'Autocura e Autoconhecimento',
    texto: 'Trabalhe suas próprias questões enquanto se capacita',
  },
  {
    titulo: 'Metodologia Comprovada',
    texto: 'Baseada nos fundamentos clássicos da Psicanálise',
  },
  {
    titulo: 'Realização Profissional',
    texto: 'Uma nova carreira de propósito e significado',
  },
]

const ARCOS = [
  {
    numero: '01',
    titulo: 'O Inconsciente',
    icone: Brain,
    topicos: [
      'Freud e os fundamentos da Psicanálise',
      'Jung e o inconsciente coletivo',
      'Lacan e o inconsciente estruturado',
      'Aparelho psíquico e suas instâncias',
      'Mecanismos de defesa do Ego',
    ],
  },
  {
    numero: '02',
    titulo: 'A Infância',
    icone: Heart,
    topicos: [
      'Complexo de Narciso',
      'Complexo de Édipo',
      'Estruturas clínicas fundamentais',
      'Melanie Klein e o mundo infantil',
      'Winnicott e o desenvolvimento emocional',
    ],
  },
  {
    numero: '03',
    titulo: 'As Manifestações',
    icone: Users,
    topicos: [
      'Transtornos psicossomáticos',
      'Distúrbios de personalidade',
      'Vícios e compulsões',
      'Comportamento suicida',
      'TEA e TDAH na perspectiva psicanalítica',
    ],
  },
  {
    numero: '04',
    titulo: 'As Técnicas Aplicadas',
    icone: Lightbulb,
    topicos: [
      'Constelação familiar sistêmica',
      'Hipnose clínica',
      'Programação Neurolinguística (PNL)',
      'Empreendedorismo em Psicanálise',
      'Marketing para psicanalistas',
    ],
  },
]

// Bônus da Black IDM, conforme o roteiro do Rodrygo (24/11/2026).
const BONUS = [
  { icone: Users, titulo: '10 Sessões de Supervisão Clínica', valor: 'R$ 1.200,00', texto: 'Acompanhamento dos seus primeiros atendimentos com supervisores experientes' },
  { icone: Brain, titulo: 'Curso Practitioner em PNL', valor: 'R$ 790,00', texto: 'Formação em Programação Neurolinguística', selo: 'Encontros ao vivo' },
  { icone: Heart, titulo: '3 Sessões de Análise', valor: 'R$ 540,00', texto: 'Sua análise pessoal começando junto com a formação' },
  { icone: Heart, titulo: 'Workshop "Cicatrizes que Curam"', valor: 'R$ 150,00', texto: 'Melancolia, ansiedade, luto e depressão pela ótica da Psicanálise', selo: 'Encontro ao vivo' },
  { icone: Users, titulo: 'Workshop "O Despertar Sistêmico"', valor: 'R$ 150,00', texto: 'O olhar da Constelação Familiar sobre os vínculos', selo: 'Encontro ao vivo' },
  { icone: Sparkles, titulo: 'Workshop "O Despertar da Energia Vital"', valor: 'R$ 150,00', texto: 'Alinhamento dos chakras', selo: 'Encontro ao vivo' },
  { icone: Target, titulo: 'Workshop "O Despertar dos Números"', valor: 'R$ 150,00', texto: 'Numerologia Pitagórica Sistêmica', selo: 'Encontro ao vivo' },
  { icone: Lightbulb, titulo: 'Workshop "Reprogramando sua Mente com PNL"', valor: 'R$ 150,00', texto: 'Ferramentas da PNL aplicadas ao dia a dia', selo: 'Encontro ao vivo' },
]

const PAGAMENTOS = [
  {
    icone: Sparkles,
    titulo: 'PIX à vista',
    valor: 'R$ 1.500,00',
    texto: 'Pagamento à vista no PIX',
    total: null as string | null,
    itens: ['Maior desconto', 'Acesso imediato', 'Todos os bônus inclusos'],
    melhor: true,
  },
  {
    icone: CreditCard,
    titulo: 'Cartão de Crédito',
    valor: '12x R$ 137,00',
    texto: 'Parcelado no Cartão de Crédito',
    total: 'R$ 1.644,00',
    itens: ['Sem juros', 'Acesso imediato', 'Parcelas fixas'],
    melhor: false,
  },
  {
    icone: FileText,
    titulo: 'Boleto ou Cartão Recorrente',
    valor: '15x R$ 139,00',
    texto: 'No boleto bancário ou cartão recorrente',
    total: 'R$ 2.085,00',
    itens: ['Boleto ou cartão, você escolhe', 'Mais parcelas', 'Facilita o orçamento'],
    melhor: false,
  },
]

const INCLUSO = [
  {
    icone: Award,
    titulo: 'Acesso vitalício',
    texto: 'Estude no seu ritmo, para sempre',
  },
  {
    icone: CheckCircle,
    titulo: 'Certificado reconhecido',
    texto: 'Extensão Universitária nas diretrizes do MEC',
  },
  {
    icone: Users,
    titulo: 'Comunidade exclusiva',
    texto: 'Networking com outros profissionais',
  },
]

const NUMEROS = [
  { icone: Users, numero: '5.000+', rotulo: 'Alunos Formados' },
  { icone: Award, numero: '98%', rotulo: 'Satisfação' },
  { icone: Target, numero: '14', rotulo: 'Meses de Formação' },
  { icone: Heart, numero: '100%', rotulo: 'Transformação' },
]

// Vídeos servidos do nosso R2 (regra do Pedro: vídeo de página nunca é
// embed de terceiros). Os ids são os dos Shorts originais, usados como nome
// do arquivo. São verticais (9:16).
const R2_DEPOIMENTOS = 'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/site/depoimentos'

const DEPOIMENTOS = [
  { id: 'wDQiV0VoBT4', frase: 'Transformei minha vida através da psicanálise.' },
  { id: 'D4xbxCXSWoM', frase: 'A formação do iDM transformou completamente minha vida.' },
  { id: 'g5-wCsj1D_0', frase: 'O método integrativo me deu ferramentas práticas que uso no dia a dia.' },
  { id: 'PxDfmS4vvM8', frase: 'Recomendo o iDM para quem busca uma formação séria em Psicanálise.' },
  { id: 'B_lpIOk1RQo', frase: 'A metodologia do iDM é única e transformadora.' },
  { id: 'aYncgEhrXgs', frase: 'O iDM me deu as bases que eu precisava como psicanalista.' },
]

/* ── Utilidades visuais ────────────────────────────────────────────────── */

function Reveal({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' as `${number}px` })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Faixa de credenciamento. Aparece duas vezes na página de origem. */
function BlocoMec({ comRodape = true }: { comRodape?: boolean }) {
  return (
    <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <GraduationCap className="h-10 w-10 shrink-0" style={{ color: 'var(--fds-accent)' }} />
        <div>
          <p className="fds-eyebrow block">Extensão universitária</p>
          <h3 className="fds-h3 mt-3">Curso nas diretrizes do MEC</h3>
          <p className="fds-lead mt-4">
            Extensão Universitária em parceria oficial com <strong>Anhanguera</strong>.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {SELOS.map(selo => (
              <div key={selo} className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                <span className="fds-small">{selo}</span>
              </div>
            ))}
          </div>
          {comRodape && (
            <p className="fds-small mt-6" style={{ color: 'var(--fds-ink-4)' }}>
              Anhanguera faz parte do maior grupo educacional do Brasil — seu certificado
              carrega esse peso.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Black IDM ─────────────────────────────────────────────────────────
 * Promoção de Black Friday liberada pelo Rodrygo em 24/11/2026. Pra
 * encerrar: BLACK_ATIVA = false e voltar os preços de PAGAMENTOS e a
 * lista de BONUS pros valores normais. */
const BLACK_ATIVA = true

function FaixaBlack({ compacta = false }: { compacta?: boolean }) {
  if (!BLACK_ATIVA) return null
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center"
      style={{
        background: 'var(--fds-accent)',
        color: '#080808',
        padding: compacta ? '10px 16px' : '14px 16px',
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      <span style={{ background: '#080808', color: 'var(--fds-accent)', padding: '2px 10px', borderRadius: 4, fontSize: 13, letterSpacing: '0.12em' }}>
        BLACK IDM
      </span>
      <span style={{ fontSize: compacta ? 14 : 15 }}>
        Promoção de Black Friday liberada · 52% de desconto + R$ 3.280 em bônus
      </span>
    </div>
  )
}

/* ── Página ────────────────────────────────────────────────────────────── */

export function PsicanaliseContent() {
  const [video, setVideo] = useState<string | null>(null)

  return (
    <div className="fds">
      <FaixaBlack />
      {/* ══ ABERTURA ═══════════════════════════════════════════════════ */}
      <section className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">{BLACK_ATIVA ? 'Black IDM · Black Friday liberada' : 'Formação reconhecida'}</p>
            <p className="fds-meta mt-4">
              {BLACK_ATIVA
                ? 'Condição especial de Black Friday · 15x R$ 139 no boleto ou R$ 1.500 no PIX'
                : 'Matrículas abertas · Turmas iniciando todo mês'}
            </p>

            <h1 className="fds-display mt-8 max-w-4xl">
              Desperte o Psicanalista que há <span className="fds-accent">dentro de você</span>
            </h1>

            <p className="fds-lead mt-8">
              <strong style={{ color: 'var(--fds-ink)' }}>
                Comece agora a transformar sua vida.
              </strong>{' '}
              Dê o primeiro passo hoje mesmo. Porque antes de cuidar do outro, você aprende a
              cuidar de si.
            </p>
          </Reveal>

          <Reveal className="mt-12" style={{ maxWidth: 760 }}>
            <BlocoMec />
          </Reveal>

          <Reveal className="mt-12">
            <h2 className="fds-h2 max-w-3xl">
              Sua vida está prestes a tomar um <span className="fds-accent">novo rumo</span>
            </h2>
            <p className="fds-lead mt-6">
              Descubra como acessar o poder do inconsciente, dominar suas emoções e transformar
              a si mesmo e ao mundo ao seu redor — <strong style={{ color: 'var(--fds-ink)' }}>
                mesmo começando do zero.</strong>
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                'Ao vivo (Meet) + Gravação + Área de Membros',
                '14 meses',
                'Certificado',
                'Acesso vitalício',
              ].map(item => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                  <span className="fds-small">{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-6">
              <LeadWhatsappCta texto="Quero transformar minha vida" />
              <p className="fds-meta">{BLACK_ATIVA ? 'Black IDM · condição de Black Friday por tempo limitado' : 'Matrículas abertas · Turmas iniciando todo mês'}</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ VISÃO GERAL ════════════════════════════════════════════════ */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">A formação</p>
            <h2 className="fds-h2 mt-4 max-w-4xl">
              Formação em <span className="fds-accent">Psicanálise Clínica Integrativa</span>
            </h2>
            <p className="fds-lead mt-6">
              Uma jornada completa de transformação pessoal e profissional baseada no método
              tradicional de Freud: <strong style={{ color: 'var(--fds-ink)' }}>Teoria</strong>,{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Análise Pessoal</strong> e{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Supervisão</strong>.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--fds-line)' }}>
            {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
              <div key={titulo} style={{ background: 'var(--fds-bg)', padding: 'var(--fds-8)' }}>
                <Icone className="h-5 w-5" style={{ color: 'var(--fds-accent)' }} />
                <h3 className="fds-h3 mt-6" style={{ fontSize: '1.25rem' }}>{titulo}</h3>
                <p className="fds-small mt-3">{texto}</p>
              </div>
            ))}
          </div>

          <Reveal className="mt-24">
            <h2 className="fds-h2 max-w-3xl">
              Por que escolher a <span className="fds-accent">Psicanálise Integrativa</span>
            </h2>
            <div className="fds-list mt-10" style={{ maxWidth: 820 }}>
              {POR_QUE.map(({ titulo, texto }) => (
                <div key={titulo} className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-8">
                  <h3 className="fds-h3 shrink-0" style={{ fontSize: '1.125rem', minWidth: 280 }}>
                    {titulo}
                  </h3>
                  <p className="fds-body" style={{ margin: 0 }}>{texto}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="mt-16">
            <LeadWhatsappCta texto="Garanta sua vaga" />
          </Reveal>
        </div>
      </section>

      {/* ══ CONTEÚDO DO CURSO ══════════════════════════════════════════ */}
      <section className="fds-band fds-section">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">Conteúdo do curso</p>
            <h2 className="fds-h2 mt-4 max-w-4xl">
              Quatro arcos, do básico ao <span className="fds-accent">domínio completo</span>
            </h2>
            <p className="fds-lead mt-6">
              Uma jornada estruturada em 4 arcos fundamentais que levarão você do básico ao
              domínio completo da Psicanálise Clínica Integrativa.
            </p>
          </Reveal>

          <Reveal className="mt-16" style={{ maxWidth: 820 }}>
            <h3 className="fds-h3">O Tripé Psicanalítico</h3>
            <p className="fds-body mt-5">
              Como proposto por Freud, nossa formação se baseia nos três pilares essenciais:{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Teoria Psicanalítica</strong>,{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Análise Pessoal</strong> e{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Supervisão Clínica</strong>. Essa
              estrutura garante uma formação completa e transformadora.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-px md:grid-cols-2" style={{ background: 'var(--fds-line)' }}>
            {ARCOS.map(({ numero, titulo, icone: Icone, topicos }) => (
              <div key={numero} style={{ background: 'var(--fds-surface)', padding: 'var(--fds-12)' }}>
                <div className="flex items-center gap-4">
                  <span className="fds-meta" style={{ color: 'var(--fds-accent)' }}>{numero}</span>
                  <Icone className="h-5 w-5" style={{ color: 'var(--fds-ink-3)' }} />
                </div>
                <h3 className="fds-h3 mt-6">{titulo}</h3>
                <ul className="mt-6 space-y-3">
                  {topicos.map(topico => (
                    <li key={topico} className="flex items-start gap-3">
                      <CheckCircle className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                      <span className="fds-small">{topico}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Reveal className="mt-16" style={{ maxWidth: 820 }}>
            <h3 className="fds-h3">Metodologia exclusiva do iDM</h3>
            <p className="fds-body mt-5">
              Nossa abordagem integrativa combina os fundamentos clássicos da Psicanálise com
              técnicas modernas comprovadas, proporcionando uma formação completa e prática para
              sua atuação profissional.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ BÔNUS ══════════════════════════════════════════════════════ */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">{BLACK_ATIVA ? 'Bônus da Black IDM' : 'Bônus exclusivos'}</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">
              Garanta hoje e receba <span className="fds-accent">grátis</span>
            </h2>
            <p className="fds-lead mt-6">
              Além da formação completa, você recebe bônus especiais que potencializam ainda mais
              seu desenvolvimento profissional.
            </p>
          </Reveal>

          <div className="fds-list mt-16" style={{ maxWidth: 900 }}>
            {BONUS.map(({ icone: Icone, titulo, valor, texto, selo }) => (
              <div key={titulo} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
                <Icone className="h-5 w-5 shrink-0 sm:mt-1" style={{ color: 'var(--fds-ink-3)' }} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    <h3 className="fds-h3" style={{ fontSize: '1.125rem' }}>{titulo}</h3>
                    {selo && <span className="fds-badge">{selo}</span>}
                  </div>
                  <p className="fds-small mt-2">{texto}</p>
                </div>
                <p className="fds-meta shrink-0" style={{ color: 'var(--fds-ink-2)' }}>{valor}</p>
              </div>
            ))}
          </div>

          <Reveal className="mt-16 flex flex-wrap items-baseline gap-x-8 gap-y-4">
            <div>
              <p className="fds-meta">Valor total dos bônus</p>
              <p className="fds-h2 mt-3">
                <span className="fds-accent">R$ 3.280,00</span>
              </p>
            </div>
            <div className="flex items-start gap-3" style={{ maxWidth: 420 }}>
              <Gift className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
              <p className="fds-small">
                Presentes do Instituto para quem entrar na formação durante a Black IDM,
                a promoção de Black Friday do Instituto Despertamente.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ INVESTIMENTO ═══════════════════════════════════════════════ */}
      <FaixaBlack compacta />
      <section className="fds-band fds-section" id="investimento">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">Black IDM · Investimento</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">
              Black Friday liberada na <span className="fds-accent">formação</span>
            </h2>
            <p className="fds-lead mt-6">
              Durante a Black IDM, a formação sai com mais de 52% de desconto sobre o valor de
              referência, e todos os bônus acima vêm junto.
            </p>
          </Reveal>

          <Reveal className="mt-16 flex flex-wrap items-end gap-x-16 gap-y-8">
            <div>
              <p className="fds-meta">Valor de referência</p>
              <p className="fds-h3 mt-3" style={{ color: 'var(--fds-ink-4)', textDecoration: 'line-through' }}>
                15x R$ 290,00
              </p>
              <p className="fds-small mt-2">R$ 4.350,00 no total</p>
            </div>
            <div>
              <p className="fds-meta">Preço Black IDM</p>
              <p className="fds-display mt-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)' }}>
                <span className="fds-accent">R$ 1.500,00</span>
              </p>
              <p className="fds-small mt-2">à vista no PIX · ou 15x R$ 139,00 no boleto</p>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-px md:grid-cols-3" style={{ background: 'var(--fds-line)' }}>
            {PAGAMENTOS.map(({ icone: Icone, titulo, valor, texto, total, itens, melhor }) => (
              <div key={titulo} style={{ background: 'var(--fds-surface)', padding: 'var(--fds-8)' }}>
                <div className="flex items-center justify-between gap-4">
                  <Icone className="h-5 w-5" style={{ color: melhor ? 'var(--fds-accent)' : 'var(--fds-ink-3)' }} />
                  {melhor && <span className="fds-badge" style={{ color: 'var(--fds-accent)' }}>Melhor oferta</span>}
                </div>
                <h3 className="fds-h3 mt-6" style={{ fontSize: '1.125rem' }}>{titulo}</h3>
                <p className="fds-h3 mt-4" style={{ fontSize: '1.5rem', color: melhor ? 'var(--fds-accent)' : 'var(--fds-ink)' }}>
                  {valor}
                </p>
                <p className="fds-small mt-3">{texto}</p>
                {total && <p className="fds-meta mt-2">Total: {total}</p>}
                <ul className="mt-6 space-y-2">
                  {itens.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fds-ink-4)' }} />
                      <span className="fds-small">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Reveal className="mt-16">
            <h3 className="fds-h3">O que está incluído no seu investimento</h3>
            <div className="fds-list mt-8" style={{ maxWidth: 820 }}>
              {INCLUSO.map(({ icone: Icone, titulo, texto }) => (
                <div key={titulo} className="flex items-start gap-4">
                  <Icone className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                  <div>
                    <h4 className="fds-small" style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>{titulo}</h4>
                    <p className="fds-small mt-1">{texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="mt-16 flex flex-wrap items-center gap-6">
            <LeadWhatsappCta texto="Quero garantir minha vaga" />
            <p className="fds-meta">{BLACK_ATIVA ? 'Black IDM · condição de Black Friday por tempo limitado' : 'Matrículas abertas · Turmas iniciando todo mês'}</p>
          </Reveal>
        </div>
      </section>

      {/* ══ SOBRE O INSTITUTO ══════════════════════════════════════════ */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">Sobre o Instituto</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">Nossa missão</h2>
            <div style={{ maxWidth: 740 }}>
              <p className="fds-lead mt-8">
                O Instituto DespertaMENTE nasceu com o propósito de{' '}
                <strong style={{ color: 'var(--fds-ink)' }}>acolher, curar e transformar vidas</strong>{' '}
                por meio da Psicanálise Integrativa.
              </p>
              <p className="fds-body mt-6">
                Já formamos milhares de alunos com um método que une teoria sólida, análise
                pessoal e supervisão — como propôs Freud.
              </p>
              <p className="fds-h3 mt-8" style={{ fontSize: '1.375rem' }}>
                Acreditamos que a Psicanálise é um direito de todos.
              </p>
            </div>
          </Reveal>

          <Reveal className="mt-24" style={{ maxWidth: 820 }}>
            <BlocoMec comRodape={false} />
            <p className="fds-body mt-8">
              Isso significa que ao concluir sua formação, você receberá um certificado
              universitário com validade nacional, emitido por uma instituição de ensino de
              qualidade.
            </p>
          </Reveal>

          <div className="mt-24 grid items-center gap-16 lg:grid-cols-2">
            <Reveal>
              <h3 className="fds-h3">Certificação reconhecida</h3>
              <p className="fds-body mt-6">
                Nosso certificado é reconhecido e validado, dando a você a credibilidade
                necessária para atuar profissionalmente.
              </p>
              <p className="fds-body mt-5">
                Ao concluir a formação, você estará apto a exercer a Psicanálise Clínica com toda
                a base teórica e prática necessárias.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Certificado com validade nacional',
                  'Reconhecimento profissional',
                  'Base para especialização continuada',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} />
                    <span className="fds-small">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="fds-card" style={{ padding: 'var(--fds-4)' }}>
              <Image
                src="/images/certificado-idm.png"
                alt="Certificado do Instituto DespertaMENTE"
                width={800}
                height={564}
                className="w-full rounded"
                style={{ borderRadius: 6 }}
              />
            </Reveal>
          </div>

          <Reveal className="mt-24">
            <h3 className="fds-h3">Números que comprovam nossa excelência</h3>
            <div className="mt-10 grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--fds-line)' }}>
              {NUMEROS.map(({ icone: Icone, numero, rotulo }) => (
                <div key={rotulo} style={{ background: 'var(--fds-bg)', padding: 'var(--fds-8)' }}>
                  <Icone className="h-4 w-4" style={{ color: 'var(--fds-ink-4)' }} />
                  <p className="fds-h2 mt-6" style={{ fontSize: '2.5rem' }}>{numero}</p>
                  <p className="fds-meta mt-3">{rotulo}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ DEPOIMENTOS ════════════════════════════════════════════════ */}
      <section className="fds-band fds-section">
        <div className="fds-wrap">
          <Reveal>
            <p className="fds-eyebrow block">Depoimentos</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">
              O que dizem nossos <span className="fds-accent">alunos</span>
            </h2>
            <p className="fds-lead mt-6">
              Histórias reais de transformação e sucesso profissional através da nossa formação em
              Psicanálise Clínica Integrativa.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DEPOIMENTOS.map(({ id, frase }) => (
              <button
                key={id}
                type="button"
                onClick={() => setVideo(id)}
                className="fds-card group text-left"
                style={{ padding: 'var(--fds-4)' }}
                aria-label={`Ver depoimento: ${frase}`}
              >
                <div className="relative overflow-hidden" style={{ borderRadius: 6 }}>
                  <Image
                    src={`${R2_DEPOIMENTOS}/${id}.jpg`}
                    alt=""
                    width={480}
                    height={270}
                    unoptimized
                    className="h-72 w-full object-cover object-top transition-opacity group-hover:opacity-80"
                  />
                  <span
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.25)' }}
                  >
                    <Play className="h-8 w-8" style={{ color: 'var(--fds-accent)' }} />
                  </span>
                </div>
                <div className="mt-4 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3 w-3" style={{ color: 'var(--fds-accent)', fill: 'currentColor' }} />
                  ))}
                </div>
                <p className="fds-small mt-3" style={{ color: 'var(--fds-ink-2)' }}>
                  &ldquo;{frase}&rdquo;
                </p>
                <p className="fds-meta mt-4">Aluno IDM · Ver depoimento</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FECHAMENTO ═════════════════════════════════════════════════ */}
      <FaixaBlack compacta />
      <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-24)' }}>
        <div className="fds-wrap">
          <h2 className="fds-h2 max-w-3xl">
            Comece agora a <span className="fds-accent">transformar sua vida</span>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <LeadWhatsappCta texto="Quero transformar minha vida" />
            <p className="fds-meta">{BLACK_ATIVA ? 'Black IDM · condição de Black Friday por tempo limitado' : 'Matrículas abertas · Turmas iniciando todo mês'}</p>
          </div>
        </div>
      </section>

      {/* Vídeo do depoimento: só monta quando alguém clica, pra página não
          baixar seis vídeos de uma vez. */}
      {video && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setVideo(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Depoimento em vídeo"
        >
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setVideo(null)}
              className="mb-3 ml-auto flex items-center gap-2"
              style={{ color: 'var(--fds-ink-2)' }}
            >
              <X className="h-5 w-5" /> <span className="fds-meta">Fechar</span>
            </button>
            <div className="w-full overflow-hidden" style={{ borderRadius: 8, aspectRatio: '9 / 16', background: '#000' }}>
              <video
                src={`${R2_DEPOIMENTOS}/${video}.mp4`}
                poster={`${R2_DEPOIMENTOS}/${video}.jpg`}
                controls
                autoPlay
                playsInline
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
