import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { memoriasAtivas, registrarDiretiva, type TipoMemoria } from './memoria.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Ferramenta =
  | 'consultar_contexto'
  | 'analisar_com_especialista'
  | 'executar_tarefa'
  | 'gerar_calendario'
  | 'gerar_proximo_post'
  | 'registrar_diretiva'
  | 'curar_memoria';

type Agente = {
  id: string;
  nome: string;
  cargo: string | null;
  slug: string;
  responsabilidade: string | null;
  regras: string[] | null;
  aplica: string[] | null;
  executor_function: string | null;
};

type EtapaProposta = {
  chave: string;
  titulo: string;
  descricao: string;
  agente_slug: string;
  ferramenta: Ferramenta;
  parametros: Record<string, unknown>;
  depende_de: string[];
};

type PlanoProposto = {
  resposta: string;
  resumo: string;
  alteracoes_previstas: string[];
  efeitos_externos: string[];
  etapas: EtapaProposta[];
};

type EtapaPersistida = EtapaProposta & {
  id: string;
  plano_id: string;
  ordem: number;
  agente_id: string | null;
  status: string;
};

const FERRAMENTAS = new Set<Ferramenta>([
  'consultar_contexto',
  'analisar_com_especialista',
  'executar_tarefa',
  'gerar_calendario',
  'gerar_proximo_post',
  'registrar_diretiva',
  'curar_memoria',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function texto(valor: unknown, limite = 4000) {
  return String(valor ?? '').trim().slice(0, limite);
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function agora() {
  return new Date().toISOString();
}

function slugificar(valor: string) {
  return normalizar(valor).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function extrairJson(raw: string) {
  const limpo = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(limpo) as Record<string, unknown>;
}

async function sha256(valor: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(valor));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function chamarGPT(
  openaiKey: string,
  system: string,
  user: string,
  temperature = 0.2,
) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: Deno.env.get('EQUIPE_11DS_MODEL') ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`GPT respondeu ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('GPT não retornou conteúdo.');
  return extrairJson(content);
}

async function consultarSeguro(
  supabase: ReturnType<typeof createClient>,
  nome: string,
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  try {
    const { data, error } = await consulta;
    if (error) return { nome, erro: error.message };
    return { nome, dados: data };
  } catch (error) {
    return { nome, erro: (error as Error).message };
  }
}

async function buscarContextoOperacional(supabase: ReturnType<typeof createClient>) {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const resultados = await Promise.all([
    consultarSeguro(supabase, 'clientes_ativos', supabase.from('conteudo_clientes').select('id,nome,nicho,pilares_conteudo,estilo_visual').eq('ativo', true).limit(30)),
    consultarSeguro(supabase, 'posts_recentes', supabase.from('conteudo_posts').select('cliente_id,tema,pilar,status,created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(30)),
    consultarSeguro(supabase, 'calendario_proximo', supabase.from('conteudo_calendario').select('cliente_id,titulo,status,data_publicacao,gerado_por').gte('data_publicacao', agora().slice(0, 10)).order('data_publicacao').limit(30)),
    consultarSeguro(supabase, 'tarefas_recentes', supabase.from('equipe_11ds_tarefas').select('agente_id,tipo,status,created_at').order('created_at', { ascending: false }).limit(20)),
  ]);
  return resultados;
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'equipe-11ds-orquestrador',
  };
}

function base64ParaTexto(content: string) {
  const bytes = Uint8Array.from(atob(content.replace(/\n/g, '')), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textoParaBase64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

async function listarGithub(token: string, repo: string, caminho: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [] as { name: string; path: string; type: string }[];
  const data = await res.json();
  return Array.isArray(data) ? data as { name: string; path: string; type: string }[] : [];
}

async function lerGithub(token: string, repo: string, caminho: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} ao ler ${caminho}.`);
  const data = await res.json() as { content: string; sha: string };
  return { conteudo: base64ParaTexto(data.content), sha: data.sha };
}

async function gravarGithub(token: string, repo: string, caminho: string, conteudo: string, mensagem: string, sha?: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensagem, content: textoParaBase64(conteudo), ...(sha ? { sha } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} ao gravar ${caminho}: ${(await res.text()).slice(0, 300)}`);
}

async function githubConfig(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.rpc('get_equipe_11ds_github_config');
  const token = data?.[0]?.token as string | undefined;
  const repo = data?.[0]?.repo as string | undefined;
  return token && repo ? { token, repo } : null;
}

async function buscarMemoriaObsidian(
  supabase: ReturnType<typeof createClient>,
  objetivo: string,
  options: { clienteId?: string | null; agenteSlug?: string | null } = {},
) {
  const indice = await memoriasAtivas(supabase, {
    clienteId: options.clienteId,
    agenteSlug: options.agenteSlug,
    limite: 30,
  });
  const config = await githubConfig(supabase);
  if (!config) return { indice, notas: [], aviso: 'Cofre Obsidian não configurado; usando o índice persistido.' };
  const raizes = ['Empresa', 'Clientes', 'Processos', 'Midia-Criativos/Principios', 'Midia-Criativos/Clientes', 'Equipe/Aprendizados'];
  const listagens = (await Promise.all(raizes.map(raiz => listarGithub(config.token, config.repo, raiz)))).flat();
  const termos = new Set(normalizar(objetivo).split(/\W+/).filter(termo => termo.length >= 4));
  const arquivos = listagens
    .filter(item => item.type === 'file' && item.name.endsWith('.md'))
    .map(item => ({ ...item, score: normalizar(item.name).split(/\W+/).filter(termo => termos.has(termo)).length }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8);
  const notas = await Promise.all(arquivos.map(async arquivo => {
    try {
      const nota = await lerGithub(config.token, config.repo, arquivo.path);
      return nota ? { caminho: arquivo.path, conteudo: nota.conteudo.slice(0, 3500) } : null;
    } catch {
      return null;
    }
  }));
  return { indice, notas: notas.filter(Boolean) };
}

function ehDiretivaExplicita(mensagem: string, agente: Agente, contexto: Record<string, unknown>) {
  if (contexto.memoria_explicita === true) return true;
  if (Array.isArray(contexto.referencias) && contexto.referencias.length > 0) return true;
  if (agente.slug === 'curador-conhecimento') return true;
  return /\b(sempre|nunca|quero que|use .+ como|refer[eê]ncia|padr[aã]o|prefiro|aprovad|corrij|corre[cç][aã]o|salv|memor|lembre)\b/i.test(mensagem);
}

function parametrosDiretivaFallback(mensagem: string, contexto: Record<string, unknown>) {
  const referencias = Array.isArray(contexto.referencias) ? contexto.referencias.slice(0, 5) : [];
  const identidadeVisual = referencias.length > 0 || /visual|post|imagem|feed|1:1|logo|tipograf|fotograf/i.test(mensagem);
  return {
    tipo: identidadeVisual ? 'identidade_visual' : 'decisao',
    escopo: identidadeVisual ? 'Identidade visual do cliente' : 'Decisão operacional da Equipe 11DS',
    regra: mensagem,
    resumo: mensagem.slice(0, 220),
    cliente_id: texto(contexto.cliente_id, 80) || null,
    evidencia: { referencias },
    agentes_consumidores: identidadeVisual
      ? ['diretor-arte', 'nina-producao', 'gestor-midia']
      : [],
    prioridade: 100,
  };
}

function planoDeterministico(mensagem: string, agente: Agente, contexto: Record<string, unknown> = {}): PlanoProposto {
  const pedido = normalizar(mensagem);
  const diretiva = ehDiretivaExplicita(mensagem, agente, contexto);
  let ferramenta: Ferramenta = 'executar_tarefa';
  let agenteExecutor = agente.slug;
  let titulo = `Executar com ${agente.nome}`;
  let descricao = mensagem;
  let efeitos = ['Uma tarefa será criada e executada pelo agente responsável.'];
  if (/calendario/.test(pedido)) {
    ferramenta = 'gerar_calendario';
    agenteExecutor = 'gestor-midia';
    titulo = 'Planejar calendário editorial';
    descricao = 'Gerar os próximos 7 dias dos clientes ativos sem sobrescrever dias já produzidos.';
    efeitos = ['O calendário de conteúdo receberá novas ideias para os dias ainda livres.'];
  } else if (/proximo post|novo post|gerar post|criar post|fazer post/.test(pedido)) {
    ferramenta = 'gerar_proximo_post';
    agenteExecutor = ['gestor-midia', 'nina-producao'].includes(agente.slug) ? agente.slug : 'nina-producao';
    titulo = 'Gerar próximo post';
    descricao = 'Iniciar a próxima produção premium dos clientes ativos, mantendo a alternância visual.';
    efeitos = ['Novas tarefas de produção e rascunhos de post poderão ser criados.'];
  }
  const etapas: EtapaProposta[] = [];
  if (diretiva) {
    etapas.push({
      chave: 'registrar-diretiva',
      titulo: 'Guardar sua orientação',
      descricao: 'Salvar a regra confirmada e disponibilizá-la aos agentes responsáveis.',
      agente_slug: 'curador-conhecimento',
      ferramenta: 'registrar_diretiva',
      parametros: parametrosDiretivaFallback(mensagem, contexto),
      depende_de: [],
    });
  }
  const somenteMemoria = diretiva
    && !['gerar_calendario', 'gerar_proximo_post'].includes(ferramenta)
    && (agente.slug === 'curador-conhecimento' || /salv|memor|lembre|use .+ como (padr[aã]o|refer)/i.test(mensagem));
  if (!somenteMemoria) {
    etapas.push({
      chave: 'executar',
      titulo,
      descricao,
      agente_slug: agenteExecutor,
      ferramenta,
      parametros: { ordem_texto: mensagem },
      depende_de: diretiva ? ['registrar-diretiva'] : [],
    });
    etapas.push({
      chave: 'curar',
      titulo: 'Avaliar novo aprendizado',
      descricao: 'Avaliar apenas inferências da equipe que sejam não óbvias, acionáveis e úteis no futuro.',
      agente_slug: 'curador-conhecimento',
      ferramenta: 'curar_memoria',
      parametros: {},
      depende_de: ['executar'],
    });
  }
  return {
    resposta: 'Entendi. Preparei um plano objetivo e vou pedir uma única confirmação antes de agir.',
    resumo: somenteMemoria ? 'Guardar orientação na memória da equipe' : titulo,
    alteracoes_previstas: [
      ...(diretiva ? ['Salvar sua orientação como memória permanente da equipe.'] : []),
      ...(!somenteMemoria ? [descricao, 'Registrar evidências e atualizar o histórico da equipe.'] : []),
    ],
    efeitos_externos: [...(diretiva ? ['A memória confirmada será sincronizada com o Obsidian.'] : []), ...(!somenteMemoria ? efeitos : [])],
    etapas,
  };
}

function sanitizarPlano(
  raw: Record<string, unknown>,
  fallback: PlanoProposto,
  agentes: Map<string, Agente>,
  mensagem: string,
  agenteSolicitado: Agente,
  contexto: Record<string, unknown>,
) {
  const etapasRaw = Array.isArray(raw.etapas) ? raw.etapas : [];
  const chaves = new Set<string>();
  const etapas: EtapaProposta[] = [];
  for (const item of etapasRaw.slice(0, 6)) {
    const etapa = item as Record<string, unknown>;
    const ferramenta = texto(etapa.ferramenta, 80) as Ferramenta;
    const agenteSlug = texto(etapa.agente_slug, 100);
    let chave = slugificar(texto(etapa.chave, 80) || texto(etapa.titulo, 80) || `etapa-${etapas.length + 1}`);
    if (!FERRAMENTAS.has(ferramenta) || !agentes.has(agenteSlug) || !chave || chaves.has(chave)) continue;
    if (ferramenta === 'gerar_calendario' && agenteSlug !== 'gestor-midia') continue;
    if (ferramenta === 'gerar_proximo_post' && !['gestor-midia', 'nina-producao'].includes(agenteSlug)) continue;
    if (ferramenta === 'registrar_diretiva' && agenteSlug !== 'curador-conhecimento') continue;
    if (ferramenta === 'curar_memoria' && agenteSlug !== 'curador-conhecimento') continue;
    chaves.add(chave);
    etapas.push({
      chave,
      titulo: texto(etapa.titulo, 140) || `Etapa ${etapas.length + 1}`,
      descricao: texto(etapa.descricao, 1000) || 'Executar a etapa planejada.',
      agente_slug: agenteSlug,
      ferramenta,
      parametros: etapa.parametros && typeof etapa.parametros === 'object' ? etapa.parametros as Record<string, unknown> : {},
      depende_de: Array.isArray(etapa.depende_de) ? etapa.depende_de.map(valor => slugificar(texto(valor, 80))).filter(Boolean) : [],
    });
  }
  if (!etapas.length) return fallback;

  // Preferências e correções explícitas são ordens já confirmadas pelo usuário.
  // O servidor garante o registro mesmo quando o GPT omite a etapa.
  const diretivaExplicita = ehDiretivaExplicita(mensagem, agenteSolicitado, contexto);
  if (diretivaExplicita && !etapas.some(etapa => etapa.ferramenta === 'registrar_diretiva')) {
    if (etapas.length >= 6) {
      const curadoriaInferida = etapas.findIndex(etapa => etapa.ferramenta === 'curar_memoria');
      etapas.splice(curadoriaInferida >= 0 ? curadoriaInferida : 5, 1);
    }
    etapas.unshift({
      chave: 'registrar-diretiva',
      titulo: 'Guardar sua orientação',
      descricao: 'Salvar a regra confirmada e disponibilizá-la aos agentes que executam e validam a entrega.',
      agente_slug: 'curador-conhecimento',
      ferramenta: 'registrar_diretiva',
      parametros: parametrosDiretivaFallback(mensagem, contexto),
      depende_de: [],
    });
  }
  const chaveDiretiva = etapas.find(etapa => etapa.ferramenta === 'registrar_diretiva')?.chave;
  if (chaveDiretiva) {
    for (const etapa of etapas) {
      if (etapa.chave !== chaveDiretiva && etapa.ferramenta !== 'curar_memoria' && !etapa.depende_de.includes(chaveDiretiva)) {
        etapa.depende_de.unshift(chaveDiretiva);
      }
    }
  }

  const curador = agentes.get('curador-conhecimento');
  const temExecucaoOperacional = etapas.some(etapa => !['registrar_diretiva', 'curar_memoria', 'consultar_contexto'].includes(etapa.ferramenta));
  if (curador && temExecucaoOperacional && !etapas.some(etapa => etapa.ferramenta === 'curar_memoria')) {
    if (etapas.length >= 6) etapas.splice(5);
    etapas.push({
      chave: 'curar',
      titulo: 'Curar aprendizado',
      descricao: 'Guardar apenas o conhecimento não óbvio, concreto e útil para uma decisão futura.',
      agente_slug: curador.slug,
      ferramenta: 'curar_memoria',
      parametros: {},
      depende_de: [etapas[etapas.length - 1].chave],
    });
  }
  const etapasFinais = etapas.slice(0, 6);
  const validas = new Set(etapasFinais.map(etapa => etapa.chave));
  for (const etapa of etapasFinais) etapa.depende_de = etapa.depende_de.filter(dep => validas.has(dep) && dep !== etapa.chave);
  return {
    resposta: texto(raw.resposta, 1200) || fallback.resposta,
    resumo: texto(raw.resumo, 300) || fallback.resumo,
    alteracoes_previstas: Array.isArray(raw.alteracoes_previstas) ? raw.alteracoes_previstas.map(item => texto(item, 400)).filter(Boolean).slice(0, 8) : fallback.alteracoes_previstas,
    efeitos_externos: Array.isArray(raw.efeitos_externos) ? raw.efeitos_externos.map(item => texto(item, 400)).filter(Boolean).slice(0, 8) : fallback.efeitos_externos,
    etapas: etapasFinais,
  } satisfies PlanoProposto;
}

async function planejarComGPT(
  openaiKey: string,
  agente: Agente,
  mensagem: string,
  agentes: Agente[],
  historico: unknown,
  contexto: unknown,
  memoria: unknown,
) {
  const catalogo = agentes.map(item => ({
    slug: item.slug,
    nome: item.nome,
    cargo: item.cargo,
    responsabilidade: item.responsabilidade,
    regras: item.regras,
    ferramentas: item.slug === 'gestor-midia'
      ? ['consultar_contexto', 'analisar_com_especialista', 'executar_tarefa', 'gerar_calendario', 'gerar_proximo_post']
      : item.slug === 'nina-producao'
        ? ['consultar_contexto', 'analisar_com_especialista', 'executar_tarefa', 'gerar_proximo_post']
        : item.slug === 'curador-conhecimento'
          ? ['consultar_contexto', 'analisar_com_especialista', 'registrar_diretiva', 'curar_memoria']
          : ['consultar_contexto', 'analisar_com_especialista', 'executar_tarefa'],
  }));
  const system = [
    'Você é o Orquestrador da Equipe 11DS, uma equipe operacional de especialistas. Planeje em português do Brasil.',
    'Você pode delegar entre todos os agentes. Para pedidos complexos, divida o trabalho por competência e dependência; para pedidos simples, mantenha o plano curto.',
    'Nunca diga que algo foi executado: o plano ainda aguardará UMA confirmação do usuário para todas as etapas.',
    'Escolha apenas agente_slug e ferramenta existentes no catálogo. No máximo 6 etapas.',
    'Use gerar_calendario para alterar o calendário real; gerar_proximo_post para disparar a produção real; executar_tarefa para trabalho operacional do agente; analisar_com_especialista para análise sem efeito externo; consultar_contexto para uma leitura explícita.',
    'Quando o usuário declarar preferência, correção, padrão, referência ou regra, inclua primeiro registrar_diretiva com o Curador. Essa diretiva já foi confirmada pelo usuário e não pode ser vetada pelo GPT.',
    'Use curar_memoria somente para inferências novas descobertas durante uma execução operacional. Não use curar_memoria como condição para guardar orientação explícita.',
    'A imagem final é responsabilidade conjunta: Diretor define conceito e composição, Redator define a mensagem, Nina executa a peça completa e o Gestor bloqueia resultados sem acabamento coeso. O Curador apenas preserva a regra para uso futuro.',
    'Não invente dados; use o contexto fornecido.',
    'Responda somente JSON: {"resposta":string,"resumo":string,"alteracoes_previstas":string[],"efeitos_externos":string[],"etapas":[{"chave":string,"titulo":string,"descricao":string,"agente_slug":string,"ferramenta":string,"parametros":object,"depende_de":string[]}]}',
  ].join(' ');
  return await chamarGPT(openaiKey, system, JSON.stringify({ agente_solicitado: agente, pedido: mensagem, catalogo, historico, contexto_operacional: contexto, memoria_obsidian: memoria }), 0.15);
}

async function registrarMensagem(
  supabase: ReturnType<typeof createClient>,
  agenteId: string,
  solicitanteId: string,
  papel: 'usuario' | 'agente' | 'sistema',
  conteudo: string,
  planoId?: string | null,
) {
  const { error } = await supabase.from('equipe_11ds_chat_mensagens').insert({
    agente_id: agenteId,
    solicitante_id: solicitanteId,
    papel,
    conteudo,
    plano_id: planoId ?? null,
  });
  if (error) throw new Error(`Falha ao registrar conversa: ${error.message}`);
}

async function chamarInterna(supabase: ReturnType<typeof createClient>, nome: string, body: Record<string, unknown>) {
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret) throw new Error('Segredo interno da equipe não encontrado.');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-key': String(cronSecret) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!res.ok || data.ok === false) throw new Error(texto(data.error, 1000) || `${nome} respondeu ${res.status}.`);
  return data;
}

async function executarTarefa(
  supabase: ReturnType<typeof createClient>,
  agente: Agente,
  solicitanteId: string,
  objetivo: string,
  parametros: Record<string, unknown>,
  contextoPlano: Record<string, unknown>,
) {
  const tipo = contextoPlano.tipo === 'post_cliente' ? 'post_cliente' : 'avulso';
  const clienteId = tipo === 'post_cliente' ? texto(contextoPlano.cliente_id, 80) || null : null;
  if (tipo === 'post_cliente' && !clienteId) throw new Error('O plano exige um cliente, mas nenhum cliente válido foi selecionado.');
  const ordem = texto(parametros.ordem_texto, 4000) || objetivo;
  let recorrenteId: string | null = null;
  if (Boolean(contextoPlano.repetir_diariamente)) {
    const { data: recorrente, error: recorrenteError } = await supabase.from('equipe_11ds_recorrentes').insert({
      agente_id: agente.id,
      criado_por: solicitanteId,
      tipo,
      cliente_id: clienteId,
      ordem_texto: ordem,
      ativo: true,
    }).select('id').single();
    if (recorrenteError || !recorrente) throw new Error(`Falha ao criar recorrência: ${recorrenteError?.message ?? 'sem retorno'}`);
    recorrenteId = recorrente.id;
  }
  const { data: tarefa, error } = await supabase.from('equipe_11ds_tarefas').insert({
    agente_id: agente.id,
    criado_por: solicitanteId,
    tipo,
    cliente_id: clienteId,
    ordem_texto: ordem,
    status: 'pendente',
    recorrente_id: recorrenteId,
  }).select('id').single();
  if (error || !tarefa) {
    if (recorrenteId) await supabase.from('equipe_11ds_recorrentes').update({ ativo: false }).eq('id', recorrenteId);
    throw new Error(`Falha ao criar tarefa: ${error?.message ?? 'sem retorno'}`);
  }
  if (!agente.executor_function) throw new Error(`${agente.nome} ainda não possui executor configurado.`);
  const executor = await chamarInterna(supabase, agente.executor_function, { tarefa_id: tarefa.id });
  // O orquestrador registra somente estado e resumo. Dados pessoais/financeiros
  // continuam protegidos na tarefa especializada e não seguem para a curadoria GPT.
  const { data: atualizada } = await supabase.from('equipe_11ds_tarefas').select('status,resposta_texto,erro_mensagem,conteudo_post_id').eq('id', tarefa.id).single();
  return { tarefa_id: tarefa.id, recorrente_id: recorrenteId, executor, tarefa: atualizada };
}

async function analisarComEspecialista(
  openaiKey: string,
  agente: Agente,
  objetivo: string,
  etapa: EtapaPersistida,
  resultadosAnteriores: Record<string, unknown>,
  memoria: unknown,
) {
  const system = [
    `Você é ${agente.nome}, ${agente.cargo ?? 'especialista da 11DS'}.`,
    `Responsabilidade: ${agente.responsabilidade ?? 'entregar análise profissional dentro da sua função'}.`,
    `Regras obrigatórias: ${(agente.regras ?? []).join(' | ')}.`,
    'Analise com profundidade, seja concreto, não invente números e responda somente JSON: {"resposta":string,"evidencia":string}.',
  ].join(' ');
  return await chamarGPT(openaiKey, system, JSON.stringify({ objetivo, etapa: { titulo: etapa.titulo, descricao: etapa.descricao, parametros: etapa.parametros }, resultados_anteriores: resultadosAnteriores, memoria }), 0.25);
}

async function curarMemoria(
  supabase: ReturnType<typeof createClient>,
  openaiKey: string,
  plano: Record<string, unknown>,
  etapa: EtapaPersistida,
  resultados: Record<string, unknown>,
) {
  const decisao = await chamarGPT(openaiKey, [
    'Você é o Curador de Conhecimento da 11DS.',
    'Só grave algo quando os 3 critérios forem verdadeiros simultaneamente: não óbvio; concreto/acionável; muda uma decisão futura.',
    'Na dúvida, não grave. Nunca guarde log cru, texto transitório, segredo, token ou dado pessoal.',
    'Responda somente JSON: {"gravar":boolean,"tipo":"empresa|cliente|agente|procedimento|campanha|identidade_visual|aprendizado|decisao","escopo":string,"titulo":string,"resumo":string,"conteudo_markdown":string,"confianca":number,"motivo":string}.',
  ].join(' '), JSON.stringify({ objetivo: plano.objetivo, resumo_do_plano: plano.resumo, resultados, etapa: etapa.descricao }), 0.1);
  if (!decisao.gravar) return { gravado: false, motivo: texto(decisao.motivo, 600) || 'Não passou na régua de memória permanente.' };
  const valorTipo = texto(decisao.tipo, 50);
  const tipos: TipoMemoria[] = ['empresa', 'cliente', 'agente', 'procedimento', 'campanha', 'identidade_visual', 'aprendizado', 'decisao'];
  const tipo: TipoMemoria = tipos.includes(valorTipo as TipoMemoria) ? valorTipo as TipoMemoria : 'aprendizado';
  const titulo = texto(decisao.titulo, 120) || `Aprendizado ${String(plano.id).slice(0, 8)}`;
  const contexto = (plano.contexto ?? {}) as Record<string, unknown>;
  const memoria = await registrarDiretiva(supabase, {
    solicitanteId: texto(plano.solicitante_id),
    planoId: texto(plano.id),
    agenteId: etapa.agente_id,
    clienteId: texto(contexto.cliente_id, 80) || null,
    tipo,
    escopo: texto(decisao.escopo, 160) || 'Equipe 11DS',
    regra: texto(decisao.conteudo_markdown, 8000) || texto(decisao.resumo, 2000) || titulo,
    resumo: texto(decisao.resumo, 1200) || titulo,
    evidencia: { origem: 'curadoria_inferencial', resultados },
    agentesConsumidores: [],
    prioridade: 50,
    origem: 'agente',
  });
  try {
    await chamarInterna(supabase, 'equipe-11ds-memoria-sync', { memoria_ids: [memoria.id] });
  } catch (error) {
    console.error('Memória inferida persistida, aguardando nova tentativa de sync:', (error as Error).message);
  }
  return {
    gravado: true,
    memoria_id: memoria.id,
    caminho: memoria.caminho_obsidian,
    resumo: memoria.resumo,
    status: memoria.status,
    evidencia: 'Inferência validada pelo Curador e persistida no índice de memória.',
  };
}

async function executarFerramenta(
  supabase: ReturnType<typeof createClient>,
  openaiKey: string,
  plano: Record<string, unknown>,
  etapa: EtapaPersistida,
  agentes: Map<string, Agente>,
  resultados: Record<string, unknown>,
) {
  const agente = agentes.get(etapa.agente_slug);
  if (!agente) throw new Error(`Agente ${etapa.agente_slug} não está disponível.`);
  switch (etapa.ferramenta) {
    case 'consultar_contexto':
      return { banco: await buscarContextoOperacional(supabase), memoria: await buscarMemoriaObsidian(supabase, texto(plano.objetivo)) };
    case 'analisar_com_especialista':
      return await analisarComEspecialista(openaiKey, agente, texto(plano.objetivo), etapa, resultados, await buscarMemoriaObsidian(supabase, texto(plano.objetivo)));
    case 'executar_tarefa':
      return await executarTarefa(supabase, agente, texto(plano.solicitante_id), texto(plano.objetivo), etapa.parametros, (plano.contexto ?? {}) as Record<string, unknown>);
    case 'gerar_calendario':
      return await chamarInterna(supabase, 'equipe-11ds-calendario-executar', {});
    case 'gerar_proximo_post':
      return await chamarInterna(supabase, 'equipe-11ds-diario', {});
    case 'registrar_diretiva': {
      const parametros = etapa.parametros ?? {};
      const valorTipo = texto(parametros.tipo, 50);
      const tipos: TipoMemoria[] = ['empresa', 'cliente', 'agente', 'procedimento', 'campanha', 'identidade_visual', 'aprendizado', 'decisao'];
      const tipo: TipoMemoria = tipos.includes(valorTipo as TipoMemoria) ? valorTipo as TipoMemoria : 'decisao';
      const contexto = (plano.contexto ?? {}) as Record<string, unknown>;
      const evidencia = parametros.evidencia && typeof parametros.evidencia === 'object'
        ? parametros.evidencia as Record<string, unknown>
        : {};
      const memoria = await registrarDiretiva(supabase, {
        solicitanteId: texto(plano.solicitante_id),
        planoId: texto(plano.id),
        agenteId: agente.id,
        clienteId: texto(parametros.cliente_id, 80) || texto(contexto.cliente_id, 80) || null,
        tipo,
        escopo: texto(parametros.escopo, 160) || 'Equipe 11DS',
        regra: texto(parametros.regra, 6000) || texto(plano.objetivo, 6000),
        resumo: texto(parametros.resumo, 1200) || texto(plano.objetivo, 1200),
        evidencia,
        agentesConsumidores: Array.isArray(parametros.agentes_consumidores)
          ? parametros.agentes_consumidores.map(item => texto(item, 100)).filter(Boolean)
          : [],
        prioridade: Number(parametros.prioridade ?? 100),
        substituiId: texto(parametros.substitui_id, 80) || null,
        origem: 'usuario',
      });
      let sincronizacao = 'sincronizada';
      try {
        await chamarInterna(supabase, 'equipe-11ds-memoria-sync', { memoria_ids: [memoria.id] });
      } catch (error) {
        sincronizacao = 'pendente';
        console.error('Diretiva persistida, aguardando nova tentativa de sync:', (error as Error).message);
      }
      return {
        gravado: true,
        memoria_id: memoria.id,
        status: memoria.status,
        sincronizacao,
        caminho: memoria.caminho_obsidian,
        resumo: memoria.resumo,
        evidencia: 'Orientação explícita persistida sem veto do Curador e disponibilizada aos agentes consumidores.',
      };
    }
    case 'curar_memoria':
      return await curarMemoria(supabase, openaiKey, plano, etapa, resultados);
    default:
      throw new Error(`Ferramenta ${etapa.ferramenta} não permitida.`);
  }
}

async function executarPlano(supabase: ReturnType<typeof createClient>, planoId: string) {
  const inicio = agora();
  const { data: plano, error: planoError } = await supabase.from('equipe_11ds_planos').select('*').eq('id', planoId).single();
  if (planoError || !plano) return;
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY não configurada.');
    const { data: agentesData } = await supabase.from('equipe_11ds_agentes').select('id,nome,cargo,slug,responsabilidade,regras,aplica,executor_function').not('slug', 'is', null);
    const agentes = new Map(((agentesData ?? []) as Agente[]).map(agente => [agente.slug, agente]));
    const { data: etapasData } = await supabase.from('equipe_11ds_plano_etapas').select('*').eq('plano_id', planoId).order('ordem');
    const etapas = (etapasData ?? []) as EtapaPersistida[];
    const resultados: Record<string, unknown> = {};
    for (const etapa of etapas) {
      const dependenciasFalhas = etapa.depende_de.filter(dep => !Object.prototype.hasOwnProperty.call(resultados, dep));
      if (dependenciasFalhas.length) throw new Error(`A etapa ${etapa.titulo} depende de etapa(s) sem resultado: ${dependenciasFalhas.join(', ')}.`);
      const ferramentaValida = FERRAMENTAS.has(etapa.ferramenta);
      if (!ferramentaValida) throw new Error(`Ferramenta não permitida: ${etapa.ferramenta}.`);
      const chamadaInicio = Date.now();
      const entradaHash = await sha256({ ferramenta: etapa.ferramenta, parametros: etapa.parametros, plano: plano.id });
      await supabase.from('equipe_11ds_plano_etapas').update({ status: 'executando', tentativas: 1, iniciado_em: agora(), updated_at: agora() }).eq('id', etapa.id);
      const { data: chamada, error: chamadaError } = await supabase.from('equipe_11ds_ferramenta_chamadas').insert({ plano_id: plano.id, etapa_id: etapa.id, ferramenta: etapa.ferramenta, entrada_hash: entradaHash }).select('id').single();
      if (chamadaError || !chamada) throw new Error(`Falha ao abrir auditoria da ferramenta: ${chamadaError?.message}`);
      try {
        const resultado = await executarFerramenta(supabase, openaiKey, plano, etapa, agentes, resultados);
        resultados[etapa.chave] = resultado;
        const evidencia = texto((resultado as Record<string, unknown>)?.evidencia, 1200) || `Etapa concluída por ${agentes.get(etapa.agente_slug)?.nome ?? etapa.agente_slug}.`;
        await supabase.from('equipe_11ds_ferramenta_chamadas').update({ status: 'concluida', resultado, evidencia, duracao_ms: Date.now() - chamadaInicio, concluido_em: agora() }).eq('id', chamada.id);
        await supabase.from('equipe_11ds_plano_etapas').update({ status: 'concluida', resultado, evidencia, erro_mensagem: null, concluido_em: agora(), updated_at: agora() }).eq('id', etapa.id);
      } catch (error) {
        const mensagem = (error as Error).message;
        await supabase.from('equipe_11ds_ferramenta_chamadas').update({ status: 'erro', erro_mensagem: mensagem, duracao_ms: Date.now() - chamadaInicio, concluido_em: agora() }).eq('id', chamada.id);
        await supabase.from('equipe_11ds_plano_etapas').update({ status: 'erro', erro_mensagem: mensagem, concluido_em: agora(), updated_at: agora() }).eq('id', etapa.id);
        throw error;
      }
    }
    const concluidas = etapas.length;
    const resumo = `Plano concluído: ${concluidas} etapa(s) executada(s) com evidências registradas.`;
    await supabase.from('equipe_11ds_planos').update({ status: 'concluida', resultado_resumo: resumo, erro_mensagem: null, concluido_em: agora(), updated_at: agora() }).eq('id', plano.id);
    await registrarMensagem(supabase, plano.agente_responsavel_id, plano.solicitante_id, 'sistema', resumo, plano.id);
  } catch (error) {
    const mensagem = (error as Error).message;
    await supabase.from('equipe_11ds_plano_etapas').update({ status: 'cancelada', concluido_em: agora(), updated_at: agora() }).eq('plano_id', plano.id).in('status', ['planejada', 'aguardando']);
    await supabase.from('equipe_11ds_planos').update({ status: 'erro', erro_mensagem: mensagem, concluido_em: agora(), updated_at: agora() }).eq('id', plano.id);
    await registrarMensagem(supabase, plano.agente_responsavel_id, plano.solicitante_id, 'sistema', `O plano parou com segurança: ${mensagem}`, plano.id).catch(() => undefined);
    console.error(`Plano ${plano.id} falhou depois de ${Date.now() - Date.parse(inicio)}ms:`, mensagem);
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ ok: false, error: 'Configuração do Supabase ausente.' }, 500);
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Não autenticado.' }, 401);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await auth.auth.getUser();
  if (userError || !user) return json({ ok: false, error: 'Sessão inválida.' }, 401);

  try {
    const body = await req.json() as { operacao?: 'planejar' | 'confirmar' | 'cancelar' | 'status' | 'health'; agente_id?: string; mensagem?: string; plano_id?: string; versao_hash?: string; contexto?: Record<string, unknown> };
    const operacao = body.operacao ?? 'planejar';
    if (operacao === 'health') return json({ ok: true, servico: 'equipe-11ds-orquestrador', versao: '1.0.0' });
    const agenteId = texto(body.agente_id, 80);
    if (!agenteId) return json({ ok: false, error: 'agente_id é obrigatório.' }, 400);
    const { data: agenteData, error: agenteError } = await supabase.from('equipe_11ds_agentes').select('id,nome,cargo,slug,responsabilidade,regras,aplica,executor_function').eq('id', agenteId).single();
    if (agenteError || !agenteData?.slug) return json({ ok: false, error: 'Agente não encontrado.' }, 404);
    const agente = agenteData as Agente;

    if (operacao === 'planejar') {
      const mensagem = texto(body.mensagem, 4000);
      if (!mensagem) return json({ ok: false, error: 'Mensagem é obrigatória.' }, 400);
      const { data: planoAberto } = await supabase.from('equipe_11ds_planos').select('id,status').eq('solicitante_id', user.id).eq('agente_responsavel_id', agente.id).in('status', ['aguardando_confirmacao', 'executando']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (planoAberto) return json({ ok: false, error: 'Este agente já possui um plano aguardando confirmação ou em execução.', plano_id: planoAberto.id }, 409);
      await registrarMensagem(supabase, agente.id, user.id, 'usuario', mensagem);
      const [{ data: agentesData }, { data: historico }, contexto, memoria] = await Promise.all([
        supabase.from('equipe_11ds_agentes').select('id,nome,cargo,slug,responsabilidade,regras,aplica,executor_function').not('slug', 'is', null),
        supabase.from('equipe_11ds_chat_mensagens').select('papel,conteudo,created_at').eq('agente_id', agente.id).eq('solicitante_id', user.id).order('created_at', { ascending: false }).limit(10),
        buscarContextoOperacional(supabase),
        buscarMemoriaObsidian(supabase, mensagem, {
          clienteId: texto(body.contexto?.cliente_id, 80) || null,
          agenteSlug: agente.slug,
        }),
      ]);
      const agentes = (agentesData ?? []) as Agente[];
      const mapaAgentes = new Map(agentes.map(item => [item.slug, item]));
      const contextoPedido = body.contexto ?? {};
      const fallback = planoDeterministico(mensagem, agente, contextoPedido);
      let proposta = fallback;
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          proposta = sanitizarPlano(
            await planejarComGPT(openaiKey, agente, mensagem, agentes, (historico ?? []).reverse(), contexto, memoria),
            fallback,
            mapaAgentes,
            mensagem,
            agente,
            contextoPedido,
          );
        } catch (error) {
          console.error('Planejamento GPT caiu no fallback seguro:', (error as Error).message);
        }
      }
      const versaoHash = await sha256({ objetivo: mensagem, contexto: body.contexto ?? {}, proposta });
      const { data: plano, error: planoError } = await supabase.from('equipe_11ds_planos').insert({
        solicitante_id: user.id,
        agente_responsavel_id: agente.id,
        objetivo: mensagem,
        resumo: proposta.resumo,
        status: 'aguardando_confirmacao',
        contexto: body.contexto ?? {},
        alteracoes_previstas: proposta.alteracoes_previstas,
        efeitos_externos: proposta.efeitos_externos,
        versao_hash: versaoHash,
      }).select('*').single();
      if (planoError || !plano) throw new Error(`Falha ao salvar plano: ${planoError?.message ?? 'sem retorno'}`);
      const etapasInsert = proposta.etapas.map((etapa, index) => ({
        plano_id: plano.id,
        chave: etapa.chave,
        ordem: index + 1,
        agente_id: mapaAgentes.get(etapa.agente_slug)?.id ?? null,
        agente_slug: etapa.agente_slug,
        titulo: etapa.titulo,
        descricao: etapa.descricao,
        ferramenta: etapa.ferramenta,
        parametros: etapa.parametros,
        depende_de: etapa.depende_de,
        status: index === 0 ? 'planejada' : 'aguardando',
      }));
      const { data: etapas, error: etapasError } = await supabase.from('equipe_11ds_plano_etapas').insert(etapasInsert).select('*').order('ordem');
      if (etapasError) {
        await supabase.from('equipe_11ds_planos').delete().eq('id', plano.id);
        throw new Error(`Falha ao salvar etapas: ${etapasError.message}`);
      }
      const resposta = `${proposta.resposta}\n\n${proposta.resumo}\n\nRevise o plano abaixo e confirme uma vez para a equipe executar tudo.`;
      await registrarMensagem(supabase, agente.id, user.id, 'agente', resposta, plano.id);
      return json({ ok: true, resposta, plano, etapas });
    }

    const planoId = texto(body.plano_id, 80);
    if (!planoId) return json({ ok: false, error: 'plano_id é obrigatório.' }, 400);
    const { data: plano, error: planoError } = await supabase.from('equipe_11ds_planos').select('*').eq('id', planoId).eq('solicitante_id', user.id).eq('agente_responsavel_id', agente.id).single();
    if (planoError || !plano) return json({ ok: false, error: 'Plano não encontrado.' }, 404);
    if (operacao === 'status') {
      const { data: etapas } = await supabase.from('equipe_11ds_plano_etapas').select('*').eq('plano_id', plano.id).order('ordem');
      return json({ ok: true, plano, etapas });
    }
    if (plano.status !== 'aguardando_confirmacao') return json({ ok: false, error: 'Este plano já foi tratado.', plano }, 409);
    if (operacao === 'cancelar') {
      await supabase.from('equipe_11ds_planos').update({ status: 'cancelada', concluido_em: agora(), updated_at: agora() }).eq('id', plano.id);
      await supabase.from('equipe_11ds_plano_etapas').update({ status: 'cancelada', concluido_em: agora(), updated_at: agora() }).eq('plano_id', plano.id);
      const resposta = 'Plano cancelado. Nenhuma etapa foi executada.';
      await registrarMensagem(supabase, agente.id, user.id, 'sistema', resposta, plano.id);
      return json({ ok: true, resposta, plano: { ...plano, status: 'cancelada' } });
    }
    if (operacao !== 'confirmar') return json({ ok: false, error: 'Operação inválida.' }, 400);
    if (texto(body.versao_hash, 100) !== plano.versao_hash) return json({ ok: false, error: 'O plano mudou. Recarregue e revise a versão atual antes de confirmar.' }, 409);
    const confirmado = agora();
    const { data: confirmadoData, error: confirmarError } = await supabase.from('equipe_11ds_planos').update({ status: 'executando', confirmado_em: confirmado, iniciado_em: confirmado, updated_at: confirmado }).eq('id', plano.id).eq('status', 'aguardando_confirmacao').select('id').maybeSingle();
    if (confirmarError) throw new Error(`Falha ao confirmar plano: ${confirmarError.message}`);
    if (!confirmadoData) return json({ ok: false, error: 'Este plano já foi iniciado por outra confirmação.' }, 409);
    await registrarMensagem(supabase, agente.id, user.id, 'sistema', 'Plano confirmado. A equipe iniciou a execução e registrará cada evidência aqui.', plano.id);
    EdgeRuntime.waitUntil(executarPlano(supabase, plano.id));
    return json({ ok: true, resposta: 'Plano confirmado e iniciado.', plano: { ...plano, status: 'executando', confirmado_em: confirmado, iniciado_em: confirmado } }, 202);
  } catch (error) {
    const mensagem = (error as Error).message ?? String(error);
    console.error('equipe-11ds-orquestrador:', mensagem);
    return json({ ok: false, error: mensagem }, 500);
  }
});
