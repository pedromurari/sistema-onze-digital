import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Play, Pause, Square, Plus, CheckCircle2, XCircle, SkipForward,
  Clock, Zap, Users, AlertTriangle, MessageSquare, Shield, Trash2,
  ChevronDown, ChevronUp, Activity, RotateCcw,
  Image, Video, Music, Type, Link2, Loader2, FileDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CampanhaStatus  = 'rascunho' | 'ativo' | 'pausado' | 'concluido' | 'erro';
type MessageType     = 'text' | 'image' | 'video' | 'audio';
type LeadsSource     = 'paste' | 'sistema';
type SistemaType     = 'lancamento' | 'npa' | 'aula_secreta';

interface Campanha {
  id: string;
  nome: string;
  descricao?: string;
  template: string;
  message_type: MessageType;
  media_url?: string;
  status: CampanhaStatus;
  leads_total: number;
  leads_sent: number;
  leads_error: number;
  leads_skipped: number;
  delay_min_s: number;
  delay_max_s: number;
  daily_limit: number;
  safe_hour_start: number;
  safe_hour_end: number;
  max_errors_seq: number;
  created_at: string;
}

interface LogEntry {
  id: string;
  phone: string;
  nome: string;
  status: 'enviado' | 'erro' | 'pulado';
  msg: string;
  ts: Date;
}

interface LoadedLead {
  phone: string;
  nome: string;
  variaveis: Record<string, string>;
}

interface CampanhaForm {
  nome: string;
  descricao: string;
  messageType: MessageType;
  mediaUrl: string;
  template: string;
  leadsSource: LeadsSource;
  leadsText: string;
  sistemaType: SistemaType;
  sistemaId: string;
  loadedLeads: LoadedLead[];
  delayMin: number;
  delayMax: number;
  dailyLimit: number;
  safeStart: number;
  safeEnd: number;
  maxErrors: number;
}

interface SistemaItem { id: string; nome: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return d;
  if (d.length === 12 && d.startsWith('55')) return d;
  if (d.length === 11) return '55' + d;
  if (d.length === 10) return '55' + d;
  return null;
}

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function parseLeads(raw: string): LoadedLead[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !l.toLowerCase().startsWith('telefone') && !l.toLowerCase().startsWith('phone'))
    .map(line => {
      const parts = line.split(/[,;\t]/);
      const phone = (parts[0] ?? '').trim();
      const nome  = (parts[1] ?? '').trim();
      const variaveis: Record<string, string> = {};
      for (let i = 2; i < parts.length - 1; i += 2) {
        const key = parts[i]?.trim();
        const val = parts[i + 1]?.trim();
        if (key && val) variaveis[key] = val;
      }
      return { phone, nome, variaveis };
    })
    .filter(l => l.phone.replace(/\D/g, '').length >= 10);
}

/** Converts Google Drive share URLs to direct download links. */
function toDriveDownload(url: string): string {
  const trimmed = url.trim();
  // https://drive.google.com/file/d/FILE_ID/...
  const m1 = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return `https://drive.google.com/uc?export=download&id=${m1[1]}`;
  // https://drive.google.com/open?id=FILE_ID or uc?id=FILE_ID
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return `https://drive.google.com/uc?export=download&id=${m2[1]}`;
  return trimmed;
}

function randomDelay(minS: number, maxS: number): number {
  const base   = minS * 1000 + Math.random() * (maxS - minS) * 1000;
  const jitter = (Math.random() - 0.5) * 800;
  return Math.max(minS * 1000, base + jitter);
}

function pct(sent: number, total: number) {
  return total ? Math.round((sent / total) * 100) : 0;
}

