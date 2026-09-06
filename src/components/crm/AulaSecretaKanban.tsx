import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Plus, Search, Users, Target, Loader2, Power, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useKanbanColunas } from './kanban/useKanbanColunas';
import type { KanbanColuna } from './kanban/useKanbanColunas';
import {
  KanbanColunaHeader, AddColunaButton,
  RenameColunaModal, ColunaSettingsModal, DeleteColunaModal,
} from './kanban/KanbanColunasUI';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AulaSecretaEvento {
  id: string;
  nome: string;
  status: 'em_andamento' | 'finalizado' | 'planejamento';
  ativo: boolean;
  created_at: string;
}

interface AulaSecretaLead {
  id: string;
  aula_secreta_evento_id: string;
  nome: string;
  whatsapp: string;
  email?: string;
  fase: string; // UUID of kanban_colunas.id
  matriculado: boolean;
  valor_matricula: number;
  erro?: string;
  observacoes?: string;
  responsavel_id?: string;
  created_at: string;
}

interface AulaSecretaKanbanProps {
  aulaSecretaId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normColName(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').trim();
}

// Derive matriculado flag from column name
function getPhasePayloadByColName(nome: string): Record<string, boolean> {
  const n = normColName(nome);
  if (n.includes('matricul')) return { matriculado: true };
  return { matriculado: false };
}

// Map legacy string fase values → column UUID via fase_id
function resolveLegacyFase(fase: string, colunas: KanbanColuna[]): string {
  const normalized = normColName(fase.replace(/_/g, ' '));
  const col = colunas.find(c =>
    normColName(c.fase_id ?? '') === normalized || normColName(c.nome) === normalized
  );
  return col?.id ?? colunas[0].id;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AulaSecretaKanban({ aulaSecretaId }: AulaSecretaKanbanProps) {
  const [evento, setEvento] = useState<AulaSecretaEvento | null>(null);
  const [leads, setLeads] = useState<AulaSecretaLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ nome: '', whatsapp: '', email: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<AulaSecretaLead | null>(null);
  const [editingLead, setEditingLead] = useState<AulaSecretaLead | null>(null);
  const [editLeadForm, setEditLeadForm] = useState({ nome: '', whatsapp: '', email: '', observacoes: '' });

  // Column management
  const [renamingColuna, setRenamingColuna] = useState<KanbanColuna | null>(null);
  const [deletingColuna, setDeletingColuna] = useState<KanbanColuna | null>(null);
  const [settingsColuna, setSettingsColuna] = useState<KanbanColuna | null>(null);

  // Shared column hook
  const {
    colunas, colunasRef, loadingColunas,
    addColuna, renameColuna, deleteColuna, moveColuna, updateRegraColuna,
  } = useKanbanColunas('aula_secreta', aulaSecretaId);

  // Pending guard
  const pendingUpdates = useRef<Map<string, string>>(new Map());
  const leadsRef = useRef<AulaSecretaLead[]>([]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // ── Auto-migration: fix leads with legacy string fase ──────────────────────
  const migrateLegacyLeads = useCallback(async (
    loadedLeads: AulaSecretaLead[],
    cols: KanbanColuna[],
  ): Promise<AulaSecretaLead[]> => {
    const validIds = new Set(cols.map(c => c.id));
    const legacy = loadedLeads.filter(l => !validIds.has(l.fase));
    if (legacy.length === 0) return loadedLeads;

    const migrated = loadedLeads.map(lead => {
      if (validIds.has(lead.fase)) return lead;
      return { ...lead, fase: resolveLegacyFase(lead.fase, cols) };
    });

    await Promise.all(
      legacy.map(lead => {
        const newFase = (migrated.find(m => m.id === lead.id) as AulaSecretaLead).fase;
        return supabase
          .from('aula_secreta_leads')
          .update({ fase: newFase })
          .eq('id', lead.id)
          .then(({ error }) => {
            if (error) console.warn('Migration failed for lead', lead.id, error.message);
          });
      })
    );

    return migrated;
  }, []);

  // ── Fetch evento + leads ───────────────────────────────────────────────────
  useEffect(() => {
    if (!aulaSecretaId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('aula_secreta_eventos')
        .select('*')
        .eq('id', aulaSecretaId)
        .single();
      if (error) { toast.error('Erro ao carregar Aula Secreta'); setLoading(false); return; }
      if (data) setEvento(data as AulaSecretaEvento);

      const { data: leadData } = await supabase
        .from('aula_secreta_leads')
        .select('*')
        .eq('aula_secreta_evento_id', aulaSecretaId)
        .order('created_at', { ascending: false });
      let loadedLeads = (leadData ?? []) as AulaSecretaLead[];

      if (colunasRef.current.length > 0) {
        loadedLeads = await migrateLegacyLeads(loadedLeads, colunasRef.current);
      }
      setLeads(loadedLeads);
      setLoading(false);
    })();
  }, [aulaSecretaId]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aulaSecretaId) return;
    const channel = supabase
      .channel(`aula-secreta-leads-${aulaSecretaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aula_secreta_leads' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLeads(prev => [payload.new as AulaSecretaLead, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as AulaSecretaLead;
            setLeads(prev => prev.map(l => {
              if (l.id !== updated.id) return l;
              const expected = pendingUpdates.current.get(updated.id);
              if (expected !== undefined) return { ...updated, fase: expected };
              return updated;
            }));
          } else if (payload.eventType === 'DELETE') {
            setLeads(prev => prev.filter(l => l.id !== (payload.old as AulaSecretaLead).id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [aulaSecretaId]);

  // ── Move lead ──────────────────────────────────────────────────────────────
  const handleMoveLead = useCallback(async (leadId: string, colunaId: string) => {
    const previousLeads = leadsRef.current;
    pendingUpdates.current.set(leadId, colunaId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, fase: colunaId } : l));

    const coluna = colunasRef.current.find(c => c.id === colunaId);
    const flagPayload = coluna ? getPhasePayloadByColName(coluna.nome) : {};

    const { data: updated, error } = await supabase
      .from('aula_secreta_leads')
      .update({ fase: colunaId, ...flagPayload })
      .eq('id', leadId)
      .select('*')
      .single();

    if (error || !updated) {
      pendingUpdates.current.delete(leadId);
      toast.error('Erro ao mover lead');
      setLeads(previousLeads);
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? (updated as AulaSecretaLead) : l));
    setTimeout(() => { pendingUpdates.current.delete(leadId); }, 5000);
  }, []);

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggleActive = async () => {
    if (!evento) return;
    const novoAtivo = !evento.ativo;
    const novoStatus = novoAtivo ? 'em_andamento' : 'finalizado';
    setEvento({ ...evento, ativo: novoAtivo, status: novoStatus });
    try {
      if (novoAtivo) await supabase.from('aula_secreta_eventos').update({ ativo: false }).neq('id', aulaSecretaId);
      const { error } = await supabase.from('aula_secreta_eventos').update({ ativo: novoAtivo, status: novoStatus }).eq('id', aulaSecretaId);
      if (error) { setEvento(evento); toast.error(`Erro: ${error.message}`); return; }
      toast.success(`Aula Secreta ${novoAtivo ? 'ativada' : 'desativada'}!`);
    } catch { setEvento(evento); toast.error('Erro inesperado.'); }
  };

  // ── Delete evento ──────────────────────────────────────────────────────────
  const handleDeleteEvento = async () => {
    const { error } = await supabase.from('aula_secreta_eventos').delete().eq('id', aulaSecretaId);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Aula Secreta apagada!');
    setShowDeleteModal(false);
    window.location.reload();
  };

  // ── Delete lead ────────────────────────────────────────────────────────────
  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    const { error } = await supabase.from('aula_secreta_leads').delete().eq('id', leadToDelete.id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    setLeads(prev => prev.filter(l => l.id !== leadToDelete.id));
    toast.success('Lead apagado!');
    setLeadToDelete(null);
  };

  // ── Add lead ───────────────────────────────────────────────────────────────
  const handleAddLead = async () => {
    if (!newLeadForm.nome.trim() || !newLeadForm.whatsapp.trim()) return;
    const primeiraColuna = colunasRef.current[0];
    if (!primeiraColuna) { toast.error('Nenhuma coluna encontrada'); return; }
    setIsAddingLead(true);
    const { error } = await supabase.from('aula_secreta_leads').insert({
      aula_secreta_evento_id: aulaSecretaId,
      nome: newLeadForm.nome,
      whatsapp: newLeadForm.whatsapp,
      email: newLeadForm.email || null,
      fase: primeiraColuna.id,
      matriculado: false,
    });
    if (error) { toast.error(`Erro: ${error.message}`); }
    else {
      toast.success('Lead adicionado!');
      setNewLeadForm({ nome: '', whatsapp: '', email: '' });
      setShowAddLeadModal(false);
    }
    setIsAddingLead(false);
  };

  // ── Edit lead ──────────────────────────────────────────────────────────────
  const handleOpenEditLead = (lead: AulaSecretaLead) => {
    setEditingLead(lead);
    setEditLeadForm({
      nome: lead.nome,
      whatsapp: lead.whatsapp,
      email: lead.email ?? '',
      observacoes: lead.observacoes ?? '',
    });
  };

  const handleSaveEditLead = async () => {
    if (!editingLead) return;
    const { error } = await supabase
      .from('aula_secreta_leads')
      .update({
        nome: editLeadForm.nome,
        whatsapp: editLeadForm.whatsapp,
        email: editLeadForm.email || null,
        observacoes: editLeadForm.observacoes || null,
      })
      .eq('id', editingLead.id);
    if (error) { toast.error('Erro ao salvar lead'); return; }
    setLeads(prev => prev.map(l => l.id === editingLead.id ? { ...l, ...editLeadForm } : l));
    setEditingLead(null);
    toast.success('Lead atualizado!');
  };

  // ── Delete column ──────────────────────────────────────────────────────────
  const handleDeleteColWithLeads = async (id: string) => {
    const remaining = colunasRef.current.filter(c => c.id !== id);
    if (remaining.length > 0) {
      const target = remaining[0].id;
      await supabase.from('aula_secreta_leads').update({ fase: target }).eq('fase', id);
      setLeads(prev => prev.map(l => l.fase === id ? { ...l, fase: target } : l));
    }
    await deleteColuna(id);
    setDeletingColuna(null);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalLeads = leads.length;
  const matriculas = leads.filter(l => l.matriculado).length;
  const receitaMatriculas = leads.reduce((acc, l) => acc + (l.matriculado ? (l.valor_matricula || 397) : 0), 0);

  const filteredLeads = searchQuery
    ? leads.filter(l =>
        l.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.whatsapp.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : leads;

  const getLeadsByColuna = (id: string) => filteredLeads.filter(l => l.fase === id);

  if (loading || !evento) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{evento.nome}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {evento.status === 'finalizado' ? '✅ Finalizado' : '🚀 Em Andamento'}
            </p>
          </div>
          {evento.status === 'finalizado' && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              Finalizado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Apagar
          </Button>
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all text-white ${
              evento.ativo ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600'
            }`}
          >
            <Power className="h-4 w-4" />
            {evento.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Total de Leads</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Matrículas</p>
            <Target className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold">{matriculas}</p>
          <p className="text-xs text-muted-foreground">
            R$ {receitaMatriculas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">Taxa de Matrícula</p>
          <p className="text-2xl font-bold text-green-600">
            {totalLeads > 0 ? ((matriculas / totalLeads) * 100).toFixed(1) : '0.0'}%
          </p>
        </Card>
      </div>

      {/* Busca e Adicionar Lead */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou WhatsApp..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={showAddLeadModal} onOpenChange={setShowAddLeadModal}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={evento.status === 'finalizado'}>
              <Plus className="h-4 w-4" />
              Adicionar Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Lead</DialogTitle>
              <DialogDescription>Adicione um novo lead à Aula Secreta</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome" value={newLeadForm.nome} onChange={e => setNewLeadForm({ ...newLeadForm, nome: e.target.value })} />
              <Input placeholder="WhatsApp" value={newLeadForm.whatsapp} onChange={e => setNewLeadForm({ ...newLeadForm, whatsapp: e.target.value })} />
              <Input placeholder="Email (opcional)" value={newLeadForm.email} onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })} />
              <Button onClick={handleAddLead} disabled={isAddingLead} className="w-full">
                {isAddingLead ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-full pb-4 items-start">
          {colunas.map(coluna => {
            const colLeads = getLeadsByColuna(coluna.id);
            return (
              <div key={coluna.id} className="group/col flex-shrink-0 w-80">
                <div className="bg-muted rounded-lg p-4 h-full">
                  <KanbanColunaHeader
                    coluna={coluna}
                    count={colLeads.length}
                    disabled={evento.status === 'finalizado'}
                    onRename={() => setRenamingColuna(coluna)}
                    onDelete={() => setDeletingColuna(coluna)}
                    onMoveLeft={() => moveColuna(coluna.id, 'left')}
                    onMoveRight={() => moveColuna(coluna.id, 'right')}
                    onOpenSettings={() => setSettingsColuna(coluna)}
                  />
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {colLeads.map(lead => (
                      <div
                        key={lead.id}
                        className={`p-3 rounded-lg border ${
                          lead.erro
                            ? 'bg-red-50 border-red-200'
                            : lead.matriculado
                            ? 'bg-green-50 border-green-200'
                            : 'bg-white border-border'
                        } hover:shadow-md transition-all`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-medium text-sm flex-1">{lead.nome}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleOpenEditLead(lead)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar lead"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setLeadToDelete(lead)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                              title="Apagar lead"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{lead.whatsapp}</p>
                        {lead.email && <p className="text-xs text-muted-foreground truncate">{lead.email}</p>}
                        {lead.matriculado && (
                          <Badge className="mt-2 text-xs bg-green-100 text-green-700">Matriculado</Badge>
                        )}
                        <Select
                          value={lead.fase}
                          onValueChange={value => handleMoveLead(lead.id, value)}
                          disabled={evento.status === 'finalizado'}
                        >
                          <SelectTrigger className="mt-2 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {colunas.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <AddColunaButton
            onAdd={addColuna}
            disabled={evento.status === 'finalizado'}
          />
        </div>
      </div>

      {/* Modal Apagar Evento */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Aula Secreta</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteEvento}>Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Apagar Lead */}
      <Dialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Lead</DialogTitle>
            <DialogDescription>Deseja apagar "{leadToDelete?.nome}"? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLeadToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLead}>Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Column Management Modals */}
      <RenameColunaModal
        coluna={renamingColuna}
        onSave={(id, nome) => { renameColuna(id, nome); setRenamingColuna(null); }}
        onClose={() => setRenamingColuna(null)}
      />
      <ColunaSettingsModal
        coluna={settingsColuna}
        onSave={(id, updates) => { updateRegraColuna(id, updates); setSettingsColuna(null); }}
        onClose={() => setSettingsColuna(null)}
      />
      <DeleteColunaModal
        coluna={deletingColuna}
        leadCount={deletingColuna ? getLeadsByColuna(deletingColuna.id).length : 0}
        onConfirm={handleDeleteColWithLeads}
        onClose={() => setDeletingColuna(null)}
      />

      {/* Edit Lead Modal */}
      <Dialog open={!!editingLead} onOpenChange={() => setEditingLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={editLeadForm.nome} onChange={e => setEditLeadForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">WhatsApp</label>
              <Input value={editLeadForm.whatsapp} onChange={e => setEditLeadForm(f => ({ ...f, whatsapp: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={editLeadForm.email} onChange={e => setEditLeadForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Observações</label>
              <Input value={editLeadForm.observacoes} onChange={e => setEditLeadForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setEditingLead(null)}>Cancelar</Button>
              <Button onClick={handleSaveEditLead}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
