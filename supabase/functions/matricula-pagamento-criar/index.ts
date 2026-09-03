/**
 * matricula-pagamento-criar
 * Cria a cobrança no Mercado Pago (PRODUCAO) pra um aluno ja matriculado via
 * matricula_time_comercial_criar (fluxo publico /matricula/:vendedor,
 * ver src/pages/MatriculaTimeComercial.tsx).
 *
 * PIX, boleto e cartao parcelado validados com cartao de teste e liberados
 * pra producao em 2026-08-26. Cartao recorrente liberado em 2026-09-03 apos
 * teste com cobranca real (estava bloqueado por ter dado "Card token service
 * not found" no ambiente de sandbox do MP -- limitacao do sandbox pra esse
 * recurso especificamente, nao reproduziu com token/cartao real).
 *
 * A partir de 2026-08-26: forma 'boleto' cobra a 1ª parcela (R$150) via PIX
 * (não mais via boleto bancário real 'bolbradesco') — mesmo formato de
 * resposta do 'avista' (qrCodeBase64/qrCode/paymentId/status). As outras 14
 * parcelas são boletos reais gerados via Asaas (nao mais Mercado Pago, desde
 * 2026-09-03) e enviados automaticamente pelo cron matricula-boleto-mensal-gerar
 * (não passa por aqui) via WhatsApp/e-mail usando o sistema de cobrança já
 * existente (enviar-cobranca).
 *
 * Body: {
 *   alunoId: string,
 *   forma: 'avista' | 'cartao_parcelado' | 'cartao_recorrente' | 'boleto',
 *   // cartão (parcelado/recorrente), vindo do Card Payment Brick:
 *   cardToken?: string,
 *   installments?: number,
 *   paymentMethodId?: string,
 *   // status check (polling do Pix):
 *   checkStatus?: boolean,
 *   paymentId?: string | number,
 *   // dados do pagador (fallback: busca em `alunos` se não vier):
 *   payerEmail?: string,
 *   payerFirstName?: string,
 *   payerLastName?: string,
 *   payerCpf?: string,
 * }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const MP_API = 'https://api.mercadopago.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function mpFetch(path: string, init: RequestInit) {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    if (!MP_ACCESS_TOKEN) {
      console.error('matricula-pagamento-criar: MP_ACCESS_TOKEN não configurado');
      return json({ ok: false, erro: 'Pagamento indisponível no momento. Avise a equipe.' }, 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();

    // ── Status check (polling do Pix) ────────────────────────────────────────
    if (body?.checkStatus) {
      const paymentId = String(body.paymentId ?? '');
      if (!paymentId) return json({ ok: false, erro: 'paymentId ausente' }, 400);

      const { ok, data } = await mpFetch(`/v1/payments/${paymentId}`, { method: 'GET' });
      if (!ok) {
        console.error('matricula-pagamento-criar: erro ao consultar status', data);
        return json({ ok: false, erro: 'Erro ao consultar status do pagamento.' }, 400);
      }

      if (data.external_reference) {
        await supabase.from('alunos').update({ mp_status: data.status }).eq('id', data.external_reference);
      }

      return json({ ok: true, status: data.status, statusDetail: data.status_detail });
    }

    const alunoId = String(body?.alunoId ?? '');
    const forma = String(body?.forma ?? '');

    if (!alunoId || !['avista', 'cartao_parcelado', 'cartao_recorrente', 'boleto'].includes(forma)) {
      return json({ ok: false, erro: 'Dados obrigatórios ausentes.' }, 400);
    }

    const { data: aluno, error: alunoErr } = await supabase
      .from('alunos').select('id, nome, email, cpf').eq('id', alunoId).maybeSingle();

    if (alunoErr || !aluno) {
      return json({ ok: false, erro: 'Aluno não encontrado.' }, 404);
    }

    const nomeCompleto = String(body?.payerFirstName ? `${body.payerFirstName} ${body.payerLastName ?? ''}` : (aluno as any).nome ?? '').trim();
    const [firstName, ...restName] = nomeCompleto.split(/\s+/);
    const lastName = restName.join(' ') || firstName || 'Aluno';
    const email = String(body?.payerEmail ?? (aluno as any).email ?? '');
    const cpfDigits = String(body?.payerCpf ?? (aluno as any).cpf ?? '').replace(/\D/g, '');

    const payer: Record<string, unknown> = {
      email,
      first_name: firstName || 'Aluno',
      last_name: lastName,
      ...(cpfDigits ? { identification: { type: 'CPF', number: cpfDigits } } : {}),
    };

    const idempotencyKey = crypto.randomUUID();

    // ── PIX à vista ───────────────────────────────────────────────────────────
    if (forma === 'avista') {
      const { ok, data } = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          payment_method_id: 'pix',
          transaction_amount: 1500,
          description: `Matrícula PSI - ${nomeCompleto || aluno.id}`,
          external_reference: alunoId,
          payer,
        }),
      });

      if (!ok) {
        console.error('matricula-pagamento-criar: erro MP (pix)', data);
        return json({ ok: false, erro: data?.message || 'Não foi possível gerar o Pix. Tente novamente.' }, 400);
      }

      await supabase.from('alunos').update({ mp_status: data.status }).eq('id', alunoId);

      return json({
        ok: true,
        paymentId: data.id,
        status: data.status,
        qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        qrCode: data.point_of_interaction?.transaction_data?.qr_code ?? null,
      });
    }

    // ── Boleto (plano 15x R$150; a 1ª parcela agora é cobrada via PIX, igual ao ──
    // avista, só que R$150. As outras 14 parcelas são boletos reais gerados e
    // enviados automaticamente pelo cron matricula-boleto-mensal-gerar (edge
    // function separada) — ver comentário no topo do arquivo.
    if (forma === 'boleto') {
      const { ok, data } = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          payment_method_id: 'pix',
          transaction_amount: 150,
          description: `Matrícula PSI (1ª parcela PIX) - ${nomeCompleto || aluno.id}`,
          external_reference: alunoId,
          payer,
        }),
      });

      if (!ok) {
        console.error('matricula-pagamento-criar: erro MP (boleto/pix)', data);
        return json({ ok: false, erro: data?.message || 'Não foi possível gerar o Pix. Tente novamente.' }, 400);
      }

      await supabase.from('alunos').update({ mp_status: data.status }).eq('id', alunoId);

      return json({
        ok: true,
        paymentId: data.id,
        status: data.status,
        qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        qrCode: data.point_of_interaction?.transaction_data?.qr_code ?? null,
      });
    }

    // ── Cartão parcelado (12x, uma única cobrança com installments:12) ─────────
    if (forma === 'cartao_parcelado') {
      const cardToken = String(body?.cardToken ?? '');
      if (!cardToken) return json({ ok: false, erro: 'Token do cartão ausente.' }, 400);

      const { ok, data } = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          token: cardToken,
          transaction_amount: 1800,
          installments: Number(body?.installments ?? 12),
          payment_method_id: body?.paymentMethodId,
          description: `Matrícula PSI (cartão 12x) - ${nomeCompleto || aluno.id}`,
          external_reference: alunoId,
          payer,
        }),
      });

      if (!ok) {
        console.error('matricula-pagamento-criar: erro MP (cartão parcelado)', data);
        return json({ ok: false, erro: data?.message || 'Não foi possível processar o cartão.' }, 400);
      }

      await supabase.from('alunos').update({ mp_status: data.status }).eq('id', alunoId);

      return json({
        ok: true,
        paymentId: data.id,
        status: data.status,
        statusDetail: data.status_detail,
      });
    }

    // ── Cartão recorrente (assinatura mensal via /preapproval) ─────────────────
    if (forma === 'cartao_recorrente') {
      const cardToken = String(body?.cardToken ?? '');
      if (!cardToken) return json({ ok: false, erro: 'Token do cartão ausente.' }, 400);
      if (!email) return json({ ok: false, erro: 'E-mail do pagador ausente.' }, 400);

      const { ok, data } = await mpFetch('/preapproval', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          card_token_id: cardToken,
          payer_email: email,
          back_url: 'https://11digitalstrategy.com.br',
          reason: `Mensalidade PSI - ${nomeCompleto || aluno.id}`,
          external_reference: alunoId,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 150,
            currency_id: 'BRL',
          },
          status: 'authorized',
        }),
      });

      if (!ok) {
        console.error('matricula-pagamento-criar: erro MP (cartão recorrente)', data);
        return json({ ok: false, erro: data?.message || 'Não foi possível ativar a assinatura.' }, 400);
      }

      await supabase.from('alunos').update({
        mp_preapproval_id: data.id,
        mp_status: data.status,
      }).eq('id', alunoId);

      return json({ ok: true, preapprovalId: data.id, status: data.status });
    }

    return json({ ok: false, erro: 'Forma de pagamento inválida.' }, 400);
  } catch (error) {
    console.error('matricula-pagamento-criar error:', error);
    return json({ ok: false, erro: 'Erro interno. Tente novamente.' }, 500);
  }
});
