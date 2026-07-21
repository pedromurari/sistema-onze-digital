import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartavel: gera o pequeno conjunto de fundos fixos de marca (post estatico
// "estilo tweet"), sobe pro storage e grava em conteudo_clientes.fundos_fixos.
// Roda uma vez por cliente, nao faz parte do pipeline diario.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

const PROMPTS = [
  'Abstract minimalist editorial background, deep charcoal black base with a soft glowing warm amber-gold light gradient blooming from the top-right corner, subtle fine grain texture, premium and atmospheric, generous negative space in the center and bottom, portrait orientation, no text, no people, no objects, no logos -- pure abstract atmospheric background for a psychology and self-development brand.',
  'Abstract minimalist editorial background, deep charcoal black base with a soft glowing warm amber-gold light gradient blooming from the bottom-left corner, subtle fine grain texture, premium and atmospheric, generous negative space in the center and top, portrait orientation, no text, no people, no objects, no logos -- pure abstract atmospheric background for a psychology and self-development brand.',
  'Abstract minimalist editorial background, warm deep brown-charcoal base with a soft diffused amber-gold glow centered slightly above middle, like a single warm light source in a dark room, subtle fine grain texture, premium and atmospheric, generous negative space, portrait orientation, no text, no people, no objects, no logos -- pure abstract atmospheric background for a psychology and self-development brand.',
  'Abstract minimalist editorial background, near-black charcoal base with a thin soft amber-gold horizon glow low near the bottom edge like dawn light, subtle fine grain texture, premium and atmospheric, generous negative space above, portrait orientation, no text, no people, no objects, no logos -- pure abstract atmospheric background for a psychology and self-development brand.',
];

async function gerarImagem(openaiKey: string, prompt: string): Promise<Uint8Array> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1.5', prompt, n: 1, size: '1024x1536' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Imagem OpenAI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { data: { b64_json?: string; url?: string }[] };
  const item = data.data[0];
  if (!item) throw new Error('OpenAI nao retornou imagem');
  if (item.b64_json) {
    const binary = atob(item.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (item.url) {
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    return new Uint8Array(await imgRes.arrayBuffer());
  }
  throw new Error('OpenAI nao retornou b64_json nem url');
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
    const body = await req.json().catch(() => ({})) as { cliente_id?: string; prefixo?: string };
    const clienteId = body.cliente_id;
    const prefixo = body.prefixo ?? 'idm';
    if (!clienteId) throw new Error('cliente_id e obrigatorio');

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada');

    const urls: string[] = [];
    for (let i = 0; i < PROMPTS.length; i++) {
      const bytes = await gerarImagem(openaiKey, PROMPTS[i]);
      const path = `templates/${prefixo}/fundo-${i + 1}.png`;
      const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(path, bytes, { contentType: 'image/png', upsert: true });
      if (uploadErr) throw new Error(`Falha ao subir fundo ${i + 1}: ${uploadErr.message}`);
      urls.push(supabase.storage.from('equipe-11ds-criativos').getPublicUrl(path).data.publicUrl);
    }

    const { error: updateErr } = await supabase.from('conteudo_clientes').update({ fundos_fixos: urls }).eq('id', clienteId);
    if (updateErr) throw new Error(`Falha ao gravar fundos_fixos: ${updateErr.message}`);

    return new Response(JSON.stringify({ ok: true, urls }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
