/**
 * voomp-webhook
 * Fase 2 (17/11/2026, pedido do Pedro): recebe os eventos de Assinatura que a
 * Voomp manda por produto (configurado em Produtos > Entregas > Webhook,
 * repetido em cada turma/produto -- a Voomp nao tem um webhook unico pra
 * conta inteira, e sim um por produto).
 *
 * Formato real descoberto testando com o botao de "disparar teste" (raio) de
 * cada evento, direto na Voomp (dado fake, nunca bateu com aluno de verdade):
 *   - trigger: string que identifica QUAL evento disparou. Confirmado:
 *       "contractPaid"   = Assinatura Paga (unico implementado por enquanto)
 *       "saleDueDays"    = aviso de vencimento de boleto (proprio da Voomp
 *                          pro cliente -- so informativo pra nos, nao mexe em
 *                          nada; a Voomp ja avisa o aluno sozinha, entao a
 *                          nossa cobranca automatica (enviar-cobranca) nao
 *                          precisa (e nao deve) duplicar aviso pra quem paga
 *                          por boleto Voomp -- por isso get_alunos_para_cobranca_automatica
 *                          ja exige asaas_payment_id, que aluno Voomp nao tem).
 *     Os outros 4 toggles de Assinatura (ativa/trial/aguardando/encerrada/
 *     cancelada) ainda nao foram testados -- ao aparecerem, cairao no
 *     default (so loga, nao processa) ate alguem confirmar o trigger exato
 *     e eu implementar.
 *   - sale.amount / sale.fee / sale.paid_at / sale.id: valor, taxa Voomp,
 *     data do pagamento, id da venda.
 *   - contract.id: numero do contrato (aparece como "Contrato #NNNNN" na
 *     tela de detalhe da venda, dentro da Voomp).
 *   - product.id / product.name: produto = turma na Voomp (cada turma e um
 *     produto separado).
 *   - client.document / client.name / client.email: CPF/nome/email do aluno,
 *     direto no payload -- usado pra achar o aluno em `alunos` sem precisar
 *     de outra consulta.
 *
 * Processamento automatico (so pra "contractPaid" por enquanto):
 *   1. Acha o aluno por CPF (normalizado, so digitos).
 *   2. Entre as parcelas pendentes/atrasadas desse aluno, pega a primeira
 *      (menor vencimento) cujo valor bate com sale.amount (tolerancia 2
 *      centavos).
 *   3. Marca como paga: status=pago, data_pagamento=sale.paid_at,
 *      conta_recebimento='voomp', taxa_valor=sale.fee, com observacao
 *      citando a venda/contrato da Voomp.
 *   Qualquer ambiguidade (CPF nao encontrado, mais de um aluno com o mesmo
 *   CPF, nenhuma parcela com valor batendo) NAO escreve nada em `pagamentos`
 *   -- so grava o motivo em `voomp_webhook_logs.resultado` pra revisao manual.
 *   Mesmo principio de "falha fechada" do enviar-cobranca: na duvida, nao
 *   mexe sozinho no dinheiro.
 *
 * Auth: Voomp manda o header `x-webhook-token` (o mesmo valor que aparece em
 * Configuracoes > Integracoes e Tokens > Webhook Token, fixo pra conta
 * inteira) em toda chamada -- checado abaixo. Mantido tambem o token na URL
 * (?token=...) como segunda camada, ja configurado em cada produto.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VOOMP_WEBHOOK_TOKEN = 'IEA3r8T95MoUvN8fiD5NPUcdxNP-XJzZ';
const VOOMP_X_WEBHOOK_TOKEN_HEADER = '$2y$10$dA4aGtRKOCi/rvNg0Uz/SOlimSIKPwVgSXQQ6OK13De.iZMMkMs2y';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const headerToken = req.headers.get('x-webhook-token');
  if (token !== VOOMP_WEBHOOK_TOKEN && headerToken !== VOOMP_X_WEBHOOK_TOKEN_HEADER) {
    return json({ ok: false, erro: 'Unauthorized' }, 401);
  }

  const queryParams: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (k !== 'token') queryParams[k] = v;
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) headers[k] = v;

  let payload: any = null;
  const rawBody = await req.text();
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = { _raw_nao_json: rawBody };
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: logRow, error: logErr } = await supabase
    .from('voomp_webhook_logs')
    .insert({ query_params: queryParams, headers, payload })
    .select('id')
    .single();

  if (logErr) {
    console.error('voomp-webhook: erro ao gravar log', logErr);
    return json({ ok: true });
  }

  let processado = false;
  let resultado = `evento '${payload?.trigger ?? '(sem trigger)'}' ainda nao processado automaticamente (so contractPaid esta implementado).`;

  if (payload?.trigger === 'contractPaid') {
    try {
      const cpfDigits = soDigitos(payload?.client?.document);
      const saleAmount = Number(payload?.sale?.amount);
      const saleFee = payload?.sale?.fee != null ? Number(payload.sale.fee) : null;
      const saleId = payload?.sale?.id;
      const contractId = payload?.contract?.id;
      const productId = payload?.product?.id;
      const productName = payload?.product?.name;
      const paidAtIso: string | null = payload?.sale?.paid_at ?? null;
      const dataPagamento = paidAtIso ? paidAtIso.slice(0, 10) : new Date().toISOString().slice(0, 10);

      if (!cpfDigits || !Number.isFinite(saleAmount)) {
        resultado = 'payload sem CPF ou valor valido -- nao processado.';
      } else {
        const { data: alunosEncontrados, error: alunoErr } = await supabase
          .from('alunos')
          .select('id, nome, cpf')
          .not('cpf', 'is', null);

        if (alunoErr) {
          resultado = `erro ao buscar aluno: ${alunoErr.message}`;
        } else {
          const candidatos = (alunosEncontrados ?? []).filter((a: { cpf: string | null }) => soDigitos(a.cpf) === cpfDigits);

          if (candidatos.length === 0) {
            resultado = `nenhum aluno encontrado com CPF ${cpfDigits} -- provavelmente teste (dado fake) ou aluno nao cadastrado.`;
          } else if (candidatos.length > 1) {
            resultado = `CPF ${cpfDigits} ambiguo -- ${candidatos.length} alunos encontrados. Revisar manualmente.`;
          } else {
            const aluno = candidatos[0] as { id: string; nome: string };
            const { data: parcelas, error: parcelasErr } = await supabase
              .from('pagamentos')
              .select('id, numero_parcela, valor, data_vencimento, status')
              .eq('aluno_id', aluno.id)
              .in('status', ['pendente', 'atrasado'])
              .order('data_vencimento', { ascending: true });

            if (parcelasErr) {
              resultado = `erro ao buscar parcelas de ${aluno.nome}: ${parcelasErr.message}`;
            } else {
              const parcela = (parcelas ?? []).find((p: { valor: number }) => Math.abs(Number(p.valor) - saleAmount) < 0.02) as
                | { id: string; numero_parcela: number }
                | undefined;

              if (!parcela) {
                resultado = `aluno ${aluno.nome} encontrado, mas nenhuma parcela pendente/atrasada com valor R$${saleAmount.toFixed(2)} -- revisar manualmente.`;
              } else {
                const observacaoNova = `Confirmado automaticamente via webhook Voomp em ${new Date().toISOString()} (venda Voomp #${saleId}, contrato #${contractId}, produto #${productId} - ${productName}).`;
                const { error: updateErr } = await supabase
                  .from('pagamentos')
                  .update({
                    status: 'pago',
                    data_pagamento: dataPagamento,
                    conta_recebimento: 'voomp',
                    taxa_valor: saleFee,
                    observacoes: observacaoNova,
                  })
                  .eq('id', parcela.id);

                if (updateErr) {
                  resultado = `achei a parcela ${parcela.numero_parcela} de ${aluno.nome}, mas falhou ao gravar: ${updateErr.message}`;
                } else {
                  processado = true;
                  resultado = `OK: parcela ${parcela.numero_parcela} de ${aluno.nome} marcada como paga (R$${saleAmount.toFixed(2)}, venda Voomp #${saleId}).`;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      resultado = `falha inesperada ao processar: ${(e as Error).message}`;
      console.error('voomp-webhook: falha ao processar contractPaid', e);
    }
  }

  const { error: updLogErr } = await supabase
    .from('voomp_webhook_logs')
    .update({ processado, resultado })
    .eq('id', logRow.id);
  if (updLogErr) console.error('voomp-webhook: erro ao atualizar log com resultado', updLogErr);

  return json({ ok: true });
});
