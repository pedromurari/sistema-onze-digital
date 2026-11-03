/**
 * turma-registrar
 * Endpoint publico de cadastro das turmas do Curso Gratuito (Semana do
 * Despertar), agora dentro do proprio sistema -- sem repositorio separado
 * por turma. So cria o lead; o funil/automacao de boas-vindas e disparo
 * de WhatsApp continuam sendo o motor generico ja configurado pelo
 * Wizard de Lancamento (funnel_configs/funnel_messages/funil-processar).
 *
 * Body: { slug, nome, whatsapp, email?, utm_source?, utm_medium?,
 *         utm_campaign?, utm_content?, utm_term?, device? }
 * Resposta: { ok, leadId, lancamento: { nome, slogan }, aulas: [...] }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const limpar = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) || null : null;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabaseBase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // GET ?slug=48 -- so pra mostrar titulo/datas na pagina de captura antes
  // do cadastro (sem precisar de policy anon em `lancamentos`).
  if (req.method === 'GET') {
    const slugQuery = limpar(new URL(req.url).searchParams.get('slug'), 40);
    if (!slugQuery) return json({ ok: false, erro: 'slug obrigatorio' }, 400);
    const { data: lanc } = await supabaseBase
      .from('lancamentos')
      .select('id, nome, slogan')
      .eq('slug', slugQuery)
      .eq('ativo', true)
      .maybeSingle();
    if (!lanc) return json({ ok: false, erro: 'turma nao encontrada ou inativa' }, 404);
    const { data: aulasGet } = await supabaseBase
      .from('lancamento_aulas')
      .select('numero, titulo, inicio_em, youtube_url')
      .eq('lancamento_id', lanc.id)
      .order('numero');
    return json({ ok: true, lancamento: { nome: lanc.nome, slogan: lanc.slogan }, aulas: aulasGet ?? [] });
  }

  if (req.method !== 'POST') return json({ ok: false, erro: 'use GET ou POST' }, 405);

  let entrada: Record<string, unknown>;
  try {
    entrada = await req.json();
  } catch {
    return json({ ok: false, erro: 'corpo invalido: esperado JSON' }, 400);
  }

  const slug = limpar(entrada.slug, 40);
  const nome = limpar(entrada.nome, 120);
  const whatsapp = limpar(entrada.whatsapp, 30);
  const email = limpar(entrada.email, 200);

  if (!slug || !nome || !whatsapp) {
    return json({ ok: false, erro: 'slug, nome e whatsapp sao obrigatorios' }, 400);
  }

  const supabase = supabaseBase;

  const { data: lancamento, error: errLanc } = await supabase
    .from('lancamentos')
    .select('id, nome, slogan, grupo_lancamento_jid')
    .eq('slug', slug)
    .eq('ativo', true)
    .maybeSingle();

  if (errLanc || !lancamento) {
    return json({ ok: false, erro: 'turma nao encontrada ou inativa' }, 404);
  }

  const { data: aulas } = await supabase
    .from('lancamento_aulas')
    .select('numero, titulo, inicio_em, youtube_url')
    .eq('lancamento_id', lancamento.id)
    .order('numero');

  const { data: lead, error: errLead } = await supabase
    .from('leads')
    .insert({
      nome,
      whatsapp,
      email,
      canal: 'Lançamento',
      origem: 'Time Comercial',
      status: 'novo',
      produto: 'lancamento',
      interesse_produto: lancamento.nome,
    })
    .select('id')
    .single();

  if (errLead || !lead) {
    console.error('turma-registrar: falha ao gravar lead', errLead);
    return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
  }

  return json({
    ok: true,
    leadId: lead.id,
    lancamento: { nome: lancamento.nome, slogan: lancamento.slogan },
    aulas: aulas ?? [],
  });
});
