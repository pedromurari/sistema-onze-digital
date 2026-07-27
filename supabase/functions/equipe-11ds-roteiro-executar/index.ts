import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Time "Roteiro & Video" do Modo A do Reels IDM: Estrategista de Viral ->
// Roteirista -> Gestor de Video escrevem o roteiro, mas o video so comeca a
// ser produzido (narracao/imagem/render, que tem custo real) depois que o
// usuario aprova o texto explicitamente -- nunca antes. Uma unica funcao
// cobre as 3 acoes do ciclo de vida da tarefa: escrever (corpo so com
// tarefa_id), ajustar (acao='ajustar' + feedback) e aprovar (acao='aprovar').

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type ClienteContexto = {
  nome: string;
  nicho?: string | null;
  publico_alvo?: string | null;
  tom_de_voz?: string | null;
  cta_padrao?: string | null;
  temas_evitar?: string[] | null;
};

type Bloco = {
  order: number; text: string; image_prompt: string; movement_type: string; cut_type?: string; emphasis?: string;
  emphasis_words: string[]; sfx_tag: 'teclado' | 'sino' | 'notificacao' | null;
  figure_name: string | null; figure_role: string | null;
};

type DadosRoteiro = {
  tema: string;
  gancho: string;
  angulo: string;
  justificativa?: string;
  blocos: Bloco[];
  video_script_id: string;
  feedback_anterior?: string;
  concept_word?: string | null;
};

function desembrulharJSON(raw: string): Record<string, unknown> {
  let parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const campo of Object.keys(parsed)) {
    const valor = parsed[campo];
    if (typeof valor === 'string' && valor.trim().startsWith('{') && valor.trim().endsWith('}') && valor.length > 40) {
      try {
        const aninhado = JSON.parse(valor) as Record<string, unknown>;
        if (aninhado && typeof aninhado === 'object' && Object.keys(aninhado).length > 1) { parsed = aninhado; break; }
      } catch { /* nao era JSON valido de verdade, mantem o parsed original */ }
    }
  }
  return parsed;
}

async function chamarGPT(openaiKey: string, systemPrompt: string, userPrompt: string, temperature = 0.8): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      temperature,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI chat error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI nao retornou conteudo');
  return desembrulharJSON(raw);
}

async function atualizarAgente(supabase: any, agenteId: string, status: 'trabalhando' | 'livre' | 'erro', statusTexto: string | null) {
  await supabase.from('equipe_11ds_agentes').update({ status, status_texto: statusTexto, updated_at: new Date().toISOString() }).eq('id', agenteId);
}

async function registrarMensagem(supabase: any, tarefaId: string, agenteId: string, tipo: 'mensagem' | 'alerta' | 'aprovacao', conteudo: string) {
  await supabase.from('equipe_11ds_mensagens').insert({ tarefa_id: tarefaId, agente_id: agenteId, tipo, conteudo });
}

type Agentes = { estrategista: string; roteirista: string; gestor: string };

async function buscarAgentesDoTime(supabase: any, timeId: string): Promise<Agentes> {
  const { data, error } = await supabase.from('equipe_11ds_agentes').select('id, slug').eq('time_id', timeId);
  if (error || !data) throw new Error(`Falha ao buscar agentes do time: ${error?.message}`);
  const porSlug = new Map((data as { id: string; slug: string | null }[]).map(a => [a.slug, a.id]));
  const obrigatorio = (slug: string) => {
    const id = porSlug.get(slug);
    if (!id) throw new Error(`Agente "${slug}" nao encontrado no time`);
    return id;
  };
  return { estrategista: obrigatorio('estrategista-viral'), roteirista: obrigatorio('roteirista-video'), gestor: obrigatorio('gestor-video') };
}

// ── Passo 1: Estrategista de Viral ────────────────────────────────────────────

