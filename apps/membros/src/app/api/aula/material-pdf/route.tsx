import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

const PDF_PATH = path.join(process.cwd(), 'materiais-privados', 'ebook-desenvolvimento-da-personalidade.pdf')

// GET /api/aula/material-pdf
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!fs.existsSync(PDF_PATH)) {
    return NextResponse.json({ error: 'Material indisponível no momento.' }, { status: 404 })
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH)

  const { searchParams } = new URL(request.url)
  const forceDownload = searchParams.get('download') === '1'
  const disposition = forceDownload
    ? 'attachment; filename="ebook-desenvolvimento-da-personalidade-idm.pdf"'
    : 'inline; filename="ebook-desenvolvimento-da-personalidade-idm.pdf"'

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