function etaStr(pending: number, speed: number): string {
  if (!speed || !pending) return '—';
  const mins = Math.ceil(pending / speed);
  return mins < 60 ? `~${mins} min` : `~${Math.ceil(mins / 60)}h`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Message type metadata ─────────────────────────────────────────────────────

const MSG_TYPES: Record<MessageType, { label: string; icon: React.ElementType; color: string; hasCaption: boolean }> = {
  text:  { label: 'Texto',  icon: Type,     color: 'text-blue-600',   hasCaption: true },
  image: { label: 'Imagem', icon: Image,    color: 'text-green-600',  hasCaption: true },
  video: { label: 'Vídeo',  icon: Video,    color: 'text-purple-600', hasCaption: true },
  audio: { label: 'Áudio',  icon: Music,    color: 'text-orange-600', hasCaption: false },
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CampanhaStatus, { border: string; bg: string }> = {
  ativo:    { border: 'border-green-300',  bg: 'bg-green-50' },
  pausado:  { border: 'border-yellow-300', bg: 'bg-yellow-50' },
  erro:     { border: 'border-red-300',    bg: 'bg-red-50' },
  concluido:{ border: 'border-blue-300',   bg: 'bg-blue-50' },
  rascunho: { border: 'border-border',     bg: 'bg-card' },
};

function StatusBadge({ status, isRunning }: { status: CampanhaStatus; isRunning: boolean }) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Enviando
      </span>
    );
  }
  const map: Record<CampanhaStatus, { cls: string; label: string }> = {
    ativo:    { cls: 'bg-green-100 text-green-700',    label: 'Ativo' },
    pausado:  { cls: 'bg-yellow-100 text-yellow-700',  label: 'Pausado' },
    erro:     { cls: 'bg-red-100 text-red-700',        label: 'Erro' },
    concluido:{ cls: 'bg-blue-100 text-blue-700',      label: 'Concluído' },
    rascunho: { cls: 'bg-muted text-muted-foreground', label: 'Rascunho' },
  };
  const { cls, label } = map[status];
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

