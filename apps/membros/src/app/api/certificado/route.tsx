import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, Font } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarCertificadoNoCrm } from '@/lib/certificadoCrmSync'
import { CertificadoPDF } from '@/lib/pdf/certificado'
import { getLiveDates } from '@/lib/pdf/get-live-dates'
import fs from 'fs'
import path from 'path'

// No Windows, path.join retorna barras invertidas (C:\...) que url.parse() dentro do
// @react-pdf/renderer interpreta "C:" como protocolo de URL — o handler local é
// bypassado e fetch('C:\\...') lança "Failed to parse URL".
// Solução: ler os arquivos como Buffer e entregar como data URI base64,
// eliminando qualquer resolução de caminho pela biblioteca.

function getCertBgDataUri(): string | undefined {
  const filePath = path.join(process.cwd(), 'public', 'CERTIFICADO_NPA_SP_-_.png')
  if (!fs.existsSync(filePath)) return undefined
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`
  } catch {
    return undefined
  }
}

function registerFonts() {
  try {
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Allura-Regular.ttf')
    if (fs.existsSync(fontPath)) {
      Font.register({ family: 'Allura', src: fontPath })
    }
  } catch { /* fonte opcional — não bloqueia geração */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function sanitize(s: string, max = 200) {
  return s.trim().replace(/[<>"']/g, '').substring(0, max)
}

function getIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

const MAX_TENTATIVAS = 3

// ─── POST /api/certificado ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getIp(request)

  // 1. Parse body
  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const { nome, telefone, email, cidade, palavra1, palavra2, palavra3 } = body

  // 2. Validar campos obrigatórios
  if (!nome?.trim() || !telefone?.trim() || !email?.trim() || !cidade?.trim() || !palavra1?.trim() || !palavra2?.trim() || !palavra3?.trim()) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  // 3. Validar formato de e-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }

  // 4. Normalizar dados sensíveis
  const emailNorm = email.trim().toLowerCase()
  const telefoneNorm = telefone.replace(/\D/g, '').substring(0, 20)

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e: unknown) {
    console.error('[certificado] Admin client error:', (e as Error).message)
    return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 })
  }

  // 5. Rate limiting: máximo 10 requisições por IP por hora (folga para as 3 tentativas por e-mail)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: ipCount } = await (supabase.from('tentativas_certificado') as any)
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('data_tentativa', oneHourAgo)

  if ((ipCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Limite de tentativas atingido para este endereço. Tente novamente em uma hora.' },
      { status: 429 }
    )
  }

  // 6. Verificar quantas tentativas esse e-mail já usou
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: emailCount } = await (supabase.from('tentativas_certificado') as any)
    .select('*', { count: 'exact', head: true })
    .eq('email', emailNorm)

  if ((emailCount ?? 0) >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: `Você já utilizou suas ${MAX_TENTATIVAS} tentativas para este e-mail.\nNão é possível tentar novamente.`, tentativasRestantes: 0 },
      { status: 403 }
    )
  }

  // 7. Verificar quantas tentativas esse telefone já usou
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: phoneCount } = await (supabase.from('tentativas_certificado') as any)
    .select('*', { count: 'exact', head: true })
    .eq('telefone', telefoneNorm)

  if ((phoneCount ?? 0) >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: `Você já utilizou suas ${MAX_TENTATIVAS} tentativas com este telefone.\nNão é possível tentar novamente.`, tentativasRestantes: 0 },
      { status: 403 }
    )
  }

  // 8. Validar palavras-chave (somente no backend, nunca logadas)
  const p1 = normalize(palavra1)
  const p2 = normalize(palavra2)
  const p3 = normalize(palavra3)

  const k1 = normalize(process.env.CERT_PALAVRA_1 ?? '')
  const k2 = normalize(process.env.CERT_PALAVRA_2 ?? '')
  const k3 = normalize(process.env.CERT_PALAVRA_3 ?? '')

  if (!k1 || !k2 || !k3) {
    console.error('[certificado] Palavras-chave não configuradas no ambiente.')
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 })
  }

  const acertou = p1 === k1 && p2 === k2 && p3 === k3

  // 9. Registrar tentativa no banco (sanitizado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('tentativas_certificado') as any).insert({
    nome:     sanitize(nome),
    telefone: telefoneNorm,
    email:    emailNorm,
    cidade:   sanitize(cidade, 100),
    ip,
    acertou,
  })

  // 10. Se errou → informar quantas tentativas ainda restam (ou bloquear se esgotou)
  if (!acertou) {
    const tentativasUsadas = (emailCount ?? 0) + 1
    const tentativasRestantes = Math.max(0, MAX_TENTATIVAS - tentativasUsadas)

    if (tentativasRestantes === 0) {
      return NextResponse.json(
        { error: `Infelizmente você não acertou as palavras-chave da aula.\nVocê esgotou suas ${MAX_TENTATIVAS} tentativas.`, tentativasRestantes: 0 },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        error: `Infelizmente você não acertou as palavras-chave da aula.\nVocê tem mais ${tentativasRestantes} tentativa${tentativasRestantes > 1 ? 's' : ''}.`,
        tentativasRestantes,
      },
      { status: 400 }
    )
  }

  // 10.5. Sincroniza com o Kanban do lançamento ativo no Sistema Onze Digital
  // (best-effort — nunca pode impedir o aluno de receber o certificado)
  try {
    await sincronizarCertificadoNoCrm({ nome, email: emailNorm, telefone: telefoneNorm })
  } catch (e: unknown) {
    console.error('[certificado] erro ao sincronizar com o CRM:', (e as Error).message)
  }

  // 11. Gerar PDF — JSX em .tsx resolve o erro de tipo do renderToBuffer
  const nomeFormatado = sanitize(nome, 100)
  let pdfBuffer: Buffer

  try {
    registerFonts()
    const { diasLive, mesLive, anoLive } = await getLiveDates()
    pdfBuffer = await renderToBuffer(
      <CertificadoPDF
        nome={nomeFormatado}
        bgUrl={getCertBgDataUri()}
        diasLive={diasLive}
        mesLive={mesLive}
        anoLive={anoLive}
      />
    )
  } catch (e: unknown) {
    console.error('[certificado] PDF generation error:', (e as Error).message)
    return NextResponse.json({ error: 'Erro ao gerar o certificado. Tente novamente.' }, { status: 500 })
  }

  // 12. Retornar PDF para download
  const filename = `certificado-${nomeFormatado.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.pdf`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
