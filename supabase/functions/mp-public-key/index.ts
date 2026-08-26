/**
 * mp-public-key
 * Endpoint trivial que devolve a public key do Mercado Pago a usar no
 * frontend. Existe só pra centralizar a distinção teste/produção num único
 * lugar. PIX/boleto/cartão parcelado liberados em produção em 2026-08-26.
 *
 * Chave pública do Mercado Pago não é dado sensível (é feita pra ser usada
 * no client, igual à publishable key do Stripe), então não precisa de auth.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const publicKey = Deno.env.get('MP_PUBLIC_KEY') ?? null;

  if (!publicKey) {
    console.error('mp-public-key: MP_PUBLIC_KEY não configurada');
    return new Response(JSON.stringify({ error: 'Chave pública não configurada.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ publicKey }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
