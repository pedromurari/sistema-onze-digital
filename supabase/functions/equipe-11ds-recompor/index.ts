import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Utilitario pontual: recompoe um post ja existente (imagem crua sem logo/headline,
// gerada antes do pipeline de composicao local existir) aplicando a logo real do
// cliente + headline com fonte real via o servico externo de composicao, sem gastar
// uma nova geracao de imagem na OpenAI (reaproveita a foto ja aprovada).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-key',
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json() as { conteudo_post_id: string; headline: string };
    if (!body.conteudo_post_id || !body.headline) throw new Error('conteudo_post_id e headline sao obrigatorios');

    const { data: post, error: postErr } = await supabase
      .from('conteudo_posts')
      .select('id, cliente_id, imagem_feed_url')
      .eq('id', body.conteudo_post_id)
      .single();
    if (postErr || !post) throw new Error(`Post nao encontrado: ${postErr?.message ?? body.conteudo_post_id}`);
    if (!post.imagem_feed_url) throw new Error('Post nao tem imagem_feed_url pra recompor');

    const { data: cliente, error: clienteErr } = await supabase
      .from('conteudo_clientes')
      .select('logo_url, estilo_visual, cor_primaria')
      .eq('id', post.cliente_id)
      .single();
    if (clienteErr || !cliente) throw new Error(`Cliente nao encontrado: ${clienteErr?.message}`);

    const { data: composeConfig } = await supabase.rpc('get_equipe_11ds_composite_config');
    const composeUrl = composeConfig?.[0]?.url as string | undefined;
    const compositeSecret = composeConfig?.[0]?.secret as string | undefined;
    if (!composeUrl || !compositeSecret) throw new Error('Servico de composicao nao configurado (Vault vazio)');

    const [imgRes, logoRes] = await Promise.all([
      fetch(post.imagem_feed_url, { signal: AbortSignal.timeout(30_000) }),
      cliente.logo_url ? fetch(cliente.logo_url, { signal: AbortSignal.timeout(15_000) }) : Promise.resolve(null),
    ]);
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem original: ${imgRes.status}`);
    const imagemBase = new Uint8Array(await imgRes.arrayBuffer());
    const logoBytes = logoRes && logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : null;

    const compRes = await fetch(composeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-composite-key': compositeSecret },
      body: JSON.stringify({
        imagem_base64: bytesToBase64(imagemBase),
        logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
        logo_posicao: 'superior-esquerda',
        headline: body.headline,
        estilo_visual: cliente.estilo_visual ?? 'manchete',
        cor_primaria: cliente.cor_primaria ?? undefined,
        gerar_stories: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!compRes.ok) throw new Error(`Composicao falhou (${compRes.status}): ${(await compRes.text()).slice(0, 300)}`);
    const { feed_base64, stories_base64 } = await compRes.json() as { feed_base64: string; stories_base64?: string };

    const feedPath = `${post.id}-recomposto-feed.png`;
    const { error: uploadFeedErr } = await supabase.storage.from('equipe-11ds-criativos').upload(feedPath, base64ToBytes(feed_base64), { contentType: 'image/png', upsert: true });
    if (uploadFeedErr) throw new Error(`Upload feed falhou: ${uploadFeedErr.message}`);
    const { data: { publicUrl: feedUrl } } = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(feedPath);

    let storiesUrl: string | null = null;
    if (stories_base64) {
      const storiesPath = `${post.id}-recomposto-stories.png`;
      const { error: uploadStoriesErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storiesPath, base64ToBytes(stories_base64), { contentType: 'image/png', upsert: true });
      if (!uploadStoriesErr) {
        storiesUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storiesPath).data.publicUrl;
      }
    }

    const { error: updateErr } = await supabase
      .from('conteudo_posts')
      .update({ imagem_feed_url: feedUrl, imagem_stories_url: storiesUrl })
      .eq('id', post.id);
    if (updateErr) throw new Error(`Falha ao atualizar post: ${updateErr.message}`);

    return new Response(JSON.stringify({ ok: true, feedUrl, storiesUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
