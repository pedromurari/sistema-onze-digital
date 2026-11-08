import { NextRequest, NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'
import { EBOOK_URL_PADRAO } from '@/lib/npaPresencial'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
    const leadId = typeof body?.lead_id === 'string' ? body.lead_id.trim() : ''

    if (!slug || !leadId) {
      return NextResponse.json({ error: 'slug e lead_id são obrigatórios.' }, { status: 400 })
    }

    const supabase = createSistema11Client()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: evento, error: eventoError } = await (supabase.from('npa_eventos') as any)
      .select('id, ebook_url, telas_liberado, telas_url')
      .eq('slug', slug)
      .maybeSingle()

    if (eventoError) {
      console.error('[npa-presencial/refresh] erro buscando evento:', eventoError)
      return NextResponse.json({ error: 'Erro ao buscar evento.' }, { status: 500 })
    }
    if (!evento) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (supabase.from('npa_evento_leads') as any)
      .select('id')
      .eq('id', leadId)
      .eq('npa_evento_id', evento.id)
      .maybeSingle()

    if (leadError) {
      console.error('[npa-presencial/refresh] erro buscando lead:', leadError)
      return NextResponse.json({ error: 'Erro ao verificar seu cadastro.' }, { status: 500 })
    }
    if (!lead) {
      return NextResponse.json({ error: 'Cadastro não encontrado para este evento.' }, { status: 404 })
    }

    return NextResponse.json({
      ebook_url: evento.ebook_url || EBOOK_URL_PADRAO,
      telas_liberado: !!evento.telas_liberado,
      telas_url: evento.telas_liberado ? evento.telas_url : null,
    })
  } catch (e) {
    console.error('[npa-presencial/refresh] erro inesperado:', e)
    return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 })
  }
}
