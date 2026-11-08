'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Sem permissão')
  return { supabase, user }
}

/* ─── MÓDULOS ─── */

export async function createModule(productId: string, title: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: last } = await (supabase as any).from('modules').select('sort_order').eq('product_id', productId).order('sort_order', { ascending: false }).limit(1).single()
  const sortOrder = (last?.sort_order ?? -1) + 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('modules').insert({ product_id: productId, title, sort_order: sortOrder }).select().single()
  if (error) throw error
  revalidatePath(`/cursos`)
  return data
}

export async function updateModule(moduleId: string, title: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('modules').update({ title }).eq('id', moduleId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

export async function deleteModule(moduleId: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('modules').delete().eq('id', moduleId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

/* ─── AULAS ─── */

export async function createLesson(moduleId: string, title: string, videoUrl?: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: last } = await (supabase as any).from('lessons').select('sort_order').eq('module_id', moduleId).order('sort_order', { ascending: false }).limit(1).single()
  const sortOrder = (last?.sort_order ?? -1) + 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('lessons').insert({
    module_id: moduleId, title, video_url: videoUrl ?? null,
    lesson_type: 'video', sort_order: sortOrder
  }).select().single()
  if (error) throw error
  revalidatePath(`/cursos`)
  return data
}

export async function updateLesson(lessonId: string, fields: { title?: string; video_url?: string; description?: string; content?: string }) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('lessons').update(fields).eq('id', lessonId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

export async function deleteLesson(lessonId: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('lessons').delete().eq('id', lessonId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

/* ─── TAREFAS ─── */

export async function createTask(productId: string, moduleId: string | null, lessonId: string | null, title: string, description: string, taskType: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('tasks').insert({
    product_id: productId, module_id: moduleId, lesson_id: lessonId,
    title, description, task_type: taskType
  }).select().single()
  if (error) throw error
  revalidatePath(`/cursos`)
  return data
}

export async function deleteTask(taskId: string) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('tasks').delete().eq('id', taskId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

/* ─── PRODUTO ─── */

export async function updateProduct(productId: string, fields: Record<string, unknown>) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('products').update(fields).eq('id', productId)
  if (error) throw error
  revalidatePath(`/cursos`)
}

export async function createProduct(fields: Record<string, unknown>) {
  const { supabase } = await getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('products').insert(fields).select().single()
  if (error) throw error
  revalidatePath(`/cursos`)
  return data
}
