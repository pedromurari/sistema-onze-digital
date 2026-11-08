'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface BannerSlide {
  id: string
  title: string
  subtitle: string | null
  badge_label: string | null
  image_url: string | null
  gradient: string | null
  cta_label: string | null
  cta_url: string | null
  open_in_new: boolean
  placement: 'hero' | 'promo'
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export async function getBannerSlides(placement: 'hero' | 'promo' = 'hero'): Promise<BannerSlide[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('banner_slides') as any)
    .select('*')
    .eq('is_active', true)
    .eq('placement', placement)
    .order('sort_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function getAllBannerSlides(): Promise<BannerSlide[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('banner_slides') as any)
    .select('*')
    .order('placement', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function createBannerSlide(formData: FormData) {
  const supabase = await createClient()
  const payload = {
    title: formData.get('title') as string,
    subtitle: (formData.get('subtitle') as string) || null,
    badge_label: (formData.get('badge_label') as string) || null,
    image_url: (formData.get('image_url') as string) || null,
    cta_label: (formData.get('cta_label') as string) || 'Saiba mais',
    cta_url: (formData.get('cta_url') as string) || null,
    open_in_new: formData.get('open_in_new') === 'true',
    placement: (formData.get('placement') as string) || 'hero',
    is_active: true,
    sort_order: Number(formData.get('sort_order') ?? 0),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('banner_slides') as any).insert(payload)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateBannerSlide(id: string, formData: FormData) {
  const supabase = await createClient()
  const payload = {
    title: formData.get('title') as string,
    subtitle: (formData.get('subtitle') as string) || null,
    badge_label: (formData.get('badge_label') as string) || null,
    image_url: (formData.get('image_url') as string) || null,
    cta_label: (formData.get('cta_label') as string) || 'Saiba mais',
    cta_url: (formData.get('cta_url') as string) || null,
    open_in_new: formData.get('open_in_new') === 'true',
    placement: (formData.get('placement') as string) || 'hero',
    is_active: formData.get('is_active') === 'true',
    sort_order: Number(formData.get('sort_order') ?? 0),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('banner_slides') as any).update(payload).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteBannerSlide(id: string) {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('banner_slides') as any).delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleBannerActive(id: string, is_active: boolean) {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('banner_slides') as any).update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  revalidatePath('/dashboard')
  return { success: true }
}
