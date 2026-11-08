import { NextRequest, NextResponse } from 'next/server'
import { createSistema11Client } from '@/lib/sistema11'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
    if (!slug) return NextResponse.json({ error: 'slug é obrigatório.' }, { status: 400 })

    const supabase = createSistema11Client()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: evento, error } = await (supabase.from('npa_eventos') as any)
      .select('nome, local, data_evento, professor_convidado')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      console.error('[npa-presencial/evento] erro:', error)
      return NextResponse.json({ error: 'Erro ao buscar evento.' }, { status: 500 })
    }
    if (!evento) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })

    return NextResponse.json(evento)
  } catch (e) {
    console.error('[npa-presencial/evento] erro inesperado:', e)
    return NextResponse.json({ error: 'Erro inesperado ao buscar evento.' }, { status: 500 })
  }
}
