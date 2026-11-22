/**
 * turma-registrar
 * Endpoint publico de cadastro das turmas do Curso Gratuito (Semana do
 * Despertar), rodando dentro do proprio sistema (sem repositorio separado
 * por turma).
 *
 * Grava em DOIS lugares de proposito:
 *  - `leads` (tabela generica do CRM, canal='Lançamento') -- pra aparecer
 *    no Time Comercial/relatorios gerais, com UTM de atribuicao.
 *  - `lancamento_leads` (tabela do Kanban/boas-vindas especifico de
 *    lancamento, usada por LancamentoKanban.tsx) -- sem isso o painel de
 *    boas-vindas simplesmente nao via esses leads (bug real encontrado
 *    2026-11-11: zero boas-vindas saindo pra Turma 48 com campanha no ar).
 *
 * Boas-vindas:
 *  - WhatsApp agendado em `boas_vindas_agendados` (mesmo motor/anti-ban do
 *    funil-processar, respeita `boas_vindas_config.delay_minutos`).
 *  - E-mail disparado na hora via `email-enviar` (Resend/SendGrid/Brevo,
 *    conforme `email_config`) -- SEM n8n, o sistema de e-mail already
 *    existe aqui dentro.
 *
 * Body: { slug, nome, whatsapp, email?, cidade?, utm_source?, utm_medium?,
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // GET ?slug=48 -- so pra mostrar titulo/datas na pagina de captura antes
  // do cadastro (sem precisar de policy anon em `lancamentos`).
  if (req.method === 'GET') {
    const slugQuery = limpar(new URL(req.url).searchParams.get('slug'), 40);
    if (!slugQuery) return json({ ok: false, erro: 'slug obrigatorio' }, 400);
    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('id, nome, slogan, descricao, tema_campanha')
      .eq('slug', slugQuery)
      .eq('ativo', true)
      .maybeSingle();
    if (!lanc) return json({ ok: false, erro: 'turma nao encontrada ou inativa' }, 404);
    const { data: aulasGet } = await supabase
      .from('lancamento_aulas')
      .select('numero, titulo, inicio_em, youtube_url')
      .eq('lancamento_id', lanc.id)
      .order('numero');
    return json({ ok: true, lancamento: { nome: lanc.nome, slogan: lanc.slogan, descricao: lanc.descricao, tema_campanha: lanc.tema_campanha }, aulas: aulasGet ?? [] });
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
  const cidade = limpar(entrada.cidade, 120);
  const utm_source = limpar(entrada.utm_source, 150);
  const utm_medium = limpar(entrada.utm_medium, 150);
  const utm_campaign = limpar(entrada.utm_campaign, 150);
  const utm_content = limpar(entrada.utm_content, 150);
  const utm_term = limpar(entrada.utm_term, 150);

  if (!slug || !nome || !whatsapp) {
    return json({ ok: false, erro: 'slug, nome e whatsapp sao obrigatorios' }, 400);
  }

  const { data: lancamento, error: errLanc } = await supabase
    .from('lancamentos')
    .select('id, nome, slogan, descricao, tema_campanha')
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

  // ── 1) Lead generico (Time Comercial / relatorios) ───────────────────────
  const { data: lead, error: errLead } = await supabase
    .from('leads')
    .insert({
      nome,
      whatsapp,
      email,
      cidade,
      canal: 'Lançamento',
      origem: 'Time Comercial',
      status: 'novo',
      produto: 'lancamento',
      interesse_produto: lancamento.nome,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    })
    .select('id')
    .single();

  if (errLead || !lead) {
    console.error('turma-registrar: falha ao gravar lead', errLead);
    return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
  }

  // ── 2) lancamento_leads (Kanban + boas-vindas especificos de lancamento) ──
  const { data: colunaPlanilha } = await supabase
    .from('kanban_colunas')
    .select('id')
    .eq('lancamento_id', lancamento.id)
    .eq('nome', 'Planilha')
    .maybeSingle();

  await supabase.from('lancamento_leads').insert({
    lancamento_id: lancamento.id,
    nome, email, whatsapp, cidade,
    fase: colunaPlanilha?.id ?? null,
    data_entrada: new Date().toISOString(),
  });

  // ── 3) Boas-vindas: WhatsApp (fila) + e-mail (na hora) ───────────────────
  const { data: bvConfig } = await supabase
    .from('boas_vindas_config')
    .select('wpp_ativo, wpp_mensagem, email_ativo, email_assunto, email_corpo, delay_minutos')
    .eq('funnel_name', lancamento.nome)
    .eq('ativo', true)
    .maybeSingle();

  if (bvConfig?.wpp_ativo && bvConfig.wpp_mensagem && whatsapp) {
    const delay = bvConfig.delay_minutos ?? 0;
    const agendadoPara = new Date(Date.now() + delay * 60 * 1000).toISOString();
    const mensagem = bvConfig.wpp_mensagem.replace(/\{\{nome\}\}/g, nome).replace(/\{\{lancamento\}\}/g, lancamento.nome);
    await supabase.from('boas_vindas_agendados').insert({
      lancamento_id: lancamento.id,
      lead_id: lead.id,
      lead_tabela: 'lancamento_leads',
      funnel_name: lancamento.nome,
      nome, whatsapp, mensagem,
      agendado_para: agendadoPara,
      status: 'pendente',
    });
  }

  if (bvConfig?.email_ativo && bvConfig.email_corpo && email) {
    const html = bvConfig.email_corpo.replace(/\{\{nome\}\}/g, nome).replace(/\{\{email\}\}/g, email);
    const assunto = (bvConfig.email_assunto ?? 'Sua vaga está confirmada 🎉').replace(/\{\{nome\}\}/g, nome);
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/email-enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          to: email, to_name: nome, subject: assunto, html,
          // identifica a origem pro rastreio de abertura (email_envios)
          origem: 'boas_vindas', referencia_id: lead.id,
        }),
      });
    } catch (e) {
      console.error('turma-registrar: falha ao enviar e-mail de boas-vindas', e);
    }
  }

  return json({
    ok: true,
    leadId: lead.id,
    lancamento: { nome: lancamento.nome, slogan: lancamento.slogan, descricao: lancamento.descricao, tema_campanha: lancamento.tema_campanha },
    aulas: aulas ?? [],
  });
});
