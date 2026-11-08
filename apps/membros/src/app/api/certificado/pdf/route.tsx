import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, Font } from '@react-pdf/renderer'
import { CertificadoPDF } from '@/lib/pdf/certificado'
import { getLiveDates } from '@/lib/pdf/get-live-dates'
import fs from 'fs'
import path from 'path'

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

// GET /api/certificado/pdf?nome=João&code=IDM-2026-XXXXX
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const nome = searchParams.get('nome')?.trim()
  const code = searchParams.get('code')?.trim()

  if (!nome) {
    return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })
  }

  let pdfBuffer: Buffer
  try {
    registerFonts()
    const { diasLive, mesLive, anoLive } = await getLiveDates()
    pdfBuffer = await renderToBuffer(
      <CertificadoPDF
        nome={nome}
        code={code ?? undefined}
        bgUrl={getCertBgDataUri()}
        diasLive={diasLive}
        mesLive={mesLive}
        anoLive={anoLive}
      />
    )
  } catch (e: unknown) {
    console.error('[pdf] generation error:', (e as Error).message)
    return NextResponse.json({ error: 'Erro ao gerar PDF.' }, { status: 500 })
  }

  const filename = `certificado-${nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.pdf`
  const forceDownload = searchParams.get('download') === '1'
  const disposition = forceDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
