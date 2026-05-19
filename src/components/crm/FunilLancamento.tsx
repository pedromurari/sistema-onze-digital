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
  Plus, Send, Clock, CheckCircle2, AlertCircle, FileText,
  Pencil, Trash2, MessageSquare, Users, Phone, Zap, Calendar,
  GitBranch, Image, Video, Music, FileIcon, BarChart2, Eye,
  AtSign, Upload, Download, X, Settings2, Sunrise, Sunset, Moon,
  Variable, Link2,
} from 'lucide-react';
import { format, parseISO, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  status: MessageStatus;
  sent_at?: string;
  error_message?: string;
  created_at: string;
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

const EMPTY_FORM: MsgForm = {
  funnel_name: '', day_number: 1,
  scheduled_date: todayInput(), scheduled_time: '09:00',
  recipient_type: 'group', recipient_id: '',
  message_type: 'text', message_text: '', media_url: '',
  poll_name: '', poll_options: ['', ''], poll_selectable_count: 1,
  link_preview: false, mention_everyone: false, send_header_image: true,
};

// ── Main component ────────────────────────────────────────────────────────────

export function FunilLancamento() {
  const [messages,     setMessages]     = useState<FunnelMessage[]>([]);
  const [funnelNames,  setFunnelNames]  = useState<string[]>([]);
  const [selected,     setSelected]     = useState('');
  const [newName,      setNewName]      = useState('');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [sendingQ,     setSendingQ]     = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState<MsgForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkOpen,     setBulkOpen]     = useState(false);
  const [configOpen,   setConfigOpen]   = useState(false);
  const [configs,      setConfigs]      = useState<Record<string, FunnelConfig>>({});

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
    const { data } = await supabase
      .from('funnel_messages').select('funnel_name')
      .order('created_at', { ascending: false });
    const unique = [...new Set((data || []).map(r => r.funnel_name as string))];
    setFunnelNames(unique);
    setSelected(prev => prev || unique[0] || '');
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selected) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('funnel_messages').select('*')
      .eq('funnel_name', selected)
      .order('scheduled_at', { ascending: true });
    if (error) toast.error(`Erro: ${error.message}`);
    setMessages((data as FunnelMessage[]) || []);
    setLoading(false);
  }, [selected]);

  const loadConfig = useCallback(async (name: string) => {
    if (!name || configs[name]) return;
    const { data } = await supabase
      .from('funnel_configs').select('*').eq('funnel_name', name).maybeSingle();
    setConfigs(prev => ({
      ...prev,
      [name]: data
        ? { ...data, variaveis: (data.variaveis as Record<string, string>) || {} }
        : EMPTY_CONFIG(name),
    }));
  }, [configs]);

  useEffect(() => { loadFunnels(); }, []);
  useEffect(() => { loadMessages(); }, [selected]);
  useEffect(() => { if (selected) loadConfig(selected); }, [selected]);

  useEffect(() => {
    const ch = supabase.channel('funil_lancamento_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funnel_messages' }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadMessages]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const currentConfig = configs[selected] ?? EMPTY_CONFIG(selected);

  const allVarNames = useMemo(() => {
    const fixed = ['grupo_1', 'grupo_2'];
    const custom = Object.keys(currentConfig.variaveis || {});
    return [...fixed, ...custom];
  }, [currentConfig]);

  const byDay = useMemo(() => {
    const map = new Map<number, FunnelMessage[]>();
    for (const m of messages) {
      const arr = map.get(m.day_number) ?? [];
      arr.push(m);
      map.set(m.day_number, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [messages]);

  const stats = useMemo(() => ({
    total:     messages.length,
    sent:      messages.filter(m => m.status === 'sent').length,
    scheduled: messages.filter(m => m.status === 'scheduled').length,
    draft:     messages.filter(m => m.status === 'draft').length,
    error:     messages.filter(m => m.status === 'error').length,
  }), [messages]);

  const progress = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;

  const hasHeaderImages = !!(currentConfig.imagem_manha || currentConfig.imagem_tarde || currentConfig.imagem_noite);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function openCreate(day?: number) {
    const nextDay = day ?? (byDay.length > 0 ? byDay[byDay.length - 1][0] + 1 : 1);
    const cfg = configs[selected];
    const defaultRecip = cfg?.grupo_1_id ? '{{grupo_1}}' : '';
    setEditingId(null);
    setForm({ ...EMPTY_FORM, funnel_name: selected, day_number: nextDay, recipient_id: defaultRecip });
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
      send_header_image:     msg.send_header_image ?? true,
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
    const scheduledAt = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`);
    if (action === 'scheduled' && isBefore(scheduledAt, new Date())) {
      toast.error('Não é possível agendar no passado'); return;
    }
    setSaving(true);
    const payload = buildPayload(form, action);
    const { error } = editingId
      ? await supabase.from('funnel_messages').update(payload).eq('id', editingId)
      : await supabase.from('funnel_messages').insert(payload);
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success(action === 'draft' ? 'Salvo como rascunho' : 'Mensagem agendada!');
    setModalOpen(false);
    if (!selected) setSelected(form.funnel_name.trim());
    loadMessages(); loadFunnels();
  }

  async function handleSendNow() {
    const err = validate(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    const p = buildPayload(form, 'scheduled');
    const { data, error } = await supabase.functions.invoke('funil-processar', {
      body: { quick_send: true, ...p },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error(`Erro: ${error?.message ?? (data as any)?.error}`); return;
    }
    toast.success('Mensagem enviada!');
    setModalOpen(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('funnel_messages').delete().eq('id', id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Excluído'); setDeleteTarget(null); loadMessages();
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

  function createFunnel() {
    const name = newName.trim();
    if (!name) return;
    setFunnelNames(prev => [...new Set([...prev, name])]);
    setSelected(name); setNewName('');
  }

  // ── Render ───────────────────────────────────────────────────────────────

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
          <Button onClick={() => openCreate()} className="gap-2 bg-primary hover:bg-primary/90">
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
        </TabsList>

        {/* ── FUNIL ────────────────────────────────────────────────────────── */}
        <TabsContent value="funil" className="mt-4 space-y-4">
          {/* Funnel tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {funnelNames.map(name => (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selected === name
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-foreground/70 hover:border-primary/40 hover:text-primary'
                }`}
              >
                {name}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                placeholder="Novo funil…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFunnel()}
                className="h-8 w-36 text-sm"
              />
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={createFunnel}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selected && (
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 ml-auto border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => setConfigOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" /> Configurar funil
              </Button>
            )}
          </div>

          {/* Config summary strip */}
          {selected && (currentConfig.grupo_1_id || hasHeaderImages || Object.keys(currentConfig.variaveis).length > 0) && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs">
              <Variable className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              {currentConfig.grupo_1_id && (
                <span className="text-amber-800">
                  <span className="font-mono bg-amber-100 px-1 rounded">{'{{grupo_1}}'}</span>
                  {' '}→ {currentConfig.grupo_1_id.slice(0, 20)}{currentConfig.grupo_1_id.length > 20 ? '…' : ''}
                </span>
              )}
              {currentConfig.grupo_2_id && (
                <span className="text-amber-800">
                  <span className="font-mono bg-amber-100 px-1 rounded">{'{{grupo_2}}'}</span>
                  {' '}→ {currentConfig.grupo_2_id.slice(0, 20)}{currentConfig.grupo_2_id.length > 20 ? '…' : ''}
                </span>
              )}
              {Object.entries(currentConfig.variaveis).map(([k, v]) => (
                <span key={k} className="text-amber-800">
                  <span className="font-mono bg-amber-100 px-1 rounded">{`{{${k}}}`}</span>
                  {v ? ` → ${v.slice(0, 20)}${v.length > 20 ? '…' : ''}` : <span className="text-red-500"> não preenchido</span>}
                </span>
              ))}
              {hasHeaderImages && (
                <span className="text-amber-700 flex items-center gap-1">
                  <Image className="h-3 w-3" /> Imagens de cabeçalho configuradas
                </span>
              )}
            </div>
          )}

          {selected ? (
            <>
              {/* Progress card */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold text-foreground">{selected}</span>
                    <div className="flex items-center gap-4 flex-wrap">
                      <Chip label="Total"     value={stats.total}     color="text-foreground" />
                      <Chip label="Enviadas"  value={stats.sent}      color="text-emerald-700" />
                      <Chip label="Agendadas" value={stats.scheduled} color="text-blue-700" />
                      <Chip label="Rascunhos" value={stats.draft}     color="text-gray-500" />
                      {stats.error > 0 && <Chip label="Erros" value={stats.error} color="text-red-700" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={progress} className="flex-1 h-2" />
                    <span className="text-sm font-bold min-w-[40px] text-right">{progress}%</span>
                  </div>
                </CardContent>
              </Card>

              {/* Messages */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : byDay.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground space-y-2">
                  <MessageSquare className="h-10 w-10 mx-auto opacity-25" />
                  <p className="text-sm">Nenhuma mensagem neste funil</p>
                  <Button variant="link" className="text-primary h-auto p-0" onClick={() => openCreate()}>
                    Criar primeira mensagem
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {byDay.map(([day, dayMsgs]) => (
                    <div key={day}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-bold text-primary">{day}</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">Dia {day}</span>
                        <span className="text-xs text-muted-foreground">
                          · {fmtDate(dayMsgs[0].scheduled_at)}
                        </span>
                        <div className="flex-1 border-t border-border/40" />
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1 text-primary hover:bg-primary/5"
                          onClick={() => openCreate(day)}
                        >
                          <Plus className="h-3 w-3" /> Adicionar
                        </Button>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dayMsgs.map(msg => (
                          <MsgCard
                            key={msg.id}
                            msg={msg}
                            onEdit={() => openEdit(msg)}
                            onDelete={() => setDeleteTarget(msg.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <GitBranch className="h-10 w-10 mx-auto opacity-25" />
              <p className="text-sm">Crie ou selecione um funil para começar</p>
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

      {/* Create / Edit modal */}
      <MsgModal
        open={modalOpen} onClose={() => setModalOpen(false)}
        form={form} setForm={setForm} funnelNames={funnelNames}
        isEditing={!!editingId} saving={saving}
        varNames={allVarNames}
        hasHeaderImages={hasHeaderImages}
        onDraft={() => handleSave('draft')}
        onSchedule={() => handleSave('scheduled')}
        onSendNow={handleSendNow}
      />

      {/* Bulk import */}
      <BulkImportModal
        open={bulkOpen} onClose={() => setBulkOpen(false)}
        currentFunnel={selected}
        onImported={() => { loadMessages(); loadFunnels(); }}
      />

      {/* Funnel config modal */}
      <FunnelConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        funnelName={selected}
        initialConfig={currentConfig}
        onSaved={cfg => {
          setConfigs(prev => ({ ...prev, [selected]: cfg }));
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

function MsgCard({ msg, onEdit, onDelete }: {
  msg: FunnelMessage; onEdit: () => void; onDelete: () => void;
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

  return (
    <Card className="hover:shadow-sm transition-shadow group cursor-pointer" onClick={onEdit}>
      <CardContent className="pt-3 pb-3 px-4">
        {/* Header */}
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
        {(msg.link_preview || msg.mention_everyone || msg.send_header_image ||
          (msg.message_type === 'poll' && msg.poll_options)) && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {msg.send_header_image && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100 flex items-center gap-0.5">
                <Image className="h-2.5 w-2.5" /> header
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
  onDraft: () => void; onSchedule: () => void; onSendNow: () => void;
}

function MsgModal({
  open, onClose, form, setForm, funnelNames,
  isEditing, saving, varNames, hasHeaderImages,
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
                desc={hasHeaderImages ? 'Envia imagem manhã/tarde/noite antes desta mensagem' : 'Configure as imagens em "Configurar funil"'}
                value={form.send_header_image}
                onChange={v => set('send_header_image', v)}
                disabled={!hasHeaderImages}
                color="blue"
              />
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
            <Send className="h-4 w-4" /> Enviar agora
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

  useEffect(() => { setCfg(initialConfig); }, [initialConfig, open]);

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

  async function handleSave() {
    setSaving(true);
    const payload = {
      funnel_name:   funnelName,
      grupo_1_id:    cfg.grupo_1_id,
      grupo_2_id:    cfg.grupo_2_id,
      imagem_manha:  cfg.imagem_manha,
      imagem_tarde:  cfg.imagem_tarde,
      imagem_noite:  cfg.imagem_noite,
      variaveis:     cfg.variaveis,
    };
    const { error } = await supabase
      .from('funnel_configs')
      .upsert(payload, { onConflict: 'funnel_name' });
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    onSaved(cfg);
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

          {/* Imagens de cabeçalho */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Image className="h-4 w-4 text-primary" /> Imagens de cabeçalho
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Quando ativado na mensagem, o sistema envia a imagem correspondente ao turno <em>antes</em> da mensagem principal.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Sunrise className="h-3.5 w-3.5 text-yellow-500" /> Manhã (6h–12h)
                </label>
                <Input placeholder="https://..." value={cfg.imagem_manha}
                  onChange={e => setField('imagem_manha', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Sunset className="h-3.5 w-3.5 text-orange-500" /> Tarde (12h–18h)
                </label>
                <Input placeholder="https://..." value={cfg.imagem_tarde}
                  onChange={e => setField('imagem_tarde', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Moon className="h-3.5 w-3.5 text-indigo-500" /> Noite (18h–24h)
                </label>
                <Input placeholder="https://..." value={cfg.imagem_noite}
                  onChange={e => setField('imagem_noite', e.target.value)} />
              </div>
            </div>
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

            {Object.entries(cfg.variaveis).length > 0 && (
              <div className="rounded-lg border divide-y mb-3">
                {Object.entries(cfg.variaveis).map(([k, v]) => (
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

// ── Bulk Import Modal ──────────────────────────────────────────────────────────

function BulkImportModal({ open, onClose, currentFunnel, onImported }: {
  open: boolean; onClose: () => void;
  currentFunnel: string; onImported: () => void;
}) {
  const [jsonText,  setJsonText]  = useState('');
  const [preview,   setPreview]   = useState<Record<string, unknown>[]>([]);
  const [parseErr,  setParseErr]  = useState('');
  const [importing, setImporting] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([BULK_TEMPLATE], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'template-funil.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function parseBulk() {
    setParseErr(''); setPreview([]);
    try {
      const data = JSON.parse(jsonText);
      const startDate    = new Date(data.data_inicio || new Date());
      const defaultRecip = (data.destinatario_padrao as string) || '{{grupo_1}}';
      const msgs = ((data.mensagens || []) as Record<string, unknown>[]).map(m => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + ((m.dia as number || 1) - 1));
        const [h, mi] = ((m.horario as string) || '09:00').split(':');
        date.setHours(parseInt(h) || 9, parseInt(mi) || 0, 0, 0);
        const recip = (m.destinatario as string) || defaultRecip;
        const tipo  = (m.tipo as string) || 'texto';
        const message_type: MessageType =
          tipo === 'imagem'    ? 'image'    :
          tipo === 'video'     ? 'video'    :
          tipo === 'audio'     ? 'audio'    :
          tipo === 'documento' ? 'document' :
          tipo === 'enquete'   ? 'poll'     : 'text';
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
          send_header_image:     m.imagem_cabecalho !== false,
          status:                'draft',
        };
      });
      setPreview(msgs);
    } catch (e: unknown) {
      setParseErr(`JSON inválido: ${(e as Error).message}`);
    }
  }

  async function handleImport() {
    if (!preview.length) return;
    setImporting(true);
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
              placeholder={BULK_TEMPLATE}
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setPreview([]); setParseErr(''); }}
              rows={9}
              className="font-mono text-xs"
            />
            {parseErr && <p className="text-xs text-red-600 mt-1">{parseErr}</p>}
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={parseBulk} disabled={!jsonText.trim()}>
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
