import { createClient } from '@supabase/supabase-js'

// Client server-only para o Sistema 11ds (o CRM "Sistema 11 Digital", projeto Supabase
// separado deste app). Usar SOMENTE em server-side (API routes, server actions) — nunca
// em Client Component. Requer SISTEMA11_SUPABASE_URL/SISTEMA11_SUPABASE_SERVICE_ROLE_KEY
// no .env.local e nas variáveis de ambiente da Vercel.
export function createSistema11Client() {
  const url = process.env.SISTEMA11_SUPABASE_URL
  const key = process.env.SISTEMA11_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'SISTEMA11_SUPABASE_URL / SISTEMA11_SUPABASE_SERVICE_ROLE_KEY não configuradas.'
    )
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type ElegibilidadeCrm = {
  aluno_id: string
  produto: string
  turma_id: string | null
  turma_nome: string | null
  status: string
  data_matricula: string | null
}

// Elegibilidade real do aluno no CRM (Fase 1 do plano de unificação) --
// chama a RPC portal_elegibilidade_por_pessoa, security definer, grant só
// pra service_role (é por isso que só pode ser chamada daqui, server-side,
// nunca do navegador). pessoaId vem de profiles.crm_pessoa_id.
export async function buscarElegibilidadeCrm(pessoaId: string): Promise<ElegibilidadeCrm[]> {
  const sistema11 = createSistema11Client()
  const { data, error } = await sistema11.rpc('portal_elegibilidade_por_pessoa', {
    p_pessoa_id: pessoaId,
  })

  if (error) {
    console.warn('[sistema11] falha ao buscar elegibilidade:', error.message)
    return []
  }

  return data ?? []
}

// Carimba no CRM que esta pessoa realmente entrou na área de membros --
// pedido do Pedro (09/11/2026): a ficha do Financeiro mostra não só "mandei
// o acesso" (acesso_membros_liberado_em) mas "ela realmente entrou"
// (acesso_membros_acessado_em). Chamar depois de todo login bem-sucedido
// (magic link ou e-mail+senha). Best effort: nunca deve derrubar o login.
export async function marcarAcessoNoCrm(email: string) {
  try {
    const sistema11 = createSistema11Client()
    await sistema11
      .from('alunos')
      .update({ acesso_membros_acessado_em: new Date().toISOString() })
      .ilike('email', email)
  } catch (e) {
    console.warn('[sistema11] falha ao marcar acesso no CRM:', e)
  }
}
