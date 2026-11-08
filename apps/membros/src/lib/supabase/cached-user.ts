import 'server-only'
import { cache } from 'react'
import { createClient } from './server'

// Dedupe repeated auth/profile lookups within a single request — layout, page and
// query helpers all need the same user/profile, and each Supabase call is a network
// round-trip. Wrapping with React cache() collapses them into a single lookup per request.
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getCachedProfile = cache(async (userId: string) => {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('profiles').select('*').eq('id', userId).single()
  return data
})
