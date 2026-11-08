import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import type { Lesson } from '@/types'

export interface FormacaoMaterial {
  id: string
  title: string
  type: string
  url: string
  module_id: string | null
  lesson_id: string | null
}

// Arquivos gerais da biblioteca da turma (module_id/lesson_id nulos = não ligados a uma aula específica).
export async function getFormacaoLibrary(): Promise<FormacaoMaterial[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('materials').select('*')
    .eq('product_id', FORMACAO_PRODUCT_ID).is('module_id', null).is('lesson_id', null)
    .order('created_at', { ascending: false })
  return data ?? []
}

export interface FormacaoModuleAdmin {
  id: string
  title: string
  description: string | null
  sort_order: number
  released: boolean
  release_at: string | null
  lessons: Lesson[]
  materials: FormacaoMaterial[]
}

export async function getFormacaoModulesAdmin(): Promise<FormacaoModuleAdmin[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [{ data: modules }, { data: materials }] = await Promise.all([
    sb.from('modules').select('*, lessons (*)').eq('product_id', FORMACAO_PRODUCT_ID).order('sort_order'),
    sb.from('materials').select('*').eq('product_id', FORMACAO_PRODUCT_ID).order('sort_order'),
  ])

  return ((modules ?? []) as (FormacaoModuleAdmin & { lessons: Lesson[] })[]).map((m) => ({
    ...m,
    lessons: [...(m.lessons ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    materials: ((materials ?? []) as FormacaoMaterial[]).filter((mt) => mt.module_id === m.id),
  }))
}

export interface FormacaoSyllabusModule {
  moduleId: string
  title: string
  description: string | null
  sortOrder: number
  unlocked: boolean
  unlockAt: string | null
  lessons: Lesson[]
  materials: FormacaoMaterial[]
}

// Usa a RPC get_formacao_syllabus() que já resolve liberação global + por turma via RLS/SECURITY DEFINER.
export async function getFormacaoModulesForStudent(): Promise<FormacaoSyllabusModule[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: syllabus } = await sb.rpc('get_formacao_syllabus')
  if (!syllabus) return []

  const moduleIds = (syllabus as { module_id: string }[]).map((m) => m.module_id)
  const [{ data: lessons }, { data: materials }] = await Promise.all([
    sb.from('lessons').select('*').in('module_id', moduleIds).order('sort_order'),
    sb.from('materials').select('*').eq('product_id', FORMACAO_PRODUCT_ID),
  ])

  return (syllabus as { module_id: string; title: string; description: string | null; sort_order: number; unlocked: boolean; unlock_at: string | null }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      moduleId: m.module_id,
      title: m.title,
      description: m.description,
      sortOrder: m.sort_order,
      unlocked: m.unlocked,
      unlockAt: m.unlock_at,
      lessons: m.unlocked ? ((lessons ?? []) as Lesson[]).filter((l) => l.module_id === m.module_id) : [],
      materials: ((materials ?? []) as FormacaoMaterial[]).filter((mt) => mt.module_id === m.module_id),
    }))
}

export interface FormacaoProgressSummary {
  unlockedModules: number
  totalModules: number
  totalLessons: number
  completedLessons: number
  nextLesson: { id: string; title: string; moduleTitle: string } | null
}

// Resumo pra hero da página /formacao: quantos módulos liberados, aulas concluídas
// e qual a próxima aula a assistir (primeira não concluída dentro de módulo liberado).
export async function getFormacaoProgressSummary(): Promise<FormacaoProgressSummary> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const user = await getCachedUser()

  const { data: syllabus } = await sb.rpc('get_formacao_syllabus')
  const modules = (syllabus ?? []) as { module_id: string; title: string; unlocked: boolean; sort_order: number }[]
  const unlocked = modules.filter((m) => m.unlocked).sort((a, b) => a.sort_order - b.sort_order)
  const unlockedIds = unlocked.map((m) => m.module_id)

  if (unlockedIds.length === 0) {
    return { unlockedModules: 0, totalModules: modules.length, totalLessons: 0, completedLessons: 0, nextLesson: null }
  }

  const { data: lessons } = await sb.from('lessons').select('id, title, module_id, sort_order').in('module_id', unlockedIds).order('sort_order')
  const lessonList = (lessons ?? []) as { id: string; title: string; module_id: string; sort_order: number }[]

  const { data: progress } = user
    ? await sb.from('progress').select('lesson_id, completed').eq('user_id', user.id).in('lesson_id', lessonList.map((l) => l.id))
    : { data: [] }
  const completedIds = new Set(((progress ?? []) as { lesson_id: string; completed: boolean }[]).filter((p) => p.completed).map((p) => p.lesson_id))

  const moduleTitleById = new Map(unlocked.map((m) => [m.module_id, m.title]))
  const nextLessonRow = lessonList.find((l) => !completedIds.has(l.id))

  return {
    unlockedModules: unlocked.length,
    totalModules: modules.length,
    totalLessons: lessonList.length,
    completedLessons: completedIds.size,
    nextLesson: nextLessonRow
      ? { id: nextLessonRow.id, title: nextLessonRow.title, moduleTitle: moduleTitleById.get(nextLessonRow.module_id) ?? '' }
      : null,
  }
}

