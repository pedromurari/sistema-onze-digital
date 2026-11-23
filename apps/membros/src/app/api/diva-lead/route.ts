import { NextResponse } from 'next/server'

/**
 * Lead do Divã IDM vindo do site institucional.
 *
 * Só repassa pra edge function `diva-registrar` do CRM, que já faz tudo:
 * cria o lead no funil (produto `diva_idm`, com o terapeuta escolhido em
 * `interesse_produto`), evita duplicado por WhatsApp e manda a mensagem de
 * boas-vindas. Duplicar essa lógica aqui faria os dois caminhos divergirem.
 *
 * Fica num route handler em vez de o navegador chamar a function direto
 * porque assim o endereço do CRM não precisa ir pro cliente.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const base = process.env.SISTEMA11_SUPABASE_URL
  if (!base) {
    console.error('[diva-lead] SISTEMA11_SUPABASE_URL não configurada')
    return NextResponse.json({ ok: false, erro: 'Não foi possível registrar agora.' }, { status: 502 })
  }

  try {
    const resposta = await fetch(`${base}/functions/v1/diva-registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: body.nome,
        whatsapp: body.whatsapp,
        terapeuta_id: body.terapeuta_id,
        website: body.website,
      }),
    })
    const dados = await resposta.json().catch(() => ({}))
    return NextResponse.json(dados, { status: resposta.status })
  } catch (erro) {
    console.error('[diva-lead] falha ao chamar diva-registrar:', erro)
    return NextResponse.json({ ok: false, erro: 'Não foi possível registrar agora.' }, { status: 502 })
  }
}
