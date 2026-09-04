/**
 * matricula-pagamento-criar
 * Cria a cobrança pra um aluno ja matriculado via matricula_time_comercial_criar
 * (fluxo publico /matricula/:vendedor, ver src/pages/MatriculaTimeComercial.tsx).
 * PIX à vista e cartão (parcelado/recorrente) via Mercado Pago; boleto via
 * Asaas -- ver ramo de cada forma abaixo.
 *
 * PIX, boleto e cartao parcelado validados com cartao de teste e liberados
 * pra producao em 2026-08-26. Cartao recorrente liberado em 2026-09-03 apos
 * teste com cobranca real (estava bloqueado por ter dado "Card token service
 * not found" no ambiente de sandbox do MP -- limitacao do sandbox pra esse
 * recurso especificamente, nao reproduziu com token/cartao real).
 *
 * A partir de 2026-09-03: forma 'boleto' gera as 15 parcelas (R$150 cada) de
 * uma vez só, direto no Asaas -- inclusive a 1ª, que antes era cobrada via
 * PIX no Mercado Pago pra ter confirmação instantânea (pedido explícito do
 * dono do produto: "o primeiro pagamento pode ir direto pro asaas mesmo, já
 * gera as 15 parcelas"). Pra não perder a UX de QR code/copia-e-cola que a
 * tela de pagamento já tinha, a 1ª parcela usa o Pix embutido do próprio
 * boleto Asaas (todo BOLETO no Asaas tem um Pix equivalente em paralelo --
 * GET /payments/{id}/pixQrCode). As linhas em `pagamentos` são criadas aqui
 * mesmo (turma_id NULL, igual o resto da matrícula -- só é atribuída depois
 * pelo vendedor). Ver também: parcelasAluno.ts (sincronizarParcelasAluno foi
 * ajustado pra preservar essas linhas já cobradas quando a turma é
 * atribuída, e parou de pré-marcar a 1ª parcela do boleto como paga).
 *
 * Preço por plano (2026-09-04): nenhum valor é hardcoded aqui -- todo mundo
 * lê `aluno.valor_mensalidade` (gravado pela RPC matricula_time_comercial_criar
 * a partir de p_valor_avista/p_valor_parcela, ver PLANOS em
 * src/pages/MatriculaTimeComercial.tsx). É isso que permite o link /promo
 * (R$997 à vista, R$110/mês) sem duplicar nenhum branch de forma de
 * pagamento -- só o valor muda, a quantidade de parcelas é sempre a mesma
 * (12x cartão parcelado, 15x boleto/recorrente).
 *
 * Body: {
 *   alunoId: string,
 *   forma: 'avista' | 'cartao_parcelado' | 'cartao_recorrente' | 'boleto',
 *   // cartão (parcelado/recorrente), vindo do Card Payment Brick:
 *   cardToken?: string,
 *   installments?: number,
 *   paymentMethodId?: string,
 *   // status check (polling do Pix -- MP ou Asaas, detectado pelo formato do id):
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

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';

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

async function asaasFetch(path: string, init: RequestInit) {
  const res = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// IDs do Mercado Pago são sempre numéricos; IDs do Asaas vêm com prefixo
// alfanumérico (ex: "pay_xxx", "cus_xxx"). Usado pra rotear o polling de
// status pro gateway certo sem precisar que o front informe qual é.
const ehIdAsaas = (paymentId: string) => !/^\d+$/.test(paymentId);

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dateComDiaTravado = (year: number, month: number, day: number) => {
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, ultimoDia));
};

// Marca uma parcela como paga (idempotente) e recalcula mensalidades_pagas --
// mesma lógica usada pelo webhook asaas-webhook-time-comercial, duplicada
// aqui pro polling (checkStatus) conseguir confirmar mais rápido que o
// webhook às vezes, sem esperar o round-trip do Asaas até nós.
async function marcarParcelaPaga(supabase: ReturnType<typeof createClient>, pagamentoId: string) {
  const { data: pagamento } = await supabase
    .from('pagamentos').select('id, aluno_id, status').eq('id', pagamentoId).maybeSingle();
  if (!pagamento || pagamento.status === 'pago') return;

  await supabase.from('pagamentos').update({
    status: 'pago',
    data_pagamento: new Date().toISOString().slice(0, 10),
  }).eq('id', pagamento.id);

  const { count } = await supabase
    .from('pagamentos').select('id', { count: 'exact', head: true })
    .eq('aluno_id', pagamento.aluno_id).eq('status', 'pago');
  await supabase.from('alunos').update({ mensalidades_pagas: count ?? 0 }).eq('id', pagamento.aluno_id);
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

    // ── Status check (polling do Pix/boleto) ─────────────────────────────────
    if (body?.checkStatus) {
      const paymentId = String(body.paymentId ?? '');
      if (!paymentId) return json({ ok: false, erro: 'paymentId ausente' }, 400);

      if (ehIdAsaas(paymentId)) {
        const { ok, data } = await asaasFetch(`/payments/${paymentId}`, { method: 'GET' });
        if (!ok) {
          console.error('matricula-pagamento-criar: erro ao consultar status (Asaas)', data);
          return json({ ok: false, erro: 'Erro ao consultar status do pagamento.' }, 400);
        }
        const pago = data.status === 'RECEIVED' || data.status === 'CONFIRMED';
        if (pago && data.externalReference) {
          await marcarParcelaPaga(supabase, String(data.externalReference));
        }
        const statusOut = pago ? 'approved' : (data.status === 'OVERDUE' ? 'rejected' : 'pending');
        return json({ ok: true, status: statusOut, statusDetail: data.status });
      }

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
      .from('alunos')
      .select('id, nome, email, cpf, endereco, cep, cidade_estado, dia_vencimento, data_matricula, asaas_customer_id, valor_mensalidade')
      .eq('id', alunoId).maybeSingle();

    if (alunoErr || !aluno) {
      return json({ ok: false, erro: 'Aluno não encontrado.' }, 404);
    }

    // valor_mensalidade guarda o valor do PLANO desse aluno (gravado pela RPC
    // matricula_time_comercial_criar): lump sum pra avista, valor por parcela
    // pras demais formas. Nunca hardcoded aqui -- é o que permite planos com
    // preço diferente do padrão (ex: /promo, R$997/R$110 em vez de
    // R$1.500/R$150) sem duplicar branch nenhum.
    const valorPlano = Number((aluno as any).valor_mensalidade);
    if (!valorPlano || valorPlano <= 0) {
      console.error('matricula-pagamento-criar: valor_mensalidade ausente/inválido', alunoId, (aluno as any).valor_mensalidade);
      return json({ ok: false, erro: 'Valor do plano não encontrado. Avise a equipe.' }, 500);
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
          transaction_amount: valorPlano,
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

    // ── Boleto (15x R$150, tudo via Asaas -- inclusive a 1ª parcela) ────────────
    if (forma === 'boleto') {
      if (!cpfDigits) return json({ ok: false, erro: 'CPF ausente -- não é possível gerar o boleto.' }, 400);
      if (!ASAAS_API_KEY) {
        console.error('matricula-pagamento-criar: ASAAS_API_KEY não configurado');
        return json({ ok: false, erro: 'Pagamento indisponível no momento. Avise a equipe.' }, 500);
      }

      // ── Cliente Asaas: reaproveita se já existe, cria se não ─────────────────
      let customerId = (aluno as any).asaas_customer_id as string | null;
      if (!customerId) {
        const enderecoTexto = String((aluno as any).endereco ?? '').trim();
        const numeroMatch = enderecoTexto.match(/\d+/);

        const { ok: custOk, data: custData } = await asaasFetch('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: nomeCompleto || 'Aluno',
            cpfCnpj: cpfDigits,
            email: email || undefined,
            address: enderecoTexto || undefined,
            addressNumber: numeroMatch ? numeroMatch[0] : undefined,
            postalCode: String((aluno as any).cep ?? '').replace(/\D/g, '') || undefined,
          }),
        });

        if (!custOk || !custData?.id) {
          console.error('matricula-pagamento-criar: erro ao criar cliente Asaas', custData);
          return json({ ok: false, erro: custData?.errors?.[0]?.description || 'Não foi possível gerar o boleto. Tente novamente.' }, 400);
        }

        customerId = String(custData.id);
        await supabase.from('alunos').update({ asaas_customer_id: customerId }).eq('id', alunoId);
      }

      // ── Datas de vencimento das 15 parcelas (1ª = hoje/data da matrícula, ──
      // as seguintes ancoradas no dia de vencimento escolhido) -- mesma regra
      // de src/lib/parcelasAluno.ts (buildInstallments) pra ficar consistente
      // com o que o CRM recalcularia se precisasse.
      const diaVencimento = Number((aluno as any).dia_vencimento) || 10;
      const dataMatriculaStr = (aluno as any).data_matricula as string | null;
      const matricula = dataMatriculaStr ? new Date(`${dataMatriculaStr}T12:00:00`) : new Date();

      const parcelas = Array.from({ length: 15 }, (_, index) => {
        const numeroParcela = index + 1;
        const dueDate = index === 0
          ? matricula
          : dateComDiaTravado(matricula.getFullYear(), matricula.getMonth() + index, diaVencimento);
        return {
          numero_parcela: numeroParcela,
          data_vencimento: formatLocalDate(dueDate),
          mes_referencia: formatLocalDate(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1)),
        };
      });

      const { data: inseridos, error: insErr } = await supabase
        .from('pagamentos')
        .insert(parcelas.map(p => ({
          aluno_id: alunoId,
          produto: 'psicanalise',
          valor: valorPlano,
          mes_referencia: p.mes_referencia,
          data_vencimento: p.data_vencimento,
          numero_parcela: p.numero_parcela,
          status: 'pendente',
          observacoes: p.numero_parcela === 1 ? 'Ato de matricula' : null,
        })))
        .select('id, numero_parcela, data_vencimento, valor');

      if (insErr || !inseridos) {
        console.error('matricula-pagamento-criar: erro ao criar parcelas', insErr);
        return json({ ok: false, erro: 'Não foi possível gerar as parcelas. Tente novamente.' }, 500);
      }

      // ── Gera o boleto de cada parcela no Asaas, em paralelo ──────────────────
      const resultados = await Promise.all(inseridos.map(async (row) => {
        const { ok, data } = await asaasFetch('/payments', {
          method: 'POST',
          body: JSON.stringify({
            customer: customerId,
            billingType: 'BOLETO',
            value: Number(row.valor),
            dueDate: row.data_vencimento,
            // "/" sai da description (achado em teste real 2026-09-04: o
            // Asaas engole caracteres especiais nesse campo, "1/15" virava
            // "115") -- "de" no lugar da barra.
            description: `Matricula PSI (parcela ${row.numero_parcela} de 15) - ${nomeCompleto || alunoId}`,
            externalReference: row.id,
          }),
        });
        return { row, ok, data };
      }));

      await Promise.all(resultados.map(async (r) => {
        if (!r.ok || !r.data?.id) {
          console.error('matricula-pagamento-criar: erro Asaas na parcela', r.row.numero_parcela, r.data);
          return;
        }
        await supabase.from('pagamentos').update({
          asaas_payment_id: String(r.data.id),
          // invoiceUrl (fatura hospedada no Asaas) mostra boleto E Pix na
          // mesma página -- prioridade sobre bankSlipUrl (só o boleto em si)
          // pro aviso de cobrança sempre ter a opção de Pix visível.
          link_pagamento_asaas: r.data.invoiceUrl ?? r.data.bankSlipUrl ?? null,
        }).eq('id', r.row.id);
      }));

      const primeira = resultados.find(r => r.row.numero_parcela === 1);
      if (!primeira?.ok || !primeira.data?.id) {
        return json({ ok: false, erro: primeira?.data?.errors?.[0]?.description || 'Não foi possível gerar o boleto. Tente novamente ou avise a equipe.' }, 400);
      }

      // Todo boleto no Asaas tem um Pix equivalente em paralelo -- usamos ele
      // pra manter a mesma UX de QR code/copia-e-cola da tela de pagamento.
      // O Pix não fica pronto instantaneamente na criação do boleto (achado
      // em teste real 2026-09-04: 1ª tentativa às vezes vem vazia, funciona
      // ao tentar de novo alguns segundos depois) -- tenta até 3x com espera
      // curta antes de desistir, em vez de devolver QR vazio pro aluno.
      let pixOk = false;
      let pixData: any = null;
      for (let tentativa = 0; tentativa < 3 && !pixOk; tentativa++) {
        if (tentativa > 0) await new Promise(r => setTimeout(r, 1500));
        const resultado = await asaasFetch(`/payments/${primeira.data.id}/pixQrCode`, { method: 'GET' });
        pixOk = resultado.ok;
        pixData = resultado.data;
      }
      if (!pixOk) {
        console.error('matricula-pagamento-criar: erro ao buscar Pix do boleto Asaas (3 tentativas)', pixData);
      }

      return json({
        ok: true,
        paymentId: primeira.data.id,
        status: 'pending',
        qrCodeBase64: pixOk ? (pixData?.encodedImage ?? null) : null,
        qrCode: pixOk ? (pixData?.payload ?? null) : null,
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
          transaction_amount: valorPlano * 12,
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

      // 15 cobranças mensais (igual ao boleto) -- end_date logo depois da 15ª
      // pra assinatura parar sozinha em vez de cobrar indefinidamente (MP
      // preapproval não tem campo "número de cobranças", só start/end_date).
      const dataAssinaturaMp = new Date();
      const dataFimAssinatura = new Date(dataAssinaturaMp.getFullYear(), dataAssinaturaMp.getMonth() + 15, dataAssinaturaMp.getDate());

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
            transaction_amount: valorPlano,
            currency_id: 'BRL',
            end_date: dataFimAssinatura.toISOString(),
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

      // ── 15 parcelas pendentes, uma por mês, ancoradas no dia da assinatura ──
      // (não tem dia de vencimento escolhido pelo aluno nesse plano, diferente
      // do boleto; 15x igual ao boleto -- só o parcelado é 12x). Nenhuma vem
      // pré-marcada como paga -- cada cobrança real que a MP mandar via
      // webhook (mp-webhook-time-comercial) consome a mais antiga pendente,
      // na ordem (ver o branch cartao_recorrente lá).
      const diaAssinatura = dataAssinaturaMp.getDate();
      const dataAssinatura = dataAssinaturaMp;
      const parcelasRecorrente = Array.from({ length: 15 }, (_, index) => {
        const dueDate = index === 0
          ? dataAssinatura
          : dateComDiaTravado(dataAssinatura.getFullYear(), dataAssinatura.getMonth() + index, diaAssinatura);
        return {
          aluno_id: alunoId,
          produto: 'psicanalise',
          valor: valorPlano,
          mes_referencia: formatLocalDate(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1)),
          data_vencimento: formatLocalDate(dueDate),
          numero_parcela: index + 1,
          status: 'pendente',
          observacoes: index === 0 ? 'Ato de matricula' : null,
        };
      });
      const { error: parcelasErr } = await supabase.from('pagamentos').insert(parcelasRecorrente);
      if (parcelasErr) {
        // Assinatura já foi ativada na MP -- não desfaz por causa disso, só
        // loga. O cron/webhook seguinte não tem uma rede de segurança pra
        // recriar essas linhas (diferente do boleto), então isso pede
        // atenção manual se acontecer.
        console.error('matricula-pagamento-criar: assinatura ativada mas falhou ao criar parcelas', alunoId, parcelasErr);
      }

      return json({ ok: true, preapprovalId: data.id, status: data.status });
    }

    return json({ ok: false, erro: 'Forma de pagamento inválida.' }, 400);
  } catch (error) {
    console.error('matricula-pagamento-criar error:', error);
    return json({ ok: false, erro: 'Erro interno. Tente novamente.' }, 500);
  }
});
