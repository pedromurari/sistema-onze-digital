import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type ExecResultado = {
  resposta: string;
  gerar_imagem: boolean;
  prompt_imagem?: string;
  tema?: string;
  legenda?: string;
};

type ClienteContexto = { nome: string; nicho?: string | null; tom_de_voz?: string | null; cta_padrao?: string | null };

async function interpretarOrdem(openaiKey: string, cargo: string, tipo: string, ordemTexto: string, cliente?: ClienteContexto): Promise<ExecResultado> {
  const systemPrompt = [
    `Voce e um agente de IA que trabalha no time "${cargo}" da agencia 11 Digital Strategy.`,
    `Responda sempre em portugues do Brasil, em tom profissional e direto.`,
    tipo === 'post_cliente'
      ? [
          `A ordem e para criar um post de rede social para o cliente "${cliente?.nome ?? ''}".`,
          cliente?.nicho ? `Nicho do cliente: ${cliente.nicho}.` : '',
          cliente?.tom_de_voz ? `Tom de voz do cliente: ${cliente.tom_de_voz}.` : '',
          cliente?.cta_padrao ? `Encerre a legenda com uma variacao deste CTA padrao do cliente: "${cliente.cta_padrao}".` : '',
          `Gere um tema curto e uma legenda pronta para publicar.`,
        ].filter(Boolean).join(' ')
      : `A ordem e uma tarefa avulsa (ex: foto de capa de grupo, criativo de anuncio, imagem promocional).`,
    `Decida se a tarefa precisa de uma imagem gerada. Se precisar, escreva um prompt de imagem em ingles, detalhado, para o DALL-E.`,
    `Responda SOMENTE com um JSON no formato: {"resposta": string, "gerar_imagem": boolean, "prompt_imagem"?: string, "tema"?: string, "legenda"?: string}`,
  ].join(' ');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ordemTexto },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI nao retornou conteudo');
  return JSON.parse(raw) as ExecResultado;
}

async function gerarImagem(openaiKey: string, prompt: string): Promise<Uint8Array> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json() as { data: { b64_json: string }[] };
  const b64 = data.data[0]?.b64_json;
  if (!b64) throw new Error('DALL-E nao retornou imagem');

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth: Bearer JWT valido de usuario logado (chamada do painel) ou x-cron-key
  // (chamada interna do equipe-11ds-diario). O secret nao fica em nenhuma variavel
  // de ambiente/codigo — e' lido do Supabase Vault. O Bearer e' validado de verdade
  // contra o Supabase Auth (nao basta so comecar com "Bearer ").
  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  let authorized = false;
  if (cronKeyHeader) {
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    authorized = Boolean(cronSecret) && cronKeyHeader === cronSecret;
  }
  if (!authorized && authHeader.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    authorized = Boolean(user);
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let tarefaId = '';
  let agenteId = '';

  try {
    const body = await req.json() as { tarefa_id: string };
    tarefaId = body.tarefa_id;
    if (!tarefaId) {
      return new Response(JSON.stringify({ ok: false, error: 'tarefa_id e obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas')
      .select('id, agente_id, tipo, cliente_id, ordem_texto')
      .eq('id', tarefaId)
      .single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteId = tarefa.agente_id;

    const { data: agente, error: agenteErr } = await supabase
      .from('equipe_11ds_agentes')
      .select('id, nome, cargo')
      .eq('id', agenteId)
      .single();
    if (agenteErr || !agente) throw new Error(`Agente nao encontrado: ${agenteErr?.message ?? agenteId}`);

    let cliente: ClienteContexto | undefined;
    if (tarefa.tipo === 'post_cliente' && tarefa.cliente_id) {
      const { data } = await supabase.from('conteudo_clientes').select('nome, nicho, tom_de_voz, cta_padrao').eq('id', tarefa.cliente_id).single();
      cliente = data ?? undefined;
    }

    const statusTexto = tarefa.tipo === 'post_cliente'
      ? `Criando post para ${cliente?.nome ?? 'cliente'}...`
      : `${tarefa.ordem_texto.slice(0, 60)}${tarefa.ordem_texto.length > 60 ? '...' : ''}`;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: statusTexto, updated_at: new Date().toISOString() }).eq('id', agenteId);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    const resultado = await interpretarOrdem(openaiKey, agente.cargo ?? 'Posts & Criativos', tarefa.tipo, tarefa.ordem_texto, cliente);

    const anexos: { tipo: string; url: string }[] = [];
    if (resultado.gerar_imagem && resultado.prompt_imagem) {
      const bytes = await gerarImagem(openaiKey, resultado.prompt_imagem);
      const storagePath = `${tarefaId}.png`;
      const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
      if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);
      const { data: { publicUrl } } = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePath);
      anexos.push({ tipo: 'imagem', url: publicUrl });
    }

    let conteudoPostId: string | null = null;
    if (tarefa.tipo === 'post_cliente' && tarefa.cliente_id) {
      const { data: post, error: postErr } = await supabase
        .from('conteudo_posts')
        .insert({
          cliente_id: tarefa.cliente_id,
          tema: resultado.tema ?? null,
          tema_fonte: 'equipe_11ds',
          legenda: resultado.legenda ?? resultado.resposta,
          imagem_feed_url: anexos[0]?.url ?? null,
          status: 'rascunho',
        })
        .select('id')
        .single();
      if (postErr) throw new Error(`Falha ao criar post em conteudo_posts: ${postErr.message}`);
      conteudoPostId = post.id;
    }

    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido',
      resposta_texto: resultado.resposta,
      anexos,
      conteudo_post_id: conteudoPostId,
      concluido_em: new Date().toISOString(),
    }).eq('id', tarefaId);

    await supabase.from('equipe_11ds_agentes').update({ status: 'livre', status_texto: null, updated_at: new Date().toISOString() }).eq('id', agenteId);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
    }
    if (agenteId) {
      await supabase.from('equipe_11ds_agentes').update({ status: 'erro', status_texto: 'Deu erro na ultima tarefa', updated_at: new Date().toISOString() }).eq('id', agenteId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
