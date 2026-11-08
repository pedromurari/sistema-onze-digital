import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, FileText, Monitor, PlayCircle, Calendar, Sparkles, Layers, ArrowRight, ShieldCheck, Lock, Unlock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PerfilNumerologicoCard, MapaEsferasCard, VoltarButton } from './HubCards'

export const metadata = { title: 'Mentoria NPA — Instituto Despertamente' }

const WHATSAPP_EQUIPE = '5511919434040'
function whatsappUpgrade(msg: string) {
  return `https://wa.me/${WHATSAPP_EQUIPE}?text=${encodeURIComponent(msg)}`
}

function SectionHeader({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,184,0,0.10)', border: '1px solid rgba(255,184,0,0.18)' }}
      >
        <Icon className="w-3.5 h-3.5 text-[#FFB800]" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{children}</span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.10), transparent)' }} />
    </div>
  )
}

function EmBreveCard({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl p-5 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.10)' }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Icon className="w-4 h-4 text-white/35" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white/80">{title}</p>
        <p className="text-sm text-white/40">{subtitle}</p>
      </div>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 bg-white/[0.04] text-white/45">
        <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]/60 animate-pulse" />
        Em breve
      </span>
    </div>
  )
}

function LockedSection({ title, description, ctaLabel, ctaHref, children }: { title: string; description: string; ctaLabel: string; ctaHref: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="opacity-25 blur-[3px] saturate-50 pointer-events-none select-none" aria-hidden>
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 py-8 gap-3"
        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(10,18,50,0.55) 0%, rgba(10,18,50,0.94) 78%)' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <Lock className="w-4 h-4 text-white/60" />
        </div>
        <p className="text-sm font-semibold text-white/85 max-w-xs">{title}</p>
        <p className="text-xs text-white/40 max-w-xs leading-relaxed">{description}</p>
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-transform active:scale-[0.97]"
          style={{ background: '#FFB800', color: '#0D1638' }}
        >
          {ctaLabel}
        </a>
      </div>
    </div>
  )
}

