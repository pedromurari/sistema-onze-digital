/**
 * nps-matricula-criar
 * Link de matrícula público da Mentoria NPS (Numerologia) -- pedido do Pedro
 * (16/11/2026): "forma rápida" de matricular alguém novo, sem passar pelo
 * CRM. Form mínimo (nome, whatsapp, email, CPF) -> cria o aluno na turma NPS
 * e gera na hora a 1ª cobrança via PIX no Asaas (não parcelas fixas -- é
 * assinatura: só existe UMA parcela pendente por vez, a próxima só nasce
 * quando essa for paga, ver nps-matricula-status e o branch "numerologia"
 * dentro de asaas-webhook-time-comercial).
 *
 * Idempotente por CPF: se já existe aluno com esse CPF nesta turma, reusa o
 * registro (reativa se estava cancelado) em vez de duplicar -- cobre o caso
 * de alguém reabrir o link ou de quem cancelou querer voltar a pagar.
 *
 * Body: { nome: string, whatsapp: string, email: string, cpf: string }
 * Resposta: { ok, alunoId, paymentId, qrCodeBase64, qrCode, valor }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';
const NPS_TURMA_ID = '25abbf54-ef59-4d7c-8db8-bf43ecd82318';
const NPS_PRODUTO = 'numerologia';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function asaasFetch(path: string, init: RequestInit) {
  const res = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY, ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

async function buscarPixComRetry(paymentId: string) {
  let ok = false;
  let data: any = null;
  for (let tentativa = 0; tentativa < 3 && !ok; tentativa++) {
    if (tentativa > 0) await new Promise(r => setTimeout(r, 1500));
    const resultado = await asaasFetch(`/payments/${paymentId}/pixQrCode`, { method: 'GET' });
    ok = resultado.ok;
    data = resultado.data;
  }
  return { ok, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    if (!ASAAS_API_KEY) {
      console.error('nps-matricula-criar: ASAAS_API_KEY não configurado');
      return json({ ok: false, erro: 'Pagamento indisponível no momento. Avise a equipe.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? '').trim();
    const email = String(body?.email ?? '').trim();
    const whatsapp = String(body?.whatsapp ?? '').trim();
    const cpfDigits = String(body?.cpf ?? '').replace(/\D/g, '');

    if (!nome || !email || !whatsapp || cpfDigits.length !== 11) {
      return json({ ok: false, erro: 'Preencha nome, e-mail, WhatsApp e CPF (válido).' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: turma, error: turmaErr } = await supabase
      .from('turmas')
      .select('valor_mensalidade, dia_vencimento')
      .eq('id', NPS_TURMA_ID)
      .maybeSingle();
    if (turmaErr || !turma) {
      console.error('nps-matricula-criar: turma NPS não encontrada', turmaErr);
      return json({ ok: false, erro: 'Configuração da turma NPS não encontrada. Avise a equipe.' }, 500);
    }
    const valorMensalidade = Number(turma.valor_mensalidade) || 100;
    const diaVencimento = Number(turma.dia_vencimento) || 10;

    // ── Reaproveita aluno existente com o mesmo CPF nesta turma (idempotente) ──
    const { data: existente } = await supabase
      .from('alunos')
      .select('id, status, asaas_customer_id')
      .eq('turma_id', NPS_TURMA_ID)
      .eq('cpf', cpfDigits)
      .maybeSingle();

    let alunoId: string;
    let customerId: string | null;

    if (existente) {
      alunoId = existente.id as string;
      customerId = existente.asaas_customer_id as string | null;
      await supabase.from('alunos').update({
        nome, email, whatsapp, status: 'ativo',
        dia_vencimento: diaVencimento, valor_mensalidade: valorMensalidade,
        produto: NPS_PRODUTO, forma_pagamento: 'pix',
      }).eq('id', alunoId);

      // Já existe parcela pendente em aberto? Reaproveita em vez de duplicar.
      const { data: pendente } = await supabase
        .from('pagamentos')
        .select('id, asaas_payment_id, valor')
        .eq('aluno_id', alunoId)
        .eq('status', 'pendente')
        .order('numero_parcela', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendente?.asaas_payment_id) {
        const { ok: pixOk, data: pixData } = await buscarPixComRetry(pendente.asaas_payment_id);
        return json({
          ok: true, alunoId, paymentId: pendente.asaas_payment_id, valor: Number(pendente.valor),
          qrCodeBase64: pixOk ? (pixData?.encodedImage ?? null) : null,
          qrCode: pixOk ? (pixData?.payload ?? null) : null,
        });
      }
      // Sem parcela pendente (ex.: estava cancelado) -- cai no fluxo abaixo e
      // cria uma nova, usando o número de parcela seguinte ao histórico.
    } else {
      const { data: novoAluno, error: insErr } = await supabase
        .from('alunos')
        .insert({
          nome, email, whatsapp, cpf: cpfDigits,
          produto: NPS_PRODUTO, turma_id: NPS_TURMA_ID, status: 'ativo',
          forma_pagamento: 'pix', valor_mensalidade: valorMensalidade,
          dia_vencimento: diaVencimento, data_matricula: hojeSP(),
          // 'direto' é o valor mais próximo em alunos_origem_lead_check pra
          // "veio do link público, sem vendedor/lançamento no meio" -- achado
          // em teste real 16/11/2026, a constraint não tem um valor dedicado
          // pra esse link e não cabe criar um só pra isso agora.
          origem_lead: 'direto',
        })
        .select('id')
        .single();
      if (insErr || !novoAluno) {
        console.error('nps-matricula-criar: erro ao criar aluno', insErr);
        return json({ ok: false, erro: 'Não foi possível criar a matrícula. Tente novamente.' }, 500);
      }
      alunoId = novoAluno.id as string;
      customerId = null;
    }

    // ── Cliente Asaas: reaproveita se já existe, cria se não ──────────────────
    if (!customerId) {
      const { ok: custOk, data: custData } = await asaasFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: nome, cpfCnpj: cpfDigits, email }),
      });
      if (!custOk || !custData?.id) {
        console.error('nps-matricula-criar: erro ao criar cliente Asaas', custData);
        return json({ ok: false, erro: custData?.errors?.[0]?.description || 'Não foi possível gerar a cobrança. Tente novamente.' }, 400);
      }
      customerId = String(custData.id);
      await supabase.from('alunos').update({ asaas_customer_id: customerId }).eq('id', alunoId);
    }

    // ── Número da parcela (próxima da sequência, pra quem já teve histórico) ──
    const { count: parcelasAnteriores } = await supabase
      .from('pagamentos').select('id', { count: 'exact', head: true }).eq('aluno_id', alunoId);
    const numeroParcela = (parcelasAnteriores ?? 0) + 1;

    const hoje = hojeSP();
    const { data: pagamentoRow, error: pagErr } = await supabase
      .from('pagamentos')
      .insert({
        aluno_id: alunoId, produto: NPS_PRODUTO, valor: valorMensalidade,
        mes_referencia: primeiroDiaDoMes(hoje), data_vencimento: hoje,
        numero_parcela: numeroParcela, status: 'pendente',
        observacoes: numeroParcela === 1 ? 'Ato de matricula (link NPS)' : null,
      })
      .select('id')
      .single();
    if (pagErr || !pagamentoRow) {
      console.error('nps-matricula-criar: erro ao criar parcela', pagErr);
      return json({ ok: false, erro: 'Não foi possível gerar a cobrança. Tente novamente.' }, 500);
    }

    const { ok: payOk, data: payData } = await asaasFetch('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: valorMensalidade,
        dueDate: hoje,
        description: `Mentoria NPS - mensalidade - ${nome}`,
        externalReference: pagamentoRow.id,
      }),
    });
    if (!payOk || !payData?.id) {
      console.error('nps-matricula-criar: erro ao criar cobrança Asaas', payData);
      return json({ ok: false, erro: payData?.errors?.[0]?.description || 'Não foi possível gerar o PIX. Tente novamente.' }, 400);
    }

    await supabase.from('pagamentos').update({
      asaas_payment_id: String(payData.id),
      link_pagamento_asaas: payData.invoiceUrl ?? null,
    }).eq('id', pagamentoRow.id);

    const { ok: pixOk, data: pixData } = await buscarPixComRetry(String(payData.id));
    if (!pixOk) console.error('nps-matricula-criar: erro ao buscar Pix (3 tentativas)', pixData);

    return json({
      ok: true, alunoId, paymentId: payData.id, valor: valorMensalidade,
      qrCodeBase64: pixOk ? (pixData?.encodedImage ?? null) : null,
      qrCode: pixOk ? (pixData?.payload ?? null) : null,
    });
  } catch (error) {
    console.error('nps-matricula-criar error:', error);
    return json({ ok: false, erro: 'Erro interno. Tente novamente.' }, 500);
  }
});
