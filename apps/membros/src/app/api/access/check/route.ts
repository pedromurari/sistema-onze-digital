import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint chamado pelas ferramentas externas de mapa (Mapa 7 Esferas,
// Perfil Numerológico) pra saber se um e-mail pode gerar um mapa agora.
// NPA: liberado enquanto a matrícula em `mentoria-npa` estiver ativa (sem limite).
// NPS: liberado enquanto `mentoria-nps` estiver ativa E a cota mensal de 5
// mapas (contada em mapa_7_esferas_maps) não tiver sido atingida.
// Toda a regra vive em public.check_member_access() (Supabase, projeto IDM Members).
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://mapa.seunumerologo.com.br',
  'https://perfil-numerologico.vercel.app',
  'http://localhost:3000',
]

const ALLOWED_PRODUCTS = ['mentoria-npa', 'mentoria-nps']

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'))

  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const product = String(body?.product ?? '').trim()

    if (!email || !ALLOWED_PRODUCTS.includes(product)) {
      return NextResponse.json({ has_access: false, reason: 'invalid_request' }, { status: 400, headers })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc('check_member_access', {
      p_email: email,
      p_product_slug: product,
    })

    if (error) {
      console.error('[access/check] erro na RPC:', error)
      return NextResponse.json({ has_access: false, reason: 'internal_error' }, { status: 500, headers })
    }

    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json(result, { headers })
  } catch (err) {
    console.error('[access/check] erro:', err)
    return NextResponse.json({ has_access: false, reason: 'internal_error' }, { status: 500, headers })
  }
}
