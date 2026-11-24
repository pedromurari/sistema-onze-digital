/**
 * nps-matricula-criar
 * Link de matrícula público da Mentoria NPS (Numerologia) -- pedido do Pedro
 * (16/11/2026): "forma rápida" de matricular alguém novo, sem passar pelo
 * CRM. Form mínimo (nome, whatsapp, email, CPF) -> cria o aluno na turma NPS
 * e gera na hora a 1ª cobrança via PIX (não parcelas fixas -- é assinatura:
 * só existe UMA parcela pendente por vez, a próxima só nasce quando essa for
 * paga, ver nps-matricula-status).
 *
 * 23/11/2026 -- MOTOR TROCADO DE ASAAS PRA SYNCPAY. A conta Asaas foi
 * reprovada em definitivo e a API responde 401, ou seja: este link estava
 * QUEBRADO, ninguém conseguia se matricular no NPS. A SyncPay não tem
 * checkout hospedado nem `externalReference`, então a amarração com a nossa
 * parcela é feita por `pagamentos.syncpay_identifier` (e, como rede de
 * segurança, pelo `[ref:<uuid>]` na descrição) -- mesmo contrato que o
 * checkout-parcela e o syncpay-cobranca-webhook já usam.
 *
 * Body: { nome: string, whatsapp: string, email: string, cpf: string }
 * Resposta: { ok, alunoId, paymentId, qrCodeBase64, qrCode, valor, checkoutUrl }
 * `paymentId` agora é o UUID da nossa parcela (não mais o id do Asaas) --
 * é o que o nps-matricula-status espera receber de volta no polling.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYNC_API = 'https://api.syncpayments.com.br/api/partner/v1';
const NPS_TURMA_ID = '25abbf54-ef59-4d7c-8db8-bf43ecd82318';
const NPS_PRODUTO = 'numerologia';
const SITE = 'https://sistema.idmpsi.com.br';

// Black IDM (pedido do Pedro, 24/11/2026): na 1ª mensalidade de quem entra
// na Black, o IDM paga metade. Só a parcela 1 de aluno novo; a partir da 2ª
// volta ao valor da turma (gerarProximaParcela usa alunos.valor_mensalidade).
// Até o fim do dia BLACK_NPS_ATE (Brasília). A página do site mostra R$ 50
// (apps/membros/.../mentoria-nps/page.tsx) -- mudar os dois juntos.
const BLACK_NPS_ATE = '2026-11-30';
const BLACK_NPS_FATOR = 0.5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

// A SyncPay recusa telefone com DDI: exige 10 ou 11 dígitos (erro 422 real
// em 23/11/2026, porque gravamos "5511995311524", 13 dígitos).
function telefoneBR(s: unknown) {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(-11);
}

async function syncToken(): Promise<string | null> {
  const client_id = Deno.env.get('SYNCPAY_CLIENT_ID');
  const client_secret = Deno.env.get('SYNCPAY_CLIENT_SECRET');
  if (!client_id || !client_secret) return null;
  const r = await fetch(`${SYNC_API}/auth-token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret }),
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => ({})))?.access_token ?? null;
}

async function gerarPix(opts: {
  pagamentoId: string; valor: number; nome: string; cpf: string; email: string; whatsapp: string;
}): Promise<{ pix_code: string; identifier: string } | null> {
  const token = await syncToken();
  if (!token) { console.error('nps-matricula-criar: sem token SyncPay'); return null; }

  const r = await fetch(`${SYNC_API}/cash-in`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amount: Number(opts.valor.toFixed(2)),
      description: `Mentoria NPS - mensalidade - ${opts.nome} [ref:${opts.pagamentoId}]`,
      webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/syncpay-cobranca-webhook`,
      client: {
        name: opts.nome.slice(0, 120),
        document: opts.cpf,
        email: opts.email,
        phone: telefoneBR(opts.whatsapp) || '11999999999',
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.pix_code) {
    console.error('nps-matricula-criar: cash-in falhou', r.status, JSON.stringify(data).slice(0, 300));
    return null;
  }
  return { pix_code: String(data.pix_code), identifier: String(data.identifier ?? '') };
}

async function qrBase64(texto: string): Promise<string | null> {
  try {
    const dataUrl: string = await QRCode.toDataURL(texto, { margin: 1, width: 320 });
    return dataUrl.split(',')[1] ?? null;
  } catch (e) {
    console.error('nps-matricula-criar: falha ao gerar QR', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
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

    // -- Reaproveita aluno existente com o mesmo CPF nesta turma (idempotente) --
    const { data: existente } = await supabase
      .from('alunos')
      .select('id, status')
      .eq('turma_id', NPS_TURMA_ID)
      .eq('cpf', cpfDigits)
      .maybeSingle();

    let alunoId: string;

    if (existente) {
      alunoId = existente.id as string;
      await supabase.from('alunos').update({
        nome, email, whatsapp, status: 'ativo',
        dia_vencimento: diaVencimento, valor_mensalidade: valorMensalidade,
        produto: NPS_PRODUTO, forma_pagamento: 'pix',
      }).eq('id', alunoId);

      // Já existe parcela pendente em aberto? Reaproveita em vez de duplicar.
      const { data: pendente } = await supabase
        .from('pagamentos')
        .select('id, valor, link_pagamento_syncpay, checkout_token')
        .eq('aluno_id', alunoId)
        .eq('status', 'pendente')
        .order('numero_parcela', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendente) {
        let pix = pendente.link_pagamento_syncpay as string | null;
        if (!pix) {
          const novo = await gerarPix({
            pagamentoId: pendente.id as string, valor: Number(pendente.valor),
            nome, cpf: cpfDigits, email, whatsapp,
          });
          if (!novo) return json({ ok: false, erro: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
          pix = novo.pix_code;
          await supabase.from('pagamentos').update({
            syncpay_identifier: novo.identifier || null, link_pagamento_syncpay: pix,
          }).eq('id', pendente.id);
        }
        return json({
          ok: true, alunoId, paymentId: pendente.id, valor: Number(pendente.valor),
          qrCode: pix, qrCodeBase64: await qrBase64(pix),
          checkoutUrl: `${SITE}/pagar/${pendente.checkout_token}`,
        });
      }
      // Sem parcela pendente (ex.: estava cancelado) -- cai no fluxo abaixo.
    } else {
      const { data: novoAluno, error: insErr } = await supabase
        .from('alunos')
        .insert({
          nome, email, whatsapp, cpf: cpfDigits,
          produto: NPS_PRODUTO, turma_id: NPS_TURMA_ID, status: 'ativo',
          forma_pagamento: 'pix', valor_mensalidade: valorMensalidade,
          dia_vencimento: diaVencimento, data_matricula: hojeSP(),
          // 'direto' é o valor mais próximo em alunos_origem_lead_check pra
          // "veio do link público, sem vendedor/lançamento no meio".
          origem_lead: 'direto',
        })
        .select('id')
        .single();
      if (insErr || !novoAluno) {
        console.error('nps-matricula-criar: erro ao criar aluno', insErr);
        return json({ ok: false, erro: 'Não foi possível criar a matrícula. Tente novamente.' }, 500);
      }
      alunoId = novoAluno.id as string;
    }

    // -- Número da parcela (próxima da sequência, pra quem já teve histórico) --
    const { count: parcelasAnteriores } = await supabase
      .from('pagamentos').select('id', { count: 'exact', head: true }).eq('aluno_id', alunoId);
    const numeroParcela = (parcelasAnteriores ?? 0) + 1;

    const hoje = hojeSP();
    const ehBlack = numeroParcela === 1 && hoje <= BLACK_NPS_ATE;
    const valorCobrado = ehBlack ? Math.round(valorMensalidade * BLACK_NPS_FATOR * 100) / 100 : valorMensalidade;
    const { data: pagamentoRow, error: pagErr } = await supabase
      .from('pagamentos')
      .insert({
        aluno_id: alunoId, produto: NPS_PRODUTO, valor: valorCobrado,
        mes_referencia: primeiroDiaDoMes(hoje), data_vencimento: hoje,
        numero_parcela: numeroParcela, status: 'pendente',
        observacoes: numeroParcela === 1
          ? (ehBlack ? 'Ato de matricula (link NPS) - Black IDM: 1a mensalidade pela metade' : 'Ato de matricula (link NPS)')
          : null,
      })
      .select('id, checkout_token')
      .single();
    if (pagErr || !pagamentoRow) {
      console.error('nps-matricula-criar: erro ao criar parcela', pagErr);
      return json({ ok: false, erro: 'Não foi possível gerar a cobrança. Tente novamente.' }, 500);
    }

    const pix = await gerarPix({
      pagamentoId: pagamentoRow.id as string, valor: valorCobrado,
      nome, cpf: cpfDigits, email, whatsapp,
    });
    if (!pix) return json({ ok: false, erro: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);

    await supabase.from('pagamentos').update({
      syncpay_identifier: pix.identifier || null,
      link_pagamento_syncpay: pix.pix_code,
    }).eq('id', pagamentoRow.id);

    return json({
      ok: true, alunoId, paymentId: pagamentoRow.id, valor: valorCobrado,
      qrCode: pix.pix_code, qrCodeBase64: await qrBase64(pix.pix_code),
      checkoutUrl: `${SITE}/pagar/${pagamentoRow.checkout_token}`,
    });
  } catch (error) {
    console.error('nps-matricula-criar error:', error);
    return json({ ok: false, erro: 'Erro interno. Tente novamente.' }, 500);
  }
});