async function passoEstrategista(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, cliente: ClienteContexto, tema: string,
): Promise<{ gancho: string; angulo: string; justificativa: string }> {
  await atualizarAgente(supabase, agentes.estrategista, 'trabalhando', `Definindo o gancho de "${tema.slice(0, 40)}"...`);

  const systemPrompt = [
    `Voce e o Estrategista de Viral do time "Roteiro & Video" da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
    `Cliente: "${cliente.nome}". Nicho: ${cliente.nicho ?? 'nao informado'}.`,
    cliente.publico_alvo ? `Publico-alvo: ${cliente.publico_alvo}.` : '',
    `Tema pedido: "${tema}".`,
    `Pense sempre em viralizar no TikTok e Reels: o gancho tem que travar o scroll nos primeiros 2-3 segundos, sem contexto institucional nem introducao lenta. Defina a estrutura de retencao completa: hook (o que trava) -> desenvolvimento (o que sustenta a atencao) -> payoff/CTA (o que fecha).`,
    `Use gatilhos psicologicos de verdade (curiosidade, contradicao, identificacao imediata, tensao nao resolvida) -- nunca um gancho generico tipo "voce ja parou pra pensar".`,
    cliente.temas_evitar?.length ? `NUNCA sugira nada relacionado a: ${cliente.temas_evitar.join(', ')} (brand safety).` : '',
    `REGRA DURA: o time so tem texto e imagem gerada/composta como ferramentas -- NUNCA dependa de depoimento real de aluno, foto/video de pessoa real, prova social que nao existe no sistema (numero de formados, avaliacao, caso especifico) ou cobertura de um evento que de fato aconteceu. O angulo tem que ser 100% produzivel do zero: ideia, reflexao, reframe, mito x verdade, mecanismo, ou POV generico.`,
    `Responda SOMENTE com um JSON: {"gancho": string (a frase/ideia exata dos primeiros segundos), "angulo": string (o angulo emocional/gatilho escolhido, 1 frase), "justificativa": string (por que isso prende no TikTok/Reels, 1 frase)}`,
  ].filter(Boolean).join(' ');

  const resultado = await chamarGPT(openaiKey, systemPrompt, 'Defina o gancho e o angulo deste vídeo.');
  const out = { gancho: String(resultado.gancho ?? ''), angulo: String(resultado.angulo ?? ''), justificativa: String(resultado.justificativa ?? '') };
  await registrarMensagem(supabase, tarefaId, agentes.estrategista, 'mensagem', `Gancho: "${out.gancho}". Ângulo: ${out.angulo}.`);
  return out;
}

// ── Passo 2: Roteirista ────────────────────────────────────────────────────────
// Mesma lista de tiques de IA banidos do time de Posts -- sem isso o fechamento
// tende a cair sempre na mesma muleta generica ("comenta aqui o que esse tema
// desperta"), que e' exatamente o clichê que a equipe já baniu em outro lugar.
const FRASES_BANIDAS_ROTEIRO = ['comenta aqui o que esse tema desperta em você', 'você já parou pra pensar', 'você sabia que', 'é importante ressaltar', 'utilizar', 'certamente'];

const SFX_TAGS_VALIDAS = new Set(['teclado', 'sino', 'notificacao']);

function validarBlocos(raw: unknown): Bloco[] {
  const lista = Array.isArray(raw) ? raw : [];
  const blocos: Bloco[] = [];
  lista.forEach((item, i) => {
    const b = item as Record<string, unknown>;
    const text = String(b.text ?? '').trim();
    const image_prompt = String(b.image_prompt ?? '').trim();
    if (!text || !image_prompt) return;

    const emphasisRaw = Array.isArray(b.emphasis_words) ? b.emphasis_words : [];
    const emphasis_words = emphasisRaw.map(w => String(w).trim()).filter(Boolean).slice(0, 2);
    const sfxRaw = typeof b.sfx_tag === 'string' ? b.sfx_tag.trim().toLowerCase() : '';
    const sfx_tag = (SFX_TAGS_VALIDAS.has(sfxRaw) ? sfxRaw : null) as Bloco['sfx_tag'];
    const figure_name = typeof b.figure_name === 'string' && b.figure_name.trim() ? b.figure_name.trim() : null;
    const figure_role = typeof b.figure_role === 'string' && b.figure_role.trim() ? b.figure_role.trim() : null;

    blocos.push({
      order: i,
      text,
      image_prompt,
      movement_type: String(b.movement_type ?? 'zoom-in'),
      cut_type: b.cut_type ? String(b.cut_type) : undefined,
      emphasis: b.emphasis ? String(b.emphasis) : undefined,
      emphasis_words,
      sfx_tag,
      figure_name,
      figure_role,
    });
  });
  return blocos;
}

// Checagem tecnica leve (sem chamada de IA nova): a palavra-conceito de fato
// aparece em algum bloco, e o SFX contextual nao virou padrao repetitivo
// (deveria ser esparso, so quando o conteudo pede).
function validarConceitoESfx(blocks: Bloco[], conceptWord: string | null): string | null {
  if (conceptWord) {
    const normalizado = conceptWord.trim().toLowerCase();
    const apareceEmAlgumBloco = blocks.some(b => b.text.toLowerCase().includes(normalizado));
    if (!apareceEmAlgumBloco) return `A palavra-conceito "${conceptWord}" nao aparece no texto de nenhum bloco.`;
  }
  const comSfx = blocks.filter(b => b.sfx_tag).length;
  if (blocks.length && comSfx > Math.ceil(blocks.length / 2)) {
    return `SFX marcado em ${comSfx} de ${blocks.length} blocos -- deveria ser esparso, so quando o conteudo do bloco realmente pede.`;
  }
  return null;
}

async function passoRoteirista(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, cliente: ClienteContexto,
  tema: string, gancho: string, angulo: string, feedbackAjuste?: string,
): Promise<{ full_narration_text: string; blocks: Bloco[]; concept_word: string | null }> {
  await atualizarAgente(supabase, agentes.roteirista, 'trabalhando', `Escrevendo o roteiro de "${tema.slice(0, 40)}"...`);

  const systemPrompt = [
    `Voce e o Roteirista do time "Roteiro & Video" da agencia 11 Digital Strategy. Responda em portugues do Brasil, exceto o campo image_prompt de cada bloco (sempre em ingles).`,
    `Cliente: "${cliente.nome}". Tom de voz: ${cliente.tom_de_voz ?? 'nao informado'}.`,
    `Tema: "${tema}". Gancho definido pelo Estrategista (use nos primeiros segundos, sem enfraquecer): "${gancho}". Ângulo: ${angulo}.`,
    `Escreva o texto INTEIRO da narracao (full_narration_text), fluido, como um vídeo curto falado em primeira pessoa -- nunca como um post escrito. Feche com um CTA curto${cliente.cta_padrao ? ` (pode variar de "${cliente.cta_padrao}")` : ''}, nunca um convite generico pra comentar.`,
    `NUNCA use estas expressões (tique de IA, já banidas pelo resto da equipe): ${FRASES_BANIDAS_ROTEIRO.join(', ')}.`,
    `Divida em 4 a 7 blocos de cena (blocks), cada um com poucas frases (uma cena de 3 a 6 segundos de fala). Cada bloco precisa ter: text (a fala exata deste trecho, tem que bater com um pedaco continuo do full_narration_text, na ordem), image_prompt, movement_type ("zoom-in", "zoom-out", "pan-left" ou "pan-right" -- varie entre os blocos, nunca repita o mesmo movimento em blocos seguidos).`,
    `PADRAO DE EDICAO PREMIUM da casa -- siga a risca:`,
    `(1) IMAGEM: image_prompt e' um termo de busca em ingles pro Wikimedia Commons -- pintura classica (ex: "oil painting woman pensive 19th century") ou foto de arquivo historico real (ex: "office typewriter vintage photograph"), NUNCA descricao de foto stock moderna nem instrucao de geracao por IA. Todos os blocos do mesmo roteiro devem manter um estilo visual coerente entre si (nao misture pintura classica com foto de jornal moderna sem motivo).`,
    `(2) FIGURA REAL: se um bloco citar uma pessoa real especifica pelo nome (cientista, autor, figura historica), preencha figure_name (nome completo) e figure_role (cargo/profissao curta, ex: "psiquiatra e psicanalista") -- nesse caso o image_prompt desse bloco busca um retrato/foto real dessa pessoa especifica. Fora esses casos, figure_name e figure_role ficam null. Nunca alegue que uma pintura/foto retrata alguem que ela nao retrata de fato.`,
    `(3) DESTAQUE: emphasis_words e' uma lista de 1 a 2 palavras EXATAS (como aparecem em text) que carregam o peso emocional daquele trecho -- escolha por significado real, nunca aleatorio.`,
    `(4) CONCEITO: em UM UNICO bloco do roteiro inteiro (normalmente o primeiro), escolha tambem concept_word: a palavra-tese de todo o gancho, a mais forte do video inteiro. Todos os outros blocos deixam concept_word ausente/null -- so pode existir 1 concept_word no roteiro todo.`,
    `(5) SFX: cada bloco pode opcionalmente levar sfx_tag -- "teclado" (cena fala de escrever/pesquisar/digitar), "sino" (momento de virada/alerta/insight) ou "notificacao" (chamar atencao de forma generica). Use com moderacao: a MAIORIA dos blocos fica sem sfx_tag (null); nunca marque em mais da metade dos blocos do roteiro.`,
    feedbackAjuste ? `AJUSTE PEDIDO (resolva isso antes de tudo, mantendo o gancho e o ângulo): ${feedbackAjuste}` : '',
    `Responda SOMENTE com um JSON: {"full_narration_text": string, "concept_word": string ou null, "blocks": [{"text": string, "image_prompt": string, "movement_type": string, "emphasis_words": string[], "sfx_tag": "teclado" ou "sino" ou "notificacao" ou null, "figure_name": string ou null, "figure_role": string ou null}]}`,
  ].filter(Boolean).join(' ');

  const resultado = await chamarGPT(openaiKey, systemPrompt, 'Escreva o roteiro deste vídeo.');
  const blocks = validarBlocos(resultado.blocks);
  if (!blocks.length) throw new Error('Roteirista nao entregou nenhum bloco de cena valido.');
  const conceptWordRaw = typeof resultado.concept_word === 'string' ? resultado.concept_word.trim() : '';
  const out = { full_narration_text: String(resultado.full_narration_text ?? ''), blocks, concept_word: conceptWordRaw || null };
  await registrarMensagem(supabase, tarefaId, agentes.roteirista, 'mensagem', `Roteiro pronto: ${out.blocks.length} cena(s). Abertura: "${out.full_narration_text.slice(0, 80)}..."`);
  return out;
}

