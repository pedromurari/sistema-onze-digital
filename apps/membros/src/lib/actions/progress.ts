'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function markLessonComplete(lessonId: string, productSlug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('progress') as any).upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lesson_id' }
  )

  revalidatePath(`/cursos/${productSlug}`)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateWatchSeconds(lessonId: string, watchSeconds: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('progress') as any).upsert(
    { user_id: user.id, lesson_id: lessonId, watch_seconds: watchSeconds },
    { onConflict: 'user_id,lesson_id' }
  )
}
