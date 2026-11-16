/**
 * mp-oauth-callback
 * Recebe o redirect do Mercado Pago apos a parceira autorizar a conexao
 * (OAuth Authorization Code), troca o "code" pelo access_token/refresh_token
 * da conta dela e salva vinculado a linha da parceira em `parceiros`.
 *
 * Query params recebidos do Mercado Pago: code, state (= parceiros.id)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback fixo -- a env SITE_URL nunca foi configurada neste projeto, e o
// fallback antigo ('https://onze-digital.vercel.app') e' um dominio que nao
// existe mais: toda parceira que conectava direto (sem erro nenhum na troca
// de token) caia numa 404 "DEPLOYMENT_NOT_FOUND" e achava que tinha dado
// errado (achado real 16/11/2026, caso da Virginia -- o token dela foi salvo
// normal, o problema era so esse redirect final).
const SITE_URL_FALLBACK = 'https://sistema.idmpsi.com.br';

function redirectComStatus(destinoBase: string, status: 'ok' | 'erro', detalhe?: string) {
  const url = new URL(destinoBase);
  url.searchParams.set('mp', status);
  if (detalhe) url.searchParams.set('mp_detalhe', detalhe);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

serve(async (req) => {
  const siteUrl = Deno.env.get('SITE_URL') ?? SITE_URL_FALLBACK;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Se o parceiro (state) for um terapeuta do Divã, manda pro painel dele em
  // vez da raiz do site -- confirmacao visual de verdade (ve a propria
  // disponibilidade/sessoes), nao so um "?mp=ok" na URL que ninguem le.
  async function destino(parceiroId: string | null): Promise<string> {
    if (!parceiroId) return siteUrl;
    const { data } = await supabase.from('diva_terapeutas').select('id').eq('parceiro_id', parceiroId).maybeSingle();
    return data ? `${siteUrl}/diva/terapeuta/${data.id}` : siteUrl;
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const parceiroId = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    const destinoBase = await destino(parceiroId);

    if (errorParam) return redirectComStatus(destinoBase, 'erro', errorParam);
    if (!code || !parceiroId) return redirectComStatus(destinoBase, 'erro', 'parametros_ausentes');

    const clientId = Deno.env.get('MP_CLIENT_ID');
    const clientSecret = Deno.env.get('MP_CLIENT_SECRET');
    const redirectUri = Deno.env.get('MP_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('mp-oauth-callback: MP_CLIENT_ID/MP_CLIENT_SECRET/MP_REDIRECT_URI nao configurados');
      return redirectComStatus(destinoBase, 'erro', 'app_nao_configurada');
    }

    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('mp-oauth-callback: erro ao trocar code por token', tokenData);
      return redirectComStatus(destinoBase, 'erro', 'token_invalido');
    }

    const { error: updateError } = await supabase.from('parceiros').update({
      mp_user_id: tokenData.user_id ?? null,
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token ?? null,
      mp_public_key: tokenData.public_key ?? null,
      mp_connected_at: new Date().toISOString(),
    }).eq('id', parceiroId);

    if (updateError) {
      console.error('mp-oauth-callback: erro ao salvar tokens', updateError);
      return redirectComStatus(destinoBase, 'erro', 'salvar_token');
    }

    return redirectComStatus(destinoBase, 'ok');
  } catch (error) {
    console.error('mp-oauth-callback error:', error);
    return redirectComStatus(siteUrl, 'erro', 'interno');
  }
});
