import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: re-renderiza a imagem de um post existente (mesma legenda/tema,
// so troca o card visual) com o servico de composicao atual, e sobrescreve o
// arquivo no storage no MESMO caminho -- assim a URL em conteudo_posts nao
// muda, so o conteudo da imagem. Usado pra atualizar posts antigos que foram
// gerados antes de um redesign visual entrar em producao.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json() as { post_id: string; headline: string };
    if (!body.post_id || !body.headline) throw new Error('post_id e headline sao obrigatorios');

    const { data: post, error: postErr } = await supabase
      .from('conteudo_posts')
      .select('id, cliente_id, imagem_feed_url, imagem_stories_url')
      .eq('id', body.post_id)
      .single();
    if (postErr || !post) throw new Error(`Post nao encontrado: ${postErr?.message ?? body.post_id}`);

    // Sobrescrever o mesmo caminho nao basta -- os objetos do storage saem com
    // cache-control: max-age=3600, entao navegador/CDN continuam servindo o
    // arquivo antigo na mesma URL por ate 1h mesmo com o conteudo ja trocado
    // no servidor. Sobe num caminho novo (sufixo -v2) e atualiza a URL no post.
    const versionar = (url: string) => url.replace(/\.png$/, '-v2.png');

    const { data: cliente, error: clienteErr } = await supabase
      .from('conteudo_clientes')
      .select('nome, logo_url, cor_primaria, instagram_handle, estilo_visual, fundos_fixos')
      .eq('id', post.cliente_id)
      .single();
    if (clienteErr || !cliente) throw new Error(`Cliente nao encontrado: ${clienteErr?.message}`);

    const fundoUrl = cliente.fundos_fixos?.[0];
    if (!fundoUrl) throw new Error('Cliente sem fundos_fixos');

    const logoRes = cliente.logo_url ? await fetch(cliente.logo_url) : null;
    const logoBytes = logoRes ? new Uint8Array(await logoRes.arrayBuffer()) : null;

    const { data: composeConfig } = await supabase.rpc('get_equipe_11ds_composite_config');
    const composeUrl = composeConfig?.[0]?.url as string;
    const compositeSecret = composeConfig?.[0]?.secret as string;

    const res = await fetch(composeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-composite-key': compositeSecret },
      body: JSON.stringify({
        modo: 'tipografico',
        fundo_url: fundoUrl,
        logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
        logo_posicao: 'superior-centro',
        headline: body.headline,
        nome_exibicao: cliente.nome,
        handle: cliente.instagram_handle ?? undefined,
        estilo_visual: cliente.estilo_visual ?? 'manchete',
        cor_primaria: cliente.cor_primaria ?? undefined,
        gerar_stories: Boolean(post.imagem_stories_url),
      }),
    });
    if (!res.ok) throw new Error(`Compose falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { feed_base64: string; stories_base64?: string };

    const extractPath = (url: string) => url.split('/equipe-11ds-criativos/')[1];
    const novoFeedPath = versionar(extractPath(post.imagem_feed_url!));
    const feedBytes = Uint8Array.from(atob(data.feed_base64), c => c.charCodeAt(0));
    const { error: upFeedErr } = await supabase.storage.from('equipe-11ds-criativos').upload(novoFeedPath, feedBytes, { contentType: 'image/png', upsert: true });
    if (upFeedErr) throw new Error(`Falha ao subir feed: ${upFeedErr.message}`);
    const novoFeedUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(novoFeedPath).data.publicUrl;

    let novoStoriesUrl: string | null = null;
    if (post.imagem_stories_url && data.stories_base64) {
      const novoStoriesPath = versionar(extractPath(post.imagem_stories_url));
      const storiesBytes = Uint8Array.from(atob(data.stories_base64), c => c.charCodeAt(0));
      const { error: upStoriesErr } = await supabase.storage.from('equipe-11ds-criativos').upload(novoStoriesPath, storiesBytes, { contentType: 'image/png', upsert: true });
      if (!upStoriesErr) novoStoriesUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(novoStoriesPath).data.publicUrl;
    }

    await supabase.from('conteudo_posts').update({
      imagem_feed_url: novoFeedUrl,
      ...(novoStoriesUrl ? { imagem_stories_url: novoStoriesUrl } : {}),
    }).eq('id', post.id);

    // conteudo_calendario e' uma tabela auxiliar (nao a fonte da verdade) --
    // atualiza pra manter a imagem consistente la tambem, mas nunca falha a
    // troca do post por causa disso.
    try {
      await supabase.from('conteudo_calendario').update({ imagem_url: novoFeedUrl }).eq('cliente_id', post.cliente_id).eq('imagem_url', post.imagem_feed_url);
    } catch { /* tabela auxiliar, nao critico */ }

    return new Response(JSON.stringify({ ok: true, imagem_feed_url: novoFeedUrl, imagem_stories_url: novoStoriesUrl }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
