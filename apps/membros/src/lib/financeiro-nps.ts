// Mensalidade da Mentoria NPS vista pelo aluno. Os dados vêm do financeiro (Supabase da
// 11ds) por um endpoint protegido; a chave do Asaas nunca chega ao navegador.
// Sem FINANCEIRO_URL/FINANCEIRO_API_KEY, ou sem aluno/parcelas no financeiro, devolve
// null e a tela mostra "nenhuma mensalidade em aberto" (stand-by).

export type StatusMensalidade = 'em_dia' | 'a_vencer' | 'vence_hoje' | 'atrasada'

export interface ProximaMensalidade {
  valor: number
  vencimento: string // YYYY-MM-DD
  diasParaVencer: number // negativo = atrasada
  status: StatusMensalidade
  linkPagamento: string | null
  pixCopiaECola: string | null
  pixQrCodeBase64: string | null
}

export interface MensalidadePaga {
  referencia: string // YYYY-MM-DD
  valor: number
  pagoEm: string | null
}

export interface FinanceiroNps {
  proxima: ProximaMensalidade | null
  historico: MensalidadePaga[]
}

const INVISIVEIS = /[﻿​-‍]/g

export async function getFinanceiroNps(email: string): Promise<FinanceiroNps | null> {
  const url = process.env.FINANCEIRO_URL?.replace(INVISIVEIS, '').trim()
  const key = process.env.FINANCEIRO_API_KEY?.replace(INVISIVEIS, '').trim()
  if (!url || !key) return null

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/nps-financeiro`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.ok) return null
    return {
      proxima: data.proxima ?? null,
      historico: Array.isArray(data.historico) ? data.historico : [],
    }
  } catch (err) {
    console.error('[financeiro-nps] falha ao consultar o financeiro:', err)
    return null
  }
}
