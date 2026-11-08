'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const full_name = formData.get('full_name') as string
  const bio = formData.get('bio') as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('profiles') as any)
    .update({ full_name, bio })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/perfil')
  revalidatePath('/dashboard')
  return { success: 'Perfil atualizado com sucesso!' }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const file = formData.get('avatar') as File
  if (!file || !file.size) return { error: 'Nenhum arquivo selecionado' }

  const ext = file.name.split('.').pop()
  const path = `${user.id}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('profiles') as any).update({ avatar_url: publicUrl }).eq('id', user.id)

  revalidatePath('/perfil')
  return { success: 'Avatar atualizado!', avatarUrl: publicUrl }
}
