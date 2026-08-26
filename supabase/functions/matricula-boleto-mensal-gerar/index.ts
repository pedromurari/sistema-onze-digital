/**
 * matricula-boleto-mensal-gerar
 * Gera (via Mercado Pago, PRODUCAO) os boletos reais das parcelas 2-15 do
 * plano "boleto" da ficha de matrícula pública do Time Comercial (ver
 * src/pages/MatriculaTimeComercial.tsx e matricula-pagamento-criar). A 1ª
 * parcela desse plano já é cobrada via PIX na hora da matrícula
 * (matricula-pagamento-criar, forma==='boleto') -- esta function cuida só
 * das parcelas seguintes, que continuam sendo boleto bancário de verdade
 * (payment_method_id 'bolbradesco'), mas agora geradas automaticamente em
 * vez de processo manual.
 *
 * Idempotente/seguro rodar repetidamente: só processa pagamentos com
 * mp_payment_id IS NULL (ainda não gerados). Pensado pra rodar via cron
 * (net.http_post + x-cron-key, mesmo padrão de followup-vendedor-enviar) --
 * o cron.schedule() NÃO está incluído nesta migration/deploy, fica pra
 * revisão manual (ver relatório da tarefa).
 *
 * Auth: só aceita chamada com o header `x-cron-key` batendo com
 * public.get_equipe_11ds_cron_secret() (secret genérica do projeto, já
 * usada por followup-vendedor-enviar). Sem chamada anônima/pública.
 *
 * Critério de elegibilidade (ver WHERE abaixo):
 *   - alunos.origem_lead = 'time_comercial'
 *   - alunos.forma_pagamento = 'boleto'
 *   - pagamentos.numero_parcela >= 2
 *   - pagamentos.status = 'pendente'
 *   - pagamentos.mp_payment_id IS NULL           (ainda não gerado)
 *   - pagamentos.data_vencimento <= hoje + 10 dias  (gera com folga antes do
 *     lembrete de 7 dias antes do vencimento que o enviar-cobranca já manda)
 *
 * No sucesso: grava mp_payment_id e link_pagamento_mp (usado pelo
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

interface PagamentoRow {
  id: string;
  aluno_id: string;
  valor: number;
  numero_parcela: number;
  data_vencimento: string;
  alunos: {
    nome: string | null;
    email: string | null;
    cpf: string | null;
    endereco: string | null;
    cep: string | null;
    cidade_estado: string | null;
  } | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    if (!MP_ACCESS_TOKEN) {
      console.error('matricula-boleto-mensal-gerar: MP_ACCESS_TOKEN não configurado');
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

    const { data: pagamentosRaw, error: pagamentosErr } = await supabase
      .from('pagamentos')
      .select(`
        id, aluno_id, valor, numero_parcela, data_vencimento,
        alunos!inner (
          nome, email, cpf, endereco, cep, cidade_estado,
          origem_lead, forma_pagamento
        )
      `)
      .eq('status', 'pendente')
      .is('mp_payment_id', null)
      .gte('numero_parcela', 2)
      .lte('data_vencimento', limiteVencimentoStr)
      .eq('alunos.origem_lead', 'time_comercial')
      .eq('alunos.forma_pagamento', 'boleto');

    if (pagamentosErr) {
      console.error('matricula-boleto-mensal-gerar: erro ao buscar pagamentos elegíveis', pagamentosErr);
      return json({ ok: false, erro: 'Erro ao buscar parcelas elegíveis.' }, 500);
    }

    const pagamentos = (pagamentosRaw ?? []) as unknown as PagamentoRow[];
    const errors: Array<{ pagamentoId: string; erro: string }> = [];
    let generated = 0;

    for (const pagamento of pagamentos) {
      const aluno = pagamento.alunos;
      if (!aluno) {
        errors.push({ pagamentoId: pagamento.id, erro: 'aluno não encontrado' });
        continue;
      }

      try {
        const nomeCompleto = String(aluno.nome ?? '').trim();
        const [firstName, ...restName] = nomeCompleto.split(/\s+/);
        const lastName = restName.join(' ') || firstName || 'Aluno';
        const email = String(aluno.email ?? '');
        const cpfDigits = String(aluno.cpf ?? '').replace(/\D/g, '');

        const [cidadeRaw, ufRaw] = String(aluno.cidade_estado ?? '').split('/');
        const enderecoTexto = String(aluno.endereco ?? '').trim();
        const numeroMatch = enderecoTexto.match(/\d+/);

        const address = {
          zip_code: String(aluno.cep ?? '').replace(/\D/g, '') || '01310930',
          street_name: enderecoTexto || 'Não informado',
          street_number: numeroMatch ? Number(numeroMatch[0]) : 1,
          neighborhood: 'Centro',
          city: cidadeRaw?.trim() || 'São Paulo',
          federal_unit: (ufRaw?.trim() || 'SP').slice(0, 2).toUpperCase(),
        };

        const payer: Record<string, unknown> = {
          email,
          first_name: firstName || 'Aluno',
          last_name: lastName,
          ...(cpfDigits ? { identification: { type: 'CPF', number: cpfDigits } } : {}),
          address,
        };

        const idempotencyKey = crypto.randomUUID();

        const { ok, data } = await mpFetch('/v1/payments', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            payment_method_id: 'bolbradesco',
            transaction_amount: Number(pagamento.valor),
            description: `Matrícula PSI (parcela ${pagamento.numero_parcela}/15) - ${nomeCompleto || pagamento.aluno_id}`,
            external_reference: pagamento.id,
            payer,
          }),
        });

        if (!ok) {
          console.error('matricula-boleto-mensal-gerar: erro MP', pagamento.id, data);
          errors.push({ pagamentoId: pagamento.id, erro: data?.message || `MP erro ${data?.status ?? ''}` });
          continue;
        }

        const { error: updateErr } = await supabase
          .from('pagamentos')
          .update({
            mp_payment_id: String(data.id),
            link_pagamento_mp: data.transaction_details?.external_resource_url ?? null,
          })
          .eq('id', pagamento.id);

        if (updateErr) {
          console.error('matricula-boleto-mensal-gerar: erro ao gravar mp_payment_id', pagamento.id, updateErr);
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
