'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, ChevronRight, Brain, Zap, Users, Award, Video,
  BookOpen, CheckCircle, Send, Calendar, Star,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
export type Programa = {
  id: string; title: string; slug: string
  short_description: string | null; thumbnail_url: string | null
}
type Depo = { nome: string; papel: string; texto: string; estrelas: number }

// ─── FadeIn ──────────────────────────────────────────────────────────────────
type Dir = 'up' | 'left' | 'right' | 'none'
function FadeIn({ children, delay = 0, direction = 'up' as Dir, className = '' }: {
  children: React.ReactNode; delay?: number; direction?: Dir; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold: 0.06 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])
  const hidden =
    direction === 'left'  ? '-translate-x-8 opacity-0' :
    direction === 'right' ? 'translate-x-8 opacity-0'  :
    direction === 'none'  ? 'opacity-0' : 'translate-y-6 opacity-0'
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-x-0 translate-y-0' : hidden} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 1 — HERO (split: texto esq + imagem dir)
// ═══════════════════════════════════════════════════════════════════
function HeroSection() {
  return (
    <section className="bg-[#0D1638] pt-[72px] min-h-screen flex items-center overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 w-full py-20">
        <div className="lg:grid lg:grid-cols-[1fr_44%] lg:gap-16 items-center">

          {/* Texto — esquerda */}
          <div className="space-y-8">
            <FadeIn delay={0}>
              <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-[#FFB800] bg-[#FFB800]/10 rounded-full px-3 py-1.5">
                Transformação Real
              </span>
            </FadeIn>
            <FadeIn delay={80}>
              <h1 className="font-display text-[clamp(2.8rem,6vw,5.5rem)] font-bold text-white leading-[0.93] tracking-tight">
                Sua vida,<br />no próximo<br />nível.
              </h1>
            </FadeIn>
            <FadeIn delay={160}>
              <p className="text-white/55 text-lg leading-relaxed max-w-md">
                Desenvolvemos consciência, técnica e prática em uma metodologia que
                transforma como você se vê, se relaciona e age no mundo.
                Baseada em neurociência, psicanálise e PNL.
              </p>
            </FadeIn>
            <FadeIn delay={240}>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/loja"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFB800] px-7 py-4 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] active:scale-[0.98] transition-all duration-200"
                >
                  VER TODOS OS PROGRAMAS <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#sobre"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white/45 hover:text-white transition-colors"
                >
                  Conhecer o Instituto <ChevronRight className="h-4 w-4" />
                </a>
              </div>
            </FadeIn>
          </div>

          {/* Imagem/persona — direita */}
          <FadeIn direction="right" delay={200} className="hidden lg:block">
            <div className="relative">
              <div className="absolute -inset-6 bg-[#FFB800]/8 rounded-[2.5rem] blur-3xl" />
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=85"
                alt="Transformação IDM"
                className="relative w-full rounded-2xl object-cover object-top"
                style={{ aspectRatio: '4/5', maxHeight: 580 }}
                loading="eager"
              />
              {/* Badge flutuante */}
              <div className="absolute -bottom-5 -left-5 bg-[#09122C] border border-white/10 rounded-2xl px-5 py-4 shadow-xl">
                <p className="text-[#FFB800] text-2xl font-bold font-display">12.000+</p>
                <p className="text-white/45 text-xs mt-0.5">Vidas transformadas</p>
              </div>
            </div>
          </FadeIn>

        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 2 — RECONHECIMENTO (barra horizontal com selos/números)
// ═══════════════════════════════════════════════════════════════════
const NUMEROS = [
  { n: '12.000+', l: 'Pessoas Impactadas' },
  { n: '9 Anos',  l: 'De Metodologia Própria' },
  { n: 'Nacional', l: 'Alunos em Todo o Brasil' },
]

function ReconhecimentoSection() {
  return (
    <section className="bg-[#09122C] border-y border-white/8">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
          {NUMEROS.map((item, i) => (
            <div key={i} className="text-center pt-8 sm:pt-0 first:pt-0 sm:px-10 first:pl-0 last:pr-0">
              <p className="font-display text-4xl font-bold text-white">{item.n}</p>
              <p className="text-white/35 text-sm mt-1.5 uppercase tracking-wide">{item.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 3 — MANIFESTO / POSICIONAMENTO
// ═══════════════════════════════════════════════════════════════════
function ManifestoSection() {
  return (
    <section id="sobre" className="bg-[#0D1638] py-32 sm:py-48">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <FadeIn direction="none">
          <div className="w-14 h-px bg-[#FFB800]/40 mb-10" />
          <h2 className="font-display text-[clamp(2.8rem,7vw,6.5rem)] font-bold text-white leading-[0.92] tracking-tight max-w-4xl">
            Nem toda mudança<br />começa do lado de fora.
          </h2>
        </FadeIn>
        <FadeIn delay={120}>
          <div className="mt-14 grid sm:grid-cols-2 gap-8 max-w-3xl text-white/50 leading-relaxed">
            <p>
              Muitas pessoas passam a vida tentando mudar seus resultados.
              Poucas aprendem a compreender os padrões que produzem esses resultados.
            </p>
            <p>
              No IDM, acreditamos que a consciência precede a transformação.
              Porque aquilo que você ilumina na consciência deixa de comandar você no escuro.
            </p>
          </div>
          <div className="mt-12">
            <a
              href="#programas"
              className="inline-flex items-center gap-2 rounded-xl bg-[#FFB800] px-7 py-4 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] active:scale-[0.98] transition-all duration-200"
            >
              COLA NO JOGO <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 4 — ACESSO RÁPIDO (grid 6 categorias)
// ═══════════════════════════════════════════════════════════════════
const ACESSO_RAPIDO = [
  { label: 'Psicanálise',   Icon: Brain,    href: '/programas/psicanalise-integrativa' },
  { label: 'PNL',           Icon: Zap,      href: '/loja' },
  { label: 'NPA 2.0',       Icon: Users,    href: '/loja' },
  { label: 'Certificação',  Icon: Award,    href: '/certificado' },
  { label: 'Ao Vivo',       Icon: Video,    href: '/ao-vivo' },
  { label: 'Grátis',        Icon: BookOpen, href: '/register' },
]

function AcessoRapidoSection() {
  return (
    <section className="bg-[#0A1232] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-14">
        <FadeIn direction="none" className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/30">Acesso Rápido</p>
        </FadeIn>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {ACESSO_RAPIDO.map(({ label, Icon, href }) => (
            <a
              key={label}
              href={href}
              className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/8 hover:border-[#FFB800]/40 hover:bg-[#FFB800]/5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-white/6 group-hover:bg-[#FFB800]/15 flex items-center justify-center transition-colors">
                <Icon className="h-5 w-5 text-white/45 group-hover:text-[#FFB800] transition-colors" />
              </div>
              <span className="text-xs font-medium text-white/45 group-hover:text-white/80 text-center transition-colors leading-tight">
                {label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 5 — TRILHAS DE TRANSFORMAÇÃO (3 cards)
// ═══════════════════════════════════════════════════════════════════
const TRILHAS = [
  {
    tag: 'Para iniciantes',
    title: 'Autoconhecimento',
    desc: 'Para quem deseja compreender a si mesmo através de neurociência, psicanálise e PNL. O ponto de partida para uma vida mais consciente.',
    cta: 'Começar agora',
    href: '/register',
    img: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=700&q=80',
  },
  {
    tag: 'Formação',
    title: 'Profissional de Saúde Mental',
    desc: 'Torne-se um profissional certificado em psicanálise integrativa. Teoria, análise pessoal e supervisão clínica em uma formação completa.',
    cta: 'Ver formação',
    href: '/programas/psicanalise-integrativa',
    img: 'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=700&q=80',
  },
  {
    tag: 'Experiência presencial',
    title: 'IDM Pelo Brasil',
    desc: 'Eventos presenciais de desenvolvimento humano com facilitação ao vivo em todo o país. Uma experiência de imersão transformadora.',
    cta: 'Ver próximos eventos',
    href: '/programas/idm-pelo-brasil',
    img: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=700&q=80',
  },
]

function TrilhasSection() {
  return (
    <section id="jornadas" className="bg-[#0D1638] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24">
        <FadeIn direction="none" className="mb-14">
          <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-3">Jornadas</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-[1.0]">
            Três caminhos.<br />O mesmo propósito.
          </h2>
        </FadeIn>
        <div className="grid sm:grid-cols-3 gap-5">
          {TRILHAS.map((trilha, i) => (
            <FadeIn key={trilha.title} delay={i * 80}>
              <div className="group rounded-2xl overflow-hidden border border-white/8 hover:border-white/16 transition-all duration-300 flex flex-col h-full">
                <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={trilha.img}
                    alt={trilha.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D1638]/70 via-transparent to-transparent" />
                  <span className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-white/70 bg-white/10 backdrop-blur-sm rounded-full px-2.5 py-1">
                    {trilha.tag}
                  </span>
                </div>
                <div className="p-6 flex flex-col gap-3 flex-1">
                  <h3 className="font-display text-xl font-bold text-white">{trilha.title}</h3>
                  <p className="text-white/45 text-sm leading-relaxed flex-1">{trilha.desc}</p>
                  <a
                    href={trilha.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FFB800] hover:gap-3 transition-all duration-200 mt-2"
                  >
                    {trilha.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 6 — PROGRAMAS EM DESTAQUE (carousel / grid)
// ═══════════════════════════════════════════════════════════════════
const PROGRAMAS_FIXOS = [
  {
    slug: 'psicanalise-integrativa',
    title: 'Psicanálise Integrativa',
    short_description: 'Formação certificada em teoria, análise pessoal e supervisão clínica.',
    thumbnail_url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
  },
  {
    slug: 'idm-pelo-brasil',
    title: 'IDM Pelo Brasil',
    short_description: 'Experiências presenciais de desenvolvimento humano em todo o país.',
    thumbnail_url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
  },
  {
    slug: 'npa',
    title: 'NPA 2.0',
    short_description: 'Identifique e ressignifique padrões herdados que ainda comandam sua vida.',
    thumbnail_url: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=600&q=80',
  },
  {
    slug: 'pnl',
    title: 'Practitioner PNL',
    short_description: 'Técnicas de Programação Neurolinguística para transformar comportamentos.',
    thumbnail_url: 'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=600&q=80',
  },
  {
    slug: 'live-formacao',
    title: 'Live Formação IDM',
    short_description: 'Conteúdos e encontros ao vivo para quem deseja continuar evoluindo.',
    thumbnail_url: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80',
  },
  {
    slug: 'supervisao',
    title: 'Supervisão Clínica',
    short_description: 'Acompanhamento profissional que transforma conhecimento em segurança clínica.',
    thumbnail_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
  },
  {
    slug: 'intro',
    title: 'Introdução à Psicanálise',
    short_description: 'Para quem quer dar o primeiro passo no autoconhecimento com base científica.',
    thumbnail_url: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&q=80',
  },
]

function ProgramasSection({ programas }: { programas: Programa[] }) {
  const lista = programas.length > 0
    ? programas.map(p => ({
        slug: p.slug,
        title: p.title,
        short_description: p.short_description ?? '',
        thumbnail_url: p.thumbnail_url ?? '',
      }))
    : PROGRAMAS_FIXOS

  return (
    <section id="programas" className="bg-[#0A1232] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24">
        <FadeIn direction="none" className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-3">Programas</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-[1.0]">
              Cursos que transformam<br />carreiras e vidas.
            </h2>
          </div>
          <Link
            href="/loja"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#FFB800] hover:gap-3 transition-all duration-200 shrink-0"
          >
            Ver todos <ArrowRight className="h-4 w-4" />
          </Link>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {lista.slice(0, 7).map((p, i) => (
            <FadeIn key={p.slug} delay={i * 50}>
              <Link
                href={`/loja`}
                className="group block rounded-2xl overflow-hidden border border-white/8 hover:border-white/18 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300"
              >
                {p.thumbnail_url && (
                  <div className="overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <img
                      src={p.thumbnail_url}
                      alt={p.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-700"
                    />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-semibold text-white text-[15px] leading-snug mb-2">{p.title}</h3>
                  {p.short_description && (
                    <p className="text-white/40 text-xs leading-relaxed line-clamp-2">{p.short_description}</p>
                  )}
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#FFB800]">
                    Saiba mais <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            </FadeIn>
          ))}
        </div>

        <div className="mt-8 sm:hidden text-center">
          <Link
            href="/loja"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#FFB800] border border-[#FFB800]/30 rounded-xl px-6 py-3 hover:bg-[#FFB800]/8 transition-colors"
          >
            Ver todos os programas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 7 — METODOLOGIA IDM (3 pilares + imagem)
// ═══════════════════════════════════════════════════════════════════
const PILARES = [
  { n: '01', t: 'Neurociência',       d: 'Entenda como o cérebro aprende, processa e muda — a base científica da transformação.' },
  { n: '02', t: 'Psicanálise',        d: 'Acesse padrões inconscientes que comandam comportamentos, relações e escolhas.' },
  { n: '03', t: 'PNL',                d: 'Técnicas práticas para ressignificar crenças e instalar novos padrões de forma rápida.' },
]

function MetodologiaSection() {
  return (
    <section id="metodologia" className="bg-[#0D1638] border-t border-white/6 overflow-hidden">
      <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-[38%_1fr] lg:min-h-[560px]">

        {/* Imagem — esquerda */}
        <div className="hidden lg:block relative border-r border-white/[0.05]">
          <img
            src="https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=900&q=82"
            alt="Metodologia IDM"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to left, rgba(10,18,50,0.30) 0%, transparent 50%)'
          }} />
        </div>

        {/* Texto — direita */}
        <div className="px-6 sm:px-10 lg:pl-16 lg:pr-16 py-24 sm:py-32 flex flex-col justify-center">
          <FadeIn direction="right">
            <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-8">Metodologia IDM</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.0] mb-12">
              Conhecimento.<br />Consciência.<br />Prática.
            </h2>
            <div className="space-y-9">
              {PILARES.map(p => (
                <div key={p.t} className="flex gap-5">
                  <span className="text-[11px] text-white/20 font-mono shrink-0 mt-1">{p.n}</span>
                  <div>
                    <p className="font-semibold text-white mb-1.5">{p.t}</p>
                    <p className="text-white/40 text-sm leading-relaxed">{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 8 — APRENDIZAGEM PRÁTICA / DIFERENCIAIS (imagem + lista 5 pontos)
// ═══════════════════════════════════════════════════════════════════
const DIFERENCIAIS = [
  'Metodologia própria desenvolvida ao longo de 9 anos de prática',
  'Formação que integra teoria, experiência pessoal e aplicação clínica',
  'Professores que são praticantes — não apenas teóricos',
  'Comunidade ativa de alunos e profissionais em todo o Brasil',
  'Certificação reconhecida e suporte pós-formação contínuo',
]

function DiferenciaisSection() {
  return (
    <section className="bg-[#0A1232] border-t border-white/6 overflow-hidden">
      <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-[1fr_40%] lg:min-h-[520px]">

        {/* Texto — esquerda */}
        <div className="px-6 sm:px-10 lg:pl-16 lg:pr-16 py-24 sm:py-32 flex flex-col justify-center">
          <FadeIn direction="left">
            <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-8">Por que o IDM</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.0] mb-10">
              Aprendizagem<br />que transforma<br />na prática.
            </h2>
            <ul className="space-y-5">
              {DIFERENCIAIS.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <CheckCircle className="h-5 w-5 text-[#FFB800] shrink-0 mt-0.5" />
                  <span className="text-white/60 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-white/35 text-sm leading-relaxed max-w-sm">
              Porque não basta aprender sobre a mente. É preciso vivenciar a transformação
              para poder conduzir outros por esse caminho.
            </p>
          </FadeIn>
        </div>

        {/* Imagem — direita */}
        <div className="hidden lg:block relative border-l border-white/[0.05]">
          <img
            src="https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=900&q=82"
            alt="Aprendizagem prática IDM"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to right, rgba(10,18,50,0.30) 0%, transparent 50%)'
          }} />
        </div>

      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 9 — CTA PROMOCIONAL (card de oferta/inscrição)
// ═══════════════════════════════════════════════════════════════════
function CTAPromoSection() {
  return (
    <section id="franqueado" className="bg-[#0D1638] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24">
        <FadeIn direction="none">
          <div className="relative rounded-3xl overflow-hidden border border-[#FFB800]/20 bg-gradient-to-br from-[#FFB800]/10 via-[#09122C] to-[#09122C]">
            {/* Glow */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#FFB800]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative lg:grid lg:grid-cols-[1fr_auto] gap-12 items-center px-8 sm:px-14 py-14">

              <div className="space-y-5">
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-[#FFB800] bg-[#FFB800]/15 rounded-full px-3 py-1.5">
                  Inscrições Abertas
                </span>
                <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[0.95]">
                  O despertar começa<br />com uma decisão.
                </h2>
                <div className="space-y-1.5 text-white/45 text-sm leading-relaxed">
                  <p>Conhecimento pode informar.</p>
                  <p>Consciência pode transformar.</p>
                  <p className="text-white/25">Sua jornada começa agora.</p>
                </div>
              </div>

              <div className="mt-10 lg:mt-0 flex flex-col gap-3 shrink-0">
                <Link
                  href="/loja"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFB800] px-8 py-4 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
                >
                  QUERO MINHA VAGA <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="text-center text-[11px] text-white/25">
                  Vagas limitadas · Certificação reconhecida
                </p>
              </div>

            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 10 — BLOG / CONTEÚDO (grid 6 artigos)
// ═══════════════════════════════════════════════════════════════════
const BLOG_POSTS = [
  {
    category: 'Psicanálise',
    title: 'Como a psicanálise pode transformar seus relacionamentos',
    excerpt: 'Entenda como padrões inconscientes afetam a forma como nos relacionamos com os outros.',
    img: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=500&q=75',
    date: '15 Jun 2025',
  },
  {
    category: 'NPA',
    title: 'NPA: os padrões que vêm dos seus antepassados ainda te controlam?',
    excerpt: 'Como comportamentos herdados de gerações anteriores se repetem na sua vida sem você perceber.',
    img: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=500&q=75',
    date: '8 Jun 2025',
  },
  {
    category: 'Neurociência',
    title: 'Como o cérebro aprende com transformação real',
    excerpt: 'A neurociência por trás da mudança de comportamento e por que o método IDM funciona.',
    img: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500&q=75',
    date: '1 Jun 2025',
  },
  {
    category: 'PNL',
    title: 'PNL na prática: técnicas para ressignificar crenças limitantes',
    excerpt: 'Ferramentas de Programação Neurolinguística que você pode aplicar imediatamente.',
    img: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=500&q=75',
    date: '25 Mai 2025',
  },
  {
    category: 'Autoconhecimento',
    title: 'Por que autoconhecimento é o melhor investimento que você pode fazer',
    excerpt: 'O impacto do autoconhecimento em resultados profissionais, relacionamentos e saúde mental.',
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&q=75',
    date: '18 Mai 2025',
  },
  {
    category: 'Formação',
    title: 'A diferença entre terapia e formação em psicanálise integrativa',
    excerpt: 'O que esperar de cada modalidade e como escolher o caminho certo para o seu objetivo.',
    img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&q=75',
    date: '10 Mai 2025',
  },
]

function BlogSection() {
  return (
    <section id="blog" className="bg-[#09122C] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24">
        <FadeIn direction="none" className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-3">Blog</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-[1.0]">
              Conteúdo que<br />expande a consciência.
            </h2>
          </div>
          <a
            href="#blog"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#FFB800] hover:gap-3 transition-all duration-200 shrink-0"
          >
            Ver todos <ArrowRight className="h-4 w-4" />
          </a>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {BLOG_POSTS.map((post, i) => (
            <FadeIn key={post.title} delay={i * 60}>
              <article className="group rounded-2xl overflow-hidden border border-white/8 hover:border-white/16 bg-white/[0.02] transition-all duration-300 flex flex-col">
                <div className="overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={post.img}
                    alt={post.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-700"
                  />
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#FFB800] bg-[#FFB800]/10 rounded-full px-2.5 py-1">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-white/30">
                      <Calendar className="h-3 w-3" />
                      {post.date}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white text-[15px] leading-snug group-hover:text-white/85 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-white/40 text-xs leading-relaxed flex-1 line-clamp-2">{post.excerpt}</p>
                  <a
                    href="#blog"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#FFB800] mt-1"
                  >
                    Ler mais <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 11 — DEPOIMENTOS
// ═══════════════════════════════════════════════════════════════════
const DEPOS_FALLBACK: Depo[] = [
  { nome: 'Ana Beatriz S.', papel: 'Aluna — Psicanálise Integrativa', estrelas: 5,
    texto: 'Eu tentei terapia por anos. O método IDM foi o único que me fez entender POR QUÊ eu agia do jeito que agia. Em 3 semanas mudei mais do que em 3 anos.' },
  { nome: 'Marcos Vinicius', papel: 'Aluno — NPA 2.0', estrelas: 5,
    texto: 'Nunca imaginei que padrões dos meus avós ainda me afetavam. Depois do NPA, sinto que finalmente sou eu mesmo.' },
  { nome: 'Fernanda Lima', papel: 'Aluna — Practitioner PNL', estrelas: 5,
    texto: 'A certificação foi incrível, mas o que ficou foi a transformação pessoal. Recomendo sem hesitar.' },
  { nome: 'Ricardo Almeida', papel: 'Aluno — Practitioner PNL', estrelas: 5,
    texto: 'O conteúdo é denso mas aplicável imediatamente. Já usei em reuniões de trabalho e na minha vida pessoal. Mudança real.' },
  { nome: 'Juliana C.', papel: 'Aluna — Psicanálise Integrativa', estrelas: 5,
    texto: 'Finalmente entendi por que sabotava minhas relações. O método é diferente de tudo que já fiz. Recomendo a todos.' },
  { nome: 'Paulo R.', papel: 'Aluno — NPA 2.0', estrelas: 5,
    texto: 'Comprei com ceticismo e saí transformado. Os padrões que identifiquei explicaram 20 anos de comportamento. Incrível.' },
]

function DepoimentosSection({ depos }: { depos: Depo[] }) {
  const lista = depos.length > 0 ? depos : DEPOS_FALLBACK
  return (
    <section id="depoimentos" className="bg-[#0D1638] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24 sm:py-32">

        <FadeIn direction="none" className="mb-16">
          <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-3">Histórias de sucesso</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.0]">
            Quem decidiu<br />olhar para dentro.
          </h2>
          <p className="mt-4 text-white/35 text-sm max-w-sm leading-relaxed">
            Histórias reais de pessoas que encontraram no conhecimento uma
            nova forma de compreender a própria vida.
          </p>
        </FadeIn>

        <div className="grid sm:grid-cols-3 gap-8 sm:gap-10">
          {lista.slice(0, 6).map((d, i) => (
            <FadeIn key={i} delay={i * 60}>
              <div className="space-y-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: d.estrelas }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 text-[#FFB800] fill-[#FFB800]" />
                  ))}
                </div>
                <p className="text-[#FFB800]/20 font-display text-6xl leading-none -mb-3 select-none">&ldquo;</p>
                <p className="text-white/55 leading-relaxed text-sm">&ldquo;{d.texto}&rdquo;</p>
                <div className="border-t border-white/[0.06] pt-4">
                  <p className="text-sm font-semibold text-white">{d.nome}</p>
                  <p className="text-xs text-white/30 mt-0.5">{d.papel}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SEÇÃO 12 — NEWSLETTER / CONTATO
// ═══════════════════════════════════════════════════════════════════
function NewsletterSection() {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !nome) return
    setSent(true)
  }

  return (
    <section id="contato" className="bg-[#0A1232] border-t border-white/6">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-24">
        <FadeIn direction="none">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-4">Newsletter</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.0] mb-4">
              Conteúdo que expande<br />a consciência.
            </h2>
            <p className="text-white/40 text-sm leading-relaxed mb-10">
              Receba artigos, vídeos e insights sobre psicanálise, neurociência e desenvolvimento humano.
              Sem spam. Apenas conteúdo que transforma.
            </p>

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-14 h-14 rounded-full bg-[#FFB800]/15 flex items-center justify-center">
                  <CheckCircle className="h-7 w-7 text-[#FFB800]" />
                </div>
                <p className="text-white font-semibold">Você está inscrito!</p>
                <p className="text-white/40 text-sm">Fique de olho na sua caixa de entrada.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  required
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:bg-white/8 transition-colors"
                />
                <input
                  type="email"
                  placeholder="Seu melhor e-mail"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:bg-white/8 transition-colors"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFB800] px-6 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
                >
                  Inscrever <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT PRINCIPAL
// Ordem: Hero → Reconhecimento → Manifesto → AcessoRápido → Trilhas
//        → Programas → Metodologia → Diferenciais → CTAPromo
//        → Blog → Depoimentos → Newsletter
// ═══════════════════════════════════════════════════════════════════
export function ComecarAnimated({
  depos,
  programas,
}: {
  depos: Depo[]
  programas: Programa[]
}) {
  return (
    <main className="bg-[#0D1638] text-white overflow-x-hidden">
      <HeroSection />
      <ReconhecimentoSection />
      <ManifestoSection />
      <AcessoRapidoSection />
      <TrilhasSection />
      <ProgramasSection programas={programas} />
      <MetodologiaSection />
      <DiferenciaisSection />
      <CTAPromoSection />
      <BlogSection />
      <DepoimentosSection depos={depos} />
      <NewsletterSection />
    </main>
  )
}