// ── Passo 3: Gestor de Video (QA informativo, nunca bloqueia) ─────────────────

async function passoGestorQA(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, cliente: ClienteContexto, tema: string, roteiro: string,
  notaTecnica?: string | null,
): Promise<{ aprovado: boolean; motivo: string }> {
  await atualizarAgente(supabase, agentes.gestor, 'trabalhando', 'Revisando o roteiro antes de pedir sua aprovação...');
  try {
    const resultado = await chamarGPT(
      openaiKey,
      [
        `Voce e o Gestor de Video do time "Roteiro & Video" da agencia 11 Digital Strategy. Avalie o roteiro abaixo com regua alta antes de deixar esperando aprovação humana.`,
        `Cliente: "${cliente.nome}". Tom de voz: ${cliente.tom_de_voz ?? 'nao informado'}. Tema: "${tema}".`,
        `Reprove se: o roteiro depender de depoimento real/prova social inexistente/evento que de fato aconteceu, se o gancho for fraco/generico, ou se o tom destoar da marca.`,
        `Responda SOMENTE com JSON: {"aprovado": boolean, "motivo": string (1 linha, em portugues)}`,
      ].join(' '),
      `Roteiro:\n${roteiro}`,
      0.3,
    );
    // Checagem tecnica (palavra-conceito bate no texto, SFX nao virou padrao
    // repetitivo) e' deterministica, feita em codigo -- ver validarConceitoESfx.
    // Nunca bloqueia sozinha (mesmo padrao do QA de conteudo): so vira ressalva
    // visivel, a decisão final continua sendo sua.
    const aprovado = resultado.aprovado === true && !notaTecnica;
    const motivo = [String(resultado.motivo ?? ''), notaTecnica].filter(Boolean).join(' ');
    await registrarMensagem(supabase, tarefaId, agentes.gestor, aprovado ? 'aprovacao' : 'alerta',
      aprovado ? `QA aprovado. ${motivo}`.trim() : `Ressalva no QA: ${motivo}. Ficando disponível pra sua decisão mesmo assim.`);
    return { aprovado, motivo };
  } catch (e) {
    await registrarMensagem(supabase, tarefaId, agentes.gestor, 'alerta', 'QA automático indisponível; roteiro segue pra sua aprovação manual mesmo assim.');
    return { aprovado: true, motivo: 'QA automático indisponível.' };
  }
}