export async function isEnrolledInFormacao(): Promise<boolean> {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('enrollments').select('id')
    .eq('user_id', user.id).eq('product_id', FORMACAO_PRODUCT_ID).eq('is_active', true).maybeSingle()
  return !!data
}

export interface Turma {
  id: string
  code: string
  name: string
  start_date: string | null
  is_active: boolean
  group_url: string | null
}

export async function getTurmas(): Promise<Turma[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('turmas').select('*').eq('product_id', FORMACAO_PRODUCT_ID).order('code')
  return data ?? []
}

// Turma do próprio aluno logado (via enrollments.turma_id), pra exibir o link do grupo na página /formacao.
export async function getMyFormacaoTurma(): Promise<Turma | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const user = await getCachedUser()
  if (!user) return null

  const { data: enrollment } = await sb.from('enrollments').select('turma_id')
    .eq('user_id', user.id).eq('product_id', FORMACAO_PRODUCT_ID).eq('is_active', true).maybeSingle()
  if (!enrollment?.turma_id) return null

  const { data: turma } = await sb.from('turmas').select('*').eq('id', enrollment.turma_id).maybeSingle()
  return turma ?? null
}

export interface TurmaModuleRelease {
  module_id: string
  released: boolean
  release_at: string | null
}

export async function getTurmaModuleReleases(turmaId: string): Promise<TurmaModuleRelease[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('turma_module_releases').select('module_id, released, release_at').eq('turma_id', turmaId)
  return data ?? []
}

export interface McChoice { key: string; text: string }
export interface McQuestion { id: string; text: string; choices: McChoice[]; correctKey: string | null }
export interface QuizOptions { mcQuestions: McQuestion[]; essayPrompt: string; declarationText: string }

export interface FormacaoTaskAdmin {
  id: string
  title: string
  instructions: string
  rubric: string
  moduleId: string
  moduleTitle: string
  dueAt: string | null
  published: boolean
  submissionCount: number
  pendingCount: number
  taskType: string
  quiz: QuizOptions | null
}

export async function getFormacaoTasksAdmin(): Promise<FormacaoTaskAdmin[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: tasks } = await sb.from('tasks')
    .select('id, title, description, rubric, module_id, due_at, is_required, task_type, options, modules(title)')
    .eq('product_id', FORMACAO_PRODUCT_ID).order('created_at')
  if (!tasks || tasks.length === 0) return []

  const taskIds = tasks.map((t: { id: string }) => t.id)
  const { data: submissions } = await sb.from('task_submissions')
    .select('id, task_id, grades(published)').in('task_id', taskIds)

  return tasks.map((t: any) => {
    const subs = (submissions ?? []).filter((s: any) => s.task_id === t.id)
    const pending = subs.filter((s: any) => {
      const grade = Array.isArray(s.grades) ? s.grades[0] : s.grades
      return !grade?.published
    })
    return {
      id: t.id,
      title: t.title,
      instructions: t.description ?? '',
      rubric: t.rubric ?? '',
      moduleId: t.module_id,
      moduleTitle: t.modules?.title ?? '',
      dueAt: t.due_at,
      published: t.is_required,
      submissionCount: subs.length,
      pendingCount: pending.length,
      taskType: t.task_type ?? 'text',
      quiz: t.task_type === 'quiz' ? (t.options as QuizOptions) : null,
    }
  })
}

export interface TaskSubmissionRow {
  id: string
  studentName: string
  answer: string
  aiScore: number | null
  aiFeedback: string
  gradeId: string | null
  finalScore: number | null
  finalFeedback: string
  published: boolean
  mcScore: number | null
  mcTotal: number | null
  mcAnswers: Record<string, string> | null
  declarationAccepted: boolean
}

