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
  Image, Video, Music, Type, Link2, Loader2, FileDown, Pencil, Settings,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

// ── Types ─────────────────────────────────────────────────────────────────────

type CampanhaStatus = 'rascunho' | 'ativo' | 'pausado' | 'concluido' | 'erro';
type MessageType    = 'text' | 'image' | 'video' | 'audio';
type LeadsSource    = 'paste' | 'sistema';
type SistemaType    = 'lancamento' | 'npa' | 'aula_secreta';
type CardTab        = 'log' | 'leads';

interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  ativo: boolean;
}

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
  evolution_config_id: string;
  created_at: string;
}

interface LogEntry {
  id: string; phone: string; nome: string;
  status: 'enviado' | 'erro' | 'pulado'; msg: string; ts: Date;
}

interface LeadRow {
  id: string; phone: string; nome?: string;
  status: 'pendente' | 'enviado' | 'erro' | 'pulado';
  error_msg?: string; sent_at?: string; ordem: number;
}

interface LoadedLead { phone: string; nome: string; variaveis: Record<string, string>; }

interface CampanhaForm {
  nome: string; descricao: string; messageType: MessageType;
  mediaUrl: string; template: string; leadsSource: LeadsSource;
  leadsText: string; sistemaType: SistemaType; sistemaId: string;
  loadedLeads: LoadedLead[]; delayMin: number; delayMax: number;
  dailyLimit: number; safeStart: number; safeEnd: number;
  maxErrors: number; evolutionConfigId: string;
}

interface SistemaItem { id: string; nome: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const LEADS_PER_PAGE = 50;

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
  return raw.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !l.toLowerCase().startsWith('telefone') && !l.toLowerCase().startsWith('phone'))
    .map(line => {
      const parts = line.split(/[,;\t]/);
      const phone = (parts[0] ?? '').trim();
      const nome  = (parts[1] ?? '').trim();
      const variaveis: Record<string, string> = {};
      for (let i = 2; i < parts.length - 1; i += 2) {
        const key = parts[i]?.trim(), val = parts[i + 1]?.trim();
        if (key && val) variaveis[key] = val;
      }
      return { phone, nome, variaveis };
    })
    .filter(l => l.phone.replace(/\D/g, '').length >= 10);
}

function toDriveDownload(url: string): string {
  const trimmed = url.trim();
  const m1 = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return `https://drive.google.com/uc?export=download&id=${m1[1]}`;
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return `https://drive.google.com/uc?export=download&id=${m2[1]}`;
  return trimmed;
}

function randomDelay(minS: number, maxS: number): number {
  const base   = minS * 1000 + Math.random() * (maxS - minS) * 1000;
  const jitter = (Math.random() - 0.5) * 800;
  return Math.max(minS * 1000, base + jitter);
}

function pct(sent: number, total: number) { return total ? Math.round((sent / total) * 100) : 0; }

