import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Captura de lead da lista de espera do programa de Dependência Química com
// Psicanálise (Renata Weigert). Produto ainda não tem preço/checkout definido,
// então aqui só salvamos o lead em leads_dependencia e avisamos por e-mail/WhatsApp
// que a pessoa entrou na lista — sem redirecionar pra checkout, diferente do
// fluxo do Cicatrizes (/api/leads/cicatrizes).
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_BASE = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1'
const NOTIFY_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcWl5ZWtmbXd3bnZrbWtkbGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM5MTIsImV4cCI6MjA5MDEyOTkxMn0.HImguQINgMUvuetgIfDL3sr7KwhSWGoXvaNMKldxYmQ'

function normalizeNumero(raw: string) {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

function emailListaDeEspera(nome: string) {
  const primeiroNome = nome.trim().split(' ')[0]
  return {
    subject: `${primeiroNome}, você está na lista de espera!`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #1F2937; line-height: 1.65;">
        <p>Oi, ${primeiroNome}.</p>
        <p>Você acabou de entrar na lista de espera do programa de <strong>Dependência Química com Psicanálise</strong>, com a Renata Weigert.</p>
        <p>Eu sou a Renata. Trabalho há anos com dependência química — com quem usa e com quem ama alguém que usa. Esse programa ainda está sendo desenhado com o time do Instituto Despertamente, e quem está na lista de espera é avisado em primeira mão assim que ele abrir, com uma condição especial de lançamento.</p>
        <p>Enquanto isso, eu publico conteúdo novo toda semana no Instagram e no YouTube, respondendo dúvidas reais sobre esse tema.</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="https://www.idmpsi.com.br/dependencia" style="background: #FFB800; color: #0D1638; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold;">Ver a página do programa</a>
        </p>
        <p>Te vejo por aí,<br>Renata</p>
      </div>
    `,
  }
}

function mensagemWhatsapp(nome: string) {
  const primeiroNome = nome.trim().split(' ')[0]
  return `Oi, ${primeiroNome}! Aqui é a Renata 💛\n\nVocê acabou de entrar na lista de espera do meu programa de Dependência Química com Psicanálise. Assim que abrir, te aviso por aqui em primeira mão, com condição especial de lançamento.\n\nEnquanto isso, qualquer dúvida, me chama por aqui.`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const whatsapp = String(body?.whatsapp ?? '').trim()
    const utm_source = body?.utm_source ? String(body.utm_source).trim() || null : null
    const utm_medium = body?.utm_medium ? String(body.utm_medium).trim() || null : null
    const utm_campaign = body?.utm_campaign ? String(body.utm_campaign).trim() || null : null
    const utm_content = body?.utm_content ? String(body.utm_content).trim() || null : null

    if (!nome || !email || whatsapp.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
    }

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (admin.from('leads_dependencia') as any)
      .insert({ nome, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content })
      .select('id')
      .single()

    if (error) {
      console.error('[leads/dependencia] erro ao salvar lead:', error)
      return NextResponse.json({ error: 'Erro ao salvar. Tente novamente.' }, { status: 500 })
    }

    const notifyHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${NOTIFY_ANON_KEY}`, apikey: NOTIFY_ANON_KEY }
    const carta = emailListaDeEspera(nome)

    const [emailRes, wppRes] = await Promise.allSettled([
      fetch(`${NOTIFY_BASE}/email-enviar`, {
        method: 'POST', headers: notifyHeaders,
        body: JSON.stringify({ to: email, to_name: nome, subject: carta.subject, html: carta.html }),
      }),
      fetch(`${NOTIFY_BASE}/wpp-enviar`, {
        method: 'POST', headers: notifyHeaders,
        body: JSON.stringify({ numero: normalizeNumero(whatsapp), mensagem: mensagemWhatsapp(nome) }),
      }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('leads_dependencia') as any)
      .update({
        email_enviado: emailRes.status === 'fulfilled' && emailRes.value.ok,
        wpp_enviado: wppRes.status === 'fulfilled' && wppRes.value.ok,
      })
      .eq('id', lead.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[leads/dependencia] erro:', err)
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
