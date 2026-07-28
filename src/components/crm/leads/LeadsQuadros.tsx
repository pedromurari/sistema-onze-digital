import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, RefreshCw, Flame, Thermometer, Snowflake, UserPlus, LayoutGrid } from 'lucide-react';
import { useKanbanColunas } from '../kanban/useKanbanColunas';
import type { KanbanColuna } from '../kanban/useKanbanColunas';
import {
  KanbanColunaHeader, AddColunaButton,
  RenameColunaModal, ColunaSettingsModal, DeleteColunaModal,
} from '../kanban/KanbanColunasUI';

export interface LeadsFiltro {
  search: string;
  origem: string[];
  fase: string[];
  temperatura: string[];
  produto: string[];
  ddd: number[];
}

interface LeadQuadroRow {
  id: string;
  nome: string;
  filtro: LeadsFiltro;
  created_at: string;
}

interface LeadCard {
  id: string;
  quadro_id: string;
  origem_tabela: string;
  origem_id: string;
  coluna_id: string | null;
}

interface LeadInfo {
  origem_tabela: string;
  origem_id: string;
  nome: string | null;
  telefone: string | null;
  origem: string;
  produto: string | null;
  temperatura: 'quente' | 'morno' | 'frio';
  ddd: number | null;
  cidade: string | null;
  estado: string | null;
}

const TEMP_CFG = {
  quente: { label: 'Quente', icon: Flame, color: 'text-red-600', bg: 'bg-red-50' },
  morno: { label: 'Morno', icon: Thermometer, color: 'text-amber-600', bg: 'bg-amber-50' },
  frio: { label: 'Frio', icon: Snowflake, color: 'text-sky-600', bg: 'bg-sky-50' },
} as const;

const ADD_LIMIT = 2000;
const BATCH_SIZE = 500;

function maskPhone(phone: string | null | undefined) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}–****`;
  return phone.slice(0, 6) + '****';
}

function resumoFiltro(f: LeadsFiltro): string {
  const parts: string[] = [];
  if (f.search) parts.push(`busca "${f.search}"`);
  if (f.origem?.length) parts.push(`${f.origem.length} origem(ns)`);
  if (f.produto?.length) parts.push(`produto: ${f.produto.join(', ')}`);
  if (f.fase?.length) parts.push(`fase: ${f.fase.join(', ')}`);
  if (f.temperatura?.length) parts.push(`temperatura: ${f.temperatura.join(', ')}`);
  if (f.ddd?.length) parts.push(`DDD: ${f.ddd.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'sem filtro (todos os leads)';
}

function applyLeadsFiltro(query: any, f: LeadsFiltro) {
  let q = query;
  if (f.search) q = q.or(`nome.ilike.%${f.search}%,telefone.ilike.%${f.search}%`);
  if (f.origem?.length) q = q.in('origem_tabela', f.origem);
  if (f.fase?.length) q = q.in('fase', f.fase);
  if (f.temperatura?.length) q = q.in('temperatura', f.temperatura);
  if (f.produto?.length) q = q.in('produto', f.produto);
  if (f.ddd?.length) q = q.in('ddd', f.ddd);
  return q;
}

async function fetchLeadsInfo(cards: { origem_tabela: string; origem_id: string }[]) {
  const byTabela = new Map<string, string[]>();
  for (const c of cards) {
    const arr = byTabela.get(c.origem_tabela) ?? [];
    arr.push(c.origem_id);
    byTabela.set(c.origem_tabela, arr);
  }
  const info: Record<string, LeadInfo> = {};
  await Promise.all([...byTabela.entries()].map(async ([tabela, ids]) => {
    const { data } = await supabase.from('leads_unificados' as any)
      .select('*').eq('origem_tabela', tabela).in('origem_id', ids);
    for (const r of (data ?? []) as LeadInfo[]) info[`${r.origem_tabela}:${r.origem_id}`] = r;
  }));
  return info;
}

// ── Lista de quadros ───────────────────────────────────────────────────────────

