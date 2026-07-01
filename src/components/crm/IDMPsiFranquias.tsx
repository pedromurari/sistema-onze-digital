import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DollarSign, Users, Target, TrendingUp, MousePointerClick, Eye,
  Search, Plus, UserCheck, Phone, Mail, MapPin, Clock, Pencil,
  Loader2, Trash2, MessageSquare, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FranquiaLead {
  id: string;
  nome: string;
  whatsapp?: string;
  email?: string;
  cidade?: string;
  estado?: string;
  fase: 'novo' | 'contatado' | 'reuniao_agendada' | 'fechado' | 'perdido';
  vendedor_id?: string;
  observacoes?: string;
  dados_extras?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Campanha {
  id: string;
  data: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  leads_count: number;
  cpl: number;
  ctr: number;
  created_at: string;
}

interface Vendedor {
  id: string;
  nome: string;
}

type Fase = FranquiaLead['fase'];

const FASES: { key: Fase; label: string; color: string; bg: string }[] = [
  { key: 'novo',             label: 'Novo',              color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'contatado',        label: 'Contatado',         color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  { key: 'reuniao_agendada', label: 'Reunião Agendada',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { key: 'fechado',          label: 'Fechado',           color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  { key: 'perdido',          label: 'Perdido',           color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
];

const FASE_MAP = Object.fromEntries(FASES.map(f => [f.key, f]));

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v: number) {
  return v.toLocaleString('pt-BR');
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function IDMPsiFranquias() {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';

  const [leads, setLeads] = useState<FranquiaLead[]>([]);
  const [campanha, setCampanha] = useState<Campanha[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterVendedor, setFilterVendedor] = useState<string>('todos');
  const [editLead, setEditLead] = useState<FranquiaLead | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [editCampanhaOpen, setEditCampanhaOpen] = useState(false);
  const [editCampanhaData, setEditCampanhaData] = useState<Partial<Campanha>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const [leadsRes, campRes, vendRes] = await Promise.all([
      supabase.from('franquia_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('franquia_campanha').select('*').order('data', { ascending: false }),
      supabase.from('responsaveis').select('id, nome'),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data as FranquiaLead[]);
    if (campRes.data) setCampanha(campRes.data as Campanha[]);
    if (vendRes.data) setVendedores(vendRes.data as Vendedor[]);
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    loadData(true);
    const reload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => loadData(false), 1500);
    };
    const ch = supabase.channel('franquia-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'franquia_leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'franquia_campanha' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadData]);

  // ── Computed ─────────────────────────────────────────────────────────────

  const totaisCampanha = useMemo(() => {
    return campanha.reduce((acc, c) => ({
      gasto: acc.gasto + Number(c.gasto),
      impressoes: acc.impressoes + c.impressoes,
      cliques: acc.cliques + c.cliques,
      leads: acc.leads + c.leads_count,
    }), { gasto: 0, impressoes: 0, cliques: 0, leads: 0 });
  }, [campanha]);

  const cplTotal = totaisCampanha.leads > 0 ? totaisCampanha.gasto / totaisCampanha.leads : 0;
  const ctrTotal = totaisCampanha.impressoes > 0 ? (totaisCampanha.cliques / totaisCampanha.impressoes) * 100 : 0;

  const filteredLeads = useMemo(() => {
    let filtered = leads;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l =>
        l.nome?.toLowerCase().includes(q) ||
        l.whatsapp?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.cidade?.toLowerCase().includes(q)
      );
    }
    if (filterVendedor !== 'todos') {
      if (filterVendedor === 'sem_vendedor') {
        filtered = filtered.filter(l => !l.vendedor_id);
      } else {
        filtered = filtered.filter(l => l.vendedor_id === filterVendedor);
      }
    }
    return filtered;
  }, [leads, search, filterVendedor]);

  const leadsNaoAtribuidos = useMemo(() => filteredLeads.filter(l => !l.vendedor_id), [filteredLeads]);
  const leadsAtribuidos = useMemo(() => filteredLeads.filter(l => l.vendedor_id), [filteredLeads]);

  const leadsByFase = useMemo(() => {
    const map: Record<Fase, FranquiaLead[]> = { novo: [], contatado: [], reuniao_agendada: [], fechado: [], perdido: [] };
    for (const l of filteredLeads) {
      if (l.vendedor_id) map[l.fase]?.push(l);
    }
    return map;
  }, [filteredLeads]);

  const vendedorMap = useMemo(() => Object.fromEntries(vendedores.map(v => [v.id, v.nome])), [vendedores]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const pegarLead = async (leadId: string, vendedorId: string) => {
    const { error } = await supabase.from('franquia_leads').update({ vendedor_id: vendedorId }).eq('id', leadId);
    if (error) { toast.error('Erro ao atribuir lead'); return; }
    toast.success('Lead atribuído!');
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, vendedor_id: vendedorId } : l));
  };

  const mudarFase = async (leadId: string, novaFase: Fase) => {
    const { error } = await supabase.from('franquia_leads').update({ fase: novaFase, updated_at: new Date().toISOString() }).eq('id', leadId);
    if (error) { toast.error('Erro ao mudar fase'); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, fase: novaFase } : l));
  };

  const salvarLead = async (lead: Partial<FranquiaLead> & { id?: string }) => {
    if (lead.id) {
      const { error } = await supabase.from('franquia_leads').update({
        nome: lead.nome, whatsapp: lead.whatsapp, email: lead.email,
        cidade: lead.cidade, estado: lead.estado, fase: lead.fase,
        vendedor_id: lead.vendedor_id || null, observacoes: lead.observacoes,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
      if (error) { toast.error('Erro ao salvar'); return; }
      toast.success('Lead atualizado!');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...lead } as FranquiaLead : l));
    } else {
      const { data, error } = await supabase.from('franquia_leads').insert({
        nome: lead.nome || '', whatsapp: lead.whatsapp, email: lead.email,
        cidade: lead.cidade, estado: lead.estado, fase: lead.fase || 'novo',
        vendedor_id: lead.vendedor_id || null, observacoes: lead.observacoes,
      }).select().single();
      if (error) { toast.error('Erro ao criar lead'); return; }
      toast.success('Lead criado!');
      if (data) setLeads(prev => [data as FranquiaLead, ...prev]);
    }
    setEditLead(null);
    setAddLeadOpen(false);
  };

  const excluirLead = async (id: string) => {
    const { error } = await supabase.from('franquia_leads').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Lead excluído');
    setLeads(prev => prev.filter(l => l.id !== id));
    setEditLead(null);
  };

  const salvarCampanha = async () => {
    const d = editCampanhaData;
    if (d.id) {
      await supabase.from('franquia_campanha').update({
        data: d.data, gasto: d.gasto, impressoes: d.impressoes,
        cliques: d.cliques, leads_count: d.leads_count,
      }).eq('id', d.id);
    } else {
      await supabase.from('franquia_campanha').insert({
        data: d.data || new Date().toISOString().slice(0, 10),
        gasto: d.gasto || 0, impressoes: d.impressoes || 0,
        cliques: d.cliques || 0, leads_count: d.leads_count || 0,
      });
    }
    toast.success('Campanha salva!');
    setEditCampanhaOpen(false);
    loadData(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">IDM PSI Franquias</h1>
          <p className="text-sm text-muted-foreground">Gestão de leads e campanha de franquias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditCampanhaData({}); setEditCampanhaOpen(true); }}>
            <TrendingUp className="h-4 w-4 mr-1.5" /> Métricas
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => setAddLeadOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* ── Métricas da Campanha ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={DollarSign} label="Gasto Total" value={`R$ ${fmt(totaisCampanha.gasto)}`} accent="red" />
        <MetricCard icon={Eye} label="Impressões" value={fmtInt(totaisCampanha.impressoes)} accent="blue" />
        <MetricCard icon={MousePointerClick} label="Cliques" value={fmtInt(totaisCampanha.cliques)} accent="amber" />
        <MetricCard icon={Users} label="Leads" value={fmtInt(totaisCampanha.leads)} accent="green" />
        <MetricCard icon={Target} label="CPL" value={`R$ ${fmt(cplTotal)}`} accent="purple" />
        <MetricCard icon={TrendingUp} label="CTR" value={`${ctrTotal.toFixed(2)}%`} accent="emerald" />
      </div>

      {/* Histórico campanha (mini tabela) */}
      {campanha.length > 0 && (
        <Card className="border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Histórico de Campanha</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Gasto</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Impressões</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Cliques</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Leads</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">CPL</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">CTR</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {campanha.slice(0, 10).map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-2">{new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">R$ {fmt(Number(c.gasto))}</td>
                    <td className="px-4 py-2 text-right">{fmtInt(c.impressoes)}</td>
                    <td className="px-4 py-2 text-right">{fmtInt(c.cliques)}</td>
                    <td className="px-4 py-2 text-right">{c.leads_count}</td>
                    <td className="px-4 py-2 text-right">R$ {fmt(Number(c.cpl))}</td>
                    <td className="px-4 py-2 text-right">{Number(c.ctr).toFixed(2)}%</td>
                    <td className="px-4 py-2">
                      <button onClick={() => { setEditCampanhaData(c); setEditCampanhaOpen(true); }} className="p-1 rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lead..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 border-border"
          />
        </div>
        <Select value={filterVendedor} onValueChange={setFilterVendedor}>
          <SelectTrigger className="w-[180px] border-border">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sem_vendedor">Sem atribuição</SelectItem>
            {vendedores.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 ml-auto text-sm text-muted-foreground">
          <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{leads.length} total</Badge>
          <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700">{leadsNaoAtribuidos.length} sem vendedor</Badge>
          <Badge variant="outline" className="gap-1 border-green-200 text-green-700">{leadsAtribuidos.length} atribuídos</Badge>
        </div>
      </div>

      {/* ── Pool de Leads Não Atribuídos ─────────────────────────────────── */}
      {leadsNaoAtribuidos.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Leads Sem Atribuição</p>
            <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-300">{leadsNaoAtribuidos.length}</Badge>
          </div>
          <div className="divide-y divide-amber-100">
            {leadsNaoAtribuidos.map(lead => (
              <div key={lead.id} className="px-4 py-3 flex items-center gap-4 hover:bg-amber-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">{lead.nome}</p>
                    <span className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {lead.whatsapp && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.whatsapp}</span>}
                    {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                    {lead.cidade && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.cidade}{lead.estado ? `/${lead.estado}` : ''}</span>}
                  </div>
                </div>
                <Select onValueChange={(vendedorId) => pegarLead(lead.id, vendedorId)}>
                  <SelectTrigger className="w-[150px] border-amber-300 bg-white text-sm h-8">
                    <SelectValue placeholder="Atribuir a..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button onClick={() => setEditLead(lead)} className="p-1.5 rounded hover:bg-amber-100">
                  <Pencil className="h-3.5 w-3.5 text-amber-600" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Kanban por Fase ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {FASES.map(fase => {
          const faseLeads = leadsByFase[fase.key];
          return (
            <div key={fase.key} className={`rounded-xl border ${fase.bg} min-h-[200px] flex flex-col`}>
              <div className="px-3 py-2.5 border-b border-inherit flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${fase.color}`}>{fase.label}</span>
                </div>
                <Badge variant="outline" className={`text-xs ${fase.color} border-current/20`}>{faseLeads.length}</Badge>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[500px]">
                {faseLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    vendedorNome={lead.vendedor_id ? vendedorMap[lead.vendedor_id] : undefined}
                    onEdit={() => setEditLead(lead)}
                    onChangeFase={mudarFase}
                    fases={FASES}
                  />
                ))}
                {faseLeads.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                    Nenhum lead
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal Editar/Criar Lead ──────────────────────────────────────── */}
      <LeadModal
        open={!!editLead || addLeadOpen}
        lead={editLead}
        vendedores={vendedores}
        onClose={() => { setEditLead(null); setAddLeadOpen(false); }}
        onSave={salvarLead}
        onDelete={excluirLead}
      />

      {/* ── Modal Campanha ───────────────────────────────────────────────── */}
      <Dialog open={editCampanhaOpen} onOpenChange={setEditCampanhaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCampanhaData.id ? 'Editar Métricas' : 'Adicionar Métricas'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <Input type="date" value={editCampanhaData.data || new Date().toISOString().slice(0, 10)}
                onChange={e => setEditCampanhaData(p => ({ ...p, data: e.target.value }))} className="border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gasto (R$)</label>
                <Input type="number" step="0.01" value={editCampanhaData.gasto ?? ''}
                  onChange={e => setEditCampanhaData(p => ({ ...p, gasto: Number(e.target.value) }))} className="border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Leads</label>
                <Input type="number" value={editCampanhaData.leads_count ?? ''}
                  onChange={e => setEditCampanhaData(p => ({ ...p, leads_count: Number(e.target.value) }))} className="border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Impressões</label>
                <Input type="number" value={editCampanhaData.impressoes ?? ''}
                  onChange={e => setEditCampanhaData(p => ({ ...p, impressoes: Number(e.target.value) }))} className="border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cliques</label>
                <Input type="number" value={editCampanhaData.cliques ?? ''}
                  onChange={e => setEditCampanhaData(p => ({ ...p, cliques: Number(e.target.value) }))} className="border-border" />
              </div>
            </div>
            <Button className="w-full bg-primary" onClick={salvarCampanha}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Metric Card ────────────────────────────────────────────────────────────

const ACCENT_COLORS: Record<string, { icon: string; border: string; bg: string }> = {
  red:     { icon: 'text-red-500',    border: 'border-red-100',    bg: 'bg-red-50' },
  blue:    { icon: 'text-blue-500',   border: 'border-blue-100',   bg: 'bg-blue-50' },
  amber:   { icon: 'text-amber-500',  border: 'border-amber-100',  bg: 'bg-amber-50' },
  green:   { icon: 'text-green-500',  border: 'border-green-100',  bg: 'bg-green-50' },
  purple:  { icon: 'text-purple-500', border: 'border-purple-100', bg: 'bg-purple-50' },
  emerald: { icon: 'text-emerald-500',border: 'border-emerald-100',bg: 'bg-emerald-50' },
};

function MetricCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  const c = ACCENT_COLORS[accent] || ACCENT_COLORS.blue;
  return (
    <Card className={`border ${c.border} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </Card>
  );
}

// ─── Lead Card (Kanban) ─────────────────────────────────────────────────────

function LeadCard({ lead, vendedorNome, onEdit, onChangeFase, fases }: {
  lead: FranquiaLead;
  vendedorNome?: string;
  onEdit: () => void;
  onChangeFase: (id: string, fase: Fase) => void;
  fases: typeof FASES;
}) {
  return (
    <div
      className="bg-white rounded-lg border border-border/60 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-foreground truncate">{lead.nome}</p>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(lead.created_at)}</span>
      </div>
      <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        {lead.whatsapp && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" /><span>{lead.whatsapp}</span>
          </div>
        )}
        {lead.cidade && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /><span>{lead.cidade}{lead.estado ? `/${lead.estado}` : ''}</span>
          </div>
        )}
        {lead.observacoes && (
          <div className="flex items-center gap-1.5 text-muted-foreground/70">
            <MessageSquare className="h-3 w-3" /><span className="truncate">{lead.observacoes}</span>
          </div>
        )}
      </div>
      {vendedorNome && (
        <div className="mt-2 flex items-center gap-1.5">
          <UserCheck className="h-3 w-3 text-primary" />
          <span className="text-xs font-medium text-primary">{vendedorNome}</span>
        </div>
      )}
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {fases.filter(f => f.key !== lead.fase && f.key !== 'perdido').map(f => (
          <button
            key={f.key}
            onClick={() => onChangeFase(lead.id, f.key)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${f.bg} ${f.color} font-medium hover:opacity-80`}
            title={`Mover para ${f.label}`}
          >
            {f.label.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Lead Modal ─────────────────────────────────────────────────────────────

function LeadModal({ open, lead, vendedores, onClose, onSave, onDelete }: {
  open: boolean;
  lead: FranquiaLead | null;
  vendedores: Vendedor[];
  onClose: () => void;
  onSave: (lead: Partial<FranquiaLead> & { id?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<Partial<FranquiaLead>>({});

  useEffect(() => {
    if (lead) setForm({ ...lead });
    else setForm({ fase: 'novo' });
  }, [lead, open]);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? 'Editar Lead' : 'Novo Lead'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <Input value={form.nome || ''} onChange={e => set('nome', e.target.value)} className="border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
              <Input value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} className="border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input value={form.email || ''} onChange={e => set('email', e.target.value)} className="border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cidade</label>
              <Input value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} className="border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Input value={form.estado || ''} onChange={e => set('estado', e.target.value)} maxLength={2} className="border-border" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fase</label>
              <Select value={form.fase || 'novo'} onValueChange={v => set('fase', v)}>
                <SelectTrigger className="border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASES.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
              <Select value={form.vendedor_id || 'nenhum'} onValueChange={v => set('vendedor_id', v === 'nenhum' ? null : v)}>
                <SelectTrigger className="border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem atribuição</SelectItem>
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Observações</label>
            <Textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)}
              rows={3} className="border-border resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-primary" onClick={() => onSave(form)}>Salvar</Button>
            {lead && (
              <Button variant="outline" size="icon" className="text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => { if (confirm('Excluir este lead?')) onDelete(lead.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
