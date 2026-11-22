import { NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'

/**
 * Lead da página da Formação em Psicanálise (site institucional).
 *
 * Mesmo destino dos leads da `formacao.idmpsi.com.br`: funil do Time
 * Comercial, canal Direto, com o rodízio de vendedor que o banco já faz no
 * insert de `leads`. A diferença é a campanha — aqui é "Site Institucional",
 * pra vendedora saber de cara que a pessoa veio do site e não de anúncio.
 *
 * Por que insert direto e não a edge function `webhook-leads-time-comercial`:
 * a function existe pra quem está FORA da nossa infra (n8n, Zapier, landing
 * page avulsa) e por isso exige X-API-Key. Este app já tem a service role do
 * CRM configurada (`SISTEMA11_*`), então chamar a function daqui só adicionaria
 * um salto de rede e mais um segredo pra sincronizar. O formato da linha é
 * exatamente o que a function monta -- se um dia ela mudar, mudar aqui também.
 *
 * Fica em route handler (servidor) porque a service role NUNCA pode ir pro
 * navegador. O cliente só manda nome e WhatsApp.
 */

const CAMPANHA = 'Site Institucional — Formação em Psicanálise'
const CANAL = 'Direto'
const CURSO = 'Formação em Psicanálise Clínica Integrativa'

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  // Honeypot: campo invisível no formulário. Bot preenche, humano não.
  // Responde 200 de propósito -- erro ensina o bot a tentar de outro jeito.
  if (body.website) return NextResponse.json({ success: true })

  const nome = texto(body.nome, 100)
  const whatsapp = soDigitos(body.whatsapp)

  if (nome.length < 2 || whatsapp.length < 10 || whatsapp.length > 11) {
    return NextResponse.json(
      { error: 'Informe seu nome e um WhatsApp válido com DDD.' },
      { status: 400 },
    )
  }

  try {
    const sistema11 = createSistema11Client()

    const { data: campanha } = await sistema11
      .from('time_comercial_campanhas')
      .select('id')
      .eq('canal', CANAL)
      .eq('nome', CAMPANHA)
      .maybeSingle()

    const observacoes = [
      `Origem: ${CAMPANHA}`,
      texto(body.referrer, 500) && `Referência: ${texto(body.referrer, 500)}`,
      texto(body.utm_source, 100) && `UTM Source: ${texto(body.utm_source, 100)}`,
      texto(body.utm_medium, 100) && `UTM Medium: ${texto(body.utm_medium, 100)}`,
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
        origem: 'Time Comercial',
        // 'novo' é a primeira coluna dos canais que não são SDD.
        status: 'novo',
        canal: CANAL,
        // `produto` é categórico no banco; o curso de verdade vai em
        // `interesse_produto`.
        produto: 'time_comercial',
        interesse_produto: CURSO,
        campanha_id: campanha?.id ?? null,
        observacoes: observacoes || null,
        criado_em: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[lead-psicanalise] falha ao gravar lead:', error.message)
      return NextResponse.json(
        { error: 'Não foi possível registrar seus dados agora.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, leadId: lead.id })
  } catch (erro) {
    console.error('[lead-psicanalise] erro inesperado:', erro)
    return NextResponse.json(
      { error: 'Não foi possível registrar seus dados agora.' },
      { status: 502 },
    )
  }
}
