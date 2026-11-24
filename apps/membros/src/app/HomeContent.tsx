/**
 * Home do site institucional — direção "A — Vitrine", escolhida pelo Pedro em
 * 22/11/2026 no canvas de layouts.
 *
 * A ordem é a decisão de design: promessa em três linhas sobre uma foto real
 * de turma, e as formações logo na primeira rolada. Quem já sabe o que quer
 * não precisa ler o manifesto; quem hesita, desce e lê.
 *
 * Regras que esta página segue (e que valem pra quem mexer nela):
 * - Sem preço de formação na home (pedido do Pedro). Cada card diz a situação
 *   real da turma: matrículas abertas, data de início ou previsão.
 * - Fotos são de turmas reais do IDM pelo Brasil. Nada de banco de imagem.
 * - Depoimento só se for real (vídeo no R2). Nunca texto inventado.
 */

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DepoimentosVideo } from '@/components/marketing/DepoimentosVideo'
import { GaleriaCarrossel } from '@/components/marketing/GaleriaCarrossel'
import { postsPublicados, formatarData } from '@/content/blog'

const WHATSAPP = 'https://wa.me/5511930439385?text=' +
  encodeURIComponent('Olá! Vim pelo site do Instituto Despertamente e quero saber mais.')

type Card = {
  href: string
  titulo: string
  descricao: string
  situacao: string
  etiquetas: string[]
}

const FORMACOES: Card[] = [
  {
    href: '/programas/constelacao-familiar',
    titulo: 'Despertar Sistêmico — Constelação Familiar',
    descricao: '8 módulos, 12 aulas, encontros semanais ao vivo.',
    situacao: 'Turma 01 começa em 03 de dezembro',
    etiquetas: ['3 meses', 'Online ao vivo'],
  },
  {
    href: '/programas/mentoria-nps',
    titulo: 'Mentoria NPS — Numerologia Pitagórica',
    descricao: '2 encontros ao vivo por mês, gravações na área de membros e a plataforma que gera mapas numerológicos.',
    situacao: 'Assinatura mensal · entre quando quiser',
    etiquetas: ['Mensal', 'Online ao vivo'],
  },
  {
    href: '/programas/mentoria-npa',
    titulo: 'Mentoria NPA — Numerologia Aplicada',
    descricao: '6 sessões ao vivo, uma por semana, todas gravadas na plataforma.',
    situacao: 'Próxima turma: previsão 12 de janeiro',
    etiquetas: ['6 semanas', 'Online ao vivo'],
  },
  {
    href: '/programas/practitioner-pnl',
    titulo: 'Practitioner em PNL',
    descricao: '8 sessões ao vivo, uma por semana, todas gravadas na plataforma.',
    situacao: 'Próxima turma: previsão 2 de março',
    etiquetas: ['8 semanas', 'Online ao vivo'],
  },
]

const PILARES = [
  { titulo: 'Teoria', texto: 'Psicanálise, PNL, terapia breve e numerologia numa base só.' },
  { titulo: 'Prática', texto: 'Porque não basta aprender sobre a mente: é preciso vivenciar.' },
  { titulo: 'Supervisão', texto: 'Você conduz atendimento com alguém olhando junto.' },
]

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="fds-small"
      style={{ border: '1px solid var(--fds-line)', borderRadius: 4, padding: '5px 11px', color: 'var(--fds-ink-2)' }}
    >
      {children}
    </span>
  )
}

