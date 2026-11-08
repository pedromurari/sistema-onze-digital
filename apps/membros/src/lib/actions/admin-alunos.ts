'use server'

import { revalidatePath } from 'next/cache'
import { criarAcessoMembro } from '@/lib/memberAccess'

export async function matricularAlunoManualmente(params: {
  email: string
  nome: string
  produtoId: string
}): Promise<{ loginUrl?: string; error?: string }> {
  const email = params.email.trim().toLowerCase()
  const nome = params.nome.trim()

  if (!email || !nome || !params.produtoId) {
    return { error: 'Preencha nome, email e produto.' }
  }

  try {
    const { loginUrl } = await criarAcessoMembro({
      email,
      nome,
      produtoId: params.produtoId,
    })
    revalidatePath('/admin/alunos')
    return { loginUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao matricular aluno.' }
  }
}
