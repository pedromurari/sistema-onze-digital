import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { criarAcessoMembro } from '@/lib/memberAccess'

// ─────────────────────────────────────────────────────────────────────────────
// Recebe os webhooks do SyncPay (cashin.create / cashin.update) e atualiza o
// status do pedido em `pedidos_syncpay`. Todos os webhooks do SyncPay têm
// timeout de 5 segundos — este handler responde rápido; a liberação de
// acesso + notificações rodam em background (não bloqueiam a resposta).
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
  refunded: 'refunded',
  med: 'med',
}

// Produtos que dão acesso à área de membros (id em `products`) quando aprovados.
const PRODUTO_ID_MEMBROS: Record<string, string> = {
  'cicatrizes-que-curam': 'b6fe9e61-0a92-40c2-ad0b-5ebbc3d17b5c',
  // Mentoria NPS (R$100/mês): cada pagamento aprovado renova a matrícula por
  // +30 dias. Só entra em ação quando o produto 'mentoria-nps' existir de
  // fato no SyncPay com esse mesmo slug — até lá, fica inerte.
  'mentoria-nps': 'b018279e-62de-447c-b834-97d15e6351a0',
}

// Produtos com renovação mensal (em vez de acesso vitalício/até o fim da turma).
const PRODUTOS_MENSAIS = new Set(['mentoria-nps'])

// E-mail/WhatsApp já configurados e funcionando no outro sistema do grupo
// (onze-digital-main) — reaproveitados aqui em vez de duplicar integração.
const NOTIFY_BASE = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1'
const NOTIFY_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcWl5ZWtmbXd3bnZrbWtkbGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM5MTIsImV4cCI6MjA5MDEyOTkxMn0.HImguQINgMUvuetgIfDL3sr7KwhSWGoXvaNMKldxYmQ'

function normalizeNumero(raw: string) {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

async function liberarAcessoEnotificar(pedido: {
  produto_slug: string
  produto_nome: string
  comprador_nome: string
  comprador_email: string
  comprador_telefone: string
}) {
  const produtoId = PRODUTO_ID_MEMBROS[pedido.produto_slug]
  let loginUrl = ''

  if (produtoId) {
    const expiraEm = PRODUTOS_MENSAIS.has(pedido.produto_slug)
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : undefined

    const acesso = await criarAcessoMembro({
      email: pedido.comprador_email,
      nome: pedido.comprador_nome,
      whatsapp: pedido.comprador_telefone,
      produtoId,
      expiraEm,
    })
    loginUrl = acesso.loginUrl
  }

  const notifyHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${NOTIFY_ANON_KEY}`, apikey: NOTIFY_ANON_KEY }

  const acessoHtml = loginUrl
    ? `<p>Seu acesso à área de membros já está liberado — é lá que você encontra os conteúdos complementares e, assim que sua turma acontecer, a gravação completa do workshop.</p><p><a href="${loginUrl}">Acessar minha área de membros</a></p>`
    : ''
  const acessoTexto = loginUrl
    ? `\n\nSeu acesso à área de membros já está liberado — é lá que você encontra os conteúdos complementares e, assim que sua turma acontecer, a gravação completa do workshop:\n${loginUrl}`
    : ''

  await fetch(`${NOTIFY_BASE}/email-enviar`, {
    method: 'POST', headers: notifyHeaders,
    body: JSON.stringify({
      to: pedido.comprador_email,
      to_name: pedido.comprador_nome,
      subject: `Pagamento confirmado: ${pedido.produto_nome}`,
      html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${pedido.comprador_nome}!</p><p>Confirmamos sua vaga em <strong>${pedido.produto_nome}</strong>.</p>${acessoHtml}<p>Qualquer dúvida, é só responder este e-mail.</p>`,
    }),
  }).catch(e => console.error('[syncpay/webhook] falha ao enviar email', e))

  if (pedido.comprador_telefone) {
    await fetch(`${NOTIFY_BASE}/wpp-enviar`, {
      method: 'POST', headers: notifyHeaders,
      body: JSON.stringify({
        numero: normalizeNumero(pedido.comprador_telefone),
        mensagem: `🎉 Pagamento confirmado, ${pedido.comprador_nome}!\n\nSua vaga em *${pedido.produto_nome}* está garantida.${acessoTexto}`,
      }),
    }).catch(e => console.error('[syncpay/webhook] falha ao enviar whatsapp', e))
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const data = body?.data
    if (!data?.id || !data?.status) {
      return NextResponse.json({ ok: true })
    }

    const status = STATUS_MAP[data.status] ?? 'pending'
    const admin = createAdminClient()

    const { data: pedido } = await admin
      .from('pedidos_syncpay')
      .select('id, produto_slug, produto_nome, comprador_nome, comprador_email, comprador_telefone, status, acesso_liberado')
      .eq('syncpay_identifier', data.id)
      .maybeSingle()

    if (!pedido) return NextResponse.json({ ok: true })

    if (status !== pedido.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('pedidos_syncpay') as any).update({ status }).eq('id', pedido.id)
    }

    if (status === 'completed' && !pedido.acesso_liberado) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('pedidos_syncpay') as any).update({ acesso_liberado: true }).eq('id', pedido.id)
      await liberarAcessoEnotificar(pedido).catch(e => console.error('[syncpay/webhook] falha na liberação/notificação', e))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[syncpay/webhook] erro:', err)
    // Sempre responde 200 pro SyncPay não ficar re-tentando por erro nosso.
    return NextResponse.json({ ok: false })
  }
}
