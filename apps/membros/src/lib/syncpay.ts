// Cliente da API do SyncPay (https://syncpay.apidog.io/)
// Requer SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET nas variáveis de ambiente (server-side only).

const BASE_URL = 'https://api.syncpayments.com.br'

async function getAccessToken(): Promise<string> {
  const clientId = process.env.SYNCPAY_CLIENT_ID
  const clientSecret = process.env.SYNCPAY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('SYNCPAY_CLIENT_ID / SYNCPAY_CLIENT_SECRET não configurados nas variáveis de ambiente.')
  }

  const res = await fetch(`${BASE_URL}/api/partner/v1/auth-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`SyncPay auth falhou (${res.status}): ${data?.message ?? 'erro desconhecido'}`)
  }
  return data.access_token as string
}

export interface SyncPaySplit {
  user_id: string
  percentage: number
}

export interface CriarPixParams {
  amount: number
  description?: string
  webhookUrl: string
  client: { name: string; cpf: string; email: string; phone: string }
  split?: SyncPaySplit[]
}

export interface CriarPixResult {
  message: string
  pix_code: string
  identifier: string
}

export async function criarPixSyncPay(params: CriarPixParams): Promise<CriarPixResult> {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/api/partner/v1/cash-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: params.amount,
      description: params.description ?? null,
      webhook_url: params.webhookUrl,
      client: params.client,
      ...(params.split && params.split.length > 0 ? { split: params.split } : {}),
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || `SyncPay cash-in falhou (${res.status})`)
  }
  return data as CriarPixResult
}

export async function consultarTransacaoSyncPay(identifier: string) {
  const token = await getAccessToken()
  const res = await fetch(`${BASE_URL}/api/partner/v1/transaction/${identifier}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || `SyncPay consulta falhou (${res.status})`)
  }
  return data
}

// ─────────────────────────────────────────────────────────────────────────
// Catálogo de produtos vendidos via checkout público (não fazem parte da
// tabela `products` do member-area, pois são vendas avulsas sem login).
// Split fica vazio até termos o user_id SyncPay de cada parceira envolvida.
// ─────────────────────────────────────────────────────────────────────────
export const PRODUTOS_CHECKOUT: Record<string, { nome: string; valor: number; split?: SyncPaySplit[] }> = {
  'cicatrizes-que-curam': {
    nome: 'Workshop Cicatrizes que Curam',
    valor: 47.90,
    // TODO: adicionar split IDM + Jocimara assim que tivermos o user_id SyncPay dela.
  },
  'sessao-jocimara': {
    nome: 'Sessão com a Jocimara',
    valor: 100.00,
    // TODO: split 80% Jocimara / 20% IDM assim que tivermos o user_id SyncPay dela.
  },
  // Downsell proposto — oferta e conteúdo (áudio-aula + guia em PDF) ainda
  // não confirmados pelo usuário, cadastrado aqui só pra deixar o fluxo
  // de checkout pronto assim que a oferta for validada.
  'kit-cicatrizes': {
    nome: 'Kit Cicatrizes que Curam (áudio-aula + guia em PDF)',
    valor: 27.00,
  },
}