export async function getFormacaoTaskSubmissions(taskId: string): Promise<TaskSubmissionRow[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: submissions } = await sb.from('task_submissions')
    .select('id, user_id, answer, answer_data, grades(id, ai_score, ai_feedback, final_score, final_feedback, published)')
    .eq('task_id', taskId).order('submitted_at', { ascending: false })
  if (!submissions || submissions.length === 0) return []

  const userIds = submissions.map((s: { user_id: string }) => s.user_id)
  const { data: profiles } = await sb.from('profiles').select('id, full_name').in('id', userIds)
  const nameById = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  return submissions.map((s: any) => {
    const grade = Array.isArray(s.grades) ? s.grades[0] : s.grades
    const answerData = s.answer_data ?? null
    return {
      id: s.id,
      studentName: nameById.get(s.user_id) ?? 'Aluno',
      answer: s.answer ?? '',
      aiScore: grade?.ai_score ?? null,
      aiFeedback: grade?.ai_feedback ?? '',
      gradeId: grade?.id ?? null,
      finalScore: grade?.final_score ?? null,
      finalFeedback: grade?.final_feedback ?? '',
      published: grade?.published ?? false,
      mcScore: answerData?.mcScore ?? null,
      mcTotal: answerData?.mcTotal ?? null,
      mcAnswers: answerData?.mcAnswers ?? null,
      declarationAccepted: answerData?.declarationAccepted ?? false,
    }
  })
}

export interface StudentTask {
  id: string
  title: string
  instructions: string
  dueAt: string | null
  taskType: string
  quiz: QuizOptions | null
  mySubmission: {
    answer: string
    status: string
    finalScore: number | null
    finalFeedback: string
    published: boolean
    mcAnswers: Record<string, string> | null
    mcScore: number | null
    mcTotal: number | null
    declarationAccepted: boolean
  } | null
}

export async function getModuleTasksForStudent(moduleId: string): Promise<StudentTask[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const user = await getCachedUser()

  const { data: tasks } = await sb.from('tasks')
    .select('id, title, description, due_at, task_type, options').eq('module_id', moduleId).eq('is_required', true).order('created_at')
  if (!tasks || tasks.length === 0) return []

  const { data: submissions } = user
    ? await sb.from('task_submissions')
        .select('task_id, answer, status, answer_data, grades(final_score, final_feedback, published)')
        .eq('user_id', user.id).in('task_id', tasks.map((t: { id: string }) => t.id))
    : { data: [] }

  const byTask = new Map((submissions ?? []).map((s: any) => [s.task_id, s]))

  return tasks.map((t: any) => {
    const s = byTask.get(t.id) as any
    const grade = s ? (Array.isArray(s.grades) ? s.grades[0] : s.grades) : null
    const answerData = s?.answer_data ?? null
    return {
      id: t.id,
      title: t.title,
      instructions: t.description ?? '',
      dueAt: t.due_at,
      taskType: t.task_type ?? 'text',
      quiz: t.task_type === 'quiz' ? (t.options as QuizOptions) : null,
      mySubmission: s ? {
        answer: s.answer,
        status: s.status,
        finalScore: grade?.published ? grade.final_score : null,
        finalFeedback: grade?.published ? grade.final_feedback : '',
        published: grade?.published ?? false,
        mcAnswers: answerData?.mcAnswers ?? null,
        mcScore: answerData?.mcScore ?? null,
        mcTotal: answerData?.mcTotal ?? null,
        declarationAccepted: answerData?.declarationAccepted ?? false,
      } : null,
    }
  })
}

export interface MyGrade {
  taskId: string
  taskTitle: string
  moduleTitle: string
  finalScore: number
  finalFeedback: string
}

export async function getMyPublishedFormacaoGrades(): Promise<MyGrade[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const user = await getCachedUser()
  if (!user) return []

  const { data } = await sb.from('grades')
    .select('final_score, final_feedback, task_submissions(task_id, user_id, tasks(title, product_id, modules(title)))')
    .eq('published', true)

  return (data ?? [])
    .filter((g: any) => g.task_submissions?.user_id === user.id && g.task_submissions?.tasks?.product_id === FORMACAO_PRODUCT_ID)
    .map((g: any) => ({
      taskId: g.task_submissions.task_id,
      taskTitle: g.task_submissions.tasks?.title ?? '',
      moduleTitle: g.task_submissions.tasks?.modules?.title ?? '',
      finalScore: g.final_score,
      finalFeedback: g.final_feedback ?? '',
    }))
}

export interface FormacaoDeadline {
  id: string
  title: string
  dueAt: string
  moduleTitle: string
}

export async function getFormacaoDeadlines(): Promise<FormacaoDeadline[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('tasks')
    .select('id, title, due_at, modules(title)')
    .eq('product_id', FORMACAO_PRODUCT_ID).eq('is_required', true).not('due_at', 'is', null).order('due_at')

  return (data ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    dueAt: t.due_at,
    moduleTitle: t.modules?.title ?? '',
  }))
}
