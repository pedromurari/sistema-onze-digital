import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LancamentoWizard } from '@/components/crm/LancamentoWizard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Radio, TableIcon, Kanban, Download, Plus, RefreshCw,
  Clock, CheckCircle2, AlertCircle, FileText,
  MessageSquare, Image, Music, Video, BarChart2,
  Search, Zap, Pause, Play, Trash2, Send,
  ChevronDown, ChevronRight, Flame, Thermometer, Snowflake,
  Users, Shield, Webhook, Mail, Link, Copy, X, Info, Pencil, Upload, Check,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

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
}

type ViewMode   = 'table' | 'kanban';
type DateFilter = 'proximos' | 'hoje' | 'semana' | 'todos';
type MainTab    = 'funil' | 'campanhas';

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

function maskPhone(phone: string) {
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

export function DisparosMonitor({ onCreateFunnel }: { onCreateFunnel: () => void }) {
  const [mainTab, setMainTab] = useState<MainTab>('funil');

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
              onClick={() => setMainTab('funil')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'funil' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Clock className="h-3.5 w-3.5" /> Mensagens de Funil
            </button>
            <button
              onClick={() => setMainTab('campanhas')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === 'campanhas' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Send className="h-3.5 w-3.5" /> Campanhas de Disparo
            </button>
          </div>
        </div>
      </div>

      {mainTab === 'funil'
        ? <FunilTab onCreateFunnel={onCreateFunnel} />
        : <CampanhasTab />
      }
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
  const [loadingPartic, setLoadingPartic] = useState(false);

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
    });
  }, []);

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

  async function loadFromGroups() {
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
          const phone = p.id?.replace('@s.whatsapp.net', '').replace(/\D/g, '');
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          allLeads.push({ nome: p.pushName ?? '', phone, temperatura: 'morno' });
        }
      } catch { /* ignora grupo com erro */ }
    }
    setLeads(allLeads);
    setLoadingPartic(false);
    if (allLeads.length) toast.success(`${allLeads.length} participantes carregados (sem duplicatas)`);
    else toast.error('Nenhum participante encontrado nos grupos selecionados');
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
      status: startActive ? 'ativo' : 'pausado',
      leads_total: leads.length, leads_sent: 0, leads_error: 0, leads_skipped: 0,
      delay_min_s: delayMin, delay_max_s: delayMax,
      safe_hour_start: hourStart, safe_hour_end: hourEnd,
      daily_limit: dailyLimit,
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
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{wppGroups.length} grupos encontrados — marque os que deseja usar</span>
                      <div className="flex gap-2">
                        <button onClick={() => setWppGroups(p => p.map(g => ({ ...g, selected: true })))}
                          className="text-xs text-primary hover:underline">Todos</button>
                        <button onClick={() => setWppGroups(p => p.map(g => ({ ...g, selected: false })))}
                          className="text-xs text-muted-foreground hover:underline">Nenhum</button>
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
                      <Button size="sm" onClick={loadFromGroups} disabled={loadingPartic} className="w-full gap-1.5">
                        {loadingPartic
                          ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando participantes...</>
                          : <><Users className="h-3.5 w-3.5" /> Carregar participantes ({wppGroups.filter(g => g.selected).length} grupos)</>}
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

interface EditCampanhaForm {
  nome: string;
  template: string;
  delay_min_s: number;
  delay_max_s: number;
  safe_hour_start: number;
  safe_hour_end: number;
  daily_limit: number;
}

