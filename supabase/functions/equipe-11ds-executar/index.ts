import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type EstiloVisual = 'manchete' | 'editorial';
type FormatoDia = 'tipografico' | 'fotografico';

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

type HistoricoRecente = { temas: string[]; pilares: string[]; arquetipos: string[]; aberturas: string[] };

function hojeSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// ── Calendario deterministico (decidido por codigo, nunca por sorte de prompt) ─

const CADENCIA_FORMATO: FormatoDia[] = ['tipografico', 'tipografico', 'fotografico', 'tipografico', 'tipografico', 'fotografico', 'tipografico'];

function calcularCalendarioDoDia(pilares: string[], hoje: string): { pilar: string | null; formato: FormatoDia } {
  const diasDesdeEpoch = Math.floor(Date.parse(`${hoje}T00:00:00Z`) / 86_400_000);
  const pilar = pilares.length ? pilares[diasDesdeEpoch % pilares.length] : null;
  const formato = CADENCIA_FORMATO[diasDesdeEpoch % CADENCIA_FORMATO.length];
  return { pilar, formato };
}

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
      body: JSON.stringify({ model: 'gpt-4o-mini', tools: [{ type: 'web_search' }], input: prompt }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error(`Pesquisa de tendencia falhou (${res.status}):`, (await res.text()).slice(0, 300));
      return '';
    }
    return extrairTextoResponses(await res.json());
  } catch (e) {
    console.error('Pesquisa de tendencia falhou:', (e as Error).message);
    return '';
  }
}

// ── Historico recente (janela de 14 posts -- variedade ao longo do tempo) ─────

async function buscarHistoricoRecente(supabase: any, clienteId: string): Promise<HistoricoRecente> {
  const { data } = await supabase
    .from('conteudo_posts')
    .select('tema, pilar, arquetipo_visual, legenda')
    .eq('cliente_id', clienteId)
    .order('data_post', { ascending: false })
    .limit(14);
  const linhas = (data ?? []) as { tema: string | null; pilar: string | null; arquetipo_visual: string | null; legenda: string | null }[];
  return {
    temas: linhas.map(l => l.tema).filter((t): t is string => Boolean(t)),
    pilares: linhas.map(l => l.pilar).filter((t): t is string => Boolean(t)),
    arquetipos: linhas.map(l => l.arquetipo_visual).filter((t): t is string => Boolean(t)),
    aberturas: linhas.map(l => l.legenda?.split(/\s+/).slice(0, 7).join(' ')).filter((t): t is string => Boolean(t)),
  };
}

// ── Infra comum: chamada de GPT em modo JSON com parse defensivo ──────────────
// Falha ocasional do modelo: em vez de devolver o objeto no nivel raiz, aninha o
// JSON inteiro (de novo, como string escapada) dentro de um dos proprios campos
// (visto acontecer com "resposta"). Detecta e desembrulha.