// ── Fluxo: escrever o roteiro do zero ─────────────────────────────────────────

async function escreverRoteiro(supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, clienteId: string, criadoPor: string | null, tema: string) {
  const { data: clienteData } = await supabase
    .from('conteudo_clientes')
    .select('nome, nicho, publico_alvo, tom_de_voz, cta_padrao, temas_evitar')
    .eq('id', clienteId)
    .single();
  const cliente: ClienteContexto = clienteData ?? { nome: 'Cliente' };

  const { gancho, angulo, justificativa } = await passoEstrategista(supabase, openaiKey, tarefaId, agentes, cliente, tema);
  const { full_narration_text, blocks, concept_word } = await passoRoteirista(supabase, openaiKey, tarefaId, agentes, cliente, tema, gancho, angulo);
  const notaTecnica = validarConceitoESfx(blocks, concept_word);
  await passoGestorQA(supabase, openaiKey, tarefaId, agentes, cliente, tema, full_narration_text, notaTecnica);

  const { data: script, error: scriptErr } = await supabase
    .from('video_scripts')
    .insert({
      title: tema.slice(0, 120) || 'Roteiro sem título',
      full_narration_text,
      blocks,
      concept_word,
      cliente_id: clienteId,
      tarefa_id: tarefaId,
      criado_por: criadoPor,
      aprovado: false,
    })
    .select('id')
    .single();
  if (scriptErr || !script) throw new Error(`Falha ao gravar video_scripts: ${scriptErr?.message}`);

  const dados: DadosRoteiro = { tema, gancho, angulo, justificativa, blocos: blocks, video_script_id: script.id, concept_word };
  await supabase.from('equipe_11ds_tarefas').update({
    status: 'aguardando_aprovacao',
    resposta_texto: 'Roteiro pronto -- revise o texto e as cenas antes de aprovar a produção do vídeo.',
    dados,
  }).eq('id', tarefaId);
}