function etaStr(pending: number, speed: number): string {
  if (!speed || !pending) return '—';
  const mins = Math.ceil(pending / speed);
  return mins < 60 ? `~${mins} min` : `~${Math.ceil(mins / 60)}h`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const MSG_TYPES: Record<MessageType, { label: string; icon: React.ElementType; color: string; hasCaption: boolean }> = {
  text:  { label: 'Texto',  icon: Type,  color: 'text-blue-600',   hasCaption: true },
  image: { label: 'Imagem', icon: Image, color: 'text-green-600',  hasCaption: true },
  video: { label: 'Vídeo',  icon: Video, color: 'text-purple-600', hasCaption: true },
  audio: { label: 'Áudio',  icon: Music, color: 'text-orange-600', hasCaption: false },
};

const STATUS_STYLES: Record<CampanhaStatus, { border: string; bg: string }> = {
  ativo:     { border: 'border-green-300',  bg: 'bg-green-50' },
  pausado:   { border: 'border-yellow-300', bg: 'bg-yellow-50' },
  erro:      { border: 'border-red-300',    bg: 'bg-red-50' },
  concluido: { border: 'border-blue-300',   bg: 'bg-blue-50' },
  rascunho:  { border: 'border-border',     bg: 'bg-card' },
};

// ── Small shared components ───────────────────────────────────────────────────

function StatusBadge({ status, isRunning }: { status: CampanhaStatus; isRunning: boolean }) {
  if (isRunning) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Enviando
    </span>
  );
  const map: Record<CampanhaStatus, { cls: string; label: string }> = {
    ativo:     { cls: 'bg-green-100 text-green-700',    label: 'Ativo' },
    pausado:   { cls: 'bg-yellow-100 text-yellow-700',  label: 'Pausado' },
    erro:      { cls: 'bg-red-100 text-red-700',        label: 'Erro' },
    concluido: { cls: 'bg-blue-100 text-blue-700',      label: 'Concluído' },
    rascunho:  { cls: 'bg-muted text-muted-foreground', label: 'Rascunho' },
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

function LeadStatusBadge({ status }: { status: LeadRow['status'] }) {
  const styles = {
    pendente: 'bg-gray-100 text-gray-600',
    enviado:  'bg-green-100 text-green-700',
    erro:     'bg-red-100 text-red-700',
    pulado:   'bg-zinc-100 text-zinc-500',
  };
  const labels = { pendente: 'Pendente', enviado: 'Enviado', erro: 'Erro', pulado: 'Pulado' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

// ── AntiBanFields (shared between Create and Edit modals) ─────────────────────

function AntiBanFields({ delayMin, setDelayMin, delayMax, setDelayMax, dailyLimit, setDailyLimit,
  safeStart, setSafeStart, safeEnd, setSafeEnd, maxErrors, setMaxErrors }: {
  delayMin: number; setDelayMin: (v: number) => void;
  delayMax: number; setDelayMax: (v: number) => void;
  dailyLimit: number; setDailyLimit: (v: number) => void;
  safeStart: number; setSafeStart: (v: number) => void;
  safeEnd: number; setSafeEnd: (v: number) => void;
  maxErrors: number; setMaxErrors: (v: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-green-600" /> Anti-ban
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Delay mínimo (min)</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={60} value={delayMin}
              onChange={e => setDelayMin(Math.max(1, +e.target.value))} className="w-24" />
            <span className="text-xs text-muted-foreground">min (mín. 1)</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Delay máximo (min)</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={delayMin} max={120} value={delayMax}
              onChange={e => setDelayMax(Math.max(delayMin, +e.target.value))} className="w-24" />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Limite diário</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={10} max={500} value={dailyLimit}
              onChange={e => setDailyLimit(Math.max(10, +e.target.value))} className="w-24" />
            <span className="text-xs text-muted-foreground">msgs</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Hora início</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={23} value={safeStart}
              onChange={e => setSafeStart(+e.target.value)} className="w-20" />
            <span className="text-xs text-muted-foreground">h</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Hora fim</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={23} value={safeEnd}
              onChange={e => setSafeEnd(+e.target.value)} className="w-20" />
            <span className="text-xs text-muted-foreground">h</span>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Pausar após N erros consecutivos</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={20} value={maxErrors}
            onChange={e => setMaxErrors(Math.max(1, +e.target.value))} className="w-20" />
          <span className="text-xs text-muted-foreground">erros</span>
        </div>
      </div>
    </div>
  );
}

// ── EvolutionInstancesModal ───────────────────────────────────────────────────

interface InstForm extends EvolutionInstance { isNew: boolean; }

function EvolutionInstancesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [instances,    setInstances]   = useState<EvolutionInstance[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [editingInst,  setEditingInst] = useState<InstForm | null>(null);
  const [saving,       setSaving]      = useState(false);
  const [deleting,     setDeleting]    = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('evolution_config')
      .select('id, instance_name, api_url, api_key, ativo')
      .order('created_at', { ascending: true });
    if (data) setInstances(data as EvolutionInstance[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleNew = () => setEditingInst({
    id: crypto.randomUUID(), instance_name: '', api_url: '', api_key: '', ativo: true, isNew: true,
  });

  const handleSave = async () => {
    if (!editingInst) return;
    setSaving(true);
    const { error } = await (supabase as any).from('evolution_config').upsert({
      id:            editingInst.id,
      instance_name: editingInst.instance_name.trim(),
      api_url:       editingInst.api_url.trim().replace(/\/$/, ''),
      api_key:       editingInst.api_key.trim(),
      ativo:         editingInst.ativo,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'id' });
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(editingInst.isNew ? 'Instância criada!' : 'Instância salva!');
    setEditingInst(null);
    await load();
    onSaved();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir instância "${name || id}"?`)) return;
    setDeleting(id);
    await (supabase as any).from('evolution_config').delete().eq('id', id);
    setDeleting(null);
    await load();
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>📡</span> Instâncias Evolution API
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : editingInst ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome da instância *</Label>
                <Input
                  placeholder="ex: 11ds-principal"
                  value={editingInst.instance_name}
                  onChange={e => setEditingInst(p => p ? { ...p, instance_name: e.target.value } : p)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>URL do servidor *</Label>
                <Input
                  placeholder="https://evolution.seudominio.com"
                  value={editingInst.api_url}
                  onChange={e => setEditingInst(p => p ? { ...p, api_url: e.target.value } : p)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>API Key *</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={editingInst.api_key}
                onChange={e => setEditingInst(p => p ? { ...p, api_key: e.target.value } : p)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={editingInst.ativo}
                onCheckedChange={v => setEditingInst(p => p ? { ...p, ativo: v } : p)}
              />
              <Label>Instância ativa</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingInst(null)}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !editingInst.instance_name || !editingInst.api_url || !editingInst.api_key}
                className="gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {instances.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma instância cadastrada</p>
            ) : instances.map(inst => (
              <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{inst.instance_name || '(sem nome)'}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${inst.ativo ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                      {inst.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{inst.api_url || '—'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(inst)} className="gap-1 h-8 px-2.5">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(inst.id, inst.instance_name)}
                    disabled={deleting === inst.id} className="text-destructive hover:text-destructive h-8 w-8 p-0">
                    {deleting === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
            <Button onClick={handleNew} variant="outline" className="w-full gap-2 border-dashed mt-1">
              <Plus className="w-4 h-4" /> Nova instância
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  function handleEdit(inst: EvolutionInstance) { setEditingInst({ ...inst, isNew: false }); }
}

// ── EvolutionSelector (shared) ────────────────────────────────────────────────

function EvolutionSelector({ instances, value, onChange, onManage }: {
  instances: EvolutionInstance[]; value: string; onChange: (v: string) => void; onManage?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Instância Evolution API *</Label>
        {onManage && (
          <button type="button" onClick={onManage}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Settings className="w-3 h-3" /> Gerenciar instâncias
          </button>
        )}
      </div>
      {instances.length === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          Nenhuma instância configurada.
          {onManage && (
            <button type="button" onClick={onManage} className="font-semibold underline ml-1">
              Cadastrar agora
            </button>
          )}
        </div>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a instância" />
          </SelectTrigger>
          <SelectContent>
            {instances.map(inst => (
              <SelectItem key={inst.id} value={inst.id}>
                📡 {inst.instance_name || inst.id}{!inst.ativo ? ' (inativa)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── CampanhaCard ──────────────────────────────────────────────────────────────

interface CardProps {
  campanha: Campanha;
  isRunning: boolean;
  logs: LogEntry[];
  activeTab: CardTab;
  leads: LeadRow[];
  leadsTotal: number;
  leadsPage: number;
  loadingLeads: boolean;
  showExpanded: boolean;
  speed: number;
  evolutionInstanceName?: string;
  onToggleExpand: () => void;
  onTabChange: (tab: CardTab) => void;
  onLoadLeads: (page: number) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onDelete: () => void;
  onReset: () => void;
  onEdit: () => void;
}

function CampanhaCard({
  campanha: c, isRunning, logs, activeTab, leads, leadsTotal, leadsPage, loadingLeads,
  showExpanded, speed, evolutionInstanceName,
  onToggleExpand, onTabChange, onLoadLeads, onStart, onPause, onStop, onDelete, onReset, onEdit,
}: CardProps) {
  const { border, bg } = STATUS_STYLES[c.status];
  const done      = c.leads_sent + c.leads_error + c.leads_skipped;
  const pending   = Math.max(0, c.leads_total - done);
  const progress  = pct(done, c.leads_total);
  const canStart  = !isRunning && (c.status === 'rascunho' || c.status === 'pausado' || c.status === 'ativo' || c.status === 'erro');
  const msgMeta   = MSG_TYPES[c.message_type ?? 'text'];
  const MsgIcon   = msgMeta.icon;
  const totalPages = Math.max(1, Math.ceil((leadsTotal || c.leads_total) / LEADS_PER_PAGE));

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
            {evolutionInstanceName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700">
                📡 {evolutionInstanceName}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono line-clamp-1">
            {c.message_type !== 'text' && c.media_url
              ? `📎 ${c.media_url.slice(0, 60)}…`
              : (c.template || '').slice(0, 90) + ((c.template || '').length > 90 ? '…' : '')}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canStart && (
            <Button size="sm" onClick={onStart} className="gap-1.5 h-8 bg-green-600 hover:bg-green-500 text-white">
              <Play className="w-3.5 h-3.5" /> {c.status === 'pausado' ? 'Retomar' : 'Iniciar'}
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
              <RotateCcw className="w-3.5 h-3.5" /> Reenviar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} title="Editar campanha"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600">
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
        <Stat icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Enviados"  value={c.leads_sent}    color="text-green-600" />
        <Stat icon={<XCircle      className="w-3.5 h-3.5" />} label="Erros"     value={c.leads_error}   color="text-red-500" />
        <Stat icon={<SkipForward  className="w-3.5 h-3.5" />} label="Pulados"   value={c.leads_skipped} color="text-muted-foreground" />
        <Stat icon={<Clock        className="w-3.5 h-3.5" />} label="Pendentes" value={pending}          color="text-blue-600" />
        {isRunning && speed > 0 && (
          <>
            <Stat icon={<Zap      className="w-3.5 h-3.5" />} label="msgs/min" value={speed}                  color="text-amber-500" />
            <Stat icon={<Activity className="w-3.5 h-3.5" />} label="ETA"      value={etaStr(pending, speed)} color="text-muted-foreground" />
          </>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          delay {Math.round(c.delay_min_s/60)}–{Math.round(c.delay_max_s/60)}min · {c.daily_limit}/dia · {c.safe_hour_start}h–{c.safe_hour_end}h
        </div>
      </div>

      {/* Expand toggle */}
      <button onClick={onToggleExpand}
        className="flex items-center gap-1.5 w-full px-5 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border/50 transition-colors bg-muted/30">
        {showExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showExpanded ? 'Recolher' : 'Expandir'}
        <span className="ml-auto text-muted-foreground/60">{c.leads_total} leads</span>
      </button>

      {/* Expanded panel */}
      {showExpanded && (
        <div className="border-t border-border/50">
          {/* Tab bar */}
          <div className="flex border-b border-border/50 bg-muted/20">
            <button onClick={() => onTabChange('log')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${activeTab === 'log' ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              📋 Log ao vivo {logs.length > 0 && <span className="ml-1 opacity-60">({logs.length})</span>}
            </button>
            <button onClick={() => { onTabChange('leads'); if (leads.length === 0) onLoadLeads(0); }}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${activeTab === 'leads' ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              👥 Leads ({leadsTotal > 0 ? leadsTotal : c.leads_total})
            </button>
          </div>

          {/* Log tab */}
          {activeTab === 'log' && (
            <div className="bg-zinc-950/[0.03] px-5 py-3 space-y-1.5 max-h-64 overflow-y-auto">
              {logs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aguardando envios…</p>}
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

          {/* Leads tab */}
          {activeTab === 'leads' && (
            <div>
              {loadingLeads ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Nome</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Telefone</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Enviado em</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Erro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {leads.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum lead carregado</td>
                          </tr>
                        )}
                        {leads.map((l, i) => (
                          <tr key={l.id} className="hover:bg-muted/20">
                            <td className="px-3 py-1.5 text-muted-foreground">{leadsPage * LEADS_PER_PAGE + i + 1}</td>
                            <td className="px-3 py-1.5 text-foreground max-w-[120px] truncate">{l.nome || '—'}</td>
                            <td className="px-3 py-1.5 font-mono">{l.phone}</td>
                            <td className="px-3 py-1.5"><LeadStatusBadge status={l.status} /></td>
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                              {l.sent_at
                                ? new Date(l.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-red-500 max-w-[200px] truncate" title={l.error_msg ?? undefined}>
                              {l.error_msg || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-muted/10">
                    <span className="text-xs text-muted-foreground">
                      Pág. {leadsPage + 1} de {totalPages} · {leadsTotal || c.leads_total} leads
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground"
                        onClick={() => onLoadLeads(leadsPage)}>
                        <RotateCcw className="w-3 h-3" /> Atualizar
                      </Button>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-xs"
                          disabled={leadsPage === 0} onClick={() => onLoadLeads(leadsPage - 1)}>‹</Button>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-xs"
                          disabled={leadsPage >= totalPages - 1} onClick={() => onLoadLeads(leadsPage + 1)}>›</Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── EditCampanhaModal ─────────────────────────────────────────────────────────

function EditCampanhaModal({ campanha, evolutionInstances, onClose, onSave, onManageEvo }: {
  campanha: Campanha;
  evolutionInstances: EvolutionInstance[];
  onClose: () => void;
  onSave: (id: string, data: Partial<Campanha>) => Promise<void>;
  onManageEvo?: () => void;
}) {
  const [nome,        setNome]        = useState(campanha.nome);
  const [descricao,   setDescricao]   = useState(campanha.descricao ?? '');
  const [messageType, setMessageType] = useState<MessageType>(campanha.message_type ?? 'text');
  const [mediaUrl,    setMediaUrl]    = useState(campanha.media_url ?? '');
  const [template,    setTemplate]    = useState(campanha.template ?? '');
  const [delayMin,    setDelayMin]    = useState(Math.round(campanha.delay_min_s / 60) || 1);
  const [delayMax,    setDelayMax]    = useState(Math.round(campanha.delay_max_s / 60) || 3);
  const [dailyLimit,  setDailyLimit]  = useState(campanha.daily_limit);
  const [safeStart,   setSafeStart]   = useState(campanha.safe_hour_start);
  const [safeEnd,     setSafeEnd]     = useState(campanha.safe_hour_end);
  const [maxErrors,   setMaxErrors]   = useState(campanha.max_errors_seq);
  const [evoId,       setEvoId]       = useState(campanha.evolution_config_id ?? 'default');
  const [saving,      setSaving]      = useState(false);

  const needsMedia  = messageType !== 'text';
  const hasCaption  = MSG_TYPES[messageType].hasCaption;

  const handleConvertDrive = () => {
    const converted = toDriveDownload(mediaUrl);
    if (converted !== mediaUrl) { setMediaUrl(converted); toast.success('URL convertida'); }
    else toast.info('URL já no formato correto');
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      await onSave(campanha.id, {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        message_type: messageType,
        media_url: mediaUrl.trim() || undefined,
        template: template.trim(),
        delay_min_s: delayMin * 60, delay_max_s: delayMax * 60,
        daily_limit: dailyLimit, safe_hour_start: safeStart, safe_hour_end: safeEnd,
        max_errors_seq: maxErrors, evolution_config_id: evoId,
      });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Editar Campanha
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Observações" />
            </div>
          </div>

          <EvolutionSelector instances={evolutionInstances} value={evoId} onChange={setEvoId} onManage={onManageEvo} />

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de mensagem</Label>
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(MSG_TYPES) as [MessageType, typeof MSG_TYPES[MessageType]][]).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button key={key} onClick={() => setMessageType(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                      messageType === key ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}>
                    <Icon className="w-4 h-4" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {needsMedia && (
            <div className="space-y-1.5">
              <Label>URL da mídia *</Label>
              <div className="flex gap-2">
                <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                  placeholder="https://drive.google.com/…" className="font-mono text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={handleConvertDrive}
                  className="shrink-0 gap-1.5 h-9">
                  <Link2 className="w-3.5 h-3.5" /> Converter
                </Button>
              </div>
            </div>
          )}

          {hasCaption && (
            <div className="space-y-1.5">
              <Label>{messageType === 'text' ? 'Template *' : 'Legenda (opcional)'}</Label>
              <Textarea rows={4} value={template} onChange={e => setTemplate(e.target.value)}
                className="font-mono text-sm resize-none"
                placeholder={messageType === 'text' ? 'Olá {{nome}}! 🎉' : 'Legenda da mídia…'} />
              <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> para personalizar.</p>
            </div>
          )}

          <hr className="border-border" />

          <AntiBanFields
            delayMin={delayMin} setDelayMin={setDelayMin}
            delayMax={delayMax} setDelayMax={setDelayMax}
            dailyLimit={dailyLimit} setDailyLimit={setDailyLimit}
            safeStart={safeStart} setSafeStart={setSafeStart}
            safeEnd={safeEnd} setSafeEnd={setSafeEnd}
            maxErrors={maxErrors} setMaxErrors={setMaxErrors}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── NovaCampanhaModal ─────────────────────────────────────────────────────────

function NovaCampanhaModal({ evolutionInstances, onClose, onCreate, onManageEvo }: {
  evolutionInstances: EvolutionInstance[];
  onClose: () => void;
  onCreate: (form: CampanhaForm) => Promise<void>;
  onManageEvo?: () => void;
}) {
  const defaultEvoId = evolutionInstances.find(i => i.ativo)?.id ?? evolutionInstances[0]?.id ?? 'default';

  const [nome,        setNome]        = useState('');
  const [descricao,   setDescricao]   = useState('');
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [mediaUrl,    setMediaUrl]    = useState('');
  const [template,    setTemplate]    = useState('');
  const [leadsSource, setLeadsSource] = useState<LeadsSource>('paste');
  const [leadsText,   setLeadsText]   = useState('');
  const [sistemaType, setSistemaType] = useState<SistemaType>('lancamento');
  const [sistemaId,   setSistemaId]   = useState('');
  const [loadedLeads, setLoadedLeads] = useState<LoadedLead[]>([]);
  const [delayMin,    setDelayMin]    = useState(1);
  const [delayMax,    setDelayMax]    = useState(3);
  const [dailyLimit,  setDailyLimit]  = useState(150);
  const [safeStart,   setSafeStart]   = useState(8);
  const [safeEnd,     setSafeEnd]     = useState(21);
  const [maxErrors,   setMaxErrors]   = useState(3);
  const [evolutionId, setEvolutionId] = useState(defaultEvoId);
  const [saving,        setSaving]      = useState(false);
  const [sistemaItems,  setSistemaItems]  = useState<SistemaItem[]>([]);
  const [loadingItems,  setLoadingItems]  = useState(false);
  const [loadingLeadsX, setLoadingLeadsX] = useState(false);

  useEffect(() => {
    if (leadsSource !== 'sistema') return;
    setLoadingItems(true); setSistemaItems([]); setSistemaId(''); setLoadedLeads([]);
    const tables: Record<SistemaType, string> = {
      lancamento: 'lancamentos', npa: 'npa_eventos', aula_secreta: 'aula_secreta_eventos',
    };
    supabase.from(tables[sistemaType]).select('id, nome').order('created_at', { ascending: false })
      .then(({ data }) => { setSistemaItems((data ?? []) as SistemaItem[]); setLoadingItems(false); });
  }, [leadsSource, sistemaType]);

  const handleLoadLeads = async () => {
    if (!sistemaId) return;
    setLoadingLeadsX(true);
    const cfg: Record<SistemaType, { table: string; fk: string }> = {
      lancamento:   { table: 'lancamento_leads',   fk: 'lancamento_id' },
      npa:          { table: 'npa_evento_leads',   fk: 'npa_evento_id' },
      aula_secreta: { table: 'aula_secreta_leads', fk: 'aula_secreta_evento_id' },
    };
    const { table, fk } = cfg[sistemaType];
    const PAGE = 1000; let all: Array<{ nome: string; whatsapp: string }> = []; let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select('nome, whatsapp').eq(fk, sistemaId).range(from, from + PAGE - 1);
      if (error || !data?.length) break;
      all = all.concat(data as typeof all);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const leads: LoadedLead[] = all
      .filter(l => l.whatsapp?.replace(/\D/g, '').length >= 10)
      .map(l => ({ phone: l.whatsapp, nome: l.nome ?? '', variaveis: {} }));
    setLoadedLeads(leads); setLoadingLeadsX(false);
    toast.success(`${leads.length} leads carregados`);
  };

  const handleConvertDrive = () => {
    const converted = toDriveDownload(mediaUrl);
    if (converted !== mediaUrl) { setMediaUrl(converted); toast.success('URL convertida'); }
    else toast.info('URL já no formato correto');
  };

  const leadsCount  = leadsSource === 'paste' ? parseLeads(leadsText).length : loadedLeads.length;
  const needsMedia  = messageType !== 'text';
  const hasCaption  = MSG_TYPES[messageType].hasCaption;
  const captionLabel = messageType === 'text' ? 'Template da mensagem' : 'Legenda (opcional)';

  const handleSubmit = async () => {
    if (!nome.trim())                               { toast.error('Nome obrigatório'); return; }
    if (needsMedia && !mediaUrl.trim())             { toast.error('URL da mídia obrigatória'); return; }
    if (messageType === 'text' && !template.trim()) { toast.error('Template obrigatório'); return; }
    if (!leadsCount)                                { toast.error('Nenhum lead válido'); return; }
    const form: CampanhaForm = {
      nome, descricao, messageType, mediaUrl, template,
      leadsSource, leadsText, sistemaType, sistemaId, loadedLeads,
      delayMin, delayMax, dailyLimit, safeStart, safeEnd, maxErrors,
      evolutionConfigId: evolutionId,
    };
    setSaving(true); try { await onCreate(form); } finally { setSaving(false); }
  };

  const SISTEMA_LABELS: Record<SistemaType, string> = {
    lancamento: 'Lançamentos', npa: 'NPA', aula_secreta: 'Aula Secreta',
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-600" /> Nova Campanha de Disparo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Nome + Descrição */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input placeholder="Ex: Oferta especial maio" value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Observações internas" value={descricao} onChange={e => setDescricao(e.target.value)} />
            </div>
          </div>

          {/* Evolution API */}
          <EvolutionSelector instances={evolutionInstances} value={evolutionId} onChange={setEvolutionId} onManage={onManageEvo} />

          {/* Tipo de mensagem */}
          <div className="space-y-2">
            <Label>Tipo de mensagem *</Label>
            <div className="flex gap-2">
              {(Object.entries(MSG_TYPES) as [MessageType, typeof MSG_TYPES[MessageType]][]).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button key={key} onClick={() => setMessageType(key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      messageType === key
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}>
                    <Icon className="w-4 h-4" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL mídia */}
          {needsMedia && (
            <div className="space-y-1.5">
              <Label>URL da mídia (Google Drive) *</Label>
              <div className="flex gap-2">
                <Input placeholder="https://drive.google.com/file/d/FILE_ID/view"
                  value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={handleConvertDrive}
                  className="shrink-0 gap-1.5 h-9">
                  <Link2 className="w-3.5 h-3.5" /> Converter
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                No Drive: <strong>Compartilhar → Qualquer pessoa com o link</strong>, depois clique em <strong>Converter</strong>.
              </p>
            </div>
          )}

          {/* Template / Legenda */}
          {hasCaption && (
            <div className="space-y-1.5">
              <Label>{captionLabel}{messageType === 'text' ? ' *' : ''}</Label>
              <Textarea rows={4}
                placeholder={messageType === 'text' ? 'Olá {{nome}}, temos uma novidade incrível! 🎉' : 'Legenda da mídia (opcional)…'}
                value={template} onChange={e => setTemplate(e.target.value)}
                className="font-mono text-sm resize-none" />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> e{' '}
                <code className="bg-muted px-1 rounded">{'{{phone}}'}</code> para personalizar.
              </p>
            </div>
          )}

          <hr className="border-border" />

          {/* Fonte de leads */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Lista de leads *</Label>
              {leadsCount > 0 && (
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                  ✓ {leadsCount} leads
                </span>
              )}
            </div>

            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['sistema', 'paste'] as LeadsSource[]).map(src => (
                <button key={src} onClick={() => setLeadsSource(src)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    leadsSource === src ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}>
                  {src === 'sistema' ? '📊 Base do Sistema' : '📋 Colar / CSV'}
                </button>
              ))}
            </div>

            {/* Sistema */}
            {leadsSource === 'sistema' && (
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex gap-2">
                  {(Object.keys(SISTEMA_LABELS) as SistemaType[]).map(t => (
                    <button key={t} onClick={() => setSistemaType(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        sistemaType === t ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}>
                      {SISTEMA_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {loadingItems ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                      </div>
                    ) : (
                      <Select value={sistemaId} onValueChange={v => { setSistemaId(v); setLoadedLeads([]); }}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder={`Selecione o ${SISTEMA_LABELS[sistemaType].slice(0, -1)}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {sistemaItems.map(item => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={handleLoadLeads}
                    disabled={!sistemaId || loadingLeadsX} className="gap-1.5 shrink-0">
                    {loadingLeadsX ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    Carregar leads
                  </Button>
                </div>
                {loadedLeads.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-2 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      <span>Nome</span><span>Telefone</span>
                    </div>
                    <div className="divide-y divide-border max-h-40 overflow-y-auto">
                      {loadedLeads.slice(0, 5).map((l, i) => (
                        <div key={i} className="grid grid-cols-2 px-3 py-1.5 text-xs">
                          <span className="truncate text-foreground">{l.nome || '—'}</span>
                          <span className="font-mono text-muted-foreground">{l.phone}</span>
                        </div>
                      ))}
                      {loadedLeads.length > 5 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
                          + {loadedLeads.length - 5} leads…
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paste / CSV */}
            {leadsSource === 'paste' && (
              <div className="space-y-1.5">
                <Textarea rows={5}
                  placeholder={`Cole aqui os leads (um por linha):\n5511999999999,João Silva\n5511888888888,Maria Costa\n5511777777777`}
                  value={leadsText} onChange={e => setLeadsText(e.target.value)}
                  className="font-mono text-xs resize-none" />
                <p className="text-xs text-muted-foreground">
                  Formato: <code className="bg-muted px-1 rounded">telefone,nome</code> · Aceita vírgula, ponto-e-vírgula ou tab.
                </p>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Anti-ban */}
          <AntiBanFields
            delayMin={delayMin} setDelayMin={setDelayMin}
            delayMax={delayMax} setDelayMax={setDelayMax}
            dailyLimit={dailyLimit} setDailyLimit={setDailyLimit}
            safeStart={safeStart} setSafeStart={setSafeStart}
            safeEnd={safeEnd} setSafeEnd={setSafeEnd}
            maxErrors={maxErrors} setMaxErrors={setMaxErrors}
          />

          <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <span>
              <strong>Anti-ban:</strong> Use delays maiores (2–5 min) para números novos. Limite diário abaixo de 200.
              Envie apenas em horário comercial. Personalize com <code>{'{{nome}}'}</code>.
            </span>
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
  const [campanhas,          setCampanhas]          = useState<Campanha[]>([]);
  const [evolutionInstances, setEvolutionInstances] = useState<EvolutionInstance[]>([]);
  const [logs,               setLogs]               = useState<Record<string, LogEntry[]>>({});
  const [showModal,          setShowModal]          = useState(false);
  const [editingCampanha,    setEditingCampanha]    = useState<Campanha | null>(null);
  const [expandedCards,      setExpandedCards]      = useState<Set<string>>(new Set());
  const [activeTabMap,       setActiveTabMap]       = useState<Record<string, CardTab>>({});
  const [leadsMap,           setLeadsMap]           = useState<Record<string, LeadRow[]>>({});
  const [leadsTotalMap,      setLeadsTotalMap]      = useState<Record<string, number>>({});
  const [leadsPageMap,       setLeadsPageMap]       = useState<Record<string, number>>({});
  const [loadingLeadsSet,    setLoadingLeadsSet]    = useState<Set<string>>(new Set());
  const [activeCampaignIds,  setActiveCampaignIds]  = useState<Set<string>>(new Set());
  const [showEvoManager,     setShowEvoManager]     = useState(false);

  const runningRef = useRef<Map<string, boolean>>(new Map());
  const speedRef   = useRef<Map<string, number[]>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!activeCampaignIds.size) return;
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, [activeCampaignIds.size]);

  const fetchCampanhas = useCallback(async () => {
    const { data } = await supabase.from('disparo_campanhas').select('*').order('created_at', { ascending: false });
    if (data) setCampanhas(data as Campanha[]);
  }, []);

  const fetchEvolutionInstances = useCallback(async () => {
    const { data } = await supabase
      .from('evolution_config')
      .select('id, instance_name, api_url, api_key, ativo')
      .order('created_at', { ascending: true });
    if (data) setEvolutionInstances(data as EvolutionInstance[]);
  }, []);

  useEffect(() => {
    fetchCampanhas();
    fetchEvolutionInstances();
    return () => { runningRef.current.forEach((_, id) => runningRef.current.set(id, false)); };
  }, [fetchCampanhas, fetchEvolutionInstances]);

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

  // ── Leads lazy loading ───────────────────────────────────────────────────

  const handleLoadLeads = useCallback(async (campanhaId: string, page: number) => {
    setLoadingLeadsSet(prev => new Set(prev).add(campanhaId));
    setLeadsPageMap(prev => ({ ...prev, [campanhaId]: page }));

    const from = page * LEADS_PER_PAGE;
    const { data, count } = await supabase
      .from('disparo_leads')
      .select('id, phone, nome, status, error_msg, sent_at, ordem', { count: 'exact' })
      .eq('campanha_id', campanhaId)
      .order('ordem', { ascending: true })
      .range(from, from + LEADS_PER_PAGE - 1);

    if (data) setLeadsMap(prev => ({ ...prev, [campanhaId]: data as LeadRow[] }));
    if (count !== null) setLeadsTotalMap(prev => ({ ...prev, [campanhaId]: count }));
    setLoadingLeadsSet(prev => { const s = new Set(prev); s.delete(campanhaId); return s; });
  }, []);

  // ── Sending loop — calls Evolution API directly ──────────────────────────

  const runCampanha = useCallback(async (campanhaId: string) => {
    if (runningRef.current.get(campanhaId)) return;
    runningRef.current.set(campanhaId, true);
    setActiveCampaignIds(prev => new Set(prev).add(campanhaId));
    speedRef.current.set(campanhaId, []);

    await supabase.from('disparo_campanhas').update({ status: 'ativo' }).eq('id', campanhaId);
    await fetchCampanhas();

    let consecutiveErrors = 0;

    while (runningRef.current.get(campanhaId)) {
      const { data: camp } = await supabase.from('disparo_campanhas').select('*').eq('id', campanhaId).maybeSingle();
      if (!camp) break;

      // Safe hours
      const hour = new Date().getHours();
      if (hour < camp.safe_hour_start || hour >= camp.safe_hour_end) {
        toast.warning(`"${camp.nome}" pausada: fora do horário ${camp.safe_hour_start}h–${camp.safe_hour_end}h`);
        await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', campanhaId);
        break;
      }

      // Daily limit
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from('disparo_leads').select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanhaId).eq('status', 'enviado').gte('sent_at', todayStart.toISOString());
      if ((sentToday ?? 0) >= camp.daily_limit) {
        toast.warning(`"${camp.nome}" pausada: limite diário de ${camp.daily_limit} atingido`);
        await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', campanhaId);
        break;
      }

      // Next lead
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
      const text     = applyVars(camp.template ?? '', vars);
      const msgType  = (camp.message_type ?? 'text') as MessageType;
      const mediaUrl = camp.media_url ?? '';

      try {
        // Fetch the Evolution API config for this campaign
        const evoConfigId = camp.evolution_config_id ?? 'default';
        const { data: evo } = await supabase
          .from('evolution_config')
          .select('api_url, api_key, instance_name')
          .eq('id', evoConfigId)
          .maybeSingle();

        if (!evo?.api_url || !evo?.instance_name) {
          throw new Error(`Evolution API não configurada (id: ${evoConfigId})`);
        }

        const base    = evo.api_url.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json', 'apikey': evo.api_key };

        if (msgType === 'text') {
          const r = await fetch(`${base}/message/sendText/${evo.instance_name}`, {
            method: 'POST', headers,
            body: JSON.stringify({ number: phone, text }),
          });
          if (!r.ok) throw new Error(await r.text());
        } else {
          const mtype = { image: 'image', video: 'video', audio: 'audio' }[msgType] ?? 'image';
          const r = await fetch(`${base}/message/sendMedia/${evo.instance_name}`, {
            method: 'POST', headers,
            body: JSON.stringify({ number: phone, mediatype: mtype, media: mediaUrl, caption: text || undefined }),
          });
          if (!r.ok) throw new Error(await r.text());
        }

        await supabase.from('disparo_leads').update({ status: 'enviado', sent_at: new Date().toISOString(), error_msg: null }).eq('id', lead.id);
        await supabase.from('disparo_campanhas').update({ leads_sent: camp.leads_sent + 1 }).eq('id', campanhaId);
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

  // ── Controls ─────────────────────────────────────────────────────────────

  const pauseCampanha = useCallback(async (id: string) => {
    runningRef.current.set(id, false);
    await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', id);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  const stopCampanha = useCallback(async (id: string, nome: string) => {
    if (!confirm(`Parar "${nome}"? Leads pendentes podem ser retomados depois.`)) return;
    runningRef.current.set(id, false);
    await supabase.from('disparo_campanhas').update({ status: 'pausado' }).eq('id', id);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  const resetCampanha = useCallback(async (id: string) => {
    if (!confirm('Remarcar leads com erro/pulado como pendentes para reenvio?')) return;
    runningRef.current.set(id, false);
    const { data: errLeads } = await supabase.from('disparo_leads').select('id').eq('campanha_id', id).in('status', ['erro', 'pulado']);
    if (errLeads?.length) {
      await supabase.from('disparo_leads').update({ status: 'pendente', error_msg: null, sent_at: null }).in('id', errLeads.map((l: { id: string }) => l.id));
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

  const handleSaveEdit = useCallback(async (id: string, data: Partial<Campanha>) => {
    const { error } = await supabase.from('disparo_campanhas').update(data).eq('id', id);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Campanha atualizada');
    setEditingCampanha(null);
    await fetchCampanhas();
  }, [fetchCampanhas]);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async (form: CampanhaForm) => {
    const leads = form.leadsSource === 'sistema' ? form.loadedLeads : parseLeads(form.leadsText);
    if (!leads.length) { toast.error('Nenhum lead válido'); return; }

    const { data: camp, error } = await supabase
      .from('disparo_campanhas')
      .insert({
        nome:                form.nome.trim(),
        descricao:           form.descricao.trim() || null,
        template:            form.template.trim(),
        message_type:        form.messageType,
        media_url:           form.mediaUrl.trim() || null,
        status:              'rascunho',
        leads_total:         leads.length,
        delay_min_s:         form.delayMin * 60,
        delay_max_s:         form.delayMax * 60,
        daily_limit:         form.dailyLimit,
        safe_hour_start:     form.safeStart,
        safe_hour_end:       form.safeEnd,
        max_errors_seq:      form.maxErrors,
        evolution_config_id: form.evolutionConfigId || 'default',
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

  // ── UI helpers ────────────────────────────────────────────────────────────

  const activeAndPaused = campanhas.filter(c => activeCampaignIds.has(c.id) || c.status === 'ativo' || c.status === 'pausado' || c.status === 'erro');
  const drafts = campanhas.filter(c => c.status === 'rascunho' && !activeCampaignIds.has(c.id));
  const done   = campanhas.filter(c => c.status === 'concluido' && !activeCampaignIds.has(c.id));

  function toggleExpand(id: string) {
    setExpandedCards(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function cardProps(c: Campanha): Omit<CardProps, 'campanha'> {
    const evoInst = evolutionInstances.find(i => i.id === (c.evolution_config_id ?? 'default'));
    return {
      isRunning:            activeCampaignIds.has(c.id),
      logs:                 logs[c.id] ?? [],
      activeTab:            activeTabMap[c.id] ?? 'log',
      leads:                leadsMap[c.id] ?? [],
      leadsTotal:           leadsTotalMap[c.id] ?? 0,
      leadsPage:            leadsPageMap[c.id] ?? 0,
      loadingLeads:         loadingLeadsSet.has(c.id),
      showExpanded:         expandedCards.has(c.id),
      speed:                getSpeed(c.id),
      evolutionInstanceName: evoInst?.instance_name,
      onToggleExpand:       () => toggleExpand(c.id),
      onTabChange:          (tab) => setActiveTabMap(prev => ({ ...prev, [c.id]: tab })),
      onLoadLeads:          (page) => handleLoadLeads(c.id, page),
      onStart:              () => runCampanha(c.id),
      onPause:              () => pauseCampanha(c.id),
      onStop:               () => stopCampanha(c.id, c.nome),
      onDelete:             () => deleteCampanha(c.id, c.nome),
      onReset:              () => resetCampanha(c.id),
      onEdit:               () => setEditingCampanha(c),
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

      {showModal && (
        <NovaCampanhaModal
          evolutionInstances={evolutionInstances}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          onManageEvo={() => setShowEvoManager(true)}
        />
      )}

      {editingCampanha && (
        <EditCampanhaModal
          campanha={editingCampanha}
          evolutionInstances={evolutionInstances}
          onClose={() => setEditingCampanha(null)}
          onSave={handleSaveEdit}
          onManageEvo={() => setShowEvoManager(true)}
        />
      )}

      {showEvoManager && (
        <EvolutionInstancesModal
          onClose={() => setShowEvoManager(false)}
          onSaved={() => { fetchEvolutionInstances(); }}
        />
      )}
    </div>
  );
}
