import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const texto = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const site = 'https://sistema.idmpsi.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método inválido.' }, 405);
  try {
    const entrada = await req.json();
    if (entrada?.website) return json({ ok: true }); // honeypot
    const slug = texto(entrada?.slug, 80);
    const nome = texto(entrada?.nome, 120);
    const email = texto(entrada?.email, 200).toLowerCase();
    const digitos = texto(entrada?.whatsapp, 30).replace(/\D/g, '');
    const whatsapp = digitos.startsWith('55') ? digitos : `55${digitos}`;
    if (!slug || nome.length < 2 || !/^55\d{10,11}$/.test(whatsapp) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return json({ ok: false, erro: 'Confira nome, WhatsApp com DDD e e-mail.' }, 400);
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: edicao, error: errEdicao } = await db.from('workshop_edicoes')
      .select('id,titulo,modalidade,valor_centavos,ativo').eq('slug', slug).eq('ativo', true).maybeSingle();
    if (errEdicao || !edicao) return json({ ok: false, erro: 'Workshop não disponível.' }, 404);
    if (edicao.modalidade === 'pago' && (!edicao.valor_centavos || !email)) {
      return json({ ok: false, erro: 'E-mail é obrigatório para ingresso pago.' }, 400);
    }

    let { data: inscricao, error: errConsulta } = await db.from('workshop_inscricoes')
      .select('id,status,pagamento_url').eq('workshop_id', edicao.id)
      .eq('whatsapp_normalizado', whatsapp).maybeSingle();
    if (errConsulta) throw errConsulta;
    if (!inscricao) {
      const { data: lead, error: errLead } = await db.from('leads').insert({
        nome, email: email || null, whatsapp: `+${whatsapp}`, canal: 'Workshop',
        origem: `workshop:${slug}`, produto: 'time_comercial',
        interesse_produto: 'Psicanálise Integrativa', status: 'novo',
      }).select('id').single();
      if (errLead || !lead) throw errLead ?? new Error('Lead não criado');
      const { data: criada, error: errInsert } = await db.from('workshop_inscricoes').insert({
        workshop_id: edicao.id, lead_id: lead.id, whatsapp_normalizado: whatsapp,
        status: edicao.modalidade === 'pago' ? 'pendente_pagamento' : 'inscrito',
      }).select('id,status,pagamento_url').single();
      if (errInsert || !criada) throw errInsert ?? new Error('Inscrição não criada');
      inscricao = criada;
    }
    if (edicao.modalidade === 'gratuito' || inscricao.status === 'pago' || inscricao.status === 'interessado') {
      return json({ ok: true, inscricaoId: inscricao.id, status: inscricao.status });
    }
    if (inscricao.pagamento_url) return json({ ok: true, inscricaoId: inscricao.id, status: inscricao.status, pagamentoUrl: inscricao.pagamento_url });

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) return json({ ok: false, erro: 'Pagamento temporariamente indisponível.' }, 503);
    const destino = `${site}/workshop/confirmacao/${inscricao.id}`;
    const resposta = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST', headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': inscricao.id },
      body: JSON.stringify({
        items: [{ title: `Ingresso — ${edicao.titulo}`, quantity: 1, unit_price: edicao.valor_centavos / 100, currency_id: 'BRL' }],
        payer: { name: nome, email },
        external_reference: inscricao.id,
        notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/workshop-pagamento-webhook`,
        back_urls: { success: destino, pending: destino, failure: destino },
        auto_return: 'approved',
      }),
    });
    const mp = await resposta.json();
    if (!resposta.ok || !mp.init_point) return json({ ok: false, erro: 'Não foi possível abrir o pagamento. Tente novamente.' }, 502);
    const { error: errSave } = await db.from('workshop_inscricoes').update({ pagamento_url: mp.init_point }).eq('id', inscricao.id);
    if (errSave) throw errSave;
    return json({ ok: true, inscricaoId: inscricao.id, status: 'pendente_pagamento', pagamentoUrl: mp.init_point });
  } catch (error) {
    console.error('workshop-registrar:', error);
    return json({ ok: false, erro: 'Não foi possível registrar agora.' }, 500);
  }
});
