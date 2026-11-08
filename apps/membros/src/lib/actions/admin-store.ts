'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AdminProduct = {
  id: string
  slug: string
  title: string
  thumbnail_url: string | null
  product_type: string
  is_published: boolean
  is_featured: boolean
  price: number | null
  original_price: number | null
  currency: string
  payment_type: string
  cta_label: string | null
  badge_label: string | null
  checkout_url: string | null
  highlights: string[] | null
  short_description: string | null
  sort_order: number
}

export type AdminTestimonial = {
  id: string
  product_id: string | null
  author_name: string
  author_role: string | null
  avatar_url: string | null
  content: string
  rating: number | null
  is_featured: boolean
  sort_order: number
  created_at: string
}

export async function getAdminProducts(): Promise<AdminProduct[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .select('id,slug,title,thumbnail_url,product_type,is_published,is_featured,price,original_price,currency,payment_type,cta_label,badge_label,checkout_url,highlights,short_description,sort_order')
    .order('sort_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function getAdminProductById(id: string): Promise<AdminProduct | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .select('id,slug,title,thumbnail_url,product_type,is_published,is_featured,price,original_price,currency,payment_type,cta_label,badge_label,checkout_url,highlights,short_description,sort_order')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function updateProductStoreFields(id: string, fields: {
  price?: number | null
  original_price?: number | null
  currency?: string
  payment_type?: string
  checkout_url?: string | null
  cta_label?: string | null
  badge_label?: string | null
  highlights?: string[] | null
  short_description?: string | null
  is_featured?: boolean
  is_published?: boolean
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('products') as any)
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/loja')
  revalidatePath('/dashboard')
  revalidatePath('/loja')
  revalidatePath('/')
  return {}
}

export async function getAdminTestimonials(): Promise<AdminTestimonial[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('testimonials') as any)
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function createTestimonial(data: {
  author_name: string
  author_role?: string | null
  avatar_url?: string | null
  content: string
  rating?: number | null
  is_featured?: boolean
  sort_order?: number
  product_id?: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('testimonials') as any).insert(data)
  if (error) return { error: error.message }
  revalidatePath('/admin/depoimentos')
  revalidatePath('/loja')
  return {}
}

export async function updateTestimonial(id: string, data: {
  author_name?: string
  author_role?: string | null
  avatar_url?: string | null
  content?: string
  rating?: number | null
  is_featured?: boolean
  sort_order?: number
  product_id?: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('testimonials') as any).update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/depoimentos')
  revalidatePath('/loja')
  return {}
}

export async function deleteTestimonial(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('testimonials') as any).delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/depoimentos')
  revalidatePath('/loja')
  return {}
}
