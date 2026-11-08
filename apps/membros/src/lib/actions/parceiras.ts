'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/serviceAccount'
import { revalidatePath } from 'next/cache'
import type { Partner, PartnerTheme, PartnerWithRelations } from '@/types'

const RESERVED_SLUGS = new Set(['parceiras', 'parceiras-login'])

// "-admin" é reservado pra rota de edição (/[slug]-admin); "parceiras" e
// "parceiras-login" são rotas estáticas fixas — nenhuma parceira pode usar esses slugs.
function validateSlug(slug: string): string | null {
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" é uma URL reservada do sistema, escolha outro slug.`
  }
  if (slug.endsWith('-admin')) {
    return 'O slug não pode terminar em "-admin" (reservado para a URL de edição).'
  }
  return null
}

// Leitura pública (temas têm policy de leitura aberta, não precisa de conta de serviço)
export async function getPartnerThemes(): Promise<PartnerTheme[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('partner_themes') as any)
    .select('*')
    .order('name', { ascending: true })
  if (error) return []
  return data ?? []
}

// A partir daqui, funções chamadas de dentro do gate de senha (/parceiras/*,
// /[slug]-admin) — usam a conta de serviço pra satisfazer o RLS (role=admin).

export async function getAllPartners(): Promise<(Partner & { theme: PartnerTheme | null })[]> {
  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('partners') as any)
    .select('*, theme:partner_themes(*)')
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

export async function getPartnerBySlugForAdmin(slug: string): Promise<PartnerWithRelations | null> {
  const supabase = await createServiceClient()
  const { data: partner } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partners') as any
  )
    .select('*, theme:partner_themes(*)')
    .eq('slug', slug)
    .single()
  if (!partner) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: links } = await (supabase.from('partner_links') as any)
    .select('*')
    .eq('partner_id', partner.id)
    .order('position')

  return { ...partner, links: links ?? [] }
}

// Página pública — sem gate nenhum, usa o client anônimo normal (RLS já
// restringe a leitura só a status='published').
export async function getPublishedPartnerBySlug(slug: string): Promise<PartnerWithRelations | null> {
  const supabase = await createClient()
  const { data: partner } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partners') as any
  )
    .select('*, theme:partner_themes(*), links:partner_links(*)')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  if (!partner) return null
  return partner
}

export async function createPartner(formData: FormData) {
  const slug = (formData.get('slug') as string).trim().toLowerCase()

  const slugError = validateSlug(slug)
  if (slugError) return { error: slugError }

  const supabase = await createServiceClient()
  const payload = {
    slug,
    name: (formData.get('name') as string).trim(),
    tagline: (formData.get('tagline') as string)?.trim() || null,
    bio: (formData.get('bio') as string)?.trim() || null,
    theme_id: formData.get('theme_id') as string,
    status: 'draft' as const,
  }
  const { data, error } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partners') as any
  )
    .insert(payload)
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/parceiras')
  return { success: true, id: data.id as string, slug }
}

export async function updatePartner(id: string, formData: FormData) {
  const slug = (formData.get('slug') as string).trim().toLowerCase()

  const slugError = validateSlug(slug)
  if (slugError) return { error: slugError }

  const supabase = await createServiceClient()
  const payload = {
    slug,
    name: (formData.get('name') as string).trim(),
    tagline: (formData.get('tagline') as string)?.trim() || null,
    bio: (formData.get('bio') as string)?.trim() || null,
    theme_id: formData.get('theme_id') as string,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partners') as any).update(payload).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/parceiras')
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true, slug }
}

export async function uploadPartnerAvatar(partnerId: string, slug: string, formData: FormData) {
  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { error: 'Nenhuma imagem selecionada.' }
  if (!file.type.startsWith('image/')) return { error: 'O arquivo precisa ser uma imagem.' }

  const supabase = await createServiceClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${partnerId}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('partner-avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) return { error: uploadError.message }

  const {
    data: { publicUrl },
  } = supabase.storage.from('partner-avatars').getPublicUrl(path)
  // cache-bust pra refletir a troca de foto imediatamente na página pública
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partners') as any
  )
    .update({ avatar_url: avatarUrl })
    .eq('id', partnerId)
  if (updateError) return { error: updateError.message }

  revalidatePath('/parceiras')
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true, avatarUrl }
}

export async function setPartnerStatus(id: string, slug: string, status: 'draft' | 'published') {
  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partners') as any).update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/parceiras')
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}

export async function deletePartner(id: string) {
  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partners') as any).delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/parceiras')
  return { success: true }
}

export async function addPartnerLink(partnerId: string, slug: string, formData: FormData) {
  const supabase = await createServiceClient()
  const { count } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partner_links') as any
  )
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)

  const payload = {
    partner_id: partnerId,
    label: (formData.get('label') as string).trim(),
    url: (formData.get('url') as string).trim(),
    type: (formData.get('type') as string) || 'link',
    icon: (formData.get('icon') as string)?.trim() || null,
    position: count ?? 0,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partner_links') as any).insert(payload)
  if (error) return { error: error.message }
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}

export async function updatePartnerLink(
  linkId: string,
  partnerId: string,
  slug: string,
  formData: FormData
) {
  const supabase = await createServiceClient()
  const payload = {
    label: (formData.get('label') as string).trim(),
    url: (formData.get('url') as string).trim(),
    type: (formData.get('type') as string) || 'link',
    icon: (formData.get('icon') as string)?.trim() || null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partner_links') as any).update(payload).eq('id', linkId)
  if (error) return { error: error.message }
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}

export async function toggleLinkActive(
  linkId: string,
  partnerId: string,
  slug: string,
  isActive: boolean
) {
  const supabase = await createServiceClient()
  const { error } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from('partner_links') as any
  )
    .update({ is_active: isActive })
    .eq('id', linkId)
  if (error) return { error: error.message }
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}

export async function deletePartnerLink(linkId: string, partnerId: string, slug: string) {
  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('partner_links') as any).delete().eq('id', linkId)
  if (error) return { error: error.message }
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}

export async function reorderPartnerLinks(partnerId: string, slug: string, orderedIds: string[]) {
  const supabase = await createServiceClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('partner_links') as any).update({ position: index }).eq('id', id)
    )
  )
  revalidatePath(`/${slug}-admin`)
  revalidatePath(`/${slug}`)
  return { success: true }
}