// ── Fluxo: pedir ajuste (Roteirista reescreve, Gestor revisa de novo) ─────────

async function ajustarRoteiro(supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, dadosAtuais: DadosRoteiro, feedback: string) {
  const { data: script, error: scriptErr } = await supabase.from('video_scripts').select('id, cliente_id').eq('id', dadosAtuais.video_script_id).single();
  if (scriptErr || !script) throw new Error(`Roteiro original não encontrado: ${scriptErr?.message}`);

  const { data: clienteData } = await supabase
    .from('conteudo_clientes')
    .select('nome, nicho, publico_alvo, tom_de_voz, cta_padrao, temas_evitar')
    .eq('id', script.cliente_id)
    .single();
  const cliente: ClienteContexto = clienteData ?? { nome: 'Cliente' };

  const { full_narration_text, blocks, concept_word } = await passoRoteirista(supabase, openaiKey, tarefaId, agentes, cliente, dadosAtuais.tema, dadosAtuais.gancho, dadosAtuais.angulo, feedback);
  const notaTecnica = validarConceitoESfx(blocks, concept_word);
  await passoGestorQA(supabase, openaiKey, tarefaId, agentes, cliente, dadosAtuais.tema, full_narration_text, notaTecnica);

  const { error: updateErr } = await supabase.from('video_scripts').update({ full_narration_text, blocks, concept_word }).eq('id', script.id);
  if (updateErr) throw new Error(`Falha ao atualizar video_scripts: ${updateErr.message}`);

  const dados: DadosRoteiro = { ...dadosAtuais, blocos: blocks, feedback_anterior: feedback, concept_word };
  await supabase.from('equipe_11ds_tarefas').update({
    status: 'aguardando_aprovacao',
    resposta_texto: 'Roteiro ajustado -- revise de novo antes de aprovar.',
    dados,
  }).eq('id', tarefaId);
}

