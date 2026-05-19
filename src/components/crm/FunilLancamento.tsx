import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Send, Clock, CheckCircle2, AlertCircle, FileText,
  Pencil, Trash2, MessageSquare, Users, Phone, Zap, Calendar,
  GitBranch,
} from 'lucide-react';
import { format, parseISO, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Types ───────────────────────────────────────────────────────────────────

type MessageStatus = 'draft' | 'scheduled' | 'sent' | 'error';
type RecipientType = 'group' | 'number';

interface FunnelMessage {
  id: string;
  funnel_name: string;
  day_number: number;
  scheduled_at: string;
  recipient_type: RecipientType;
  recipient_id: string;
  message_text: string;
  status: MessageStatus;
  sent_at?: string;
  error_message?: string;
  created_at: string;
}

interface MessageForm {
  funnel_name: string;
  day_number: number;
  scheduled_date: string;
  scheduled_time: string;
  recipient_type: RecipientType;
  recipient_id: string;
  message_text: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  MessageStatus,
  { label: string; badge: string; icon: React.ElementType }
> = {
  draft:     { label: 'Rascunho', badge: 'bg-gray-100 text-gray-600 border-gray-200',        icon: FileText },
  scheduled: { label: 'Agendada', badge: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Clock },
  sent:      { label: 'Enviada',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  error:     { label: 'Erro',     badge: 'bg-red-50 text-red-700 border-red-200',             icon: AlertCircle },
};

// ── Utilities ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  try { return format(parseISO(iso), 'HH:mm', { locale: ptBR }); } catch { return ''; }
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return ''; }
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM: MessageForm = {
  funnel_name:    '',
  day_number:     1,
  scheduled_date: todayInput(),
  scheduled_time: '09:00',
  recipient_type: 'group',
  recipient_id:   '',
  message_text:   '',
};

// ── Main component ────────────────────────────────────────────────────────────

export function FunilLancamento() {
  const [messages,      setMessages]      = useState<FunnelMessage[]>([]);
  const [funnelNames,   setFunnelNames]   = useState<string[]>([]);
  const [selected,      setSelected]      = useState('');
  const [newName,       setNewName]       = useState('');
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [sendingQuick,  setSendingQuick]  = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [form,          setForm]          = useState<MessageForm>(EMPTY_FORM);
  const [deleteTarget,  setDeleteTarget]  = useState<string | null>(null);

  // Quick send state
  const [qType,    setQType]    = useState<RecipientType>('group');
  const [qRecip,   setQRecip]   = useState('');
  const [qMessage, setQMessage] = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFunnels = useCallback(async () => {
    const { data } = await supabase
      .from('funnel_messages')
      .select('funnel_name')
      .order('created_at', { ascending: false });
    const unique = [...new Set((data || []).map(r => r.funnel_name as string))];
    setFunnelNames(unique);
    setSelected(prev => prev || unique[0] || '');
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selected) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('funnel_messages')
      .select('*')
      .eq('funnel_name', selected)
      .order('scheduled_at', { ascending: true });
    if (error) toast.error(`Erro ao carregar: ${error.message}`);
    setMessages((data as FunnelMessage[]) || []);
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadFunnels(); }, []);
  useEffect(() => { loadMessages(); }, [selected]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel('funil_lancamento_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funnel_messages' }, () => {
        loadMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadMessages]);

  // ── Derived state ─────────────────────────────────────────────────────────

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

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreate(day?: number) {
    const nextDay = day ?? (byDay.length > 0 ? byDay[byDay.length - 1][0] + 1 : 1);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, funnel_name: selected, day_number: nextDay });
    setModalOpen(true);
  }

  function openEdit(msg: FunnelMessage) {
    setEditingId(msg.id);
    const dt = parseISO(msg.scheduled_at);
    setForm({
      funnel_name:    msg.funnel_name,
      day_number:     msg.day_number,
      scheduled_date: format(dt, 'yyyy-MM-dd'),
      scheduled_time: format(dt, 'HH:mm'),
      recipient_type: msg.recipient_type,
      recipient_id:   msg.recipient_id,
      message_text:   msg.message_text,
    });
    setModalOpen(true);
  }

  async function handleSave(action: 'draft' | 'scheduled') {
    if (!form.funnel_name.trim())   { toast.error('Nome do funil é obrigatório'); return; }
    if (!form.recipient_id.trim())  { toast.error('Destinatário é obrigatório'); return; }
    if (!form.message_text.trim())  { toast.error('Mensagem é obrigatória'); return; }

    const scheduledAt = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`);
    if (action === 'scheduled' && isBefore(scheduledAt, new Date())) {
      toast.error('Não é possível agendar no passado'); return;
    }

    setSaving(true);
    const payload = {
      funnel_name:    form.funnel_name.trim(),
      day_number:     form.day_number,
      scheduled_at:   scheduledAt.toISOString(),
      recipient_type: form.recipient_type,
      recipient_id:   form.recipient_id.trim(),
      message_text:   form.message_text,
      status:         action,
    };

    const { error } = editingId
      ? await supabase.from('funnel_messages').update(payload).eq('id', editingId)
      : await supabase.from('funnel_messages').insert(payload);

    setSaving(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }

    toast.success(action === 'draft' ? 'Salvo como rascunho' : 'Mensagem agendada!');
    setModalOpen(false);
    if (!selected) setSelected(form.funnel_name.trim());
    loadMessages();
    loadFunnels();
  }

  async function handleSendNow() {
    if (!form.recipient_id.trim() || !form.message_text.trim()) {
      toast.error('Destinatário e mensagem são obrigatórios'); return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('funil-processar', {
      body: {
        quick_send:     true,
        recipient_type: form.recipient_type,
        recipient_id:   form.recipient_id.trim(),
        message_text:   form.message_text,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error(`Erro: ${error?.message ?? (data as any).error}`); return;
    }
    toast.success('Mensagem enviada!');
    setModalOpen(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('funnel_messages').delete().eq('id', id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('Mensagem excluída');
    setDeleteTarget(null);
    loadMessages();
  }

  async function handleQuickSend() {
    if (!qRecip.trim() || !qMessage.trim()) {
      toast.error('Preencha destinatário e mensagem'); return;
    }
    setSendingQuick(true);
    const { data, error } = await supabase.functions.invoke('funil-processar', {
      body: { quick_send: true, recipient_type: qType, recipient_id: qRecip.trim(), message_text: qMessage },
    });
    setSendingQuick(false);
    if (error || (data as any)?.error) {
      toast.error(`Erro: ${error?.message ?? (data as any).error}`); return;
    }
    toast.success('Enviado com sucesso!');
    setQRecip('');
    setQMessage('');
  }

  function createFunnel() {
    const name = newName.trim();
    if (!name) return;
    setFunnelNames(prev => [...new Set([...prev, name])]);
    setSelected(name);
    setNewName('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funil de Lançamento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Mensagens agendadas via WhatsApp</p>
        </div>
        <Button onClick={() => openCreate()} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nova Mensagem
        </Button>
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

        {/* ── ABA FUNIL ──────────────────────────────────────────────────────── */}
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
          </div>

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
                    <span className="text-sm font-bold text-foreground min-w-[40px] text-right">
                      {progress}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Messages grouped by day */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : byDay.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground space-y-2">
                  <MessageSquare className="h-10 w-10 mx-auto opacity-25" />
                  <p className="text-sm">Nenhuma mensagem neste funil</p>
                  <Button variant="link" className="text-primary h-auto p-0" onClick={() => openCreate()}>
                    Criar a primeira mensagem
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
                          variant="ghost"
                          size="sm"
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

        {/* ── ABA ENVIO RÁPIDO ─────────────────────────────────────────────── */}
        <TabsContent value="rapido" className="mt-4">
          <div className="max-w-xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Envio avulso imediato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Recipient type toggle */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Tipo de destinatário
                  </label>
                  <div className="flex gap-2">
                    <RecipToggle active={qType === 'group'} icon={<Users className="h-4 w-4" />}
                      label="Grupo" onClick={() => setQType('group')} />
                    <RecipToggle active={qType === 'number'} icon={<Phone className="h-4 w-4" />}
                      label="Número" onClick={() => setQType('number')} />
                  </div>
                </div>

                {/* Recipient ID */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {qType === 'group' ? 'JID do Grupo' : 'Número (DDI+DDD+número)'}
                  </label>
                  <Input
                    placeholder={qType === 'group' ? '5511999999999@g.us' : '5511999999999'}
                    value={qRecip}
                    onChange={e => setQRecip(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {qType === 'group'
                      ? 'JID completo (ex: 5511999999999@g.us) ou número do grupo'
                      : 'DDI + DDD + número (ex: 5511999999999) — DDI 55 adicionado automaticamente se ausente'}
                  </p>
                </div>

                {/* Message */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Mensagem
                  </label>
                  <Textarea
                    placeholder="Digite sua mensagem…"
                    value={qMessage}
                    onChange={e => setQMessage(e.target.value)}
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {qMessage.length} caracteres
                  </p>
                </div>

                <Button
                  onClick={handleQuickSend}
                  disabled={sendingQuick || !qRecip.trim() || !qMessage.trim()}
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                >
                  {sendingQuick
                    ? <><Spinner /> Enviando…</>
                    : <><Send className="h-4 w-4" /> Enviar agora</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir mensagem?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit modal */}
      <MsgModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        form={form}
        setForm={setForm}
        funnelNames={funnelNames}
        isEditing={!!editingId}
        saving={saving}
        onDraft={() => handleSave('draft')}
        onSchedule={() => handleSave('scheduled')}
        onSendNow={handleSendNow}
      />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white flex-shrink-0" />;
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold leading-none ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function RecipToggle({
  active, icon, label, onClick,
}: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${
        active ? 'bg-primary text-white border-primary' : 'border-border text-foreground/70 hover:border-primary/40'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function MsgCard({
  msg, onEdit, onDelete,
}: {
  msg: FunnelMessage; onEdit: () => void; onDelete: () => void;
}) {
  const cfg  = STATUS_CFG[msg.status];
  const Icon = cfg.icon;
  return (
    <Card
      className="hover:shadow-sm transition-shadow group cursor-pointer border"
      onClick={onEdit}
    >
      <CardContent className="pt-3 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{fmtTime(msg.scheduled_at)}</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 gap-1 flex items-center ${cfg.badge}`}
          >
            <Icon className="h-2.5 w-2.5" />
            {cfg.label}
          </Badge>
        </div>

        <p className="text-sm text-foreground line-clamp-2 mb-2 min-h-[2.5rem]">
          {msg.message_text}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            {msg.recipient_type === 'group'
              ? <Users className="h-3 w-3 flex-shrink-0" />
              : <Phone className="h-3 w-3 flex-shrink-0" />}
            <span className="truncate max-w-[120px]">{msg.recipient_id}</span>
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
          <p className="text-[11px] text-red-600 mt-2 line-clamp-2">{msg.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Message Modal ─────────────────────────────────────────────────────────────

interface MsgModalProps {
  open: boolean;
  onClose: () => void;
  form: MessageForm;
  setForm: (f: MessageForm) => void;
  funnelNames: string[];
  isEditing: boolean;
  saving: boolean;
  onDraft: () => void;
  onSchedule: () => void;
  onSendNow: () => void;
}

function MsgModal({
  open, onClose, form, setForm, funnelNames, isEditing, saving,
  onDraft, onSchedule, onSendNow,
}: MsgModalProps) {
  const set = <K extends keyof MessageForm>(k: K, v: MessageForm[K]) =>
    setForm({ ...form, [k]: v });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar mensagem' : 'Nova mensagem'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Funnel name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Funil
            </label>
            {funnelNames.length > 0 && (
              <Select value={form.funnel_name} onValueChange={v => set('funnel_name', v)}>
                <SelectTrigger className="mb-1.5">
                  <SelectValue placeholder="Selecione um funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnelNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="Ou digite um novo nome de funil"
              value={form.funnel_name}
              onChange={e => set('funnel_name', e.target.value)}
            />
          </div>

          {/* Day + date + time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Dia do funil
              </label>
              <Input
                type="number"
                min={1}
                value={form.day_number}
                onChange={e => set('day_number', parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Data
              </label>
              <Input
                type="date"
                value={form.scheduled_date}
                onChange={e => set('scheduled_date', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Horário
              </label>
              <Input
                type="time"
                value={form.scheduled_time}
                onChange={e => set('scheduled_time', e.target.value)}
              />
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Destinatário
            </label>
            <div className="flex gap-2 mb-2">
              <RecipToggle
                active={form.recipient_type === 'group'}
                icon={<Users className="h-3.5 w-3.5" />}
                label="Grupo"
                onClick={() => set('recipient_type', 'group')}
              />
              <RecipToggle
                active={form.recipient_type === 'number'}
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Número"
                onClick={() => set('recipient_type', 'number')}
              />
            </div>
            <Input
              placeholder={form.recipient_type === 'group' ? '5511999999999@g.us' : '5511999999999'}
              value={form.recipient_id}
              onChange={e => set('recipient_id', e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {form.recipient_type === 'group'
                ? 'JID do grupo (ex: 5511999999999@g.us) ou apenas o número'
                : 'DDI + DDD + número · DDI 55 adicionado automaticamente'}
            </p>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Mensagem
            </label>
            <Textarea
              placeholder="Digite a mensagem…"
              value={form.message_text}
              onChange={e => set('message_text', e.target.value)}
              rows={5}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {form.message_text.length} caracteres
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onSendNow}
            disabled={saving}
            className="gap-2 sm:mr-auto"
          >
            <Send className="h-4 w-4" /> Enviar agora
          </Button>
          <Button variant="outline" onClick={onDraft} disabled={saving}>
            Rascunho
          </Button>
          <Button
            onClick={onSchedule}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 gap-2"
          >
            {saving ? <Spinner /> : <Calendar className="h-4 w-4" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