export function LeadsQuadros({ filtroAtual }: { filtroAtual: LeadsFiltro }) {
  const [quadros, setQuadros] = useState<LeadQuadroRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingQuadros, setLoadingQuadros] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadQuadroRow | null>(null);

  const loadQuadros = useCallback(async () => {
    setLoadingQuadros(true);
    const { data, error } = await supabase.from('leads_quadros' as any)
      .select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar quadros: ' + error.message); setLoadingQuadros(false); return; }
    const list = (data ?? []) as LeadQuadroRow[];
    setQuadros(list);
    setLoadingQuadros(false);
    if (list.length) {
      const { data: cardRows } = await supabase.from('leads_quadro_cards' as any).select('quadro_id');
      const c: Record<string, number> = {};
      for (const row of (cardRows ?? []) as any[]) c[row.quadro_id] = (c[row.quadro_id] ?? 0) + 1;
      setCounts(c);
    }
  }, []);

  useEffect(() => { loadQuadros(); }, [loadQuadros]);

  async function criarQuadro() {
    if (!novoNome.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.from('leads_quadros' as any)
      .insert({ nome: novoNome.trim(), filtro: filtroAtual }).select('*').single();
    setCreating(false);
    if (error || !data) { toast.error('Erro ao criar quadro: ' + (error?.message ?? '')); return; }
    toast.success('Quadro criado!');
    setNovoNome('');
    setCreateOpen(false);
    setQuadros(prev => [data as LeadQuadroRow, ...prev]);
    setSelectedId((data as LeadQuadroRow).id);
  }

  async function apagarQuadro(q: LeadQuadroRow) {
    const { error } = await supabase.from('leads_quadros' as any).delete().eq('id', q.id);
    if (error) { toast.error('Erro ao apagar: ' + error.message); return; }
    toast.success('Quadro apagado');
    setQuadros(prev => prev.filter(x => x.id !== q.id));
    setDeleteTarget(null);
  }

  const selected = quadros.find(q => q.id === selectedId) ?? null;

  if (selected) {
    return (
      <QuadroBoard
        quadro={selected}
        onBack={() => setSelectedId(null)}
        onDeleted={() => { setQuadros(prev => prev.filter(x => x.id !== selected.id)); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Quadros salvos — cada um guarda um filtro de segmento e fases próprias de contato.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Criar quadro com o filtro atual
        </Button>
      </div>

      {loadingQuadros ? (
        <div className="flex items-center justify-center h-32"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : quadros.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center border rounded-lg bg-white">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum quadro criado ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quadros.map(q => (
            <div key={q.id}
              className="border rounded-lg bg-white p-4 hover:shadow-sm transition-shadow cursor-pointer group"
              onClick={() => setSelectedId(q.id)}>
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm">{q.nome}</h4>
                <button onClick={e => { e.stopPropagation(); setDeleteTarget(q); }}
                  className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-none">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resumoFiltro(q.filtro)}</p>
              <p className="text-xs text-muted-foreground mt-2">{counts[q.id] ?? 0} lead(s) no quadro</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar quadro</DialogTitle>
            <DialogDescription>Filtro atual: {resumoFiltro(filtroAtual)}</DialogDescription>
          </DialogHeader>
          <Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do quadro"
            onKeyDown={e => e.key === 'Enter' && criarQuadro()} autoFocus />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={criarQuadro} disabled={creating || !novoNome.trim()}>{creating ? 'Criando…' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar quadro</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.nome}" e as {counts[deleteTarget?.id ?? ''] ?? 0} posições de leads dele serão apagadas.
              Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && apagarQuadro(deleteTarget)}>Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Kanban de um quadro ─────────────────────────────────────────────────────────

function QuadroBoard({ quadro, onBack, onDeleted }: {
  quadro: LeadQuadroRow; onBack: () => void; onDeleted: () => void;
}) {
  const { colunas, loadingColunas, addColuna, renameColuna, deleteColuna, moveColuna, updateRegraColuna } =
    useKanbanColunas('leads_quadro', quadro.id);
  const [cards, setCards] = useState<LeadCard[]>([]);
  const [leadsInfo, setLeadsInfo] = useState<Record<string, LeadInfo>>({});
  const [loadingCards, setLoadingCards] = useState(true);
  const [adding, setAdding] = useState(false);
  const [renamingColuna, setRenamingColuna] = useState<KanbanColuna | null>(null);
  const [deletingColuna, setDeletingColuna] = useState<KanbanColuna | null>(null);
  const [settingsColuna, setSettingsColuna] = useState<KanbanColuna | null>(null);

  const loadCards = useCallback(async () => {
    setLoadingCards(true);
    const { data, error } = await supabase.from('leads_quadro_cards' as any)
      .select('*').eq('quadro_id', quadro.id);
    if (error) { toast.error('Erro ao carregar cartões: ' + error.message); setLoadingCards(false); return; }
    const list = (data ?? []) as LeadCard[];
    setCards(list);
    setLeadsInfo(await fetchLeadsInfo(list));
    setLoadingCards(false);
  }, [quadro.id]);

  useEffect(() => { loadCards(); }, [loadCards]);

  async function adicionarLeadsDoFiltro() {
    setAdding(true);

    // Busca em páginas de BATCH_SIZE (o PostgREST tem um teto de linhas por resposta
    // que independe do .limit() pedido — paginar por range() é o jeito confiável de
    // respeitar ADD_LIMIT sem truncar silenciosamente).
    const matches: { origem_tabela: string; origem_id: string }[] = [];
    let from = 0;
    let atingiuLimite = false;
    while (from < ADD_LIMIT) {
      const to = Math.min(from + BATCH_SIZE, ADD_LIMIT) - 1;
      const { data, error } = await applyLeadsFiltro(
        supabase.from('leads_unificados' as any).select('origem_tabela, origem_id'),
        quadro.filtro,
      ).range(from, to);
      if (error) { toast.error('Erro ao buscar leads do filtro: ' + error.message); setAdding(false); return; }
      const batch = (data ?? []) as { origem_tabela: string; origem_id: string }[];
      matches.push(...batch);
      if (batch.length < (to - from + 1)) break;
      from += BATCH_SIZE;
      if (from >= ADD_LIMIT) atingiuLimite = true;
    }

    const existing = new Set(cards.map(c => `${c.origem_tabela}:${c.origem_id}`));
    const novos = matches.filter(r => !existing.has(`${r.origem_tabela}:${r.origem_id}`));
    if (!novos.length) {
      toast.info('Nenhum lead novo pra adicionar — todos já estão no quadro');
      setAdding(false);
      return;
    }
    const primeiraColuna = colunas[0]?.id ?? null;
    const payload = novos.map(r => ({
      quadro_id: quadro.id, origem_tabela: r.origem_tabela, origem_id: r.origem_id, coluna_id: primeiraColuna,
    }));

    // Insere em lotes também — o mesmo teto de linhas por resposta se aplica ao
    // .select() encadeado no insert.
    const insertedList: LeadCard[] = [];
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      const { data: inserted, error: insertError } = await supabase.from('leads_quadro_cards' as any)
        .insert(chunk).select('*');
      if (insertError) { toast.error('Erro ao adicionar: ' + insertError.message); setAdding(false); return; }
      insertedList.push(...((inserted ?? []) as LeadCard[]));
    }

    setCards(prev => [...prev, ...insertedList]);
    const novaInfo = await fetchLeadsInfo(insertedList);
    setLeadsInfo(prev => ({ ...prev, ...novaInfo }));
    setAdding(false);
    toast.success(`${insertedList.length} lead(s) adicionado(s)` +
      (atingiuLimite ? ` (limite de ${ADD_LIMIT} por vez atingido — refine o filtro pra pegar o restante)` : ''));
  }

  async function moverCard(cardId: string, colunaId: string) {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, coluna_id: colunaId } : c));
    const { error } = await supabase.from('leads_quadro_cards' as any).update({ coluna_id: colunaId }).eq('id', cardId);
    if (error) toast.error('Erro ao mover lead: ' + error.message);
  }

  async function apagarQuadroAtual() {
    const { error } = await supabase.from('leads_quadros' as any).delete().eq('id', quadro.id);
    if (error) { toast.error('Erro ao apagar quadro: ' + error.message); return; }
    toast.success('Quadro apagado');
    onDeleted();
  }

  const { porColuna, semColuna } = useMemo(() => {
    const map = new Map<string, LeadCard[]>();
    for (const col of colunas) map.set(col.id, []);
    const sem: LeadCard[] = [];
    for (const c of cards) {
      if (c.coluna_id && map.has(c.coluna_id)) map.get(c.coluna_id)!.push(c);
      else sem.push(c);
    }
    return { porColuna: map, semColuna: sem };
  }, [cards, colunas]);

  function CardBox({ card }: { card: LeadCard }) {
    const info = leadsInfo[`${card.origem_tabela}:${card.origem_id}`];
    const cfg = info ? TEMP_CFG[info.temperatura] : null;
    return (
      <div className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow">
        <p className="font-medium text-sm truncate">{info?.nome || '—'}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{maskPhone(info?.telefone)}</p>
        <p className="text-xs text-muted-foreground truncate">{info?.origem}</p>
        <div className="flex items-center gap-1 flex-wrap mt-1.5">
          {info?.produto && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-violet-50 text-violet-700">{info.produto}</span>}
          {info?.ddd && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-700">{info.ddd} — {info.cidade}</span>}
          {cfg && (
            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
              <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
            </span>
          )}
        </div>
        <Select value={card.coluna_id ?? undefined} onValueChange={v => moverCard(card.id, v)}>
          <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue placeholder="Mover pra…" /></SelectTrigger>
          <SelectContent>
            {colunas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (loadingColunas || loadingCards) {
    return <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 flex-none">← Quadros</Button>
          <h3 className="font-semibold text-sm truncate">{quadro.nome}</h3>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{resumoFiltro(quadro.filtro)}</span>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <Button variant="outline" size="sm" onClick={adicionarLeadsDoFiltro} disabled={adding} className="gap-1.5">
            {adding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {adding ? 'Adicionando…' : 'Adicionar leads do filtro'}
          </Button>
          <Button variant="outline" size="sm" onClick={apagarQuadroAtual} className="gap-1.5 text-red-600 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5" /> Apagar quadro
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-full pb-4 items-start">
          {colunas.map(coluna => {
            const colCards = porColuna.get(coluna.id) ?? [];
            return (
              <div key={coluna.id} className="group/col flex-shrink-0 w-72">
                <div className="bg-muted rounded-lg p-3 h-full">
                  <KanbanColunaHeader
                    coluna={coluna}
                    count={colCards.length}
                    onRename={() => setRenamingColuna(coluna)}
                    onDelete={() => setDeletingColuna(coluna)}
                    onMoveLeft={() => moveColuna(coluna.id, 'left')}
                    onMoveRight={() => moveColuna(coluna.id, 'right')}
                    onOpenSettings={() => setSettingsColuna(coluna)}
                  />
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {colCards.map(card => <CardBox key={card.id} card={card} />)}
                    {colCards.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">Vazio</p>}
                  </div>
                </div>
              </div>
            );
          })}
          <AddColunaButton onAdd={addColuna} />
        </div>
      </div>

      {semColuna.length > 0 && (
        <div className="border rounded-lg bg-white p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {semColuna.length} lead(s) sem coluna (a coluna original foi apagada) — mova pra uma coluna válida:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {semColuna.map(card => <CardBox key={card.id} card={card} />)}
          </div>
        </div>
      )}

      <RenameColunaModal coluna={renamingColuna}
        onSave={(id, nome) => { renameColuna(id, nome); setRenamingColuna(null); }}
        onClose={() => setRenamingColuna(null)} />
      <ColunaSettingsModal coluna={settingsColuna}
        onSave={(id, updates) => { updateRegraColuna(id, updates); setSettingsColuna(null); }}
        onClose={() => setSettingsColuna(null)} />
      <DeleteColunaModal coluna={deletingColuna}
        leadCount={deletingColuna ? (porColuna.get(deletingColuna.id)?.length ?? 0) : 0}
        onConfirm={(id) => {
          deleteColuna(id);
          setCards(prev => prev.map(c => c.coluna_id === id ? { ...c, coluna_id: null } : c));
          setDeletingColuna(null);
        }}
        onClose={() => setDeletingColuna(null)} />
    </div>
  );
}
