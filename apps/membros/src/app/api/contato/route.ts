import { NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'

/**
 * Formulário de contato do site institucional.
 *
 * O assunto decide pra onde a pessoa vai -- e a lista de assuntos é fechada
 * aqui no servidor (ASSUNTOS), não aceita texto livre do cliente:
 * - Interesse em produto: vira lead no CRM, canal "Contato do site".
 * - Quero fazer terapia: vai pro funil do Divã (diva-registrar), que já tem
 *   boas-vindas e dedup próprios.
 * - Assunto de quem já é aluno (suporte, financeiro, certificado): NÃO vira
 *   lead, senão aluno pago aparece como oportunidade de venda no Kanban.
 *   A pessoa segue direto pro WhatsApp.
 */

type Destino = 'lead' | 'diva' | 'aluno'

const ASSUNTOS: Record<string, Destino> = {
  'Formação em Psicanálise Clínica Integrativa': 'lead',
  'Despertar Sistêmico — Constelação Familiar': 'lead',
  'Practitioner em PNL': 'lead',
  'Mentoria NPS — Numerologia Pitagórica': 'lead',
  'Mentoria NPA — Numerologia Aplicada': 'lead',
  'IDM pelo Brasil — encontro presencial': 'lead',
  'Quero fazer terapia': 'diva',
  'Sou psicanalista e quero atender no Divã': 'lead',
  'Suporte da minha turma ou do acesso': 'aluno',
  'Financeiro — boleto, pagamento ou nota fiscal': 'aluno',
  'Certificado': 'aluno',
  'Quero levar o IDM pra minha cidade': 'lead',
  'Imprensa, parceria ou convite': 'lead',
  'Outro assunto': 'lead',
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

  if (body.website) return NextResponse.json({ success: true })

  const nome = texto(body.nome, 100)
  const whatsapp = soDigitos(body.whatsapp)
  const email = texto(body.email, 200).toLowerCase()
  const assunto = texto(body.assunto, 120)
  const mensagem = texto(body.mensagem, 1500)
  const destino = ASSUNTOS[assunto]

  if (!destino) return NextResponse.json({ error: 'Escolha um assunto.' }, { status: 400 })
  if (nome.length < 2 || whatsapp.length < 10 || whatsapp.length > 11) {
    return NextResponse.json({ error: 'Informe seu nome e um WhatsApp válido com DDD.' }, { status: 400 })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Confira o e-mail.' }, { status: 400 })
  }

  if (destino === 'aluno') return NextResponse.json({ success: true })

  try {
    if (destino === 'diva') {
      const base = process.env.SISTEMA11_SUPABASE_URL
      if (!base) throw new Error('SISTEMA11_SUPABASE_URL ausente')
      const r = await fetch(`${base}/functions/v1/diva-registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email: email || undefined, mensagem: mensagem || undefined }),
      })
      if (!r.ok) throw new Error(`diva-registrar ${r.status}`)
      return NextResponse.json({ success: true })
    }

    const sistema11 = createSistema11Client()
    const { error } = await sistema11.from('leads').insert({
      nome,
      telefone: whatsapp,
      whatsapp,
      email: email || null,
      origem: 'Site Institucional',
      status: 'novo',
      canal: 'Contato do site',
      produto: 'time_comercial',
      interesse_produto: assunto,
      observacoes: mensagem ? `Mensagem: ${mensagem}` : null,
      criado_em: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (erro) {
    console.error('[contato] falha ao registrar:', erro)
    return NextResponse.json({ error: 'Não foi possível enviar agora.' }, { status: 502 })
  }
}
