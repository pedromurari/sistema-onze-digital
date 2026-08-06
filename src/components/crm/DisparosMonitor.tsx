import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LancamentoWizard } from '@/components/crm/LancamentoWizard';
import { EvolutionTaskPanel } from './EvolutionTaskPanel';
import { LeadsQuadros, type LeadsFiltro } from './leads/LeadsQuadros';
import { ChatConversas } from './chat/ChatConversas';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Radio, TableIcon, Kanban, Download, Plus, RefreshCw,
  Clock, CheckCircle2, AlertCircle, FileText,
  MessageSquare, Image, Music, Video, BarChart2,
  Search, Zap, Pause, Play, Trash2, Send,
  ChevronLeft, Flame, Thermometer, Snowflake,
  Users, Shield, Webhook, Mail, Link, Copy, X, Info, Pencil, Upload, Check,
  Sparkles,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

type MsgStatus = 'draft' | 'scheduled' | 'sent' | 'error';
type MsgType   = 'text' | 'image' | 'video' | 'audio' | 'document' | 'poll';
type Temperatura = 'quente' | 'morno' | 'frio';

interface Msg {
  id: string;
  funnel_name: string;
  day_number: number;
  scheduled_at: string;
  message_type: MsgType;
  message_text: string;
  poll_name?: string;
  subtipo?: string;
  status: MsgStatus;
  sent_at?: string;
  error_message?: string;
}

type CampStatus = 'ativo' | 'pausado' | 'concluido' | 'erro' | 'rascunho';

interface Campanha {
  id: string;
  nome: string;
  template: string;
  status: CampStatus;
  leads_total: number;
  leads_sent: number;
  leads_error: number;
  leads_skipped: number;
  delay_min_s: number;
  delay_max_s: number;
  next_send_at: string;
  created_at: string;
  safe_hour_start: number;
  safe_hour_end: number;
  daily_limit: number;
  email_contato?: string | null;
  callback_url?: string | null;
  message_type?: string | null;
  media_url?: string | null;
  evolution_config_ids?: string[] | null;
}

interface DisparoLead {
  id: string;
  nome: string | null;
  phone: string;
  status: string;
  sent_at: string | null;
  error_msg: string | null;
  temperatura: Temperatura;
  ordem: number | null;
  respondeu_em: string | null;
  ultima_resposta: string | null;
  ack_status: 'entregue' | 'lido' | 'falhou' | null;
  instance_id: string | null;
  evolution_message_id: string | null;
}

type ViewMode   = 'table' | 'kanban';
type DateFilter = 'proximos' | 'hoje' | 'semana' | 'todos';
type MainTab    = 'funil' | 'campanhas' | 'boasvindas' | 'leads' | 'chat';

interface BoasVindasConfig {
  id: string;
  funnel_name: string;
  ativo: boolean;
  wpp_ativo: boolean;
  wpp_instance_name: string | null;
  wpp_mensagem: string;
  wpp_mensagem_tarde: string | null;
  wpp_message_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  wpp_media_url: string | null;
  email_ativo: boolean;
  email_assunto: string;
  email_corpo: string;
  updated_at: string;
  delay_min_s: number;
  delay_max_s: number;
  daily_limit: number;
  safe_hour_start: number;
  safe_hour_end: number;
  max_errors_seq: number;
  pausado_por_erro: boolean;
  erros_seq: number;
}

interface BoasVindasLog {
  id: string;
  funnel_name: string;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  wpp_status: string;
  email_status: string;
  wpp_error: string | null;
  email_error: string | null;
  sent_at: string;
  respondeu_em: string | null;
  ultima_resposta: string | null;
}

function tipoFunilBV(nome: string): 'idm' | 'despertar' {
  return /^NPA\b/i.test(nome) ? 'idm' : 'despertar';
}
const TIPO_BV_LABEL: Record<'idm' | 'despertar', string> = {
  idm: 'IDM Pelo Brasil',
  despertar: 'Semana do Despertar',
};

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MsgStatus, { label: string; badge: string; icon: React.ElementType; dot: string }> = {
  draft:     { label: 'Rascunho', badge: 'bg-gray-100 text-gray-600 border-gray-200',          icon: FileText,     dot: 'bg-gray-400' },
  scheduled: { label: 'Agendado', badge: 'bg-blue-50 text-blue-700 border-blue-200',           icon: Clock,        dot: 'bg-blue-500' },
  sent:      { label: 'Enviado',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: CheckCircle2, dot: 'bg-emerald-500' },
  error:     { label: 'Erro',     badge: 'bg-red-50 text-red-700 border-red-200',              icon: AlertCircle,  dot: 'bg-red-500' },
};

