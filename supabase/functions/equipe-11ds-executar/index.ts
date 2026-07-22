import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { registrarDiretiva } from './memoria.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type EstiloVisual = 'manchete' | 'editorial';
type FormatoDia = 'tipografico' | 'fotografico';
type AvaliacaoVisual = { aprovado: boolean; motivo: string; ajuste: string };
type BlueprintVisual = {
  id: string | null;
  nome: string;
  tipo: FormatoDia;
  versao: number;
  base_visual_url: string | null;
  referencia_url: string | null;
  spec: Record<string, unknown>;
};
type QaVisual = {
  status: 'aprovado' | 'reprovado';
  score: number;
  checks: Record<string, boolean>;
  dimensoes: number[];
  contraste: number;
  blueprint_id?: string | null;
  blueprint_versao?: number;
};

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
  fundos_fixos?: string[] | null;
  instagram_handle?: string | null;
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

const CADENCIA_FORMATO: FormatoDia[] = ['tipografico', 'fotografico'];

// Contrato visual compartilhado por todos os agentes. O tema pode variar; a
// assinatura da marca e a hierarquia da peca nao. Mantemos isso em codigo para
// que a identidade nao dependa de uma instrucao solta em um unico prompt.
const DIRECAO_ARTE_PREMIUM = {
  assinatura: 'Feed premium de luxo sobrio: preto profundo, ambar/dourado, contraste alto, textura sutil, luz controlada e acabamento editorial. A identidade da marca precisa ser reconhecivel mesmo com o assunto mudando.',
  tipografico: 'Cartao editorial dominante sobre fundo fixo aprovado da marca: grande, centralizado, com cantos arredondados, borda dourada sutil, cabecalho de perfil, headline hierarquica e CTA discreto na base. Layout, margens, tipografia e CTA sao estaveis; variam somente headline e fundo aprovado.',
  fotografico: 'Fotografia editorial cinematografica de campanha em 1:1 4K: cena ou metafora visual concreta ligada ao tema, ambiente real contextualizado, luz lateral ou de recorte, sombras ricas, profundidade e acentos ambar/dourados. O resultado deve parecer uma imagem cuidadosamente dirigida, composta e retocada por uma equipe completa, nunca uma foto de banco ou imagem generica de IA.',
  proibicoesFotograficas: 'Nunca usar texto, letras, logos ou marcas-d agua na imagem-base; pose passiva olhando para o nada, mao no rosto/queixo, laptop com cafe, livro generico, planta decorativa, fundo vazio, luz frontal de estudio, pele plastificada, infografico ou icones de apresentacao.',
  cta: 'CONFIRA A LEGENDA COMPLETA',
} as const;

function direcaoVisualPara(formato: FormatoDia): string {
  return [
    DIRECAO_ARTE_PREMIUM.assinatura,
    formato === 'tipografico' ? DIRECAO_ARTE_PREMIUM.tipografico : DIRECAO_ARTE_PREMIUM.fotografico,
    formato === 'fotografico' ? `Proibicoes: ${DIRECAO_ARTE_PREMIUM.proibicoesFotograficas}` : '',
  ].filter(Boolean).join(' ');
}

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

async function chamarGPTComImagem(
  openaiKey: string, systemPrompt: string, userPrompt: string, imageUrl: string, temperature = 0.2,
): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI vision error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI nao retornou revisao visual');
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

async function buscarContextoConhecimento(supabase: any, cliente: ClienteContexto, clienteId: string): Promise<ContextoConhecimento> {
  let memoriaPersistida = '';
  try {
    const { data: memorias } = await supabase
      .from('equipe_11ds_memorias')
      .select('resumo,regra,origem,prioridade,agentes_consumidores')
      .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
      .in('status', ['ativa', 'pendente_sincronizacao'])
      .order('prioridade', { ascending: false })
      .limit(30);
    memoriaPersistida = (memorias ?? []).map((memoria: any) => [
      `### ${String(memoria.resumo ?? 'Diretriz')}`,
      String(memoria.regra ?? ''),
      `Origem: ${memoria.origem === 'usuario' ? 'orientação explícita do usuário, prioridade máxima' : 'inferência validada'}`,
      `Consumidores: ${(memoria.agentes_consumidores ?? []).join(', ') || 'equipe inteira'}`,
    ].join('\n')).join('\n\n').slice(0, 7000);
  } catch (error) {
    console.error('Falha ao ler índice de memória; tentando o cofre:', (error as Error).message);
  }
  const vazio: ContextoConhecimento = { notaCliente: memoriaPersistida, notaClienteSha: null, principios: '' };
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

    return {
      notaCliente: [memoriaPersistida, nota?.conteudo ?? ''].filter(Boolean).join('\n\n---\n\n').slice(0, 9000),
      notaClienteSha: nota?.sha ?? null,
      principios,
    };
  } catch (e) {
    console.error('Falha ao buscar contexto do Obsidian (seguindo sem ele):', (e as Error).message);
    return vazio;
  }
}

