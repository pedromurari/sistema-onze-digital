/**
 * diva-registrar — recebe o formulário de interesse do painel público
 * /diva (Divã IDM), cria o lead no funil do Time Comercial (produto
 * 'diva_idm') e dispara confirmação automática no WhatsApp do cliente.
 * Clona a estrutura de workshop-registrar, sem a parte de pagamento (o
 * vendedor do Divã negocia o pacote/sessão depois, não é checkout direto).
 *
 * Body: { nome, whatsapp, email?, terapeuta_id?, mensagem?, website }
 * (website = honeypot)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const texto = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método inválido.' }, 405);

  try {
    const entrada = await req.json();
    if (entrada?.website) return json({ ok: true }); // honeypot

    const nome = texto(entrada?.nome, 120);
    const email = texto(entrada?.email, 200).toLowerCase();
    const mensagem = texto(entrada?.mensagem, 500);
    const terapeutaId = texto(entrada?.terapeuta_id, 60);
    const digitos = texto(entrada?.whatsapp, 30).replace(/\D/g, '');
    const whatsapp = digitos.startsWith('55') ? digitos : `55${digitos}`;

    if (nome.length < 2 || !/^55\d{10,11}$/.test(whatsapp) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return json({ ok: false, erro: 'Confira nome e WhatsApp com DDD.' }, 400);
    }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let terapeutaNome: string | null = null;
    if (terapeutaId) {
      const { data: terapeuta } = await db.from('diva_terapeutas')
        .select('nome').eq('id', terapeutaId).eq('status', 'aprovado').maybeSingle();
      terapeutaNome = terapeuta?.nome ?? null;
    }

    // Dedup por whatsapp dentro do produto diva_idm -- evita lead duplicado
    // se a pessoa reenviar o formulário.
    const { data: existente } = await db.from('leads')
      .select('id').eq('produto', 'diva_idm').eq('whatsapp', `+${whatsapp}`).maybeSingle();

    let leadId = existente?.id as string | undefined;
    if (!leadId) {
      const { data: lead, error: errLead } = await db.from('leads').insert({
        nome, email: email || null, whatsapp: `+${whatsapp}`, canal: 'Divã',
        origem: 'Divã IDM', produto: 'diva_idm', status: 'novo',
        interesse_produto: terapeutaNome ? `Divã IDM — ${terapeutaNome}` : 'Divã IDM — sem preferência',
        observacoes: mensagem || null,
      }).select('id').single();
      if (errLead || !lead) throw errLead ?? new Error('Lead não criado');
      leadId = lead.id;
    }

    // Confirmação automática no WhatsApp do cliente -- não bloqueia a
    // resposta se o envio falhar (lead já foi criado, o que importa).
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: JSON.stringify({
          numero: whatsapp,
          mensagem: `Oi, ${nome.split(' ')[0]}! 💙\n\nRecebemos seu pedido de sessão no Divã IDM${terapeutaNome ? ` com ${terapeutaNome}` : ''}. Nosso time vai entrar em contato em breve pra combinar tudo com você.`,
        }),
      });
    } catch (e) {
      console.warn('diva-registrar: confirmação WhatsApp falhou:', (e as Error).message);
    }

    return json({ ok: true, leadId });
  } catch (error) {
    console.error('diva-registrar:', error);
    return json({ ok: false, erro: 'Não foi possível registrar agora.' }, 500);
  }
});
