import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────
// Concede acesso à área de membros pra quem entra fora do fluxo normal de
// login (ex: liberação de acesso via NPA, matrícula real feita pelo CRM --
// ver supabase/functions/npa-liberar-acesso-membros). Cria (ou reaproveita)
// a conta, matricula no produto, e gera um magic link nativo do Supabase
// (generateLink cria o usuário quando necessário e devolve um link de login
// oficial — mais robusto que rolar HMAC/senha temporária na mão).
// ─────────────────────────────────────────────────────────────────────────

export async function criarAcessoMembro(params: {
  email: string
  nome: string
  whatsapp?: string
  produtoId: string
  expiraEm?: Date
  turmaId?: string
  crmPessoaId?: string
}): Promise<{ userId: string; loginUrl: string }> {
  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.idmpsi.com.br'

  // generateLink (type magiclink) cria a conta sem o aluno nunca escolher
  // uma senha (fica com uma senha aleatória que ninguém sabe) -- então o
  // link estável "/login" (email+senha), mandado por WhatsApp, é um beco
  // sem saída pra quem nunca logou antes. Achado real 09/11/2026 (Pedro).
  // Corrige mandando quem nunca logou (last_sign_in_at null) passar por
  // /reset-password antes do /dashboard no primeiro clique -- dali em
  // diante /login funciona normal. Quem já logou alguma vez (já tem senha
  // que conhece) vai direto pro destino normal, sem fricção extra.
  const { data: precheck } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: { redirectTo: `${siteUrl}/api/auth/callback?next=/dashboard` },
  })
  const primeiroAcesso = !precheck?.user?.last_sign_in_at
  const next = primeiroAcesso ? '/reset-password' : '/dashboard'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: {
      data: { full_name: params.nome, whatsapp: params.whatsapp ?? '' },
      redirectTo: `${siteUrl}/api/auth/callback?next=${next}`,
    },
  })

  if (error || !data?.user) {
    throw error ?? new Error('Falha ao gerar acesso à área de membros.')
  }

  const userId = data.user.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('enrollments') as any)
    .upsert(
      {
        user_id: userId,
        product_id: params.produtoId,
        turma_id: params.turmaId ?? null,
        is_active: true,
        expires_at: params.expiraEm?.toISOString() ?? null,
      },
      { onConflict: 'user_id,product_id', ignoreDuplicates: false },
    )

  // crm_pessoa_id liga esta conta à pessoa real no CRM (Fase 1/3 do plano de
  // unificação) -- aluno provisionado via membros-provisionar-acesso sempre
  // manda isso; lead antigo (NPA) não manda, então não sobrescreve com null.
  if (params.crmPessoaId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('profiles') as any)
      .upsert(
        { id: userId, full_name: params.nome, crm_pessoa_id: params.crmPessoaId },
        { onConflict: 'id', ignoreDuplicates: false },
      )
  }

  return { userId, loginUrl: data.properties.action_link }
}
