import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type EstiloVisual = 'manchete' | 'editorial';

type ClienteContexto = {
  nome: string;
  nicho?: string | null;
  publico_alvo?: string | null;
  tom_de_voz?: string | null;
  cta_padrao?: string | null;
  cor_primaria?: string | null;
  cor_secundaria?: string | null;
  logo_url?: string | null;
  hashtags_fixas?: string[] | null;
  temas_evitar?: string[] | null;
  pilares_conteudo?: string[] | null;
  estilo_visual?: EstiloVisual;
  formula_headline?: string | null;
  arquetipos_visuais_preferidos?: string[] | null;
  arquetipos_visuais_evitar?: string[] | null;
};

type HistoricoRecente = { temas: string[]; pilares: string[]; arquetipos: string[] };

type ExecResultado = {
  resposta: string;
  gerar_imagem: boolean;
  prompt_imagem?: string;
  headline?: string;
  tema?: string;
  legenda?: string;
  pilar?: string;
  arquetipo_visual?: string;
};

// ── Pesquisa de tendencia (web search nativo da OpenAI, via Responses API) ────

function extrairTextoResponses(data: any): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      const texto = item.content.find((c: any) => c.type === 'output_text')?.text;
      if (texto) return texto;
    }
  }
  return '';
}

async function pesquisarTendencia(openaiKey: string, cliente: ClienteContexto, historico: HistoricoRecente): Promise<string> {
  const prompt = [
    `Pesquise na web o que esta em alta AGORA (conversas, tendencias da semana, eventos recentes) relacionado ao nicho "${cliente.nicho ?? ''}".`,
    cliente.publico_alvo ? `Publico-alvo: ${cliente.publico_alvo}.` : '',
    cliente.temas_evitar?.length ? `NUNCA sugira nada relacionado a: ${cliente.temas_evitar.join(', ')}.` : '',
    historico.temas.length ? `Ja foram usados recentemente (evite repetir a mesma familia de assunto): ${historico.temas.join(' | ')}.` : '',
    `Liste 2-3 assuntos candidatos. Para cada um: o gancho atual (o que esta acontecendo agora de verdade) e uma ideia de angulo pessoal que faca o publico se reconhecer.`,
  ].filter(Boolean).join(' ');

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search' }],
        input: prompt,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error(`Pesquisa de tendencia falhou (${res.status}):`, (await res.text()).slice(0, 300));
      return '';
    }
    const data = await res.json();
    return extrairTextoResponses(data);
  } catch (e) {
    console.error('Pesquisa de tendencia falhou:', (e as Error).message);
    return '';
  }
}

// ── Historico recente (pra nao repetir tema/pilar/arquetipo) ──────────────────

async function buscarHistoricoRecente(supabase: any, clienteId: string): Promise<HistoricoRecente> {
  const { data } = await supabase
    .from('conteudo_posts')
    .select('tema, pilar, arquetipo_visual')
    .eq('cliente_id', clienteId)
    .order('data_post', { ascending: false })
    .limit(7);
  const linhas = (data ?? []) as { tema: string | null; pilar: string | null; arquetipo_visual: string | null }[];
  return {
    temas: linhas.map(l => l.tema).filter((t): t is string => Boolean(t)),
    pilares: linhas.map(l => l.pilar).filter((t): t is string => Boolean(t)),
    arquetipos: linhas.map(l => l.arquetipo_visual).filter((t): t is string => Boolean(t)),
  };
}

// ── Interpretacao da ordem (GPT, modo JSON) ───────────────────────────────────

