'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Lock, PlayCircle, GraduationCap, CalendarClock, ArrowRight, Video, CheckCircle2,
  MessageCircle, Library, ShieldCheck, Clock, ChevronDown, ChevronUp, Sparkles, FileText,
} from 'lucide-react'
import { YouTubePlayer } from '@/components/player/YouTubePlayer'
import type { FormacaoSyllabusModule, FormacaoProgressSummary } from '@/lib/formacao-queries'
import type { Live } from '@/lib/actions/lives'

interface Props {
  modules: FormacaoSyllabusModule[]
  enrolled: boolean
  firstName: string | null
  progress: FormacaoProgressSummary | null
  nextLive: Live | null
  groupUrl: string | null
}

function formatUnlockDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const WELCOME_RE = /boas.vindas|onboarding/i

export function FormacaoClient({ modules, enrolled, firstName, progress, nextLive, groupUrl }: Props) {
  const welcomeModule = modules.find((m) => WELCOME_RE.test(m.title)) ?? modules[0]
  const trackModules = modules.filter((m) => m.moduleId !== welcomeModule?.moduleId)
  const firstOpenTrackModule = trackModules.find((m) => m.unlocked)?.moduleId ?? null

  const [expanded, setExpanded] = useState<Set<string>>(new Set(firstOpenTrackModule ? [firstOpenTrackModule] : []))

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (!enrolled) {
    return (
      <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-16">
        <div className="max-w-[600px] mx-auto text-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.2)] flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-6 h-6 text-[#FFB800]" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Você ainda não está matriculado na Formação IDM</h1>
          <p className="text-sm text-white/50">Fale com a equipe do Instituto Despertamente pra liberar seu acesso.</p>
        </div>
      </div>
    )
  }

  const pct = progress && progress.totalLessons > 0
    ? Math.round((progress.completedLessons / progress.totalLessons) * 100)
    : 0
  const ringCirc = 2 * Math.PI * 26
  const welcomeLesson = welcomeModule?.lessons[0]

  return (
    <div className="min-h-screen bg-[#0D1638]">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(60% 90% at 15% 0%, rgba(255,184,0,0.10), transparent 60%),' +
              'radial-gradient(50% 70% at 100% 10%, rgba(255,184,0,0.06), transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.6px, transparent 0.6px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,184,0,0.35), transparent)' }} />

        <div className="relative px-4 sm:px-6 lg:px-10 pt-10 pb-8 md:pt-14 md:pb-10">
          <div className="max-w-[880px] mx-auto">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
              <div>
                <p className="text-[#FFB800] text-xs font-bold uppercase tracking-[0.2em] mb-2">Instituto Despertamente</p>
                <h1
                  className="font-display font-bold text-white leading-[1.1]"
                  style={{ fontSize: 'clamp(1.9rem, 4.2vw, 2.9rem)' }}
                >
                  {firstName ? `Bem-vindo à sua jornada, ${firstName}.` : 'Sua jornada na Formação.'}
                </h1>
                <p className="text-sm sm:text-base text-white/50 mt-3 max-w-lg leading-relaxed">
                  Sua matrícula está confirmada. Aqui você assiste às aulas, acompanha as tarefas
                  e as aulas ao vivo da sua turma — tudo em um só lugar.
                </p>
                <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-400/90">
                  <ShieldCheck className="w-3.5 h-3.5" /> Acesso liberado — Módulo 1 disponível agora
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                {groupUrl && (
                  <a href={groupUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#0D1638] bg-[#FFB800] hover:bg-[#FFC933] transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Grupo da turma
                  </a>
                )}
                <Link href="/formacao/notas"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-[#FFB800] border border-white/[0.08] hover:border-[rgba(255,184,0,0.3)] transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Minhas notas
                </Link>
                <Link href="/formacao/calendario"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-[#FFB800] border border-white/[0.08] hover:border-[rgba(255,184,0,0.3)] transition-colors">
                  <CalendarClock className="w-3.5 h-3.5" /> Calendário
                </Link>
                <Link href="/formacao/biblioteca"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-[#FFB800] border border-white/[0.08] hover:border-[rgba(255,184,0,0.3)] transition-colors">
                  <Library className="w-3.5 h-3.5" /> Biblioteca
                </Link>
              </div>
            </div>

            <div
              className="grid md:grid-cols-[auto_1fr_auto] gap-5 md:gap-8 items-center rounded-3xl p-6 sm:p-7"
              style={{ background: 'linear-gradient(135deg, #0A1232 0%, #0F1940 60%, #111D48 100%)', border: '1px solid rgba(255,184,0,0.16)' }}
            >
              {/* Progress ring */}
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0">
                  <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
                    <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                    <circle
                      cx="30" cy="30" r="26" fill="none" stroke="#FFB800" strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={ringCirc}
                      strokeDashoffset={ringCirc - (ringCirc * pct) / 100}
                      style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">{pct}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {progress?.completedLessons ?? 0} de {progress?.totalLessons ?? 0} aulas concluídas
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {progress?.unlockedModules ?? 0} de {progress?.totalModules ?? 0} módulos liberados
                  </p>
                </div>
              </div>

              {/* Next live divider info (fills middle space on wide screens) */}
              {nextLive ? (
                <div className="flex items-center gap-3 md:border-l md:border-white/[0.08] md:pl-8">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.2)' }}>
                    <Video className="w-4 h-4 text-[#FFB800]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#FFB800] font-bold uppercase tracking-wide">
                      {nextLive.status === 'live' ? 'Ao vivo agora' : 'Próxima aula ao vivo'}
                    </p>
                    <p className="text-sm text-white/70 truncate">{nextLive.title} · {nextLive.date_label}</p>
                  </div>
                </div>
              ) : (
                <div className="hidden md:block" />
              )}

              {/* CTA */}
              {progress?.nextLesson ? (
                <Link
                  href={`/formacao/aula/${progress.nextLesson.id}`}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold whitespace-nowrap justify-center transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 8px 24px rgba(255,184,0,0.25)' }}
                >
                  <PlayCircle className="w-4 h-4" />
                  {(progress?.completedLessons ?? 0) > 0 ? 'Continuar estudando' : 'Começar agora'}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-sm text-white/50 justify-center md:justify-end">
                  <Clock className="w-4 h-4 text-[#FFB800]/70 shrink-0" />
                  Sua próxima aula será liberada em breve. Fique de olho aqui!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-10 pb-24 md:pb-16">
        <div className="max-w-[880px] mx-auto space-y-10">

          {/* ── Módulo Boas-vindas, sempre aberto ──────────── */}
          {welcomeLesson && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-[#FFB800]" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">{welcomeModule.title}</h2>
              </div>

              <div className="rounded-3xl border overflow-hidden" style={{ background: '#0A1232', borderColor: 'rgba(255,184,0,0.16)' }}>
                {welcomeLesson.lesson_type === 'video' && welcomeLesson.video_url ? (
                  <div className="aspect-video">
                    <YouTubePlayer videoUrl={welcomeLesson.video_url} lessonId={welcomeLesson.id} productSlug="formacao-psicanalise" />
                  </div>
                ) : (
                  <div className="p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-white mb-2">{welcomeLesson.title}</h3>
                    <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                      {welcomeLesson.content || 'Seu primeiro módulo está liberado — explore a trilha abaixo para começar.'}
                    </p>
                  </div>
                )}

                <div className="grid sm:grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <a href={groupUrl ?? undefined} target={groupUrl ? '_blank' : undefined} rel="noopener noreferrer"
                    className={`flex items-center gap-2.5 px-5 py-4 transition-colors ${groupUrl ? 'hover:bg-white/[0.03] cursor-pointer' : 'opacity-40 cursor-default'}`}
                    style={{ background: '#0A1232' }}
                    onClick={(e) => { if (!groupUrl) e.preventDefault() }}
                  >
                    <MessageCircle className="w-4 h-4 text-[#FFB800] shrink-0" />
                    <span className="text-sm font-medium text-white/80">Grupo da turma</span>
                  </a>
                  <Link href="/formacao/calendario"
                    className="flex items-center gap-2.5 px-5 py-4 hover:bg-white/[0.03] transition-colors" style={{ background: '#0A1232' }}>
                    <CalendarClock className="w-4 h-4 text-[#FFB800] shrink-0" />
                    <span className="text-sm font-medium text-white/80">Calendário de aulas</span>
                  </Link>
                  <Link href="/formacao/biblioteca"
                    className="flex items-center gap-2.5 px-5 py-4 hover:bg-white/[0.03] transition-colors" style={{ background: '#0A1232' }}>
                    <Library className="w-4 h-4 text-[#FFB800] shrink-0" />
                    <span className="text-sm font-medium text-white/80">Biblioteca de materiais</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ── Trilha de módulos ──────────────────────────── */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-1.5">Sua trilha, módulo a módulo</h2>
            <p className="text-xs text-white/35 mb-5 max-w-md leading-relaxed">
              Os módulos abrem aos poucos, no ritmo da turma. Assim que um novo módulo for liberado,
              ele aparece aqui automaticamente — você não precisa fazer nada.
            </p>

            <div className="space-y-3">
              {trackModules.map((mod, i) => {
                const unlocked = mod.unlocked
                const isExpanded = expanded.has(mod.moduleId)
                const lessons = mod.lessons

                return (
                  <div key={mod.moduleId} className="rounded-2xl border overflow-hidden" style={{ background: '#0A1232', borderColor: 'rgba(255,255,255,0.08)' }}>
                    <button
                      type="button"
                      onClick={() => unlocked && toggle(mod.moduleId)}
                      className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${unlocked ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border"
                        style={unlocked
                          ? { background: 'rgba(255,184,0,0.1)', borderColor: '#FFB800', color: '#FFB800' }
                          : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.25)' }}
                      >
                        {String(i + 2).padStart(2, '0')}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${unlocked ? 'text-white' : 'text-white/35'}`}>{mod.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: unlocked ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)' }}>
                          {unlocked
                            ? lessons.length > 0 ? `${lessons.length} ${lessons.length === 1 ? 'aula' : 'aulas'}` : 'Em preparação'
                            : mod.unlockAt ? `Libera em ${formatUnlockDate(mod.unlockAt)}` : 'Em breve'}
                        </p>
                      </div>

                      {unlocked ? (
                        isExpanded ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-white/15 shrink-0" />
                      )}
                    </button>

                    {unlocked && isExpanded && (
                      <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        {lessons.map((lesson, idx) => (
                          <Link
                            key={lesson.id}
                            href={`/formacao/aula/${lesson.id}`}
                            className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors border-t border-white/[0.06] first:border-t-0"
                          >
                            <PlayCircle className="w-4 h-4 text-[#FFB800]/70 shrink-0" />
                            <span className="text-xs text-white/25 w-5 shrink-0">{idx + 1}</span>
                            <span className="flex-1 min-w-0 text-sm text-white/85 truncate">{lesson.title}</span>
                            {lesson.lesson_type === 'video' && (
                              <span className="flex items-center gap-1 text-xs text-white/25 shrink-0"><Video className="w-3 h-3" /> vídeo</span>
                            )}
                          </Link>
                        ))}
                        {lessons.length === 0 && (
                          <div className="flex items-center gap-2 px-5 py-4 text-xs text-white/35">
                            <FileText className="w-3.5 h-3.5" /> As aulas deste módulo estão sendo preparadas.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {trackModules.length === 0 && (
                <p className="text-sm text-white/40 text-center py-12">Nenhum módulo disponível ainda.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
