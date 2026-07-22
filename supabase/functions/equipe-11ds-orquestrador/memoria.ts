export type TipoMemoria =
  | 'empresa' | 'cliente' | 'agente' | 'procedimento' | 'campanha'
  | 'identidade_visual' | 'aprendizado' | 'decisao';

type RegistrarDiretivaInput = {
  solicitanteId: string;
  planoId?: string | null;
  agenteId?: string | null;
  clienteId?: string | null;
  tipo: TipoMemoria;
  escopo: string;
  regra: string;
  resumo: string;
  evidencia?: Record<string, unknown>;
  agentesConsumidores?: string[];
  prioridade?: number;
  substituiId?: string | null;
  origem?: 'usuario' | 'agente';
};

type MemoriaPersistida = {
  id: string;
  tipo: TipoMemoria;
  escopo: string;
  regra: string | null;
  resumo: string;
  status: 'pendente_sincronizacao' | 'ativa' | 'substituida' | 'arquivada';
  caminho_obsidian: string | null;
  github_sha: string | null;
  agentes_consumidores: string[];
};

function texto(valor: unknown, limite = 4000) {
  return String(valor ?? '').trim().slice(0, limite);
}

function slugificar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function sha256(valor: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(valor));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function caminhoConsolidado(tipo: TipoMemoria, clienteSlug?: string | null, escopo?: string) {
  if (clienteSlug) {
    if (tipo === 'identidade_visual') return `Clientes/${clienteSlug}/identidade-visual.md`;
    if (tipo === 'campanha') return `Clientes/${clienteSlug}/campanhas.md`;
    return `Clientes/${clienteSlug}/conhecimento.md`;
  }
  if (tipo === 'procedimento') return `Equipe/Processos/${slugificar(escopo || 'processos-gerais')}.md`;
  return `Equipe/Conhecimento/${slugificar(escopo || tipo)}.md`;
}

export async function registrarDiretiva(supabase: any, input: RegistrarDiretivaInput): Promise<MemoriaPersistida> {
  const regra = texto(input.regra, 6000);
  if (!regra) throw new Error('A diretiva de memória não possui uma regra acionável.');
  const escopo = texto(input.escopo, 160) || 'Equipe 11DS';
  const resumo = texto(input.resumo, 1200) || regra.slice(0, 240);
  let nomeCliente: string | null = null;
  if (input.clienteId) {
    const { data } = await supabase.from('conteudo_clientes').select('nome').eq('id', input.clienteId).maybeSingle();
    nomeCliente = texto(data?.nome, 160) || null;
  }
  const caminho = caminhoConsolidado(input.tipo, nomeCliente ? slugificar(nomeCliente) : null, escopo);
  const origem = input.origem ?? 'usuario';
  const consumidores = [...new Set((input.agentesConsumidores ?? []).map(item => slugificar(texto(item, 100))).filter(Boolean))].slice(0, 20);
  const prioridade = Math.max(0, Math.min(100, Number(input.prioridade ?? (origem === 'usuario' ? 100 : 50))));
  const conteudoHash = await sha256({ cliente_id: input.clienteId ?? null, tipo: input.tipo, escopo: escopo.toLowerCase(), regra: regra.toLowerCase().replace(/\s+/g, ' ') });
  const selecao = 'id,tipo,escopo,regra,resumo,status,caminho_obsidian,github_sha,agentes_consumidores';
  const { data: existente } = await supabase.from('equipe_11ds_memorias').select(selecao)
    .eq('solicitante_id', input.solicitanteId).eq('conteudo_hash', conteudoHash)
    .in('status', ['ativa', 'pendente_sincronizacao']).maybeSingle();
  if (existente) return existente as MemoriaPersistida;
  const { data, error } = await supabase.from('equipe_11ds_memorias').insert({
    solicitante_id: input.solicitanteId,
    plano_id: input.planoId ?? null,
    agente_id: input.agenteId ?? null,
    cliente_id: input.clienteId ?? null,
    tipo: input.tipo,
    escopo,
    regra,
    resumo,
    origem,
    evidencia: input.evidencia ?? {},
    agentes_consumidores: consumidores,
    prioridade,
    substitui_id: input.substituiId ?? null,
    caminho_obsidian: caminho,
    conteudo_hash: conteudoHash,
    confianca: origem === 'usuario' ? 1 : 0.8,
    status: 'pendente_sincronizacao',
    proxima_tentativa_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select(selecao).single();
  if (error) throw new Error(`Falha ao persistir memória: ${error.message}`);
  if (input.substituiId) {
    await supabase.from('equipe_11ds_memorias').update({ status: 'substituida', invalidada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.substituiId).in('status', ['ativa', 'pendente_sincronizacao']);
  }
  return data as MemoriaPersistida;
}

export async function memoriasAtivas(supabase: any, options: { clienteId?: string | null; agenteSlug?: string | null; limite?: number } = {}) {
  let query = supabase.from('equipe_11ds_memorias')
    .select('id,cliente_id,tipo,escopo,regra,resumo,origem,agentes_consumidores,prioridade,status,caminho_obsidian,created_at')
    .in('status', ['ativa', 'pendente_sincronizacao'])
    .order('prioridade', { ascending: false }).order('created_at', { ascending: false }).limit(options.limite ?? 30);
  if (options.clienteId) query = query.or(`cliente_id.eq.${options.clienteId},cliente_id.is.null`);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).filter((memoria: any) => {
    if (!options.agenteSlug) return true;
    const consumidores = Array.isArray(memoria.agentes_consumidores) ? memoria.agentes_consumidores : [];
    return consumidores.length === 0 || consumidores.includes(options.agenteSlug);
  });
}