function Stat({ icon, label, value, color = 'text-foreground' }: {
  icon: React.ReactNode; label: string; value: number | string; color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className={color}>{icon}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ── CampanhaCard ──────────────────────────────────────────────────────────────

interface CardProps {
  campanha: Campanha;
  isRunning: boolean;
  logs: LogEntry[];
  showLog: boolean;
  speed: number;
  onToggleLog: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onDelete: () => void;
  onReset: () => void;
}

function CampanhaCard({
  campanha: c, isRunning, logs, showLog, speed,
  onToggleLog, onStart, onPause, onStop, onDelete, onReset,
}: CardProps) {
  const { border, bg } = STATUS_STYLES[c.status];
  const done    = c.leads_sent + c.leads_error + c.leads_skipped;
  const pending = Math.max(0, c.leads_total - done);
  const progress = pct(done, c.leads_total);
  const canStart = !isRunning && (c.status === 'rascunho' || c.status === 'pausado' || c.status === 'ativo' || c.status === 'erro');
  const msgMeta  = MSG_TYPES[c.message_type ?? 'text'];
  const MsgIcon  = msgMeta.icon;

  return (
    <div className={`rounded-xl border-2 ${border} ${bg} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-foreground truncate">{c.nome}</h3>
            <StatusBadge status={c.status} isRunning={isRunning} />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/60 border ${msgMeta.color}`}>
              <MsgIcon className="w-3 h-3" /> {msgMeta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono line-clamp-1">
            {c.message_type !== 'text' && c.media_url
              ? `📎 ${c.media_url.slice(0, 60)}…`
              : c.template.slice(0, 90) + (c.template.length > 90 ? '…' : '')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canStart && (
            <Button size="sm" onClick={onStart} className="gap-1.5 h-8 bg-green-600 hover:bg-green-500 text-white">
              <Play className="w-3.5 h-3.5" />
              {c.status === 'pausado' ? 'Retomar' : 'Iniciar'}
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="outline" onClick={onPause} className="gap-1.5 h-8 border-yellow-300 text-yellow-700 hover:bg-yellow-50">
              <Pause className="w-3.5 h-3.5" /> Pausar
            </Button>
          )}
          {(isRunning || c.status === 'ativo' || c.status === 'pausado') && (
            <Button size="sm" variant="outline" onClick={onStop} className="gap-1.5 h-8 border-red-200 text-red-600 hover:bg-red-50">
              <Square className="w-3.5 h-3.5" /> Stop
            </Button>
          )}
          {c.status === 'concluido' && (
            <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5 h-8 text-muted-foreground">
              <RotateCcw className="w-3.5 h-3.5" /> Reenviar pendentes
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pb-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{done} / {c.leads_total} leads processados</span>
          <span className="font-semibold text-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 px-5 pb-3">
        <Stat icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Enviados"  value={c.leads_sent}     color="text-green-600" />
        <Stat icon={<XCircle      className="w-3.5 h-3.5" />} label="Erros"     value={c.leads_error}    color="text-red-500" />
        <Stat icon={<SkipForward  className="w-3.5 h-3.5" />} label="Pulados"   value={c.leads_skipped}  color="text-muted-foreground" />
        <Stat icon={<Clock        className="w-3.5 h-3.5" />} label="Pendentes" value={pending}           color="text-blue-600" />
        {isRunning && speed > 0 && (
          <>
            <Stat icon={<Zap      className="w-3.5 h-3.5" />} label="msgs/min"  value={speed}            color="text-amber-500" />
            <Stat icon={<Activity className="w-3.5 h-3.5" />} label="ETA"       value={etaStr(pending, speed)} color="text-muted-foreground" />
          </>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          delay {c.delay_min_s}–{c.delay_max_s}s · limite {c.daily_limit}/dia · {c.safe_hour_start}h–{c.safe_hour_end}h
        </div>
      </div>

      {/* Log toggle */}
      {(isRunning || logs.length > 0) && (
        <>
          <button
            onClick={onToggleLog}
            className="flex items-center gap-1.5 w-full px-5 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border/50 transition-colors bg-muted/30"
          >
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showLog ? 'Ocultar log' : 'Ver log ao vivo'}
            {logs.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted">{logs.length}</span>}
          </button>

          {showLog && (
            <div className="border-t border-border/50 bg-zinc-950/[0.03] px-5 py-3 space-y-1.5 max-h-64 overflow-y-auto">
              {logs.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Aguardando envios…</p>}
              {logs.map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-xs font-mono">
                  <span className="text-muted-foreground/60 flex-shrink-0">{formatTime(entry.ts)}</span>
                  {entry.status === 'enviado' && <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />}
                  {entry.status === 'erro'    && <XCircle      className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />}
                  {entry.status === 'pulado'  && <SkipForward  className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <span className="text-foreground">{entry.phone}</span>
                    {entry.nome && <span className="text-muted-foreground"> ({entry.nome})</span>}
                    {entry.status === 'erro'    && <span className="text-red-500 ml-1">— {entry.msg}</span>}
                    {entry.status === 'enviado' && <span className="text-muted-foreground/70 ml-1">{entry.msg.slice(0, 60)}{entry.msg.length > 60 ? '…' : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── NovaCampanhaModal ─────────────────────────────────────────────────────────

const FORM_DEFAULT: CampanhaForm = {
  nome: '', descricao: '',
  messageType: 'text', mediaUrl: '', template: '',
  leadsSource: 'paste', leadsText: '',
  sistemaType: 'lancamento', sistemaId: '', loadedLeads: [],
  delayMin: 8, delayMax: 20, dailyLimit: 150, safeStart: 8, safeEnd: 21, maxErrors: 3,
};

function NovaCampanhaModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (form: CampanhaForm) => Promise<void>;
}) {
  const [form, setForm] = useState<CampanhaForm>(FORM_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [sistemaItems, setSistemaItems] = useState<SistemaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const setF = <K extends keyof CampanhaForm>(k: K) => (v: CampanhaForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Fetch sistema items when type changes
  useEffect(() => {
    if (form.leadsSource !== 'sistema') return;
    setLoadingItems(true);
    setSistemaItems([]);
    setForm(prev => ({ ...prev, sistemaId: '', loadedLeads: [] }));

    const tables: Record<SistemaType, string> = {
      lancamento:   'lancamentos',
      npa:          'npa_eventos',
      aula_secreta: 'aula_secreta_eventos',
    };

    supabase
      .from(tables[form.sistemaType])
      .select('id, nome')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSistemaItems((data ?? []) as SistemaItem[]);
        setLoadingItems(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leadsSource, form.sistemaType]);

  const handleLoadLeads = async () => {
    if (!form.sistemaId) return;
    setLoadingLeads(true);

    const cfg: Record<SistemaType, { table: string; fk: string }> = {
      lancamento:   { table: 'lancamento_leads',    fk: 'lancamento_id' },
      npa:          { table: 'npa_evento_leads',    fk: 'npa_evento_id' },
      aula_secreta: { table: 'aula_secreta_leads',  fk: 'aula_secreta_evento_id' },
    };
    const { table, fk } = cfg[form.sistemaType];

    const PAGE = 1000;
    let all: Array<{ nome: string; whatsapp: string }> = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('nome, whatsapp')
        .eq(fk, form.sistemaId)
        .range(from, from + PAGE - 1);
      if (error || !data?.length) break;
      all = all.concat(data as typeof all);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const leads: LoadedLead[] = all
      .filter(l => l.whatsapp?.replace(/\D/g, '').length >= 10)
      .map(l => ({ phone: l.whatsapp, nome: l.nome ?? '', variaveis: {} }));

    setForm(prev => ({ ...prev, loadedLeads: leads }));
    setLoadingLeads(false);
    toast.success(`${leads.length} leads carregados`);
  };

  const handleConvertDrive = () => {
    const converted = toDriveDownload(form.mediaUrl);
    if (converted !== form.mediaUrl) {
      setForm(prev => ({ ...prev, mediaUrl: converted }));
      toast.success('URL convertida para link de download direto');
    } else {
      toast.info('URL já está no formato correto');
    }
  };

  const leadsCount = form.leadsSource === 'paste'
    ? parseLeads(form.leadsText).length
    : form.loadedLeads.length;

  const needsMedia  = form.messageType !== 'text';
  const hasCaption  = MSG_TYPES[form.messageType].hasCaption;
  const captionLabel = form.messageType === 'text' ? 'Template da mensagem' : 'Legenda (opcional)';

  const handleSubmit = async () => {
    if (!form.nome.trim())       { toast.error('Nome da campanha é obrigatório'); return; }
    if (needsMedia && !form.mediaUrl.trim()) { toast.error('URL da mídia é obrigatória'); return; }
    if (form.messageType === 'text' && !form.template.trim()) { toast.error('Template da mensagem é obrigatório'); return; }
    if (!leadsCount)             { toast.error('Nenhum lead válido'); return; }
    setSaving(true);
    try { await onCreate(form); } finally { setSaving(false); }
  };

  const SISTEMA_LABELS: Record<SistemaType, string> = {
    lancamento: 'Lançamentos', npa: 'NPA', aula_secreta: 'Aula Secreta',
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-600" />
            Nova Campanha de Disparo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Nome + Descrição ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input placeholder="Ex: Oferta especial maio" value={form.nome} onChange={e => setF('nome')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Observações internas" value={form.descricao} onChange={e => setF('descricao')(e.target.value)} />
            </div>
          </div>

          {/* ── Tipo de mensagem ── */}
          <div className="space-y-2">
            <Label>Tipo de mensagem *</Label>
            <div className="flex gap-2">
              {(Object.entries(MSG_TYPES) as [MessageType, typeof MSG_TYPES[MessageType]][]).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setF('messageType')(key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.messageType === key
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── URL da mídia (image/video/audio) ── */}
          {needsMedia && (
            <div className="space-y-1.5">
              <Label>URL da mídia (Google Drive) *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://drive.google.com/file/d/FILE_ID/view"
                  value={form.mediaUrl}
                  onChange={e => setF('mediaUrl')(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleConvertDrive} className="shrink-0 gap-1.5 h-9">
                  <Link2 className="w-3.5 h-3.5" /> Converter
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                No Drive, clique em <strong>Compartilhar → Qualquer pessoa com o link</strong>. Cole o link e clique em{' '}
                <strong>Converter</strong> para gerar a URL de download direto.
              </p>
            </div>
          )}

          {/* ── Template / Legenda ── */}
          {hasCaption && (
            <div className="space-y-1.5">
              <Label>{captionLabel}{form.messageType === 'text' ? ' *' : ''}</Label>
              <Textarea
                rows={4}
                placeholder={
                  form.messageType === 'text'
                    ? 'Olá {{nome}}, temos uma novidade incrível para você! 🎉'
                    : 'Legenda que acompanha a mídia (opcional)…'
                }
                value={form.template}
                onChange={e => setF('template')(e.target.value)}
                className="font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> para o nome e{' '}
                <code className="bg-muted px-1 rounded">{'{{phone}}'}</code> para o número.
              </p>
            </div>
          )}

          <hr className="border-border" />

          {/* ── Fonte de leads ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Lista de leads *</Label>
              {leadsCount > 0 && (
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                  ✓ {leadsCount} leads
                </span>
              )}
            </div>

            {/* Source toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['sistema', 'paste'] as LeadsSource[]).map(src => (
                <button
                  key={src}
                  onClick={() => setF('leadsSource')(src)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    form.leadsSource === src
                      ? 'bg-foreground text-background'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {src === 'sistema' ? '📊 Base do Sistema' : '📋 Colar / CSV'}
                </button>
              ))}
            </div>

            {/* ── Sistema ── */}
            {form.leadsSource === 'sistema' && (
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                {/* Type selector */}
                <div className="flex gap-2">
                  {(Object.keys(SISTEMA_LABELS) as SistemaType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setF('sistemaType')(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        form.sistemaType === t
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {SISTEMA_LABELS[t]}
                    </button>
                  ))}
                </div>

                {/* Item selector */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    {loadingItems ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                      </div>
                    ) : (
                      <Select value={form.sistemaId} onValueChange={v => { setF('sistemaId')(v); setForm(p => ({ ...p, loadedLeads: [] })); }}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder={`Selecione o ${SISTEMA_LABELS[form.sistemaType].slice(0, -1)}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {sistemaItems.map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLoadLeads}
                    disabled={!form.sistemaId || loadingLeads}
                    className="gap-1.5 shrink-0"
                  >
                    {loadingLeads
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileDown className="w-3.5 h-3.5" />}
                    Carregar leads
                  </Button>
                </div>

                {/* Preview table */}
                {form.loadedLeads.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-2 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      <span>Nome</span><span>Telefone</span>
                    </div>
                    <div className="divide-y divide-border max-h-40 overflow-y-auto">
                      {form.loadedLeads.slice(0, 5).map((l, i) => (
                        <div key={i} className="grid grid-cols-2 px-3 py-1.5 text-xs">
                          <span className="truncate text-foreground">{l.nome || '—'}</span>
                          <span className="font-mono text-muted-foreground">{l.phone}</span>
                        </div>
                      ))}
                      {form.loadedLeads.length > 5 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
                          + {form.loadedLeads.length - 5} leads…
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Paste / CSV ── */}
            {form.leadsSource === 'paste' && (
              <div className="space-y-1.5">
                <Textarea
                  rows={5}
                  placeholder={`Cole aqui os leads (um por linha):\n5511999999999,João Silva\n5511888888888,Maria Costa\n5511777777777`}
                  value={form.leadsText}
                  onChange={e => setF('leadsText')(e.target.value)}
                  className="font-mono text-xs resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Formato: <code className="bg-muted px-1 rounded">telefone,nome</code> · Aceita vírgula, ponto-e-vírgula ou tab.
                </p>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* ── Anti-ban ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-600" /> Configurações anti-ban
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Delay mínimo (seg)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={3} max={60} value={form.delayMin}
                    onChange={e => setF('delayMin')(Math.max(3, +e.target.value))} className="w-24" />
                  <span className="text-xs text-muted-foreground">s (mín. 3s)</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Delay máximo (seg)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={form.delayMin} max={300} value={form.delayMax}
                    onChange={e => setF('delayMax')(Math.max(form.delayMin, +e.target.value))} className="w-24" />
                  <span className="text-xs text-muted-foreground">s</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Limite diário</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={10} max={500} value={form.dailyLimit}
                    onChange={e => setF('dailyLimit')(Math.max(10, +e.target.value))} className="w-24" />
                  <span className="text-xs text-muted-foreground">msgs</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Hora início</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={23} value={form.safeStart}
                    onChange={e => setF('safeStart')(+e.target.value)} className="w-20" />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Hora fim</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={23} value={form.safeEnd}
                    onChange={e => setF('safeEnd')(+e.target.value)} className="w-20" />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pausar após N erros consecutivos</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={20} value={form.maxErrors}
                  onChange={e => setF('maxErrors')(Math.max(1, +e.target.value))} className="w-20" />
                <span className="text-xs text-muted-foreground">erros</span>
              </div>
            </div>

            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Anti-ban:</strong> Use delays maiores (15–40s) para números novos. Limite diário abaixo de 200.
                Envie apenas em horário comercial. Personalize com <code>{'{{nome}}'}</code>.
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-500 text-white">
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Plus className="w-4 h-4" /> Criar campanha ({leadsCount} leads)</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DisparoPlanilha() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [activeCampaignIds, setActiveCampaignIds] = useState<Set<string>>(new Set());

  const runningRef = useRef<Map<string, boolean>>(new Map());
  const speedRef   = useRef<Map<string, number[]>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!activeCampaignIds.size) return;
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, [activeCampaignIds.size]);

  const fetchCampanhas = useCallback(async () => {
    const { data } = await supabase
      .from('disparo_campanhas')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCampanhas(data as Campanha[]);
  }, []);

  useEffect(() => {
    fetchCampanhas();
    return () => { runningRef.current.forEach((_, id) => runningRef.current.set(id, false)); };
  }, [fetchCampanhas]);

  const addLog = useCallback((campanhaId: string, entry: LogEntry) => {
    setLogs(prev => ({
      ...prev,
      [campanhaId]: [entry, ...(prev[campanhaId] ?? [])].slice(0, 100),
    }));
  }, []);

  function getSpeed(campanhaId: string): number {
    void tick;
    const ts = speedRef.current.get(campanhaId) ?? [];
    return ts.filter(t => Date.now() - t < 60_000).length;
  }

  // ── Sending loop ──────────────────────────────────────────────────────────────

  const runCampanha = useCallback(async (campanhaId: string) => {
    if (runningRef.current.get(campanhaId)) return;
    runningRef.current.set(campanhaId, true);
    setActiveCampaignIds(prev => new Set(prev).add(campanhaId));
    speedRef.current.set(campanhaId, []);

    await supabase.from('disparo_campanhas').update({ status: 'ativo' }).eq('id', campanhaId);
    await fetchCampanhas();

    let consecutiveErrors = 0;

    while (runningRef.current.get(campanhaId)) {
      const { data: camp } = await supabase
        .from('disparo_campanhas').select('*').eq('id', campanhaId).maybeSingle();
      if (!camp) break;

      const hour = new Date().getHours();
      if (hour < camp.safe_hour_start || hour >= camp.safe_hour_end) {
        toast.warning(`"${camp.nome}" pausada: fora do horário seguro (${camp.safe_hour_start}h–${camp.safe_hour_end}h)`);
        await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', campanhaId);
        break;
      }

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from('disparo_leads').select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanhaId).eq('status', 'enviado').gte('sent_at', todayStart.toISOString());

      if ((sentToday ?? 0) >= camp.daily_limit) {
        toast.warning(`"${camp.nome}" pausada: limite diário de ${camp.daily_limit} atingido`);
        await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', campanhaId);
        break;
      }

      const { data: lead } = await supabase
        .from('disparo_leads').select('*')
        .eq('campanha_id', campanhaId).eq('status', 'pendente')
        .order('ordem', { ascending: true }).limit(1).maybeSingle();

      if (!lead) {
        toast.success(`Campanha "${camp.nome}" concluída!`);
        await supabase.from('disparo_campanhas').update({ status: 'concluido' }).eq('id', campanhaId);
        break;
      }

      const phone = formatPhone(lead.phone);
      if (!phone) {
        await supabase.from('disparo_leads').update({ status: 'pulado', error_msg: 'Telefone inválido' }).eq('id', lead.id);
        await supabase.from('disparo_campanhas').update({ leads_skipped: camp.leads_skipped + 1 }).eq('id', campanhaId);
        addLog(campanhaId, { id: lead.id, phone: lead.phone, nome: lead.nome ?? '', status: 'pulado', msg: 'Telefone inválido', ts: new Date() });
        continue;
      }

      const vars: Record<string, string> = { nome: lead.nome ?? '', phone, ...(lead.variaveis as Record<string, string> ?? {}) };
      const text    = applyVars(camp.template ?? '', vars);
      const msgType = camp.message_type ?? 'text';
      const mediaUrl = camp.media_url ?? '';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;

        const payload: Record<string, unknown> = {
          quick_send: true,
          recipient_id: phone,
          message_type: msgType,
          message_text: text,
          link_preview: false,
          mention_everyone: false,
          send_header_image: false,
        };
        if (msgType !== 'text') payload.media_url = mediaUrl;

        const resp = await fetch(`${supabaseUrl}/functions/v1/funil-processar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(await resp.text());

        await supabase.from('disparo_leads')
          .update({ status: 'enviado', sent_at: new Date().toISOString(), error_msg: null }).eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_sent: camp.leads_sent + 1 }).eq('id', campanhaId);

        addLog(campanhaId, { id: lead.id, phone, nome: lead.nome ?? '', status: 'enviado', msg: text || mediaUrl, ts: new Date() });
        const ts = speedRef.current.get(campanhaId) ?? [];
        speedRef.current.set(campanhaId, [...ts, Date.now()].slice(-120));
        consecutiveErrors = 0;

      } catch (err) {
        consecutiveErrors++;
        const errMsg = (err as Error).message;
        await supabase.from('disparo_leads').update({ status: 'erro', error_msg: errMsg }).eq('id', lead.id);
        await supabase.from('disparo_campanhas').update({ leads_error: camp.leads_error + 1 }).eq('id', campanhaId);
        addLog(campanhaId, { id: lead.id, phone, nome: lead.nome ?? '', status: 'erro', msg: errMsg, ts: new Date() });

        if (consecutiveErrors >= camp.max_errors_seq) {
          toast.error(`"${camp.nome}" parada: ${camp.max_errors_seq} erros consecutivos`);
          await supabase.from('disparo_campanhas').update({ status: 'erro' }).eq('id', campanhaId);
          break;
        }
      }

      await fetchCampanhas();
      await new Promise<void>(r => setTimeout(r, randomDelay(camp.delay_min_s, camp.delay_max_s)));
    }

    runningRef.current.delete(campanhaId);
    setActiveCampaignIds(prev => { const s = new Set(prev); s.delete(campanhaId); return s; });
    await fetchCampanhas();
  }, [addLog, fetchCampanhas]);

  // ── Controls ──────────────────────────────────────────────────────────────────

  const pauseCampanha = useCallback(async (id: string) => {
    runningRef.current.set(id, false);
    await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', id);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  const stopCampanha = useCallback(async (id: string, nome: string) => {
    if (!confirm(`Parar "${nome}"? Os leads pendentes ficam como "pendente" para reenviar depois.`)) return;
    runningRef.current.set(id, false);
    await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', id);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  const resetCampanha = useCallback(async (id: string) => {
    if (!confirm('Remarcar todos os leads "erro" e "pulado" como pendentes para reenvio?')) return;
    runningRef.current.set(id, false);
    const { data: leads } = await supabase
      .from('disparo_leads').select('id').eq('campanha_id', id).in('status', ['erro', 'pulado']);
    if (leads?.length) {
      await supabase.from('disparo_leads')
        .update({ status: 'pendente', error_msg: null, sent_at: null })
        .in('id', leads.map((l: { id: string }) => l.id));
    }
    const { count: total } = await supabase.from('disparo_leads').select('*', { count: 'exact', head: true }).eq('campanha_id', id);
    const { count: sent }  = await supabase.from('disparo_leads').select('*', { count: 'exact', head: true }).eq('campanha_id', id).eq('status', 'enviado');
    await supabase.from('disparo_campanhas').update({ status: 'pausado', leads_total: total ?? 0, leads_sent: sent ?? 0, leads_error: 0, leads_skipped: 0 }).eq('id', id);
    await fetchCampanhas();
    toast.success('Leads remarcados como pendentes');
  }, [fetchCampanhas]);

  const deleteCampanha = useCallback(async (id: string, nome: string) => {
    if (!confirm(`Excluir campanha "${nome}" e todos os seus leads? Irreversível.`)) return;
    runningRef.current.set(id, false);
    await supabase.from('disparo_campanhas').delete().eq('id', id);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  // ── Create ────────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async (form: CampanhaForm) => {
    const leads = form.leadsSource === 'sistema'
      ? form.loadedLeads
      : parseLeads(form.leadsText);

    if (!leads.length) { toast.error('Nenhum lead válido'); return; }

    const { data: camp, error } = await supabase
      .from('disparo_campanhas')
      .insert({
        nome:            form.nome.trim(),
        descricao:       form.descricao.trim() || null,
        template:        form.template.trim(),
        message_type:    form.messageType,
        media_url:       form.mediaUrl.trim() || null,
        status:          'rascunho',
        leads_total:     leads.length,
        delay_min_s:     form.delayMin,
        delay_max_s:     form.delayMax,
        daily_limit:     form.dailyLimit,
        safe_hour_start: form.safeStart,
        safe_hour_end:   form.safeEnd,
        max_errors_seq:  form.maxErrors,
      })
      .select().single();

    if (error || !camp) { toast.error('Erro ao criar campanha: ' + error?.message); return; }

    const { error: leadsErr } = await supabase.from('disparo_leads').insert(
      leads.map((l, i) => ({
        campanha_id: camp.id,
        phone:       l.phone,
        nome:        l.nome || null,
        variaveis:   Object.keys(l.variaveis).length ? l.variaveis : {},
        status:      'pendente',
        ordem:       i,
      }))
    );

    if (leadsErr) toast.error('Campanha criada, mas erro ao inserir leads: ' + leadsErr.message);
    else toast.success(`Campanha "${form.nome}" criada com ${leads.length} leads`);

    await fetchCampanhas();
    setShowModal(false);
  }, [fetchCampanhas]);

  // ── Partition ─────────────────────────────────────────────────────────────────

  const activeAndPaused = campanhas.filter(c => activeCampaignIds.has(c.id) || c.status === 'ativo' || c.status === 'pausado' || c.status === 'erro');
  const drafts = campanhas.filter(c => c.status === 'rascunho' && !activeCampaignIds.has(c.id));
  const done   = campanhas.filter(c => c.status === 'concluido' && !activeCampaignIds.has(c.id));

  function toggleLog(id: string) {
    setExpandedLogs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function cardProps(c: Campanha): Omit<CardProps, 'campanha'> {
    return {
      isRunning:   activeCampaignIds.has(c.id),
      logs:        logs[c.id] ?? [],
      showLog:     expandedLogs.has(c.id),
      speed:       getSpeed(c.id),
      onToggleLog: () => toggleLog(c.id),
      onStart:     () => runCampanha(c.id),
      onPause:     () => pauseCampanha(c.id),
      onStop:      () => stopCampanha(c.id, c.nome),
      onDelete:    () => deleteCampanha(c.id, c.nome),
      onReset:     () => resetCampanha(c.id),
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-green-600" /> Disparo de Planilha
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Disparos WhatsApp sequenciais com proteção anti-ban integrada
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2 bg-green-600 hover:bg-green-500 text-white shrink-0">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800">
        <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span>
          <strong>Anti-ban ativo:</strong> delays aleatórios · limite diário · horário seguro · pausa em erros consecutivos · validação de número
        </span>
      </div>

      {activeAndPaused.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Em andamento
          </h2>
          {activeAndPaused.map(c => <CampanhaCard key={c.id} campanha={c} {...cardProps(c)} />)}
        </section>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Rascunhos
          </h2>
          {drafts.map(c => <CampanhaCard key={c.id} campanha={c} {...cardProps(c)} />)}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Concluídas
          </h2>
          {done.map(c => <CampanhaCard key={c.id} campanha={c} {...cardProps(c)} />)}
        </section>
      )}

      {campanhas.length === 0 && (
        <div className="text-center py-24 space-y-3">
          <MessageSquare className="w-14 h-14 mx-auto text-muted-foreground/30" />
          <p className="text-lg font-semibold text-foreground">Nenhuma campanha</p>
          <p className="text-sm text-muted-foreground">Crie sua primeira campanha de disparo</p>
          <Button onClick={() => setShowModal(true)} className="gap-2 mt-2 bg-green-600 hover:bg-green-500 text-white">
            <Plus className="w-4 h-4" /> Nova Campanha
          </Button>
        </div>
      )}

      {showModal && <NovaCampanhaModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
    </div>
  );
}
