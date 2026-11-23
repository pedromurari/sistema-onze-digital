import { NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'

/**
 * Lista de espera das turmas fechadas (NPA, PNL, Psicanálise presencial...).
 *
 * Quem entra aqui vira lead no CRM com canal "Lista de espera — <produto>".
 * Esse canal é o que a tela de Disparos em Massa usa pra filtrar
 * (fonte `leads_produto` + canal), então quando a turma abrir o marketing
 * dispara só pra essa lista. Ficar num canal próprio também tira essas
 * pessoas do Kanban das vendedoras: ninguém deve ligar pra vender turma que
 * ainda não abriu.
 *
 * O produto vem do cliente só como slug; nome e canal saem da tabela abaixo,
 * no servidor -- assim ninguém cria canal arbitrário no CRM mandando texto.
 */

const PRODUTOS: Record<string, string> = {
  'mentoria-npa': 'Mentoria NPA',
  'practitioner-pnl': 'Practitioner em PNL',
  'idm-pelo-brasil-psicanalise': 'IDM pelo Brasil — Psicanálise presencial',
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  // Honeypot: bot preenche, humano não. 200 de propósito.
  if (body.website) return NextResponse.json({ success: true })

  const nome = texto(body.nome, 100)
  const whatsapp = soDigitos(body.whatsapp)
  const eventoSlug = texto(body.evento, 60)

  if (nome.length < 2 || whatsapp.length < 10 || whatsapp.length > 11) {
    return NextResponse.json(
      { error: 'Informe seu nome e um WhatsApp válido com DDD.' },
      { status: 400 },
    )
  }

  try {
    const sistema11 = createSistema11Client()

    // Dois tipos de cadastro passam por aqui:
    // - `produto`: lista de espera de turma fechada (canal "Lista de espera — X");
    // - `evento`: interesse num encontro do IDM pelo Brasil que já tem data.
    //   O evento é conferido no banco (tem que existir e ser futuro) e o lead
    //   entra no produto `npa`, que é onde o time do presencial trabalha.
    let produto: string
    let canal: string
    let produtoCategoria = 'time_comercial'

    if (eventoSlug) {
      const hoje = new Date().toISOString().slice(0, 10)
      const { data: evento } = await sistema11
        .from('npa_eventos')
        .select('nome')
        .eq('slug', eventoSlug)
        .gte('data_evento', hoje)
        .maybeSingle()
      if (!evento) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 })
      produto = evento.nome
      canal = `Interesse — ${evento.nome}`
      produtoCategoria = 'npa'
    } else {
      const nomeProduto = PRODUTOS[texto(body.produto, 60)]
      if (!nomeProduto) return NextResponse.json({ error: 'Produto inválido.' }, { status: 400 })
      produto = nomeProduto
      canal = `Lista de espera — ${nomeProduto}`
    }

    // Mesma pessoa entrando duas vezes na mesma lista não vira dois leads.
    const { data: existente } = await sistema11
      .from('leads')
      .select('id')
      .eq('canal', canal)
      .eq('whatsapp', whatsapp)
      .maybeSingle()
    if (existente) return NextResponse.json({ success: true, leadId: existente.id })

    const observacoes = [
      `Origem: site institucional — ${eventoSlug ? 'IDM pelo Brasil' : 'lista de espera'}`,
      texto(body.referrer, 500) && `Referência: ${texto(body.referrer, 500)}`,
      texto(body.utm_source, 100) && `UTM Source: ${texto(body.utm_source, 100)}`,
      texto(body.utm_campaign, 150) && `UTM Campaign: ${texto(body.utm_campaign, 150)}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { data: lead, error } = await sistema11
      .from('leads')
      .insert({
        nome,
        telefone: whatsapp,
        whatsapp,
        origem: 'Site Institucional',
        status: 'novo',
        canal,
        // `produto` é categórico no banco (check constraint); o curso de
        // verdade vai em `interesse_produto` e no canal.
        produto: produtoCategoria,
        interesse_produto: produto,
        observacoes,
        criado_em: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[lista-espera] falha ao gravar lead:', error.message)
      return NextResponse.json({ error: 'Não foi possível registrar agora.' }, { status: 502 })
    }

    return NextResponse.json({ success: true, leadId: lead.id })
  } catch (erro) {
    console.error('[lista-espera] erro inesperado:', erro)
    return NextResponse.json({ error: 'Não foi possível registrar agora.' }, { status: 502 })
  }
}