// ── Fluxo: aprovar (cria o video_job, so a partir daqui tem custo real) ───────

async function aprovarRoteiro(supabase: any, tarefaId: string, dadosAtuais: DadosRoteiro, criadoPor: string | null) {
  const { data: script, error: scriptErr } = await supabase.from('video_scripts').select('id').eq('id', dadosAtuais.video_script_id).single();
  if (scriptErr || !script) throw new Error(`Roteiro não encontrado: ${scriptErr?.message}`);

  const { error: aprovarErr } = await supabase.from('video_scripts').update({ aprovado: true }).eq('id', script.id);
  if (aprovarErr) throw new Error(`Falha ao aprovar roteiro: ${aprovarErr.message}`);

  const { error: jobErr } = await supabase.from('video_jobs').insert({
    mode: 'ai_generated',
    script_id: script.id,
    status: 'queued',
    criado_por: criadoPor,
  });
  if (jobErr) throw new Error(`Falha ao criar video_job: ${jobErr.message}`);

  await supabase.from('equipe_11ds_tarefas').update({
    status: 'concluido',
    resposta_texto: 'Roteiro aprovado -- o vídeo entrou na fila de produção (narração, cenas e render).',
    concluido_em: new Date().toISOString(),
  }).eq('id', tarefaId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const authHeader = req.headers.get('authorization') ?? '';
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let tarefaId = '';
  let agentesEquipe: Agentes | null = null;

  try {
    const body = await req.json() as { tarefa_id: string; acao?: 'aprovar' | 'ajustar'; feedback?: string };
    tarefaId = body.tarefa_id;
    if (!tarefaId) {
      return new Response(JSON.stringify({ ok: false, error: 'tarefa_id e obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas')
      .select('id, agente_id, tipo, cliente_id, ordem_texto, status, dados, criado_por')
      .eq('id', tarefaId)
      .single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    if (tarefa.tipo !== 'video_roteiro') throw new Error('Esta função só processa tarefas do tipo video_roteiro.');

    const { data: agenteOriginal, error: agenteErr } = await supabase.from('equipe_11ds_agentes').select('id, time_id').eq('id', tarefa.agente_id).single();
    if (agenteErr || !agenteOriginal) throw new Error(`Agente nao encontrado: ${agenteErr?.message}`);

    const agentes = await buscarAgentesDoTime(supabase, agenteOriginal.time_id);
    agentesEquipe = agentes;

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    if (body.acao === 'aprovar') {
      if (tarefa.status !== 'aguardando_aprovacao' || !tarefa.dados?.video_script_id) throw new Error('Esta tarefa não está aguardando aprovação.');
      await aprovarRoteiro(supabase, tarefaId, tarefa.dados as DadosRoteiro, tarefa.criado_por ?? null);
    } else if (body.acao === 'ajustar') {
      if (tarefa.status !== 'aguardando_aprovacao' || !tarefa.dados?.video_script_id) throw new Error('Esta tarefa não está aguardando aprovação.');
      if (!body.feedback?.trim()) throw new Error('Descreva o ajuste pedido.');
      await ajustarRoteiro(supabase, openaiKey, tarefaId, agentes, tarefa.dados as DadosRoteiro, body.feedback.trim());
    } else {
      if (!tarefa.cliente_id) throw new Error('Tarefa sem cliente vinculado.');
      await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
      await escreverRoteiro(supabase, openaiKey, tarefaId, agentes, tarefa.cliente_id, tarefa.criado_por ?? null, tarefa.ordem_texto);
    }

    for (const id of Object.values(agentes)) await atualizarAgente(supabase, id, 'livre', null);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
      if (agentesEquipe) await registrarMensagem(supabase, tarefaId, agentesEquipe.gestor, 'alerta', `Deu erro: ${message}`);
    }
    if (agentesEquipe) {
      for (const [papel, id] of Object.entries(agentesEquipe)) {
        await atualizarAgente(supabase, id, papel === 'gestor' ? 'erro' : 'livre', papel === 'gestor' ? 'Deu erro na última tarefa' : null);
      }
    }
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
