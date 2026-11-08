'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function resgatarCertificado(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Você precisa estar logado.' }

  const w1 = (formData.get('word1') as string)?.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const w2 = (formData.get('word2') as string)?.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const w3 = (formData.get('word3') as string)?.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const fullName = (formData.get('full_name') as string)?.trim()

  if (!w1 || !w2 || !w3 || !fullName) return { error: 'Preencha todos os campos.' }

  // Busca config ativa
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: config } = await sb.from('launch_config').select('id, keyword_1, keyword_2, keyword_3').eq('is_active', true).single()
  if (!config) return { error: 'Configuração não encontrada.' }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const k1 = normalize(config.keyword_1)
  const k2 = normalize(config.keyword_2)
  const k3 = normalize(config.keyword_3)

  // Verifica as 3 palavras (independente da ordem)
  const submitted = [w1, w2, w3].sort().join('|')
  const correct   = [k1, k2, k3].sort().join('|')

  if (submitted !== correct) {
    return { error: 'Palavras-chave incorretas. Assista as aulas ao vivo com atenção! 😊' }
  }

  // Gera ou retorna certificado já existente
  const { data: existing } = await sb
    .from('user_certificates').select('*').eq('user_id', user.id).eq('certificate_type', 'launch').single()

  if (existing) return { success: true, certificate: existing }

  const code = `IDM-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const { data: cert, error: certError } = await sb.from('user_certificates').insert({
    user_id: user.id,
    launch_id: config.id,
    full_name: fullName,
    certificate_code: code,
    certificate_type: 'launch',
  }).select().single()

  if (certError) return { error: 'Erro ao gerar certificado. Tente novamente.' }

  revalidatePath('/certificados')
  revalidatePath('/lancamento')
  return { success: true, certificate: cert }
}
