/**
 * npa-evento-publico
 * Serve os dados públicos de uma turma NPA (IDM Pelo Brasil) pro slug
 * pedido, pra página de captura — sem expor a tabela npa_eventos inteira
 * por RLS anônima (ela só tem policy de leitura pra authenticated).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: 'slug obrigatorio' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data, error } = await supabase
    .from('npa_eventos')
    .select('nome, data_evento, local, valor_ingresso, valor_material_padrao, slogan, professor_convidado, slug, ativo')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ ok: false, error: 'evento nao encontrado' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, evento: data }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
