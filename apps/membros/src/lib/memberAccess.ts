import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────
// Concede acesso à área de membros pra quem compra fora do fluxo normal de
// checkout logado (ex: checkout público via SyncPay). Cria (ou reaproveita)
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
}): Promise<{ userId: string; loginUrl: string }> {
  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.idmpsi.com.br'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: {
      data: { full_name: params.nome, whatsapp: params.whatsapp ?? '' },
      redirectTo: `${siteUrl}/api/auth/callback?next=/dashboard`,
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
        is_active: true,
        expires_at: params.expiraEm?.toISOString() ?? null,
      },
      { onConflict: 'user_id,product_id', ignoreDuplicates: false },
    )

  return { userId, loginUrl: data.properties.action_link }
}
