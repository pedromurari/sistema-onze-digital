'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { slugify } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdminLesson = {
  id: string
  module_id: string
  title: string
  description: string | null
  lesson_type: 'video' | 'text' | 'file'
  video_url: string | null
  video_duration: number | null
  content: string | null
  file_url: string | null
  is_free_preview: boolean
  sort_order: number
}

export type AdminModule = {
  id: string
  product_id: string
  title: string
  description: string | null
  sort_order: number
  lessons: AdminLesson[]
}

export type AdminCourse = {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnail_url: string | null
  product_type: string
  is_published: boolean
  sort_order: number
  created_at: string
  modules: AdminModule[]
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getAdminCourses() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .select('id,slug,title,thumbnail_url,product_type,is_published,sort_order,created_at')
    .order('sort_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function getAdminCourseBySlug(slug: string): Promise<AdminCourse | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: product, error } = await sb
    .from('products')
    .select('id,slug,title,description,thumbnail_url,product_type,is_published,sort_order,created_at')
    .eq('slug', slug)
    .single()

  if (error || !product) return null

  const { data: modules } = await sb
    .from('modules')
    .select('id,product_id,title,description,sort_order')
    .eq('product_id', product.id)
    .order('sort_order', { ascending: true })

  const moduleList: AdminModule[] = []
  for (const mod of (modules ?? [])) {
    const { data: lessons } = await sb
      .from('lessons')
      .select('id,module_id,title,description,lesson_type,video_url,video_duration,content,file_url,is_free_preview,sort_order')
      .eq('module_id', mod.id)
      .order('sort_order', { ascending: true })
    moduleList.push({ ...mod, lessons: lessons ?? [] })
  }

  return { ...product, modules: moduleList }
}

export async function createCourse(data: {
  title: string
  description?: string | null
  thumbnail_url?: string | null
  product_type?: string
}): Promise<{ id?: string; slug?: string; error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await supabase.auth.getUser()
  const slug = slugify(data.title) || `produto-${Date.now()}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase.from('products') as any)
    .insert({
      slug,
      title: data.title,
      description: data.description ?? null,
      thumbnail_url: data.thumbnail_url ?? null,
      product_type: data.product_type ?? 'course',
      is_published: false,
      sort_order: 0,
      created_by: user?.id ?? null,
    })
    .select('id,slug')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return { id: created.id, slug: created.slug }
}

export async function updateCourse(id: string, data: {
  title?: string
  slug?: string
  description?: string | null
  thumbnail_url?: string | null
  product_type?: string
  is_published?: boolean
  sort_order?: number
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('products') as any)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  revalidatePath('/cursos')
  return {}
}

// ─── Modules ──────────────────────────────────────────────────────────────────

export async function createModule(data: {
  product_id: string
  title: string
  description?: string | null
  sort_order?: number
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase.from('modules') as any)
    .insert(data)
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return { id: created.id }
}

export async function updateModule(id: string, data: {
  title?: string
  description?: string | null
  sort_order?: number
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('modules') as any)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return {}
}

export async function deleteModule(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('modules') as any).delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return {}
}

// ─── Lessons ──────────────────────────────────────────────────────────────────

export async function createLesson(data: {
  module_id: string
  title: string
  description?: string | null
  lesson_type?: 'video' | 'text' | 'file'
  video_url?: string | null
  video_duration?: number | null
  content?: string | null
  file_url?: string | null
  is_free_preview?: boolean
  sort_order?: number
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase.from('lessons') as any)
    .insert(data)
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return { id: created.id }
}

export async function updateLesson(id: string, data: {
  title?: string
  description?: string | null
  lesson_type?: 'video' | 'text' | 'file'
  video_url?: string | null
  video_duration?: number | null
  content?: string | null
  file_url?: string | null
  is_free_preview?: boolean
  sort_order?: number
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('lessons') as any)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return {}
}

export async function deleteLesson(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('lessons') as any).delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cursos')
  return {}
}
