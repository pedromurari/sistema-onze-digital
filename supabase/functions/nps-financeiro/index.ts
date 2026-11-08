import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * nps-financeiro — mensalidade da Mentoria NPS vista pela área de membros.
 *
 * Chamado pelo servidor da área de membros (nunca pelo navegador) com
 * `Authorization: Bearer ${AREA_MEMBROS_API_KEY}` e body `{ email }`.
 * Devolve só os dados do próprio aluno: próxima parcela em aberto (com link do Asaas
 * e Pix copia-e-cola) e as últimas mensalidades pagas. Sem aluno NPS ou sem parcelas,
 * devolve `proxima: null` e `historico: []` (a tela mostra "nenhuma mensalidade em aberto").
 *
 * Secrets: AREA_MEMBROS_API_KEY, ASAAS_API_KEY (+ SUPABASE_URL/SERVICE_ROLE_KEY padrão).
 */

const ASAAS_API = 'https://api.asaas.com/v3';
const INVISIVEIS = /[﻿​-‍]/g;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Data de hoje em São Paulo (YYYY-MM-DD)
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.parse(`${deISO}T00:00:00Z`);
  const b = Date.parse(`${ateISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

async function pixDoAsaas(paymentId: string): Promise<{ payload: string | null; imagem: string | null }> {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) return { payload: null, imagem: null };
  try {
    const res = await fetch(`${ASAAS_API}/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { payload: null, imagem: null };
    const data = await res.json();
    return { payload: data.payload ?? null, imagem: data.encodedImage ?? null };
  } catch (e) {
    console.error('nps-financeiro: falha ao buscar Pix no Asaas', (e as Error).message);
    return { payload: null, imagem: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const esperada = Deno.env.get('AREA_MEMBROS_API_KEY')?.replace(INVISIVEIS, '').trim();
  const recebida = req.headers.get('authorization')?.replace(INVISIVEIS, '').trim();
  if (!esperada || recebida !== `Bearer ${esperada}`) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email) return json({ ok: false, error: 'email_obrigatorio' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // 'produto' da turma NPS é gravado como 'numerologia' (categoria da turma),
  // não 'nps' — confirmado em public.turmas (achado em sessão de QA, 17/10/2026).
  const { data: alunos } = await db
    .from('alunos')
    .select('id')
    .ilike('email', email)
    .ilike('produto', 'numerologia')
    .not('status', 'in', '(cancelado,concluido)');

  const ids = (alunos ?? []).map((a: { id: string }) => a.id);
  if (!ids.length) return json({ ok: true, proxima: null, historico: [] });

  const hoje = hojeSP();

  const { data: abertas } = await db
    .from('pagamentos')
    .select('id, valor, data_vencimento, status, asaas_payment_id, link_pagamento_asaas')
    .in('aluno_id', ids)
    .in('status', ['pendente', 'atrasado'])
    .order('data_vencimento', { ascending: true })
    .limit(1);

  const { data: pagas } = await db
    .from('pagamentos')
    .select('mes_referencia, data_vencimento, valor, data_pagamento')
    .in('aluno_id', ids)
    .eq('status', 'pago')
    .order('data_vencimento', { ascending: false })
    .limit(6);

  let proxima = null;
  const p = abertas?.[0];
  if (p) {
    const dias = diasEntre(hoje, p.data_vencimento);
    const status = dias < 0 ? 'atrasada' : dias === 0 ? 'vence_hoje' : dias <= 7 ? 'a_vencer' : 'em_dia';
    const pix = p.asaas_payment_id ? await pixDoAsaas(p.asaas_payment_id) : { payload: null, imagem: null };
    proxima = {
      valor: Number(p.valor),
      vencimento: p.data_vencimento,
      diasParaVencer: dias,
      status,
      linkPagamento: p.link_pagamento_asaas ?? null,
      pixCopiaECola: pix.payload,
      pixQrCodeBase64: pix.imagem,
    };
  }

  const historico = (pagas ?? []).map((x: { mes_referencia: string | null; data_vencimento: string; valor: number; data_pagamento: string | null }) => ({
    referencia: x.mes_referencia ?? x.data_vencimento,
    valor: Number(x.valor),
    pagoEm: x.data_pagamento,
  }));

  return json({ ok: true, proxima, historico });
});