export function HomeContent() {
  const posts = postsPublicados().slice(0, 2)

  return (
    <div className="fds">
      {/* ── HERO: foto real de aula, véu só pra garantir leitura ───────── */}
      <section className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--fds-line)' }}>
        <Image
          src="/images/turmas/aula-sala-cheia.jpg"
          alt="Aula presencial do Instituto Despertamente, com a turma acompanhando a apresentação"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(100deg, rgba(8,9,13,0.97) 0%, rgba(8,9,13,0.92) 42%, rgba(8,9,13,0.45) 100%)' }}
        />
        <div className="fds-wrap relative" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-12)' }}>
          <div className="max-w-[640px]">
            <p className="fds-eyebrow block">Método Despertamente</p>
            <h1 className="fds-display mt-5">Desperte a mente que decide por você.</h1>
            <p className="fds-body mt-6" style={{ color: '#d4d5d9', fontSize: 18 }}>
              Formações em psicanálise, constelação, numerologia e PNL. Uma metodologia própria,
              construída em 20 anos de experiência.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#programas" className="fds-btn fds-btn--primary">Ver as formações</a>
              <a href="#metodologia" className="fds-btn fds-btn--ghost">Conhecer o método</a>
            </div>
          </div>

        </div>
      </section>

      {/* ── VITRINE DE FORMAÇÕES ─────────────────────────────────────── */}
      <section id="programas" className="fds-section">
        <div id="jornadas" className="fds-wrap">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="fds-eyebrow block">Formações</p>
              <h2 className="fds-h2 mt-4">Escolha por onde<br />você quer começar.</h2>
            </div>
            <p className="fds-body max-w-sm">Duração, formato e a situação de cada turma, sem precisar clicar pra descobrir.</p>
          </div>

          {/* Destaque: a formação principal */}
          <article
            className="mt-12 flex flex-wrap overflow-hidden"
            style={{ border: '1px solid var(--fds-accent)', borderRadius: 10, background: 'var(--fds-deep)' }}
          >
            <div className="relative min-h-[260px] w-full md:w-[420px]">
              <Image
                src="/images/turmas/turma-certificados.jpg"
                alt="Turma do Instituto reunida com os certificados"
                fill
                sizes="(min-width: 768px) 420px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="flex-1 basis-[380px] p-8 md:p-10">
              <p className="fds-eyebrow block">Formação principal</p>
              <h3 className="fds-h2 mt-3" style={{ fontSize: 32 }}>Psicanálise Clínica Integrativa</h3>
              <p className="fds-body mt-4">
                14 meses, 100% online, em 4 arcos. Certificado de Extensão Universitária nas
                diretrizes do MEC, em parceria com a Anhanguera. Acesso vitalício.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Etiqueta>14 meses</Etiqueta>
                <Etiqueta>Online</Etiqueta>
                <Etiqueta>Certificado MEC/Anhanguera</Etiqueta>
              </div>
              <p className="fds-small mt-6" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
                Matrículas abertas · turmas iniciando todo mês
              </p>
              <Link href="/programas/psicanalise-integrativa" className="fds-btn fds-btn--primary mt-5">
                Quero conhecer <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </article>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {FORMACOES.map(f => (
              <Link
                key={f.href}
                href={f.href}
                className="fds-card group flex flex-col gap-4"
                style={{ padding: 'var(--fds-8)' }}
              >
                <h3 className="fds-h3">{f.titulo}</h3>
                <p className="fds-body flex-grow">{f.descricao}</p>
                <div className="flex flex-wrap gap-2">
                  {f.etiquetas.map(e => <Etiqueta key={e}>{e}</Etiqueta>)}
                </div>
                <p className="fds-small" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>{f.situacao}</p>
                <span className="fds-small inline-flex items-center gap-1.5" style={{ color: 'var(--fds-ink)' }}>
                  Ver a formação <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>

          {/* Presencial */}
          <Link
            href="/programas/idm-pelo-brasil"
            className="group mt-6 flex flex-wrap items-center overflow-hidden"
            style={{ border: '1px solid var(--fds-line)', borderRadius: 10, background: 'var(--fds-surface)' }}
          >
            <div className="flex-1 basis-[380px] p-8 md:p-10">
              <p className="fds-eyebrow block">Presencial · IDM pelo Brasil</p>
              <h3 className="fds-h3 mt-3">Um dia com o Rodrygo, na sua cidade.</h3>
              <p className="fds-body mt-3">
                Numerologia em turmas de 4 horas (manhã ou tarde) e Psicanálise em imersão de dia inteiro.
              </p>
              <p className="fds-small mt-5" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
                Próximas: São Paulo em 05/12 · Santos em 12/12
              </p>
            </div>
            <div className="relative h-56 w-full md:h-auto md:min-h-[240px] md:w-[420px]">
              <Image
                src="/images/turmas/aula-sala-cheia.jpg"
                alt="Sala cheia durante uma aula presencial"
                fill
                sizes="(min-width: 768px) 420px, 100vw"
                className="object-cover"
              />
            </div>
          </Link>
        </div>
      </section>

      {/* ── MÉTODO ───────────────────────────────────────────────────── */}
      <section id="metodologia" className="fds-band fds-section">
        <div className="fds-wrap grid gap-16 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="fds-eyebrow block">O método</p>
            <h2 className="fds-h2 mt-4">Nem toda mudança<br />começa do lado de fora.</h2>
            <p className="fds-body mt-6">
              Muitas pessoas passam a vida tentando mudar seus resultados. Poucas aprendem a
              compreender os padrões que produzem esses resultados.
            </p>
            <p className="fds-body mt-4">
              No IDM, acreditamos que a consciência precede a transformação. Porque aquilo que você
              ilumina na consciência deixa de comandar você no escuro.
            </p>
          </div>
          <div className="flex flex-col gap-6 self-center">
            {PILARES.map((p, i) => (
              <div
                key={p.titulo}
                style={{ borderLeft: `1px solid ${i === 0 ? 'var(--fds-accent)' : 'var(--fds-line)'}`, paddingLeft: 20 }}
              >
                <h3 className="fds-body" style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>{p.titulo}</h3>
                <p className="fds-small mt-1">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TURMAS REAIS ─────────────────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="fds-eyebrow block">IDM pelo Brasil</p>
              <h2 className="fds-h2 mt-4">O método sai da tela<br />e vai pra sua cidade.</h2>
            </div>
            <Link href="/programas/idm-pelo-brasil" className="fds-small inline-flex items-center gap-1.5" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
              Ver as próximas cidades <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="mt-10">
          <GaleriaCarrossel compacta />
        </div>
      </section>

      {/* ── DEPOIMENTOS (vídeos reais, servidos do R2) ───────────────── */}
      <section id="depoimentos" className="fds-band fds-section">
        <div className="fds-wrap">
          <p className="fds-eyebrow block">Depoimentos</p>
          <h2 className="fds-h2 mt-4">Histórias de quem<br />olhou para dentro.</h2>
          <div className="mt-10">
            <DepoimentosVideo />
          </div>
        </div>
      </section>

      {/* ── DIVÃ + FRANQUIA ──────────────────────────────────────────── */}
      <section className="fds-band--deep" style={{ borderBottom: '1px solid var(--fds-line)' }}>
        <div className="fds-wrap grid gap-8 md:grid-cols-2" style={{ paddingBlock: 'var(--fds-16)' }}>
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex-1 basis-60">
              <h3 className="fds-h3">Não quer estudar — quer se tratar?</h3>
              <p className="fds-small mt-2">Divã IDM: terapia online a partir de R$ 70 a sessão, com psicanalistas formados aqui.</p>
            </div>
            <Link href="/programas/diva-idm" className="fds-small whitespace-nowrap" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
              Conhecer o Divã →
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-5 md:border-l md:pl-8" style={{ borderColor: 'var(--fds-line)' }}>
            <div className="flex-1 basis-60">
              <h3 className="fds-h3">Quer levar o IDM pra sua cidade?</h3>
              <p className="fds-small mt-2">Conheça o modelo da Franquia IDM PSI.</p>
            </div>
            <a href="https://www.idmpsifranquia.com.br" className="fds-small whitespace-nowrap" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
              Ser um franqueado →
            </a>
          </div>
        </div>
      </section>

      {/* ── BLOG: faixa inteira, últimos 2 posts (só aparece com post real) ── */}
      {posts.length > 0 && (
        <section
          id="blog"
          className="relative overflow-hidden"
          style={{
            borderTop: '1px solid var(--fds-line)',
            borderBottom: '1px solid var(--fds-line)',
            background:
              'radial-gradient(1200px 500px at 85% 0%, rgba(255,184,0,0.10), transparent 60%), var(--fds-deep)',
          }}
        >
          <div className="fds-wrap grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16" style={{ paddingTop: 'var(--fds-24)', paddingBottom: 'var(--fds-24)' }}>
            <div className="flex flex-col justify-center">
              <p className="fds-eyebrow block">Blog do Instituto</p>
              <h2 className="fds-display mt-5" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.25rem)' }}>
                Leituras pra entender a mente que decide por você<span className="fds-accent">.</span>
              </h2>
              <p className="fds-body mt-6" style={{ fontSize: 18, color: '#d4d5d9' }}>
                Psicanálise, PNL, terapia breve e numerologia aplicadas ao que acontece fora do consultório.
              </p>
              <div className="mt-9">
                <Link href="/blog" className="fds-btn fds-btn--primary">
                  Abrir o blog <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {posts.map(p => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group flex flex-col overflow-hidden"
                  style={{ border: '1px solid var(--fds-line)', borderRadius: 12, background: 'var(--fds-bg)' }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1c24, #0b0c11)' }}>
                    {p.capa ? (
                      <Image src={p.capa} alt="" fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="fds-display absolute bottom-4 left-5" style={{ fontSize: 64, color: 'var(--fds-accent)', opacity: 0.35, lineHeight: 1 }}>“</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col" style={{ padding: 'var(--fds-6)' }}>
                    <p className="fds-eyebrow block">{p.categoria}</p>
                    <h3 className="fds-h3 mt-3" style={{ fontSize: 21 }}>{p.titulo}</h3>
                    <p className="fds-small mt-3 flex-1">{p.resumo}</p>
                    <p className="fds-meta mt-5 inline-flex items-center gap-1.5">
                      {formatarData(p.data)} · {p.leitura} min de leitura
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--fds-accent)' }} />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FECHAMENTO ───────────────────────────────────────────────── */}
      <section id="contato" className="fds-band--deep">
        <div className="fds-wrap flex flex-wrap items-center justify-between gap-8" style={{ paddingBlock: 'var(--fds-16)' }}>
          <h2 className="fds-h2 flex-1 basis-96" style={{ fontSize: 36 }}>O despertar começa<br />com uma decisão.</h2>
          <div className="flex flex-wrap gap-3">
            <a href="#programas" className="fds-btn fds-btn--primary">Ver as formações</a>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="fds-btn fds-btn--ghost">Falar no WhatsApp</a>
          </div>
        </div>
      </section>
    </div>
  )
}
