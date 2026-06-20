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
  Users, Shield, Webhook, Mail, Link, Copy, X, Info,
} from 'lucide-react';
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

function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NovaCampanhaForm>({
    nome: '', email: '', callback_url: '',
    delay_min_s: 30, delay_max_s: 90,
    daily_limit: 200, safe_hour_start: 8, safe_hour_end: 21,
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/disparo-runner`;

  function set<K extends keyof NovaCampanhaForm>(k: K, v: NovaCampanhaForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Informe um nome para a campanha'); return; }
    setSaving(true);
    const { error } = await supabase.from('disparo_campanhas').insert({
      nome: form.nome.trim(),
      template: form.callback_url.trim() || null,
      email_contato: form.email.trim() || null,
      callback_url: form.callback_url.trim() || null,
      status: 'pausado',
      leads_total: 0, leads_sent: 0, leads_error: 0, leads_skipped: 0,
      delay_min_s: form.delay_min_s,
      delay_max_s: form.delay_max_s,
      daily_limit: form.daily_limit,
      safe_hour_start: form.safe_hour_start,
      safe_hour_end: form.safe_hour_end,
      next_send_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error('Erro ao criar campanha: ' + error.message); return; }
    toast.success('Campanha criada!');
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-foreground">Nova Campanha de Disparo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure o fluxo n8n e os parâmetros de envio</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Dados básicos */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Dados da Campanha</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da campanha *</label>
                <Input value={form.nome} onChange={e => set('nome', e.target.value)}
                  placeholder="Ex: Turma #38 — Lista de Espera" className="h-9 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> E-mail de notificação
                </label>
                <Input value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="seu@email.com" type="email" className="h-9 text-sm" />
                <p className="text-xs text-muted-foreground mt-1">Recebe alertas quando a campanha concluir ou tiver erros.</p>
              </div>
            </div>
          </div>

          {/* Webhook entrada (n8n → sistema) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-none">
                <span className="text-xs font-bold text-violet-700">1</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground">Webhook de Entrada</h3>
              <span className="text-xs text-muted-foreground">(n8n → sistema)</span>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
              <p className="text-xs text-violet-800 leading-relaxed">
                Configure no seu fluxo n8n um nó <strong>HTTP Request</strong> com método <code className="bg-violet-100 px-1 py-0.5 rounded">POST</code> para esta URL.
                Envie os leads nesse endpoint e o sistema os enfileira automaticamente.
              </p>
              <div>
                <label className="text-xs font-medium text-violet-700 mb-1.5 block">URL do Webhook</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-violet-200 rounded-lg px-3 py-2 flex items-center gap-2 font-mono text-xs text-foreground overflow-x-auto">
                    <Webhook className="h-3.5 w-3.5 text-violet-500 flex-none" />
                    <span className="truncate">{webhookUrl}</span>
                  </div>
                  <button
                    onClick={() => copyText(webhookUrl, 'webhook')}
                    className="flex-none flex items-center gap-1 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 transition-colors">
                    {copied === 'webhook' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === 'webhook' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              <div className="bg-white border border-violet-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Payload esperado (JSON):</p>
                <pre className="text-xs text-muted-foreground leading-relaxed overflow-x-auto">{`{
  "campanha_id": "<id da campanha>",
  "leads": [
    { "nome": "João Silva", "phone": "5511999999999", "temperatura": "quente" },
    { "nome": "Maria",      "phone": "5521888888888", "temperatura": "morno"  }
  ]
}`}</pre>
              </div>
              <div className="flex items-start gap-2 text-xs text-violet-700 bg-violet-100 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 flex-none mt-0.5" />
                <span><strong>temperatura</strong>: <code>quente</code> | <code>morno</code> | <code>frio</code> — define a ordem de prioridade no disparo.</span>
              </div>
            </div>
          </div>

          {/* HTTP Callback (sistema → n8n) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-none">
                <span className="text-xs font-bold text-emerald-700">2</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground">Callback HTTP de Retorno</h3>
              <span className="text-xs text-muted-foreground">(sistema → n8n)</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs text-emerald-800 leading-relaxed">
                Após cada envio, o sistema chama esta URL com o resultado. Configure um nó <strong>Webhook</strong> no n8n para receber e processar o retorno.
              </p>
              <div>
                <label className="text-xs font-medium text-emerald-700 mb-1.5 block">URL de Callback (n8n Webhook)</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                    <Input
                      value={form.callback_url}
                      onChange={e => set('callback_url', e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/disparo-retorno"
                      className="h-9 text-sm pl-8 border-emerald-200 focus:border-emerald-400"
                    />
                  </div>
                  {form.callback_url && (
                    <button
                      onClick={() => copyText(form.callback_url, 'callback')}
                      className="flex-none flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors">
                      {copied === 'callback' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === 'callback' ? 'Copiado!' : 'Copiar'}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-white border border-emerald-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Payload do retorno (JSON):</p>
                <pre className="text-xs text-muted-foreground leading-relaxed overflow-x-auto">{`{
  "campanha_id": "<id>",
  "lead_id":     "<id>",
  "phone":       "5511999999999",
  "nome":        "João Silva",
  "status":      "enviado" | "erro",
  "sent_at":     "2026-06-21T08:05:00Z",
  "error_msg":   null
}`}</pre>
              </div>
            </div>
          </div>

          {/* Configurações de envio */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Configurações de Envio</h3>
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

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">A campanha inicia <strong>pausada</strong> — ative após configurar o fluxo no n8n.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Criando…</> : <><Plus className="h-3.5 w-3.5 mr-1" /> Criar Campanha</>}
            </Button>
          </div>
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
      .select('id, nome, template, status, leads_total, leads_sent, leads_error, leads_skipped, delay_min_s, delay_max_s, next_send_at, created_at, safe_hour_start, safe_hour_end, daily_limit')
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
}

function CampanhaCard({ campanha: c, isExpanded, onToggle, leads, loadingLeads, onPause, onResume, onDelete }: CampanhaCardProps) {
  const cfg   = CAMP_STATUS_CFG[c.status] ?? CAMP_STATUS_CFG.rascunho;
  const total = c.leads_total || 1;
  const pct   = Math.round((c.leads_sent / total) * 100);
  const isWithinHours = (() => {
    const h = new Date().getHours();
    return h >= c.safe_hour_start && h < c.safe_hour_end;
  })();

  const byTemp = useMemo<Record<Temperatura, DisparoLead[]>>(() => {
    const base: Record<Temperatura, DisparoLead[]> = { quente: [], morno: [], frio: [] };
    for (const l of leads ?? []) base[l.temperatura]?.push(l);
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
                {(['quente', 'morno', 'frio'] as Temperatura[]).map(temp => {
                  const tcfg  = TEMP_CFG[temp];
                  const TIcon = tcfg.icon;
                  const list  = byTemp[temp];
                  return (
                    <div key={temp} className={cn('rounded-lg border bg-white overflow-hidden', tcfg.border)}>
                      {/* Temperature header */}
                      <div className={cn('flex items-center gap-2 px-3 py-2 border-b', tcfg.bg, tcfg.border)}>
                        <TIcon className={cn('h-3.5 w-3.5', tcfg.color)} />
                        <span className={cn('text-xs font-semibold', tcfg.color)}>{tcfg.label}</span>
                        <span className={cn('ml-auto text-xs font-bold', tcfg.color)}>{list.length}</span>
                      </div>

                      {/* Lead list */}
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
