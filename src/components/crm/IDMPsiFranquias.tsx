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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DollarSign, Users, Target, TrendingUp, MousePointerClick, Eye,
  Search, Plus, Phone, MapPin, Pencil,
  Loader2, Trash2, MessageSquare, ChevronRight, Kanban, ClipboardList,
  BarChart3, Zap, MessageCircle, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { PREMIUM_TABLE_HEADER_ROW, premiumZebraRow, StatTile, SectionBar } from '@/components/crm/ui/premium';

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
  semConta?: boolean;
}

// Vendedores de Franquias — só esses dois, não a tabela `responsaveis` (compartilhada
// com Financeiro/Operações e cheia de gente que não vende franquia). Rodrygo já tem
// conta real na plataforma (id de auth.users, necessário porque franquia_leads.vendedor_id
// tem FK pra auth.users). Marcos ainda não tem conta — fica listado mas desabilitado pra
// atribuição até criar a conta dele, pra não deixar escolher e falhar silenciosamente.
const FRANQUIA_VENDEDORES: Vendedor[] = [
  { id: 'cac2f265-196c-4a40-98e4-55d661ddd648', nome: 'Rodrygo' },
  { id: 'marcos-sem-conta', nome: 'Marcos', semConta: true },
];

type Fase = FranquiaLead['fase'];