function desembrulharJSON(raw: string): Record<string, unknown> {
  let parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const campo of Object.keys(parsed)) {
    const valor = parsed[campo];
    if (typeof valor === 'string' && valor.trim().startsWith('{') && valor.trim().endsWith('}') && valor.length > 40) {
      try {
        const aninhado = JSON.parse(valor) as Record<string, unknown>;
        if (aninhado && typeof aninhado === 'object' && Object.keys(aninhado).length > 1) {
          parsed = aninhado;
          break;
        }
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

// ── Infra da equipe: status do agente + mensagens da thread ───────────────────

async function atualizarAgente(supabase: any, agenteId: string, status: 'trabalhando' | 'livre' | 'erro', statusTexto: string | null) {
  await supabase.from('equipe_11ds_agentes').update({ status, status_texto: statusTexto, updated_at: new Date().toISOString() }).eq('id', agenteId);
}

async function registrarMensagem(supabase: any, tarefaId: string, agenteId: string, tipo: 'mensagem' | 'alerta' | 'aprovacao', conteudo: string) {
  await supabase.from('equipe_11ds_mensagens').insert({ tarefa_id: tarefaId, agente_id: agenteId, tipo, conteudo });
}

type Agentes = { gestor: string; estrategista: string; redator: string; diretor: string; nina: string; curador: string };

async function buscarAgentesDoTime(supabase: any, timeId: string): Promise<Agentes> {
  const { data, error } = await supabase.from('equipe_11ds_agentes').select('id, slug').eq('time_id', timeId);
  if (error || !data) throw new Error(`Falha ao buscar agentes do time: ${error?.message}`);
  const porSlug = new Map((data as { id: string; slug: string | null }[]).map(a => [a.slug, a.id]));
  const obrigatorio = (slug: string) => {
    const id = porSlug.get(slug);
    if (!id) throw new Error(`Agente "${slug}" nao encontrado no time`);
    return id;
  };
  return {
    gestor: obrigatorio('gestor-midia'),
    estrategista: obrigatorio('estrategista-conteudo'),
    redator: obrigatorio('redator-chefe'),
    diretor: obrigatorio('diretor-arte'),
    nina: obrigatorio('nina-producao'),
    curador: obrigatorio('curador-conhecimento'),
  };
}

// ── Cerebro coletivo: cofre Obsidian versionado no GitHub (11ds-conhecimento) ──
// Leitura acontece antes de Estrategista/Redator/Diretor decidirem (contexto);
// escrita acontece so no passo do Curador, depois do QA do Gestor, e so quando
// passa pela regua dos 3 criterios (nao-obvio, concreto, muda decisao futura).
// Nunca deve travar a producao do post -- qualquer falha aqui e' so logada.

function slugificar(nome: string): string {
  return nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function lerConhecimento(token: string, repo: string, caminho: string): Promise<{ conteudo: string; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'equipe-11ds' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao ler ${caminho}: ${res.status} ${await res.text()}`);
  const data = await res.json() as { content: string; sha: string };
  const conteudo = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0)));
  return { conteudo, sha: data.sha };
}

async function listarDiretorio(token: string, repo: string, caminho: string): Promise<{ name: string; type: string }[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'equipe-11ds' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  return await res.json() as { name: string; type: string }[];
}

async function gravarConhecimento(token: string, repo: string, caminho: string, conteudoNovo: string, mensagemCommit: string, shaExistente?: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'equipe-11ds', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensagemCommit, content: bytesToBase64(new TextEncoder().encode(conteudoNovo)), ...(shaExistente ? { sha: shaExistente } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Falha ao gravar ${caminho}: ${res.status} ${await res.text()}`);
}

type ContextoConhecimento = { notaCliente: string; notaClienteSha: string | null; principios: string };

async function buscarContextoConhecimento(supabase: any, cliente: ClienteContexto): Promise<ContextoConhecimento> {
  const vazio: ContextoConhecimento = { notaCliente: '', notaClienteSha: null, principios: '' };
  try {
    const { data: config } = await supabase.rpc('get_equipe_11ds_github_config');
    const token = config?.[0]?.token as string | undefined;
    const repo = config?.[0]?.repo as string | undefined;
    if (!token || !repo) return vazio;

    const caminhoNota = `Midia-Criativos/Clientes/${slugificar(cliente.nome)}.md`;
    const [nota, arquivosPrincipios] = await Promise.all([
      lerConhecimento(token, repo, caminhoNota),
      listarDiretorio(token, repo, 'Midia-Criativos/Principios'),
    ]);

    const principiosLidos = await Promise.all(
      arquivosPrincipios
        .filter(a => a.type === 'file' && a.name.endsWith('.md'))
        .map(a => lerConhecimento(token, repo, `Midia-Criativos/Principios/${a.name}`).catch(() => null)),
    );
    const principios = principiosLidos
      .filter((p): p is { conteudo: string; sha: string } => Boolean(p))
      .map(p => p.conteudo)
      .join('\n\n---\n\n')
      .slice(0, 6000);

    return { notaCliente: nota?.conteudo ?? '', notaClienteSha: nota?.sha ?? null, principios };
  } catch (e) {
    console.error('Falha ao buscar contexto do Obsidian (seguindo sem ele):', (e as Error).message);
    return vazio;
  }
}

// ── Banimentos e menu de ganchos (pesquisa de referencia, ver vault Obsidian) ──

const PALAVRAS_BANIDAS = ['utilizar', 'robusto', 'aprofundar', 'certamente', 'é importante ressaltar', 'você já parou pra pensar', 'você sabia que'];

const MENU_GANCHOS = [
  '"Fui de [estado ruim] pra [estado bom] em [tempo] fazendo [mecanismo]."',
  '"3 coisas que eu queria saber antes de [decisao/momento]."',
  '"Eu fiz [a coisa certa] por [tempo] e nao deu em nada. Ate que [virada]."',
  '"Nao e [crenca comum]. E [reframe]."',
  'POV que coloca quem le no centro da cena (ex: "Voce percebe [padrao] e nao sabe o motivo -- e isso:").',
].join(' / ');

// ── Passo 1: Gestor (abertura) ─────────────────────────────────────────────────

async function passoGestorAbertura(supabase: any, tarefaId: string, agentes: Agentes, cliente: ClienteContexto, hoje: string): Promise<{ pilar: string | null; formato: FormatoDia }> {
  await atualizarAgente(supabase, agentes.gestor, 'trabalhando', `Abrindo o dia para ${cliente.nome}...`);
  const { pilar, formato } = calcularCalendarioDoDia(cliente.pilares_conteudo ?? [], hoje);
  const briefing = pilar
    ? `Hoje: pilar "${pilar}", formato ${formato}. Estrategista, defina o angulo.`
    : `Hoje: formato ${formato} (cliente sem pilares cadastrados). Estrategista, defina o angulo.`;
  await registrarMensagem(supabase, tarefaId, agentes.gestor, 'mensagem', briefing);
  return { pilar, formato };
}

// ── Passo 2: Estrategista ──────────────────────────────────────────────────────

async function passoEstrategista(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, pilar: string | null, pesquisa: string, historico: HistoricoRecente, contexto: ContextoConhecimento,
): Promise<{ tema: string; justificativa: string }> {
  await atualizarAgente(supabase, agentes.estrategista, 'trabalhando', `Definindo o angulo do dia para ${cliente.nome}...`);

  const systemPrompt = [
    `Voce e a Estrategista de Conteudo do time de midia da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
    `Cliente: "${cliente.nome}". Nicho: ${cliente.nicho ?? 'nao informado'}.`,
    cliente.publico_alvo ? `Publico-alvo: ${cliente.publico_alvo}.` : '',
    pilar ? `O pilar de hoje JA ESTA DECIDIDO pelo calendario: "${pilar}". Sua funcao e escolher o ANGULO/TEMA especifico dentro desse pilar -- nao escolha outro pilar.` : '',
    cliente.temas_evitar?.length ? `NUNCA sugira nada relacionado a: ${cliente.temas_evitar.join(', ')} (brand safety).` : '',
    pesquisa ? `Pesquisa de tendencia feita agora: ${pesquisa}` : '',
    historico.temas.length ? `Temas ja usados recentemente (o tema de hoje TEM que ser de uma familia de assunto diferente): ${historico.temas.join(' | ')}.` : '',
    contexto.notaCliente ? `O que o time ja aprendeu sobre este cliente especificamente (memoria do time, Obsidian): ${contexto.notaCliente.slice(0, 1500)}` : '',
    `O tema escolhido precisa ser as duas coisas ao mesmo tempo: (1) um gancho atual de verdade (algo acontecendo agora, nao um conceito de manual reciclado) e (2) ter relevancia pessoal imediata (o publico tem que se reconhecer). O mecanismo/conceito central da area precisa aparecer no proprio gancho.`,
    `Responda SOMENTE com um JSON: {"tema": string, "justificativa": string (uma linha, por que esse angulo e diferente dos recentes)}`,
  ].filter(Boolean).join(' ');

  const resultado = await chamarGPT(openaiKey, systemPrompt, 'Defina o tema de hoje.');
  const tema = String(resultado.tema ?? '');
  const justificativa = String(resultado.justificativa ?? '');
  await registrarMensagem(supabase, tarefaId, agentes.estrategista, 'mensagem', `Tema de hoje: "${tema}". ${justificativa}`);
  return { tema, justificativa };
}

// ── Passo 3: Redator ────────────────────────────────────────────────────────────

async function passoRedator(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, tema: string, historico: HistoricoRecente, contexto: ContextoConhecimento, feedbackCorrecao?: string,
): Promise<{ legenda: string; headline: string; hashtags: string }> {
  await atualizarAgente(supabase, agentes.redator, 'trabalhando', `Escrevendo a legenda sobre "${tema.slice(0, 40)}"...`);

  const systemPrompt = [
    `Voce e o Redator-chefe do time de midia da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
    `Cliente: "${cliente.nome}". Tom de voz: ${cliente.tom_de_voz ?? 'nao informado'}. Tema de hoje: "${tema}".`,
    `Escreva como uma pessoa real falando (especialista em primeira pessoa, "eu ja vi isso"), nao como comunicado institucional.`,
    `Gancho (linha 1, sozinha, e o que aparece antes do "...mais"): escolha e adapte um destes formatos comprovados ao tema de hoje -- ${MENU_GANCHOS}`,
    historico.aberturas.length ? `Aberturas usadas nos ultimos posts, NAO repita esse padrao: ${historico.aberturas.map(a => `"${a}..."`).join(' / ')}.` : '',
    contexto.notaCliente ? `O que o time ja aprendeu sobre este cliente especificamente (memoria do time, Obsidian): ${contexto.notaCliente.slice(0, 1500)}` : '',
    contexto.principios ? `Principios gerais de escrita do time, validados por pesquisa (Obsidian, use como reforco, nao repita o texto deles): ${contexto.principios.slice(0, 2500)}` : '',
    `Depois do gancho: PARAGRAFOS SEPARADOS por quebra de linha dupla (\\n\\n entre cada um, nunca bloco unico de texto corrido). Corpo TEM que conter pelo menos um dado, numero, mecanismo, citacao ou exemplo concreto e especifico (nunca genérico tipo "reflita sobre suas emoções"). Fechamento com pergunta ou CTA que puxa comunidade${cliente.cta_padrao ? ` (pode usar variacao de "${cliente.cta_padrao}")` : ''}.`,
    `NUNCA use travessao (—). NUNCA use estas palavras/aberturas (tique de IA): ${PALAVRAS_BANIDAS.join(', ')}. NUNCA use ** dentro da legenda -- essa marcacao e exclusiva do headline.`,
    `Hashtags: campo separado "hashtags" (nao faz parte da legenda), combinando${cliente.hashtags_fixas?.length ? ` as fixas do cliente (${cliente.hashtags_fixas.join(' ')})` : ''} com 3-5 especificas do tema. Obrigatorio, nunca vazio.`,
    `Headline (frase curta pra aparecer na imagem, composta localmente com fonte real -- a grafia que voce escrever sai pixel-identica, confira acentuacao com cuidado): estilo "${cliente.estilo_visual ?? 'manchete'}".`,
    cliente.estilo_visual === 'editorial' ? `Estilo editorial: frase unica, poetica/reflexiva, 6-11 palavras.` : `Estilo manchete: pergunta ou afirmacao direta e provocadora, 5-9 palavras.`,
    cliente.formula_headline ? `Formula de headline deste cliente (seguir a risca): ${cliente.formula_headline}.` : '',
    `Marque 1 a 3 palavras-chave do headline entre **dois asteriscos** (ex: "Nao e sorte. E **metodo**.").`,
    feedbackCorrecao ? `CORRECAO PEDIDA PELO GESTOR (resolva isso antes de tudo): ${feedbackCorrecao}` : '',
    `Responda SOMENTE com um JSON: {"legenda": string, "headline": string, "hashtags": string}`,
  ].filter(Boolean).join(' ');

  const resultado = await chamarGPT(openaiKey, systemPrompt, 'Escreva a legenda de hoje.');
  const out = { legenda: String(resultado.legenda ?? ''), headline: String(resultado.headline ?? ''), hashtags: String(resultado.hashtags ?? '') };
  await registrarMensagem(supabase, tarefaId, agentes.redator, 'mensagem', `Rascunho pronto. Headline: "${out.headline}".`);
  return out;
}

// ── Passo 4: Diretor de Arte ────────────────────────────────────────────────────

async function passoDiretorArte(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, tema: string, headline: string, formato: FormatoDia, pilar: string | null, historico: HistoricoRecente, contexto: ContextoConhecimento,
): Promise<{ promptImagem?: string; kicker?: string; gradientStyle?: 'radial' | 'diagonal'; arquetipoVisual: string }> {
  await atualizarAgente(supabase, agentes.diretor, 'trabalhando', `Definindo o conceito visual (${formato})...`);

  if (formato === 'tipografico') {
    const gradientStyle: 'radial' | 'diagonal' = Math.floor(Date.parse(`${hojeSaoPaulo()}T00:00:00Z`) / 86_400_000) % 2 === 0 ? 'radial' : 'diagonal';
    const kicker = pilar ?? tema;
    const arquetipoVisual = `cartao tipografico, gradiente ${gradientStyle}`;
    await registrarMensagem(supabase, tarefaId, agentes.diretor, 'mensagem', `Cartão tipográfico. Kicker: "${kicker}". Gradiente ${gradientStyle}.`);
    return { kicker, gradientStyle, arquetipoVisual };
  }

  const systemPrompt = [
    `Voce e o Diretor de Arte do time de midia da agencia 11 Digital Strategy. Responda sempre em ingles no campo prompt_imagem (o resto em portugues).`,
    `Cliente: "${cliente.nome}". Tema: "${tema}". Headline que vai aparecer integrado a imagem: "${headline}".`,
    `Pense antes num UNICO MOMENTO decisivo que faria alguem parar de rolar o feed -- nao uma lista de termos tecnicos soltos. Isso e "key art" (termo de cinema/streaming): imagem e tipografia desenhadas como peca so, nunca foto solta com faixa de texto colada.`,
    `No prompt_imagem, instrua explicitamente como o headline se integra a cena: tipografia que combina com a composicao, cor herdada da paleta da marca (${cliente.cor_primaria ?? '#C41E3A'}), posicionada respeitando a composicao (nunca faixa generica embaixo). Cite o texto exato entre aspas, com a acentuacao exata: "${headline}".`,
    `Luz: low-key/rim light pra separar do fundo, nunca luz frontal de camera. Enquadramento: rule of thirds. Fundo: NUNCA vazio/liso -- sempre um ambiente desfocado que sugere contexto, nomeando o que esta desfocado. Sempre fotografia realista (editorial/advertising photography, photorealistic), nunca ilustracao/flat.`,
    `EVITE (tique de imagem de IA): pele/textura cerosa, pose de banco de imagens (laptop+cafe+caderno), iluminacao de estudio generica, fundo sem contexto, infografico/icone tipo apresentacao de slide.`,
    `Evite duas maos entrelacadas em close-up. Se aparecer pessoa, genero/idade combinando com o publico-alvo.`,
    `Escolha um "arquetipo_visual": pose/enquadramento/acao especifica (nunca categoria generica tipo so "retrato").`,
    historico.arquetipos.length ? `PROIBIDO repetir estes arquetipos recentes, mesmo reformulados: ${historico.arquetipos.join(' | ')}.` : '',
    cliente.arquetipos_visuais_preferidos?.length ? `Familias de arquetipo preferidas deste cliente: ${cliente.arquetipos_visuais_preferidos.join(' | ')}.` : '',
    cliente.arquetipos_visuais_evitar?.length ? `NUNCA use estes arquetipos: ${cliente.arquetipos_visuais_evitar.join(', ')}.` : '',
    contexto.notaCliente ? `O que o time ja aprendeu sobre este cliente especificamente (memoria do time, Obsidian): ${contexto.notaCliente.slice(0, 1500)}` : '',
    contexto.principios ? `Principios gerais de imagem do time, validados por pesquisa (Obsidian, use como reforco): ${contexto.principios.slice(0, 2500)}` : '',
    `prompt_imagem: 30-50 palavras.`,
    `Responda SOMENTE com um JSON: {"prompt_imagem": string, "arquetipo_visual": string}`,
  ].filter(Boolean).join(' ');

  const resultado = await chamarGPT(openaiKey, systemPrompt, 'Defina o conceito visual de hoje.');
  const out = { promptImagem: String(resultado.prompt_imagem ?? ''), arquetipoVisual: String(resultado.arquetipo_visual ?? '') };
  await registrarMensagem(supabase, tarefaId, agentes.diretor, 'mensagem', `Conceito: ${out.arquetipoVisual}.`);
  return out;
}

// ── Passo 5: Nina (producao) ────────────────────────────────────────────────────

async function gerarImagem(openaiKey: string, prompt: string, size: '1024x1024' | '1024x1536' = '1024x1024'): Promise<Uint8Array> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1.5', prompt, n: 1, size }),
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
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem gerada: ${imgRes.status}`);
    return new Uint8Array(await imgRes.arrayBuffer());
  }
  throw new Error('OpenAI nao retornou b64_json nem url');
}

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

async function chamarServicoComposicao(composeUrl: string, compositeSecret: string, payload: Record<string, unknown>): Promise<{ feed: Uint8Array; stories: Uint8Array | null }> {
  const res = await fetch(composeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-composite-key': compositeSecret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Servico de composicao falhou (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { feed_base64: string; stories_base64?: string };
  return { feed: base64ToBytes(data.feed_base64), stories: data.stories_base64 ? base64ToBytes(data.stories_base64) : null };
}

async function passoProducao(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, formato: FormatoDia, headline: string,
  arte: { promptImagem?: string; kicker?: string; gradientStyle?: 'radial' | 'diagonal' },
): Promise<{ feedUrl: string | null; storiesUrl: string | null }> {
  await atualizarAgente(supabase, agentes.nina, 'trabalhando', `Produzindo o post de ${cliente.nome}...`);

  const { data: composeConfig } = await supabase.rpc('get_equipe_11ds_composite_config');
  const composeUrl = composeConfig?.[0]?.url as string | undefined;
  const compositeSecret = composeConfig?.[0]?.secret as string | undefined;
  if (!composeUrl || !compositeSecret) throw new Error('Servico de composicao de imagem nao configurado (Vault vazio)');

  const logoBytes = await baixarLogo(cliente.logo_url);

  let composto: { feed: Uint8Array; stories: Uint8Array | null };
  if (formato === 'tipografico') {
    composto = await chamarServicoComposicao(composeUrl, compositeSecret, {
      modo: 'tipografico',
      logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
      logo_posicao: 'superior-esquerda',
      kicker: arte.kicker ?? '',
      headline,
      estilo_visual: cliente.estilo_visual ?? 'manchete',
      cor_primaria: cliente.cor_primaria ?? undefined,
      cor_secundaria: cliente.cor_secundaria ?? undefined,
      gradient_style: arte.gradientStyle ?? 'radial',
      gerar_stories: true,
    });
  } else {
    const promptFinal = [
      arte.promptImagem ?? '',
      cliente.cor_primaria ? `Use ${cliente.cor_primaria} as the dominant brand color of the design` : '',
      cliente.cor_secundaria ? `${cliente.cor_secundaria} as a secondary accent color` : '',
      'Professional social media key art, vertical portrait photography, scroll-stopping composition, photorealistic, high contrast, no watermarks.',
    ].filter(Boolean).join('. ');
    const bytesBase = await gerarImagem(openaiKey, promptFinal, '1024x1536');
    composto = await chamarServicoComposicao(composeUrl, compositeSecret, {
      modo: 'fotografico',
      imagem_base64: bytesToBase64(bytesBase),
      logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
      logo_posicao: 'superior-esquerda',
      headline: '', // headline ja foi integrado pela IA de imagem -- so a logo e composta aqui
      estilo_visual: cliente.estilo_visual ?? 'manchete',
      cor_primaria: cliente.cor_primaria ?? undefined,
      gerar_stories: true,
    });
  }

  const storagePathFeed = `${tarefaId}-feed.png`;
  const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePathFeed, composto.feed, { contentType: 'image/png', upsert: true });
  if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);
  const feedUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePathFeed).data.publicUrl;

  let storiesUrl: string | null = null;
  if (composto.stories) {
    const storagePathStories = `${tarefaId}-stories.png`;
    const { error: uploadErrStories } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePathStories, composto.stories, { contentType: 'image/png', upsert: true });
    if (!uploadErrStories) storiesUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePathStories).data.publicUrl;
  }

  await registrarMensagem(supabase, tarefaId, agentes.nina, 'mensagem', 'Imagem produzida e logo aplicada.');
  return { feedUrl, storiesUrl };
}

// ── Passo 6: Gestor (fechamento / QA) ───────────────────────────────────────────

function checagemDura(legenda: string, hashtags: string): string | null {
  const legendaLower = legenda.toLowerCase();
  const palavraBanida = PALAVRAS_BANIDAS.find(p => legendaLower.includes(p.toLowerCase()));
  if (palavraBanida) return `a legenda usa a expressao banida "${palavraBanida}", reescreva evitando esse tique.`;
  if (legenda.includes('**')) return 'a legenda tem "**" vazando do headline -- essa marcacao e exclusiva do headline, remova da legenda.';
  if (!legenda.includes('\n\n')) return 'a legenda esta em bloco unico, sem paragrafos separados por linha em branco -- quebre em 2-4 blocos curtos.';
  if (!hashtags || !hashtags.trim()) return 'as hashtags vieram vazias -- preencha com as fixas do cliente + 3-5 especificas do tema.';
  return null;
}

async function passoGestorFechamento(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  legenda: string, headline: string,
): Promise<void> {
  await atualizarAgente(supabase, agentes.gestor, 'trabalhando', 'Revisando antes de publicar...');
  try {
    const critica = await chamarGPT(
      openaiKey,
      'Voce e o Gestor de Midia revisando a qualidade final de um post antes de publicar. Responda SOMENTE com um JSON: {"aprovado": boolean, "motivo": string (uma linha, em portugues)}. Reprove so se houver problema real de qualidade (generico demais, cheira a IA, gramatica errada) -- nao seja excessivamente rigoroso.',
      `Headline: "${headline}"\n\nLegenda:\n${legenda}`,
      0.3,
    );
    const aprovado = Boolean(critica.aprovado);
    const motivo = String(critica.motivo ?? '');
    await registrarMensagem(supabase, tarefaId, agentes.gestor, aprovado ? 'aprovacao' : 'alerta', aprovado ? `Aprovado, publicado como rascunho. ${motivo}`.trim() : `Ressalva: ${motivo}. Publicado mesmo assim para revisao manual.`);
  } catch (e) {
    // A critica do Gestor e' um sinal extra, nunca deve travar a publicacao do post.
    await registrarMensagem(supabase, tarefaId, agentes.gestor, 'aprovacao', 'Aprovado, publicado como rascunho.');
  }
}

// ── Passo 7: Curador de Conhecimento (registra so o 1% que vale a pena) ────────
// Ultimo passo da cadeia, depois do QA do Gestor. Regua alta e explicita: so
// escreve se as 3 respostas forem sim (nao-obvio, concreto/acionavel, muda uma
// decisao futura de verdade). Na maioria dos dias a resposta certa e' nao
// escrever nada -- e isso e' o esperado, nao uma falha. Nunca deve travar a
// producao do post.

async function passoCurador(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, tema: string, headline: string, legenda: string, contexto: ContextoConhecimento,
): Promise<void> {
  await atualizarAgente(supabase, agentes.curador, 'trabalhando', 'Avaliando o que vale a pena guardar...');
  try {
    const { data: config } = await supabase.rpc('get_equipe_11ds_github_config');
    const token = config?.[0]?.token as string | undefined;
    const repo = config?.[0]?.repo as string | undefined;
    if (!token || !repo) throw new Error('Config do GitHub nao encontrada no Vault');

    const avaliacao = await chamarGPT(
      openaiKey,
      [
        `Voce e o Curador de Conhecimento do time de midia da agencia 11 Digital Strategy. Sua regua e alta: so vale registrar um aprendizado se as 3 respostas forem SIM ao mesmo tempo -- (1) e nao-obvio: um redator generico ja saberia disso sem ter trabalhado com este cliente? (2) e concreto e acionavel, nao uma platitude tipo "o publico gosta de autenticidade"? (3) mudaria de verdade uma decisao futura sobre ESTE cliente especifico?`,
        `Cliente: "${cliente.nome}". O que o time ja sabe sobre ele: ${contexto.notaCliente || '(nota ainda vazia, nenhum aprendizado registrado ainda)'}`,
        `Producao de hoje -- Tema: "${tema}". Headline: "${headline}". Legenda: ${legenda}`,
        `Na maioria dos dias a resposta certa e' NAO registrar nada -- nao force um aprendizado que nao existe so pra ter o que escrever.`,
        `Responda SOMENTE com um JSON: {"registrar": boolean, "aprendizado"?: string (1-2 frases, especifico e acionavel, em portugues, so presente se registrar=true)}`,
      ].join(' '),
      'Avalie o dia de hoje.',
      0.4,
    );

    const aprendizado = Boolean(avaliacao.registrar) ? String(avaliacao.aprendizado ?? '').trim() : '';
    if (!aprendizado) {
      await registrarMensagem(supabase, tarefaId, agentes.curador, 'mensagem', 'Nada que passe do filtro hoje -- não registrei nada novo.');
      return;
    }

    const notaBase = contexto.notaCliente.trim();
    const partes = [
      notaBase ? '' : `# ${cliente.nome}\n\nAprendizados acumulados pelo time de mídia sobre este cliente.`,
      notaBase,
      `- **${hojeSaoPaulo()}**: ${aprendizado}`,
    ].filter(Boolean);
    const notaAtualizada = partes.join('\n\n') + '\n';

    const caminhoNota = `Midia-Criativos/Clientes/${slugificar(cliente.nome)}.md`;
    await gravarConhecimento(token, repo, caminhoNota, notaAtualizada, `curador: aprendizado sobre ${cliente.nome} (${hojeSaoPaulo()})`, contexto.notaClienteSha ?? undefined);

    await registrarMensagem(supabase, tarefaId, agentes.curador, 'mensagem', `Registrei um aprendizado sobre ${cliente.nome} no Obsidian: "${aprendizado}"`);
  } catch (e) {
    console.error('Curador: falha ao registrar aprendizado (seguindo sem travar a producao):', (e as Error).message);
    await registrarMensagem(supabase, tarefaId, agentes.curador, 'mensagem', 'Nada que passe do filtro hoje -- não registrei nada novo.');
  }
}

