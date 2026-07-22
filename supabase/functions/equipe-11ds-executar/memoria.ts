type TipoMemoria = 'empresa' | 'cliente' | 'agente' | 'procedimento' | 'campanha' | 'identidade_visual' | 'aprendizado' | 'decisao';
type RegistrarDiretivaInput = {
  solicitanteId: string; planoId?: string | null; agenteId?: string | null; clienteId?: string | null;
  tipo: TipoMemoria; escopo: string; regra: string; resumo: string;
  evidencia?: Record<string, unknown>; agentesConsumidores?: string[]; prioridade?: number;
  substituiId?: string | null; origem?: 'usuario' | 'agente';
};
type MemoriaPersistida = { id: string; resumo: string; status: string; caminho_obsidian: string | null };

function texto(valor: unknown, limite = 4000) { return String(valor ?? '').trim().slice(0, limite); }
function slugificar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
async function sha256(valor: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(valor)));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function registrarDiretiva(supabase: any, input: RegistrarDiretivaInput): Promise<MemoriaPersistida> {
  const regra = texto(input.regra, 6000);
  if (!regra) throw new Error('A memória não possui regra acionável.');
  const escopo = texto(input.escopo, 160) || 'Equipe 11DS';
  const resumo = texto(input.resumo, 1200) || regra.slice(0, 240);
  let clienteSlug: string | null = null;
  if (input.clienteId) {
    const { data } = await supabase.from('conteudo_clientes').select('nome').eq('id', input.clienteId).maybeSingle();
    if (data?.nome) clienteSlug = slugificar(String(data.nome));
  }
  const caminho = clienteSlug
    ? input.tipo === 'identidade_visual' ? `Clientes/${clienteSlug}/identidade-visual.md` : `Clientes/${clienteSlug}/conhecimento.md`
    : `Equipe/Conhecimento/${slugificar(escopo)}.md`;
  const origem = input.origem ?? 'usuario';
  const consumidores = [...new Set((input.agentesConsumidores ?? []).map(item => slugificar(texto(item, 100))).filter(Boolean))].slice(0, 20);
  const conteudoHash = await sha256({ cliente_id: input.clienteId ?? null, tipo: input.tipo, escopo: escopo.toLowerCase(), regra: regra.toLowerCase().replace(/\s+/g, ' ') });
  const selecao = 'id,resumo,status,caminho_obsidian';
  const { data: existente } = await supabase.from('equipe_11ds_memorias').select(selecao)
    .eq('solicitante_id', input.solicitanteId).eq('conteudo_hash', conteudoHash)
    .in('status', ['ativa', 'pendente_sincronizacao']).maybeSingle();
  if (existente) return existente as MemoriaPersistida;
  const { data, error } = await supabase.from('equipe_11ds_memorias').insert({
    solicitante_id: input.solicitanteId, plano_id: input.planoId ?? null, agente_id: input.agenteId ?? null,
    cliente_id: input.clienteId ?? null, tipo: input.tipo, escopo, regra, resumo, origem,
    evidencia: input.evidencia ?? {}, agentes_consumidores: consumidores,
    prioridade: Math.max(0, Math.min(100, Number(input.prioridade ?? (origem === 'usuario' ? 100 : 50)))),
    substitui_id: input.substituiId ?? null, caminho_obsidian: caminho, conteudo_hash: conteudoHash,
    confianca: origem === 'usuario' ? 1 : 0.8, status: 'pendente_sincronizacao',
    proxima_tentativa_em: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select(selecao).single();
  if (error) throw new Error(`Falha ao persistir memória: ${error.message}`);
  return data as MemoriaPersistida;
}
