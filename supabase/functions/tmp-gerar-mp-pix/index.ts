/**
 * tmp-gerar-mp-pix
 * Plano B emergencial (19/11/2026): a conta Asaas entrou em "período de
 * ativação" (revisão de documento pela reforma tributária) e bloqueou tanto
 * o download de boleto pelo aluno quanto a validação por API que o
 * enviar-cobranca faz antes de mandar cobrança -- automação parada até a
 * Asaas liberar.
 *
 * Em vez de esperar, gera um PIX avulso via Mercado Pago (mesma conta/token
 * já usada em matricula-pagamento-criar, comprovadamente funcionando) pra
 * uma parcela especifica, com `external_reference = pagamentos.id`. Essa é
 * a MESMA convenção que o mp-webhook-time-comercial já sabe reconhecer (ver
 * comentário lá: "parcela avulsa, external_reference é o id da linha em
 * pagamentos") -- ou seja, quando o aluno pagar esse PIX, a confirmação cai
 * sozinha no webhook já existente e já em produção, sem precisar de nenhum
 * código novo de confirmação.
 *
 * Body: { pagamento_id: string, dias_validade?: number, forcar?: boolean }
 * Grava mp_payment_id e o "copia e cola" do PIX em link_pagamento_mp (mesmo
 * campo que a ficha já usa pra copiar link de boleto -- `linkBoleto` no
 * Financeiro.tsx aceita qualquer texto ali, não só URL).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key' };
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;

// Auth: mesmo padrão do wpp-enviar. Até 23/11/2026 esta função era pública
// e sem nenhuma checagem -- qualquer um com um pagamento_id válido criava
// cobrança na nossa conta do Mercado Pago. Fechada numa varredura junto com
// tmp-nf-export, tmp-mp-buscar e tmp-mp-consultar.
const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';

// Sem date_of_expiration o Mercado Pago aplica 24h, e aluno que demora um dia
// pra pagar recebe "QR expirado" -- aconteceu com Izauro e Thiago (20-21/11).
const DIAS_VALIDADE_PADRAO = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// America/Sao_Paulo é UTC-3 fixo (sem horário de verão desde 2019). O MP exige
// ISO 8601 com offset explícito e recusa 'Z'.
function expiracaoISO(dias: number): string {
  const instante = Date.now() + dias * 24 * 60 * 60 * 1000;
  return new Date(instante - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (req.headers.get('x-financeiro-key') !== FINANCEIRO_KEY) {
    return json({ ok: false, erro: 'não autorizado' }, 403);
  }

  try {
    if (!MP_ACCESS_TOKEN) return json({ ok: false, erro: 'MP_ACCESS_TOKEN não configurado' }, 500);

    const { pagamento_id, dias_validade, forcar } = await req.json().catch(() => ({})) as {
      pagamento_id?: string; dias_validade?: number; forcar?: boolean;
    };
    if (!pagamento_id) return json({ ok: false, erro: 'pagamento_id obrigatório' }, 400);

    const dias = Math.min(Math.max(Number(dias_validade) || DIAS_VALIDADE_PADRAO, 1), 30);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: pagamento, error: pagErr } = await sb
      .from('pagamentos')
      .select('id, aluno_id, valor, numero_parcela, status, mp_payment_id, produto, alunos(nome, cpf, email)')
      .eq('id', pagamento_id)
      .single();
    if (pagErr || !pagamento) return json({ ok: false, erro: 'pagamento não encontrado', detalhe: pagErr?.message }, 404);
    if (pagamento.status !== 'pendente' && pagamento.status !== 'atrasado') {
      return json({ ok: false, erro: `status já é '${pagamento.status}'` }, 400);
    }

    // Guard contra gerar dois PIX pra mesma parcela sem querer. Com forcar=true
    // consulta o MP primeiro: se o PIX antigo já foi pago, NUNCA gera outro.
    if (pagamento.mp_payment_id) {
      if (!forcar) {
        return json({ ok: false, erro: 'já tem mp_payment_id -- use forcar:true pra regerar (ex: PIX expirado)' }, 400);
      }
      const consulta = await fetch(`https://api.mercadopago.com/v1/payments/${pagamento.mp_payment_id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const anterior = await consulta.json().catch(() => ({}));
      if (consulta.ok && (anterior?.status === 'approved' || anterior?.status === 'in_process')) {
        return json({
          ok: false, ja_pago: true, erro: `PIX anterior está '${anterior.status}' -- NÃO regerar`,
          mp_payment_id: pagamento.mp_payment_id,
        }, 409);
      }
    }

    const aluno = (pagamento as any).alunos;
    if (!aluno) return json({ ok: false, erro: 'aluno não encontrado' }, 404);

    const nomeCompleto = String(aluno.nome ?? 'Aluno').trim();
    const [firstName, ...restName] = nomeCompleto.split(/\s+/);
    const lastName = restName.join(' ') || firstName;
    const cpfDigits = String(aluno.cpf ?? '').replace(/\D/g, '');

    const LABEL: Record<string, string> = {
      psicanalise: 'Matricula PSI', 'sociedade-idm': 'Sociedade IDM', numerologia: 'Numerologia (NPS)', 'pnl-master': 'PNL Master',
    };
    const label = LABEL[String(pagamento.produto)] ?? 'Matricula';

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        payment_method_id: 'pix',
        transaction_amount: Number(pagamento.valor),
        description: `${label} (parcela ${pagamento.numero_parcela}) - ${nomeCompleto}`,
        external_reference: pagamento.id,
        date_of_expiration: expiracaoISO(dias),
        payer: {
          email: aluno.email || undefined,
          first_name: firstName || 'Aluno',
          last_name: lastName || 'Aluno',
          ...(cpfDigits ? { identification: { type: 'CPF', number: cpfDigits } } : {}),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ ok: false, erro: data?.message || `Erro MP ${res.status}`, detalhe: data }, 502);
    }

    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
    const qrCode = data.point_of_interaction?.transaction_data?.qr_code ?? null;

    const { error: updErr } = await sb
      .from('pagamentos')
      .update({ mp_payment_id: String(data.id), link_pagamento_mp: qrCode })
      .eq('id', pagamento.id);
    if (updErr) return json({ ok: false, erro: `PIX gerado mas falhou ao salvar: ${updErr.message}` }, 500);

    return json({
      ok: true, mp_payment_id: data.id, status: data.status,
      date_created: data.date_created, date_of_expiration: data.date_of_expiration,
      qr_code: qrCode, qr_code_base64: qrCodeBase64,
    });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
