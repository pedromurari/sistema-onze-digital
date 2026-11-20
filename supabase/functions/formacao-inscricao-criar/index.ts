/**
 * formacao-inscricao-criar
 *
 * Ficha pública das formações de preço único (ver tabela `formacao_ofertas`).
 * Primeiro produto: Despertar Sistêmico (Constelação Familiar), 20/11/2026.
 *
 * Dois passos, mesma função:
 *
 *  1. SEM `pagamento` no body → só registra/reaproveita o LEAD. É o que o
 *     formulário da landing page chama assim que a pessoa preenche nome/
 *     WhatsApp/e-mail. Pedido explícito do Pedro: o lead tem que cair no
 *     Kanban da vendedora JÁ ETIQUETADO, mesmo que a pessoa não pague —
 *     senão a Helen não tem como ir atrás de quem desistiu no meio.
 *
 *  2. COM `pagamento` → cobra no Mercado Pago e grava a inscrição.
 *     Pix devolve QR Code + copia-e-cola pra exibir na própria ficha;
 *     cartão vem do Brick (token) e aceita parcelamento até o limite da oferta.
 *
 * Conta do Mercado Pago: a INSTITUCIONAL do IDM (secret MP_ACCESS_TOKEN), a
 * mesma já usada em matrícula/workshop. NÃO usa o fluxo de split de
 * `parceiros` (aquele é pra terceiro de fora, tipo terapeuta do Divã) — a
 * divisão entre os sócios acontece no Financeiro → Sócios/DRE, como em todo
 * produto próprio.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);

  try {
    const body = await req.json();
    if (body?.website) return json({ ok: true }); // honeypot

    const slug = texto(body?.slug, 80);
    const nome = texto(body?.nome, 120);
    const email = texto(body?.email, 200).toLowerCase();
    const digitos = texto(body?.whatsapp, 30).replace(/\D/g, '');
    const whatsapp = digitos.startsWith('55') ? digitos : `55${digitos}`;
    const cpf = texto(body?.cpf, 20).replace(/\D/g, '') || null;
    const pagamento = body?.pagamento ?? null;

    if (!slug || nome.length < 2) return json({ error: 'Confira o nome.' }, 400);
    if (!/^55\d{10,11}$/.test(whatsapp)) return json({ error: 'Confira o WhatsApp com DDD.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Confira o e-mail.' }, 400);

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: oferta, error: ofertaErr } = await db
      .from('formacao_ofertas')
      .select('id, slug, nome, descricao, preco, max_parcelas, interesse_produto, vendedor_padrao')
      .eq('slug', slug)
      .eq('ativo', true)
      .maybeSingle();

    if (ofertaErr || !oferta) return json({ error: 'Formação não encontrada ou inativa.' }, 404);

    // ── Lead: reaproveita se a mesma pessoa já entrou nessa formação ──────
    // (ela volta pra ficha várias vezes antes de pagar — não pode virar 3
    // cards no Kanban da Helen).
    const whatsappFmt = `+${whatsapp}`;
    const { data: leadExistente } = await db
      .from('leads')
      .select('id')
      .eq('whatsapp', whatsappFmt)
      .eq('interesse_produto', oferta.interesse_produto)
      .maybeSingle();

    let leadId = leadExistente?.id ?? null;

    if (!leadId) {
      const { data: leadNovo, error: leadErr } = await db
        .from('leads')
        .insert({
          nome,
          email,
          whatsapp: whatsappFmt,
          // origem/canal/produto: mesma combinação que os leads do Time
          // Comercial já usam hoje, pra cair no Kanban dele sem gambiarra.
          origem: 'Time Comercial',
          canal: 'Direto',
          produto: 'time_comercial',
          interesse_produto: oferta.interesse_produto,
          vendedor: oferta.vendedor_padrao,
          status: 'novo',
          valor_potencial: oferta.preco,
          observacoes: `Veio da página de vendas (${oferta.nome}).`,
        })
        .select('id')
        .single();
      if (leadErr) console.error('formacao-inscricao-criar: erro ao criar lead', leadErr);
      leadId = leadNovo?.id ?? null;
    }

    // Passo 1: só o lead (formulário da landing page).
    if (!pagamento?.metodo) {
      return json({ ok: true, lead_id: leadId, oferta: { nome: oferta.nome, preco: oferta.preco } });
    }

    // ── Passo 2: cobrança ────────────────────────────────────────────────
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) return json({ error: 'Pagamento temporariamente indisponível.' }, 503);

    const metodo = pagamento.metodo === 'pix' ? 'pix' : 'cartao';
    const parcelas = metodo === 'cartao'
      ? Math.min(Number(pagamento.installments ?? 1) || 1, oferta.max_parcelas)
      : 1;

    const [primeiro, ...resto] = nome.split(' ');
    const sobrenome = resto.join(' ') || primeiro;

    const mpPayload: Record<string, unknown> = {
      transaction_amount: Number(oferta.preco),
      description: oferta.nome,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/formacao-pagamento-webhook`,
      payer: {
        email,
        first_name: primeiro,
        last_name: sobrenome,
        ...(cpf ? { identification: { type: 'CPF', number: cpf } } : {}),
      },
      metadata: { oferta_slug: oferta.slug, lead_id: leadId },
    };

    if (metodo === 'pix') {
      mpPayload.payment_method_id = 'pix';
    } else {
      if (!pagamento.token) return json({ error: 'Dados do cartão ausentes.' }, 400);
      mpPayload.token = pagamento.token;
      mpPayload.payment_method_id = pagamento.payment_method_id;
      mpPayload.installments = parcelas;
      if (pagamento.issuer_id) mpPayload.issuer_id = pagamento.issuer_id;
    }

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(mpPayload),
    });
    const mp = await mpRes.json();

    if (!mpRes.ok) {
      console.error('formacao-inscricao-criar: erro Mercado Pago', mp);
      return json({ error: mp?.message || 'Erro ao processar o pagamento.' }, 400);
    }

    // Cartão recusado volta com HTTP 200 e status 'rejected' -- não é erro de
    // API, é resultado válido do pagamento (mesmo tratamento do checkout do Divã).
    const statusMap: Record<string, string> = {
      approved: 'aprovado',
      pending: 'pendente',
      in_process: 'pendente',
      rejected: 'recusado',
    };
    const status = statusMap[mp.status] ?? 'pendente';

    await db.from('formacao_inscricoes').insert({
      oferta_id: oferta.id,
      lead_id: leadId,
      nome,
      email,
      whatsapp: whatsappFmt,
      cpf,
      valor: Number(oferta.preco),
      metodo,
      parcelas: metodo === 'cartao' ? parcelas : null,
      mp_payment_id: String(mp.id),
      status,
    });

    if (status === 'aprovado' && leadId) {
      await db.from('leads')
        .update({ status: 'fechado', matriculado_em: new Date().toISOString(), ultima_atividade: new Date().toISOString() })
        .eq('id', leadId);
    }

    return json({
      status,
      status_detail: mp.status_detail ?? null,
      mp_payment_id: mp.id,
      qr_code: mp.point_of_interaction?.transaction_data?.qr_code ?? null,
      qr_code_base64: mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
    });
  } catch (error) {
    console.error('formacao-inscricao-criar:', error);
    return json({ error: 'Erro interno: ' + (error as Error).message }, 500);
  }
});
