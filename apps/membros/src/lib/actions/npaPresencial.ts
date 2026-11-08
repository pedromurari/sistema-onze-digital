'use server'

import { createClient } from '@/lib/supabase/server'
import { createSistema11Client } from '@/lib/sistema11'

export interface NpaEventoAdmin {
  id: string
  nome: string
  local: string | null
  data_evento: string | null
  ativo: boolean
  slug: string | null
  ebook_url: string | null
  telas_url: string | null
  telas_liberado: boolean
  telas_liberado_em: string | null
}

// Este app e o CRM do Sistema 11ds são projetos Supabase diferentes — a sessão daqui
// não vale lá. Por isso cada action confere aqui (profiles.role === 'admin') antes de
// usar o client com service role do Sistema 11ds.
async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from('profiles') as any)
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado.')
}

export async function listNpaEventosAdmin(): Promise<NpaEventoAdmin[]> {
  await assertAdmin()

  const sistema11 = createSistema11Client()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sistema11.from('npa_eventos') as any)
    .select(
      'id, nome, local, data_evento, ativo, slug, ebook_url, telas_url, telas_liberado, telas_liberado_em'
    )
    .order('data_evento', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('[npaPresencial] listNpaEventosAdmin:', error)
    throw new Error('Erro ao listar eventos.')
  }

  return data ?? []
}

export async function updateNpaEventoAdmin(
  eventoId: string,
  patch: { slug?: string; ebook_url?: string; telas_url?: string; telas_liberado?: boolean }
): Promise<NpaEventoAdmin> {
  await assertAdmin()

  const sistema11 = createSistema11Client()
  const updates: Record<string, unknown> = {}

  if (typeof patch.slug === 'string') updates.slug = patch.slug.trim() || null
  if (typeof patch.ebook_url === 'string') updates.ebook_url = patch.ebook_url.trim() || null
  if (typeof patch.telas_url === 'string') updates.telas_url = patch.telas_url.trim() || null

  if (typeof patch.telas_liberado === 'boolean') {
    if (patch.telas_liberado) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: atual, error: atualError } = await (sistema11.from('npa_eventos') as any)
        .select('telas_url')
        .eq('id', eventoId)
        .maybeSingle()

      if (atualError) throw new Error('Erro ao verificar evento.')

      const telasUrl = (updates.telas_url as string | undefined) ?? atual?.telas_url
      if (!telasUrl) throw new Error('Preencha o link das telas antes de liberar.')

      updates.telas_liberado = true
      updates.telas_liberado_em = new Date().toISOString()
    } else {
      updates.telas_liberado = false
    }
  }

  if (Object.keys(updates).length === 0) throw new Error('Nada para atualizar.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sistema11.from('npa_eventos') as any)
    .update(updates)
    .eq('id', eventoId)
    .select(
      'id, nome, local, data_evento, ativo, slug, ebook_url, telas_url, telas_liberado, telas_liberado_em'
    )
    .single()

  if (error) {
    console.error('[npaPresencial] updateNpaEventoAdmin:', error)
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Esse link (slug) já está em uso por outro evento.')
    }
    throw new Error('Erro ao salvar.')
  }

  return data
}