function EditCampanhaModal({
  campanha,
  onClose,
  onSaved,
}: {
  campanha: Campanha;
  onClose: () => void;
  onSaved: (updated: Partial<Campanha>) => void;
}) {
  const [form, setForm] = useState<EditCampanhaForm>({
    nome:            campanha.nome,
    template:        campanha.template ?? '',
    delay_min_s:     campanha.delay_min_s,
    delay_max_s:     campanha.delay_max_s,
    safe_hour_start: campanha.safe_hour_start,
    safe_hour_end:   campanha.safe_hour_end,
    daily_limit:     campanha.daily_limit,
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof EditCampanhaForm>(k: K, v: EditCampanhaForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Informe um nome'); return; }
    setSaving(true);
    const payload = {
      nome:            form.nome.trim(),
      template:        form.template.trim() || null,
      delay_min_s:     form.delay_min_s,
      delay_max_s:     form.delay_max_s,
      safe_hour_start: form.safe_hour_start,
      safe_hour_end:   form.safe_hour_end,
      daily_limit:     form.daily_limit,
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
            <Input value={form.nome} onChange={e => set('nome', e.target.value)} className="h-9 text-sm" />
          </div>

          {/* Mensagem */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Mensagem (template)
              <span className="ml-2 text-muted-foreground/60 font-normal">use {'{{nome}}'} para o nome do lead</span>
            </label>
            <Textarea
              value={form.template}
              onChange={e => set('template', e.target.value)}
              rows={6}
              className="text-sm resize-y"
              placeholder="Olá {{nome}}, temos uma oferta especial para você..."
            />
          </div>

          {/* Delay e Horário */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Configurações de Envio</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay mínimo (seg)</label>
                <Input type="number" value={form.delay_min_s} min={10} max={3600}
                  onChange={e => set('delay_min_s', Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delay máximo (seg)</label>
                <Input type="number" value={form.delay_max_s} min={10} max={3600}
                  onChange={e => set('delay_max_s', Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Limite diário</label>
                <Input type="number" value={form.daily_limit} min={1} max={1000}
                  onChange={e => set('daily_limit', Number(e.target.value))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário seguro</label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.safe_hour_start} min={0} max={23}
                    onChange={e => set('safe_hour_start', Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input type="number" value={form.safe_hour_end} min={0} max={23}
                    onChange={e => set('safe_hour_end', Number(e.target.value))} className="h-9 text-sm w-16 text-center" />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
            </div>
          </div>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [leads, setLeads] = useState<Record<string, DisparoLead[]>>({});
  const [loadingLeads, setLoadingLeads] = useState<Set<string>>(new Set());
  const [novaModal, setNovaModal] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('disparo_campanhas')
      .select('id, nome, template, status, leads_total, leads_sent, leads_error, leads_skipped, delay_min_s, delay_max_s, next_send_at, created_at, safe_hour_start, safe_hour_end, daily_limit, email_contato, callback_url')
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

  async function loadLeads(campanhaId: string) {
    if (leads[campanhaId] || loadingLeads.has(campanhaId)) return;
    setLoadingLeads(prev => new Set(prev).add(campanhaId));
    const { data, error } = await supabase
      .from('disparo_leads')
      .select('id, nome, phone, status, sent_at, error_msg, temperatura, ordem')
      .eq('campanha_id', campanhaId)
      .order('ordem', { ascending: true, nullsFirst: false });
    setLoadingLeads(prev => { const s = new Set(prev); s.delete(campanhaId); return s; });
    if (error) { toast.error('Erro ao carregar leads'); return; }
    setLeads(prev => ({ ...prev, [campanhaId]: (data ?? []) as DisparoLead[] }));
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        loadLeads(id);
      }
      return next;
    });
  }

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
    toast.success('Campanha deletada');
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
                isExpanded={expanded.has(c.id)}
                onToggle={() => toggleExpand(c.id)}
                leads={leads[c.id] ?? null}
                loadingLeads={loadingLeads.has(c.id)}
                onPause={() => pauseCampanha(c.id)}
                onResume={() => resumeCampanha(c)}
                onDelete={() => deleteCampanha(c.id)}
                onUpdate={updated => setCampanhas(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x))}
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
  isExpanded: boolean;
  onToggle: () => void;
  leads: DisparoLead[] | null;
  loadingLeads: boolean;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<Campanha>) => void;
}

function CampanhaCard({ campanha: c, isExpanded, onToggle, leads, loadingLeads, onPause, onResume, onDelete, onUpdate }: CampanhaCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const cfg   = CAMP_STATUS_CFG[c.status] ?? CAMP_STATUS_CFG.rascunho;
  const total = c.leads_total || 1;
  const pct   = Math.round((c.leads_sent / total) * 100);
  const isWithinHours = (() => {
    const h = new Date().getHours();
    return h >= c.safe_hour_start && h < c.safe_hour_end;
  })();

  const byStatus = useMemo<Record<string, DisparoLead[]>>(() => {
    const base: Record<string, DisparoLead[]> = { pendente: [], enviado: [], erro: [] };
    for (const l of leads ?? []) {
      const key = l.status in base ? l.status : 'pendente';
      base[key].push(l);
    }
    return base;
  }, [leads]);

  return (
    <Card className={cn('bg-white shadow-none border transition-shadow', isExpanded ? 'shadow-sm' : 'hover:shadow-sm')}>
      {/* ── Header row ── */}
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={onToggle}
        >
          {/* Expand icon */}
          <div className="flex-none text-muted-foreground">
            {isExpanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </div>

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
            {c.status === 'pausado' && (
              <button onClick={onResume} title="Retomar"
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

        {/* ── Expanded panel ── */}
        {isExpanded && (
          <div className="border-t bg-gray-50/60 px-4 pb-4 pt-3">
            {loadingLeads ? (
              <div className="flex items-center justify-center h-24">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !leads || leads.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-sm text-muted-foreground gap-2">
                <Users className="h-4 w-4" /> Nenhum lead nesta campanha
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'pendente', label: 'Falta Receber', icon: Clock,        color: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-200' },
                  { key: 'enviado',  label: 'Recebeu',       icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                  { key: 'erro',     label: 'Erro',          icon: AlertCircle,  color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
                ] as const).map(({ key, label, icon: Icon, color, bg, border }) => {
                  const list = byStatus[key] ?? [];
                  return (
                    <div key={key} className={cn('rounded-lg border bg-white overflow-hidden', border)}>
                      <div className={cn('flex items-center gap-2 px-3 py-2 border-b', bg, border)}>
                        <Icon className={cn('h-3.5 w-3.5', color)} />
                        <span className={cn('text-xs font-semibold', color)}>{label}</span>
                        <span className={cn('ml-auto text-xs font-bold', color)}>{list.length}</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                        {list.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>
                        ) : list.map(lead => (
                          <LeadRow key={lead.id} lead={lead} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadRow({ lead }: { lead: DisparoLead }) {
  const statusDot =
    lead.status === 'enviado' ? 'bg-emerald-500' :
    lead.status === 'erro'    ? 'bg-red-500'     :
    'bg-gray-300';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50/80 transition-colors">
      <span className={cn('w-1.5 h-1.5 rounded-full flex-none', statusDot)} />
      <span className="text-xs text-foreground/80 truncate flex-1">
        {lead.nome ?? maskPhone(lead.phone)}
      </span>
      <span className="text-xs text-muted-foreground flex-none">
        {lead.status === 'enviado' && lead.sent_at ? fmtTime(lead.sent_at) : lead.status === 'erro' ? 'erro' : '—'}
      </span>
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
