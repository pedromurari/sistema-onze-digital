'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import { gradeSubmission } from '@/lib/ai/grading'

const PATH = '/admin/formacao'

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Sem permissão')
  return { supabase, user }
}

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

/* ─── MÓDULOS ─────────────────────────────────────────── */

export async function createFormacaoModule(title: string): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: last } = await sb.from('modules').select('sort_order').eq('product_id', FORMACAO_PRODUCT_ID)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sortOrder = (last?.sort_order ?? -1) + 1
    const { data, error } = await sb.from('modules')
      .insert({ product_id: FORMACAO_PRODUCT_ID, title, sort_order: sortOrder })
      .select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao criar módulo' }
    revalidatePath(PATH)
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateFormacaoModule(
  id: string,
  fields: { title?: string; description?: string | null; released?: boolean; release_at?: string | null }
): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('modules').update(fields).eq('id', id).eq('product_id', FORMACAO_PRODUCT_ID)
    if (error) return { ok: false, error: 'Falha ao atualizar módulo' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function deleteFormacaoModule(id: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('modules').delete().eq('id', id).eq('product_id', FORMACAO_PRODUCT_ID)
    if (error) return { ok: false, error: 'Falha ao excluir módulo' }
    revalidatePath(PATH)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── AULAS ───────────────────────────────────────────── */

export async function createFormacaoLesson(
  moduleId: string,
  fields: { title: string; lesson_type?: 'video' | 'text' | 'file'; video_url?: string; description?: string; content?: string; file_url?: string }
): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: last } = await sb.from('lessons').select('sort_order').eq('module_id', moduleId)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sortOrder = (last?.sort_order ?? -1) + 1
    const { data, error } = await sb.from('lessons')
      .insert({ module_id: moduleId, sort_order: sortOrder, lesson_type: 'video', ...fields })
      .select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao criar aula' }
    revalidatePath(PATH)
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateFormacaoLesson(
  id: string,
  fields: { title?: string; video_url?: string; description?: string; content?: string; file_url?: string; lesson_type?: 'video' | 'text' | 'file' }
): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('lessons').update(fields).eq('id', id)
    if (error) return { ok: false, error: 'Falha ao atualizar aula' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function deleteFormacaoLesson(id: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('lessons').delete().eq('id', id)
    if (error) return { ok: false, error: 'Falha ao excluir aula' }
    revalidatePath(PATH)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── MATERIAIS ───────────────────────────────────────── */

export async function createFormacaoMaterial(fields: {
  title: string; type: 'pdf' | 'link' | 'image' | 'video'; url: string
  module_id?: string | null; lesson_id?: string | null
}): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('materials')
      .insert({ product_id: FORMACAO_PRODUCT_ID, sort_order: 0, ...fields })
      .select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao adicionar material' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function deleteFormacaoMaterial(id: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('materials').delete().eq('id', id)
    if (error) return { ok: false, error: 'Falha ao excluir material' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    revalidatePath(`${PATH}/biblioteca`)
    revalidatePath('/formacao/biblioteca')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── BIBLIOTECA (arquivos gerais da turma) ─────────────── */

const LIBRARY_EXT_TYPE: Record<string, 'pdf' | 'image' | 'video'> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  mp4: 'video', mov: 'video', webm: 'video',
}

export async function uploadFormacaoLibraryFile(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    const title = (formData.get('title') as string | null)?.trim()
    const file = formData.get('file') as File | null
    if (!title) return { ok: false, error: 'Título obrigatório' }
    if (!file || !file.size) return { ok: false, error: 'Selecione um arquivo' }

    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const path = `formacao/biblioteca/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const { error: uploadError } = await supabase.storage.from('uploads').upload(path, file)
    if (uploadError) return { ok: false, error: 'Falha ao subir arquivo: ' + uploadError.message }

    const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('materials')
      .insert({
        product_id: FORMACAO_PRODUCT_ID,
        module_id: null,
        lesson_id: null,
        title,
        type: LIBRARY_EXT_TYPE[ext] ?? 'pdf',
        url: publicUrl,
        sort_order: 0,
      })
      .select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao registrar material' }

    revalidatePath(`${PATH}/biblioteca`)
    revalidatePath('/formacao/biblioteca')
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── TURMAS ──────────────────────────────────────────── */

export async function createTurma(fields: { code: string; name?: string; start_date?: string | null }): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: turma, error } = await sb.from('turmas')
      .insert({ product_id: FORMACAO_PRODUCT_ID, code: fields.code.trim(), name: fields.name || `Turma ${fields.code.trim()}`, start_date: fields.start_date ?? null })
      .select('id').single()
    if (error || !turma) return { ok: false, error: 'Falha ao criar turma (código já existe?)' }

    const { data: modules } = await sb.from('modules').select('id').eq('product_id', FORMACAO_PRODUCT_ID)
    if (modules && modules.length > 0) {
      await sb.from('turma_module_releases').insert(
        modules.map((m: { id: string }) => ({ turma_id: turma.id, module_id: m.id, released: false }))
      )
    }
    revalidatePath(PATH)
    return { ok: true, data: { id: turma.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateTurmaGroupUrl(turmaId: string, groupUrl: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('turmas').update({ group_url: groupUrl || null }).eq('id', turmaId)
    if (error) return { ok: false, error: 'Falha ao salvar link do grupo' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateTurmaModuleRelease(
  turmaId: string,
  moduleId: string,
  fields: { released?: boolean; release_at?: string | null }
): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('turma_module_releases')
      .upsert({ turma_id: turmaId, module_id: moduleId, ...fields }, { onConflict: 'turma_id,module_id' })
    if (error) return { ok: false, error: 'Falha ao atualizar liberação' }
    revalidatePath(PATH)
    revalidatePath('/formacao')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function enrollStudentInTurma(userId: string, turmaId: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('enrollments')
      .upsert({ user_id: userId, product_id: FORMACAO_PRODUCT_ID, turma_id: turmaId, is_active: true }, { onConflict: 'user_id,product_id' })
    if (error) return { ok: false, error: 'Falha ao matricular aluno' }
    revalidatePath('/admin/alunos')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── TAREFAS ─────────────────────────────────────────── */

export async function createFormacaoTask(fields: {
  title: string; instructions: string; rubric?: string
  module_id: string; lesson_id?: string | null; due_at?: string | null; published?: boolean
}): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('tasks').insert({
      title: fields.title,
      description: fields.instructions,
      rubric: fields.rubric ?? '',
      module_id: fields.module_id,
      lesson_id: fields.lesson_id ?? null,
      due_at: fields.due_at ?? null,
      product_id: FORMACAO_PRODUCT_ID,
      task_type: 'text',
      is_required: fields.published ?? true,
    }).select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao criar tarefa' }
    revalidatePath(`${PATH}/tarefas`)
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateFormacaoTask(
  id: string,
  fields: { title?: string; instructions?: string; rubric?: string; due_at?: string | null; published?: boolean }
): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    const patch: Record<string, unknown> = {}
    if (fields.title !== undefined) patch.title = fields.title
    if (fields.instructions !== undefined) patch.description = fields.instructions
    if (fields.rubric !== undefined) patch.rubric = fields.rubric
    if (fields.due_at !== undefined) patch.due_at = fields.due_at
    if (fields.published !== undefined) patch.is_required = fields.published
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('tasks').update(patch).eq('id', id)
    if (error) return { ok: false, error: 'Falha ao atualizar tarefa' }
    revalidatePath(`${PATH}/tarefas`)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export interface QuizQuestionInput { id: string; text: string; choices: { key: string; text: string }[]; correctKey: string | null }

export async function createFormacaoQuizTask(fields: {
  title: string; module_id: string; lesson_id?: string | null; due_at?: string | null; published?: boolean
  mcQuestions: QuizQuestionInput[]; essayPrompt: string; declarationText: string; rubric?: string
}): Promise<Result<{ id: string }>> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('tasks').insert({
      title: fields.title,
      description: fields.essayPrompt,
      rubric: fields.rubric ?? '',
      module_id: fields.module_id,
      lesson_id: fields.lesson_id ?? null,
      due_at: fields.due_at ?? null,
      product_id: FORMACAO_PRODUCT_ID,
      task_type: 'quiz',
      options: { mcQuestions: fields.mcQuestions, essayPrompt: fields.essayPrompt, declarationText: fields.declarationText },
      is_required: fields.published ?? true,
    }).select('id').single()
    if (error || !data) return { ok: false, error: 'Falha ao criar avaliação' }
    revalidatePath(`${PATH}/tarefas`)
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function updateFormacaoQuizTask(
  id: string,
  fields: {
    title?: string; due_at?: string | null; published?: boolean; rubric?: string
    mcQuestions?: QuizQuestionInput[]; essayPrompt?: string; declarationText?: string
  }
): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const patch: Record<string, unknown> = {}
    if (fields.title !== undefined) patch.title = fields.title
    if (fields.rubric !== undefined) patch.rubric = fields.rubric
    if (fields.due_at !== undefined) patch.due_at = fields.due_at
    if (fields.published !== undefined) patch.is_required = fields.published

    if (fields.mcQuestions !== undefined || fields.essayPrompt !== undefined || fields.declarationText !== undefined) {
      const { data: current } = await sb.from('tasks').select('options').eq('id', id).single()
      const currentOptions = current?.options ?? { mcQuestions: [], essayPrompt: '', declarationText: '' }
      const nextOptions = {
        mcQuestions: fields.mcQuestions ?? currentOptions.mcQuestions,
        essayPrompt: fields.essayPrompt ?? currentOptions.essayPrompt,
        declarationText: fields.declarationText ?? currentOptions.declarationText,
      }
      patch.options = nextOptions
      if (fields.essayPrompt !== undefined) patch.description = fields.essayPrompt
    }

    const { error } = await sb.from('tasks').update(patch).eq('id', id)
    if (error) return { ok: false, error: 'Falha ao atualizar avaliação' }
    revalidatePath(`${PATH}/tarefas`)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

export async function deleteFormacaoTask(id: string): Promise<Result> {
  try {
    const { supabase } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('tasks').delete().eq('id', id)
    if (error) return { ok: false, error: 'Falha ao excluir tarefa' }
    revalidatePath(`${PATH}/tarefas`)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/* ─── ENVIO + CORREÇÃO POR IA ─────────────────────────── */

export async function submitFormacaoTask(taskId: string, answer: string): Promise<Result<{ submissionId: string }>> {
  if (!answer.trim()) return { ok: false, error: 'Resposta vazia' }
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autorizado' }

  const { data: task } = await sb.from('tasks')
    .select('id, title, description, rubric, module_id, lesson_id').eq('id', taskId).single()
  if (!task) return { ok: false, error: 'Tarefa não encontrada' }

  const [{ data: mod }, { data: lesson }] = await Promise.all([
    sb.from('modules').select('title').eq('id', task.module_id).maybeSingle(),
    task.lesson_id ? sb.from('lessons').select('description, content').eq('id', task.lesson_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const { data: submission, error: subError } = await sb.from('task_submissions')
    .upsert({ task_id: taskId, user_id: user.id, answer, status: 'submitted', submitted_at: new Date().toISOString() }, { onConflict: 'task_id,user_id' })
    .select('id').single()
  if (subError || !submission) return { ok: false, error: 'Falha ao enviar resposta' }

  try {
    const grade = await gradeSubmission({
      taskTitle: task.title,
      taskInstructions: task.description ?? '',
      rubric: task.rubric ?? '',
      lessonContent: [lesson?.description, lesson?.content].filter(Boolean).join('\n\n'),
      moduleTitle: mod?.title ?? '',
      studentAnswer: answer,
    })
    await sb.from('grades').upsert(
      { submission_id: submission.id, ai_score: grade.score, ai_feedback: grade.feedback, published: false },
      { onConflict: 'submission_id' }
    )
  } catch {
    // segue sem nota da IA — admin corrige manualmente ou tenta de novo depois
  }

  revalidatePath('/formacao')
  revalidatePath(`${PATH}/tarefas`)
  return { ok: true, data: { submissionId: submission.id } }
}

export async function submitFormacaoQuiz(
  taskId: string,
  fields: { mcAnswers: Record<string, string>; essayAnswer: string; declarationAccepted: boolean }
): Promise<Result<{ submissionId: string }>> {
  if (!fields.declarationAccepted) return { ok: false, error: 'É necessário aceitar a declaração de autoria' }
  if (!fields.essayAnswer.trim()) return { ok: false, error: 'Resposta dissertativa vazia' }
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autorizado' }

  const { data: task } = await sb.from('tasks')
    .select('id, title, description, rubric, module_id, lesson_id, task_type, options').eq('id', taskId).single()
  if (!task || task.task_type !== 'quiz') return { ok: false, error: 'Avaliação não encontrada' }

  const mcQuestions = (task.options?.mcQuestions ?? []) as QuizQuestionInput[]
  if (mcQuestions.some((q) => !fields.mcAnswers[q.id])) return { ok: false, error: 'Responda todas as questões de múltipla escolha' }

  let mcScore = 0
  let mcTotal = 0
  for (const q of mcQuestions) {
    if (!q.correctKey) continue
    mcTotal += 1
    if (fields.mcAnswers[q.id] === q.correctKey) mcScore += 1
  }

  const [{ data: mod }, { data: lesson }] = await Promise.all([
    sb.from('modules').select('title').eq('id', task.module_id).maybeSingle(),
    task.lesson_id ? sb.from('lessons').select('description, content').eq('id', task.lesson_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const { data: submission, error: subError } = await sb.from('task_submissions')
    .upsert({
      task_id: taskId, user_id: user.id, answer: fields.essayAnswer, status: 'submitted', submitted_at: new Date().toISOString(),
      answer_data: { mcAnswers: fields.mcAnswers, mcScore, mcTotal, declarationAccepted: fields.declarationAccepted },
    }, { onConflict: 'task_id,user_id' })
    .select('id').single()
  if (subError || !submission) return { ok: false, error: 'Falha ao enviar resposta' }

  try {
    const grade = await gradeSubmission({
      taskTitle: task.title,
      taskInstructions: task.options?.essayPrompt ?? task.description ?? '',
      rubric: task.rubric ?? '',
      lessonContent: [lesson?.description, lesson?.content].filter(Boolean).join('\n\n'),
      moduleTitle: mod?.title ?? '',
      studentAnswer: fields.essayAnswer,
    })
    await sb.from('grades').upsert(
      { submission_id: submission.id, ai_score: grade.score, ai_feedback: grade.feedback, published: false },
      { onConflict: 'submission_id' }
    )
  } catch {
    // segue sem nota da IA — admin corrige manualmente ou tenta de novo depois
  }

  revalidatePath('/formacao')
  revalidatePath(`${PATH}/tarefas`)
  return { ok: true, data: { submissionId: submission.id } }
}

export async function reviewFormacaoGrade(
  gradeId: string,
  fields: { finalScore: number; finalFeedback: string; publish: boolean }
): Promise<Result> {
  try {
    const { supabase, user } = await getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('grades').update({
      final_score: fields.finalScore,
      final_feedback: fields.finalFeedback,
      reviewed_by: user.id,
      published: fields.publish,
      updated_at: new Date().toISOString(),
    }).eq('id', gradeId)
    if (error) return { ok: false, error: 'Falha ao publicar nota' }
    revalidatePath(`${PATH}/tarefas`)
    revalidatePath('/formacao/notas')
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}