function FeaturedContentCard({ href, icon: Icon, title, subtitle }: { href: string; icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-5 rounded-3xl p-7 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
      style={{
        background: 'linear-gradient(155deg, rgba(255,184,0,0.10), rgba(10,18,50,0) 60%), #0A1232',
        border: '1px solid rgba(255,184,0,0.18)',
      }}
    >
      <div
        className="absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
        style={{ border: '1px solid rgba(255,184,0,0.40)', boxShadow: 'var(--gold-glow, 0 0 32px rgba(255,184,0,0.24))' }}
      />
      <div
        className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
        style={{ background: 'linear-gradient(135deg, rgba(255,184,0,0.22), rgba(255,184,0,0.08))', border: '1px solid rgba(255,184,0,0.30)' }}
      >
        <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-[#FFB800]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-lg sm:text-xl font-bold text-white leading-snug" style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>{title}</p>
        <p className="text-sm text-white/50 mt-1">{subtitle}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-white/25 shrink-0 transition-all duration-300 group-hover:text-[#FFB800] group-hover:translate-x-1" />
    </Link>
  )
}

function ContentCard({ href, icon: Icon, title, subtitle, external }: { href: string; icon: React.ElementType; title: string; subtitle: string; external?: boolean }) {
  const props = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <Link
      href={href}
      {...props}
      className="group relative flex items-center gap-4 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,184,0,0.05), rgba(10,18,50,0) 65%), #0A1232',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
        style={{ border: '1px solid rgba(255,184,0,0.30)', boxShadow: 'var(--gold-glow, 0 0 24px rgba(255,184,0,0.20))' }}
      />
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
        style={{ background: 'linear-gradient(135deg, rgba(255,184,0,0.18), rgba(255,184,0,0.06))', border: '1px solid rgba(255,184,0,0.25)' }}
      >
        <Icon className="w-4 h-4 text-[#FFB800]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-white/20 shrink-0 transition-all duration-300 group-hover:text-[#FFB800] group-hover:translate-x-0.5" />
    </Link>
  )
}

export default async function MentoriaNpaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: profile } = await sb.from('profiles').select('role, full_name').eq('id', user.id).single()

  // Mentoria NPA (matrícula completa) e NPA Presencial (só ebook + telas) são produtos
  // separados — quem tem só o presencial ainda entra aqui, mas vê o resto bloqueado.
  const { data: enrollments } = await sb
    .from('enrollments')
    .select('id, products!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('products.slug', ['mentoria-npa', 'ebook-telas-npa'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownedSlugs = new Set((enrollments ?? []).map((e: any) => e.products.slug))
  const isAdmin = profile?.role === 'admin'
  const hasMentoria = isAdmin || ownedSlugs.has('mentoria-npa')
  const hasPresencial = hasMentoria || ownedSlugs.has('ebook-telas-npa')

  if (!hasMentoria && !hasPresencial) redirect('/dashboard')

  // Curso gravado NPA 2.0 — verifica se já tem aulas publicadas
  const { data: npaCourse } = await sb
    .from('products')
    .select('id, slug, title, modules(id, lessons(id))')
    .eq('slug', 'npa-2-0')
    .maybeSingle()

  const npaLessonCount = (npaCourse?.modules ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (acc: number, m: any) => acc + (m.lessons?.length ?? 0),
    0,
  )

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Bem-vindo'

  return (
    <div className="relative">
      {/* Aura decorativa premium — glow dourado suave atrás do header */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[560px] h-[320px] opacity-40"
        style={{ background: 'radial-gradient(closest-side, rgba(255,184,0,0.16), transparent 70%)', filter: 'blur(10px)' }}
      />

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-24 md:pb-16 space-y-10">
        <VoltarButton />

        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-px" style={{ background: 'linear-gradient(90deg, transparent, #FFB800)' }} />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFB800]">Mentoria NPA</p>
          </div>
          <h1
            className="text-4xl sm:text-[2.75rem] leading-[1.08] font-bold text-white"
            style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}
          >
            Bem-vindo,<br className="hidden sm:block" /> {firstName}.
          </h1>
          <p className="text-sm sm:text-[15px] text-white/55 max-w-lg leading-relaxed">
            {hasMentoria
              ? 'Sua matrícula está confirmada. Todo o conteúdo abaixo já está liberado — material de apoio, comunidade, curso gravado, Perfil Numerológico e Mapa 7 Esferas.'
              : 'Seu material do NPA Presencial está liberado abaixo. O restante — comunidade, curso gravado, Perfil Numerológico e Mapa 7 Esferas — é exclusivo de quem tem a Mentoria NPA completa.'}
          </p>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
            style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.22)' }}
          >
            {hasMentoria ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-[#FFB800]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FFB800]">Matrícula ativa</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5 text-[#FFB800]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FFB800]">NPA Presencial liberado</span>
              </>
            )}
          </div>
        </div>

        {/* 1. Material de apoio — NPA Presencial (ebook + telas) */}
        <div className="space-y-3">
          <SectionHeader icon={FileText}>Material de apoio — NPA Presencial</SectionHeader>
          {hasPresencial ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <ContentCard href="/materiais/ebook-numerologia-do-destino.pdf" icon={FileText} title="Ebook" subtitle="Numerologia do Destino — baixe e leia." external />
              <EmBreveCard icon={Monitor} title="Telas" subtitle="Telas numerológicas para consulta." />
            </div>
          ) : (
            <LockedSection
              title="Material exclusivo de quem garantiu o NPA Presencial"
              description="O ebook e as telas numerológicas são liberados pra quem comprou o material do evento presencial."
              ctaLabel="Falar com a equipe"
              ctaHref={whatsappUpgrade('Olá! Quero saber mais sobre o material do NPA Presencial (ebook + telas).')}
            >
              <div className="grid sm:grid-cols-2 gap-3 p-3">
                <EmBreveCard icon={FileText} title="Ebook" subtitle="Material de apoio da mentoria." />
                <EmBreveCard icon={Monitor} title="Telas" subtitle="Telas numerológicas para consulta." />
              </div>
            </LockedSection>
          )}
        </div>

        {/* 2. Comunidade — grupo + calendário de encontros */}
        <div className="space-y-3">
          <SectionHeader icon={MessageCircle}>Comunidade</SectionHeader>
          {hasMentoria ? (
            <div className="space-y-3">
              <EmBreveCard
                icon={MessageCircle}
                title="Grupo da mentoria"
                subtitle="É lá que avisamos sobre os encontros e tiramos dúvidas."
              />
              <ContentCard
                href="/mentoria-npa/calendario"
                icon={Calendar}
                title="Ver calendário completo"
                subtitle="Confira as próximas datas e como participar."
              />
            </div>
          ) : (
            <LockedSection
              title="Comunidade exclusiva da Mentoria NPA"
              description="Grupo de acompanhamento e calendário de encontros ao vivo são benefícios da matrícula completa."
              ctaLabel="Quero a Mentoria completa"
              ctaHref={whatsappUpgrade('Olá! Estou no NPA Presencial e quero saber mais sobre a Mentoria NPA completa.')}
            >
              <div className="space-y-3 p-3">
                <EmBreveCard icon={MessageCircle} title="Grupo da mentoria" subtitle="É lá que avisamos sobre os encontros e tiramos dúvidas." />
                <EmBreveCard icon={Calendar} title="Ver calendário completo" subtitle="Confira as próximas datas e como participar." />
              </div>
            </LockedSection>
          )}
        </div>

        {/* 3. Plataformas — Perfil Numerológico + Mapa 7 Esferas */}
        <div className="space-y-3">
          <SectionHeader icon={Layers}>Plataformas</SectionHeader>
          {hasMentoria ? (
            <div className="space-y-3">
              <PerfilNumerologicoCard />
              <MapaEsferasCard />
            </div>
          ) : (
            <LockedSection
              title="Plataformas exclusivas da Mentoria NPA"
              description="Perfil Numerológico e Mapa 7 Esferas ficam liberados pra quem tem a matrícula completa."
              ctaLabel="Quero a Mentoria completa"
              ctaHref={whatsappUpgrade('Olá! Estou no NPA Presencial e quero saber mais sobre a Mentoria NPA completa.')}
            >
              <div className="space-y-3 p-3">
                <EmBreveCard icon={Sparkles} title="Acessar Perfil Numerológico" subtitle="Incluso na sua Mentoria NPA." />
                <EmBreveCard icon={Sparkles} title="Acessar Mapa 7 Esferas" subtitle="Seu mapa fica salvo — é só abrir de novo aqui." />
              </div>
            </LockedSection>
          )}
        </div>

        {/* 4. Curso gravado — NPA 2.0 (peça principal, maior destaque visual) */}
        <div className="space-y-3">
          <SectionHeader icon={PlayCircle}>Curso gravado — NPA 2.0</SectionHeader>
          {!hasMentoria ? (
            <LockedSection
              title="Curso gravado exclusivo da Mentoria NPA"
              description="Todas as aulas gravadas do NPA 2.0 ficam liberadas pra quem tem a matrícula completa."
              ctaLabel="Quero a Mentoria completa"
              ctaHref={whatsappUpgrade('Olá! Estou no NPA Presencial e quero saber mais sobre a Mentoria NPA completa (curso gravado).')}
            >
              <div className="p-3">
                <FeaturedContentCard href="#" icon={PlayCircle} title="Curso gravado NPA 2.0" subtitle="Aulas completas em vídeo, no seu ritmo." />
              </div>
            </LockedSection>
          ) : npaLessonCount > 0 ? (
            <FeaturedContentCard
              href={`/cursos/${npaCourse.slug}`}
              icon={PlayCircle}
              title={npaCourse.title}
              subtitle={`${npaLessonCount} aula${npaLessonCount > 1 ? 's' : ''} disponíve${npaLessonCount > 1 ? 'is' : 'l'}`}
            />
          ) : (
            <div
              className="rounded-3xl p-10 text-center space-y-1.5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.10)' }}
            >
              <p className="text-white/50 text-sm">A equipe está preparando as aulas gravadas do NPA.</p>
              <p className="text-white/35 text-xs">Assim que estiverem prontas, aparecem aqui automaticamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
