import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Circle, Clock, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { YouTubePlayer } from '@/components/player/YouTubePlayer'
import { CinemaModeWrapper } from '@/components/player/CinemaModeWrapper'
import { DEMO_PRODUCTS, DEMO_MODULES } from '@/lib/demo-data'
import type { ModuleWithLessons, Progress, Lesson } from '@/types'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

async function getData(slug: string, lessonId: string) {
  if (DEMO_MODE) {
    const product = DEMO_PRODUCTS.find((p) => p.slug === slug)
    if (!product) return null
    const modules = DEMO_MODULES.filter((m) => m.product_id === product.id) as ModuleWithLessons[]
    const allLessons = modules.flatMap((m) => [...m.lessons].sort((a, b) => a.sort_order - b.sort_order))
    const lesson = allLessons.find((l) => l.id === lessonId)
    if (!lesson) return null
    return { product: { id: product.id, slug: product.slug, title: product.title }, lesson, modules, allLessons, progressMap: {} as Record<string, Progress> }
  }

  const { redirect } = await import('next/navigation')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: productRaw } = await sb.from('products').select('id, slug, title').eq('slug', slug).single()
  const product = productRaw as { id: string; slug: string; title: string } | null
  if (!product) return null
  const { data: lessonRaw } = await sb.from('lessons').select('*').eq('id', lessonId).single()
  const lesson = lessonRaw as Lesson | null
  if (!lesson) return null
  const { data: modulesRaw } = await sb.from('modules').select('*, lessons (*)').eq('product_id', product.id).order('sort_order')
  const modules = (modulesRaw ?? []) as ModuleWithLessons[]
  const allLessons = modules.flatMap((m) => [...m.lessons].sort((a, b) => a.sort_order - b.sort_order))
  const allLessonIds = allLessons.map((l) => l.id)
  const { data: progressRaw } = await sb.from('progress').select('*').eq('user_id', user!.id).in('lesson_id', allLessonIds)
  const progressMap: Record<string, Progress> = Object.fromEntries(((progressRaw ?? []) as Progress[]).map((p) => [p.lesson_id, p]))
  return { product, lesson, modules, allLessons, progressMap }
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params
  const data = await getData(slug, lessonId)
  if (!data) notFound()
  const { product, lesson, modules, allLessons, progressMap } = data

  const currentIndex = allLessons.findIndex((l) => l.id === lessonId)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null
  const currentProgress = progressMap[lessonId]

  const prevHref = prevLesson ? `/cursos/${slug}/aulas/${prevLesson.id}` : undefined
  const nextHref = nextLesson ? `/cursos/${slug}/aulas/${nextLesson.id}` : undefined

  // Lista de módulos para o CinemaModeWrapper
  const moduleListEl = (
    <div className="divide-y divide-white/[0.06]">
      {modules.map((mod) => {
        const modLessons = [...mod.lessons].sort((a, b) => a.sort_order - b.sort_order)
        return (
          <div key={mod.id}>
            <div className="px-4 py-2.5 bg-[#091028]">
              <p className="text-xs font-semibold text-white/40">{mod.title}</p>
            </div>
            {modLessons.map((l) => {
              const done   = !!progressMap[l.id]?.completed
              const active = l.id === lessonId
              return (
                <Link
                  key={l.id}
                  href={`/cursos/${slug}/aulas/${l.id}`}
                  className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
                  style={{
                    borderLeft: active ? '2px solid #FFB800' : '2px solid transparent',
                    background: active ? 'rgba(255,184,0,0.06)' : undefined,
                  }}
                >
                  {done
                    ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#22c55e]" />
                    : <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: active ? '#FFB800' : 'rgba(255,255,255,0.20)' }} />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug" style={{ color: active ? '#FFB800' : done ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.70)' }}>
                      {l.title}
                    </p>
                    {l.video_duration && (
                      <p className="text-[10px] mt-0.5 flex items-center gap-1 text-white/25">
                        <Clock className="w-2.5 h-2.5" />{formatDuration(l.video_duration)}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#606060] mb-5">
        <Link href="/dashboard" className="hover:text-[#f0f0f0] transition-colors">Início</Link>
        <span>/</span>
        <Link href={`/cursos/${slug}`} className="hover:text-[#f0f0f0] transition-colors truncate max-w-[160px]">
          {product.title}
        </Link>
        <span>/</span>
        <span className="text-[#a0a0a0] truncate max-w-[160px]">{lesson.title}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-5 max-w-[1200px]">

        {/* Coluna principal */}
        <div className="space-y-5">

          {/* Player com CinemaModeWrapper */}
          <CinemaModeWrapper
            lessonTitle={lesson.title}
            prevHref={prevHref}
            nextHref={nextHref}
            moduleList={moduleListEl}
          >
            {lesson.video_url ? (
              <YouTubePlayer
                videoUrl={lesson.video_url}
                lessonId={lesson.id}
                productSlug={slug}
                initialCompleted={currentProgress?.completed}
              />
            ) : (
              <div className="aspect-video rounded-xl flex items-center justify-center bg-[#0A1232] border border-white/[0.08]">
                <p className="text-sm text-white/40">Sem vídeo para esta aula.</p>
              </div>
            )}
          </CinemaModeWrapper>

          {/* Info da aula */}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-[#f0f0f0] leading-snug">{lesson.title}</h1>
            {lesson.description && (
              <p className="text-sm text-[#a0a0a0] leading-relaxed">{lesson.description}</p>
            )}
          </div>

          {/* Navegação */}
          <div className="flex items-center gap-3">
            {prevLesson ? (
              <Link
                href={`/cursos/${slug}/aulas/${prevLesson.id}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#0A1232] text-white/50 border border-white/[0.08] hover:bg-[#0F1940] hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Link>
            ) : (
              <Link
                href={`/cursos/${slug}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#0A1232] text-white/50 border border-white/[0.08] hover:bg-[#0F1940] hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Visão geral
              </Link>
            )}
            {nextLesson && (
              <Link
                href={`/cursos/${slug}/aulas/${nextLesson.id}`}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-[#FFB800] text-[#0D1638] hover:bg-[#FFC933] transition-colors"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Sidebar de aulas — desktop */}
        <div className="hidden lg:block rounded-xl bg-[#0A1232] border border-white/[0.08] h-fit max-h-[80vh] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-white/70">Conteúdo do curso</p>
          </div>
          <div className="overflow-y-auto max-h-[calc(80vh-44px)]">
            {moduleListEl}
          </div>
        </div>

      </div>
    </div>
  )
}