const FASES: { key: Fase; label: string; color: string; bg: string; solid: string }[] = [
  { key: 'novo',             label: 'Novo',              color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   solid: 'bg-blue-600' },
  { key: 'contatado',        label: 'Contatado',         color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', solid: 'bg-amber-600' },
  { key: 'reuniao_agendada', label: 'Reunião Agendada',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', solid: 'bg-purple-600' },
  { key: 'fechado',          label: 'Fechado',           color: 'text-green-700',  bg: 'bg-green-50 border-green-200', solid: 'bg-green-600' },
  { key: 'perdido',          label: 'Perdido',           color: 'text-red-700',    bg: 'bg-red-50 border-red-200',     solid: 'bg-red-600' },
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

const openWhatsApp = (phone: string) => window.open(`https://wa.me/55${phone.replace(/\D/g, '')}`, '_blank');
const openCall = (phone: string) => window.open(`tel:${phone.replace(/\D/g, '')}`, '_self');

// Vendedores de Franquias vêm da tabela `responsaveis` (dinâmica, sem campo de cor).
// Pra dar a mesma identidade visual por pessoa que o Time Comercial tem com cor fixa
// cadastrada no código, gera uma cor determinística a partir do id — mesmo id sempre
// cai na mesma cor da paleta, sem precisar de migração de banco.
const VENDOR_PALETTE = ['#A93356', '#4A90E2', '#2E9E6C', '#C9762C', '#7B5FBF', '#1D8A99', '#B8455E', '#5A7D3A'];
function vendorColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return VENDOR_PALETTE[hash % VENDOR_PALETTE.length];
}
function vendorInitials(nome: string) {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function VendorAvatar({ nome, size = 'sm' }: { nome: string; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  return (
    <div
      className={`${dim} rounded-md flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: vendorColor(nome) }}
    >
      {vendorInitials(nome)}
    </div>
  );
}

// ─── Padrão visual reaproveitado do CRM Time Comercial ─────────────────────
// (StatTile, SectionBar, tabela premium) — ver
// docs/superpowers/specs/2026-08-20-franquias-redesign-design.md



// Chips de avatar coloridos pra filtrar por vendedor — clique direto em vez de dropdown,
// mesma cor de identificação usada na tabela e no kanban.
function VendorFilterChips({ vendedores, value, onChange, semAtribuicaoCount }: {
  vendedores: Vendedor[];
  value: string;
  onChange: (v: string) => void;
  semAtribuicaoCount: number;
}) {
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto px-1 py-1 -mx-1">
      <button
        type="button"
        onClick={() => onChange('todos')}
        className="flex flex-col items-center gap-1 flex-shrink-0"
        title="Todos os vendedores"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold bg-muted text-muted-foreground transition-shadow"
          style={value === 'todos' ? { boxShadow: '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary))' } : undefined}
        >
          Todos
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange('sem_vendedor')}
        className="flex flex-col items-center gap-1 flex-shrink-0"
        title="Sem atribuição"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold bg-amber-100 text-amber-700 transition-shadow"
          style={value === 'sem_vendedor' ? { boxShadow: '0 0 0 2px hsl(var(--background)), 0 0 0 4px #d97706' } : undefined}
        >
          {semAtribuicaoCount}
        </div>
        <span className="text-[9px] text-muted-foreground">S/ vend.</span>
      </button>
      {vendedores.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          title={v.nome}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-shadow"
            style={{ backgroundColor: vendorColor(v.id), ...(value === v.id ? { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${vendorColor(v.id)}` } : {}) }}
          >
            {vendorInitials(v.nome)}
          </div>
          <span className="text-[9px] text-muted-foreground max-w-[46px] truncate">{v.nome.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function IDMPsiFranquias() {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';

  const [leads, setLeads] = useState<FranquiaLead[]>([]);
  const [campanha, setCampanha] = useState<Campanha[]>([]);
  const vendedores = FRANQUIA_VENDEDORES;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterVendedor, setFilterVendedor] = useState<string>('todos');
  const [editLead, setEditLead] = useState<FranquiaLead | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [editCampanhaOpen, setEditCampanhaOpen] = useState(false);
  const [editCampanhaData, setEditCampanhaData] = useState<Partial<Campanha>>({});
  const [showAllLeadsTable, setShowAllLeadsTable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const [leadsRes, campRes] = await Promise.all([
      supabase.from('franquia_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('franquia_campanha').select('*').order('data', { ascending: false }),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data as FranquiaLead[]);
    if (campRes.data) setCampanha(campRes.data as Campanha[]);
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
      map[l.fase]?.push(l);
    }
    return map;
  }, [filteredLeads]);

  const vendedorMap = useMemo(() => Object.fromEntries(vendedores.map(v => [v.id, v.nome])), [vendedores]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const pegarLead = async (leadId: string, vendedorId: string) => {
    if (FRANQUIA_VENDEDORES.find(v => v.id === vendedorId)?.semConta) {
      toast.error('Marcos ainda não tem conta na plataforma — não dá pra atribuir ainda.');
      return;
    }
    const vid = vendedorId || null;
    const { error } = await supabase.from('franquia_leads').update({ vendedor_id: vid }).eq('id', leadId);
    if (error) { toast.error('Erro ao atribuir lead'); return; }
    toast.success(vid ? 'Lead atribuído!' : 'Vendedor removido');
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, vendedor_id: vid as any } : l));
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
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">IDM PSI Franquias</h1>
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

      <Tabs defaultValue="funil" className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent p-4 mb-1 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">Meu trabalho</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Trabalhar os leads de franquia, ver quem tá sem atribuição e acompanhar a campanha.</p>
            </div>
          </div>
          <TabsList className="h-auto bg-transparent p-0 gap-2 justify-start flex-wrap">
            <TabsTrigger
              value="funil"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <Kanban className="h-3.5 w-3.5" /> Funil e Leads
            </TabsTrigger>
            <TabsTrigger
              value="campanha"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Campanha
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Funil e Leads (busca, filtro, kanban, pool sem atribuição, tabela) ── */}
        <TabsContent value="funil" className="flex flex-col gap-4">
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
          </div>

          {/* Filtro por vendedor + contadores, tudo numa linha compacta */}
          <div className="flex flex-wrap items-center gap-3">
            <VendorFilterChips
              vendedores={vendedores}
              value={filterVendedor}
              onChange={setFilterVendedor}
              semAtribuicaoCount={leadsNaoAtribuidos.length}
            />
            <div className="flex gap-2 ml-auto text-sm text-muted-foreground">
              <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{leads.length} total</Badge>
              <Badge variant="outline" className="gap-1 border-green-200 text-green-700">{leadsAtribuidos.length} atribuídos</Badge>
            </div>
          </div>

          {/* Kanban por fase — leads sem vendedor aparecem aqui também, atribuídos direto no card */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {FASES.map(fase => {
              const faseLeads = leadsByFase[fase.key];
              return (
                <div key={fase.key} className="rounded-lg border border-border overflow-hidden flex flex-col">
                  <div className={`px-3 py-2 flex items-center justify-between ${fase.solid}`}>
                    <span className="text-xs font-semibold text-white">{fase.label}</span>
                    <Badge className="text-xs bg-white/20 text-white border-0 hover:bg-white/20">{faseLeads.length}</Badge>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[320px] min-h-[64px] bg-muted/30">
                    {faseLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        vendedorNome={lead.vendedor_id ? vendedorMap[lead.vendedor_id] : undefined}
                        vendedores={vendedores}
                        onEdit={() => setEditLead(lead)}
                        onChangeFase={mudarFase}
                        onAssign={(vendedorId) => pegarLead(lead.id, vendedorId)}
                        fases={FASES}
                      />
                    ))}
                    {faseLeads.length === 0 && (
                      <div className="flex items-center justify-center h-12 text-xs text-muted-foreground/50">
                        Nenhum lead
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela completa — recolhida por padrão, o kanban já cobre o dia a dia */}
          <Card className="p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAllLeadsTable(v => !v)}
              className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="w-1 h-5 rounded-full bg-primary flex-shrink-0" />
              <ClipboardList className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="text-sm font-bold text-foreground">Todos os Leads</span>
              <Badge variant="outline" className="text-xs">{filteredLeads.length}</Badge>
              <ChevronRight className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${showAllLeadsTable ? 'rotate-90' : ''}`} />
            </button>
            {showAllLeadsTable && (
              <div className="overflow-x-auto border-t border-border">
                <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-2.5 [&_th]:px-2.5 sm:[&_th]:px-4">
                  <TableHeader>
                    <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                      <TableHead>Nome</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum lead encontrado</TableCell></TableRow>
                    ) : filteredLeads.map((lead, idx) => {
                      const faseInfo = FASE_MAP[lead.fase];
                      return (
                        <TableRow key={lead.id} className={`${premiumZebraRow(idx)} cursor-pointer`} onClick={() => setEditLead(lead)}>
                          <TableCell className="font-medium text-foreground">{lead.nome}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.whatsapp || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.email || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.cidade ? `${lead.cidade}${lead.estado ? `/${lead.estado}` : ''}` : '—'}</TableCell>
                          <TableCell>
                            <Select value={lead.fase} onValueChange={(v) => { mudarFase(lead.id, v as Fase); }}>
                              <SelectTrigger className={`h-7 text-xs w-[140px] border ${faseInfo?.bg || ''} ${faseInfo?.color || ''}`} onClick={e => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FASES.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {lead.vendedor_id && <VendorAvatar nome={vendedorMap[lead.vendedor_id] || ''} />}
                              <Select value={lead.vendedor_id || 'nenhum'} onValueChange={(v) => { pegarLead(lead.id, v === 'nenhum' ? '' : v); }}>
                                <SelectTrigger className="h-7 text-xs w-[110px] border-border" onClick={e => e.stopPropagation()}>
                                  <SelectValue placeholder="Atribuir..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="nenhum">Sem vendedor</SelectItem>
                                  {vendedores.map(v => <SelectItem key={v.id} value={v.id} disabled={v.semConta}>{v.nome}{v.semConta ? ' (sem conta ainda)' : ''}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <button onClick={(e) => { e.stopPropagation(); setEditLead(lead); }} className="p-1 rounded hover:bg-muted">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Campanha (métricas + histórico) ──────────────────────────────── */}
        <TabsContent value="campanha" className="flex flex-col gap-4">
          <SectionBar title="Métricas da campanha" icon={BarChart3} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile icon={DollarSign} label="Gasto Total" value={`R$ ${fmt(totaisCampanha.gasto)}`} />
            <StatTile icon={Eye} label="Impressões" value={fmtInt(totaisCampanha.impressoes)} />
            <StatTile icon={MousePointerClick} label="Cliques" value={fmtInt(totaisCampanha.cliques)} />
            <StatTile icon={Users} label="Leads" value={fmtInt(totaisCampanha.leads)} />
            <StatTile icon={Target} label="CPL" value={`R$ ${fmt(cplTotal)}`} />
            <StatTile icon={TrendingUp} label="CTR" value={`${ctrTotal.toFixed(2)}%`} />
          </div>

          <SectionBar title="Histórico de Campanha" subtitle="Campanhas de anúncio lançadas, mais recente primeiro" />
          {campanha.length === 0 ? (
            <Card className="border-dashed border-2 border-border/60 p-8 flex flex-col items-center justify-center text-center gap-1.5">
              <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">Nenhuma campanha lançada ainda</p>
              <p className="text-xs text-muted-foreground max-w-xs">Clique em "Métricas" no topo da página pra registrar o gasto e os resultados de uma campanha — elas aparecem aqui embaixo.</p>
            </Card>
          ) : (
            <>
              <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-2.5 [&_th]:px-2.5 sm:[&_th]:px-4">
                    <TableHeader>
                      <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Gasto</TableHead>
                        <TableHead className="text-right">Impressões</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">CPL</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campanha.slice(0, 10).map((c, idx) => (
                        <TableRow key={c.id} className={premiumZebraRow(idx)}>
                          <TableCell>{new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-right">R$ {fmt(Number(c.gasto))}</TableCell>
                          <TableCell className="text-right">{fmtInt(c.impressoes)}</TableCell>
                          <TableCell className="text-right">{fmtInt(c.cliques)}</TableCell>
                          <TableCell className="text-right">{c.leads_count}</TableCell>
                          <TableCell className="text-right">R$ {fmt(Number(c.cpl))}</TableCell>
                          <TableCell className="text-right">{Number(c.ctr).toFixed(2)}%</TableCell>
                          <TableCell>
                            <button onClick={() => { setEditCampanhaData(c); setEditCampanhaOpen(true); }} className="p-1 rounded hover:bg-muted">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="bg-primary/10">
                      <TableRow>
                        <TableCell className="font-semibold text-primary">Total</TableCell>
                        <TableCell className="text-right font-semibold text-primary">R$ {fmt(totaisCampanha.gasto)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtInt(totaisCampanha.impressoes)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtInt(totaisCampanha.cliques)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtInt(totaisCampanha.leads)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">R$ {fmt(cplTotal)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{ctrTotal.toFixed(2)}%</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

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

// ─── Lead Card (Kanban) ─────────────────────────────────────────────────────

function LeadCard({ lead, vendedorNome, vendedores, onEdit, onChangeFase, onAssign, fases }: {
  lead: FranquiaLead;
  vendedorNome?: string;
  vendedores: Vendedor[];
  onEdit: () => void;
  onChangeFase: (id: string, fase: Fase) => void;
  onAssign: (vendedorId: string) => void;
  fases: typeof FASES;
}) {
  return (
    <div
      className="bg-card rounded-lg border border-border p-3 hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-foreground truncate">{lead.nome}</p>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(lead.created_at)}</span>
      </div>
      {lead.cidade && (
        <p className="text-xs text-muted-foreground mt-0.5">{lead.cidade}{lead.estado ? `/${lead.estado}` : ''}</p>
      )}
      {lead.observacoes && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mt-1">
          <MessageSquare className="h-3 w-3 flex-shrink-0" /><span className="truncate">{lead.observacoes}</span>
        </div>
      )}

      {lead.whatsapp && (
        <div className="flex gap-1.5 mt-2.5" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openWhatsApp(lead.whatsapp!)}
            className="flex-1 h-7 text-xs inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <MessageCircle className="h-3 w-3 text-success" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => openCall(lead.whatsapp!)}
            title="Ligar pra esse lead"
            className="h-7 w-7 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Ver histórico e detalhes do lead"
            className="h-7 w-7 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {vendedorNome ? (
        <div className="mt-2 flex items-center gap-1.5">
          <VendorAvatar nome={vendedorNome} />
          <span className="text-xs font-medium text-primary">{vendedorNome}</span>
        </div>
      ) : (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <Select value="" onValueChange={onAssign}>
            <SelectTrigger className="h-7 text-xs border-dashed border-amber-300 text-amber-700 bg-amber-50/50">
              <SelectValue placeholder="Atribuir vendedor..." />
            </SelectTrigger>
            <SelectContent>
              {vendedores.map(v => <SelectItem key={v.id} value={v.id} disabled={v.semConta}>{v.nome}{v.semConta ? ' (sem conta ainda)' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
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
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id} disabled={v.semConta}>{v.nome}{v.semConta ? ' (sem conta ainda)' : ''}</SelectItem>)}
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
