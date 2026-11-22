/**
 * email-pixel
 * Pixel de rastreio de abertura de e-mail: devolve um GIF 1x1 transparente e
 * marca `email_envios.aberto_em`.
 *
 * POR QUE EXISTE (22/11/2026): o sistema mandava e-mail e não media abertura
 * nenhuma -- nem das campanhas de reengajamento, nem do e-mail de boas-vindas,
 * que é o único que todo lead recebe e o que carrega o link do grupo. Sem esse
 * dado não dá pra saber se a base lê o que a gente manda.
 *
 * GET /email-pixel?e=<id do email_envios>
 *
 * Sempre devolve a imagem, mesmo com id inválido ou erro no banco -- um pixel
 * quebrado aparece como ícone de imagem faltando no cliente de e-mail, o que é
 * pior que não medir.
 *
 * LIMITE IMPORTANTE: Gmail e Outlook pré-carregam imagem pelo proxy deles, e
 * o Apple Mail Privacy Protection carrega SEMPRE. Isso infla abertura pra cima.
 * Na outra ponta, quem bloqueia imagem nunca conta, o que puxa pra baixo. O
 * número serve pra comparar campanhas entre si, não como verdade absoluta.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// GIF 1x1 transparente.
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

const imagem = () =>
  new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      // Sem cache: senão o proxy do Gmail serve a mesma imagem e a segunda
      // abertura nunca chega aqui.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });

serve(async (req) => {
  try {
    const id = new URL(req.url).searchParams.get('e');
    if (!id) return imagem();

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: envio } = await admin
      .from('email_envios')
      .select('id, aberto_em, aberturas')
      .eq('id', id)
      .maybeSingle();

    if (envio) {
      const agora = new Date().toISOString();
      await admin
        .from('email_envios')
        .update({
          aberto_em: envio.aberto_em ?? agora,   // primeira abertura não se sobrescreve
          aberto_ultima: agora,
          aberturas: (envio.aberturas ?? 0) + 1,
          user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        })
        .eq('id', id);
    }
  } catch (e) {
    console.error('email-pixel:', (e as Error).message);
  }
  return imagem();
});
