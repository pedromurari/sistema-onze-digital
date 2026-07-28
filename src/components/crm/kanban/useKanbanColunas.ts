import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface KanbanColuna {
  id: string;
  nome: string;
  ordem: number;
  fase_key?: string | null;
  cor?: string | null;
  meta_leads?: number | null;
  tipo_regra?: string | null; // 'normal' | 'receita' | 'roi'
  lancamento_id?: string | null;
  npa_evento_id?: string | null;
  aula_secreta_evento_id?: string | null;
  leads_quadro_id?: string | null;
}

type EventoTipo = 'lancamento' | 'npa' | 'aula_secreta' | 'leads_quadro';

const DEFAULT_LANCAMENTO_COLUNAS = [
  'Planilha',
  'Grupo Lançamento',
  'Grupo Oferta',
  'Negociação',
  'Follow Up 01',
  'Follow Up 02',
  'Follow Up 03',
  'Matrícula',
] as const;

const DEFAULT_LEADS_QUADRO_COLUNAS = [
  'Novo',
  'Contatado',
  'Respondeu',
  'Qualificado',
  'Vendido',
  'Perdido',
] as const;

const FILTER_KEY: Record<EventoTipo, string> = {
  lancamento: 'lancamento_id',
  npa: 'npa_evento_id',
  aula_secreta: 'aula_secreta_evento_id',
  leads_quadro: 'leads_quadro_id',
};

function buildFilter(tipo: EventoTipo, eventoId: string) {
  return { [FILTER_KEY[tipo]]: `eq.${eventoId}` };
}

function buildInsertBody(tipo: EventoTipo, eventoId: string, nome: string, ordem: number) {
  return { nome, ordem, tipo_regra: 'normal', [FILTER_KEY[tipo]]: eventoId };
}

export async function ensureDefaultLeadsQuadroColunas(quadroId: string): Promise<KanbanColuna[]> {
  const { data: existing, error: fetchError } = await supabase
    .from('kanban_colunas')
    .select('*')
    .eq('leads_quadro_id', quadroId)
    .order('ordem', { ascending: true });

  if (fetchError) throw fetchError;
  if (existing && existing.length > 0) return existing as KanbanColuna[];

  const payload = DEFAULT_LEADS_QUADRO_COLUNAS.map((nome, ordem) => ({
    nome,
    ordem,
    tipo_regra: 'normal',
    leads_quadro_id: quadroId,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('kanban_colunas')
    .insert(payload)
    .select('*')
    .order('ordem', { ascending: true });

  if (insertError) throw insertError;
  return (inserted || []) as KanbanColuna[];
}

export async function ensureDefaultLancamentoKanbanColumns(lancamentoId: string): Promise<KanbanColuna[]> {
  const { data: existing, error: fetchError } = await supabase
    .from('kanban_colunas')
    .select('*')
    .eq('lancamento_id', lancamentoId)
    .order('ordem', { ascending: true });

  if (fetchError) throw fetchError;
  if (existing && existing.length > 0) return existing as KanbanColuna[];

  const payload = DEFAULT_LANCAMENTO_COLUNAS.map((nome, ordem) => ({
    nome,
    ordem,
    tipo_regra: 'normal',
    lancamento_id: lancamentoId,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('kanban_colunas')
    .insert(payload)
    .select('*')
    .order('ordem', { ascending: true });

  if (insertError) throw insertError;
  return (inserted || []) as KanbanColuna[];
}

export function useKanbanColunas(tipo: EventoTipo, eventoId: string) {
  const [colunas, setColunas] = useState<KanbanColuna[]>([]);
  const [loadingColunas, setLoadingColunas] = useState(true);
  const colunasRef = useRef<KanbanColuna[]>([]);
  useEffect(() => { colunasRef.current = colunas; }, [colunas]);

  const load = useCallback(async () => {
    setLoadingColunas(true);
    if (tipo === 'lancamento' || tipo === 'leads_quadro') {
      try {
        const data = tipo === 'lancamento'
          ? await ensureDefaultLancamentoKanbanColumns(eventoId)
          : await ensureDefaultLeadsQuadroColunas(eventoId);
        setColunas(data);
        colunasRef.current = data;
      } catch {
        toast.error('Erro ao carregar colunas do kanban');
      }
      setLoadingColunas(false);
      return;
    }

    const { data, error } = await supabase
      .from('kanban_colunas')
      .select('*')
      .eq(FILTER_KEY[tipo], eventoId)
      .order('ordem', { ascending: true });
    if (!error && data) {
      setColunas(data as KanbanColuna[]);
      colunasRef.current = data as KanbanColuna[];
    }
    setLoadingColunas(false);
  }, [tipo, eventoId]);

  useEffect(() => { if (eventoId) load(); }, [eventoId, load]);

  const addColuna = useCallback(async (nome: string): Promise<KanbanColuna | null> => {
    const ordem = colunasRef.current.length;
    const body = buildInsertBody(tipo, eventoId, nome.trim(), ordem);
    const { data, error } = await supabase.from('kanban_colunas').insert(body).select('*').single();
    if (error || !data) { toast.error('Erro ao criar coluna'); return null; }
    const col = data as KanbanColuna;
    setColunas(prev => [...prev, col]);
    toast.success('Coluna criada!');
    return col;
  }, [tipo, eventoId]);

  const renameColuna = useCallback(async (id: string, nome: string) => {
    const { error } = await supabase.from('kanban_colunas').update({ nome }).eq('id', id);
    if (error) { toast.error('Erro ao renomear'); return; }
    setColunas(prev => prev.map(c => c.id === id ? { ...c, nome } : c));
    toast.success('Renomeado!');
  }, []);

  const deleteColuna = useCallback(async (id: string) => {
    const { error } = await supabase.from('kanban_colunas').delete().eq('id', id);
    if (error) { toast.error('Erro ao apagar coluna'); return; }
    setColunas(prev => prev.filter(c => c.id !== id));
    toast.success('Coluna apagada!');
  }, []);

  const moveColuna = useCallback(async (id: string, direction: 'left' | 'right') => {
    const cols = [...colunasRef.current];
    const idx = cols.findIndex(c => c.id === id);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= cols.length) return;
    [cols[idx], cols[swapIdx]] = [cols[swapIdx], cols[idx]];
    const updated = cols.map((c, i) => ({ ...c, ordem: i }));
    setColunas(updated);
    await Promise.all([
      supabase.from('kanban_colunas').update({ ordem: idx }).eq('id', cols[idx].id),
      supabase.from('kanban_colunas').update({ ordem: swapIdx }).eq('id', cols[swapIdx].id),
    ]);
  }, []);

  const updateRegraColuna = useCallback(async (id: string, regra: Partial<Pick<KanbanColuna, 'meta_leads' | 'tipo_regra' | 'cor'>>) => {
    const { error } = await supabase.from('kanban_colunas').update(regra).eq('id', id);
    if (error) { toast.error('Erro ao salvar regra'); return; }
    setColunas(prev => prev.map(c => c.id === id ? { ...c, ...regra } : c));
    toast.success('Regra salva!');
  }, []);

  return { colunas, colunasRef, loadingColunas, addColuna, renameColuna, deleteColuna, moveColuna, updateRegraColuna };
}
