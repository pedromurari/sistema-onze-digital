import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Send, Clock, CheckCircle2, AlertCircle, FileText,
  Pencil, Trash2, MessageSquare, Users, Phone, Zap, Calendar,
  GitBranch, Image, Video, Music, FileIcon, BarChart2, Eye,
  AtSign, Upload, Download, X, Settings2,
  Variable, Link2, ChevronDown, ChevronLeft, ChevronRight, MoreVertical,
  Mail, Heart, RefreshCw, CheckCircle, XCircle, Minus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EvolutionTaskPanel } from './EvolutionTaskPanel';

// ── Types ────────────────────────────────────────────────────────────────────

type MessageStatus = 'draft' | 'scheduled' | 'sent' | 'error';
type RecipientType = 'group' | 'number';
type MessageType   = 'text' | 'image' | 'video' | 'audio' | 'document' | 'poll';

interface FunnelMessage {
  id: string;
  funnel_name: string;
  day_number: number;
  scheduled_at: string;
  recipient_type: RecipientType;
  recipient_id: string;
  message_type: MessageType;
  message_text: string;
  media_url?: string;
  poll_name?: string;
  poll_options?: string[];
  poll_selectable_count?: number;
  link_preview: boolean;
  mention_everyone: boolean;
  send_header_image: boolean;
  update_group_picture: boolean;
  subtipo?: string;
  status: MessageStatus;
  sent_at?: string;
  error_message?: string;
  created_at: string;
}

interface FunnelStats {
  total: number; sent: number; scheduled: number; draft: number; error: number;
}

interface FunnelConfig {
  id?: string;
  funnel_name: string;
  grupo_1_id: string;
  grupo_2_id: string;
  imagem_manha: string;
  imagem_tarde: string;
  imagem_noite: string;
  variaveis: Record<string, string>;
  imagens: Record<string, string>;
}

interface MsgForm {
  funnel_name: string;
  day_number: number;
  scheduled_date: string;
  scheduled_time: string;
  recipient_type: RecipientType;
  recipient_id: string;
  message_type: MessageType;
  message_text: string;
  media_url: string;
  poll_name: string;
  poll_options: string[];
  poll_selectable_count: number;
  link_preview: boolean;
  mention_everyone: boolean;
  send_header_image: boolean;
  update_group_picture: boolean;
  subtipo: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MessageStatus, { label: string; badge: string; icon: React.ElementType }> = {
  draft:     { label: 'Rascunho', badge: 'bg-gray-100 text-gray-600 border-gray-200',        icon: FileText },
  scheduled: { label: 'Agendada', badge: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Clock },
  sent:      { label: 'Enviada',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  error:     { label: 'Erro',     badge: 'bg-red-50 text-red-700 border-red-200',             icon: AlertCircle },
};

const TYPE_CFG: Record<MessageType, { label: string; icon: React.ElementType; color: string }> = {
  text:     { label: 'Texto',    icon: MessageSquare, color: 'text-blue-600' },
  image:    { label: 'Imagem',   icon: Image,         color: 'text-green-600' },
  video:    { label: 'Vídeo',    icon: Video,         color: 'text-purple-600' },
  audio:    { label: 'Áudio',    icon: Music,         color: 'text-orange-600' },
  document: { label: 'Doc',      icon: FileIcon,      color: 'text-red-600' },
  poll:     { label: 'Enquete',  icon: BarChart2,     color: 'text-indigo-600' },
};

// ── Drive image helpers & slots ───────────────────────────────────────────────

const DRIVE_THUMB = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w300`;
const DRIVE_URL   = (id: string) => `https://drive.google.com/uc?export=view&id=${id}`;

interface ImageSlot { key: string; label: string; driveId: string; hint: string; group: string; }

const IMAGE_SLOTS: ImageSlot[] = [
  { key: 'contagem_dia_7', label: 'Faltam 7 dias', driveId: '1qEVmFI2yf2pwPdMYLcw1FtALVflDFUzR', hint: '7 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_6', label: 'Faltam 6 dias', driveId: '1xkrnWTiry6A0zCWa3lB7tr6l4SR2b4Fp', hint: '6 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_5', label: 'Faltam 5 dias', driveId: '1cdKhi7pNFburRVPYnWm1eIh0zMZelNKS', hint: '5 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_4', label: 'Faltam 4 dias', driveId: '1EpDy5feYWIpm9OO7_lqsP5RWL2fL-YwH', hint: '4 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_3', label: 'Faltam 3 dias', driveId: '1ov483G9T4c9hCAr9_-_vka8z2lMpQPkY', hint: '3 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_2', label: 'Faltam 2 dias', driveId: '1ezvELlgl9AIpaTFbKLx9-nlbZOT61JxA', hint: '2 dias antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_dia_1', label: 'Falta 1 dia',   driveId: '1SkxuYbunOvbAcXZsu8rTRJFdeogbnyxI', hint: '1 dia antes do evento', group: 'Contagem regressiva' },
  { key: 'contagem_3h',    label: 'Faltam 3h',     driveId: '1lOEPLjQuEO9CuYaQFkkYz9LjqaKmMBwi', hint: 'Contagem regressiva 3 horas', group: 'Contagem horária' },
  { key: 'contagem_2h',    label: 'Faltam 2h',     driveId: '1uxNhpaBdK7y6y7oXX8tPlJLTcSMqDq3G', hint: 'Contagem regressiva 2 horas', group: 'Contagem horária' },
  { key: 'contagem_1h',    label: 'Falta 1h',      driveId: '1J6GZQ3m-Ar8qRoA-S8nuPVAF8zWKjINW', hint: 'Contagem regressiva 1 hora',  group: 'Contagem horária' },
  { key: 'aula_1',         label: 'Aula 1',         driveId: '1ZOEJkNGG58iDKfadw322QnMAZ-BppyDn', hint: 'Dia da Aula 1', group: 'Aulas' },
  { key: 'aula_2',         label: 'Aula 2',         driveId: '1ev8X5j8lFl4X5W5cNkr0_-rAWP3-c1yv', hint: 'Dia da Aula 2', group: 'Aulas' },
  { key: 'aula_3',         label: 'Aula 3',         driveId: '1Eh9-0a0OkopBMVA_afWKAdEsRUQSNQUk', hint: 'Dia da Aula 3', group: 'Aulas' },
  { key: 'ao_vivo',        label: 'Ao vivo',         driveId: '1KKUd8RocD967j0u4CIth5mLrZdyUpixi', hint: 'Transmissão ao vivo',  group: 'Eventos' },
];

const SLOT_GROUPS = [...new Set(IMAGE_SLOTS.map(s => s.group))];
const PRESET_DRIVE_URLS = Object.fromEntries(IMAGE_SLOTS.map(s => [s.key, DRIVE_URL(s.driveId)])) as Record<string, string>;

const BULK_TEMPLATE = JSON.stringify(
  {
    funil: 'Nome do Funil',
    data_inicio: '2025-01-15',
    destinatario_padrao: '{{grupo_1}}',
    mensagens: [
      { dia: 1, horario: '09:00', tipo: 'texto', mensagem: 'Bom dia! 🎉\n\nAcesse a aula aqui: {{link_aula_1}}', marcar_todos: true, preview_link: false },
      { dia: 1, horario: '14:00', tipo: 'imagem', url_midia: 'https://exemplo.com/banner.jpg', mensagem: 'Confira o banner!', marcar_todos: false },
      { dia: 2, horario: '10:00', tipo: 'enquete', titulo: 'O que você quer aprender?', opcoes: ['Opção A', 'Opção B', 'Opção C'], multipla_escolha: false, marcar_todos: true },
      { dia: 2, horario: '19:00', tipo: 'video', url_midia: '{{link_video_1}}', mensagem: 'Assista esta aula!' },
      { dia: 3, horario: '09:00', tipo: 'texto', mensagem: '🔗 Acesse agora: {{link_aula_2}}', preview_link: true },
      { dia: 3, horario: '11:00', tipo: 'audio', url_midia: 'https://exemplo.com/audio.mp3' },
      { dia: 4, horario: '08:00', tipo: 'documento', url_midia: 'https://exemplo.com/arquivo.pdf', mensagem: 'Material exclusivo!' },
    ],
    _dica: 'Use {{grupo_1}}, {{grupo_2}}, {{link_aula_1}}, {{link_video_1}} etc. como variáveis. Preencha os valores reais em Configurações do Funil.',
  },
  null,
  2,
);

const EMPTY_CONFIG = (name: string): FunnelConfig => ({
  funnel_name: name,
  grupo_1_id: '',
  grupo_2_id: '',
  imagem_manha: '',
  imagem_tarde: '',
  imagem_noite: '',
  variaveis: {},
  imagens: {},
});

// ── Utilities ──────────────────────────────────────────────────────────────────

const fmtTime = (iso: string) => {
  try { return format(parseISO(iso), 'HH:mm', { locale: ptBR }); } catch { return ''; }
};
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return ''; }
};
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isCountdownDaySubtipo = (subtipo?: string | null) => /^contagem_dia_\d+$/.test(subtipo || '');
const shouldSendHeaderImage = (
  messageType: MessageType,
  subtipo: string | null | undefined,
  hour: number,
  minute: number,
  requested = true,
) => {
  if (!requested || messageType === 'poll' || subtipo === 'enquete') return false;
  if (isCountdownDaySubtipo(subtipo)) return hour === 20 && minute === 0;
  return true;
};