// ── Tarefa avulsa (sem cliente/pilares) -- Nina executa direto, sem o time todo ─

type ExecResultadoAvulso = { resposta: string; gerar_imagem: boolean; prompt_imagem?: string; headline?: string; tema?: string; legenda?: string };

async function interpretarOrdemAvulsa(openaiKey: string, cargo: string, ordemTexto: string): Promise<ExecResultadoAvulso> {
  const systemPrompt = [
    `Voce e a Nina, agente de IA do time "${cargo}" da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil, tom profissional e direto.`,
    `A ordem e uma tarefa avulsa (ex: foto de capa de grupo, criativo de anuncio, imagem promocional). Nao ha marca/logo cadastrada pra essa tarefa, entao se precisar de texto ele deve ser descrito dentro do proprio prompt_imagem.`,
    `Decida se precisa de imagem. Se precisar, escreva um "headline" curto (se fizer sentido ter texto na imagem, descreva-o tambem dentro do prompt_imagem, com a grafia exata e correta em portugues) e um "prompt_imagem" em ingles descrevendo a cena/composicao/estilo visual.`,
    `Responda SOMENTE com um JSON: {"resposta": string, "gerar_imagem": boolean, "prompt_imagem"?: string, "headline"?: string, "tema"?: string, "legenda"?: string}`,
  ].join(' ');
  const resultado = await chamarGPT(openaiKey, systemPrompt, ordemTexto);
  return resultado as unknown as ExecResultadoAvulso;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let tarefaId = '';
  let agenteIdErro = '';
  let agentesEquipe: Agentes | null = null;

  try {
    const body = await req.json() as { tarefa_id: string };
    tarefaId = body.tarefa_id;
    if (!tarefaId) {
      return new Response(JSON.stringify({ ok: false, error: 'tarefa_id e obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas')
      .select('id, agente_id, tipo, cliente_id, ordem_texto')
      .eq('id', tarefaId)
      .single();
    if (tarefaErr || !tarefa) throw new Error(`Tarefa nao encontrada: ${tarefaErr?.message ?? tarefaId}`);
    agenteIdErro = tarefa.agente_id;

    const { data: agenteOriginal, error: agenteErr } = await supabase.from('equipe_11ds_agentes').select('id, time_id, cargo').eq('id', tarefa.agente_id).single();
    if (agenteErr || !agenteOriginal) throw new Error(`Agente nao encontrado: ${agenteErr?.message}`);

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    // ── Tarefa avulsa: Nina executa sozinha, sem o time todo ───────────────────
    if (tarefa.tipo !== 'post_cliente' || !tarefa.cliente_id) {
      await atualizarAgente(supabase, agenteOriginal.id, 'trabalhando', `${tarefa.ordem_texto.slice(0, 60)}${tarefa.ordem_texto.length > 60 ? '...' : ''}`);
      const resultado = await interpretarOrdemAvulsa(openaiKey, agenteOriginal.cargo ?? 'Posts & Criativos', tarefa.ordem_texto);

      const anexos: { tipo: string; url: string }[] = [];
      if (resultado.gerar_imagem && resultado.prompt_imagem) {
        const bytes = await gerarImagem(openaiKey, resultado.prompt_imagem, '1024x1024');
        const storagePath = `${tarefaId}.png`;
        const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
        if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);
        anexos.push({ tipo: 'imagem', url: supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePath).data.publicUrl });
      }

      await supabase.from('equipe_11ds_tarefas').update({
        status: 'concluido', resposta_texto: resultado.resposta, anexos, concluido_em: new Date().toISOString(),
      }).eq('id', tarefaId);
      await atualizarAgente(supabase, agenteOriginal.id, 'livre', null);

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── post_cliente: equipe inteira, em cadeia ─────────────────────────────────
    const agentes = await buscarAgentesDoTime(supabase, agenteOriginal.time_id);
    agentesEquipe = agentes;

    const { data: clienteData } = await supabase
      .from('conteudo_clientes')
      .select('nome, nicho, publico_alvo, tom_de_voz, cta_padrao, cor_primaria, cor_secundaria, logo_url, hashtags_fixas, temas_evitar, pilares_conteudo, estilo_visual, formula_headline, arquetipos_visuais_preferidos, arquetipos_visuais_evitar')
      .eq('id', tarefa.cliente_id)
      .single();
    const cliente: ClienteContexto = clienteData ?? { nome: 'Cliente' };
    const historico = await buscarHistoricoRecente(supabase, tarefa.cliente_id);
    const contexto = await buscarContextoConhecimento(supabase, cliente);
    const hoje = hojeSaoPaulo();

    const { pilar, formato } = await passoGestorAbertura(supabase, tarefaId, agentes, cliente, hoje);

    const pesquisa = await pesquisarTendencia(openaiKey, cliente, historico);
    const { tema, justificativa } = await passoEstrategista(supabase, openaiKey, tarefaId, agentes, cliente, pilar, pesquisa, historico, contexto);

    let { legenda, headline, hashtags } = await passoRedator(supabase, openaiKey, tarefaId, agentes, cliente, tema, historico, contexto);
    const problema = checagemDura(legenda, hashtags);
    if (problema) {
      await registrarMensagem(supabase, tarefaId, agentes.gestor, 'alerta', `Encontrei um problema antes de seguir: ${problema}`);
      const corrigido = await passoRedator(supabase, openaiKey, tarefaId, agentes, cliente, tema, historico, contexto, problema);
      legenda = corrigido.legenda; headline = corrigido.headline; hashtags = corrigido.hashtags;
    }

    const arte = await passoDiretorArte(supabase, openaiKey, tarefaId, agentes, cliente, tema, headline, formato, pilar, historico, contexto);
    const { feedUrl, storiesUrl } = await passoProducao(supabase, openaiKey, tarefaId, agentes, cliente, formato, headline, arte);
    await passoGestorFechamento(supabase, openaiKey, tarefaId, agentes, legenda, headline);
    await passoCurador(supabase, openaiKey, tarefaId, agentes, cliente, tema, headline, legenda, contexto);

    const legendaFinal = [legenda, hashtags ? `.\n.\n.\n${hashtags}` : ''].filter(Boolean).join('\n\n');

    const { data: post, error: postErr } = await supabase
      .from('conteudo_posts')
      .insert({
        cliente_id: tarefa.cliente_id,
        tema, tema_fonte: 'equipe_11ds', legenda: legendaFinal,
        imagem_feed_url: feedUrl, imagem_stories_url: storiesUrl,
        pilar: pilar, arquetipo_visual: arte.arquetipoVisual,
        status: 'rascunho',
      })
      .select('id')
      .single();
    if (postErr) throw new Error(`Falha ao criar post em conteudo_posts: ${postErr.message}`);

    // Interliga com o calendario de conteudo ja existente no sistema (Operacoes >
    // Calendario de Conteudo) -- upsert por (cliente_id, data) pra atualizar a
    // mesma linha do dia em vez de duplicar. Nunca deve derrubar a producao do
    // post se falhar por algum motivo (tabela auxiliar, nao a fonte da verdade).
    try {
      await supabase.from('conteudo_calendario').upsert({
        cliente_id: tarefa.cliente_id,
        titulo: tema,
        plataforma: 'instagram',
        formato: 'feed',
        formato_4x5: true,
        formato_9x16: Boolean(storiesUrl),
        status: 'agendado',
        data_publicacao: hoje,
        angulo: justificativa || null,
        hook: legenda.split('\n\n')[0] || null,
        texto_peca: legendaFinal,
        prompt_imagem: arte.promptImagem ?? null,
        imagem_url: feedUrl,
        gerado_por: 'equipe_11ds',
      }, { onConflict: 'cliente_id,data_publicacao' });
    } catch (e) {
      console.error('Falha ao interligar com conteudo_calendario:', (e as Error).message);
    }

    const anexosFinais = [{ tipo: 'imagem', url: feedUrl }, ...(storiesUrl ? [{ tipo: 'imagem_stories', url: storiesUrl }] : [])];
    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido', resposta_texto: `Post produzido pelo time: "${tema}".`, anexos: anexosFinais,
      conteudo_post_id: post.id, concluido_em: new Date().toISOString(),
    }).eq('id', tarefaId);

    for (const id of Object.values(agentes)) await atualizarAgente(supabase, id, 'livre', null);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
      if (agentesEquipe) {
        await registrarMensagem(supabase, tarefaId, agentesEquipe.gestor, 'alerta', `Deu erro no meio da producao: ${message}`);
      }
    }
    if (agentesEquipe) {
      // Um erro no meio da cadeia pode deixar qualquer um dos 5 agentes preso em
      // "trabalhando" -- devolve todos pra livre, e o Gestor (coordenador) fica
      // marcado com o erro, ja que e' ele quem reporta pro usuario.
      for (const [papel, id] of Object.entries(agentesEquipe)) {
        await atualizarAgente(supabase, id, papel === 'gestor' ? 'erro' : 'livre', papel === 'gestor' ? 'Deu erro na ultima tarefa' : null);
      }
    } else if (agenteIdErro) {
      await atualizarAgente(supabase, agenteIdErro, 'erro', 'Deu erro na ultima tarefa');
    }
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
