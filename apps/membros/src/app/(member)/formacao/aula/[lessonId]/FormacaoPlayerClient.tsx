'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Link2, Paperclip, MessageCircle, Sparkles, CalendarClock, ClipboardList, LockOpen } from 'lucide-react'
import { YouTubePlayer } from '@/components/player/YouTubePlayer'
import { CinemaModeWrapper } from '@/components/player/CinemaModeWrapper'
import { TaskSubmissionPanel } from '@/components/formacao/TaskSubmissionPanel'
import type { Lesson } from '@/types'
import type { FormacaoMaterial, StudentTask } from '@/lib/formacao-queries'

interface Props {
  lesson: Lesson & { moduleTitle: string; moduleId: string; materials?: FormacaoMaterial[] }
  prevId: string | null
  nextId: string | null
  tasks: StudentTask[]
  groupUrl: string | null
}

const STEP_ICONS = [MessageCircle, CalendarClock, LockOpen, ClipboardList]

export function FormacaoPlayerClient({ lesson, prevId, nextId, tasks, groupUrl }: Props) {
  const router = useRouter()
  const prevHref = prevId ? `/formacao/aula/${prevId}` : undefined
  const nextHref = nextId ? `/formacao/aula/${nextId}` : undefined
  const isOnboarding = /onboarding|boas-vindas/i.test(lesson.moduleTitle)
  const showWelcomeHero = isOnboarding && lesson.lesson_type !== 'video'

  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[820px] mx-auto">
        <Link href="/formacao" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Formação IDM
        </Link>

        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{lesson.moduleTitle}</p>
        <h1 className="text-xl font-bold text-white mb-4">{lesson.title}</h1>

        {showWelcomeHero ? (
          <div className="mb-6 space-y-4">
            {/* Banner decorativo — no lugar do vídeo, até ele ser adicionado */}
            <div
              className="relative overflow-hidden rounded-2xl p-8 sm:p-10 text-center"
              style={{ background: 'linear-gradient(135deg, #0A1232 0%, #0F1940 55%, #111D48 100%)', border: '1px solid rgba(255,184,0,0.18)' }}
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.6px, transparent 0.6px)', backgroundSize: '20px 20px' }} />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.25)' }}>
                  <Sparkles className="w-6 h-6 text-[#FFB800]" />
                </div>
                <h2 className="font-display font-bold text-white text-xl sm:text-2xl mb-2">Seja muito bem-vindo(a)!</h2>
                <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
                  Sua matrícula na Formação em Psicanálise Integrativa está confirmada.
                  Siga os passos abaixo para começar com tranquilidade.
                </p>
              </div>
            </div>

            {/* Próximos passos — cards visuais */}
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { icon: STEP_ICONS[0], title: 'Grupo da turma', desc: 'É lá que avisamos sobre aulas ao vivo e tiramos dúvidas.', href: groupUrl, cta: groupUrl ? 'Entrar' : 'Em breve' },
                { icon: STEP_ICONS[1], title: 'Calendário', desc: 'Acompanhe as aulas ao vivo e os prazos de tarefa.', href: '/formacao/calendario', cta: 'Ver' },
                { icon: STEP_ICONS[2], title: 'Liberação progressiva', desc: 'Novos módulos abrem no ritmo da turma, direto na sua trilha.', href: null, cta: null },
                { icon: STEP_ICONS[3], title: 'Tarefas acompanhadas', desc: 'Sua resposta é revisada pelo professor antes da nota ser publicada.', href: null, cta: null },
              ].map((step) => {
                const Icon = step.icon
                const content = (
                  <div className="h-full flex items-start gap-3 rounded-2xl p-4 border border-white/[0.08]" style={{ background: '#0A1232' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,184,0,0.1)' }}>
                      <Icon className="w-4 h-4 text-[#FFB800]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                )
                return step.href ? (
                  <a key={step.title} href={step.href} target={step.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                    className="hover:border-[rgba(255,184,0,0.3)] rounded-2xl transition-colors">
                    {content}
                  </a>
                ) : (
                  <div key={step.title}>{content}</div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <CinemaModeWrapper lessonTitle={lesson.title} prevHref={prevHref} nextHref={nextHref}>
              {lesson.lesson_type === 'video' && lesson.video_url ? (
                <YouTubePlayer
                  videoUrl={lesson.video_url}
                  lessonId={lesson.id}
                  productSlug="formacao-psicanalise"
                />
              ) : lesson.lesson_type === 'text' ? (
                <div className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-6 text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                  {lesson.content || 'Conteúdo em breve.'}
                </div>
              ) : lesson.lesson_type === 'file' && lesson.file_url ? (
                <div className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-6 flex items-center justify-center">
                  <a href={lesson.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB800] text-[#0D1638] text-sm font-semibold rounded-xl hover:bg-[#FFC933] transition-colors">
                    <FileText className="w-4 h-4" /> Abrir arquivo
                  </a>
                </div>
              ) : (
                <div className="aspect-video rounded-xl flex items-center justify-center bg-[#0A1232] border border-white/[0.08]">
                  <p className="text-sm text-white/40">Sem vídeo para esta aula.</p>
                </div>
              )}
            </CinemaModeWrapper>
          </div>
        )}

        {!showWelcomeHero && groupUrl && (
          <a href={groupUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 mb-6 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 8px 24px rgba(255,184,0,0.25)' }}>
            <MessageCircle className="w-4 h-4" /> Entrar no grupo da turma
          </a>
        )}

        {!showWelcomeHero && lesson.description && (
          <p className="text-sm text-white/50 leading-relaxed mb-6">{lesson.description}</p>
        )}

        {lesson.materials && lesson.materials.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" /> Materiais complementares
            </h2>
            <div className="space-y-1.5">
              {lesson.materials.map((m) => (
                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-[#0A1232] border border-white/[0.08] rounded-xl text-sm text-white/60 hover:border-[rgba(255,184,0,0.3)] hover:text-[#FFB800] transition-colors">
                  <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {m.title}
                </a>
              ))}
            </div>
          </div>
        )}

        <TaskSubmissionPanel tasks={tasks} />

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
          <button
            onClick={() => prevId && router.push(`/formacao/aula/${prevId}`)}
            disabled={!prevId}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <button
            onClick={() => nextId && router.push(`/formacao/aula/${nextId}`)}
            disabled={!nextId}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#FFB800] text-[#0D1638] text-sm font-semibold rounded-xl hover:bg-[#FFC933] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
