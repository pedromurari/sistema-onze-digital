/**
 * spedy-webhook — recebe os eventos de nota fiscal da Spedy (NFS-e) e
 * sincroniza nf_status/nf_numero/nf_emitida_em na parcela correspondente.
 *
 * A Spedy não assina a entrega (sem HMAC/secret documentado) e não permite
 * configurar headers customizados no cadastro do webhook -- então a
 * autenticação é um token aleatório na própria URL, mesmo padrão já usado
 * em aulas-aviso-meet (cron_segredos_internos), só que aqui via path em vez
 * de header porque quem bate aqui é a Spedy, não um cron nosso.
 *
 * URL cadastrada na Spedy: /spedy-webhook/<SPEDY_WEBHOOK_TOKEN>
 *
 * Vínculo nota -> parcela: data.order.transactionId == pagamentos.asaas_invoice_number
 * (achado 2026-10-29 testando com nota real: a Spedy NÃO manda o
 * asaas_payment_id, pay_xxx -- manda o invoiceNumber numérico do Asaas,
 * ex "940749522". Confirmado batendo a nota da Samia contra GET /v3/payments
 * no Asaas: invoiceNumber bate, id não.)
 *
 * Eventos tratados: invoice.authorized, invoice.rejected, invoice.canceled.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_TOKEN = Deno.env.get('SPEDY_WEBHOOK_TOKEN')!;

const EVENT_TO_STATUS: Record<string, string> = {
  'invoice.authorized': 'emitida',
  'invoice.rejected': 'erro',
  'invoice.canceled': 'cancelada',
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.pathname.split('/').filter(Boolean).pop();

    if (token !== WEBHOOK_TOKEN) {
      return new Response('not found', { status: 404 });
    }

    const body = await req.json();
    const event: string = body?.event ?? '';
    const data = body?.data ?? {};

    // DEBUG TEMPORARIO (30/10/2026): nf_link nunca era preenchido -- o webhook
    // so grava nf_status/nf_numero/nf_emitida_em, nunca o PDF. Logando o body
    // cru do proximo invoice.authorized real pra achar o nome certo do campo
    // do PDF antes de gravar qualquer coisa errada. Remover depois de achar.
    if (event === 'invoice.authorized') {
      console.log('spedy-webhook DEBUG payload invoice.authorized:', JSON.stringify(body));
    }

    const novoStatus = EVENT_TO_STATUS[event];
    if (!novoStatus) {
      // Evento que não tratamos (ex: contingency) -- só confirma recebimento.
      return new Response(JSON.stringify({ ok: true, ignorado: event }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const invoiceNumber: string | null = data?.order?.transactionId ? String(data.order.transactionId) : null;
    if (!invoiceNumber) {
      console.warn('spedy-webhook: payload sem order.transactionId', JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true, aviso: 'sem transactionId' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: updated, error } = await supabase
      .from('pagamentos')
      .update({
        nf_status: novoStatus,
        nf_numero: data?.number != null ? String(data.number) : null,
        nf_emitida_em: data?.authorization?.date ?? data?.issuedOn ?? null,
      })
      .eq('asaas_invoice_number', invoiceNumber)
      .select('id');

    if (error) {
      console.error('spedy-webhook: erro ao atualizar pagamentos', error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });
    }

    if (!updated?.length) {
      console.warn('spedy-webhook: nenhuma parcela com asaas_invoice_number =', invoiceNumber);
    }

    return new Response(JSON.stringify({ ok: true, parcelas_atualizadas: updated?.length ?? 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('spedy-webhook: erro', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200 });
  }
});
