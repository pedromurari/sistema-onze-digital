import { NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'

/**
 * Briefing do blog: leitura e gravação da página pública /briefing-blog.
 *
 * É pública de propósito (pedido do Pedro 21/11/2026): o Rodrygo recebe o
 * link no WhatsApp e preenche na hora, sem login e sem conta em lugar
 * nenhum. Por isso a página NUNCA fala direto com o banco -- quem escreve é
 * esta rota, server-side, com o client do CRM.
 *
 * O `token` da querystring separa um preenchimento do outro e é o que
 * permite fechar a aba e voltar depois. Não é segredo: o conteúdo aqui é
 * briefing editorial, não dado pessoal de ninguém.
 */

const TOKEN_OK = /^[a-zA-Z0-9_-]{3,64}$/

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN_OK.test(token)) {
    return NextResponse.json({ error: 'token inválido' }, { status: 400 })
  }

  try {
    const sb = createSistema11Client()
    const { data, error } = await sb
      .from('briefing_blog')
      .select('nome, respostas, concluido_em, atualizado_em')
      .eq('token', token)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({
      nome: data?.nome ?? null,
      respostas: data?.respostas ?? {},
      concluidoEm: data?.concluido_em ?? null,
      atualizadoEm: data?.atualizado_em ?? null,
    })
  } catch {
    // Sem config no ambiente: a página continua utilizável, só não retoma
    // o que já foi escrito.
    return NextResponse.json({ nome: null, respostas: {}, indisponivel: true })
  }
}

export async function POST(req: Request) {
  let corpo: { token?: string; nome?: string; respostas?: unknown; concluir?: boolean }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 })
  }

  const token = String(corpo.token ?? '')
  if (!TOKEN_OK.test(token)) {
    return NextResponse.json({ error: 'token inválido' }, { status: 400 })
  }

  const respostas =
    corpo.respostas && typeof corpo.respostas === 'object' && !Array.isArray(corpo.respostas)
      ? (corpo.respostas as Record<string, unknown>)
      : {}

  // Teto de tamanho: campo de texto livre sem limite é convite pra alguém
  // colar um livro aqui.
  if (JSON.stringify(respostas).length > 200_000) {
    return NextResponse.json({ error: 'respostas grandes demais' }, { status: 413 })
  }

  try {
    const sb = createSistema11Client()
    const { error } = await sb.from('briefing_blog').upsert(
      {
        token,
        nome: corpo.nome ? String(corpo.nome).slice(0, 120) : null,
        respostas,
        atualizado_em: new Date().toISOString(),
        ...(corpo.concluir ? { concluido_em: new Date().toISOString() } : {}),
      },
      { onConflict: 'token' },
    )
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('briefing-blog: falha ao salvar', e)
    return NextResponse.json({ error: 'não foi possível salvar' }, { status: 500 })
  }
}
