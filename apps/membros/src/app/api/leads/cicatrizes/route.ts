import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Captura de lead do Cicatrizes que Curam (antes da compra). Salva em
// leads_cicatrizes, dispara e-mail estilo carta de vendas e mensagem de
// WhatsApp (texto por enquanto — vira nota de voz assim que a Jocimara
// gravar o áudio; roteiro já está no Kanban de Entregas dela).
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_BASE = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1'
const NOTIFY_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcWl5ZWtmbXd3bnZrbWtkbGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM5MTIsImV4cCI6MjA5MDEyOTkxMn0.HImguQINgMUvuetgIfDL3sr7KwhSWGoXvaNMKldxYmQ'

function normalizeNumero(raw: string) {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

function emailCartaDeVendas(nome: string) {
  const primeiroNome = nome.trim().split(' ')[0]
  return {
    subject: `${primeiroNome}, seu convite pro Cicatrizes que Curam`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #1F2937; line-height: 1.65;">
        <p>Oi, ${primeiroNome}.</p>
        <p>Você já sentiu que carrega uma dor que nunca teve espaço pra colocar pra fora? Que fica ali, guardada, aparecendo do jeito errado — num comentário mais seco, numa noite mal dormida, numa reação que nem você entende de onde veio?</p>
        <p>Se já sentiu isso, eu quero te contar sobre o <strong>Cicatrizes que Curam</strong>.</p>
        <p>Eu sou Jocimara Anjos. Sou terapeuta, trabalho com Psicanálise Integrativa, e coordeno pedagogicamente a Formação em Psicanálise do Instituto DespertaMENTE. Depois de anos ouvindo gente na clínica e formando gente na sala de aula, percebi a mesma coisa se repetindo: quase todo mundo carrega marcas que nunca teve um espaço de verdade pra elaborar.</p>
        <p>Por isso criei esse workshop: <strong>3 horas de um encontro vivencial</strong>, em grupo pequeno de propósito, pra você elaborar o que ainda pesa e sair com clareza — não com mais teoria.</p>
        <p>O investimento é <strong>R$47,90</strong> — valor de referência R$250.</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="https://www.idmpsi.com.br/cicatrizes" style="background: #FFB800; color: #0D1638; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold;">Quero garantir minha vaga</a>
        </p>
        <p>As vagas são limitadas de propósito — turma pequena é o que garante a profundidade do encontro.</p>
        <p>Te vejo lá,<br>Jocimara</p>
      </div>
    `,
  }
}

function mensagemWhatsapp(nome: string) {
  const primeiroNome = nome.trim().split(' ')[0]
  return `Oi, ${primeiroNome}! Aqui é a Jocimara 💛\n\nQueria te contar rapidinho sobre o Cicatrizes que Curam — um workshop de 3 horas que eu criei pra quem carrega marcas que nunca teve espaço pra elaborar. É vivencial, turma pequena de propósito, por R$47,90.\n\nSe ainda não garantiu sua vaga, me manda um "oi" aqui que eu te ajudo a finalizar. E se já garantiu, também me manda um "oi" — quero confirmar sua presença pessoalmente!`
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
    const { data: lead, error } = await (admin.from('leads_cicatrizes') as any)
      .insert({ nome, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content })
      .select('id')
      .single()

    if (error) {
      console.error('[leads/cicatrizes] erro ao salvar lead:', error)
      return NextResponse.json({ error: 'Erro ao salvar. Tente novamente.' }, { status: 500 })
    }

    const notifyHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${NOTIFY_ANON_KEY}`, apikey: NOTIFY_ANON_KEY }
    const carta = emailCartaDeVendas(nome)

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
    await (admin.from('leads_cicatrizes') as any)
      .update({
        email_enviado: emailRes.status === 'fulfilled' && emailRes.value.ok,
        wpp_enviado: wppRes.status === 'fulfilled' && wppRes.value.ok,
      })
      .eq('id', lead.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[leads/cicatrizes] erro:', err)
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
