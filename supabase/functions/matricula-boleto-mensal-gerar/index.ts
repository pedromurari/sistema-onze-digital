/**
 * matricula-boleto-mensal-gerar
 * Rede de segurança: gera (via Asaas, PRODUCAO) qualquer boleto do plano
 * "boleto" da matrícula que não tenha sido criado ainda. Desde 2026-09-03, as
 * parcelas já são geradas de uma vez direto em matricula-pagamento-criar, na
 * hora da matrícula -- esta function só entra em ação se alguma parcela falhar
 * naquele momento (timeout, erro pontual do Asaas, etc.), pra não deixar o
 * aluno sem boleto de forma silenciosa.
 *
 * ── Escopo (2026-09-08) ──────────────────────────────────────────────────────
 * `balanco_config.asaas_novos_ativo = false` (padrão): só o fluxo do Time
 * Comercial, como sempre. Quando `true`: passa a cobrir alunos de QUALQUER
 * origem, mas só os com `data_matricula >= inicio_operacao_fiscal` -- os alunos
 * atuais continuam na Voomp por construção. A parcela nº
 * `parcela_voomp_extensao` (padrão 2) é paga pela empresa na Voomp por fora:
 * aqui ela só recebe `conta_recebimento = 'voomp'` e não gera boleto.
 * Valor e nº de parcelas saem de `pagamentos.valor` / `total_mensalidades` --
 * nada hardcoded.
 *
 * Cliente Asaas: criado uma única vez por aluno e reaproveitado -- id salvo
 * em alunos.asaas_customer_id.
 *
 * Idempotente/seguro rodar repetidamente: só processa pagamentos com
 * asaas_payment_id IS NULL (ainda não gerados). Já vem com cron agendado
 * (matricula-boleto-mensal-gerar-cron, 12h/18h -- ver migrations).
 *
 * Auth: só aceita chamada com o header `x-cron-key` batendo com
 * public.get_equipe_11ds_cron_secret() (secret genérica do projeto, já
 * usada por followup-vendedor-enviar). Sem chamada anônima/pública.
 *
 * Critério de elegibilidade (ver WHERE abaixo):
 *   - alunos.origem_lead = 'time_comercial'
 *   - alunos.forma_pagamento = 'boleto'
 *   - pagamentos.status = 'pendente'
 *   - pagamentos.asaas_payment_id IS NULL          (ainda não gerado)
 *   - pagamentos.data_vencimento <= hoje + 10 dias  (gera com folga antes do
 *     lembrete de 7 dias antes do vencimento que o enviar-cobranca já manda)
 *
 * No sucesso: grava asaas_payment_id e link_pagamento_asaas (usado pelo
 * get_alunos_para_cobranca / enviar-cobranca pra achar o link do boleto).
 * Falha em uma linha não aborta o lote -- mesmo princípio de resiliência do
 * disparo-runner/enviar-cobranca.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;
const ASAAS_API = 'https://api.asaas.com/v3';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

interface PagamentoRow {
  id: string;
  aluno_id: string;
  valor: number;
  numero_parcela: number;
  data_vencimento: string;
  total_mensalidades: number | null;
  conta_recebimento: string | null;
  alunos: {
    nome: string | null;
    email: string | null;
    cpf: string | null;
    endereco: string | null;
    cep: string | null;
    cidade_estado: string | null;
    asaas_customer_id: string | null;
    origem_lead: string | null;
    data_matricula: string | null;
  } | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    if (!ASAAS_API_KEY) {
      console.error('matricula-boleto-mensal-gerar: ASAAS_API_KEY não configurado');
      return json({ ok: false, erro: 'Pagamento indisponível no momento.' }, 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Auth: só cron (ou chamada manual com o mesmo header) ──────────────────
    const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    const isCron = !!cronSecret && cronKeyHeader === cronSecret;
    if (!isCron) {
      return json({ ok: false, erro: 'Unauthorized' }, 401);
    }

    const limiteVencimento = new Date();
    limiteVencimento.setDate(limiteVencimento.getDate() + 10);
    const limiteVencimentoStr = limiteVencimento.toISOString().slice(0, 10);

    // ── Config: trava do "Asaas para alunos novos" + parcela da Voomp ─────────
    // Decisão do dono do produto (2026-09-08): alunos ATUAIS continuam na Voomp;
    // só os NOVOS (data_matricula >= inicio_operacao_fiscal) vão pro Asaas. A
    // parcela da extensão Anhanguera é paga pela empresa na Voomp -- aqui ela
    // só é marcada (conta_recebimento='voomp') e não gera boleto.
    const { data: cfg } = await supabase
      .from('balanco_config')
      .select('inicio_operacao_fiscal, asaas_novos_ativo, parcela_voomp_extensao')
      .eq('id', 'onze_digital')
      .maybeSingle();
    const asaasNovosAtivo = cfg?.asaas_novos_ativo === true;
    const inicioOperacaoFiscal = cfg?.inicio_operacao_fiscal ?? '2026-09-01';
    const parcelaVoomp = Number(cfg?.parcela_voomp_extensao ?? 2);

    let query = supabase
      .from('pagamentos')
      .select(`
        id, aluno_id, valor, numero_parcela, data_vencimento, total_mensalidades,
        conta_recebimento,
        alunos!inner (
          nome, email, cpf, endereco, cep, cidade_estado, asaas_customer_id,
          origem_lead, forma_pagamento, data_matricula
        )
      `)
      .eq('status', 'pendente')
      .is('asaas_payment_id', null)
      .lte('data_vencimento', limiteVencimentoStr)
      .eq('alunos.forma_pagamento', 'boleto');

    if (asaasNovosAtivo) {
      // Qualquer origem, mas só matrículas a partir do corte -- os ~136 alunos
      // atuais ficam de fora por construção.
      query = query.gte('alunos.data_matricula', inicioOperacaoFiscal);
    } else {
      // Comportamento atual: só o fluxo do Time Comercial.
      query = query.eq('alunos.origem_lead', 'time_comercial');
    }

    const { data: pagamentosRaw, error: pagamentosErr } = await query;

    if (pagamentosErr) {
      console.error('matricula-boleto-mensal-gerar: erro ao buscar pagamentos elegíveis', pagamentosErr);
      return json({ ok: false, erro: 'Erro ao buscar parcelas elegíveis.' }, 500);
    }

    const pagamentos = (pagamentosRaw ?? []) as unknown as PagamentoRow[];
    const errors: Array<{ pagamentoId: string; erro: string }> = [];
    let generated = 0;

    // Cache de customer_id por aluno dentro desta execução -- evita criar o
    // mesmo cliente Asaas duas vezes se o lote tiver mais de uma parcela do
    // mesmo aluno (não deveria acontecer dado o filtro de vencimento, mas
    // custa nada ser resiliente).
    const customerCache = new Map<string, string>();

    for (const pagamento of pagamentos) {
      const aluno = pagamento.alunos;
      if (!aluno) {
        errors.push({ pagamentoId: pagamento.id, erro: 'aluno não encontrado' });
        continue;
      }

      // A parcela da extensão universitária é paga pela empresa na Voomp, por
      // fora. Não gera boleto Asaas -- só marca a conta uma vez.
      if (asaasNovosAtivo && pagamento.numero_parcela === parcelaVoomp) {
        if (pagamento.conta_recebimento !== 'voomp') {
          await supabase.from('pagamentos')
            .update({ conta_recebimento: 'voomp' })
            .eq('id', pagamento.id);
        }
        continue;
      }

      try {
        // ── Cliente Asaas: reaproveita se já existe, cria se não ────────────
        let customerId = aluno.asaas_customer_id || customerCache.get(pagamento.aluno_id) || null;

        if (!customerId) {
          const cpfDigits = String(aluno.cpf ?? '').replace(/\D/g, '');
          if (!cpfDigits) {
            errors.push({ pagamentoId: pagamento.id, erro: 'CPF ausente -- não é possível criar cliente Asaas' });
            continue;
          }

          const enderecoTexto = String(aluno.endereco ?? '').trim();
          const numeroMatch = enderecoTexto.match(/\d+/);

          const { ok: custOk, data: custData } = await asaasFetch('/customers', {
            method: 'POST',
            body: JSON.stringify({
              name: String(aluno.nome ?? 'Aluno').trim() || 'Aluno',
              cpfCnpj: cpfDigits,
              email: aluno.email || undefined,
              address: enderecoTexto || undefined,
              addressNumber: numeroMatch ? numeroMatch[0] : undefined,
              postalCode: String(aluno.cep ?? '').replace(/\D/g, '') || undefined,
            }),
          });

          if (!custOk || !custData?.id) {
            console.error('matricula-boleto-mensal-gerar: erro ao criar cliente Asaas', pagamento.id, custData);
            errors.push({ pagamentoId: pagamento.id, erro: custData?.errors?.[0]?.description || 'Não foi possível criar o cliente no Asaas.' });
            continue;
          }

          customerId = String(custData.id);
          customerCache.set(pagamento.aluno_id, customerId);

          const { error: custUpdateErr } = await supabase
            .from('alunos')
            .update({ asaas_customer_id: customerId })
            .eq('id', pagamento.aluno_id);
          if (custUpdateErr) {
            console.error('matricula-boleto-mensal-gerar: erro ao gravar asaas_customer_id', pagamento.aluno_id, custUpdateErr);
          }
        }

        // ── Cobrança (boleto) da parcela ─────────────────────────────────────
        const { ok, data } = await asaasFetch('/payments', {
          method: 'POST',
          body: JSON.stringify({
            customer: customerId,
            billingType: 'BOLETO',
            value: Number(pagamento.valor),
            dueDate: pagamento.data_vencimento,
            // "/" e acentos saem estranhos na description do Asaas (achado em
            // teste real 2026-09-04, "1/15" virava "115") -- texto simples.
            description: `Matricula PSI (parcela ${pagamento.numero_parcela} de ${pagamento.total_mensalidades ?? 15}) - ${aluno.nome ?? pagamento.aluno_id}`,
            externalReference: pagamento.id,
          }),
        });

        if (!ok || !data?.id) {
          console.error('matricula-boleto-mensal-gerar: erro Asaas', pagamento.id, data);
          errors.push({ pagamentoId: pagamento.id, erro: data?.errors?.[0]?.description || `Asaas erro ${data?.status ?? ''}` });
          continue;
        }

        const { error: updateErr } = await supabase
          .from('pagamentos')
          .update({
            asaas_payment_id: String(data.id),
            // invoiceUrl mostra boleto E Pix na mesma página -- prioridade
            // sobre bankSlipUrl, mesmo critério de matricula-pagamento-criar.
            link_pagamento_asaas: data.invoiceUrl ?? data.bankSlipUrl ?? null,
          })
          .eq('id', pagamento.id);

        if (updateErr) {
          console.error('matricula-boleto-mensal-gerar: erro ao gravar asaas_payment_id', pagamento.id, updateErr);
          errors.push({ pagamentoId: pagamento.id, erro: `boleto gerado mas falhou ao salvar: ${updateErr.message}` });
          continue;
        }

        generated += 1;
      } catch (e) {
        console.error('matricula-boleto-mensal-gerar: falha inesperada na parcela', pagamento.id, e);
        errors.push({ pagamentoId: pagamento.id, erro: (e as Error).message ?? 'erro desconhecido' });
      }
    }

    return json({ ok: true, processed: pagamentos.length, generated, errors });
  } catch (error) {
    console.error('matricula-boleto-mensal-gerar error:', error);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
