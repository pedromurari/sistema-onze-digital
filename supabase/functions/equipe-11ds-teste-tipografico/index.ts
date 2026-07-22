import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: testa o novo modo tipografico (fundo fixo + texto centralizado)
// direto contra o servico de composicao, sem depender do dia da semana bater
// com o formato tipografico no calendario deterministico.

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
    const { data: cliente } = await supabase.from('conteudo_clientes').select('nome, cor_primaria, logo_url, fundos_fixos, estilo_visual, instagram_handle').eq('id', 'cdb9037a-2303-4155-aac6-fda9cac36f75').single();
    const fundoUrl = cliente?.fundos_fixos?.[0];
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
        headline: `Não é sobre ter todas as respostas. É sobre **perguntar** melhor.`,
        nome_exibicao: cliente.nome,
        handle: cliente.instagram_handle ?? undefined,
        estilo_visual: cliente.estilo_visual ?? 'manchete',
        cor_primaria: cliente.cor_primaria ?? undefined,
        gerar_stories: false,
      }),
    });
    if (!res.ok) throw new Error(`Compose falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { feed_base64: string };
    const bytes = Uint8Array.from(atob(data.feed_base64), c => c.charCodeAt(0));

    const path = 'testes/teste-tipografico-novo.png';
    await supabase.storage.from('equipe-11ds-criativos').upload(path, bytes, { contentType: 'image/png', upsert: true });
    const url = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(path).data.publicUrl;

    return new Response(JSON.stringify({ ok: true, url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