async function buscarContextoGeralConhecimento(supabase: any, ordem: string): Promise<string> {
  try {
    const { data: config } = await supabase.rpc('get_equipe_11ds_github_config');
    const token = config?.[0]?.token as string | undefined;
    const repo = config?.[0]?.repo as string | undefined;
    if (!token || !repo) return '';
    const termos = new Set(slugificar(ordem).split('-').filter(t => t.length >= 4));
    const raizes = ['Empresa', 'Clientes', 'Processos', 'Equipe/Aprendizados', 'Midia-Criativos/Principios'];
    const arquivos = (await Promise.all(raizes.map(async raiz => {
      const itens = await listarDiretorio(token, repo, raiz);
      return itens.filter(item => item.type === 'file' && item.name.endsWith('.md')).map(item => ({
        caminho: `${raiz}/${item.name}`,
        score: slugificar(item.name).split('-').filter(t => termos.has(t)).length,
      }));
    }))).flat().sort((a, b) => b.score - a.score).slice(0, 6);
    const notas = await Promise.all(arquivos.map(item => lerConhecimento(token, repo, item.caminho).catch(() => null)));
    return notas.filter((nota): nota is { conteudo: string; sha: string } => Boolean(nota)).map(nota => nota.conteudo).join('\n\n---\n\n').slice(0, 9000);
  } catch (error) {
    console.error('Falha ao ler o cérebro geral do Obsidian:', (error as Error).message);
    return '';
  }
}

// ── Banimentos e menu de ganchos (pesquisa de referencia, ver vault Obsidian) ──

const PALAVRAS_BANIDAS = ['utilizar', 'robusto', 'aprofundar', 'certamente', 'é importante ressaltar', 'você já parou pra pensar', 'você sabia que', 'comente aqui o que esse tema desperta'];

const MENU_GANCHOS = [
  '"Fui de [estado ruim] pra [estado bom] em [tempo] fazendo [mecanismo]."',
  '"3 coisas que eu queria saber antes de [decisao/momento]."',
  '"Eu fiz [a coisa certa] por [tempo] e nao deu em nada. Ate que [virada]."',
  '"Nao e [crenca comum]. E [reframe]."',
  'POV que coloca quem le no centro da cena (ex: "Voce percebe [padrao] e nao sabe o motivo -- e isso:").',
].join(' / ');

const MENU_CTAS = [
  'Pergunta direta que só quem já viveu isso sabe responder (não genérica tipo "o que acha?").',
  'Pede pra marcar/enviar pra alguém específico que precisa ouvir isso agora.',
  'Convite pra salvar o post pra reler depois, com o motivo exato de por que vale salvar.',
  'Provocação/afirmação que deixa no ar, sem pergunta — o silêncio é que gera comentário.',
  'Pede pra completar uma frase nos comentários (ex: "termina essa frase: eu percebi que...").',
].join(' / ');

// ── Passo 1: Gestor (abertura) ─────────────────────────────────────────────────

async function passoGestorAbertura(supabase: any, tarefaId: string, agentes: Agentes, cliente: ClienteContexto, hoje: string): Promise<{ pilar: string | null; formato: FormatoDia }> {
  await atualizarAgente(supabase, agentes.gestor, 'trabalhando', `Abrindo o dia para ${cliente.nome}...`);
  const { pilar, formato } = calcularCalendarioDoDia(cliente.pilares_conteudo ?? [], hoje);
  const briefing = pilar
    ? `Hoje: pilar "${pilar}", formato ${formato}. ${direcaoVisualPara(formato)} Estrategista, defina o angulo.`
    : `Hoje: formato ${formato} (cliente sem pilares cadastrados). ${direcaoVisualPara(formato)} Estrategista, defina o angulo.`;
  await registrarMensagem(supabase, tarefaId, agentes.gestor, 'mensagem', briefing);
  return { pilar, formato };
}

// ── Passo 2: Estrategista ──────────────────────────────────────────────────────