async function interpretarOrdem(
  openaiKey: string, cargo: string, tipo: string, ordemTexto: string,
  cliente?: ClienteContexto, pesquisa?: string, historico?: HistoricoRecente,
): Promise<ExecResultado> {
  const systemPrompt = tipo === 'post_cliente'
    ? [
        `Voce e a Nina, agente de IA do time "${cargo}" da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
        `Post diario para o cliente "${cliente?.nome ?? ''}". Nicho: ${cliente?.nicho ?? 'nao informado'}.`,
        cliente?.publico_alvo ? `Publico-alvo: ${cliente.publico_alvo}.` : '',
        cliente?.tom_de_voz ? `Tom de voz: ${cliente.tom_de_voz}.` : '',
        cliente?.pilares_conteudo?.length ? `Pilares de conteudo do cliente (gire entre eles, nao repita o mesmo pilar dos ultimos posts): ${cliente.pilares_conteudo.join(', ')}.` : '',
        historico?.pilares.length ? `Pilares usados recentemente: ${historico.pilares.join(', ')}. Escolha um "pilar" diferente destes se possivel.` : '',
        historico?.temas.length ? `Temas ja usados recentemente (o tema de hoje TEM que ser de uma familia de assunto diferente): ${historico.temas.join(' | ')}.` : '',
        cliente?.temas_evitar?.length ? `NUNCA fale sobre: ${cliente.temas_evitar.join(', ')} (brand safety).` : '',
        pesquisa ? `Pesquisa de tendencia feita agora: ${pesquisa}` : '',
        `O tema escolhido precisa ser as duas coisas ao mesmo tempo: (1) um gancho atual de verdade (algo acontecendo agora, nao um conceito de manual reciclado) e (2) ter relevancia pessoal imediata (o publico tem que se reconhecer, nao so ler um fato). O mecanismo/conceito central da area precisa aparecer no proprio gancho, nao so ser colado na legenda depois.`,
        `Legenda: escreva como uma pessoa real falando (especialista em primeira pessoa, "eu ja vi isso"), nao como comunicado institucional. Estrutura: (1) gancho textual curto reforcando o gancho visual, (2) corpo explicando o assunto com contexto/dado real, (3) fechamento com pergunta ou CTA que puxa comunidade${cliente?.cta_padrao ? ` (pode usar uma variacao de "${cliente.cta_padrao}")` : ''}, (4) hashtags combinando${cliente?.hashtags_fixas?.length ? ` as fixas do cliente (${cliente.hashtags_fixas.join(' ')})` : ''} com 3-5 especificas do tema.`,
        `NUNCA use travessao (—) na legenda — e o maior tique de "escrito por IA" que existe. Frases curtas e diretas, pontuacao simples (. , ? !).`,
        `Headline (frase curta que vai aparecer escrita DENTRO da imagem, composta localmente com fonte real — nao pela IA de imagem, entao a grafia que voce escrever aqui sai pixel-identica): estilo "${cliente?.estilo_visual ?? 'manchete'}".`,
        cliente?.estilo_visual === 'editorial'
          ? `Estilo editorial: frase unica, poetica/reflexiva, 6-11 palavras, tom contemplativo.`
          : `Estilo manchete: pergunta ou afirmacao direta e provocadora, 5-9 palavras, tom impactante.`,
        cliente?.formula_headline ? `Formula de headline deste cliente (seguir a risca): ${cliente.formula_headline}.` : '',
        `Marque 1 a 3 palavras-chave da headline entre **dois asteriscos** (ex: "Nao e sorte. E **metodo**.") — essas palavras saem destacadas na cor da marca na composicao final. O resto do texto sai em branco. Nao exagere: no maximo uma "ilha" de destaque por frase curta, pode ser mais de uma palavra colada (ex: **metodo certo**).`,
        `Sempre acentuacao correta em portugues (VOCÊ, É, NÃO, etc) — essa headline vai pra imagem exatamente como voce escrever, sem segunda revisao, entao confira a gramatica com cuidado antes de responder.`,
        `Prompt de imagem: pense antes num UNICO MOMENTO decisivo que faria alguem parar de rolar o feed (um gesto, uma expressao, uma tensao visual) — nao uma lista de termos tecnicos soltos. Descreva esse momento numa frase com ideia, depois traduza pra vocabulario tecnico: luz (low-key/rim light pra separar do fundo, nunca luz frontal de camera), enquadramento (rule of thirds, espaco negativo generoso na parte de baixo pro headline), fundo (NUNCA vazio/liso — sempre um ambiente desfocado que sugere contexto, nomeando o que esta desfocado). Sempre fotografia realista (editorial/advertising photography, photorealistic), nunca ilustracao/flat/aquarela. Evite telas, monitores, relogios, placas ou qualquer texto/numero pequeno em primeiro plano (a IA de imagem erra esses detalhes). Evite duas maos entrelacadas em close-up (risco de anatomia errada) — prefira uma mao so ou o rosto como foco emocional. Se aparecer pessoa, o genero/idade deve combinar com o publico-alvo. Escreva o prompt em ingles, 25-40 palavras, so a cena/composicao (o texto do headline e adicionado automaticamente depois, nao descreva texto no prompt).`,
        `Escolha um "arquetipo_visual" pra essa cena (ex: especialista em acao, still life de objetos em acao, retrato com expressao forte, duas pessoas em interacao, ambiente com drama visual proprio).`,
        historico?.arquetipos.length ? `Arquetipos visuais usados recentemente (varie, nao repita 2 dias seguidos): ${historico.arquetipos.join(', ')}.` : '',
        cliente?.arquetipos_visuais_preferidos?.length ? `Arquetipos preferidos deste cliente: ${cliente.arquetipos_visuais_preferidos.join(', ')}.` : '',
        cliente?.arquetipos_visuais_evitar?.length ? `NUNCA use estes arquetipos: ${cliente.arquetipos_visuais_evitar.join(', ')}.` : '',
        `Responda SOMENTE com um JSON: {"resposta": string, "gerar_imagem": true, "prompt_imagem": string, "headline": string, "tema": string, "legenda": string, "pilar": string, "arquetipo_visual": string}`,
      ].filter(Boolean).join(' ')
    : [
        `Voce e a Nina, agente de IA do time "${cargo}" da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil, tom profissional e direto.`,
        `A ordem e uma tarefa avulsa (ex: foto de capa de grupo, criativo de anuncio, imagem promocional). Nao ha marca/logo cadastrada pra essa tarefa, entao se precisar de texto ele deve ser descrito dentro do proprio prompt_imagem.`,
        `Decida se precisa de imagem. Se precisar, escreva um "headline" curto (se fizer sentido ter texto na imagem, descreva-o tambem dentro do prompt_imagem, com a grafia exata e correta em portugues) e um "prompt_imagem" em ingles descrevendo a cena/composicao/estilo visual, foco no momento/ideia central, nao em lista de termos tecnicos soltos.`,
        `Responda SOMENTE com um JSON: {"resposta": string, "gerar_imagem": boolean, "prompt_imagem"?: string, "headline"?: string, "tema"?: string, "legenda"?: string}`,
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
      temperature: 0.8,
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

// Reforca identidade visual (cores da marca) no fundo gerado pela IA. O headline
// e a logo NAO sao mais pedidos pra IA de imagem — a IA erra grafia/anatomia de
// texto com frequencia e nao tem como garantir a logo pixel-identica. Os dois
// agora sao compostos localmente (logo real colada + fonte real renderizada)
// pelo servico externo em equipe-11ds-imagem (Vercel, Python/Pillow), chamado
// por compositarImagem() logo abaixo. Ver tambem a nota em interpretarOrdem.
function montarPromptFinal(promptBase: string, cliente?: ClienteContexto): string {
  const partes = [promptBase];
  if (cliente?.cor_primaria) partes.push(`Use ${cliente.cor_primaria} as the dominant brand color of the design`);
  if (cliente?.cor_secundaria) partes.push(`${cliente.cor_secundaria} as a secondary accent color`);
  partes.push('Professional social media creative, vertical portrait photography, scroll-stopping composition, photorealistic (never flat illustration), high contrast, generous negative space in the lower third, no on-screen text, no logos, no watermarks.');
  return partes.join('. ');
}

async function gerarImagem(openaiKey: string, prompt: string, size: '1024x1024' | '1024x1536' = '1024x1024'): Promise<Uint8Array> {
  // dall-e-3 foi descontinuado pela OpenAI — modelo atual e' gpt-image-1.
  // response_format tambem nao e mais aceito — o retorno pode vir como
  // b64_json ou como url, dependendo do modelo usado pela conta.
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagem OpenAI error ${res.status}: ${err.slice(0, 300)}`);
  }

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
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem gerada: ${imgRes.status}`);
    return new Uint8Array(await imgRes.arrayBuffer());
  }

  throw new Error('OpenAI nao retornou b64_json nem url');
}

// ── Composicao local (logo real + headline com fonte real) ────────────────────
// Chama o servico externo (Vercel, Python/Pillow) que cola a logo de verdade do
// cliente (pixel identica ao arquivo original) e renderiza o headline com fonte
// real — nunca a IA "desenhando" letras, que erra grafia/anatomia com frequencia.

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

async function baixarLogo(logoUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    console.error('Falha ao baixar logo do cliente:', (e as Error).message);
    return null;
  }
}

async function compositarImagem(
  composeUrl: string, compositeSecret: string, imagemBase: Uint8Array,
  logoBytes: Uint8Array | null, headline: string | undefined,
  estiloVisual: EstiloVisual | undefined, corPrimaria: string | null | undefined,
): Promise<{ feed: Uint8Array; stories: Uint8Array | null }> {
  const res = await fetch(composeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-composite-key': compositeSecret },
    body: JSON.stringify({
      imagem_base64: bytesToBase64(imagemBase),
      logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
      logo_posicao: 'superior-esquerda',
      headline: headline ?? '',
      estilo_visual: estiloVisual ?? 'manchete',
      cor_primaria: corPrimaria ?? undefined,
      gerar_stories: true,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Servico de composicao de imagem falhou (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = await res.json() as { feed_base64: string; stories_base64?: string };
  return {
    feed: base64ToBytes(data.feed_base64),
    stories: data.stories_base64 ? base64ToBytes(data.stories_base64) : null,
  };
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
    let historico: HistoricoRecente = { temas: [], pilares: [], arquetipos: [] };
    if (tarefa.tipo === 'post_cliente' && tarefa.cliente_id) {
      const { data } = await supabase
        .from('conteudo_clientes')
        .select('nome, nicho, publico_alvo, tom_de_voz, cta_padrao, cor_primaria, cor_secundaria, logo_url, hashtags_fixas, temas_evitar, pilares_conteudo, estilo_visual, formula_headline, arquetipos_visuais_preferidos, arquetipos_visuais_evitar')
        .eq('id', tarefa.cliente_id)
        .single();
      cliente = data ?? undefined;
      historico = await buscarHistoricoRecente(supabase, tarefa.cliente_id);
    }

    const statusTexto = tarefa.tipo === 'post_cliente'
      ? `Pesquisando tendencias pro post de ${cliente?.nome ?? 'cliente'}...`
      : `${tarefa.ordem_texto.slice(0, 60)}${tarefa.ordem_texto.length > 60 ? '...' : ''}`;

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: statusTexto, updated_at: new Date().toISOString() }).eq('id', agenteId);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    let pesquisa = '';
    if (tarefa.tipo === 'post_cliente' && cliente) {
      pesquisa = await pesquisarTendencia(openaiKey, cliente, historico);
      await supabase.from('equipe_11ds_agentes').update({ status_texto: `Criando post para ${cliente.nome}...`, updated_at: new Date().toISOString() }).eq('id', agenteId);
    }

    const resultado = await interpretarOrdem(openaiKey, agente.cargo ?? 'Posts & Criativos', tarefa.tipo, tarefa.ordem_texto, cliente, pesquisa, historico);

    const anexos: { tipo: string; url: string }[] = [];
    let storiesUrl: string | null = null;
    if (resultado.gerar_imagem && resultado.prompt_imagem) {
      const isPostCliente = tarefa.tipo === 'post_cliente';
      const promptFinal = isPostCliente ? montarPromptFinal(resultado.prompt_imagem, cliente) : resultado.prompt_imagem;
      const bytesBase = await gerarImagem(openaiKey, promptFinal, isPostCliente ? '1024x1536' : '1024x1024');

      let feedBytes = bytesBase;
      let storiesBytes: Uint8Array | null = null;

      if (isPostCliente) {
        const { data: composeConfig } = await supabase.rpc('get_equipe_11ds_composite_config');
        const composeUrl = composeConfig?.[0]?.url as string | undefined;
        const compositeSecret = composeConfig?.[0]?.secret as string | undefined;
        if (composeUrl && compositeSecret) {
          const logoBytes = await baixarLogo(cliente?.logo_url);
          const composto = await compositarImagem(composeUrl, compositeSecret, bytesBase, logoBytes, resultado.headline, cliente?.estilo_visual, cliente?.cor_primaria);
          feedBytes = composto.feed;
          storiesBytes = composto.stories;
        } else {
          console.error('Servico de composicao de imagem nao configurado (Vault vazio) — logo/headline nao serao aplicados localmente nesta tarefa.');
        }
      }

      const storagePathFeed = `${tarefaId}-feed.png`;
      const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePathFeed, feedBytes, { contentType: 'image/png', upsert: true });
      if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);
      const { data: { publicUrl } } = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePathFeed);
      anexos.push({ tipo: 'imagem', url: publicUrl });

      if (storiesBytes) {
        const storagePathStories = `${tarefaId}-stories.png`;
        const { error: uploadErrStories } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePathStories, storiesBytes, { contentType: 'image/png', upsert: true });
        if (!uploadErrStories) {
          const { data: { publicUrl: storiesPublicUrl } } = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePathStories);
          storiesUrl = storiesPublicUrl;
          anexos.push({ tipo: 'imagem_stories', url: storiesPublicUrl });
        }
      }
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
          imagem_stories_url: storiesUrl,
          pilar: resultado.pilar ?? null,
          arquetipo_visual: resultado.arquetipo_visual ?? null,
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
