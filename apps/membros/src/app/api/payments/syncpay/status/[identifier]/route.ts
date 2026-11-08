import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Consulta o status de um pedido pelo identifier do SyncPay — usado pelo
// frontend pra fazer polling enquanto o comprador paga o Pix.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('pedidos_syncpay')
    .select('status')
    .eq('syncpay_identifier', identifier)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ status: data.status })
}