async function passoEstrategista(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, pilar: string | null, formato: FormatoDia, pesquisa: string, historico: HistoricoRecente, contexto: ContextoConhecimento,
): Promise<{ tema: string; justificativa: string }> {
  await atualizarAgente(supabase, agentes.estrategista, 'trabalhando', `Definindo o angulo do dia para ${cliente.nome}...`);

  const systemPrompt = [
    `Voce e a Estrategista de Conteudo do time de midia da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
    `Cliente: "${cliente.nome}". Nicho: ${cliente.nicho ?? 'nao informado'}.`,
    cliente.publico_alvo ? `Publico-alvo: ${cliente.publico_alvo}.` : '',
    pilar ? `O pilar de hoje JA ESTA DECIDIDO pelo calendario: "${pilar}". Sua funcao e escolher o ANGULO/TEMA especifico dentro desse pilar -- nao escolha outro pilar.` : '',
    `Formato visual de hoje: ${formato}. Direcao de arte que deve orientar a escolha do tema: ${direcaoVisualPara(formato)}. Escolha um angulo que seja facil de transformar nesse formato sem enfraquecer a identidade visual.`,
    cliente.temas_evitar?.length ? `NUNCA sugira nada relacionado a: ${cliente.temas_evitar.join(', ')} (brand safety).` : '',
    `REGRA DURA: o time so tem duas ferramentas -- escrever texto e gerar/compor imagem. NUNCA sugira um tema que dependa de algo que o time nao tem: depoimento real de aluno, foto ou video de pessoa real, prova social que nao existe no sistema (numero de formados, avaliacao, caso especifico), cobertura de um evento que de fato aconteceu, ou qualquer dado que o time nao pode verificar. O tema tem que ser 100% produzivel do zero: uma ideia, reflexao, reframe, explicacao de mecanismo, mito x verdade, cenario hipotetico ou POV generico -- nunca um relato que pareça vindo de uma pessoa ou evento real que o time nao presenciou.`,
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
  cliente: ClienteContexto, tema: string, formato: FormatoDia, historico: HistoricoRecente, contexto: ContextoConhecimento, feedbackCorrecao?: string,
): Promise<{ legenda: string; headline: string; hashtags: string }> {
  await atualizarAgente(supabase, agentes.redator, 'trabalhando', `Escrevendo a legenda sobre "${tema.slice(0, 40)}"...`);

  const systemPrompt = [
    `Voce e o Redator-chefe do time de midia da agencia 11 Digital Strategy. Responda sempre em portugues do Brasil.`,
    `Cliente: "${cliente.nome}". Tom de voz: ${cliente.tom_de_voz ?? 'nao informado'}. Tema de hoje: "${tema}".`,
    `Formato visual de hoje: ${formato}. Direcao de arte compartilhada: ${direcaoVisualPara(formato)}. A headline deve fortalecer esta composicao, nunca competir com ela.`,
    `Escreva como uma pessoa real falando (especialista em primeira pessoa, "eu ja vi isso" no sentido de observacao profissional/clinica), nao como comunicado institucional.`,
    `Cuidado com o gancho "Fui de [estado ruim] pra [estado bom]": ele so pode ser usado em primeira pessoa se for sobre uma OBSERVACAO/PADRAO que a instituicao ve repetir (ex: "Eu ja vi gente sair de X pra Y quando..."), nunca como se fosse o relato de uma transformacao pessoal especifica do "eu" -- isso soa como depoimento fabricado mesmo fora do pilar de prova social. Se ficar ambiguo se parece um relato de pessoa real, troque de gancho.`,
    `Gancho (linha 1, sozinha, e o que aparece antes do "...mais"): escolha e adapte um destes formatos comprovados ao tema de hoje -- ${MENU_GANCHOS}`,
    historico.aberturas.length ? `Aberturas usadas nos ultimos posts, NAO repita esse padrao: ${historico.aberturas.map(a => `"${a}..."`).join(' / ')}.` : '',
    contexto.notaCliente ? `O que o time ja aprendeu sobre este cliente especificamente (memoria do time, Obsidian): ${contexto.notaCliente.slice(0, 1500)}` : '',
    contexto.principios ? `Principios gerais de escrita do time, validados por pesquisa (Obsidian, use como reforco, nao repita o texto deles): ${contexto.principios.slice(0, 2500)}` : '',
    `Depois do gancho: PARAGRAFOS SEPARADOS por quebra de linha dupla (\\n\\n entre cada um, nunca bloco unico de texto corrido).`,
    `REGRA DURA contra fabricacao: NUNCA cite numero/percentual/estatistica de estudo nenhum, NUNCA atribua frase a uma pessoa real (viva ou historica) a menos que seja uma citacao amplamente conhecida e verificavel -- e proibido inventar "estudos mostram que X%" ou citar "psicologo/pesquisador Fulano disse Y" pra parecer com dado concreto. Em vez disso, o "dado concreto" exigido no corpo tem que ser: um mecanismo psicologico explicado com precisao, um exemplo hipotetico especifico e detalhado, ou uma observacao clinica generica sem numero inventado (ex: "isso costuma aparecer quando..." em vez de "67% dos casos...").`,
    `Fechamento (nunca repita o mesmo fechamento de post pra post -- varie de verdade): escolha e adapte um destes formatos -- ${MENU_CTAS}${cliente.cta_padrao ? ` (ocasionalmente pode usar variacao de "${cliente.cta_padrao}")` : ''}.`,
    `NUNCA use travessao (—). NUNCA use estas palavras/aberturas (tique de IA): ${PALAVRAS_BANIDAS.join(', ')}. NUNCA use ** dentro da legenda -- essa marcacao e exclusiva do headline. NUNCA termine com a frase literal "comente aqui o que esse tema desperta em você" -- ja foi usada demais.`,
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
  cliente: ClienteContexto, tema: string, headline: string, formato: FormatoDia, pilar: string | null, historico: HistoricoRecente, contexto: ContextoConhecimento, blueprint: BlueprintVisual, feedbackRefacao?: string,
): Promise<{ promptImagem?: string; fundoUrl?: string; arquetipoVisual: string }> {
  await atualizarAgente(supabase, agentes.diretor, 'trabalhando', `Definindo o conceito visual (${formato})...`);

  if (formato === 'tipografico') {
    const fundos = cliente.fundos_fixos ?? [];
    if (!blueprint.base_visual_url && !fundos.length) throw new Error(`Cliente "${cliente.nome}" nao tem base visual aprovada para o blueprint tipografico.`);
    const diasDesdeEpoch = Math.floor(Date.parse(`${hojeSaoPaulo()}T00:00:00Z`) / 86_400_000);
    const indiceFundo = fundos.length ? (diasDesdeEpoch + (feedbackRefacao ? 1 : 0)) % fundos.length : 0;
    const fundoUrl = blueprint.base_visual_url || fundos[indiceFundo];
    const arquetipoVisual = `key art tipografico integral, blueprint ${blueprint.nome} v${blueprint.versao}`;
    await registrarMensagem(supabase, tarefaId, agentes.diretor, 'mensagem', feedbackRefacao
      ? `Refazendo a peça completa dentro do blueprint aprovado: ${feedbackRefacao}`
      : `Conceito e composição definidos pelo blueprint ${blueprint.nome} v${blueprint.versao}.`);
    return { fundoUrl, arquetipoVisual };
  }

  const systemPrompt = [
    `Voce e o Diretor de Arte do time de midia da agencia 11 Digital Strategy. Responda sempre em ingles no campo prompt_imagem (o resto em portugues).`,
    `Cliente: "${cliente.nome}". Tema: "${tema}".`,
    `Direcao de arte obrigatoria: ${direcaoVisualPara('fotografico')}`,
    `Pense antes num UNICO MOMENTO decisivo que faria alguem parar de rolar o feed -- nao uma lista de termos tecnicos soltos. Isso e "key art" (termo de cinema/streaming): uma cena com peso proprio, nunca uma foto generica de banco de imagens.`,
    `NAO inclua texto/headline/tipografia na cena -- o texto e' aplicado depois, separadamente, com fonte real. O prompt_imagem descreve so a fotografia (cena, luz, composicao), nunca menciona palavras/letras/texto.`,
    `Luz: low-key/rim light pra separar do fundo, nunca luz frontal de camera. Enquadramento: rule of thirds, com espaco negativo no terco superior da composicao (e' onde o texto entra depois -- nao preencha essa area com o assunto principal). Fundo: NUNCA vazio/liso -- sempre um ambiente desfocado que sugere contexto, nomeando o que esta desfocado. Sempre fotografia realista (editorial/advertising photography, photorealistic), nunca ilustracao/flat.`,
    `PROIBIDO (cliches de banco de imagens vistos repetidas vezes, banidos explicitamente): ${DIRECAO_ARTE_PREMIUM.proibicoesFotograficas}.`,
    `Em vez de pose passiva de reflexao, descreva um momento com acao ou tensao especifica (um gesto, um instante de decisao, um movimento) -- nunca alguem so "pensando" olhando pro nada.`,
    `Se aparecer pessoa, genero/idade combinando com o publico-alvo.`,
    `Escolha um "arquetipo_visual": pose/enquadramento/acao especifica (nunca categoria generica tipo so "retrato").`,
    historico.arquetipos.length ? `PROIBIDO repetir estes arquetipos recentes, mesmo reformulados: ${historico.arquetipos.join(' | ')}.` : '',
    cliente.arquetipos_visuais_preferidos?.length ? `Familias de arquetipo preferidas deste cliente: ${cliente.arquetipos_visuais_preferidos.join(' | ')}.` : '',
    cliente.arquetipos_visuais_evitar?.length ? `NUNCA use estes arquetipos: ${cliente.arquetipos_visuais_evitar.join(', ')}.` : '',
    contexto.notaCliente ? `O que o time ja aprendeu sobre este cliente especificamente (memoria do time, Obsidian): ${contexto.notaCliente.slice(0, 1500)}` : '',
    contexto.principios ? `Principios gerais de imagem do time, validados por pesquisa (Obsidian, use como reforco): ${contexto.principios.slice(0, 2500)}` : '',
    feedbackRefacao ? `REFACAO OBRIGATORIA: a primeira versao foi reprovada por "${feedbackRefacao}". Corrija exatamente esse problema sem abandonar a direcao de arte.` : '',
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

async function chamarServicoComposicao(
  composeUrl: string,
  compositeSecret: string,
  payload: Record<string, unknown>,
): Promise<{ feed: Uint8Array | null; uploadConcluido: boolean; qaVisual: QaVisual; dimensoes: number[] }> {
  const res = await fetch(composeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-composite-key': compositeSecret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) throw new Error(`Servico de composicao falhou (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { feed_base64?: string; upload_concluido?: boolean; qa_visual?: QaVisual; dimensoes?: number[] };
  if (!data.qa_visual || data.qa_visual.status !== 'aprovado') throw new Error('Compositor nao apresentou QA visual aprovado.');
  if (data.dimensoes?.[0] !== 4096 || data.dimensoes?.[1] !== 4096) throw new Error('Compositor entregou formato diferente de 1:1 4K.');
  return {
    feed: data.feed_base64 ? base64ToBytes(data.feed_base64) : null,
    uploadConcluido: data.upload_concluido === true,
    qaVisual: data.qa_visual,
    dimensoes: data.dimensoes ?? [],
  };
}

async function buscarBlueprintVisual(supabase: any, clienteId: string, formato: FormatoDia): Promise<BlueprintVisual> {
  const { data, error } = await supabase
    .from('equipe_11ds_blueprints')
    .select('id,nome,tipo,versao,base_visual_url,referencia_url,spec')
    .eq('cliente_id', clienteId)
    .eq('tipo', formato)
    .eq('status', 'ativo')
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar blueprint visual: ${error.message}`);
  if (data) return data as BlueprintVisual;
  return {
    id: null,
    nome: `Contrato premium 1:1 — ${formato}`,
    tipo: formato,
    versao: 1,
    base_visual_url: null,
    referencia_url: null,
    spec: {
      canvas: [4096, 4096],
      safe_area: 230,
      finish: 'campaign_key_art',
    },
  };
}

async function passoProducao(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes,
  cliente: ClienteContexto, formato: FormatoDia, headline: string,
  arte: { promptImagem?: string; fundoUrl?: string }, blueprint: BlueprintVisual,
): Promise<{ feedUrl: string; storiesUrl: null; qaVisual: QaVisual; blueprint: BlueprintVisual }> {
  await atualizarAgente(supabase, agentes.nina, 'trabalhando', `Produzindo o post de ${cliente.nome}...`);

  const { data: composeConfig } = await supabase.rpc('get_equipe_11ds_composite_config');
  const composeUrl = composeConfig?.[0]?.url as string | undefined;
  const compositeSecret = composeConfig?.[0]?.secret as string | undefined;
  if (!composeUrl || !compositeSecret) throw new Error('Servico de composicao de imagem nao configurado (Vault vazio)');

  const logoBytes = await baixarLogo(cliente.logo_url);
  const storagePathFeed = `${tarefaId}-feed.png`;
  const { data: signedUpload, error: signedError } = await supabase.storage
    .from('equipe-11ds-criativos')
    .createSignedUploadUrl(storagePathFeed, { upsert: true });
  if (signedError || !signedUpload?.signedUrl) throw new Error(`Falha ao preparar upload 4K: ${signedError?.message ?? 'URL assinada ausente'}`);

  let composto: { feed: Uint8Array | null; uploadConcluido: boolean; qaVisual: QaVisual; dimensoes: number[] };
  if (formato === 'tipografico') {
    const fundoUrl = blueprint.base_visual_url || arte.fundoUrl;
    if (!fundoUrl) throw new Error('Blueprint tipografico nao possui base visual aprovada');
    // Fundo vai por URL, nao base64 -- um PNG 1024x1536 embutido no payload
    // sozinho ja estoura o limite de requisicao da Vercel. O servico Python
    // baixa a imagem ele mesmo.
    composto = await chamarServicoComposicao(composeUrl, compositeSecret, {
      modo: 'tipografico',
      fundo_url: fundoUrl,
      upload_url: signedUpload.signedUrl,
      blueprint,
      logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
      logo_posicao: 'superior-centro',
      headline,
      nome_exibicao: cliente.nome,
      handle: cliente.instagram_handle ?? undefined,
      estilo_visual: cliente.estilo_visual ?? 'manchete',
      cor_primaria: cliente.cor_primaria ?? undefined,
      perfil_visual: 'premium-editorial-amber',
      direcao_visual: DIRECAO_ARTE_PREMIUM.tipografico,
      cta: DIRECAO_ARTE_PREMIUM.cta,
    });
  } else {
    const promptFinal = [
      arte.promptImagem ?? '',
      cliente.cor_primaria ? `Use ${cliente.cor_primaria} as the dominant brand color of the design` : '',
      cliente.cor_secundaria ? `${cliente.cor_secundaria} as a secondary accent color` : '',
      'Premium cinematic editorial campaign key art, composed for a square 1:1 Instagram feed. Stop-scroll composition with rich shadow detail, cinematic color grading, physically believable texture, professional retouching, sharp intentional focal plane and sophisticated art direction. The full frame must feel finished by an art director, retoucher and designer working together. Keep every key subject inside the central 80 percent. No text, letters, logos, watermarks, graphic overlays or stock-photo look.',
    ].filter(Boolean).join('. ');
    const bytesBase = await gerarImagem(openaiKey, promptFinal, '1024x1024');
    composto = await chamarServicoComposicao(composeUrl, compositeSecret, {
      modo: 'fotografico',
      imagem_base64: bytesToBase64(bytesBase),
      upload_url: signedUpload.signedUrl,
      blueprint,
      logo_base64: logoBytes ? bytesToBase64(logoBytes) : undefined,
      logo_posicao: 'superior-esquerda',
      headline, // aplicado via PIL (fonte real, margem segura) -- nunca mais pedido pra IA de imagem desenhar
      estilo_visual: cliente.estilo_visual ?? 'manchete',
      cor_primaria: cliente.cor_primaria ?? undefined,
      perfil_visual: 'premium-editorial-amber',
      direcao_visual: DIRECAO_ARTE_PREMIUM.fotografico,
      cta: DIRECAO_ARTE_PREMIUM.cta,
    });
  }

  if (!composto.uploadConcluido) {
    if (!composto.feed) throw new Error('Compositor nao enviou nem retornou a imagem final.');
    const { error: uploadErr } = await supabase.storage.from('equipe-11ds-criativos').upload(storagePathFeed, composto.feed, { contentType: 'image/png', upsert: true });
    if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);
  }
  const feedUrl = supabase.storage.from('equipe-11ds-criativos').getPublicUrl(storagePathFeed).data.publicUrl;
  await registrarMensagem(
    supabase,
    tarefaId,
    agentes.nina,
    'mensagem',
    `Peça 1:1 4K finalizada como campanha completa. QA visual ${composto.qaVisual.score}/100, blueprint v${blueprint.versao}.`,
  );
  return { feedUrl, storiesUrl: null, qaVisual: composto.qaVisual, blueprint };
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
  cliente: ClienteContexto, tema: string, formato: FormatoDia, legenda: string, headline: string, feedUrl: string | null,
): Promise<AvaliacaoVisual> {
  await atualizarAgente(supabase, agentes.gestor, 'trabalhando', 'Revisando antes de publicar...');
  try {
    const systemPrompt = [
      'Voce e o Gestor de Midia revisando a qualidade final de um post de Instagram antes de publicar como rascunho. Avalie a imagem final e o texto com regua alta, mas sem inventar defeitos invisiveis.',
      `Cliente: "${cliente.nome}". Formato: ${formato}. Direcao de arte obrigatoria: ${direcaoVisualPara(formato)}.`,
      formato === 'fotografico'
        ? 'Reprove fotografia generica, com aparencia de stock ou IA barata, sem cena ligada ao tema, fora da paleta, com luz rasa, baixa legibilidade ou sem impacto de feed.'
        : 'Reprove cartao se logo/identificacao ou headline estiverem ilegiveis, se a hierarquia visual falhar, se a paleta fugir da marca ou se o layout nao parecer um cartao premium consistente.',
      'Responda SOMENTE com JSON: {"aprovado": boolean, "motivo": string (uma linha, em portugues), "ajuste": string (instrucao objetiva para uma unica refacao; vazio se aprovado)}.',
    ].join(' ');
    const contexto = `Tema: "${tema}"\nHeadline: "${headline}"\n\nLegenda:\n${legenda}`;
    const critica = feedUrl
      ? await chamarGPTComImagem(openaiKey, systemPrompt, contexto, feedUrl, 0.2)
      : await chamarGPT(openaiKey, systemPrompt, contexto, 0.2);
    const aprovado = critica.aprovado === true;
    const motivo = String(critica.motivo ?? '');
    const ajuste = String(critica.ajuste ?? motivo ?? '').trim();
    await registrarMensagem(supabase, tarefaId, agentes.gestor, aprovado ? 'aprovacao' : 'alerta', aprovado
      ? `Aprovado visualmente como rascunho. ${motivo}`.trim()
      : `Ressalva visual: ${motivo}. Uma refacao dirigida sera tentada.`);
    return { aprovado, motivo, ajuste };
  } catch (e) {
    // Revisao automatica e' uma camada de qualidade. Indisponibilidade nao pode
    // apagar uma geracao valida nem travar o trabalho do time.
    await registrarMensagem(supabase, tarefaId, agentes.gestor, 'alerta', 'Revisao visual automatica indisponivel; post preservado como rascunho para revisao manual.');
    return { aprovado: true, motivo: 'Revisao visual automatica indisponivel.', ajuste: '' };
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
  clienteId: string, cliente: ClienteContexto, tema: string, headline: string, legenda: string, contexto: ContextoConhecimento,
): Promise<void> {
  await atualizarAgente(supabase, agentes.curador, 'trabalhando', 'Avaliando o que vale a pena guardar...');
  try {
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

    const { data: tarefa } = await supabase.from('equipe_11ds_tarefas').select('criado_por').eq('id', tarefaId).maybeSingle();
    if (!tarefa?.criado_por) throw new Error('Tarefa sem autor para auditar a memória.');
    const memoria = await registrarDiretiva(supabase, {
      solicitanteId: tarefa.criado_por,
      agenteId: agentes.curador,
      clienteId,
      tipo: 'aprendizado',
      escopo: `Aprendizados de ${cliente.nome}`,
      regra: aprendizado,
      resumo: aprendizado.slice(0, 220),
      evidencia: { tarefa_id: tarefaId, tema, headline },
      agentesConsumidores: ['estrategista-conteudo', 'redator-chefe', 'diretor-arte', 'nina-producao', 'gestor-midia'],
      prioridade: 50,
      origem: 'agente',
    });
    await dispararFuncaoInterna(supabase, 'equipe-11ds-memoria-sync').catch(error => {
      console.error('Memória persistida, sync do Obsidian ficou pendente:', (error as Error).message);
    });
    await registrarMensagem(supabase, tarefaId, agentes.curador, 'mensagem', `Aprendizado persistido e auditável: "${memoria.resumo}"`);
  } catch (e) {
    console.error('Curador: falha ao registrar aprendizado (seguindo sem travar a producao):', (e as Error).message);
    await registrarMensagem(supabase, tarefaId, agentes.curador, 'mensagem', 'Nada que passe do filtro hoje -- não registrei nada novo.');
  }
}

// ── Tarefa avulsa: cada especialista executa com a própria ficha de cargo ──

type ExecResultadoAvulso = { resposta: string; gerar_imagem: boolean; prompt_imagem?: string; headline?: string; tema?: string; legenda?: string };
type PerfilAgenteAvulso = { nome: string; cargo: string | null; slug: string | null; responsabilidade: string | null; regras: string[] | null; aplica: string[] | null };

async function interpretarOrdemAvulsa(openaiKey: string, agente: PerfilAgenteAvulso, ordemTexto: string, memoria: string): Promise<ExecResultadoAvulso> {
  const podeGerarImagem = ['nina-producao', 'diretor-arte'].includes(agente.slug ?? '');
  const systemPrompt = [
    `Você é ${agente.nome}, ${agente.cargo ?? 'especialista'} da agência 11 Digital Strategy. Responda em português do Brasil, com profundidade, clareza e ação concreta.`,
    `Sua responsabilidade: ${agente.responsabilidade ?? 'entregar a tarefa dentro da sua especialidade'}.`,
    `Regras que nunca quebra: ${(agente.regras ?? []).join(' | ') || 'não inventar fatos ou resultados'}.`,
    `Métodos que aplica: ${(agente.aplica ?? []).join(' | ') || 'boas práticas profissionais da sua função'}.`,
    memoria ? `Cérebro permanente da equipe no Obsidian (use quando relevante e nunca contradiga uma regra explícita):\n${memoria}` : 'O Obsidian não trouxe nota relevante para esta tarefa.',
    podeGerarImagem
      ? 'Você pode decidir gerar uma imagem. Se gerar, escreva headline curto e prompt_imagem em inglês com composição, estética premium, formato 1:1 e texto exato quando houver.'
      : 'Você não é o produtor visual nesta tarefa: mantenha gerar_imagem=false e entregue seu trabalho especializado em texto.',
    `Responda SOMENTE com um JSON: {"resposta": string, "gerar_imagem": boolean, "prompt_imagem"?: string, "headline"?: string, "tema"?: string, "legenda"?: string}`,
  ].join(' ');
  const resultado = await chamarGPT(openaiKey, systemPrompt, ordemTexto);
  return resultado as unknown as ExecResultadoAvulso;
}

// ── Roteamento de intencao real em ordem avulsa (deterministico, nunca "por
// sorte de prompt") -- algumas frases em linguagem natural pedem uma acao que
// o sistema ja sabe fazer de verdade (rotina diaria, calendario, post de
// hoje), mas cair direto no interpretador generico so devolve texto/pergunta
// de esclarecimento, nunca dispara a acao. Casa por padrao explicito; fora
// disso, segue pro interpretador generico como sempre.

type IntencaoReal = 'rotina_diaria' | 'calendario' | 'post_hoje';

function detectarIntencaoReal(ordemTexto: string): IntencaoReal | null {
  const t = ordemTexto.toLowerCase();
  if (/rotina\s+di[aá]ria/.test(t) || /\brodar?\s+(a\s+)?rotina\b/.test(t) || /\broda\s+tudo\b/.test(t)) return 'rotina_diaria';
  if (/calend[aá]rio/.test(t) && /\b(gera|gerar|planeja|planejar|monta|montar|atualiza|atualizar)\b/.test(t)) return 'calendario';
  if (/\bposts?\b/.test(t) && /\b(pr[oó]ximo|hoje|crie|criar|fa[çc]a|fazer|gera|gerar|monta|montar|publica|publicar)\b/.test(t)) return 'post_hoje';
  return null;
}

async function dispararFuncaoInterna(supabase: any, nomeFuncao: string): Promise<Record<string, unknown>> {
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret) throw new Error('Segredo de cron nao configurado (Vault vazio)');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/${nomeFuncao}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-key': cronSecret },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw new Error(`${nomeFuncao} falhou (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

// ── Pipeline completa de post_cliente, extraida pra ser reaproveitada tanto
// pela tarefa formal (tipo=post_cliente) quanto por uma ordem avulsa que a
// intencao real detectou como pedido de post (ex: "faça o post de hoje").

async function executarPostParaCliente(
  supabase: any, openaiKey: string, tarefaId: string, agentes: Agentes, clienteId: string, hoje: string,
): Promise<{ postId: string; tema: string }> {
  const { data: clienteData } = await supabase
    .from('conteudo_clientes')
    .select('nome, nicho, publico_alvo, tom_de_voz, cta_padrao, cor_primaria, cor_secundaria, logo_url, hashtags_fixas, temas_evitar, pilares_conteudo, estilo_visual, formula_headline, arquetipos_visuais_preferidos, arquetipos_visuais_evitar, fundos_fixos, instagram_handle')
    .eq('id', clienteId)
    .single();
  const cliente: ClienteContexto = clienteData ?? { nome: 'Cliente' };
  const historico = await buscarHistoricoRecente(supabase, clienteId);
  const contexto = await buscarContextoConhecimento(supabase, cliente, clienteId);

  const { pilar, formato } = await passoGestorAbertura(supabase, tarefaId, agentes, cliente, hoje);
  const blueprint = await buscarBlueprintVisual(supabase, clienteId, formato);

  const pesquisa = await pesquisarTendencia(openaiKey, cliente, historico);
  const { tema, justificativa } = await passoEstrategista(supabase, openaiKey, tarefaId, agentes, cliente, pilar, formato, pesquisa, historico, contexto);

  let { legenda, headline, hashtags } = await passoRedator(supabase, openaiKey, tarefaId, agentes, cliente, tema, formato, historico, contexto);
  const problema = checagemDura(legenda, hashtags);
  if (problema) {
    await registrarMensagem(supabase, tarefaId, agentes.gestor, 'alerta', `Encontrei um problema antes de seguir: ${problema}`);
    const corrigido = await passoRedator(supabase, openaiKey, tarefaId, agentes, cliente, tema, formato, historico, contexto, problema);
    legenda = corrigido.legenda; headline = corrigido.headline; hashtags = corrigido.hashtags;
  }

  let arte = await passoDiretorArte(supabase, openaiKey, tarefaId, agentes, cliente, tema, headline, formato, pilar, historico, contexto, blueprint);
  let { feedUrl, storiesUrl, qaVisual } = await passoProducao(supabase, openaiKey, tarefaId, agentes, cliente, formato, headline, arte, blueprint);
  let avaliacaoVisual = await passoGestorFechamento(supabase, openaiKey, tarefaId, agentes, cliente, tema, formato, legenda, headline, feedUrl);

  // Uma unica refacao controlada melhora a qualidade sem abrir um loop de custo.
  // No cartao tipografico ela troca para outro fundo aprovado; no fotografico o
  // Diretor recebe a critica concreta e reconstrói a direcao da cena.
  if (!avaliacaoVisual.aprovado) {
    arte = await passoDiretorArte(supabase, openaiKey, tarefaId, agentes, cliente, tema, headline, formato, pilar, historico, contexto, blueprint, avaliacaoVisual.ajuste || avaliacaoVisual.motivo);
    ({ feedUrl, storiesUrl, qaVisual } = await passoProducao(supabase, openaiKey, tarefaId, agentes, cliente, formato, headline, arte, blueprint));
    avaliacaoVisual = await passoGestorFechamento(supabase, openaiKey, tarefaId, agentes, cliente, tema, formato, legenda, headline, feedUrl);
    if (!avaliacaoVisual.aprovado) {
      await registrarMensagem(supabase, tarefaId, agentes.gestor, 'alerta', `Entrega bloqueada pelo QA visual: ${avaliacaoVisual.motivo}`);
      throw new Error(`Gestor reprovou a peça final após a refação: ${avaliacaoVisual.motivo}`);
    }
  }

  await passoCurador(supabase, openaiKey, tarefaId, agentes, clienteId, cliente, tema, headline, legenda, contexto);

  const legendaFinal = [legenda, hashtags ? `.\n.\n.\n${hashtags}` : ''].filter(Boolean).join('\n\n');

  const { data: post, error: postErr } = await supabase
    .from('conteudo_posts')
    .insert({
      cliente_id: clienteId,
      tema, tema_fonte: 'equipe_11ds', legenda: legendaFinal,
      imagem_feed_url: feedUrl, imagem_stories_url: storiesUrl,
      pilar: pilar, arquetipo_visual: arte.arquetipoVisual,
      blueprint_id: blueprint.id,
      blueprint_versao: blueprint.versao,
      qa_visual: qaVisual,
      qa_visual_status: qaVisual.status,
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
      cliente_id: clienteId,
      titulo: tema,
      plataforma: 'instagram',
      formato: 'feed',
      formato_4x5: false,
      formato_9x16: false,
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

  return { postId: post.id, tema };
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

    const { data: agenteOriginal, error: agenteErr } = await supabase.from('equipe_11ds_agentes').select('id, time_id, nome, cargo, slug, responsabilidade, regras, aplica').eq('id', tarefa.agente_id).single();
    if (agenteErr || !agenteOriginal) throw new Error(`Agente nao encontrado: ${agenteErr?.message}`);

    await supabase.from('equipe_11ds_tarefas').update({ status: 'em_andamento', iniciado_em: new Date().toISOString() }).eq('id', tarefaId);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    // ── Tarefa avulsa: o agente selecionado executa com sua própria identidade ─
    if (tarefa.tipo !== 'post_cliente' || !tarefa.cliente_id) {
      await atualizarAgente(supabase, agenteOriginal.id, 'trabalhando', `${tarefa.ordem_texto.slice(0, 60)}${tarefa.ordem_texto.length > 60 ? '...' : ''}`);

      // Antes de cair no interprete generico (que so responde/pergunta em
      // texto), checa se a ordem em linguagem natural pede uma acao que o
      // sistema ja sabe fazer de verdade -- senao "roda a rotina diaria" ou
      // "faça o post de hoje" viram uma pergunta de esclarecimento em vez de
      // executarem qualquer coisa.
      const intencao = detectarIntencaoReal(tarefa.ordem_texto);

      if (intencao === 'rotina_diaria' || intencao === 'calendario') {
        const nomeFuncao = intencao === 'rotina_diaria' ? 'equipe-11ds-diario' : 'equipe-11ds-calendario-executar';
        const resultado = await dispararFuncaoInterna(supabase, nomeFuncao);
        const resumo = intencao === 'rotina_diaria'
          ? `Rotina diária disparada. ${(resultado as { criadas?: number }).criadas ?? 0} tarefa(s) iniciada(s).`
          : `Calendário atualizado. ${(resultado as { planejados?: number }).planejados ?? 0} dia(s) planejado(s).`;
        await supabase.from('equipe_11ds_tarefas').update({
          status: 'concluido', resposta_texto: resumo, anexos: [], concluido_em: new Date().toISOString(),
        }).eq('id', tarefaId);
        await atualizarAgente(supabase, agenteOriginal.id, 'livre', null);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (intencao === 'post_hoje') {
        const { data: clientesAtivos } = await supabase.from('conteudo_clientes').select('id, nome');
        const lista = (clientesAtivos ?? []) as { id: string; nome: string }[];
        if (lista.length === 1) {
          const agentes = await buscarAgentesDoTime(supabase, agenteOriginal.time_id);
          agentesEquipe = agentes;
          await executarPostParaCliente(supabase, openaiKey, tarefaId, agentes, lista[0].id, hojeSaoPaulo());
          for (const id of Object.values(agentes)) await atualizarAgente(supabase, id, 'livre', null);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (lista.length > 1) {
          const nomes = lista.map(c => c.nome).join(', ');
          await supabase.from('equipe_11ds_tarefas').update({
            status: 'concluido',
            resposta_texto: `Tenho mais de um cliente cadastrado (${nomes}) -- pra criar o post de verdade, use "Post pro cliente" e escolha o cliente antes de mandar a ordem.`,
            concluido_em: new Date().toISOString(),
          }).eq('id', tarefaId);
          await atualizarAgente(supabase, agenteOriginal.id, 'livre', null);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Nenhum cliente cadastrado: cai pro interprete generico abaixo.
      }

      const memoria = await buscarContextoGeralConhecimento(supabase, tarefa.ordem_texto);
      const resultado = await interpretarOrdemAvulsa(openaiKey, agenteOriginal as PerfilAgenteAvulso, tarefa.ordem_texto, memoria);

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

    await executarPostParaCliente(supabase, openaiKey, tarefaId, agentes, tarefa.cliente_id, hojeSaoPaulo());

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
