/**
 * campanha-massa-click
 * Endpoint publico (GET) usado como link de CTA em e-mails de campanhas
 * de disparo em massa. Marca o clique em campanhas_massa_destinatarios
 * (clicado_email_em, so na primeira vez) e redireciona (302) pro destino
 * real -- ex: um link wa.me que abre o WhatsApp de um vendedor com
 * mensagem pre-preenchida.
 *
 * GET ?d=<destinatario_id>&u=<url de destino, encodeURIComponent>
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const url = new URL(req.url);
  const destinatarioId = url.searchParams.get('d');
  const destinoRaw = url.searchParams.get('u');

  if (!destinoRaw) return new Response('link invalido', { status: 400 });

  let destino: string;
  try {
    destino = decodeURIComponent(destinoRaw);
    const parsed = new URL(destino);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocolo invalido');
  } catch {
    return new Response('link invalido', { status: 400 });
  }

  if (destinatarioId) {
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await supabase
        .from('campanhas_massa_destinatarios')
        .update({ clicado_email_em: new Date().toISOString() })
        .eq('id', destinatarioId)
        .is('clicado_email_em', null);
    } catch (e) {
      console.error('campanha-massa-click: falha ao registrar clique', e);
    }
  }

  return new Response(null, { status: 302, headers: { Location: destino } });
});