const CAMP_STATUS_CFG: Record<CampStatus, { label: string; badge: string; dot: string }> = {
  ativo:    { label: 'Ativo',     badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  pausado:  { label: 'Pausado',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400' },
  concluido:{ label: 'Concluído', badge: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500' },
  erro:     { label: 'Erro',      badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
  rascunho: { label: 'Rascunho',  badge: 'bg-gray-100 text-gray-600 border-gray-200',         dot: 'bg-gray-400' },
};

const TEMP_CFG: Record<Temperatura, { label: string; icon: React.ElementType; color: string; bg: string; border: string; dot: string }> = {
  quente: { label: 'Quente', icon: Flame,       color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  morno:  { label: 'Morno',  icon: Thermometer, color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-400' },
  frio:   { label: 'Frio',   icon: Snowflake,   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200',    dot: 'bg-sky-400' },
};

const TYPE_ICON: Record<MsgType, React.ElementType> = {
  text: MessageSquare, image: Image, video: Video,
  audio: Music, document: FileText, poll: BarChart2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function fmtRelative(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `em ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `em ${h}h`;
  return `em ${Math.floor(h / 24)}d`;
}

function preview(msg: Msg, maxLen = 80) {
  const raw = msg.message_type === 'poll' ? (msg.poll_name ?? '') : (msg.message_text ?? '');
  const clean = raw.replace(/\*/g, '').replace(/_/g, '').replace(/\n/g, ' ');
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

function funnelBadgeColor(name: string) {
  const colors = [
    'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700',
    'bg-amber-100 text-amber-700',   'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',     'bg-orange-100 text-orange-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

/**
 * "enviado" só confirma que a Evolution API aceitou a chamada (HTTP 200) --
 * não que o WhatsApp entregou. ack_status vem do webhook messages.update
 * (confirmação real do WhatsApp) e só chega depois, se chegar.
 */
function leadStatusDisplay(status: string, ackStatus: DisparoLead['ack_status']): { label: string; className: string } {
  if (status === 'erro') return { label: 'Erro', className: 'bg-red-50 text-red-700' };
  if (status !== 'enviado') return { label: 'Pendente', className: 'bg-gray-100 text-gray-600' };
  if (ackStatus === 'falhou') return { label: 'Não entregue', className: 'bg-red-50 text-red-700' };
  if (ackStatus === 'lido') return { label: 'Lido', className: 'bg-violet-50 text-violet-700' };
  if (ackStatus === 'entregue') return { label: 'Entregue', className: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Enviado (sem confirmação)', className: 'bg-sky-50 text-sky-700' };
}

function maskPhone(phone: string) {
  if (phone.includes('@g.us')) return '💬 grupo';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}–****`;
  return phone.slice(0, 6) + '****';
}

/** Retorna o próximo horário válido dentro do horário comercial */
function nextCommercialSlot(safeStart: number, safeEnd: number): Date {
  const now = new Date();
  const h = now.getHours();
  const result = new Date(now);

  if (h < safeStart) {
    result.setHours(safeStart, 0, 30, 0);
  } else if (h >= safeEnd) {
    result.setDate(result.getDate() + 1);
    result.setHours(safeStart, 0, 30, 0);
  } else {
    result.setTime(now.getTime() + 30_000);
  }
  return result;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DisparosMonitor({ onCreateFunnel, onNavigateToAluno, initialMainTab }: {
  onCreateFunnel: () => void;
  onNavigateToAluno?: (alunoId: string) => void;
  initialMainTab?: MainTab;
}) {
  const [mainTab, setMainTab] = useState<MainTab>(initialMainTab ?? 'campanhas');

  return (
    <div className="h-full flex flex-col bg-gray-50/40">
      <div className="bg-white border-b px-6 pt-4 flex-none">
        <div className="flex items-center gap-3 mb-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <Radio className="h-4.5 w-4.5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Central de Disparos</h1>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-4">
            <button
              onClick={() => setMainTab('campanhas')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'campanhas' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Send className="h-3.5 w-3.5" /> Campanhas de Disparo
            </button>
            <button
              onClick={() => setMainTab('funil')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'funil' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Clock className="h-3.5 w-3.5" /> Mensagens de Funil
            </button>
            <button
              onClick={() => setMainTab('boasvindas')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'boasvindas' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Sparkles className="h-3.5 w-3.5" /> Boas-vindas
            </button>
            <button
              onClick={() => setMainTab('leads')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'leads' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Users className="h-3.5 w-3.5" /> Leads
            </button>
            <button
              onClick={() => setMainTab('chat')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'chat' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Chat
            </button>
          </div>
        </div>
      </div>

      {mainTab === 'campanhas' && <CampanhasTab />}
      {mainTab === 'funil' && <FunilTab onCreateFunnel={onCreateFunnel} />}
      {mainTab === 'boasvindas' && <BoasVindasTab />}
      {mainTab === 'leads' && <LeadsTab />}
      {mainTab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          <ChatConversas onNavigateToAluno={onNavigateToAluno} />
        </div>
      )}
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────────────────────

const ORIGENS: { valor: string; label: string }[] = [
  { valor: 'lancamento_leads',    label: 'Lançamento' },
  { valor: 'npa_evento_leads',    label: 'Evento NPA' },
  { valor: 'alunos',              label: 'Aluno' },
  { valor: 'seu_numerologo_leads', label: 'Numerólogo' },
];

interface LeadUnificado {
  origem_tabela: string;
  origem_id: string;
  origem: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  fase: string | null;
  temperatura: 'quente' | 'morno' | 'frio';
  bv_enviado: boolean;
  produto: string | null;
  ddd: number | null;
  cidade: string | null;
  estado: string | null;
  criado_em: string;
}

const LEADS_PAGE_SIZE = 50;
const CSV_BATCH_SIZE = 1000;

function LeadsTab() {
  const [search, setSearch]           = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [origemFiltro, setOrigemFiltro]       = useState<Set<string>>(new Set());
  const [faseFiltro, setFaseFiltro]           = useState<Set<string>>(new Set());
  const [tempFiltro, setTempFiltro]           = useState<Set<'quente' | 'morno' | 'frio'>>(new Set());
  const [produtoFiltro, setProdutoFiltro]     = useState<Set<string>>(new Set());
  const [dddFiltro, setDddFiltro]             = useState<Set<number>>(new Set());
  const [fasesDisponiveis, setFasesDisponiveis]     = useState<string[]>([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<string[]>([]);
  const [dddsDisponiveis, setDddsDisponiveis] = useState<{ ddd: number; cidade: string; estado: string }[]>([]);
  const [mainView, setMainView]       = useState<'tabela' | 'quadros'>('tabela');
  const [page, setPage]               = useState(0);
  const [rows, setRows]               = useState<LeadUnificado[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [exporting, setExporting]     = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [searchDebounced, origemFiltro, faseFiltro, tempFiltro, produtoFiltro, dddFiltro]);

  function applyFilters(query: any) {
    let q = query;
    if (searchDebounced) q = q.or(`nome.ilike.%${searchDebounced}%,telefone.ilike.%${searchDebounced}%`);
    if (origemFiltro.size) q = q.in('origem_tabela', [...origemFiltro]);
    if (faseFiltro.size) q = q.in('fase', [...faseFiltro]);
    if (tempFiltro.size) q = q.in('temperatura', [...tempFiltro]);
    if (produtoFiltro.size) q = q.in('produto', [...produtoFiltro]);
    if (dddFiltro.size) q = q.in('ddd', [...dddFiltro]);
    return q;
  }

  const filtroAtual: LeadsFiltro = useMemo(() => ({
    search: searchDebounced,
    origem: [...origemFiltro],
    fase: [...faseFiltro],
    temperatura: [...tempFiltro],
    produto: [...produtoFiltro],
    ddd: [...dddFiltro],
  }), [searchDebounced, origemFiltro, faseFiltro, tempFiltro, produtoFiltro, dddFiltro]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * LEADS_PAGE_SIZE;
    const query = applyFilters(
      supabase.from('leads_unificados' as any).select('*', { count: 'exact' }),
    ).order('criado_em', { ascending: false }).range(from, from + LEADS_PAGE_SIZE - 1);
    const { data, count, error } = await query;
    if (error) { toast.error('Erro ao carregar leads: ' + error.message); setLoading(false); return; }
    setRows((data ?? []) as LeadUnificado[]);
    setTotal(count ?? 0);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchDebounced, origemFiltro, faseFiltro, tempFiltro, produtoFiltro, dddFiltro]);

  useEffect(() => { if (mainView === 'tabela') load(); }, [load, mainView]);

  // Fases e produtos disponíveis dependem da origem selecionada (vocabulário difere por fonte)
  useEffect(() => {
    (async () => {
      let q = supabase.from('leads_unificados' as any).select('fase, produto');
      if (origemFiltro.size) q = q.in('origem_tabela', [...origemFiltro]);
      const { data } = await q.limit(5000);
      const fases = new Set((data ?? []).map((r: any) => r.fase).filter(Boolean));
      const produtos = new Set((data ?? []).map((r: any) => r.produto).filter(Boolean));
      setFasesDisponiveis([...fases].sort());
      setProdutosDisponiveis([...produtos].sort());
    })();
  }, [origemFiltro]);

  // DDDs disponíveis (com cidade/estado) — respeita origem selecionada
  useEffect(() => {
    (async () => {
      let q = supabase.from('leads_unificados' as any).select('ddd, cidade, estado').not('ddd', 'is', null);
      if (origemFiltro.size) q = q.in('origem_tabela', [...origemFiltro]);
      const { data } = await q.limit(5000);
      const map = new Map<number, { ddd: number; cidade: string; estado: string }>();
      for (const r of (data ?? []) as any[]) if (!map.has(r.ddd)) map.set(r.ddd, r);
      setDddsDisponiveis([...map.values()].sort((a, b) => a.ddd - b.ddd));
    })();
  }, [origemFiltro]);

  function toggleSet<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setSet(next);
  }

  async function exportarCSV() {
    setExporting(true);
    const all: LeadUnificado[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await applyFilters(
        supabase.from('leads_unificados' as any).select('*'),
      ).order('criado_em', { ascending: false }).range(from, from + CSV_BATCH_SIZE - 1);
      if (error) { toast.error('Erro ao exportar: ' + error.message); setExporting(false); return; }
      const batch = (data ?? []) as LeadUnificado[];
      all.push(...batch);
      if (batch.length < CSV_BATCH_SIZE) break;
      from += CSV_BATCH_SIZE;
    }
    setExporting(false);
    if (!all.length) { toast.error('Nenhum lead pra exportar com esses filtros'); return; }

    const headers = ['Nome', 'Whatsapp', 'Email', 'Origem', 'Produto', 'Fase', 'Temperatura', 'DDD', 'Cidade', 'Estado', 'Boas-vindas'];
    const csvRows = all.map(r => [
      `"${(r.nome ?? '').replace(/"/g, "'")}"`, r.telefone ?? '', r.email ?? '',
      `"${r.origem}"`, `"${r.produto ?? ''}"`, `"${r.fase ?? ''}"`, r.temperatura,
      r.ddd ?? '', `"${r.cidade ?? ''}"`, r.estado ?? '', r.bv_enviado ? 'sim' : 'não',
    ]);
    const csv = [headers, ...csvRows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${all.length} leads exportados`);
  }

  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nome ou telefone…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-64 text-sm" />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {ORIGENS.map(o => (
            <button key={o.valor} onClick={() => toggleSet(origemFiltro, setOrigemFiltro, o.valor)}
              className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                origemFiltro.has(o.valor) ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['quente', 'morno', 'frio'] as const).map(t => {
            const cfg = TEMP_CFG[t];
            return (
              <button key={t} onClick={() => toggleSet(tempFiltro, setTempFiltro, t)}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  tempFiltro.has(t) ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <cfg.icon className="h-3 w-3" /> {cfg.label}
              </button>
            );
          })}
        </div>

        {produtosDisponiveis.length > 0 && (
          <select
            value=""
            onChange={e => { if (e.target.value) toggleSet(produtoFiltro, setProdutoFiltro, e.target.value); }}
            className="h-8 px-2 rounded-md border border-border text-xs bg-background"
          >
            <option value="">+ Filtrar por produto…</option>
            {produtosDisponiveis.filter(p => !produtoFiltro.has(p)).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {fasesDisponiveis.length > 0 && (
          <select
            value=""
            onChange={e => { if (e.target.value) toggleSet(faseFiltro, setFaseFiltro, e.target.value); }}
            className="h-8 px-2 rounded-md border border-border text-xs bg-background"
          >
            <option value="">+ Filtrar por fase…</option>
            {fasesDisponiveis.filter(f => !faseFiltro.has(f)).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}

        {dddsDisponiveis.length > 0 && (
          <select
            value=""
            onChange={e => { if (e.target.value) toggleSet(dddFiltro, setDddFiltro, Number(e.target.value)); }}
            className="h-8 px-2 rounded-md border border-border text-xs bg-background"
          >
            <option value="">+ Filtrar por DDD/cidade…</option>
            {dddsDisponiveis.filter(d => !dddFiltro.has(d.ddd)).map(d => (
              <option key={d.ddd} value={d.ddd}>{d.ddd} — {d.cidade}/{d.estado}</option>
            ))}
          </select>
        )}

        {[...produtoFiltro].map(p => (
          <span key={`p-${p}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700">
            {p}
            <button onClick={() => toggleSet(produtoFiltro, setProdutoFiltro, p)}><X className="h-3 w-3" /></button>
          </span>
        ))}

        {[...faseFiltro].map(f => (
          <span key={`f-${f}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
            {f}
            <button onClick={() => toggleSet(faseFiltro, setFaseFiltro, f)}><X className="h-3 w-3" /></button>
          </span>
        ))}

        {[...dddFiltro].map(d => {
          const info = dddsDisponiveis.find(x => x.ddd === d);
          return (
            <span key={`d-${d}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-100 text-sky-700">
              {d}{info ? ` — ${info.cidade}` : ''}
              <button onClick={() => toggleSet(dddFiltro, setDddFiltro, d)}><X className="h-3 w-3" /></button>
            </span>
          );
        })}

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          {(['tabela', 'quadros'] as const).map(v => (
            <button key={v} onClick={() => setMainView(v)}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                mainView === v ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'tabela' ? <><TableIcon className="h-3.5 w-3.5" /> Planilha</> : <><Kanban className="h-3.5 w-3.5" /> Quadros</>}
            </button>
          ))}
        </div>

        {mainView === 'tabela' && (
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={exporting} className="gap-1.5">
            {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? 'Exportando…' : `Exportar CSV (${total})`}
          </Button>
        )}
      </div>

      {mainView === 'quadros' ? (
        <LeadsQuadros filtroAtual={filtroAtual} />
      ) : (
      <>
      <div className="border rounded-lg overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado para esse filtro</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origem</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fase</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Temp.</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">DDD/Cidade</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Boas-vindas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cfg = TEMP_CFG[r.temperatura];
                return (
                  <tr key={`${r.origem_tabela}-${r.origem_id}`} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="px-3 py-1.5 font-medium truncate max-w-[180px]">{r.nome || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.telefone ? maskPhone(r.telefone) : '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[220px]">{r.origem}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[140px]">{r.produto || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[140px]">{r.fase || '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
                        <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">
                      {r.ddd ? `${r.ddd} — ${r.cidade}/${r.estado}` : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.bv_enviado
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} lead(s) — página {page + 1} de {totalPages}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ── Funil Tab ─────────────────────────────────────────────────────────────────

function FunilTab({ onCreateFunnel }: { onCreateFunnel: () => void }) {
  const [msgs, setMsgs]         = useState<Msg[]>([]);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState(false);
  const [view, setView]         = useState<ViewMode>('table');
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<MsgStatus | 'all'>('all');
  const [dateFilter, setDateFilter]     = useState<DateFilter>('proximos');
  const [wizardOpen, setWizardOpen]     = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('funnel_messages')
      .select('id, funnel_name, day_number, scheduled_at, message_type, message_text, poll_name, subtipo, status, sent_at, error_message')
      .order('scheduled_at', { ascending: true });
    if (error) { toast.error('Erro ao carregar disparos'); return; }
    setMsgs((data ?? []) as Msg[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel('disparos_monitor_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funnel_messages' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function processNow() {
    setProcessing(true);
    const { error } = await supabase.functions.invoke('funil-processar', { body: {} });
    setProcessing(false);
    if (error) { toast.error('Erro ao processar: ' + error.message); return; }
    toast.success('Processamento solicitado! Aguarde alguns segundos.');
    setTimeout(load, 3000);
  }

  const now      = Date.now();
  const agendados = msgs.filter(m => m.status === 'scheduled');
  const enviados  = msgs.filter(m => m.status === 'sent');
  const erros     = msgs.filter(m => m.status === 'error');
  const proximos  = agendados.filter(m => new Date(m.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const proximoDisparo = proximos[0];

  const filtered = useMemo(() => {
    let list = msgs;
    if (dateFilter === 'proximos') {
      const in7d = now + 7 * 24 * 60 * 60 * 1000;
      list = list.filter(m => new Date(m.scheduled_at).getTime() >= now - 60 * 60 * 1000
        && new Date(m.scheduled_at).getTime() <= in7d);
    } else if (dateFilter === 'hoje') {
      const todayStr = new Date().toISOString().slice(0, 10);
      list = list.filter(m => m.scheduled_at.slice(0, 10) === todayStr);
    } else if (dateFilter === 'semana') {
      const in7d = now + 7 * 24 * 60 * 60 * 1000;
      const ago7d = now - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(m => { const t = new Date(m.scheduled_at).getTime(); return t >= ago7d && t <= in7d; });
    }
    if (statusFilter !== 'all') list = list.filter(m => m.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.funnel_name.toLowerCase().includes(q) ||
        (m.message_text ?? '').toLowerCase().includes(q) ||
        (m.poll_name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [msgs, dateFilter, statusFilter, search, now]);

  function exportCSV() {
    const headers = ['Funil', 'Dia', 'Agendado para', 'Tipo', 'Prévia', 'Status', 'Enviado em', 'Erro'];
    const rows = filtered.map(m => [
      `"${m.funnel_name}"`, m.day_number, `"${fmtDatetime(m.scheduled_at)}"`,
      m.message_type, `"${preview(m).replace(/"/g, "'")}"`, m.status,
      m.sent_at ? `"${fmtDatetime(m.sent_at)}"` : '',
      m.error_message ? `"${m.error_message.replace(/"/g, "'")}"` : '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `disparos_funil_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="bg-white border-b px-6 py-3 flex-none">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {proximoDisparo
              ? `Próximo disparo ${fmtRelative(proximoDisparo.scheduled_at)} — ${preview(proximoDisparo, 40)}`
              : 'Nenhum disparo agendado nos próximos dias'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={processNow} disabled={processing} className="gap-1.5">
              <Zap className={cn('h-3.5 w-3.5', processing && 'animate-pulse')} />
              {processing ? 'Processando…' : 'Processar agora'}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo Funil
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {[
            { label: 'Agendados', count: agendados.length, color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-500' },
            { label: 'Enviados',  count: enviados.length,  color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
            { label: 'Erros',     count: erros.length,     color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
            { label: 'Total',     count: msgs.length,      color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
              {s.count} {s.label}
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['table', 'kanban'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  view === v ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {v === 'table' ? <><TableIcon className="h-3.5 w-3.5" /> Planilha</> : <><Kanban className="h-3.5 w-3.5" /> Kanban</>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar funil ou mensagem…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-52 text-sm" />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['proximos', 'hoje', 'semana', 'todos'] as DateFilter[]).map(d => (
              <button key={d} onClick={() => setDateFilter(d)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize',
                  dateFilter === d ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {d === 'proximos' ? 'Próximos 7d' : d === 'hoje' ? 'Hoje' : d === 'semana' ? '±7 dias' : 'Todos'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['all', 'scheduled', 'sent', 'error', 'draft'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  statusFilter === s ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {s === 'all' ? 'Todos' : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">{filtered.length} mensagens</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada para esse filtro</p>
          </div>
        ) : view === 'table' ? (
          <TableView msgs={filtered} />
        ) : (
          <KanbanView msgs={filtered} />
        )}
      </div>

      {wizardOpen && (
        <LancamentoWizard open={wizardOpen} onClose={() => setWizardOpen(false)}
          onSuccess={() => { setWizardOpen(false); load(); }} />
      )}
    </>
  );
}

// ── Nova Campanha Modal ───────────────────────────────────────────────────────

const SUPABASE_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co';

interface NovaCampanhaForm {
  nome: string;
  email: string;
  callback_url: string;
  delay_min_s: number;
  delay_max_s: number;
  daily_limit: number;
  safe_hour_start: number;
  safe_hour_end: number;
}

type CampStep   = 'config' | 'leads' | 'review';
type LeadSource = 'lancamento' | 'turma' | 'csv' | 'grupos';
interface LeadPreview { nome: string; phone: string; temperatura: 'quente' | 'morno' | 'frio'; }
interface WppGroup { id: string; subject: string; size: number; selected: boolean; }

function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep]   = useState<CampStep>('config');
  const [campNome, setCampNome]       = useState('');
  const [template, setTemplate]       = useState('');
  const [msgType, setMsgType]         = useState<'text'|'image'|'audio'|'video'|'document'>('text');
  const [mediaUrl, setMediaUrl]       = useState('');
  const [mentionAll, setMentionAll]   = useState(false);
  const [delayMin, setDelayMin]       = useState(30);
  const [delayMax, setDelayMax]       = useState(90);
  const [hourStart, setHourStart]     = useState(8);
  const [hourEnd, setHourEnd]         = useState(21);
  const [dailyLimit, setDailyLimit]   = useState(200);

  const [source, setSource]                     = useState<LeadSource>('lancamento');
  const [lancamentos, setLancamentos]           = useState<{ id: string; nome: string }[]>([]);
  const [turmas, setTurmas]                     = useState<{ id: string; nome: string }[]>([]);
  const [selectedLancId, setSelectedLancId]     = useState('');
  const [selectedTurmaId, setSelectedTurmaId]   = useState('');
  const [leads, setLeads]                       = useState<LeadPreview[]>([]);
  const [loadingLeads, setLoadingLeads]         = useState(false);
  const [csvError, setCsvError]                 = useState('');
  const [saving, setSaving]                     = useState(false);

  // Grupos WPP
  const [evoInstances, setEvoInstances] = useState<{ id: string; api_url: string; api_key: string; instance_name: string }[]>([]);
  const [selectedEvoId, setSelectedEvoId] = useState('');
  const [wppGroups, setWppGroups]       = useState<WppGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [rodizioIds, setRodizioIds]     = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('lancamentos').select('id, nome').order('created_at', { ascending: false }),
      supabase.from('turmas').select('id, nome').order('nome'),
      supabase.from('evolution_config').select('id, api_url, api_key, instance_name').eq('ativo', true).order('prioridade'),
    ]).then(([l, t, e]) => {
      setLancamentos((l.data ?? []) as { id: string; nome: string }[]);
      setTurmas((t.data ?? []) as { id: string; nome: string }[]);
      const evos = (e.data ?? []) as typeof evoInstances;
      setEvoInstances(evos);
      if (evos.length) setSelectedEvoId(evos[0].id);
      setRodizioIds(evos.map(ev => ev.id));
    });
  }, []);

  function toggleRodizio(id: string) {
    setRodizioIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function fetchWppGroups(evoId: string) {
    const inst = evoInstances.find(e => e.id === evoId);
    if (!inst) return;
    setLoadingGroups(true);
    setWppGroups([]);
    try {
      const base = inst.api_url.replace(/\/$/, '').replace(/^(?!https?:\/\/)/i, 'https://');
      const res = await fetch(`${base}/group/fetchAllGroups/${inst.instance_name}?getParticipants=false`, {
        headers: { apikey: inst.api_key },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const groups: WppGroup[] = (Array.isArray(data) ? data : []).map((g: { id: string; subject: string; size?: number }) => ({
        id: g.id, subject: g.subject ?? g.id, size: g.size ?? 0, selected: false,
      }));
      setWppGroups(groups.sort((a, b) => a.subject.localeCompare(b.subject)));
    } catch (err) {
      toast.error('Erro ao buscar grupos: ' + (err as Error).message.slice(0, 80));
    }
    setLoadingGroups(false);
  }

  function toggleGroup(id: string) {
    setWppGroups(prev => prev.map(g => g.id === id ? { ...g, selected: !g.selected } : g));
    setLeads([]); // limpa leads ao mudar seleção
  }

  function confirmGroups() {
    const selected = wppGroups.filter(g => g.selected);
    if (!selected.length) return;
    setLeads(selected.map(g => ({ nome: g.subject, phone: g.id, temperatura: 'quente' })));
    toast.success(`${selected.length} grupo(s) adicionados como destino`);
  }

  const [loadingPartic, setLoadingPartic] = useState(false);
  async function loadMembersFromGroups() {
    const selected = wppGroups.filter(g => g.selected);
    if (!selected.length) return;
    const inst = evoInstances.find(e => e.id === selectedEvoId);
    if (!inst) return;
    setLoadingPartic(true);
    const base = inst.api_url.replace(/\/$/, '').replace(/^(?!https?:\/\/)/i, 'https://');
    const allLeads: LeadPreview[] = [];
    const seen = new Set<string>();
    for (const grp of selected) {
      try {
        const res = await fetch(`${base}/group/participants/${inst.instance_name}?groupJid=${encodeURIComponent(grp.id)}`, {
          headers: { apikey: inst.api_key },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const participants: { id: string; pushName?: string }[] = Array.isArray(data) ? data : (data?.participants ?? []);
        for (const p of participants) {
          const phone = (p.id ?? '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          allLeads.push({ nome: p.pushName ?? '', phone, temperatura: 'morno' });
        }
      } catch { /* ignora grupo com erro */ }
    }
    setLoadingPartic(false);
    if (allLeads.length) {
      setLeads(allLeads);
      toast.success(`${allLeads.length} membros carregados (sem duplicatas)`);
    } else {
      toast.error('Nenhum membro encontrado nos grupos selecionados');
    }
  }

  async function loadFromLancamento(id: string) {
    if (!id) { setLeads([]); return; }
    setLoadingLeads(true);
    const { data } = await supabase
      .from('lancamento_leads').select('nome, whatsapp, fase')
      .eq('lancamento_id', id).not('whatsapp', 'is', null);
    setLeads((data ?? []).map(r => ({
      nome: r.nome ?? '',
      phone: r.whatsapp ?? '',
      temperatura: (r.fase === 'matriculado' ? 'quente' : r.fase === 'oferta' ? 'morno' : 'frio') as LeadPreview['temperatura'],
    })));
    setLoadingLeads(false);
  }

  async function loadFromTurma(id: string) {
    if (!id) { setLeads([]); return; }
    setLoadingLeads(true);
    const { data } = await supabase
      .from('alunos').select('nome, whatsapp')
      .eq('turma_id', id).eq('status', 'ativo').not('whatsapp', 'is', null);
    setLeads((data ?? []).map(r => ({ nome: r.nome ?? '', phone: r.whatsapp ?? '', temperatura: 'quente' as const })));
    setLoadingLeads(false);
  }

  function parseCSV(file: File) {
    setCsvError('');
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) ?? '';
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setCsvError('Arquivo vazio ou sem dados'); return; }
      const header = lines[0].split(/[;,\t]/).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
      const nomeIdx  = header.findIndex(h => h.includes('nome'));
      const phoneIdx = header.findIndex(h => h.includes('whatsapp') || h.includes('telefone') || h.includes('phone') || h.includes('celular'));
      if (phoneIdx === -1) { setCsvError('Coluna de telefone não encontrada. Use: "Whatsapp", "Telefone" ou "Phone"'); return; }
      const parsed: LeadPreview[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[;,\t]/);
        const phone = (cols[phoneIdx] ?? '').replace(/\D/g, '');
        if (phone.length < 10) continue;
        parsed.push({
          nome: nomeIdx >= 0 ? (cols[nomeIdx] ?? '').trim() : '',
          phone: phone.length === 11 ? '55' + phone : phone,
          temperatura: 'morno',
        });
      }
      if (parsed.length === 0) { setCsvError('Nenhum telefone válido encontrado'); return; }
      setLeads(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleCreate(startActive = false) {
    if (!campNome.trim()) { toast.error('Informe um nome'); return; }
    if (leads.length === 0) { toast.error('Adicione pelo menos 1 lead'); return; }
    setSaving(true);
    const { data: camp, error } = await supabase.from('disparo_campanhas').insert({
      nome: campNome.trim(),
      template: template.trim() || null,
      message_type: msgType,
      media_url: msgType !== 'text' ? (mediaUrl.trim() || null) : null,
      mention_everyone: mentionAll,
      status: startActive ? 'ativo' : 'pausado',
      leads_total: leads.length, leads_sent: 0, leads_error: 0, leads_skipped: 0,
      delay_min_s: delayMin, delay_max_s: delayMax,
      safe_hour_start: hourStart, safe_hour_end: hourEnd,
      daily_limit: dailyLimit,
      evolution_config_ids: rodizioIds,
      next_send_at: new Date().toISOString(),
    }).select('id').single();
    if (error || !camp) { toast.error('Erro: ' + error?.message); setSaving(false); return; }
    const rows = leads.map((l, idx) => ({
      campanha_id: camp.id, nome: l.nome || null, phone: l.phone,
      status: 'pendente', temperatura: l.temperatura, ordem: idx + 1,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from('disparo_leads').insert(rows.slice(i, i + 200));
    }
    setSaving(false);
    toast.success(`Campanha criada com ${leads.length} leads! ${startActive ? '🟢 Ativa' : '⏸ Pausada'}`);
    onCreated(); onClose();
  }

  const canGoLeads = !!campNome.trim() && (msgType === 'text' ? !!template.trim() : !!mediaUrl.trim());
  const canReview  = leads.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-none">
          <div>
            <h2 className="text-lg font-bold text-foreground">Nova Campanha de Disparo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 'config' ? 'Etapa 1 de 3 — Configurações' : step === 'leads' ? 'Etapa 2 de 3 — Fonte dos Leads' : 'Etapa 3 de 3 — Revisão'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-4 flex-none">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['config', 'leads', 'review'] as CampStep[]).map((s, i) => (
              <button key={s}
                onClick={() => { if (s === 'leads' && !canGoLeads) return; if (s === 'review' && !canReview) return; setStep(s); }}
                className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                  step === s ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground/70')}>
                {i + 1}. {s === 'config' ? 'Configuração' : s === 'leads' ? 'Leads' : 'Revisão'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── STEP 1 ── */}
          {step === 'config' && (<>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da campanha *</label>
              <Input value={campNome} onChange={e => setCampNome(e.target.value)} placeholder="Ex: Follow-up Turma #39" className="h-9 text-sm" />
            </div>

            {/* Tipo de mensagem */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo de mensagem</label>
              <div className="grid grid-cols-5 gap-1.5">
                {([
                  { key: 'text'     as const, icon: MessageSquare, label: 'Texto'     },
                  { key: 'image'    as const, icon: Image,         label: 'Imagem'    },
                  { key: 'audio'    as const, icon: Music,         label: 'Áudio'     },
                  { key: 'video'    as const, icon: Video,         label: 'Vídeo'     },
                  { key: 'document' as const, icon: FileText,      label: 'Arquivo'   },
                ]).map(({ key, icon: Icon, label }) => (
                  <button key={key} type="button"
                    onClick={() => { setMsgType(key); if (key === 'text') setMediaUrl(''); }}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all',
                      msgType === key
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* URL da mídia (quando não for texto) */}
            {msgType !== 'text' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  URL da {msgType === 'image' ? 'imagem' : msgType === 'audio' ? 'áudio' : msgType === 'video' ? 'vídeo' : 'arquivo'} *
                  <span className="font-normal opacity-60 ml-1">— link público direto para o arquivo</span>
                </label>
                <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                  placeholder={
                    msgType === 'image'    ? 'https://exemplo.com/imagem.jpg' :
                    msgType === 'audio'    ? 'https://exemplo.com/audio.mp3'  :
                    msgType === 'video'    ? 'https://exemplo.com/video.mp4'  :
                                             'https://exemplo.com/arquivo.pdf'
                  }
                  className="h-9 text-sm font-mono" />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {msgType === 'text' ? 'Mensagem *' : 'Legenda (caption)'}{' '}
                <span className="font-normal opacity-60">— use {`{{nome}}`} para o nome</span>
              </label>
              <Textarea value={template} onChange={e => setTemplate(e.target.value)} rows={msgType === 'text' ? 5 : 3}
                className="text-sm resize-y"
                placeholder={msgType === 'text' ? `Olá {{nome}}! 👋\n\nSua mensagem aqui...` : 'Legenda opcional da mídia...'} />
            </div>

            {/* Mencionar todos */}
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-colors select-none">
              <input type="checkbox" checked={mentionAll} onChange={e => setMentionAll(e.target.checked)}
                className="h-4 w-4 rounded accent-primary flex-none" />
              <div>
                <p className="text-sm font-medium text-foreground">Marcar todos os membros (@todos)</p>
                <p className="text-xs text-muted-foreground">Ao enviar no grupo, menciona cada membro — eles recebem notificação</p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay mínimo (seg)</label>
                <Input type="number" value={delayMin} min={10} onChange={e => setDelayMin(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay máximo (seg)</label>
                <Input type="number" value={delayMax} min={10} onChange={e => setDelayMax(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário seguro</label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={hourStart} min={0} max={23} onChange={e => setHourStart(Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input type="number" value={hourEnd} min={0} max={23} onChange={e => setHourEnd(Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Limite diário</label>
                <Input type="number" value={dailyLimit} min={1} onChange={e => setDailyLimit(Number(e.target.value))} className="h-9 text-sm" />
              </div>
            </div>

            {evoInstances.length > 1 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Instâncias no rodízio
                  <span className="font-normal opacity-60 ml-1">— alterna 1 mensagem por número, respeitando o delay acima</span>
                </label>
                <div className="space-y-1.5">
                  {evoInstances.map(inst => (
                    <label key={inst.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors select-none">
                      <input type="checkbox" checked={rodizioIds.includes(inst.id)} onChange={() => toggleRodizio(inst.id)}
                        className="h-4 w-4 rounded accent-primary flex-none" />
                      <span className="text-sm text-foreground">{inst.instance_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {/* ── STEP 2 ── */}
          {step === 'leads' && (<>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
              {([
                { key: 'lancamento' as LeadSource, label: '📋 Lançamento' },
                { key: 'turma'      as LeadSource, label: '🎓 Turma/Alunos' },
                { key: 'grupos'     as LeadSource, label: '💬 Grupos WPP' },
                { key: 'csv'        as LeadSource, label: '📂 CSV' },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => { setSource(key); setLeads([]); setCsvError(''); }}
                  className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                    source === key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground/70')}>
                  {label}
                </button>
              ))}
            </div>

            {source === 'lancamento' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Carrega leads da planilha do lançamento que têm WhatsApp cadastrado.</p>
                <select value={selectedLancId}
                  onChange={e => { setSelectedLancId(e.target.value); loadFromLancamento(e.target.value); }}
                  className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Selecionar lançamento —</option>
                  {lancamentos.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}

            {source === 'turma' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Carrega alunos ativos da turma com WhatsApp cadastrado.</p>
                <select value={selectedTurmaId}
                  onChange={e => { setSelectedTurmaId(e.target.value); loadFromTurma(e.target.value); }}
                  className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Selecionar turma —</option>
                  {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            )}

            {source === 'grupos' && (
              <div className="space-y-3">
                {/* Seletor de instância */}
                <div className="flex items-center gap-2">
                  <select value={selectedEvoId}
                    onChange={e => { setSelectedEvoId(e.target.value); setWppGroups([]); setLeads([]); }}
                    className="flex-1 px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                    {evoInstances.map(e => <option key={e.id} value={e.id}>{e.instance_name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => fetchWppGroups(selectedEvoId)}
                    disabled={loadingGroups || !selectedEvoId} className="gap-1.5 whitespace-nowrap">
                    {loadingGroups ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    {loadingGroups ? 'Buscando...' : 'Buscar grupos'}
                  </Button>
                </div>

                {/* Lista de grupos */}
                {wppGroups.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{wppGroups.length} grupos — marque os que deseja usar</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setWppGroups(p => p.map(g => ({ ...g, selected: true }))); setLeads([]); }}
                          className="px-2.5 py-1 rounded-md border border-primary text-xs text-primary font-medium hover:bg-primary/10 transition-colors">
                          ✓ Todos
                        </button>
                        <button onClick={() => { setWppGroups(p => p.map(g => ({ ...g, selected: false }))); setLeads([]); }}
                          className="px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground font-medium hover:bg-gray-100 transition-colors">
                          ✗ Nenhum
                        </button>
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                      {wppGroups.map(g => (
                        <label key={g.id}
                          className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 transition-colors',
                            g.selected ? 'bg-primary/5' : 'hover:bg-gray-50')}>
                          <input type="checkbox" checked={g.selected} onChange={() => toggleGroup(g.id)}
                            className="rounded border-border h-4 w-4 accent-primary" />
                          <span className="flex-1 text-sm font-medium truncate">{g.subject}</span>
                          {g.size > 0 && <span className="text-xs text-muted-foreground flex-none">{g.size} membros</span>}
                        </label>
                      ))}
                    </div>
                    {wppGroups.some(g => g.selected) && (
                      <Button size="sm" onClick={confirmGroups} className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Check className="h-3.5 w-3.5" />
                        Confirmar {wppGroups.filter(g => g.selected).length} grupo(s) como destino
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {source === 'csv' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">Formato esperado (CSV):</p>
                  <p>Coluna obrigatória: <code className="bg-blue-100 px-1 rounded">Whatsapp</code> ou <code className="bg-blue-100 px-1 rounded">Telefone</code></p>
                  <p>Coluna opcional: <code className="bg-blue-100 px-1 rounded">Nome</code></p>
                  <p>Separador: vírgula, ponto-e-vírgula ou tab. Primeira linha = cabeçalho.</p>
                </div>
                <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clique para selecionar o arquivo CSV</span>
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseCSV(f); }} />
                </label>
                {csvError && <p className="text-xs text-red-500">{csvError}</p>}
              </div>
            )}

            {loadingLeads && (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando leads...
              </div>
            )}

            {!loadingLeads && leads.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{leads.length} leads carregados</span>
                  <div className="flex gap-1 ml-auto">
                    {(['quente','morno','frio'] as const).map(t => {
                      const count = leads.filter(l => l.temperatura === t).length;
                      if (!count) return null;
                      const cfg = TEMP_CFG[t];
                      return (
                        <span key={t} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.bg, cfg.color, cfg.border)}>
                          <cfg.icon className="h-3 w-3" /> {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Temp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.slice(0, 100).map((l, i) => {
                        const cfg = TEMP_CFG[l.temperatura];
                        return (
                          <tr key={i} className="border-b last:border-0 hover:bg-gray-50/60">
                            <td className="px-3 py-1.5 text-muted-foreground">{i+1}</td>
                            <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">{l.nome || '—'}</td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{maskPhone(l.phone)}</td>
                            <td className="px-3 py-1.5">
                              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
                                <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {leads.length > 100 && (
                        <tr><td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">... e mais {leads.length - 100} leads</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>)}

          {/* ── STEP 3 ── */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 border space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Resumo da Campanha</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground text-xs block">Nome</span><p className="font-medium">{campNome}</p></div>
                  <div><span className="text-muted-foreground text-xs block">Tipo</span><p className="font-medium capitalize">{msgType}</p></div>
                  <div><span className="text-muted-foreground text-xs block">Leads</span><p className="font-medium">{leads.length} contatos</p></div>
                  <div><span className="text-muted-foreground text-xs block">Delay</span><p className="font-medium">{delayMin}s – {delayMax}s</p></div>
                  <div><span className="text-muted-foreground text-xs block">Horário</span><p className="font-medium">{hourStart}h às {hourEnd}h</p></div>
                  <div><span className="text-muted-foreground text-xs block">Limite/dia</span><p className="font-medium">{dailyLimit}</p></div>
                  <div><span className="text-muted-foreground text-xs block">Tempo estimado</span>
                    <p className="font-medium">~{Math.ceil((leads.length * ((delayMin + delayMax) / 2)) / 60)} min</p>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Prévia da mensagem:</p>
                <p className="text-sm whitespace-pre-wrap text-foreground/80">
                  {template.replace(/\{\{nome\}\}/g, leads[0]?.nome || 'Nome').slice(0, 300)}{template.length > 300 ? '…' : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between gap-3 flex-none">
          <Button variant="outline" size="sm"
            onClick={() => step === 'config' ? onClose() : setStep(step === 'review' ? 'leads' : 'config')}>
            {step === 'config' ? 'Cancelar' : '← Voltar'}
          </Button>
          <div className="flex gap-2">
            {step === 'config' && (
              <Button size="sm" onClick={() => setStep('leads')} disabled={!canGoLeads}>
                Próximo → Leads
              </Button>
            )}
            {step === 'leads' && (
              <Button size="sm" onClick={() => setStep('review')} disabled={!canReview}>
                Próximo → Revisão
              </Button>
            )}
            {step === 'review' && (<>
              <Button variant="outline" size="sm" onClick={() => handleCreate(false)} disabled={saving}>
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Criar Pausada
              </Button>
              <Button size="sm" onClick={() => handleCreate(true)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />} Criar e Ativar
              </Button>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Editar Campanha Modal ─────────────────────────────────────────────────────

function EditCampanhaModal({
  campanha,
  onClose,
  onSaved,
}: {
  campanha: Campanha;
  onClose: () => void;
  onSaved: (updated: Partial<Campanha>) => void;
}) {
  const [nome, setNome]               = useState(campanha.nome);
  const [template, setTemplate]       = useState(campanha.template ?? '');
  const [msgType, setMsgType]         = useState<'text'|'image'|'audio'|'video'|'document'>((campanha.message_type as 'text'|'image'|'audio'|'video'|'document') || 'text');
  const [mediaUrl, setMediaUrl]       = useState(campanha.media_url ?? '');
  const [mentionAll, setMentionAll]   = useState((campanha as any).mention_everyone ?? false);
  const [delayMin, setDelayMin]       = useState(campanha.delay_min_s);
  const [delayMax, setDelayMax]       = useState(campanha.delay_max_s);
  const [hourStart, setHourStart]     = useState(campanha.safe_hour_start);
  const [hourEnd, setHourEnd]         = useState(campanha.safe_hour_end);
  const [dailyLimit, setDailyLimit]   = useState(campanha.daily_limit);
  const [saving, setSaving]           = useState(false);

  const [evoInstances, setEvoInstances] = useState<{ id: string; instance_name: string }[]>([]);
  const [rodizioIds, setRodizioIds]     = useState<string[]>(campanha.evolution_config_ids ?? []);

  useEffect(() => {
    supabase.from('evolution_config').select('id, instance_name').eq('ativo', true).order('prioridade')
      .then(({ data }) => {
        const evos = (data ?? []) as { id: string; instance_name: string }[];
        setEvoInstances(evos);
        setRodizioIds(prev => prev.length ? prev : evos.map(e => e.id));
      });
  }, []);

  function toggleRodizio(id: string) {
    setRodizioIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!nome.trim()) { toast.error('Informe um nome'); return; }
    setSaving(true);
    const payload = {
      nome:                 nome.trim(),
      template:             template.trim() || null,
      message_type:         msgType,
      media_url:            msgType !== 'text' ? (mediaUrl.trim() || null) : null,
      mention_everyone:     mentionAll,
      delay_min_s:          delayMin,
      delay_max_s:          delayMax,
      safe_hour_start:      hourStart,
      safe_hour_end:        hourEnd,
      daily_limit:          dailyLimit,
      evolution_config_ids: rodizioIds,
    };
    const { error } = await supabase.from('disparo_campanhas').update(payload).eq('id', campanha.id);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Campanha atualizada!');
    onSaved(payload);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-foreground">Editar Campanha</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{campanha.nome}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da campanha</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
          </div>

          {/* Tipo de mensagem */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo de mensagem</label>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { key: 'text'     as const, icon: MessageSquare, label: 'Texto'   },
                { key: 'image'    as const, icon: Image,         label: 'Imagem'  },
                { key: 'audio'    as const, icon: Music,         label: 'Áudio'   },
                { key: 'video'    as const, icon: Video,         label: 'Vídeo'   },
                { key: 'document' as const, icon: FileText,      label: 'Arquivo' },
              ]).map(({ key, icon: Icon, label }) => (
                <button key={key} type="button"
                  onClick={() => { setMsgType(key); if (key === 'text') setMediaUrl(''); }}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all',
                    msgType === key
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}>
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* URL mídia */}
          {msgType !== 'text' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                URL da {msgType === 'image' ? 'imagem' : msgType === 'audio' ? 'áudio' : msgType === 'video' ? 'vídeo' : 'arquivo'}
                <span className="font-normal opacity-60 ml-1">— link público direto</span>
              </label>
              <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                placeholder="https://..." className="h-9 text-sm font-mono" />
            </div>
          )}

          {/* Mensagem / legenda */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {msgType === 'text' ? 'Mensagem (template)' : 'Legenda (caption)'}
              <span className="ml-2 text-muted-foreground/60 font-normal">use {'{{nome}}'} para o nome</span>
            </label>
            <Textarea value={template} onChange={e => setTemplate(e.target.value)}
              rows={msgType === 'text' ? 6 : 3} className="text-sm resize-y"
              placeholder={msgType === 'text' ? 'Olá {{nome}}, ...' : 'Legenda opcional...'} />
          </div>

          {/* Mencionar todos */}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-colors select-none">
            <input type="checkbox" checked={mentionAll} onChange={e => setMentionAll(e.target.checked)}
              className="h-4 w-4 rounded accent-primary flex-none" />
            <div>
              <p className="text-sm font-medium text-foreground">Marcar todos os membros (@todos)</p>
              <p className="text-xs text-muted-foreground">Ao enviar no grupo, menciona cada membro</p>
            </div>
          </label>

          {/* Configurações de envio */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Configurações de Envio</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay mínimo (seg)</label>
                <Input type="number" value={delayMin} min={10} max={3600}
                  onChange={e => setDelayMin(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay máximo (seg)</label>
                <Input type="number" value={delayMax} min={10} max={3600}
                  onChange={e => setDelayMax(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Limite diário</label>
                <Input type="number" value={dailyLimit} min={1} max={1000}
                  onChange={e => setDailyLimit(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário seguro</label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={hourStart} min={0} max={23}
                    onChange={e => setHourStart(Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input type="number" value={hourEnd} min={0} max={23}
                    onChange={e => setHourEnd(Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
            </div>
          </div>

          {evoInstances.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Instâncias no rodízio
                <span className="font-normal opacity-60 ml-1">— alterna 1 mensagem por número, respeitando o delay acima</span>
              </label>
              <div className="space-y-1.5">
                {evoInstances.map(inst => (
                  <label key={inst.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors select-none">
                    <input type="checkbox" checked={rodizioIds.includes(inst.id)} onChange={() => toggleRodizio(inst.id)}
                      className="h-4 w-4 rounded accent-primary flex-none" />
                    <span className="text-sm text-foreground">{inst.instance_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Salvando…</> : 'Salvar alterações'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Campanhas Tab ─────────────────────────────────────────────────────────────

function CampanhasTab() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [novaModal, setNovaModal] = useState(false);
  const [instanceNames, setInstanceNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [respostasTotal, setRespostasTotal] = useState(0);

  useEffect(() => {
    supabase.from('evolution_config').select('id, instance_name').then(({ data }) => {
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { id: string; instance_name: string }[]) map[row.id] = row.instance_name;
      setInstanceNames(map);
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('disparo_campanhas')
      .select('id, nome, template, status, leads_total, leads_sent, leads_error, leads_skipped, delay_min_s, delay_max_s, next_send_at, created_at, safe_hour_start, safe_hour_end, daily_limit, email_contato, callback_url, message_type, media_url, mention_everyone, evolution_config_ids')
      .order('created_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar campanhas'); return; }
    setCampanhas((data ?? []) as Campanha[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel('campanhas_monitor_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disparo_campanhas' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const loadRespostasTotal = useCallback(async () => {
    const { count } = await supabase.from('disparo_leads').select('id', { count: 'exact', head: true }).not('respondeu_em', 'is', null);
    setRespostasTotal(count ?? 0);
  }, []);

  useEffect(() => { loadRespostasTotal(); }, [loadRespostasTotal]);

  useEffect(() => {
    const ch = supabase.channel('disparo_leads_respostas_rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'disparo_leads' }, () => loadRespostasTotal())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadRespostasTotal]);

  async function pauseCampanha(id: string) {
    const { error } = await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCampanhas(prev => prev.map(c => c.id === id ? { ...c, status: 'pausado' } : c));
    toast.success('Campanha pausada');
  }

  async function resumeCampanha(campanha: Campanha) {
    const nextSlot = nextCommercialSlot(campanha.safe_hour_start, campanha.safe_hour_end);
    const { error } = await supabase.from('disparo_campanhas')
      .update({ status: 'ativo', next_send_at: nextSlot.toISOString() })
      .eq('id', campanha.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCampanhas(prev => prev.map(c =>
      c.id === campanha.id ? { ...c, status: 'ativo', next_send_at: nextSlot.toISOString() } : c
    ));
    const h = nextSlot.getHours();
    const min = String(nextSlot.getMinutes()).padStart(2, '0');
    toast.success(`Campanha retomada — próximo envio às ${h}:${min}`);
  }

  async function deleteCampanha(id: string) {
    if (!confirm('Deletar campanha e todos os leads? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('disparo_campanhas').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCampanhas(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success('Campanha deletada');
  }

  const selecionada = selectedId ? campanhas.find(c => c.id === selectedId) ?? null : null;

  if (selecionada) {
    return (
      <CampanhaDetalheView
        campanha={selecionada}
        instanceNames={instanceNames}
        onBack={() => setSelectedId(null)}
        onPause={() => pauseCampanha(selecionada.id)}
        onResume={() => resumeCampanha(selecionada)}
        onDelete={() => deleteCampanha(selecionada.id)}
        onUpdate={updated => setCampanhas(prev => prev.map(x => x.id === selecionada.id ? { ...x, ...updated } : x))}
      />
    );
  }

  const filtered = search.trim()
    ? campanhas.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : campanhas;

  const ativas     = campanhas.filter(c => c.status === 'ativo').length;
  const concluidas = campanhas.filter(c => c.status === 'concluido').length;
  const pausadas   = campanhas.filter(c => c.status === 'pausado').length;

  return (
    <>
      <div className="bg-white border-b px-6 py-3 flex-none">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Ativas',     count: ativas,    color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
              { label: 'Pausadas',   count: pausadas,  color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-400' },
              { label: 'Concluídas', count: concluidas, color: 'text-blue-700',   bg: 'bg-blue-50',    dot: 'bg-blue-500' },
              { label: 'Total',      count: campanhas.length, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' },
              { label: 'Respostas',  count: respostasTotal, color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500' },
            ].map(s => (
              <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                {s.count} {s.label}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar campanha…" value={search}
                onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-52 text-sm" />
            </div>
            <Button size="sm" onClick={() => setNovaModal(true)}
              className="h-8 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 text-xs font-medium">
              <Plus className="h-3.5 w-3.5" /> Nova Campanha
            </Button>
          </div>
        </div>
      </div>

      {novaModal && (
        <NovaCampanhaModal onClose={() => setNovaModal(false)} onCreated={load} />
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Send className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {campanhas.length === 0
                ? 'Nenhuma campanha criada. Use o botão "Disparar" no Kanban de um lançamento.'
                : 'Nenhuma campanha encontrada.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <CampanhaCard
                key={c.id}
                campanha={c}
                onOpen={() => setSelectedId(c.id)}
                onPause={() => pauseCampanha(c.id)}
                onResume={() => resumeCampanha(c)}
                onDelete={() => deleteCampanha(c.id)}
                onUpdate={updated => setCampanhas(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x))}
                instanceNames={instanceNames}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Campanha Card ─────────────────────────────────────────────────────────────

interface CampanhaCardProps {
  campanha: Campanha;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<Campanha>) => void;
  instanceNames: Record<string, string>;
}

function CampanhaCard({ campanha: c, onOpen, onPause, onResume, onDelete, onUpdate, instanceNames }: CampanhaCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const cfg   = CAMP_STATUS_CFG[c.status] ?? CAMP_STATUS_CFG.rascunho;
  const total = c.leads_total || 1;
  const pct   = Math.round((c.leads_sent / total) * 100);
  const isWithinHours = (() => {
    const h = new Date().getHours();
    return h >= c.safe_hour_start && h < c.safe_hour_end;
  })();

  return (
    <Card className="bg-white shadow-none border transition-shadow hover:shadow-sm">
      {/* ── Header row ── */}
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={onOpen}
        >
          {/* Progress ring */}
          <div className="flex-none w-10 h-10 rounded-full border-2 border-gray-100 flex items-center justify-center bg-gray-50">
            <span className="text-xs font-bold text-foreground">{pct}%</span>
          </div>

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">{c.nome}</span>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.badge)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              {/* Horário comercial */}
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                isWithinHours
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              )}>
                <Clock className="h-3 w-3" />
                {c.safe_hour_start}h–{c.safe_hour_end}h
                {isWithinHours && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5 animate-pulse" />}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">{c.leads_sent}/{c.leads_total}</span>
              {c.leads_error > 0 && <span className="text-red-500">{c.leads_error} erros</span>}
              {c.leads_skipped > 0 && <span>{c.leads_skipped} pulados</span>}
              <span className="text-muted-foreground/60">·</span>
              <span>delay {c.delay_min_s}–{c.delay_max_s}s</span>
              <span className="text-muted-foreground/60">·</span>
              <span><Shield className="inline h-3 w-3 mr-0.5 mb-0.5" />{c.daily_limit}/dia</span>
              {(c.evolution_config_ids?.length ?? 0) > 1 && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span title={c.evolution_config_ids!.map(id => instanceNames[id] ?? id).join(', ')}>
                    <Zap className="inline h-3 w-3 mr-0.5 mb-0.5" />
                    rodízio: {c.evolution_config_ids!.map(id => instanceNames[id] ?? id).join(', ')}
                  </span>
                </>
              )}
              {c.status === 'ativo' && c.next_send_at && (
                <span className="text-blue-600 font-medium">
                  próximo {fmtRelative(c.next_send_at) ?? fmtTime(c.next_send_at)}
                </span>
              )}
              {c.status === 'pausado' && c.next_send_at && (
                <span className="text-amber-600">
                  retoma às {fmtTime(c.next_send_at)}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500',
                  c.status === 'concluido' ? 'bg-blue-500' :
                  c.status === 'erro'      ? 'bg-red-400'  : 'bg-emerald-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-none" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditOpen(true)} title="Editar"
              className="p-1.5 rounded hover:bg-blue-50 text-blue-500 transition-colors">
              <Pencil className="h-4 w-4" />
            </button>
            {c.status === 'ativo' && (
              <button onClick={onPause} title="Pausar"
                className="p-1.5 rounded hover:bg-amber-50 text-amber-600 transition-colors">
                <Pause className="h-4 w-4" />
              </button>
            )}
            {(c.status === 'pausado' || c.status === 'rascunho') && (
              <button onClick={onResume} title={c.status === 'rascunho' ? 'Iniciar' : 'Retomar'}
                className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 transition-colors">
                <Play className="h-4 w-4" />
              </button>
            )}
            <button onClick={onDelete} title="Deletar"
              className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editOpen && (
          <EditCampanhaModal
            campanha={c}
            onClose={() => setEditOpen(false)}
            onSaved={updated => { onUpdate(updated); setEditOpen(false); }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Campanha Detalhe (tela cheia dedicada) ──────────────────────────────────

type LeadStatusFiltro = 'all' | 'pendente' | 'enviado' | 'erro' | 'respondeu';
type LeadSortKey = 'ordem' | 'nome' | 'status' | 'sent_at' | 'respondeu_em';

function CampanhaDetalheView({
  campanha: c, instanceNames, onBack, onPause, onResume, onDelete, onUpdate,
}: {
  campanha: Campanha;
  instanceNames: Record<string, string>;
  onBack: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<Campanha>) => void;
}) {
  const [leads, setLeads] = useState<DisparoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatusFiltro>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [sortKey, setSortKey] = useState<LeadSortKey>('ordem');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [leadViewMode, setLeadViewMode] = useState<'tabela' | 'kanban'>('tabela');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('disparo_leads')
      .select('id, nome, phone, status, sent_at, error_msg, temperatura, ordem, respondeu_em, ultima_resposta, ack_status, instance_id, evolution_message_id')
      .eq('campanha_id', c.id)
      .order('ordem', { ascending: true, nullsFirst: false });
    if (error) { toast.error('Erro ao carregar leads'); setLoading(false); return; }
    setLeads((data ?? []) as DisparoLead[]);
    setLoading(false);
  }, [c.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`disparo_leads_detalhe_${c.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disparo_leads', filter: `campanha_id=eq.${c.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [c.id, load]);

  const respondidos = leads.filter(l => !!l.respondeu_em).length;
  const pendentes   = leads.filter(l => l.status === 'pendente').length;
  const enviados    = leads.filter(l => l.status === 'enviado').length;
  const erros       = leads.filter(l => l.status === 'erro').length;
  const total       = leads.length || 1;

  function toggleSort(key: LeadSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    let list = leads;
    if (statusFilter === 'respondeu') list = list.filter(l => !!l.respondeu_em);
    else if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => (l.nome ?? '').toLowerCase().includes(q) || l.phone.includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'nome') return dir * (a.nome ?? '').localeCompare(b.nome ?? '');
      if (sortKey === 'status') return dir * a.status.localeCompare(b.status);
      if (sortKey === 'sent_at') return dir * ((a.sent_at ? new Date(a.sent_at).getTime() : 0) - (b.sent_at ? new Date(b.sent_at).getTime() : 0));
      if (sortKey === 'respondeu_em') return dir * ((a.respondeu_em ? new Date(a.respondeu_em).getTime() : 0) - (b.respondeu_em ? new Date(b.respondeu_em).getTime() : 0));
      return dir * ((a.ordem ?? 0) - (b.ordem ?? 0));
    });
  }, [leads, search, statusFilter, sortKey, sortDir]);

  // Kanban ignora o filtro de status (as colunas já cumprem esse papel), só aplica a busca.
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(l => (l.nome ?? '').toLowerCase().includes(q) || l.phone.includes(q));
  }, [leads, search]);

  async function moverLeadStatus(lead: DisparoLead, novoStatus: 'pendente' | 'erro') {
    const patch = novoStatus === 'pendente'
      ? { status: 'pendente', sent_at: null, error_msg: null, instance_id: null, evolution_message_id: null, ack_status: null }
      : { status: 'erro', error_msg: 'Marcado manualmente como erro' };
    setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, ...patch } as DisparoLead : l)));
    const { error } = await supabase.from('disparo_leads').update(patch).eq('id', lead.id);
    if (error) { toast.error('Erro ao mover lead: ' + error.message); load(); }
  }

  function exportCSV() {
    const headers = ['Nome', 'Telefone', 'Status', 'Confirmação WhatsApp', 'Enviado em', 'Erro', 'Respondeu em', 'Última resposta'];
    const rows = filtered.map(l => [
      `"${l.nome ?? ''}"`, l.phone, l.status,
      l.ack_status ?? '',
      l.sent_at ? `"${fmtDatetime(l.sent_at)}"` : '',
      l.error_msg ? `"${l.error_msg.replace(/"/g, "'")}"` : '',
      l.respondeu_em ? `"${fmtDatetime(l.respondeu_em)}"` : '',
      l.ultima_resposta ? `"${l.ultima_resposta.replace(/"/g, "'").replace(/\n/g, ' ')}"` : '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `campanha_${c.nome.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const cfg = CAMP_STATUS_CFG[c.status] ?? CAMP_STATUS_CFG.rascunho;
  const isWithinHours = (() => {
    const h = new Date().getHours();
    return h >= c.safe_hour_start && h < c.safe_hour_end;
  })();

  const columns: { key: LeadSortKey | null; label: string }[] = [
    { key: 'nome', label: 'Nome' },
    { key: null, label: 'Telefone' },
    { key: 'status', label: 'Status' },
    { key: null, label: 'Instância' },
    { key: 'sent_at', label: 'Enviado em' },
    { key: null, label: 'Erro' },
    { key: 'respondeu_em', label: 'Última resposta' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b px-6 py-4 flex-none">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar pras campanhas
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">{c.nome}</h2>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.badge)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                isWithinHours ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200')}>
                <Clock className="h-3 w-3" /> {c.safe_hour_start}h–{c.safe_hour_end}h
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <span>delay {c.delay_min_s}–{c.delay_max_s}s</span>
              <span className="text-muted-foreground/60">·</span>
              <span><Shield className="inline h-3 w-3 mr-0.5 mb-0.5" />{c.daily_limit}/dia</span>
              {(c.evolution_config_ids?.length ?? 0) > 1 && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span title={c.evolution_config_ids!.map(id => instanceNames[id] ?? id).join(', ')}>
                    <Zap className="inline h-3 w-3 mr-0.5 mb-0.5" /> rodízio: {c.evolution_config_ids!.map(id => instanceNames[id] ?? id).join(', ')}
                  </span>
                </>
              )}
              {c.status === 'ativo' && c.next_send_at && (
                <span className="text-blue-600 font-medium">próximo {fmtRelative(c.next_send_at) ?? fmtTime(c.next_send_at)}</span>
              )}
              {c.status === 'pausado' && c.next_send_at && (
                <span className="text-amber-600">retoma às {fmtTime(c.next_send_at)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            {c.status === 'ativo' && (
              <Button variant="outline" size="sm" onClick={onPause} className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50">
                <Pause className="h-3.5 w-3.5" /> Pausar
              </Button>
            )}
            {(c.status === 'pausado' || c.status === 'rascunho') && (
              <Button variant="outline" size="sm" onClick={onResume} className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                <Play className="h-3.5 w-3.5" /> {c.status === 'rascunho' ? 'Iniciar' : 'Retomar'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onDelete} className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" /> Deletar
            </Button>
          </div>
        </div>

        {/* Tiles */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {[
            { label: 'Total',       count: leads.length, color: 'text-gray-700',    bg: 'bg-gray-100',   dot: 'bg-gray-400' },
            { label: 'Enviados',    count: enviados,      color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
            { label: 'Erros',       count: erros,         color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500' },
            { label: 'Pendentes',   count: pendentes,     color: 'text-gray-600',    bg: 'bg-gray-50',    dot: 'bg-gray-300' },
            { label: 'Respondidos', count: respondidos,   color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-500' },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
              {s.count} {s.label}
              {s.label !== 'Total' && leads.length > 0 && (
                <span className="opacity-60 text-xs">({Math.round((s.count / total) * 100)}%)</span>
              )}
            </div>
          ))}
        </div>

        {/* Busca + filtro */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar nome ou telefone…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-56 text-sm" />
          </div>
          {leadViewMode === 'tabela' && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {([
                { key: 'all' as const, label: 'Todos' },
                { key: 'pendente' as const, label: 'Pendente' },
                { key: 'enviado' as const, label: 'Enviado' },
                { key: 'erro' as const, label: 'Erro' },
                { key: 'respondeu' as const, label: 'Respondeu' },
              ]).map(f => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    statusFilter === f.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            {leadViewMode === 'tabela' ? filtered.length : searchFiltered.length} leads
          </span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['tabela', 'kanban'] as const).map(v => (
              <button key={v} onClick={() => setLeadViewMode(v)}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  leadViewMode === v ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {v === 'tabela' ? <><TableIcon className="h-3.5 w-3.5" /> Planilha</> : <><Kanban className="h-3.5 w-3.5" /> Kanban</>}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : leadViewMode === 'kanban' ? (
          searchFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum lead encontrado pra essa busca</p>
            </div>
          ) : (
            <CampanhaLeadsKanban leads={searchFiltered} onMover={moverLeadStatus} />
          )
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado pra esse filtro</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/60">
                  {columns.map(col => (
                    <th key={col.label}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={cn('text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide select-none',
                        col.key && 'cursor-pointer hover:text-foreground')}>
                      {col.label}{sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id} className={cn('border-b last:border-0 hover:bg-gray-50/60 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/20')}>
                    <td className="px-3 py-2.5 font-medium text-foreground/90 max-w-[160px] truncate">{l.nome || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{maskPhone(l.phone)}</td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const d = leadStatusDisplay(l.status, l.ack_status);
                        return (
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', d.className)}>
                            {d.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {l.instance_id ? (instanceNames[l.instance_id] ?? l.instance_id) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap"
                      title={l.evolution_message_id ? `ID da mensagem na Evolution: ${l.evolution_message_id}` : undefined}>
                      {l.sent_at ? fmtDatetime(l.sent_at) : '—'}
                      {l.evolution_message_id && <CheckCircle2 className="inline h-3 w-3 ml-1 text-emerald-500" />}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-red-500 max-w-[160px] truncate" title={l.error_msg ?? undefined}>{l.error_msg ?? '—'}</td>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      {l.respondeu_em ? (
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className="h-3 w-3 text-violet-500 mt-0.5 flex-none" />
                          <div className="min-w-0">
                            <p className="text-xs text-foreground/90 truncate" title={l.ultima_resposta ?? undefined}>{l.ultima_resposta || '—'}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtDatetime(l.respondeu_em)}</p>
                          </div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editOpen && (
        <EditCampanhaModal campanha={c} onClose={() => setEditOpen(false)} onSaved={updated => { onUpdate(updated); setEditOpen(false); }} />
      )}
    </div>
  );
}

// ── Kanban de leads de uma campanha ─────────────────────────────────────────────
// Colunas fixas (não customizáveis) — a coluna de cada lead é calculada por
// prioridade: se respondeu, vai pra "Respondeu" independente do status de envio.
// Mover só é permitido Erro↔Pendente (retry manual / marcar como erro pra pular
// no próximo ciclo) — "Enviado" e "Respondeu" só são preenchidos pelo sistema
// real (disparo-runner / webhook evo-resposta), nunca por ação manual.

type LeadColuna = 'pendente' | 'enviado' | 'erro' | 'respondeu';

const LEAD_COLUNAS: { key: LeadColuna; label: string }[] = [
  { key: 'pendente',  label: 'Pendente' },
  { key: 'enviado',   label: 'Enviado' },
  { key: 'erro',      label: 'Erro' },
  { key: 'respondeu', label: 'Respondeu' },
];

function colunaDoLead(l: DisparoLead): LeadColuna {
  if (l.respondeu_em) return 'respondeu';
  if (l.status === 'enviado') return 'enviado';
  if (l.status === 'erro') return 'erro';
  return 'pendente';
}

function CampanhaLeadsKanban({
  leads, onMover,
}: {
  leads: DisparoLead[];
  onMover: (lead: DisparoLead, novoStatus: 'pendente' | 'erro') => void;
}) {
  const porColuna = useMemo(() => {
    const map: Record<LeadColuna, DisparoLead[]> = { pendente: [], enviado: [], erro: [], respondeu: [] };
    for (const l of leads) map[colunaDoLead(l)].push(l);
    return map;
  }, [leads]);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-full pb-4 items-start">
        {LEAD_COLUNAS.map(col => {
          const colLeads = porColuna[col.key];
          return (
            <div key={col.key} className="flex-shrink-0 w-72">
              <div className="bg-muted rounded-lg p-3 h-full">
                <div className="flex items-center justify-between px-1 pb-2">
                  <h4 className="font-semibold text-sm">{col.label}</h4>
                  <span className="text-xs text-muted-foreground bg-white rounded-full px-2 py-0.5">{colLeads.length}</span>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {colLeads.map(l => <DisparoLeadCard key={l.id} lead={l} coluna={col.key} onMover={onMover} />)}
                  {colLeads.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">Vazio</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisparoLeadCard({ lead, coluna, onMover }: {
  lead: DisparoLead;
  coluna: LeadColuna;
  onMover: (lead: DisparoLead, novoStatus: 'pendente' | 'erro') => void;
}) {
  const tempCfg = TEMP_CFG[lead.temperatura];
  return (
    <div className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow space-y-1.5">
      <p className="font-medium text-sm truncate">{lead.nome || '—'}</p>
      <p className="text-xs text-muted-foreground font-mono truncate">{maskPhone(lead.phone)}</p>
      <div className="flex items-center gap-1 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', tempCfg.bg, tempCfg.color)}>
          <tempCfg.icon className="h-2.5 w-2.5" />{tempCfg.label}
        </span>
        {coluna === 'enviado' && (() => {
          const d = leadStatusDisplay(lead.status, lead.ack_status);
          return <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', d.className)}>{d.label}</span>;
        })()}
      </div>

      {coluna === 'erro' && lead.error_msg && (
        <p className="text-[10px] text-red-500 truncate" title={lead.error_msg}>{lead.error_msg}</p>
      )}

      {coluna === 'respondeu' && lead.respondeu_em && (
        <div className="flex items-start gap-1 pt-1 border-t">
          <MessageSquare className="h-3 w-3 text-violet-500 mt-0.5 flex-none" />
          <div className="min-w-0">
            <p className="text-[11px] text-foreground/90 truncate" title={lead.ultima_resposta ?? undefined}>{lead.ultima_resposta || '—'}</p>
            <p className="text-[10px] text-muted-foreground">{fmtDatetime(lead.respondeu_em)}</p>
          </div>
        </div>
      )}

      {coluna === 'erro' && (
        <Select onValueChange={v => v === 'pendente' && onMover(lead, 'pendente')}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Mover pra…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendente (reenviar)</SelectItem>
          </SelectContent>
        </Select>
      )}
      {coluna === 'pendente' && (
        <Select onValueChange={v => v === 'erro' && onMover(lead, 'erro')}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Mover pra…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="erro">Erro (marcar manualmente)</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── Boas-vindas: aba de configuração + monitoramento ───────────────────────────
// Cobre os dois funis que hoje geram boas-vindas (IDM Pelo Brasil / eventos NPA
// e Semana do Despertar / turmas-lançamentos), ambos convergindo pra
// boas_vindas_config (mensagens) e boas_vindas_logs (histórico de envio +
// resposta) depois da unificação em npa-bv-trigger e boas-vindas-enviar.

type BVStats = { wppSent: number; wppError: number; emailSent: number; emailError: number; respondidos: number };

function BoasVindasTab() {
  const [configs, setConfigs] = useState<BoasVindasConfig[]>([]);
  const [stats, setStats] = useState<Map<string, BVStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'idm' | 'despertar'>('all');
  const [selectedFunnel, setSelectedFunnel] = useState<string | null>(null);
  const [editCfg, setEditCfg] = useState<BoasVindasConfig | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);

  const load = useCallback(async () => {
    const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString();
    const [{ data: cfgs }, { data: logs }] = await Promise.all([
      supabase.from('boas_vindas_config').select('*').order('funnel_name', { ascending: false }),
      supabase.from('boas_vindas_logs').select('funnel_name, wpp_status, email_status, respondeu_em').gte('sent_at', seteDiasAtras),
    ]);
    setConfigs((cfgs ?? []) as BoasVindasConfig[]);
    const map = new Map<string, BVStats>();
    for (const l of (logs ?? []) as { funnel_name: string; wpp_status: string; email_status: string; respondeu_em: string | null }[]) {
      if (!map.has(l.funnel_name)) map.set(l.funnel_name, { wppSent: 0, wppError: 0, emailSent: 0, emailError: 0, respondidos: 0 });
      const s = map.get(l.funnel_name)!;
      if (l.wpp_status === 'sent') s.wppSent++; else if (l.wpp_status === 'error') s.wppError++;
      if (l.email_status === 'sent') s.emailSent++; else if (l.email_status === 'error') s.emailError++;
      if (l.respondeu_em) s.respondidos++;
    }
    setStats(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel('boas_vindas_config_tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boas_vindas_config' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boas_vindas_logs' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function toggleField(cfg: BoasVindasConfig, field: 'ativo' | 'wpp_ativo' | 'email_ativo', value: boolean) {
    setConfigs(cs => cs.map(c => c.id === cfg.id ? { ...c, [field]: value } : c));
    const { error } = await supabase.from('boas_vindas_config').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', cfg.id);
    if (error) { toast.error('Erro ao salvar'); load(); } else toast.success('Salvo');
  }

  const filtered = useMemo(() => {
    let list = configs;
    if (tipoFilter !== 'all') list = list.filter(c => tipoFunilBV(c.funnel_name) === tipoFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.funnel_name.toLowerCase().includes(q));
    }
    return list;
  }, [configs, tipoFilter, search]);

  if (selectedFunnel) {
    return <BoasVindasDetalheView funnelName={selectedFunnel} onBack={() => setSelectedFunnel(null)} />;
  }

  const totalRespondidos = [...stats.values()].reduce((sum, s) => sum + s.respondidos, 0);
  const totalErros = [...stats.values()].reduce((sum, s) => sum + s.wppError + s.emailError, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b px-6 py-4 flex-none">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Funis configurados', count: configs.length, color: 'text-gray-700',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
            { label: 'Respostas (7d)',      count: totalRespondidos, color: 'text-violet-700', bg: 'bg-violet-50',  dot: 'bg-violet-500' },
            { label: 'Erros (7d)',          count: totalErros,       color: 'text-red-700',    bg: 'bg-red-50',     dot: 'bg-red-500' },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
              {s.count} {s.label}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar funil…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-56 text-sm" />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {([
              { key: 'all' as const, label: 'Todos' },
              { key: 'idm' as const, label: 'IDM Pelo Brasil' },
              { key: 'despertar' as const, label: 'Semana do Despertar' },
            ]).map(f => (
              <button key={f.key} onClick={() => setTipoFilter(f.key)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  tipoFilter === f.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setNovaOpen(true)} className="ml-auto gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova configuração
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma configuração de boas-vindas encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(cfg => {
              const tipo = tipoFunilBV(cfg.funnel_name);
              const s = stats.get(cfg.funnel_name);
              const errosTotal = (s?.wppError ?? 0) + (s?.emailError ?? 0);
              return (
                <div key={cfg.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setSelectedFunnel(cfg.funnel_name)} className="text-left min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{cfg.funnel_name}</p>
                      <span className={cn('inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        tipo === 'idm' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700')}>
                        {TIPO_BV_LABEL[tipo]}
                      </span>
                    </button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-none" onClick={() => setEditCfg(cfg)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Boas-vindas ativo</span>
                      <Switch checked={cfg.ativo} onCheckedChange={v => toggleField(cfg, 'ativo', v)} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">WhatsApp</span>
                      <Switch checked={cfg.wpp_ativo} onCheckedChange={v => toggleField(cfg, 'wpp_ativo', v)} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">E-mail</span>
                      <Switch checked={cfg.email_ativo} onCheckedChange={v => toggleField(cfg, 'email_ativo', v)} />
                    </label>
                  </div>

                  <div className="mt-3 pt-3 border-t flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span>7d:</span>
                    <span className="text-emerald-600">{s?.wppSent ?? 0} wpp</span>
                    <span className="text-sky-600">{s?.emailSent ?? 0} e-mail</span>
                    {errosTotal > 0 && <span className="text-red-600">{errosTotal} erro</span>}
                    {(s?.respondidos ?? 0) > 0 && <span className="text-violet-600">{s?.respondidos} respondeu</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editCfg && (
        <EditBoasVindasModal cfg={editCfg} onClose={() => setEditCfg(null)}
          onSaved={updated => { setConfigs(cs => cs.map(c => c.id === updated.id ? updated : c)); setEditCfg(null); }} />
      )}
      {novaOpen && (
        <NovaBoasVindasModal configs={configs} onClose={() => setNovaOpen(false)}
          onCreated={created => { setConfigs(cs => [created, ...cs]); setNovaOpen(false); }} />
      )}
    </div>
  );
}

function EditBoasVindasModal({ cfg, onClose, onSaved }: {
  cfg: BoasVindasConfig; onClose: () => void; onSaved: (c: BoasVindasConfig) => void;
}) {
  const tipo = tipoFunilBV(cfg.funnel_name);
  const [wppMsg, setWppMsg] = useState(cfg.wpp_mensagem ?? '');
  const [wppMsgTarde, setWppMsgTarde] = useState(cfg.wpp_mensagem_tarde ?? '');
  const [wppMessageType, setWppMessageType] = useState<BoasVindasConfig['wpp_message_type']>(cfg.wpp_message_type ?? 'text');
  const [wppMediaUrl, setWppMediaUrl] = useState(cfg.wpp_media_url ?? '');
  const [emailAssunto, setEmailAssunto] = useState(cfg.email_assunto ?? '');
  const [emailCorpo, setEmailCorpo] = useState(cfg.email_corpo ?? '');
  const [delayMinS, setDelayMinS] = useState(cfg.delay_min_s ?? 20);
  const [delayMaxS, setDelayMaxS] = useState(cfg.delay_max_s ?? 60);
  const [dailyLimit, setDailyLimit] = useState(cfg.daily_limit ?? 150);
  const [safeHourStart, setSafeHourStart] = useState(cfg.safe_hour_start ?? 8);
  const [safeHourEnd, setSafeHourEnd] = useState(cfg.safe_hour_end ?? 21);
  const [maxErrorsSeq, setMaxErrorsSeq] = useState(cfg.max_errors_seq ?? 3);
  const [pausadoPorErro, setPausadoPorErro] = useState(cfg.pausado_por_erro ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (wppMessageType !== 'text' && !wppMediaUrl.trim()) {
      toast.error('Informe a URL da mídia pro tipo de mensagem escolhido');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('boas_vindas_config').update({
      wpp_mensagem: wppMsg,
      wpp_mensagem_tarde: tipo === 'idm' ? (wppMsgTarde || null) : null,
      wpp_message_type: wppMessageType,
      wpp_media_url: wppMessageType === 'text' ? null : wppMediaUrl.trim(),
      email_assunto: emailAssunto,
      email_corpo: emailCorpo,
      delay_min_s: delayMinS,
      delay_max_s: delayMaxS,
      daily_limit: dailyLimit,
      safe_hour_start: safeHourStart,
      safe_hour_end: safeHourEnd,
      max_errors_seq: maxErrorsSeq,
      pausado_por_erro: pausadoPorErro,
      erros_seq: pausadoPorErro ? cfg.erros_seq : 0,
      updated_at: new Date().toISOString(),
    }).eq('id', cfg.id).select('*').single();
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success('Mensagens atualizadas');
    onSaved(data as BoasVindasConfig);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-none">
          <div>
            <h2 className="text-lg font-bold text-foreground">Editar boas-vindas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{cfg.funnel_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo de mensagem no WhatsApp</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { key: 'text'  as const, icon: MessageSquare, label: 'Texto'  },
                { key: 'image' as const, icon: Image,         label: 'Imagem' },
                { key: 'audio' as const, icon: Music,         label: 'Áudio'  },
                { key: 'video' as const, icon: Video,         label: 'Vídeo'  },
              ]).map(({ key, icon: Icon, label }) => (
                <button key={key} type="button"
                  onClick={() => setWppMessageType(key)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all',
                    wppMessageType === key
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}>
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {wppMessageType !== 'text' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                URL da {wppMessageType === 'image' ? 'imagem' : wppMessageType === 'audio' ? 'áudio' : 'vídeo'}
                <span className="font-normal opacity-60 ml-1">— link público direto para o arquivo</span>
              </label>
              <Input value={wppMediaUrl} onChange={e => setWppMediaUrl(e.target.value)}
                placeholder="https://exemplo.com/arquivo.jpg" className="h-9 text-sm font-mono" />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {wppMessageType === 'text' ? 'Mensagem' : 'Legenda'} WhatsApp{tipo === 'idm' ? ' (manhã)' : ''}{' '}
              <span className="font-normal opacity-60">{"— use {{nome}}, {{evento_nome}}, {{turma}}, {{link_grupo}}, {{data_evento}}"}</span>
            </label>
            <Textarea value={wppMsg} onChange={e => setWppMsg(e.target.value)} rows={5} className="text-sm resize-y"
              placeholder="Olá {{nome}}! 👋 Sua inscrição está confirmada…" />
          </div>

          {tipo === 'idm' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {wppMessageType === 'text' ? 'Mensagem' : 'Legenda'} WhatsApp (tarde) <span className="font-normal opacity-60">— vazio usa a de manhã pros dois turnos</span>
              </label>
              <Textarea value={wppMsgTarde} onChange={e => setWppMsgTarde(e.target.value)} rows={5} className="text-sm resize-y" />
            </div>
          )}

          {/* Instância WhatsApp da fila (compartilhada por todos os funis de boas-vindas) */}
          <div className="p-3 rounded-lg border border-border bg-muted/10">
            <EvolutionTaskPanel task="boas_vindas" label="Boas-vindas (fila)" />
          </div>

          {pausadoPorErro && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-red-200 bg-red-50">
              <div>
                <p className="text-xs font-semibold text-red-800">Fila pausada automaticamente</p>
                <p className="text-[11px] text-red-600">{cfg.erros_seq} erro(s) seguido(s) neste funil.</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => setPausadoPorErro(false)}>
                Reativar
              </Button>
            </div>
          )}

          <div className="border rounded-lg p-3 bg-muted/20 space-y-2.5">
            <p className="text-xs font-semibold text-foreground">Anti-ban da fila</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Delay mín. (seg)</label>
                <Input type="number" min={5} className="h-8 text-sm" value={delayMinS}
                  onChange={e => setDelayMinS(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Delay máx. (seg)</label>
                <Input type="number" min={5} className="h-8 text-sm" value={delayMaxS}
                  onChange={e => setDelayMaxS(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Horário seguro</label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={0} max={23} className="h-8 text-sm" value={safeHourStart}
                    onChange={e => setSafeHourStart(Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input type="number" min={0} max={23} className="h-8 text-sm" value={safeHourEnd}
                    onChange={e => setSafeHourEnd(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Limite diário</label>
                <Input type="number" min={1} className="h-8 text-sm" value={dailyLimit}
                  onChange={e => setDailyLimit(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Pausar após N erros seguidos</label>
              <Input type="number" min={1} className="h-8 text-sm w-24" value={maxErrorsSeq}
                onChange={e => setMaxErrorsSeq(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Assunto do e-mail</label>
            <Input value={emailAssunto} onChange={e => setEmailAssunto(e.target.value)} className="h-9 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Corpo do e-mail (HTML)</label>
            <Textarea value={emailCorpo} onChange={e => setEmailCorpo(e.target.value)} rows={8} className="text-xs font-mono resize-y" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t flex-none">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  );
}

function NovaBoasVindasModal({ configs, onClose, onCreated }: {
  configs: BoasVindasConfig[]; onClose: () => void; onCreated: (c: BoasVindasConfig) => void;
}) {
  const [funnelName, setFunnelName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!funnelName.trim()) { toast.error('Nome do funil obrigatório'); return; }
    setSaving(true);
    const base = configs.find(c => c.funnel_name === copyFrom);
    const { data, error } = await supabase.from('boas_vindas_config').insert({
      funnel_name: funnelName.trim(),
      ativo: true,
      wpp_ativo: base?.wpp_ativo ?? false,
      wpp_mensagem: base?.wpp_mensagem ?? '',
      wpp_mensagem_tarde: base?.wpp_mensagem_tarde ?? null,
      wpp_message_type: base?.wpp_message_type ?? 'text',
      wpp_media_url: base?.wpp_media_url ?? null,
      email_ativo: base?.email_ativo ?? false,
      email_assunto: base?.email_assunto ?? '',
      email_corpo: base?.email_corpo ?? '',
    }).select('*').single();
    setSaving(false);
    if (error) { toast.error(`Erro ao criar: ${error.message}`); return; }
    toast.success('Configuração criada');
    onCreated(data as BoasVindasConfig);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-foreground">Nova configuração de boas-vindas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Nome do funil <span className="font-normal opacity-60">— precisa bater exatamente com o nome usado no evento/turma</span>
            </label>
            <Input value={funnelName} onChange={e => setFunnelName(e.target.value)} placeholder="Ex: Turma #48" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Copiar mensagens de (opcional)</label>
            <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)}
              className="w-full h-9 text-sm border rounded-md px-2 bg-white">
              <option value="">Começar em branco</option>
              {configs.map(c => <option key={c.id} value={c.funnel_name}>{c.funnel_name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Criando…' : 'Criar'}</Button>
        </div>
      </div>
    </div>
  );
}

type BVStatusFiltro = 'all' | 'pendente' | 'wpp_sent' | 'wpp_error' | 'email_sent' | 'email_error' | 'respondeu';

// Linha unificada da tabela de leads: junta o lead de origem (npa_evento_leads
// ou lancamento_leads -- TODOS os leads elegiveis, nao só quem já teve
// tentativa de envio) com a linha de boas_vindas_logs correspondente, casada
// por sufixo de telefone (mesmo padrão de matching que evo-resposta usa).
// Sem log correspondente, status fica "pendente" (nunca tentou).
type BVLeadRow = {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  ingressoGerado?: boolean;
  ingressoPago?: boolean;
  fase?: string | null;
  wpp_status: 'sent' | 'error' | 'skipped' | 'pendente';
  email_status: 'sent' | 'error' | 'skipped' | 'pendente';
  wpp_error: string | null;
  email_error: string | null;
  sent_at: string | null;
  respondeu_em: string | null;
  ultima_resposta: string | null;
};

function statusLabelBV(v: string) {
  if (v === 'sent') return 'Enviado';
  if (v === 'error') return 'Erro';
  if (v === 'skipped') return 'Desativado';
  return 'Pendente';
}

function BoasVindasDetalheView({ funnelName, onBack }: { funnelName: string; onBack: () => void }) {
  const tipo = tipoFunilBV(funnelName);
  const [rows, setRows] = useState<BVLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BVStatusFiltro>('all');

  const load = useCallback(async () => {
    setLoading(true);

    const { data: logsData } = await supabase
      .from('boas_vindas_logs')
      .select('whatsapp, wpp_status, email_status, wpp_error, email_error, sent_at, respondeu_em, ultima_resposta')
      .eq('funnel_name', funnelName)
      .order('sent_at', { ascending: false });

    // Mapa por sufixo de telefone -> log mais recente (a lista já vem ordenada
    // por sent_at desc, então o primeiro achado pra cada sufixo é o mais novo).
    const logByPhone = new Map<string, NonNullable<typeof logsData>[number]>();
    for (const l of logsData ?? []) {
      const s8 = (l.whatsapp ?? '').replace(/\D/g, '').slice(-8);
      if (s8 && !logByPhone.has(s8)) logByPhone.set(s8, l);
    }
    const matchLog = (whatsapp: string | null) => {
      const s8 = (whatsapp ?? '').replace(/\D/g, '').slice(-8);
      return s8 ? logByPhone.get(s8) : undefined;
    };

    let unified: BVLeadRow[] = [];

    if (tipo === 'idm') {
      const { data: evento } = await supabase.from('npa_eventos').select('id').eq('nome', funnelName).maybeSingle();
      if (evento) {
        const { data: leads } = await supabase
          .from('npa_evento_leads')
          .select('id, nome, whatsapp, email, pix_enviado, pix_codigo, ingresso_pago')
          .eq('npa_evento_id', evento.id)
          .order('created_at', { ascending: false });
        unified = (leads ?? []).map(l => {
          const log = matchLog(l.whatsapp);
          return {
            id: l.id, nome: l.nome, whatsapp: l.whatsapp, email: l.email,
            ingressoGerado: Boolean(l.pix_enviado || l.pix_codigo),
            ingressoPago: Boolean(l.ingresso_pago),
            wpp_status: (log?.wpp_status as BVLeadRow['wpp_status']) ?? 'pendente',
            email_status: (log?.email_status as BVLeadRow['email_status']) ?? 'pendente',
            wpp_error: log?.wpp_error ?? null,
            email_error: log?.email_error ?? null,
            sent_at: log?.sent_at ?? null,
            respondeu_em: log?.respondeu_em ?? null,
            ultima_resposta: log?.ultima_resposta ?? null,
          };
        });
      }
    } else {
      const { data: lanc } = await supabase.from('lancamentos').select('id').eq('nome', funnelName).maybeSingle();
      if (lanc) {
        const { data: leads } = await supabase
          .from('lancamento_leads')
          .select('id, nome, whatsapp, email, fase')
          .eq('lancamento_id', lanc.id)
          .order('created_at', { ascending: false });
        unified = (leads ?? []).map(l => {
          const log = matchLog(l.whatsapp);
          return {
            id: l.id, nome: l.nome, whatsapp: l.whatsapp, email: l.email,
            fase: l.fase,
            wpp_status: (log?.wpp_status as BVLeadRow['wpp_status']) ?? 'pendente',
            email_status: (log?.email_status as BVLeadRow['email_status']) ?? 'pendente',
            wpp_error: log?.wpp_error ?? null,
            email_error: log?.email_error ?? null,
            sent_at: log?.sent_at ?? null,
            respondeu_em: log?.respondeu_em ?? null,
            ultima_resposta: log?.ultima_resposta ?? null,
          };
        });
      }
    }

    setRows(unified);
    setLoading(false);
  }, [funnelName, tipo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const leadTable = tipo === 'idm' ? 'npa_evento_leads' : 'lancamento_leads';
    const ch = supabase.channel(`boas_vindas_detalhe_${funnelName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boas_vindas_logs', filter: `funnel_name=eq.${funnelName}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: leadTable }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [funnelName, tipo, load]);

  const total       = rows.length || 1;
  const wppSent     = rows.filter(l => l.wpp_status === 'sent').length;
  const wppError    = rows.filter(l => l.wpp_status === 'error').length;
  const emailSent   = rows.filter(l => l.email_status === 'sent').length;
  const emailError  = rows.filter(l => l.email_status === 'error').length;
  const respondidos = rows.filter(l => !!l.respondeu_em).length;

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === 'pendente') list = list.filter(l => l.wpp_status === 'pendente' && l.email_status === 'pendente');
    else if (statusFilter === 'wpp_sent') list = list.filter(l => l.wpp_status === 'sent');
    else if (statusFilter === 'wpp_error') list = list.filter(l => l.wpp_status === 'error');
    else if (statusFilter === 'email_sent') list = list.filter(l => l.email_status === 'sent');
    else if (statusFilter === 'email_error') list = list.filter(l => l.email_status === 'error');
    else if (statusFilter === 'respondeu') list = list.filter(l => !!l.respondeu_em);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => (l.nome ?? '').toLowerCase().includes(q) || (l.whatsapp ?? '').includes(q) || (l.email ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [rows, search, statusFilter]);

  function exportCSV() {
    const extraHeaders = tipo === 'idm' ? ['Ingresso gerado', 'Ingresso pago'] : ['Fase'];
    const headers = ['Nome', 'WhatsApp', 'E-mail', ...extraHeaders, 'Status WPP', 'Erro WPP', 'Status E-mail', 'Erro E-mail', 'Enviado em', 'Respondeu em', 'Última resposta'];
    const rowsCsv = filtered.map(l => [
      `"${l.nome ?? ''}"`, l.whatsapp ?? '', l.email ?? '',
      ...(tipo === 'idm' ? [l.ingressoGerado ? 'Sim' : 'Não', l.ingressoPago ? 'Sim' : 'Não'] : [l.fase ?? '']),
      l.wpp_status,
      l.wpp_error ? `"${l.wpp_error.replace(/"/g, "'")}"` : '',
      l.email_status,
      l.email_error ? `"${l.email_error.replace(/"/g, "'")}"` : '',
      l.sent_at ? `"${fmtDatetime(l.sent_at)}"` : '',
      l.respondeu_em ? `"${fmtDatetime(l.respondeu_em)}"` : '',
      l.ultima_resposta ? `"${l.ultima_resposta.replace(/"/g, "'").replace(/\n/g, ' ')}"` : '',
    ]);
    const csv = [headers, ...rowsCsv].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `boas_vindas_${funnelName.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b px-6 py-4 flex-none">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar pras boas-vindas
        </button>
        <h2 className="text-lg font-bold text-foreground">{funnelName}</h2>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {[
            { label: 'Total',          count: rows.length, color: 'text-gray-700',    bg: 'bg-gray-100',   dot: 'bg-gray-400' },
            { label: 'WPP enviado',    count: wppSent,      color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
            { label: 'WPP erro',       count: wppError,     color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500' },
            { label: 'E-mail enviado', count: emailSent,    color: 'text-sky-700',     bg: 'bg-sky-50',     dot: 'bg-sky-500' },
            { label: 'E-mail erro',    count: emailError,   color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500' },
            { label: 'Respondidos',    count: respondidos,  color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-500' },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
              {s.count} {s.label}
              {s.label !== 'Total' && rows.length > 0 && (
                <span className="opacity-60 text-xs">({Math.round((s.count / total) * 100)}%)</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar nome, whatsapp ou e-mail…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-64 text-sm" />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {([
              { key: 'all' as const, label: 'Todos' },
              { key: 'pendente' as const, label: 'Pendente' },
              { key: 'wpp_sent' as const, label: 'WPP enviado' },
              { key: 'wpp_error' as const, label: 'WPP erro' },
              { key: 'email_sent' as const, label: 'E-mail enviado' },
              { key: 'email_error' as const, label: 'E-mail erro' },
              { key: 'respondeu' as const, label: 'Respondeu' },
            ]).map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  statusFilter === f.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">{filtered.length} leads</span>
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado pra esse filtro</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/60">
                  {[
                    'Nome', 'WhatsApp', 'E-mail',
                    ...(tipo === 'idm' ? ['Ingresso gerado', 'Ingresso pago'] : ['Fase']),
                    'WPP', 'E-mail', 'Enviado em', 'Última resposta',
                  ].map(h => (
                    <th key={h} className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id} className={cn('border-b last:border-0 hover:bg-gray-50/60 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/20')}>
                    <td className="px-3 py-2.5 font-medium text-foreground/90 max-w-[160px] truncate">{l.nome || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{l.whatsapp ? maskPhone(l.whatsapp) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">{l.email || '—'}</td>
                    {tipo === 'idm' ? (
                      <>
                        <td className="px-3 py-2.5">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            l.ingressoGerado ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-500')}>
                            {l.ingressoGerado ? 'Sim' : 'Não'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            l.ingressoPago ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                            {l.ingressoPago ? 'Sim' : 'Não'}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                          {l.fase || '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        l.wpp_status === 'sent' ? 'bg-emerald-50 text-emerald-700' :
                        l.wpp_status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500')}
                        title={l.wpp_error ?? undefined}>
                        {statusLabelBV(l.wpp_status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        l.email_status === 'sent' ? 'bg-emerald-50 text-emerald-700' :
                        l.email_status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500')}
                        title={l.email_error ?? undefined}>
                        {statusLabelBV(l.email_status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{l.sent_at ? fmtDatetime(l.sent_at) : '—'}</td>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      {l.respondeu_em ? (
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className="h-3 w-3 text-violet-500 mt-0.5 flex-none" />
                          <div className="min-w-0">
                            <p className="text-xs text-foreground/90 truncate" title={l.ultima_resposta ?? undefined}>{l.ultima_resposta || '—'}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtDatetime(l.respondeu_em)}</p>
                          </div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Table View ────────────────────────────────────────────────────────────────

function TableView({ msgs }: { msgs: Msg[] }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/60">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Funil</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-10">Dia</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Agendado para</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-20">Tipo</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Mensagem</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-28">Status</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Enviado em</th>
          </tr>
        </thead>
        <tbody>
          {msgs.map((m, i) => {
            const cfg = STATUS_CFG[m.status];
            const Icon = TYPE_ICON[m.message_type] ?? MessageSquare;
            const StatusIcon = cfg.icon;
            const isPast = new Date(m.scheduled_at).getTime() < Date.now();
            return (
              <tr key={m.id} className={cn('border-b last:border-0 hover:bg-gray-50/60 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/20')}>
                <td className="px-4 py-2.5">
                  <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', funnelBadgeColor(m.funnel_name))}>
                    {m.funnel_name}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">D{m.day_number}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  <span className={cn(m.status === 'scheduled' && !isPast ? 'text-blue-600 font-medium' : '')}>
                    {fmtDatetime(m.scheduled_at)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="capitalize">{m.message_type}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-foreground/80 max-w-xs">
                  <span className="line-clamp-1">{preview(m, 90)}</span>
                  {m.error_message && (
                    <span className="text-red-500 block text-xs mt-0.5 line-clamp-1">{m.error_message}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.badge)}>
                    <StatusIcon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {m.sent_at ? fmtDatetime(m.sent_at) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────

function KanbanView({ msgs }: { msgs: Msg[] }) {
  const columns: { status: MsgStatus; label: string }[] = [
    { status: 'scheduled', label: 'Agendado' },
    { status: 'sent',      label: 'Enviado'  },
    { status: 'error',     label: 'Erro'     },
    { status: 'draft',     label: 'Rascunho' },
  ];

  const byStatus = useMemo(() => {
    const map = new Map<MsgStatus, Msg[]>();
    for (const col of columns) map.set(col.status, []);
    for (const m of msgs) { const arr = map.get(m.status); if (arr) arr.push(m); }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  return (
    <div className="flex gap-4 min-h-full pb-4" style={{ alignItems: 'flex-start' }}>
      {columns.map(col => {
        const cfg   = STATUS_CFG[col.status];
        const cards = byStatus.get(col.status) ?? [];
        const Ic    = cfg.icon;
        return (
          <div key={col.status} className="flex-1 min-w-64 max-w-80">
            <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 bg-white">
              <Ic className={cn('h-4 w-4',
                col.status === 'scheduled' ? 'text-blue-500' :
                col.status === 'sent'      ? 'text-emerald-500' :
                col.status === 'error'     ? 'text-red-500' : 'text-gray-400')} />
              <span className="font-semibold text-sm text-foreground">{col.label}</span>
              <span className={cn('ml-auto text-xs font-medium px-2 py-0.5 rounded-full border', cfg.badge)}>{cards.length}</span>
            </div>
            <div className="border rounded-b-xl bg-gray-50/60 p-2 space-y-2 min-h-20">
              {cards.map(m => <KanbanCard key={m.id} msg={m} />)}
              {cards.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">Vazio</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ msg }: { msg: Msg }) {
  const Icon = TYPE_ICON[msg.message_type] ?? MessageSquare;
  const isPast = msg.status === 'scheduled' && new Date(msg.scheduled_at).getTime() < Date.now();
  return (
    <Card className={cn('bg-white shadow-none border hover:shadow-sm transition-shadow cursor-default',
      isPast && 'border-orange-200 bg-orange-50/30')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium leading-tight', funnelBadgeColor(msg.funnel_name))}>
            {msg.funnel_name}
          </span>
          <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 flex-none">D{msg.day_number}</span>
        </div>
        <p className="text-xs text-foreground/80 leading-snug line-clamp-2">{preview(msg, 100)}</p>
        {msg.error_message && <p className="text-xs text-red-500 line-clamp-1">{msg.error_message}</p>}
        <div className="flex items-center gap-2 pt-1">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1 truncate">{fmtDatetime(msg.scheduled_at)}</span>
          {isPast && <span className="text-xs text-orange-500 font-medium">atrasado</span>}
          {msg.sent_at && <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-none" />}
        </div>
      </CardContent>
    </Card>
  );
}