const EMPTY_FORM: MsgForm = {
  funnel_name: '', day_number: 1,
  scheduled_date: todayInput(), scheduled_time: '09:00',
  recipient_type: 'group', recipient_id: '',
  message_type: 'text', message_text: '', media_url: '',
  poll_name: '', poll_options: ['', ''], poll_selectable_count: 1,
  link_preview: false, mention_everyone: false, send_header_image: false,
  update_group_picture: false,
  subtipo: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export function FunilLancamento() {
  const [funnelNames,     setFunnelNames]     = useState<string[]>([]);
  const [funnelStats,     setFunnelStats]     = useState<Record<string, FunnelStats>>({});
  const [expandedFunnels, setExpandedFunnels] = useState<Set<string>>(new Set());
  const [refreshTick,     setRefreshTick]     = useState(0);
  const [newName,         setNewName]         = useState('');
  const [saving,          setSaving]          = useState(false);
  const [sendingQ,        setSendingQ]        = useState(false);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [form,            setForm]            = useState<MsgForm>(EMPTY_FORM);
  const [deleteTarget,    setDeleteTarget]    = useState<string | null>(null);
  const [bulkOpen,        setBulkOpen]        = useState(false);
  const [configOpen,      setConfigOpen]      = useState(false);
  const [configFunnel,    setConfigFunnel]    = useState('');
  const [configs,         setConfigs]         = useState<Record<string, FunnelConfig>>({});
  const [renamingFunnel,  setRenamingFunnel]  = useState<{ name: string; newName: string } | null>(null);
  const [deletingFunnel,  setDeletingFunnel]  = useState<string | null>(null);

  // Quick send state
  const [qType,    setQType]    = useState<RecipientType>('group');
  const [qRecip,   setQRecip]   = useState('');
  const [qMsgType, setQMsgType] = useState<MessageType>('text');
  const [qText,    setQText]    = useState('');
  const [qUrl,     setQUrl]     = useState('');
  const [qCaption, setQCaption] = useState('');
  const [qPollName, setQPollName] = useState('');
  const [qPollOpts, setQPollOpts] = useState(['', '']);
  const [qLinkPrev, setQLinkPrev] = useState(false);
  const [qMention,  setQMention]  = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────

  const loadFunnels = useCallback(async () => {
    const [{ data, error }, { data: configRows, error: configError }] = await Promise.all([
      supabase
        .from('funnel_messages').select('funnel_name, status')
        .order('created_at', { ascending: false }),
      supabase
        .from('funnel_configs').select('*'),
    ]);
    if (error) toast.error(`Erro ao carregar mensagens: ${error.message}`);
    if (configError) toast.error(`Erro ao carregar funis: ${configError.message}`);
    const rows = data || [];
    const configNames = ((configRows || []) as Record<string, unknown>[])
      .map(r => r.funnel_name as string)
      .filter(Boolean);
    const messageNames = rows.map(r => r.funnel_name as string).filter(Boolean);
    const unique = [...new Set([...messageNames, ...configNames])];
    setFunnelNames(unique);
    const statsMap: Record<string, FunnelStats> = {};
    for (const name of configNames) {
      statsMap[name] = { total: 0, sent: 0, scheduled: 0, draft: 0, error: 0 };
    }
    for (const r of rows) {
      const fn = r.funnel_name as string;
      if (!statsMap[fn]) statsMap[fn] = { total: 0, sent: 0, scheduled: 0, draft: 0, error: 0 };
      statsMap[fn].total++;
      const st = r.status as MessageStatus;
      if (st in statsMap[fn]) statsMap[fn][st]++;
    }
    setFunnelStats(statsMap);
    setConfigs(prev => {
      const next = { ...prev };
      for (const cfg of (configRows || []) as Record<string, unknown>[]) {
        const name = cfg.funnel_name as string;
        if (!name) continue;
        next[name] = {
          ...(cfg as unknown as FunnelConfig),
          variaveis: (cfg.variaveis as Record<string, string>) || {},
          imagens: (cfg.imagens as Record<string, string>) || {},
        };
      }
      return next;
    });
    setExpandedFunnels(prev => prev.size === 0 && unique.length > 0 ? new Set([unique[0]]) : prev);
  }, []);

  const loadConfig = useCallback(async (name: string) => {
    if (!name || configs[name]) return;
    const { data } = await supabase
      .from('funnel_configs').select('*').eq('funnel_name', name).maybeSingle();
    setConfigs(prev => ({
      ...prev,
      [name]: data
        ? {
            ...data,
            variaveis: (data.variaveis as Record<string, string>) || {},
            imagens:   (data.imagens   as Record<string, string>) || {},
          }
        : EMPTY_CONFIG(name),
    }));
  }, [configs]);

  async function ensureFunnelConfig(name: string): Promise<boolean> {
    const funnelName = name.trim();
    if (!funnelName) return false;
    const { data, error } = await supabase
      .from('funnel_configs')
      .select('id')
      .eq('funnel_name', funnelName)
      .maybeSingle();
    if (error) {
      toast.error(`Erro ao verificar funil: ${error.message}`);
      return false;
    }
    if (data) return true;

    const cfg = EMPTY_CONFIG(funnelName);
    const { error: insertError } = await supabase
      .from('funnel_configs')
      .insert(cfg as any);
    if (insertError) {
      toast.error(`Erro ao criar funil: ${insertError.message}`);
      return false;
    }
    setConfigs(prev => ({ ...prev, [funnelName]: cfg }));
    return true;
  }

  useEffect(() => { loadFunnels(); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function toggleFunnel(name: string) {
    setExpandedFunnels(prev => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name); else s.add(name);
      return s;
    });
    loadConfig(name);
  }

  function openCreate(funnelName: string, maxDay?: number) {
    loadConfig(funnelName);
    const cfg = configs[funnelName];
    const defaultRecip = cfg?.grupo_1_id ? '{{grupo_1}}' : '';
    setEditingId(null);
    setForm({ ...EMPTY_FORM, funnel_name: funnelName, day_number: maxDay != null ? maxDay + 1 : 1, recipient_id: defaultRecip });
    setModalOpen(true);
  }

  function openEdit(msg: FunnelMessage) {
    setEditingId(msg.id);
    const dt = parseISO(msg.scheduled_at);
    setForm({
      funnel_name:           msg.funnel_name,
      day_number:            msg.day_number,
      scheduled_date:        format(dt, 'yyyy-MM-dd'),
      scheduled_time:        format(dt, 'HH:mm'),
      recipient_type:        msg.recipient_type,
      recipient_id:          msg.recipient_id,
      message_type:          msg.message_type || 'text',
      message_text:          msg.message_text || '',
      media_url:             msg.media_url    || '',
      poll_name:             msg.poll_name    || '',
      poll_options:          msg.poll_options && msg.poll_options.length > 0 ? msg.poll_options : ['', ''],
      poll_selectable_count: msg.poll_selectable_count ?? 1,
      link_preview:          msg.link_preview     ?? false,
      mention_everyone:      msg.mention_everyone ?? false,
      send_header_image:     msg.send_header_image ?? false,
      update_group_picture:  msg.update_group_picture ?? false,
      subtipo:               msg.subtipo ?? '',
    });
    setModalOpen(true);
  }

  function buildPayload(f: MsgForm, status: 'draft' | 'scheduled') {
    return {
      funnel_name:           f.funnel_name.trim(),
      day_number:            f.day_number,
      scheduled_at:          new Date(`${f.scheduled_date}T${f.scheduled_time}:00`).toISOString(),
      recipient_type:        f.recipient_type,
      recipient_id:          f.recipient_id.trim(),
      message_type:          f.message_type,
      message_text:          f.message_text,
      media_url:             f.media_url.trim() || null,
      poll_name:             f.poll_name.trim() || null,
      poll_options:          f.poll_options.filter(Boolean).length >= 2 ? f.poll_options.filter(Boolean) : null,
      poll_selectable_count: f.poll_selectable_count,
      link_preview:          f.link_preview,
      mention_everyone:      f.mention_everyone,
      send_header_image:     f.send_header_image,
      update_group_picture:  f.recipient_type === 'group' && !!f.subtipo && f.update_group_picture,
      subtipo:               f.subtipo || null,
      status,
    };
  }

  function validate(f: MsgForm): string | null {
    if (!f.funnel_name.trim())  return 'Nome do funil é obrigatório';
    if (!f.recipient_id.trim()) return 'Destinatário é obrigatório';
    if (f.message_type === 'poll') {
      if (!f.poll_name.trim()) return 'Título da enquete é obrigatório';
      if (f.poll_options.filter(Boolean).length < 2) return 'Mínimo 2 opções na enquete';
    } else if (['image', 'video', 'audio', 'document'].includes(f.message_type)) {
      if (!f.media_url.trim()) return 'URL da mídia é obrigatória';
    } else {
      if (!f.message_text.trim()) return 'Mensagem é obrigatória';
    }
    return null;
  }

  async function handleSave(action: 'draft' | 'scheduled') {
    const err = validate(form);
    if (err) { toast.error(err); return; }
    const configOk = await ensureFunnelConfig(form.funnel_name);
    if (!configOk) return;
    setSaving(true);
    try {
      const payload = buildPayload(form, action);
      const { error } = editingId
        ? await supabase.from('funnel_messages').update(payload).eq('id', editingId)
        : await supabase.from('funnel_messages').insert(payload);
      if (error) { toast.error(`Erro: ${error.message}`); return; }
      toast.success(action === 'draft' ? 'Salvo como rascunho' : 'Mensagem agendada!');
      setModalOpen(false);
      setRefreshTick(t => t + 1);
      loadFunnels();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message ?? 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    const err = validate(form);
    if (err) { toast.error(err); return; }
    const configOk = await ensureFunnelConfig(form.funnel_name);
    if (!configOk) return;
    setSaving(true);
    try {
      const p = buildPayload(form, 'scheduled');

      // Timeout de 90s — a edge function pode demorar com troca de foto + imagem de cabeçalho
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido (90s). Verifique se a Evolution API está conectada e tente novamente.')), 90_000)
      );
      const invokePromise = supabase.functions.invoke('funil-processar', {
        body: { quick_send: true, ...p },
      });
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      const invokeError = error?.message ?? (data as any)?.error;
      if (invokeError && editingId) {
        await supabase.from('funnel_messages').update({
          ...p,
          status: 'error',
          error_message: invokeError,
        }).eq('id', editingId);
      }
      if (invokeError) {
        toast.error(`Erro: ${invokeError}`);
        loadFunnels();
        return;
      }

      const sentAt = new Date().toISOString();
      const sentPayload = { ...p, status: 'sent', sent_at: sentAt, error_message: null };
      const { error: persistError } = editingId
        ? await supabase.from('funnel_messages').update(sentPayload).eq('id', editingId)
        : await supabase.from('funnel_messages').insert({ ...sentPayload, scheduled_at: sentAt } as any);
      if (persistError) {
        toast.error(`Mensagem enviada, mas falhou ao marcar como enviada: ${persistError.message}`);
        return;
      }
      toast.success('Mensagem enviada!');
      setModalOpen(false);
      setRefreshTick(t => t + 1);
      loadFunnels();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao enviar mensagem');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('funnel_messages').delete().eq('id', id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Excluído'); setDeleteTarget(null);
    setRefreshTick(t => t + 1);
    loadFunnels();
  }

  async function handleQuickSend() {
    if (!qRecip.trim()) { toast.error('Destinatário é obrigatório'); return; }
    const body: Record<string, unknown> = {
      quick_send: true, recipient_type: qType, recipient_id: qRecip.trim(),
      message_type: qMsgType, mention_everyone: qMention,
    };
    if (qMsgType === 'poll') {
      if (!qPollName.trim()) { toast.error('Título da enquete obrigatório'); return; }
      const opts = qPollOpts.filter(Boolean);
      if (opts.length < 2) { toast.error('Mínimo 2 opções'); return; }
      body.poll_name = qPollName; body.poll_options = opts; body.poll_selectable_count = 1;
    } else if (['image', 'video', 'audio', 'document'].includes(qMsgType)) {
      if (!qUrl.trim()) { toast.error('URL obrigatória'); return; }
      body.media_url = qUrl.trim(); body.message_text = qCaption;
    } else {
      if (!qText.trim()) { toast.error('Mensagem obrigatória'); return; }
      body.message_text = qText; body.link_preview = qLinkPrev;
    }
    setSendingQ(true);
    const { data, error } = await supabase.functions.invoke('funil-processar', { body });
    setSendingQ(false);
    if (error || (data as any)?.error) {
      toast.error(`Erro: ${error?.message ?? (data as any)?.error}`); return;
    }
    toast.success('Enviado!');
    setQText(''); setQUrl(''); setQCaption(''); setQPollName(''); setQPollOpts(['', '']);
  }

  async function createFunnel() {
    const name = newName.trim();
    if (!name) return;
    const ok = await ensureFunnelConfig(name);
    if (!ok) return;
    setFunnelNames(prev => [...new Set([...prev, name])]);
    setExpandedFunnels(prev => new Set([...prev, name]));
    setNewName('');
    toast.success('Funil criado!');
    loadFunnels();
  }

  async function handleRenameFunnel(oldName: string, nextName: string) {
    const n = nextName.trim();
    if (!n || n === oldName) { setRenamingFunnel(null); return; }
    const [r1, r2] = await Promise.all([
      supabase.from('funnel_messages').update({ funnel_name: n }).eq('funnel_name', oldName),
      supabase.from('funnel_configs').update({ funnel_name: n }).eq('funnel_name', oldName),
    ]);
    if (r1.error || r2.error) { toast.error('Erro ao renomear'); return; }
    setFunnelNames(prev => prev.map(fn => fn === oldName ? n : fn));
    setConfigs(prev => {
      const c = { ...prev };
      if (c[oldName]) { c[n] = { ...c[oldName], funnel_name: n }; delete c[oldName]; }
      return c;
    });
    setExpandedFunnels(prev => {
      const s = new Set(prev);
      if (s.has(oldName)) { s.delete(oldName); s.add(n); }
      return s;
    });
    setRenamingFunnel(null);
    toast.success('Funil renomeado!');
    loadFunnels();
  }

  async function handleDeleteFunnel(name: string) {
    await Promise.all([
      supabase.from('funnel_messages').delete().eq('funnel_name', name),
      supabase.from('funnel_configs').delete().eq('funnel_name', name),
    ]);
    setFunnelNames(prev => prev.filter(fn => fn !== name));
    setConfigs(prev => { const c = { ...prev }; delete c[name]; return c; });
    setExpandedFunnels(prev => { const s = new Set(prev); s.delete(name); return s; });
    setFunnelStats(prev => { const c = { ...prev }; delete c[name]; return c; });
    setDeletingFunnel(null);
    toast.success('Funil excluído!');
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const expandedFunnelList = Array.from(expandedFunnels);
  const activeFunnel = expandedFunnelList[expandedFunnelList.length - 1] ?? funnelNames[0] ?? '';

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funil de Lançamento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mensagens agendadas · WhatsApp via Evolution API
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar em lote
          </Button>
          <Button
            onClick={() => {
              const target = [...expandedFunnels][0] ?? funnelNames[0];
              if (target) openCreate(target);
              else toast.error('Crie um funil primeiro');
            }}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Nova Mensagem
          </Button>
        </div>
      </div>

      <Tabs defaultValue="funil">
        <TabsList className="bg-muted/40">
          <TabsTrigger value="funil" className="gap-1.5">
            <GitBranch className="h-4 w-4" /> Funil de Mensagens
          </TabsTrigger>
          <TabsTrigger value="rapido" className="gap-1.5">
            <Zap className="h-4 w-4" /> Envio Rápido
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" /> Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <Phone className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
        </TabsList>

        {/* ── FUNIL ────────────────────────────────────────────────────────── */}
        <TabsContent value="funil" className="mt-4 space-y-3">
          {/* New funnel input */}
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="Novo funil…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFunnel()}
              className="h-8 w-44 text-sm"
            />
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={createFunnel}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Funnel sections */}
          {funnelNames.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <GitBranch className="h-10 w-10 mx-auto opacity-25" />
              <p className="text-sm">Crie um funil para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {funnelNames.map(name => (
                <FunnelSection
                  key={name}
                  name={name}
                  stats={funnelStats[name] ?? { total: 0, sent: 0, scheduled: 0, draft: 0, error: 0 }}
                  expanded={expandedFunnels.has(name)}
                  config={configs[name] ?? EMPTY_CONFIG(name)}
                  refreshKey={refreshTick}
                  onToggle={() => toggleFunnel(name)}
                  onRename={() => setRenamingFunnel({ name, newName: name })}
                  onDeleteFunnel={() => setDeletingFunnel(name)}
                  onConfigure={() => { loadConfig(name); setConfigFunnel(name); setConfigOpen(true); }}
                  onCreateMessage={(maxDay) => openCreate(name, maxDay)}
                  onEditMessage={(msg) => openEdit(msg)}
                  onDeleteMessage={(id) => setDeleteTarget(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ENVIO RÁPIDO ─────────────────────────────────────────────────── */}
        <TabsContent value="rapido" className="mt-4">
          <div className="max-w-xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Envio avulso imediato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Message type */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Tipo de mensagem
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {(Object.entries(TYPE_CFG) as [MessageType, typeof TYPE_CFG[MessageType]][]).map(([t, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={t} type="button" onClick={() => setQMsgType(t)}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px] font-medium transition-all ${
                            qMsgType === t
                              ? 'bg-primary text-white border-primary'
                              : 'border-border text-foreground/70 hover:border-primary/40'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recipient */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Destinatário
                  </label>
                  <div className="flex gap-2 mb-2">
                    <RecipBtn active={qType === 'group'} icon={<Users className="h-4 w-4" />}
                      label="Grupo" onClick={() => setQType('group')} />
                    <RecipBtn active={qType === 'number'} icon={<Phone className="h-4 w-4" />}
                      label="Número" onClick={() => setQType('number')} />
                  </div>
                  <Input
                    placeholder={qType === 'group' ? '5511999999999@g.us' : '5511999999999'}
                    value={qRecip} onChange={e => setQRecip(e.target.value)}
                  />
                </div>

                {/* Type content */}
                <TypeContent
                  msgType={qMsgType} text={qText} onText={setQText}
                  url={qUrl} onUrl={setQUrl} caption={qCaption} onCaption={setQCaption}
                  pollName={qPollName} onPollName={setQPollName}
                  pollOpts={qPollOpts} onPollOpts={setQPollOpts}
                  varNames={[]}
                />

                {/* Feature toggles — always visible, large and clear */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Opções de envio
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <BigToggle
                      icon={<Eye className="h-4 w-4" />}
                      label="Preview do link"
                      desc="Mostrar card de pré-visualização"
                      value={qLinkPrev}
                      onChange={setQLinkPrev}
                      disabled={qMsgType !== 'text'}
                      color="blue"
                    />
                    <BigToggle
                      icon={<AtSign className="h-4 w-4" />}
                      label="Marcar @todos"
                      desc="Notifica todos os membros"
                      value={qMention}
                      onChange={setQMention}
                      disabled={qType !== 'group' || qMsgType === 'poll'}
                      color="amber"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleQuickSend}
                  disabled={sendingQ || !qRecip.trim()}
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                >
                  {sendingQ
                    ? <><Spinner small /> Enviando…</>
                    : <><Send className="h-4 w-4" /> Enviar agora</>}
                </Button>
              </CardContent>
            </Card>

            {/* Email avulso */}
            <QuickEmailCard />
          </div>
        </TabsContent>

        {/* ── EMAIL CONFIG ─────────────────────────────────────────────────── */}
        <TabsContent value="email" className="mt-4">
          <EmailConfigPanel />
        </TabsContent>

        {/* ── WHATSAPP ─────────────────────────────────────────────────────── */}
        <TabsContent value="whatsapp" className="mt-4">
          <div className="max-w-lg">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" /> WhatsApp — Funil
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EvolutionTaskPanel task="funil" label="Funil" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir mensagem?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename funnel dialog */}
      <Dialog open={!!renamingFunnel} onOpenChange={v => !v && setRenamingFunnel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renomear funil</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Novo nome</label>
            <Input
              value={renamingFunnel?.newName ?? ''}
              onChange={e => setRenamingFunnel(prev => prev ? { ...prev, newName: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && renamingFunnel && handleRenameFunnel(renamingFunnel.name, renamingFunnel.newName)}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenamingFunnel(null)}>Cancelar</Button>
            <Button onClick={() => renamingFunnel && handleRenameFunnel(renamingFunnel.name, renamingFunnel.newName)}
              className="bg-primary hover:bg-primary/90">
              Renomear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete funnel dialog */}
      <Dialog open={!!deletingFunnel} onOpenChange={v => !v && setDeletingFunnel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir funil?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso excluirá <strong>todas as mensagens</strong> do funil{' '}
            <strong>{deletingFunnel}</strong>. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingFunnel(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deletingFunnel && handleDeleteFunnel(deletingFunnel)}>
              Excluir funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit modal */}
      {(() => {
        const mc = configs[form.funnel_name] ?? EMPTY_CONFIG(form.funnel_name);
        const mHasHeader = !!(mc.imagem_manha || mc.imagem_tarde || mc.imagem_noite || Object.values(mc.imagens || {}).some(Boolean));
        const mVarNames = ['grupo_1', 'grupo_2', ...Object.keys(mc.variaveis || {})];
        const mImageSlots = IMAGE_SLOTS.filter(s => mc.imagens?.[s.key]);
        return (
          <MsgModal
            open={modalOpen} onClose={() => setModalOpen(false)}
            form={form} setForm={setForm} funnelNames={funnelNames}
            isEditing={!!editingId} saving={saving}
            varNames={mVarNames}
            hasHeaderImages={mHasHeader}
            imageSlots={mImageSlots}
            onDraft={() => handleSave('draft')}
            onSchedule={() => handleSave('scheduled')}
            onSendNow={handleSendNow}
          />
        );
      })()}

      {/* Bulk import */}
      <BulkImportModal
        open={bulkOpen} onClose={() => setBulkOpen(false)}
        currentFunnel={activeFunnel}
        onImported={() => loadFunnels()}
      />

      {/* Funnel config modal */}
      <FunnelConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        funnelName={configFunnel}
        initialConfig={configs[configFunnel] ?? EMPTY_CONFIG(configFunnel)}
        onSaved={cfg => {
          setConfigs(prev => ({ ...prev, [configFunnel]: cfg }));
          setConfigOpen(false);
          toast.success('Configurações salvas!');
        }}
      />
    </div>
  );
}

// ── BigToggle — opções de envio visíveis e clicáveis ──────────────────────────

function BigToggle({
  icon, label, desc, value, onChange, disabled, color,
}: {
  icon: React.ReactNode; label: string; desc: string;
  value: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; color: 'blue' | 'amber';
}) {
  const colorMap = {
    blue:  { on: 'border-blue-400 bg-blue-50 text-blue-700',  off: 'border-border bg-background text-muted-foreground' },
    amber: { on: 'border-amber-400 bg-amber-50 text-amber-700', off: 'border-border bg-background text-muted-foreground' },
  };
  const cls = disabled
    ? 'border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed'
    : value ? colorMap[color].on : colorMap[color].off;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all select-none flex-1 min-w-[160px] ${cls}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <div className="text-left flex-1">
        <div className="font-semibold text-sm leading-none mb-0.5">{label}</div>
        <div className="text-[11px] opacity-70 leading-none">{desc}</div>
      </div>
      <Switch
        checked={value && !disabled}
        onCheckedChange={v => !disabled && onChange(v)}
        className="pointer-events-none flex-shrink-0"
        onClick={e => e.stopPropagation()}
      />
    </button>
  );
}

// ── Type-specific content area ─────────────────────────────────────────────────

function TypeContent({
  msgType, text, onText, url, onUrl, caption, onCaption,
  pollName, onPollName, pollOpts, onPollOpts, varNames,
}: {
  msgType: MessageType;
  text: string; onText: (v: string) => void;
  url: string; onUrl: (v: string) => void;
  caption: string; onCaption: (v: string) => void;
  pollName: string; onPollName: (v: string) => void;
  pollOpts: string[]; onPollOpts: (v: string[]) => void;
  varNames: string[];
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(name: string, setter: (v: string) => void, current: string) {
    const el = textRef.current;
    const tag = `{{${name}}}`;
    if (el) {
      const start = el.selectionStart ?? current.length;
      const end   = el.selectionEnd   ?? current.length;
      const next  = current.slice(0, start) + tag + current.slice(end);
      setter(next);
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + tag.length; el.focus(); }, 0);
    } else {
      setter(current + tag);
    }
  }

  if (msgType === 'text') {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mensagem</label>
        {varNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {varNames.map(v => (
              <button
                key={v} type="button"
                onClick={() => insertVar(v, onText, text)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                title={`Inserir {{${v}}}`}
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textRef}
          placeholder="Digite sua mensagem…"
          value={text}
          onChange={e => onText(e.target.value)}
          rows={5}
        />
        <p className="text-xs text-muted-foreground mt-1 text-right">{text.length} chars</p>
      </div>
    );
  }
  if (msgType === 'poll') {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título da enquete</label>
          <Input placeholder="Ex: Qual sua maior dificuldade?" value={pollName} onChange={e => onPollName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Opções</label>
          {pollOpts.map((opt, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5">
              <span className="w-5 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">{i + 1}</span>
              <Input placeholder={`Opção ${i + 1}`} value={opt}
                onChange={e => { const n = [...pollOpts]; n[i] = e.target.value; onPollOpts(n); }} />
              {pollOpts.length > 2 && (
                <Button size="icon" variant="ghost" className="h-9 w-9 flex-shrink-0"
                  onClick={() => onPollOpts(pollOpts.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {pollOpts.length < 12 && (
            <Button size="sm" variant="outline" className="w-full text-xs mt-1"
              onClick={() => onPollOpts([...pollOpts, ''])}>
              <Plus className="h-3 w-3 mr-1.5" /> Adicionar opção
            </Button>
          )}
        </div>
      </div>
    );
  }
  // media
  const labels: Record<string, string> = { image: 'imagem', video: 'vídeo', audio: 'áudio', document: 'documento' };
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          URL {labels[msgType] ? `da ${labels[msgType]}` : 'da mídia'}
        </label>
        {varNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {varNames.map(v => (
              <button
                key={v} type="button"
                onClick={() => { /* for url field we just set the whole value */ onUrl(`{{${v}}}`); }}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}
        <Input placeholder="https://exemplo.com/arquivo" value={url} onChange={e => onUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground mt-1">URL pública acessível pela Evolution API</p>
      </div>
      {msgType !== 'audio' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Legenda (opcional)</label>
          <Textarea placeholder="Legenda da mídia…" value={caption} onChange={e => onCaption(e.target.value)} rows={3} />
        </div>
      )}
    </div>
  );
}

// ── Small atoms ────────────────────────────────────────────────────────────────

function Spinner({ small }: { small?: boolean }) {
  return (
    <div className={`animate-spin rounded-full border-b-2 border-white flex-shrink-0 ${small ? 'h-3.5 w-3.5' : 'h-5 w-5'}`} />
  );
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold leading-none ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function RecipBtn({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${
        active ? 'bg-primary text-white border-primary' : 'border-border text-foreground/70 hover:border-primary/40'
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ── Message Card ───────────────────────────────────────────────────────────────

function MsgCard({ msg, imagens, onEdit, onDelete }: {
  msg: FunnelMessage; imagens: Record<string, string>;
  onEdit: () => void; onDelete: () => void;
}) {
  const sc  = STATUS_CFG[msg.status];
  const tc  = TYPE_CFG[msg.message_type || 'text'];
  const SI  = sc.icon;
  const TI  = tc.icon;
  const preview =
    msg.message_type === 'poll'  ? `📊 ${msg.poll_name || ''}` :
    msg.message_type === 'audio' ? '🎵 Mensagem de áudio' :
    msg.message_text             ? msg.message_text :
    msg.media_url                ? msg.media_url : '—';

  const headerSlot  = msg.subtipo ? IMAGE_SLOTS.find(s => s.key === msg.subtipo) : null;
  const headerUrl   = msg.subtipo ? imagens[msg.subtipo] : null;
  const headerThumb = headerUrl
    ? `https://lh3.googleusercontent.com/d/${headerUrl.match(/id=([^&]+)/)?.[1]}=w120`
    : null;

  return (
    <Card className="hover:shadow-sm transition-shadow group cursor-pointer" onClick={onEdit}>
      <CardContent className="pt-3 pb-3 px-4">
        {/* Header image preview strip */}
        {msg.send_header_image && headerThumb && (
          <div className="relative -mx-4 -mt-3 mb-2 h-16 overflow-hidden rounded-t-lg bg-muted/30">
            <img
              src={headerThumb}
              alt={headerSlot?.label ?? msg.subtipo ?? ''}
              className="w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
              <span className="text-[10px] text-white font-semibold">
                {headerSlot?.label ?? msg.subtipo}
              </span>
            </div>
          </div>
        )}

        {/* Time + type row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{fmtTime(msg.scheduled_at)}</span>
            <TI className={`h-3 w-3 ml-1 ${tc.color}`} />
          </div>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 flex items-center ${sc.badge}`}>
            <SI className="h-2.5 w-2.5" />
            {sc.label}
          </Badge>
        </div>

        {/* Preview */}
        <p className="text-sm text-foreground line-clamp-2 mb-2 min-h-[2.5rem]">{preview}</p>

        {/* Feature + header badges */}
        {(msg.link_preview || msg.mention_everyone || (msg.send_header_image && !headerThumb) ||
          (msg.message_type === 'poll' && msg.poll_options)) && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {msg.send_header_image && !headerThumb && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100 flex items-center gap-0.5">
                <Image className="h-2.5 w-2.5" />
                {msg.subtipo
                  ? IMAGE_SLOTS.find(s => s.key === msg.subtipo)?.label ?? msg.subtipo
                  : 'header'}
              </span>
            )}
            {msg.link_preview && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-0.5">
                <Eye className="h-2.5 w-2.5" /> preview
              </span>
            )}
            {msg.mention_everyone && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-0.5">
                <AtSign className="h-2.5 w-2.5" /> @todos
              </span>
            )}
            {msg.message_type === 'poll' && msg.poll_options && (
              <span className="text-[10px] text-muted-foreground">
                {msg.poll_options.length} opções
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            {msg.recipient_type === 'group'
              ? <Users className="h-3 w-3 flex-shrink-0" />
              : <Phone className="h-3 w-3 flex-shrink-0" />}
            <span className="truncate max-w-[100px]">{msg.recipient_id}</span>
          </div>
          <div
            className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}
          >
            <button className="p-1 rounded hover:text-primary" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button className="p-1 rounded hover:text-red-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {msg.status === 'error' && msg.error_message && (
          <p className="text-[11px] text-red-600 mt-1.5 line-clamp-1">{msg.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Message Modal ──────────────────────────────────────────────────────────────

interface MsgModalProps {
  open: boolean; onClose: () => void;
  form: MsgForm; setForm: (f: MsgForm) => void;
  funnelNames: string[]; isEditing: boolean; saving: boolean;
  varNames: string[]; hasHeaderImages: boolean;
  imageSlots: ImageSlot[];
  onDraft: () => void; onSchedule: () => void; onSendNow: () => void;
}

function MsgModal({
  open, onClose, form, setForm, funnelNames,
  isEditing, saving, varNames, hasHeaderImages,
  imageSlots,
  onDraft, onSchedule, onSendNow,
}: MsgModalProps) {
  const set = <K extends keyof MsgForm>(k: K, v: MsgForm[K]) => setForm({ ...form, [k]: v });

  const showLinkPreview = form.message_type === 'text';
  const showMention    = form.recipient_type === 'group' && form.message_type !== 'poll';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar mensagem' : 'Nova mensagem'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ─ Message type ─ */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo de mensagem</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(Object.entries(TYPE_CFG) as [MessageType, typeof TYPE_CFG[MessageType]][]).map(([t, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={t} type="button" onClick={() => set('message_type', t)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-all ${
                      form.message_type === t
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'border-border text-foreground/70 hover:border-primary/40 hover:bg-primary/3'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─ Funnel + schedule ─ */}
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
            <div className="sm:col-span-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Funil</label>
              {funnelNames.length > 0 && (
                <Select value={form.funnel_name} onValueChange={v => set('funnel_name', v)}>
                  <SelectTrigger className="mb-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {funnelNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Input placeholder="Ou nome do novo funil" value={form.funnel_name}
                onChange={e => set('funnel_name', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Dia</label>
              <Input type="number" min={1} value={form.day_number}
                onChange={e => set('day_number', parseInt(e.target.value) || 1)} />
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data</label>
              <Input type="date" value={form.scheduled_date}
                onChange={e => set('scheduled_date', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Hora</label>
              <Input type="time" value={form.scheduled_time}
                onChange={e => set('scheduled_time', e.target.value)} />
            </div>
          </div>

          {/* ─ Recipient ─ */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Destinatário</label>
            <div className="flex gap-2 mb-2">
              <RecipBtn active={form.recipient_type === 'group'} icon={<Users className="h-3.5 w-3.5" />}
                label="Grupo" onClick={() => set('recipient_type', 'group')} />
              <RecipBtn active={form.recipient_type === 'number'} icon={<Phone className="h-3.5 w-3.5" />}
                label="Número" onClick={() => set('recipient_type', 'number')} />
            </div>
            <Input
              placeholder={form.recipient_type === 'group' ? '{{grupo_1}} ou 5511999999999@g.us' : '5511999999999'}
              value={form.recipient_id}
              onChange={e => set('recipient_id', e.target.value)}
            />
            {form.recipient_type === 'group' && varNames.filter(v => v.startsWith('grupo')).length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {varNames.filter(v => v.startsWith('grupo')).map(v => (
                  <button
                    key={v} type="button"
                    onClick={() => set('recipient_id', `{{${v}}}`)}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Use <code className="text-[10px] bg-muted px-1 rounded">{'{{grupo_1}}'}</code> ou{' '}
              <code className="text-[10px] bg-muted px-1 rounded">{'{{grupo_2}}'}</code> para grupos configurados no funil
            </p>
          </div>

          {/* ─ Content by type ─ */}
          {form.message_type === 'text' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mensagem</label>
              {varNames.length > 0 && (
                <VarChips names={varNames} onInsert={tag => set('message_text', form.message_text + tag)} />
              )}
              <Textarea placeholder="Digite a mensagem… use {{link_aula_1}} para inserir variáveis"
                value={form.message_text}
                onChange={e => set('message_text', e.target.value)} rows={6} />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {form.message_text.length} caracteres
              </p>
            </div>
          )}

          {['image', 'video', 'audio', 'document'].includes(form.message_type) && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  URL da {form.message_type === 'image' ? 'imagem' :
                          form.message_type === 'video' ? 'vídeo' :
                          form.message_type === 'audio' ? 'áudio' : 'documento'}
                </label>
                {varNames.length > 0 && (
                  <VarChips names={varNames} onInsert={tag => set('media_url', tag)} />
                )}
                <Input placeholder="https://exemplo.com/arquivo ou {{link_video_1}}"
                  value={form.media_url}
                  onChange={e => set('media_url', e.target.value)} />
              </div>
              {form.message_type !== 'audio' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Legenda (opcional)</label>
                  <Textarea placeholder="Legenda da mídia…" value={form.message_text}
                    onChange={e => set('message_text', e.target.value)} rows={3} />
                </div>
              )}
            </div>
          )}

          {form.message_type === 'poll' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título da enquete</label>
                <Input placeholder="Ex: Qual é sua maior dificuldade?" value={form.poll_name}
                  onChange={e => set('poll_name', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Opções <span className="text-muted-foreground/60">({form.poll_options.length}/12)</span>
                </label>
                {form.poll_options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-5 text-center text-xs text-muted-foreground flex-shrink-0">{i + 1}</span>
                    <Input placeholder={`Opção ${i + 1}`} value={opt}
                      onChange={e => {
                        const n = [...form.poll_options]; n[i] = e.target.value; set('poll_options', n);
                      }} />
                    {form.poll_options.length > 2 && (
                      <Button size="icon" variant="ghost" className="h-9 w-9 flex-shrink-0"
                        onClick={() => set('poll_options', form.poll_options.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.poll_options.length < 12 && (
                  <Button size="sm" variant="outline" className="w-full text-xs mt-1"
                    onClick={() => set('poll_options', [...form.poll_options, ''])}>
                    <Plus className="h-3 w-3 mr-1.5" /> Adicionar opção
                  </Button>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Respostas</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => set('poll_selectable_count', 1)}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                      form.poll_selectable_count === 1
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-foreground/70 hover:border-primary/40'
                    }`}>Única</button>
                  <button type="button"
                    onClick={() => set('poll_selectable_count', Math.max(2, form.poll_options.filter(Boolean).length))}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                      form.poll_selectable_count > 1
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-foreground/70 hover:border-primary/40'
                    }`}>Múltipla</button>
                </div>
              </div>
            </div>
          )}

          {/* ─ Opções de envio — seção destacada e sempre visível ─ */}
          <div className="rounded-xl border-2 border-border/60 bg-muted/10 p-4 space-y-3">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" /> Opções de envio
            </p>

            <div className="grid gap-2">
              <BigToggle
                icon={<Eye className="h-4 w-4" />}
                label="Preview do link"
                desc="WhatsApp mostra card de pré-visualização do link"
                value={form.link_preview}
                onChange={v => set('link_preview', v)}
                disabled={!showLinkPreview}
                color="blue"
              />
              <BigToggle
                icon={<AtSign className="h-4 w-4" />}
                label="Marcar @todos no grupo"
                desc="Todos os membros recebem notificação"
                value={form.mention_everyone}
                onChange={v => set('mention_everyone', v)}
                disabled={!showMention}
                color="amber"
              />
              <BigToggle
                icon={<Image className="h-4 w-4" />}
                label="Imagem de cabeçalho"
                desc={hasHeaderImages ? 'Envia imagem antes desta mensagem' : 'Configure imagens em "Configurar funil"'}
                value={form.send_header_image && hasHeaderImages}
                onChange={v => set('send_header_image', hasHeaderImages ? v : false)}
                disabled={!hasHeaderImages}
                color="blue"
              />
              {form.send_header_image && hasHeaderImages && imageSlots.length > 0 && (
                <div className="w-full space-y-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Qual imagem enviar?
                    </label>
                    <Select value={form.subtipo || '__auto__'} onValueChange={v => set('subtipo', v === '__auto__' ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecione a imagem" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">
                          <span className="text-muted-foreground">Automático (por horário)</span>
                        </SelectItem>
                        {imageSlots.map(s => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <BigToggle
                    icon={<Image className="h-4 w-4" />}
                    label="Trocar foto do grupo"
                    desc="Atualiza a foto do grupo WhatsApp para esta imagem"
                    value={form.recipient_type === 'group' && form.update_group_picture}
                    onChange={v => set('update_group_picture', v)}
                    disabled={form.recipient_type !== 'group' || !form.subtipo}
                    color="blue"
                  />
                </div>
              )}
            </div>

            {!showLinkPreview && (
              <p className="text-[11px] text-muted-foreground">
                Preview de link disponível apenas para mensagens de texto
              </p>
            )}
            {!showMention && (
              <p className="text-[11px] text-muted-foreground">
                @todos disponível apenas para grupos (exceto enquetes)
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onSendNow} disabled={saving} className="gap-2 sm:mr-auto">
            {saving ? <><Spinner small /> Enviando…</> : <><Send className="h-4 w-4" /> Enviar agora</>}
          </Button>
          <Button variant="outline" onClick={onDraft} disabled={saving}>Rascunho</Button>
          <Button onClick={onSchedule} disabled={saving} className="bg-primary hover:bg-primary/90 gap-2">
            {saving ? <Spinner small /> : <Calendar className="h-4 w-4" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── VarChips ─────────────────────────────────────────────────────────────────

function VarChips({ names, onInsert }: { names: string[]; onInsert: (tag: string) => void }) {
  if (!names.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
        <Variable className="h-2.5 w-2.5" /> Inserir:
      </span>
      {names.map(v => (
        <button
          key={v} type="button"
          onClick={() => onInsert(`{{${v}}}`)}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
          title={`Inserir {{${v}}}`}
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

// ── Funnel Config Modal ────────────────────────────────────────────────────────

// ── Aula date helpers ─────────────────────────────────────────────────────────

function aulaDateToInput(stored: string): string {
  // stored = "26/05" → try to convert to "2026-05-26" for date input
  const m = stored.match(/^(\d{1,2})\/(\d{2})(?:\/(\d{4}))?$/);
  if (!m) return '';
  const day = m[1].padStart(2, '0');
  const mon = m[2];
  const yr  = m[3] ?? String(new Date().getFullYear());
  return `${yr}-${mon}-${day}`;
}

function aulaInputToDisplay(inputVal: string): string {
  try { return format(parseISO(inputVal), 'dd/MM'); } catch { return inputVal; }
}

type AulaEntry = { data: string; link: string }; // data = "2026-05-26" (date input format)

function FunnelConfigModal({
  open, onClose, funnelName, initialConfig, onSaved,
}: {
  open: boolean; onClose: () => void;
  funnelName: string;
  initialConfig: FunnelConfig;
  onSaved: (cfg: FunnelConfig) => void;
}) {
  const [cfg,     setCfg]     = useState<FunnelConfig>(initialConfig);
  const [saving,  setSaving]  = useState(false);
  const [newVarK, setNewVarK] = useState('');
  const [newVarV, setNewVarV] = useState('');
  const [aulas,   setAulas]   = useState<AulaEntry[]>([{ data: '', link: '' }]);

  useEffect(() => {
    setCfg(initialConfig);
    // Extract aula entries from variaveis
    const vars = (initialConfig.variaveis as Record<string, string>) || {};
    const entries: AulaEntry[] = [];
    let i = 1;
    while (vars[`data_aula_${i}`] !== undefined || vars[`link_aula_${i}`] !== undefined) {
      entries.push({
        data: aulaDateToInput(vars[`data_aula_${i}`] ?? ''),
        link: vars[`link_aula_${i}`] ?? '',
      });
      i++;
    }
    setAulas(entries.length > 0 ? entries : [{ data: '', link: '' }]);
  }, [initialConfig, open]);

  const setField = <K extends keyof FunnelConfig>(k: K, v: FunnelConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  function addVar() {
    const k = newVarK.trim().replace(/\s+/g, '_').toLowerCase();
    if (!k) return;
    setCfg(prev => ({ ...prev, variaveis: { ...prev.variaveis, [k]: newVarV.trim() } }));
    setNewVarK(''); setNewVarV('');
  }

  function removeVar(k: string) {
    setCfg(prev => {
      const v = { ...prev.variaveis };
      delete v[k];
      return { ...prev, variaveis: v };
    });
  }

  function applyPresets() {
    setCfg(prev => ({ ...prev, imagens: { ...PRESET_DRIVE_URLS } }));
    toast.success('Presets do Drive aplicados! Salve para confirmar.');
  }

  function setImagem(key: string, url: string) {
    setCfg(prev => ({ ...prev, imagens: { ...prev.imagens, [key]: url } }));
  }

  async function handleSave() {
    setSaving(true);
    // Merge aulas into variaveis (remove stale aula_* keys then add current ones)
    const varSansAulas = Object.fromEntries(
      Object.entries(cfg.variaveis).filter(([k]) => !/^(data|link)_aula_\d+$/.test(k))
    );
    const aulaVars: Record<string, string> = {};
    aulas.forEach((a, i) => {
      if (a.data) aulaVars[`data_aula_${i + 1}`] = aulaInputToDisplay(a.data);
      if (a.link) aulaVars[`link_aula_${i + 1}`] = a.link;
    });
    const finalVars = { ...varSansAulas, ...aulaVars };

    const payload = {
      funnel_name:   funnelName,
      grupo_1_id:    cfg.grupo_1_id,
      grupo_2_id:    cfg.grupo_2_id,
      imagem_manha:  cfg.imagens['manha'] || cfg.imagem_manha,
      imagem_tarde:  cfg.imagens['tarde'] || cfg.imagem_tarde,
      imagem_noite:  cfg.imagens['noite'] || cfg.imagem_noite,
      variaveis:     finalVars,
      imagens:       cfg.imagens,
    };
    const { error } = await supabase
      .from('funnel_configs')
      .upsert(payload, { onConflict: 'funnel_name' });
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    onSaved({ ...cfg, variaveis: finalVars, imagem_manha: payload.imagem_manha, imagem_tarde: payload.imagem_tarde, imagem_noite: payload.imagem_noite });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Configurações: {funnelName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-1">
          {/* Grupos */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Grupos WhatsApp
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Grupo 1 <code className="text-amber-600 bg-amber-50 px-1 rounded text-[10px]">{'{{grupo_1}}'}</code>
                </label>
                <Input
                  placeholder="5511999999999@g.us"
                  value={cfg.grupo_1_id}
                  onChange={e => setField('grupo_1_id', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Grupo 2 <code className="text-amber-600 bg-amber-50 px-1 rounded text-[10px]">{'{{grupo_2}}'}</code>
                </label>
                <Input
                  placeholder="5511999999999@g.us (opcional)"
                  value={cfg.grupo_2_id}
                  onChange={e => setField('grupo_2_id', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Use <code className="bg-muted px-1 rounded text-[10px]">{'{{grupo_1}}'}</code> como destinatário nas mensagens
            </p>
          </div>

          {/* Aulas — datas e links */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Aulas
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => setAulas(prev => [...prev, { data: '', link: '' }])}>
                <Plus className="h-3 w-3" /> Adicionar aula
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Datas e links das aulas ficam disponíveis como{' '}
              <code className="bg-muted px-1 rounded">{'{{data_aula_1}}'}</code>,{' '}
              <code className="bg-muted px-1 rounded">{'{{link_aula_1}}'}</code> etc. nas mensagens.
            </p>
            <div className="space-y-2">
              {aulas.map((aula, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0 text-right">
                    Aula {i + 1}
                  </span>
                  <Input
                    type="date"
                    className="h-8 text-xs w-36 shrink-0"
                    value={aula.data}
                    onChange={e => setAulas(prev => prev.map((a, j) => j === i ? { ...a, data: e.target.value } : a))}
                  />
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Link da aula (opcional)"
                    value={aula.link}
                    onChange={e => setAulas(prev => prev.map((a, j) => j === i ? { ...a, link: e.target.value } : a))}
                  />
                  {aula.data && (
                    <span className="text-[10px] text-emerald-600 font-medium shrink-0 w-12 text-center">
                      {aulaInputToDisplay(aula.data)}
                    </span>
                  )}
                  {aulas.length > 1 && (
                    <button type="button"
                      onClick={() => setAulas(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 rounded hover:text-red-600 text-muted-foreground shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Imagens de cabeçalho */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" /> Imagens de cabeçalho
              </p>
              <Button size="sm" variant="outline"
                className="h-7 text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={applyPresets}>
                <Download className="h-3 w-3" /> Aplicar presets Drive
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              O sistema envia a imagem correspondente ao <em>subtipo</em> da mensagem antes do conteúdo principal.
              Clique em <strong>Aplicar presets</strong> para preencher automaticamente com as peças do Drive.
            </p>

            {SLOT_GROUPS.map(group => (
              <div key={group} className="mb-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{group}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {IMAGE_SLOTS.filter(s => s.group === group).map(slot => {
                    const currentUrl = cfg.imagens?.[slot.key] || '';
                    const thumbSrc   = currentUrl || DRIVE_THUMB(slot.driveId);
                    return (
                      <div key={slot.key} className="rounded-lg border overflow-hidden bg-muted/10">
                        <div className="relative aspect-video bg-muted/30 overflow-hidden">
                          <img
                            src={thumbSrc}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                          {currentUrl && (
                            <span className="absolute top-1 right-1 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                              OK
                            </span>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] font-semibold text-foreground mb-1">{slot.label}</p>
                          <p className="text-[10px] text-muted-foreground mb-1.5">{slot.hint}</p>
                          <Input
                            className="h-6 text-[10px] px-1.5"
                            placeholder="URL ou deixe vazio para preset"
                            value={currentUrl}
                            onChange={e => setImagem(slot.key, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Variáveis customizadas */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Links e variáveis
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Adicione links das aulas, vídeos ou qualquer valor que vá mudar por lançamento.
              Use <code className="bg-muted px-1 rounded text-[10px]">{'{{nome_da_variavel}}'}</code> nas mensagens.
            </p>

            {Object.entries(cfg.variaveis).filter(([k]) => !/^(data|link)_aula_\d+$/.test(k)).length > 0 && (
              <div className="rounded-lg border divide-y mb-3">
                {Object.entries(cfg.variaveis).filter(([k]) => !/^(data|link)_aula_\d+$/.test(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 px-3 py-2">
                    <code className="text-[11px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded min-w-[100px] flex-shrink-0">
                      {`{{${k}}}`}
                    </code>
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="Valor / URL"
                      value={v}
                      onChange={e => setCfg(prev => ({
                        ...prev,
                        variaveis: { ...prev.variaveis, [k]: e.target.value },
                      }))}
                    />
                    <button type="button" onClick={() => removeVar(k)}
                      className="p-1 rounded hover:text-red-600 text-muted-foreground flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                className="h-8 text-xs w-40"
                placeholder="nome_da_var (ex: link_aula_1)"
                value={newVarK}
                onChange={e => setNewVarK(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addVar()}
              />
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Valor / URL"
                value={newVarV}
                onChange={e => setNewVarV(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addVar()}
              />
              <Button size="sm" variant="outline" className="h-8 px-2 flex-shrink-0" onClick={addVar}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Pode deixar o valor em branco agora e preencher depois — a mensagem não será agendada enquanto tiver variáveis vazias.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-2">
            {saving ? <Spinner small /> : null}
            Salvar configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Native format helpers ──────────────────────────────────────────────────────

function parseNativeDate(dataStr: string): Date {
  const match = dataStr.match(/(\d{1,2})\/(\d{2})/);
  if (!match) return new Date();
  const day   = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const now   = new Date();
  const d     = new Date(now.getFullYear(), month, day);
  if (d.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) d.setFullYear(now.getFullYear() + 1);
  return d;
}

function parseNativeHorario(horario: string): { h: number; m: number } {
  // "9h", "9h30", "20h00"
  let m = horario.match(/(\d+)h(\d*)/i);
  if (m) return { h: parseInt(m[1]), m: m[2] ? parseInt(m[2]) : 0 };
  // "09:00", "20:30"
  m = horario.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return { h: parseInt(m[1]), m: parseInt(m[2]) };
  // "9", "20" (só horas)
  m = horario.match(/^(\d{1,2})$/);
  if (m) return { h: parseInt(m[1]), m: 0 };
  return { h: 9, m: 0 };
}

function getNativeSubtipo(tipo: string, label: string): string {
  const l = label.toLowerCase();
  if (tipo === 'contagem') {
    if (l.includes('3')) return 'contagem_3h';
    if (l.includes('2')) return 'contagem_2h';
    return 'contagem_1h';
  }
  if (tipo === 'contagem_dia') {
    const match = l.match(/(\d+)/);
    if (match) return `contagem_dia_${match[1]}`;
    return 'contagem_dia_1';
  }
  if (tipo === 'live' || tipo === 'ao_vivo') return 'ao_vivo';
  return tipo;
}

function parseNativeMessages(items: Record<string, unknown>[], funnelName: string): Record<string, unknown>[] {
  const dateBases = items.map(item => {
    const d = parseNativeDate((item.data as string) || '');
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const minTs  = Math.min(...dateBases.map(d => d.getTime()));
  const result: Record<string, unknown>[] = [];

  items.forEach((item, idx) => {
    const msgDate         = parseNativeDate((item.data as string) || '');
    const { h, m }        = parseNativeHorario((item.horario as string) || '');
    msgDate.setHours(h, m, 0, 0);
    const dayNumber       = Math.round((dateBases[idx].getTime() - minTs) / 86400000) + 1;
    const tipo            = (item.tipo as string) || 'manha';
    const label           = (item.label as string) || '';
    const grupo           = (item.grupo as string) || '{{grupo_1}}';
    const recType         = grupo.includes('@g.us') || grupo.startsWith('{{') ? 'group' : 'number';
    const subtipo         = getNativeSubtipo(tipo, label);
    const sendHeaderImage = shouldSendHeaderImage('text', subtipo, h, m);

    const base = {
      funnel_name: funnelName || 'Funil',
      day_number: dayNumber,
      recipient_type: recType,
      recipient_id: grupo,
      link_preview: false,
      mention_everyone: true,
      send_header_image: sendHeaderImage,
      subtipo,
      status: 'draft',
    };

    if (tipo === 'enquete') {
      const enquete = (item.enquete as { titulo?: string; opcoes?: string[] }) ?? {};
      if (item.textoPrincipal) {
        result.push({ ...base, scheduled_at: msgDate.toISOString(),
          send_header_image: false,
          message_type: 'text', message_text: item.textoPrincipal,
          media_url: null, poll_name: null, poll_options: null, poll_selectable_count: 1 });
      }
      const pollTime = new Date(msgDate.getTime() + 3 * 60 * 1000);
      result.push({ ...base, scheduled_at: pollTime.toISOString(), send_header_image: false, subtipo: 'enquete',
        message_type: 'poll', message_text: '', media_url: null,
        poll_name: enquete.titulo || '', poll_options: enquete.opcoes || [],
        poll_selectable_count: 1 });
    } else if (tipo === 'audio' && !item.url_midia) {
      if (item.texto) {
        result.push({ ...base, scheduled_at: msgDate.toISOString(),
          message_type: 'text', message_text: item.texto,
          media_url: null, poll_name: null, poll_options: null, poll_selectable_count: 1 });
      }
      const audioTime = item.texto ? new Date(msgDate.getTime() + 3 * 60 * 1000) : msgDate;
      result.push({ ...base, scheduled_at: audioTime.toISOString(), send_header_image: false, subtipo: 'audio',
        message_type: 'audio', message_text: '', media_url: '{{audio_rodrygo_1}}',
        poll_name: null, poll_options: null, poll_selectable_count: 1 });
    } else {
      result.push({ ...base, scheduled_at: msgDate.toISOString(),
        message_type: tipo === 'audio' ? 'audio' : 'text',
        message_text: (item.texto as string) || '',
        media_url: (item.url_midia as string) || null,
        poll_name: null, poll_options: null, poll_selectable_count: 1 });
    }
  });

  return result;
}

// ── FunnelSection ─────────────────────────────────────────────────────────────

function FunnelSection({
  name, stats, expanded, config, refreshKey,
  onToggle, onRename, onDeleteFunnel, onConfigure,
  onCreateMessage, onEditMessage, onDeleteMessage,
}: {
  name: string;
  stats: FunnelStats;
  expanded: boolean;
  config: FunnelConfig;
  refreshKey?: number;
  onToggle: () => void;
  onRename: () => void;
  onDeleteFunnel: () => void;
  onConfigure: () => void;
  onCreateMessage: (maxDay?: number) => void;
  onEditMessage: (msg: FunnelMessage) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [messages, setMessages] = useState<FunnelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentDayIdx, setCurrentDayIdx] = useState(0);
  const [schedulingDay, setSchedulingDay] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('funnel_messages').select('*')
      .eq('funnel_name', name)
      .order('scheduled_at', { ascending: true });
    setMessages((data as FunnelMessage[]) || []);
    setLoading(false);
  }, [name]);

  useEffect(() => {
    if (!expanded) return;
    loadMessages();
  }, [expanded, loadMessages, refreshKey]);

  useEffect(() => {
    if (!expanded) return;
    const ch = supabase.channel(`funil_sec_${name}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funnel_messages' }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [expanded, name, loadMessages]);

  const byDay = useMemo(() => {
    const map = new Map<number, FunnelMessage[]>();
    for (const m of messages) {
      const arr = map.get(m.day_number) ?? [];
      arr.push(m);
      map.set(m.day_number, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [messages]);

  // Jump to today (or nearest future day) when messages first load
  useEffect(() => {
    if (byDay.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const idx = byDay.findIndex(([, msgs]) => (msgs[0]?.scheduled_at ?? '').slice(0, 10) >= todayStr);
    setCurrentDayIdx(idx >= 0 ? idx : 0);
  }, [byDay.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxDay = byDay.length > 0 ? byDay[byDay.length - 1][0] : 0;

  async function scheduleAllDay(dayMsgs: FunnelMessage[]) {
    const ids = dayMsgs.filter(m => m.status !== 'scheduled' && m.status !== 'sent').map(m => m.id);
    if (ids.length === 0) { toast.info('Todas as mensagens deste dia já estão agendadas'); return; }
    setSchedulingDay(true);
    const { error } = await supabase.from('funnel_messages').update({ status: 'scheduled' }).in('id', ids);
    setSchedulingDay(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success(`${ids.length} mensagem(ns) agendada(s)!`);
    loadMessages();
  }
  const progress = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;
  const hasHeaderImages = !!(
    config.imagem_manha || config.imagem_tarde || config.imagem_noite ||
    Object.values(config.imagens || {}).some(Boolean)
  );

  return (
    <Card className="overflow-hidden">
      {/* Header row — always visible */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
        onClick={onToggle}
      >
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </div>
        <span className="font-semibold text-foreground text-sm truncate min-w-0">{name}</span>
        <div className="flex items-center gap-3 ml-1 flex-shrink-0">
          <Chip label="Total"     value={stats.total}     color="text-foreground/70" />
          <Chip label="Enviadas"  value={stats.sent}      color="text-emerald-700" />
          <Chip label="Agendadas" value={stats.scheduled} color="text-blue-700" />
          {stats.error > 0 && <Chip label="Erros" value={stats.error} color="text-red-700" />}
        </div>
        <div className="flex-1 flex items-center gap-2 ml-2 min-w-0">
          <Progress value={progress} className="flex-1 h-1.5" />
          <span className="text-xs font-bold text-foreground/60 min-w-[36px] text-right">{progress}%</span>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-700"
            title="Configurar funil"
            onClick={onConfigure}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onCreateMessage(maxDay)}>
                <Plus className="h-4 w-4 mr-2" /> Nova mensagem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-4 w-4 mr-2" /> Renomear funil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDeleteFunnel} className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4 mr-2" /> Excluir funil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Config summary strip */}
      {expanded && (config.grupo_1_id || hasHeaderImages || Object.keys(config.variaveis).length > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs">
          <Variable className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
          {config.grupo_1_id && (
            <span className="text-amber-800">
              <span className="font-mono bg-amber-100 px-1 rounded">{'{{grupo_1}}'}</span>
              {' '}→ {config.grupo_1_id.slice(0, 20)}{config.grupo_1_id.length > 20 ? '…' : ''}
            </span>
          )}
          {config.grupo_2_id && (
            <span className="text-amber-800">
              <span className="font-mono bg-amber-100 px-1 rounded">{'{{grupo_2}}'}</span>
              {' '}→ {config.grupo_2_id.slice(0, 20)}{config.grupo_2_id.length > 20 ? '…' : ''}
            </span>
          )}
          {Object.entries(config.variaveis).map(([k, v]) => (
            <span key={k} className="text-amber-800">
              <span className="font-mono bg-amber-100 px-1 rounded">{`{{${k}}}`}</span>
              {v ? ` → ${v.slice(0, 20)}${v.length > 20 ? '…' : ''}` : <span className="text-red-500"> não preenchido</span>}
            </span>
          ))}
          {hasHeaderImages && (
            <span className="text-amber-700 flex items-center gap-1">
              <Image className="h-3 w-3" /> Imagens configuradas
            </span>
          )}
        </div>
      )}

      {/* Messages (expanded) */}
      {expanded && (
        <div className="border-t px-4 py-4 pb-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : byDay.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-2">
              <MessageSquare className="h-8 w-8 mx-auto opacity-25" />
              <p className="text-sm">Nenhuma mensagem neste funil</p>
              <Button variant="link" className="text-primary h-auto p-0" onClick={() => onCreateMessage()}>
                Criar primeira mensagem
              </Button>
            </div>
          ) : (() => {
            const safeIdx   = Math.min(currentDayIdx, byDay.length - 1);
            const [day, dayMsgs] = byDay[safeIdx];
            const firstDate = dayMsgs[0]?.scheduled_at;
            const todayStr  = new Date().toISOString().slice(0, 10);
            const isToday   = firstDate?.slice(0, 10) === todayStr;
            const scheduledCount = dayMsgs.filter(m => m.status === 'scheduled' || m.status === 'sent').length;
            const pendingCount   = dayMsgs.filter(m => m.status !== 'scheduled' && m.status !== 'sent').length;

            let dateLbl = '';
            try {
              dateLbl = format(parseISO(firstDate), "EEEE, dd 'de' MMMM", { locale: ptBR });
              dateLbl = dateLbl.charAt(0).toUpperCase() + dateLbl.slice(1);
            } catch { dateLbl = fmtDate(firstDate); }

            return (
              <div className="space-y-3">
                {/* Day navigator */}
                <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2.5">
                  <button
                    onClick={() => setCurrentDayIdx(i => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex-1 min-w-0 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-sm font-semibold truncate">{dateLbl}</p>
                      {isToday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold flex-shrink-0">
                          Hoje
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Dia {safeIdx + 1} de {byDay.length}
                      {' · '}
                      <span className={scheduledCount > 0 ? 'text-blue-600 font-medium' : ''}>
                        {scheduledCount} agendadas
                      </span>
                      {pendingCount > 0 && (
                        <span className="text-amber-600 font-medium"> · {pendingCount} rascunho</span>
                      )}
                    </p>
                  </div>

                  <button
                    onClick={() => setCurrentDayIdx(i => Math.min(byDay.length - 1, i + 1))}
                    disabled={safeIdx === byDay.length - 1}
                    className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2">
                  {pendingCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 flex-1"
                      disabled={schedulingDay}
                      onClick={() => scheduleAllDay(dayMsgs)}
                    >
                      {schedulingDay
                        ? <><div className="h-3 w-3 rounded-full border-b-2 border-blue-600 animate-spin" /> Agendando...</>
                        : <><Calendar className="h-3 w-3" /> Agendar todas do dia ({pendingCount})</>}
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs gap-1 text-primary hover:bg-primary/5 flex-shrink-0"
                    onClick={() => onCreateMessage(day)}
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>

                {/* Message grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                  {dayMsgs.map(msg => (
                    <MsgCard
                      key={msg.id}
                      msg={msg}
                      imagens={config.imagens ?? {}}
                      onEdit={() => onEditMessage(msg)}
                      onDelete={() => onDeleteMessage(msg.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Boas-vindas section — always visible when expanded */}
      {expanded && <BoasVindasSection funnelName={name} />}
    </Card>
  );
}

// ── Boas-Vindas Section ────────────────────────────────────────────────────────

interface BoasVindasCfg {
  id?: string;
  funnel_name: string;
  ativo: boolean;
  wpp_ativo: boolean;
  wpp_instance_name: string | null;
  wpp_mensagem: string;
  email_ativo: boolean;
  email_assunto: string;
  email_corpo: string;
  delay_minutos: number;
  delay_min_s: number;
  delay_max_s: number;
  daily_limit: number;
  safe_hour_start: number;
  safe_hour_end: number;
  max_errors_seq: number;
  pausado_por_erro: boolean;
  erros_seq: number;
}

interface BVLog {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  wpp_status: string;
  email_status: string;
  wpp_error: string | null;
  email_error: string | null;
  sent_at: string;
}

const EMPTY_BV = (funnel_name: string): BoasVindasCfg => ({
  funnel_name,
  ativo: false,
  wpp_ativo: true,
  wpp_instance_name: null,
  wpp_mensagem: 'Olá {{nome}}! 🎉\n\nSeja muito bem-vindo(a) à {{turma}}!\n\nEstamos super felizes em ter você conosco. Prepare-se para uma experiência incrível! 🚀',
  email_ativo: false,
  email_assunto: 'Boas-vindas à {{turma}}! 🎉',
  email_corpo: '<h2>Olá, {{nome}}! 👋</h2><p>Seja muito bem-vindo(a) à <strong>{{turma}}</strong>!</p><p>Estamos super felizes em ter você conosco.</p><p>Em breve você receberá mais informações.</p><p>Abraços,<br/>Equipe 11ds</p>',
  delay_minutos: 0,
  delay_min_s: 20,
  delay_max_s: 60,
  daily_limit: 150,
  safe_hour_start: 8,
  safe_hour_end: 21,
  max_errors_seq: 3,
  pausado_por_erro: false,
  erros_seq: 0,
});

const BV_VARS = ['nome', 'turma', 'whatsapp', 'email'];

function StatusDot({ status }: { status: string }) {
  if (status === 'sent')    return <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />;
  if (status === 'error')   return <XCircle     className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
  if (status === 'skipped') return <Minus       className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />;
  return null;
}

function BoasVindasSection({ funnelName }: { funnelName: string }) {
  const [open,      setOpen]      = useState(false);
  const [cfg,       setCfg]       = useState<BoasVindasCfg>(EMPTY_BV(funnelName));
  const [instances, setInstances] = useState<string[]>([]);
  const [logs,      setLogs]      = useState<BVLog[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [sending,   setSending]   = useState(false);
  const [sendNome,  setSendNome]  = useState('');
  const [sendWpp,   setSendWpp]   = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('boas_vindas_config').select('*').eq('funnel_name', funnelName).maybeSingle(),
      supabase.from('evolution_config').select('instance_name').eq('ativo', true).order('prioridade', { ascending: true }),
      supabase.from('boas_vindas_logs').select('*').eq('funnel_name', funnelName).order('sent_at', { ascending: false }).limit(10),
    ]).then(([{ data: bvData }, { data: evoData }, { data: logsData }]) => {
      if (bvData) setCfg(bvData as BoasVindasCfg);
      setInstances((evoData || []).map((r: { instance_name: string }) => r.instance_name));
      setLogs((logsData || []) as BVLog[]);
    });
  }, [open, funnelName]);

  async function saveCfg() {
    setSaving(true);
    const { error } = await supabase
      .from('boas_vindas_config')
      .upsert({ ...cfg, funnel_name: funnelName }, { onConflict: 'funnel_name' });
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Boas-vindas salvas!');
  }

  async function handleSend() {
    if (!sendWpp.trim() && !sendEmail.trim()) {
      toast.error('Informe WhatsApp ou Email do lead');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('boas-vindas-enviar', {
      body: { funnel_name: funnelName, nome: sendNome.trim(), whatsapp: sendWpp.trim(), email: sendEmail.trim() },
    });
    setSending(false);
    const err = error?.message ?? (data as any)?.error;
    if (err) { toast.error(`Erro: ${err}`); return; }

    const d = data as any;
    const parts: string[] = [];
    if (d?.wpp_status   === 'sent')  parts.push('WhatsApp ✓');
    if (d?.email_status === 'sent')  parts.push('Email ✓');
    if (d?.wpp_status   === 'error') parts.push(`WPP ✗ ${d.wpp_error ?? ''}`);
    if (d?.email_status === 'error') parts.push(`Email ✗ ${d.email_error ?? ''}`);
    toast.success(`Enviado: ${parts.join(' · ')}` || 'Boas-vindas enviadas!');

    setSendNome(''); setSendWpp(''); setSendEmail('');
    // Refresh logs
    const { data: newLogs } = await supabase
      .from('boas_vindas_logs').select('*').eq('funnel_name', funnelName)
      .order('sent_at', { ascending: false }).limit(10);
    setLogs((newLogs || []) as BVLog[]);
  }

  function insertVar(v: string) {
    const tag = `{{${v}}}`;
    const el = bodyRef.current;
    if (el) {
      const s = el.selectionStart ?? cfg.wpp_mensagem.length;
      const e = el.selectionEnd   ?? s;
      const next = cfg.wpp_mensagem.slice(0, s) + tag + cfg.wpp_mensagem.slice(e);
      setCfg(c => ({ ...c, wpp_mensagem: next }));
      setTimeout(() => { el.selectionStart = el.selectionEnd = s + tag.length; el.focus(); }, 0);
    } else {
      setCfg(c => ({ ...c, wpp_mensagem: c.wpp_mensagem + tag }));
    }
  }

  return (
    <div className="border-t border-border/40">
      {/* Collapsible header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
               : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
        <Heart className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">Boas-vindas</span>
        {cfg.ativo && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 font-medium">
            Ativo
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Toggle ativo */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <Switch
              checked={cfg.ativo}
              onCheckedChange={v => setCfg(c => ({ ...c, ativo: v }))}
            />
            <div>
              <p className="text-sm font-medium leading-none">Boas-vindas ativo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quando ativo, dispara automaticamente para novos leads deste funil
              </p>
            </div>
          </div>

          {/* WhatsApp config */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg.wpp_ativo}
                onCheckedChange={v => setCfg(c => ({ ...c, wpp_ativo: v }))}
              />
              <Phone className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold">WhatsApp</span>
            </div>

            {cfg.wpp_ativo && (
              <div className="pl-9 space-y-3">
                {/* Instance selector -- usada no envio de teste manual (botão "Enviar" abaixo) */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Instância (envio de teste manual)</label>
                  <Select
                    value={cfg.wpp_instance_name ?? '__auto__'}
                    onValueChange={v => setCfg(c => ({ ...c, wpp_instance_name: v === '__auto__' ? null : v }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto-prioridade (recomendado)</SelectItem>
                      {instances.map(inst => (
                        <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Instância da fila com anti-ban (compartilhada por todos os funis) */}
                <div className="p-3 rounded-lg border border-border bg-muted/10">
                  <EvolutionTaskPanel task="boas_vindas" label="Boas-vindas (fila)" />
                </div>

                {/* Aviso de pausa automática por erro sequencial */}
                {cfg.pausado_por_erro && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-red-800">Fila pausada automaticamente</p>
                      <p className="text-[11px] text-red-600">{cfg.erros_seq} erro(s) seguido(s) neste funil.</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => setCfg(c => ({ ...c, pausado_por_erro: false, erros_seq: 0 }))}>
                      Reativar
                    </Button>
                  </div>
                )}

                {/* Anti-ban da fila */}
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2.5">
                  <p className="text-xs font-semibold text-foreground">Anti-ban da fila</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Delay mín. (seg)</label>
                      <Input type="number" min={5} className="h-8 text-sm" value={cfg.delay_min_s}
                        onChange={e => setCfg(c => ({ ...c, delay_min_s: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Delay máx. (seg)</label>
                      <Input type="number" min={5} className="h-8 text-sm" value={cfg.delay_max_s}
                        onChange={e => setCfg(c => ({ ...c, delay_max_s: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Horário seguro</label>
                      <div className="flex items-center gap-1.5">
                        <Input type="number" min={0} max={23} className="h-8 text-sm" value={cfg.safe_hour_start}
                          onChange={e => setCfg(c => ({ ...c, safe_hour_start: Number(e.target.value) }))} />
                        <span className="text-xs text-muted-foreground">às</span>
                        <Input type="number" min={0} max={23} className="h-8 text-sm" value={cfg.safe_hour_end}
                          onChange={e => setCfg(c => ({ ...c, safe_hour_end: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Limite diário</label>
                      <Input type="number" min={1} className="h-8 text-sm" value={cfg.daily_limit}
                        onChange={e => setCfg(c => ({ ...c, daily_limit: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Pausar após N erros seguidos</label>
                    <Input type="number" min={1} className="h-8 text-sm w-24" value={cfg.max_errors_seq}
                      onChange={e => setCfg(c => ({ ...c, max_errors_seq: Number(e.target.value) }))} />
                  </div>
                </div>

                {/* Mensagem */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Mensagem</label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {BV_VARS.map(v => (
                      <button key={v} type="button" onClick={() => insertVar(v)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={cfg.wpp_mensagem}
                    onChange={e => setCfg(c => ({ ...c, wpp_mensagem: e.target.value }))}
                    rows={5}
                    className="text-sm font-mono"
                    placeholder="Mensagem de boas-vindas no WhatsApp..."
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{cfg.wpp_mensagem.length} chars</p>
                </div>
              </div>
            )}
          </div>

          {/* Email config */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg.email_ativo}
                onCheckedChange={v => setCfg(c => ({ ...c, email_ativo: v }))}
              />
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold">Email</span>
            </div>

            {cfg.email_ativo && (
              <div className="pl-9 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Assunto</label>
                  <Input
                    value={cfg.email_assunto}
                    onChange={e => setCfg(c => ({ ...c, email_assunto: e.target.value }))}
                    placeholder="Ex: Boas-vindas à {{turma}}! 🎉"
                    className="h-8 text-sm"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {BV_VARS.map(v => (
                      <button key={v} type="button"
                        onClick={() => setCfg(c => ({ ...c, email_assunto: c.email_assunto + `{{${v}}}` }))}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Corpo do email (HTML)
                  </label>
                  <Textarea
                    value={cfg.email_corpo}
                    onChange={e => setCfg(c => ({ ...c, email_corpo: e.target.value }))}
                    rows={8}
                    className="text-xs font-mono"
                    placeholder="<h2>Olá, {{nome}}!</h2><p>...</p>"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {BV_VARS.map(v => (
                      <button key={v} type="button"
                        onClick={() => setCfg(c => ({ ...c, email_corpo: c.email_corpo + `{{${v}}}` }))}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Use HTML básico: &lt;h2&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;. Configure o provedor em Configurações → Email.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Save button */}
          <Button onClick={saveCfg} disabled={saving} size="sm" className="gap-2">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Salvar configuração
          </Button>

          {/* Send to lead */}
          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Enviar para lead
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="Nome"
                value={sendNome}
                onChange={e => setSendNome(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="WhatsApp (55119...)"
                value={sendWpp}
                onChange={e => setSendWpp(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Email"
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={handleSend}
              disabled={sending || !cfg.ativo}
              title={!cfg.ativo ? 'Ative as boas-vindas para enviar' : ''}
            >
              {sending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Heart className="h-3.5 w-3.5" />}
              Enviar boas-vindas
            </Button>
            {!cfg.ativo && (
              <p className="text-[11px] text-amber-600">⚠ Ative as boas-vindas acima para poder enviar</p>
            )}
          </div>

          {/* Logs */}
          {logs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Últimos envios
              </p>
              <div className="space-y-1.5">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/30 border border-border/40">
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <StatusDot status={log.wpp_status} />
                      <Mail className="h-3 w-3 text-muted-foreground ml-1" />
                      <StatusDot status={log.email_status} />
                    </div>
                    <span className="font-medium truncate">{log.nome ?? log.whatsapp ?? log.email ?? '—'}</span>
                    <span className="text-muted-foreground ml-auto flex-shrink-0">
                      {(() => { try { return format(parseISO(log.sent_at), 'dd/MM HH:mm', { locale: ptBR }); } catch { return ''; } })()}
                    </span>
                    {(log.wpp_error || log.email_error) && (
                      <span className="text-red-500 truncate max-w-[120px]" title={log.wpp_error ?? log.email_error ?? ''}>
                        {(log.wpp_error ?? log.email_error ?? '').slice(0, 30)}…
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick Email Card ───────────────────────────────────────────────────────────

function QuickEmailCard() {
  const [to,       setTo]       = useState('');
  const [toName,   setToName]   = useState('');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error('Para, Assunto e Corpo são obrigatórios');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('email-enviar', {
      body: { to: to.trim(), to_name: toName.trim() || undefined, subject: subject.trim(), html: body },
    });
    setSending(false);
    const err = error?.message ?? (data as any)?.error;
    if (err) { toast.error(`Erro: ${err}`); return; }
    toast.success('Email enviado!');
    setTo(''); setToName(''); setSubject(''); setBody('');
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Envio de Email avulso
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Para (email) *</label>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="destinatario@email.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do destinatário</label>
            <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="João Silva (opcional)" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Assunto *</label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Assunto do email" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Corpo (HTML) *
          </label>
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            placeholder="<p>Olá! Mensagem aqui...</p>"
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Aceita HTML básico. Provedor configurado em Configurações → Email.
          </p>
        </div>
        <Button
          onClick={handleSend}
          disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
          className="w-full gap-2 bg-primary hover:bg-primary/90"
        >
          {sending ? <><Spinner small /> Enviando…</> : <><Mail className="h-4 w-4" /> Enviar email</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Email Config Panel ─────────────────────────────────────────────────────────

interface EmailCfg {
  id?: string;
  ativo: boolean;
  provider: 'resend' | 'sendgrid' | 'brevo';
  api_key: string;
  from_name: string;
  from_email: string;
}

const EMPTY_EMAIL_CFG: EmailCfg = {
  ativo: true,
  provider: 'resend',
  api_key: '',
  from_name: '',
  from_email: '',
};

function EmailConfigPanel() {
  const [cfg,       setCfg]       = useState<EmailCfg>(EMPTY_EMAIL_CFG);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [testTo,    setTestTo]    = useState('');

  useEffect(() => {
    supabase.from('email_config').select('*').eq('ativo', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) setCfg(data as EmailCfg);
        setLoading(false);
      });
  }, []);

  async function saveCfg() {
    setSaving(true);
    const { error } = await supabase
      .from('email_config')
      .upsert({ ...cfg }, { onConflict: 'id' });
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Configuração de email salva!');
  }

  async function sendTest() {
    if (!testTo.trim()) { toast.error('Informe um email para teste'); return; }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('email-enviar', {
      body: {
        to: testTo.trim(),
        subject: 'Teste de email — Sistema 11ds ✉️',
        html: '<h2>Teste bem-sucedido! ✅</h2><p>Seu email está configurado corretamente no Sistema 11ds.</p><p>Provedor: <strong>' + cfg.provider + '</strong></p>',
      },
    });
    setTesting(false);
    const err = error?.message ?? (data as any)?.error;
    if (err) { toast.error(`Erro no envio: ${err}`); return; }
    toast.success(`Email de teste enviado para ${testTo}`);
  }

  const providerLinks: Record<string, { label: string; url: string; hint: string }> = {
    resend:   { label: 'Resend',   url: 'https://resend.com',          hint: '3.000/mês grátis — melhor opção' },
    sendgrid: { label: 'SendGrid', url: 'https://sendgrid.com',        hint: '100/dia grátis' },
    brevo:    { label: 'Brevo',    url: 'https://app.brevo.com',       hint: '300/dia grátis' },
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Configuração de Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Provedor</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(providerLinks) as [string, { label: string; url: string; hint: string }][]).map(([key, p]) => (
                <button
                  key={key} type="button"
                  onClick={() => setCfg(c => ({ ...c, provider: key as EmailCfg['provider'] }))}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-xs font-medium transition-all ${
                    cfg.provider === key
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-foreground/70 hover:border-primary/40'
                  }`}
                >
                  <span className="font-semibold">{p.label}</span>
                  <span className={`text-[10px] ${cfg.provider === key ? 'text-white/70' : 'text-muted-foreground'}`}>{p.hint}</span>
                </button>
              ))}
            </div>
            <a
              href={providerLinks[cfg.provider]?.url}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
            >
              <Link2 className="h-3 w-3" /> Criar conta gratuita em {providerLinks[cfg.provider]?.label}
            </a>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              API Key do {providerLinks[cfg.provider]?.label}
            </label>
            <Input
              type="password"
              value={cfg.api_key}
              onChange={e => setCfg(c => ({ ...c, api_key: e.target.value }))}
              placeholder="re_xxxxxxxxxxxx / SG.xxxx / xkeysib-xxxx"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {cfg.provider === 'resend'   && 'No Resend: Configurações → API Keys → Create API Key'}
              {cfg.provider === 'sendgrid' && 'No SendGrid: Settings → API Keys → Create API Key (Mail Send)'}
              {cfg.provider === 'brevo'    && 'No Brevo: Configurações → API Keys → Gerar nova chave'}
            </p>
          </div>

          {/* From */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do remetente</label>
              <Input
                value={cfg.from_name}
                onChange={e => setCfg(c => ({ ...c, from_name: e.target.value }))}
                placeholder="Ex: Equipe 11ds"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email do remetente</label>
              <Input
                type="email"
                value={cfg.from_email}
                onChange={e => setCfg(c => ({ ...c, from_email: e.target.value }))}
                placeholder="noreply@seudominio.com"
                className="text-sm"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2">
            ⚠️ O email do remetente precisa estar verificado no {providerLinks[cfg.provider]?.label}
          </p>

          <Button onClick={saveCfg} disabled={saving} className="w-full gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar configuração
          </Button>

          {/* Test send */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Envio de teste</p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="seu@email.com"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                className="text-sm flex-1"
              />
              <Button variant="outline" onClick={sendTest} disabled={testing || !cfg.api_key} className="gap-2 flex-shrink-0">
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Testar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dicas */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-amber-800 mb-2">💡 Dicas para não cair em spam</p>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>Configure SPF e DKIM no DNS do seu domínio</li>
            <li>Use um domínio próprio como remetente (não Gmail/Outlook pessoal)</li>
            <li>Mantenha taxa de bounce abaixo de 2%</li>
            <li>Só envie para leads que se cadastraram voluntariamente</li>
            <li>Resend recomendado: grátis, confiável e entrega alta</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Bulk Import Modal ──────────────────────────────────────────────────────────

function BulkImportModal({ open, onClose, currentFunnel, onImported }: {
  open: boolean; onClose: () => void;
  currentFunnel: string; onImported: () => void;
}) {
  const [jsonText,  setJsonText]  = useState('');
  const [preview,   setPreview]   = useState<Record<string, unknown>[]>([]);
  const [parseErr,  setParseErr]  = useState('');
  const [importing, setImporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function downloadTemplate() {
    const blob = new Blob([BULK_TEMPLATE], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'template-funil.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function parseBulk() {
    setParseErr(''); setPreview([]);
    // Lê diretamente do DOM como fallback caso o estado React não tenha atualizado
    const text = jsonText.trim() || textareaRef.current?.value?.trim() || '';
    if (!text) { toast.error('Cole o JSON antes de visualizar'); return; }

    try {
      const raw = JSON.parse(text);

      // Formato nativo: array de objetos com data/horario/tipo
      if (Array.isArray(raw)) {
        if (raw.length === 0) { toast.error('Array vazio — adicione mensagens ao JSON'); return; }
        const msgs = parseNativeMessages(raw, currentFunnel);
        if (msgs.length === 0) { toast.error('Nenhuma mensagem reconhecida no JSON'); return; }
        setPreview(msgs);
        toast.success(`${msgs.length} mensagens detectadas — revise e clique em Importar`);
        return;
      }

      // Formato padrão: { funil, data_inicio, destinatario_padrao, mensagens: [] }
      const data         = raw;
      const startDate    = new Date(data.data_inicio || new Date());
      const defaultRecip = (data.destinatario_padrao as string) || '{{grupo_1}}';
      const msgs = ((data.mensagens || []) as Record<string, unknown>[]).map(m => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + ((m.dia as number || 1) - 1));
        const [h, mi] = ((m.horario as string) || '09:00').split(':');
        const hour = parseInt(h) || 9;
        const minute = parseInt(mi) || 0;
        date.setHours(hour, minute, 0, 0);
        const recip = (m.destinatario as string) || defaultRecip;
        const tipo  = (m.tipo as string) || 'texto';
        const message_type: MessageType =
          tipo === 'imagem'    ? 'image'    :
          tipo === 'video'     ? 'video'    :
          tipo === 'audio'     ? 'audio'    :
          tipo === 'documento' ? 'document' :
          tipo === 'enquete'   ? 'poll'     : 'text';
        const subtipo = (m.subtipo as string) || null;
        return {
          funnel_name:           (data.funil as string) || currentFunnel || 'Funil',
          day_number:            (m.dia as number) || 1,
          scheduled_at:          date.toISOString(),
          recipient_type:        recip.includes('@g.us') || recip.includes('{{grupo') ? 'group' : 'number',
          recipient_id:          recip,
          message_type,
          message_text:          (m.mensagem as string) || (m.legenda as string) || '',
          media_url:             (m.url_midia as string) || null,
          poll_name:             (m.titulo as string) || null,
          poll_options:          Array.isArray(m.opcoes) ? m.opcoes : null,
          poll_selectable_count: m.multipla_escolha ? ((m.opcoes as unknown[])?.length || 2) : 1,
          link_preview:          !!(m.preview_link),
          mention_everyone:      !!(m.marcar_todos),
          send_header_image:     shouldSendHeaderImage(message_type, subtipo, hour, minute, m.imagem_cabecalho !== false),
          subtipo,
          status:                'draft',
        };
      });
      setPreview(msgs);
      if (msgs.length > 0) toast.success(`${msgs.length} mensagens detectadas`);
    } catch (e: unknown) {
      const msg = `JSON inválido: ${(e as Error).message}`;
      setParseErr(msg);
      toast.error(msg);
    }
  }

  async function handleImport() {
    if (!preview.length) return;
    setImporting(true);
    const funnelNamesToCreate = [...new Set(preview.map(m => m.funnel_name as string).filter(Boolean))];
    for (const funnelName of funnelNamesToCreate) {
      const { data: existing, error: lookupError } = await supabase
        .from('funnel_configs')
        .select('id')
        .eq('funnel_name', funnelName)
        .maybeSingle();
      if (lookupError) {
        setImporting(false);
        toast.error(`Erro ao verificar funil "${funnelName}": ${lookupError.message}`);
        return;
      }
      if (!existing) {
        const { error: configError } = await supabase
          .from('funnel_configs')
          .insert(EMPTY_CONFIG(funnelName) as any);
        if (configError) {
          setImporting(false);
          toast.error(`Erro ao criar funil "${funnelName}": ${configError.message}`);
          return;
        }
      }
    }
    const { error } = await supabase.from('funnel_messages').insert(preview as any);
    setImporting(false);
    if (error) { toast.error(`Erro na importação: ${error.message}`); return; }
    toast.success(`${preview.length} mensagens importadas como rascunho!`);
    setJsonText(''); setPreview([]); onImported(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Importar mensagens em lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto py-1 pr-1">
          {/* Info */}
          <div className="p-3 rounded-lg bg-muted/30 border text-sm space-y-1.5">
            <p className="font-medium text-foreground text-sm">Tipos suportados:</p>
            <div className="flex flex-wrap gap-1.5">
              {(['texto','imagem','video','audio','documento','enquete'] as string[]).map(t => (
                <code key={t} className="text-xs bg-background border rounded px-1.5 py-0.5">{t}</code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Use variáveis como <code className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded">{'{{grupo_1}}'}</code>,{' '}
              <code className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded">{'{{link_aula_1}}'}</code>{' '}
              — os valores reais são configurados em "Configurar funil".
            </p>
          </div>

          <Button variant="outline" size="sm" className="gap-2 w-fit" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Baixar template.json
          </Button>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cole seu JSON aqui</label>
            <Textarea
              ref={textareaRef}
              placeholder={BULK_TEMPLATE}
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setPreview([]); setParseErr(''); }}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text');
                if (pasted) { setJsonText(pasted); setPreview([]); setParseErr(''); e.preventDefault(); }
              }}
              rows={9}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between mt-1">
              {parseErr
                ? <p className="text-xs text-red-600">{parseErr}</p>
                : <span className="text-xs text-muted-foreground">
                    {jsonText.length > 0 ? `${jsonText.length} chars · pronto para visualizar` : 'Cole o JSON aqui'}
                  </span>
              }
            </div>
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={parseBulk}>
            <Eye className="h-4 w-4" /> Visualizar {preview.length > 0 ? `(${preview.length} mensagens)` : 'mensagens'}
          </Button>

          {preview.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-foreground">
                {preview.length} mensagens detectadas — serão importadas como rascunho
              </div>
              <div className="overflow-auto max-h-52">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20">
                    <tr>
                      {['#','Dia','Hora','Tipo','Destinatário','Prévia','Flags'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((m, i) => {
                      const mt = (m.message_type as MessageType) || 'text';
                      const tc = TYPE_CFG[mt];
                      const TI = tc.icon;
                      return (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5">{m.day_number as number}</td>
                          <td className="px-3 py-1.5">{fmtTime(m.scheduled_at as string)}</td>
                          <td className="px-3 py-1.5">
                            <span className={`flex items-center gap-1 ${tc.color}`}>
                              <TI className="h-3 w-3" /> {tc.label}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 max-w-[80px] truncate text-muted-foreground font-mono text-[10px]">
                            {m.recipient_id as string}
                          </td>
                          <td className="px-3 py-1.5 max-w-[140px] truncate text-foreground/80">
                            {(m.poll_name || m.message_text || m.media_url || '—') as string}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex gap-1 flex-wrap">
                              {m.mention_everyone && (
                                <span className="text-[10px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded border border-amber-100">@todos</span>
                              )}
                              {m.link_preview && (
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-100">preview</span>
                              )}
                              {m.send_header_image && (
                                <span className="text-[10px] bg-purple-50 text-purple-600 px-1 py-0.5 rounded border border-purple-100">header</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={!preview.length || importing}
            className="bg-primary hover:bg-primary/90 gap-2"
          >
            {importing
              ? <><Spinner small /> Importando…</>
              : <><Upload className="h-4 w-4" /> Importar {preview.length > 0 ? `${preview.length} mensagens` : ''}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
