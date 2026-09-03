/**
 * mp-webhook-time-comercial
 * Recebe as notificações do Mercado Pago (PRODUCAO — MP_ACCESS_TOKEN) pros
 * pagamentos/assinaturas criados em matricula-pagamento-criar, e mantém
 * alunos.mp_status (e mp_preapproval_id, quando é assinatura) sincronizado
 * com o status real da MP.
 *
 * Aceita tanto o formato novo (`{ type, data: { id } }` no body) quanto o
 * formato antigo de IPN (`?topic=payment&id=...` na query string) — mesmo
 * esquema que supabase/functions/mp-webhook já usa neste repo.
 *
 * Sempre responde 200 rápido: a Mercado Pago re-tenta agressivamente em
 * qualquer resposta != 2xx.
 *
 * URL a cadastrar manualmente no painel MP (app de PRODUÇÃO) → Notifications/Webhooks:
 *   https://<project-ref>.supabase.co/functions/v1/mp-webhook-time-comercial
 *
 * Assinatura: a MP manda os headers `x-signature` (ts=...,v1=...) e
 * `x-request-id`; validamos com HMAC-SHA256 contra MP_WEBHOOK_SECRET (secret
 * gerada no painel MP → Webhooks → Assinatura secreta) seguindo o manifesto
 * oficial `id:{data.id};request-id:{x-request-id};ts:{ts};`. Notificação sem
 * assinatura válida é rejeitada com 401 antes de tocar em qualquer dado.
 *
 * A partir de 2026-08-26: quando `type === 'payment'` e o status vem
 * `approved`, além de espelhar mp_status em `alunos`, o webhook também:
 *   1. Tenta casar `external_reference` com `pagamentos.id` -- convenção
 *      usada pelos boletos mensais gerados por matricula-boleto-mensal-gerar
 *      (parcelas >=2 do plano boleto). Se achar, marca a parcela como paga e
 *      recalcula `alunos.mensalidades_pagas`.
 *   2. Se não achar como pagamento (convenção antiga: `external_reference`
 *      é o próprio `alunos.id`, usada por avista/cartão/1ª parcela PIX),
 *      cai no comportamento existente (só mp_status).
 *   Em ambos os casos, só na primeira transição pra "approved" (nunca em
 *   retry do webhook), dispara confirmação por WhatsApp (wpp-enviar) e
 *   e-mail (email-enviar) -- os dois best-effort, nunca derrubam a resposta
 *   200 do webhook em caso de falha (mesmo princípio de mp-webhook).
 *
 *   Só na convenção antiga (external_reference = alunos.id -- cobre avista/
 *   cartão/1ª parcela PIX, ou seja, o primeiro pagamento de qualquer aluno)
 *   e só na primeira transição pra "approved", também gera e envia o
 *   contrato via autentique-criar (mesmo texto/fluxo já usado em
 *   FormularioAluno.tsx -- envia o link de assinatura por WhatsApp; o
 *   e-mail ao signatário é disparado pela própria Autentique). Não repete
 *   isso nas parcelas seguintes (convenção pagamentos.id) -- o contrato só
 *   sai uma vez, no primeiro pagamento confirmado do aluno.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET');

async function assinaturaValida(req: Request, dataIdQuery: string | null): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return true; // secret não configurada -- não bloqueia (compat com ambientes antigos)

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  if (!xSignature || !xRequestId || !dataIdQuery) return false;

  const partes: Record<string, string> = {};
  for (const par of xSignature.split(',')) {
    const [k, v] = par.split('=');
    if (k && v) partes[k.trim()] = v.trim();
  }
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataIdQuery.toLowerCase()};request-id:${xRequestId};ts:${ts};`;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const assinado = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = Array.from(new Uint8Array(assinado)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return hex === v1;
}

// ── Contrato (Autentique) -- best-effort, só no primeiro pagamento aprovado ───
// Reaproveita a mesma edge function que FormularioAluno.tsx já usa -- gera o
// contrato e manda o link de assinatura por WhatsApp (a Autentique dispara o
// e-mail ao signatário por conta própria). Nunca lança -- falha aqui não pode
// derrubar a resposta 200 do webhook.
async function enviarContrato(
  supabaseUrl: string,
  serviceKey: string,
  aluno: {
    id: string; cpf: string | null; data_nascimento: string | null;
    endereco: string | null; cep: string | null; cidade_estado: string | null;
  },
): Promise<void> {
  if (!aluno.cpf || !aluno.data_nascimento || !aluno.endereco || !aluno.cidade_estado) {
    console.error('mp-webhook-time-comercial: dados insuficientes pra gerar contrato', aluno.id);
    return;
  }
  try {
    await fetch(`${supabaseUrl}/functions/v1/autentique-criar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        aluno_id: aluno.id,
        cpf: aluno.cpf,
        data_nascimento: aluno.data_nascimento,
        endereco: aluno.endereco,
        cep: aluno.cep,
        cidade_estado: aluno.cidade_estado,
      }),
    });
  } catch (e) {
    console.error('mp-webhook-time-comercial: falha ao gerar/enviar contrato', aluno.id, e);
  }
}

// ── Confirmações best-effort (WhatsApp + e-mail) ──────────────────────────────
// Nunca lança -- qualquer falha aqui só vira log, o webhook sempre responde 200
// pra MP (mesmo princípio de mp-webhook/index.ts).
async function enviarConfirmacoes(
  supabaseUrl: string,
  serviceKey: string,
  aluno: { nome: string | null; email: string | null; whatsapp: string | null; cobranca_telefone: string | null },
  valor: number,
): Promise<void> {
  const fnHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const nome = aluno.nome || 'aluno(a)';
  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const numero = aluno.cobranca_telefone || aluno.whatsapp;
  if (numero) {
    const mensagem = `✅ Pagamento confirmado, ${nome}!\n\nRecebemos o valor de *R$ ${valorFmt}* referente à sua matrícula no *Instituto Despertamente*.\n\nQualquer dúvida, é só chamar por aqui.`;
    try {
      await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
        method: 'POST', headers: fnHeaders,
        // instance_name fixo em 'disp3' (WhatsApp "Financeiro IDM") -- pedido
        // explícito do dono do produto pra esse número ser o wpp de
        // financeiro (2026-09-03), em vez de cair no rodízio por prioridade.
        body: JSON.stringify({ numero, mensagem, instance_name: 'disp3' }),
      });
    } catch (e) {
      console.error('mp-webhook-time-comercial: falha ao enviar whatsapp de confirmação', e);
    }
  }

  if (aluno.email) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/email-enviar`, {
        method: 'POST', headers: fnHeaders,
        body: JSON.stringify({
          to: aluno.email,
          to_name: nome,
          subject: 'Pagamento confirmado - Instituto Despertamente',
          html: `<h2>Pagamento aprovado! 🎉</h2><p>Oi, ${nome}!</p><p>Confirmamos o pagamento de <strong>R$ ${valorFmt}</strong> referente à sua matrícula no Instituto Despertamente.</p><p>Qualquer dúvida, é só responder este e-mail.</p>`,
        }),
      });
    } catch (e) {
      console.error('mp-webhook-time-comercial: falha ao enviar email de confirmação', e);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const dataIdQuery = url.searchParams.get('data.id') || url.searchParams.get('id');

    if (!(await assinaturaValida(req, dataIdQuery))) {
      console.error('mp-webhook-time-comercial: assinatura inválida ou ausente');
      return new Response(JSON.stringify({ ok: false, erro: 'assinatura inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let id = dataIdQuery;
    let type = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.data?.id ? String(body.data.id) : null;
      type = type || body?.type || body?.action?.split('.')?.[0];
    }

    if (!id || !type) {
      return new Response(JSON.stringify({ ok: true, aviso: 'sem id/type' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!MP_ACCESS_TOKEN) {
      console.error('mp-webhook-time-comercial: MP_ACCESS_TOKEN não configurado');
      return new Response(JSON.stringify({ ok: true, aviso: 'sem token' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (type === 'payment') {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('mp-webhook-time-comercial: erro ao consultar pagamento', data);
        return new Response(JSON.stringify({ ok: true, aviso: 'erro ao consultar pagamento' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const externalReference = data.external_reference ? String(data.external_reference) : null;
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      if (externalReference) {
        // ── 1ª tentativa: convenção nova (parcelas >=2 do plano boleto) --
        // external_reference é o id da linha em `pagamentos` ──────────────────
        const { data: pagamento } = await supabase
          .from('pagamentos')
          .select('id, aluno_id, valor, status')
          .eq('id', externalReference)
          .maybeSingle();

        if (pagamento) {
          if (data.status === 'approved') {
            const jaEstavaPago = pagamento.status === 'pago';

            await supabase.from('pagamentos').update({
              status: 'pago',
              data_pagamento: new Date().toISOString().slice(0, 10),
              mp_payment_id: String(id),
            }).eq('id', pagamento.id);

            // Recalcula mensalidades_pagas -- mesma convenção de
            // sincronizarParcelasAluno (src/lib/parcelasAluno.ts): contagem de
            // pagamentos com status='pago' para o aluno.
            const { count } = await supabase
              .from('pagamentos')
              .select('id', { count: 'exact', head: true })
              .eq('aluno_id', pagamento.aluno_id)
              .eq('status', 'pago');
            await supabase.from('alunos').update({ mensalidades_pagas: count ?? 0 }).eq('id', pagamento.aluno_id);

            if (!jaEstavaPago) {
              const { data: aluno } = await supabase
                .from('alunos')
                .select('nome, email, whatsapp, cobranca_telefone')
                .eq('id', pagamento.aluno_id)
                .maybeSingle();
              if (aluno) {
                await enviarConfirmacoes(supabaseUrl, serviceKey, aluno as any, Number(pagamento.valor)).catch((e) =>
                  console.error('mp-webhook-time-comercial: falha ao enviar confirmações (pagamento)', e));
              }
            }
          }

          return new Response(JSON.stringify({ ok: true, status: data.status }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // ── Fallback: comportamento existente -- external_reference é o
        // próprio alunos.id (avista/cartão/1ª parcela PIX) ─────────────────────
        const { data: alunoAntes } = await supabase
          .from('alunos')
          .select('nome, email, whatsapp, cobranca_telefone, mp_status, cpf, data_nascimento, endereco, cep, cidade_estado')
          .eq('id', externalReference)
          .maybeSingle();

        await supabase.from('alunos').update({ mp_status: data.status }).eq('id', externalReference);

        if (data.status === 'approved' && alunoAntes && alunoAntes.mp_status !== 'approved') {
          const valorPago = Number(data.transaction_amount ?? 0);
          await enviarConfirmacoes(supabaseUrl, serviceKey, alunoAntes as any, valorPago).catch((e) =>
            console.error('mp-webhook-time-comercial: falha ao enviar confirmações (aluno)', e));
          await enviarContrato(supabaseUrl, serviceKey, { id: externalReference, ...alunoAntes } as any).catch((e) =>
            console.error('mp-webhook-time-comercial: falha ao enviar contrato', e));
        }
      }

      return new Response(JSON.stringify({ ok: true, status: data.status }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('mp-webhook-time-comercial: erro ao consultar preapproval', data);
        return new Response(JSON.stringify({ ok: true, aviso: 'erro ao consultar preapproval' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const alunoId = data.external_reference;
      if (alunoId) {
        await supabase.from('alunos').update({
          mp_status: data.status,
          mp_preapproval_id: data.id,
        }).eq('id', alunoId);
      }

      return new Response(JSON.stringify({ ok: true, status: data.status }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignorado: type }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('mp-webhook-time-comercial error:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
