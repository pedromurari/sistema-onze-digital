import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { format, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Instagram,
  LayoutGrid,
  ListFilter,
  Loader2,
  Linkedin,
  Music,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Youtube,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useCalendario } from './useCalendario';
import { useGoogleDriveUpload } from '@/hooks/useGoogleDriveUpload';

type ContentView = 'grade' | 'calendario' | 'kanban';
type ContentStatus = 'ideia' | 'roteiro' | 'gravando' | 'editando' | 'aprovado' | 'agendado' | 'publicado';
type ContentPlatform = 'instagram' | 'youtube' | 'tiktok' | 'linkedin';

export interface ConteudoCalendario {
  id: string;
  titulo: string;
  plataforma: string | null;
  formato?: string | null;
  data_publicacao: string | null;
  status: string | null;
  legenda?: string | null;
  observacoes?: string | null;
  texto_peca?: string | null;
  link?: string | null;
  imagem_url?: string | null;
}

interface CalendarioConteudoViewProps {
  conteudos: ConteudoCalendario[];
  onLoadData: () => void;
  createRequest?: number;
}

interface ContentForm {
  titulo: string;
  plataforma: ContentPlatform;
  formato: string;
  status: ContentStatus;
  data_publicacao: string;
  legenda: string;
  observacoes: string;
  texto_peca: string;
  link: string;
}

const STATUS = [
  { id: 'ideia', label: 'Planejado', color: 'bg-slate-500', hex: '#64748b' },
  { id: 'roteiro', label: 'Roteiro', color: 'bg-blue-600', hex: '#2563eb' },
  { id: 'gravando', label: 'Em criação', color: 'bg-orange-600', hex: '#ea580c' },
  { id: 'editando', label: 'Em revisão', color: 'bg-amber-600', hex: '#d97706' },
  { id: 'aprovado', label: 'Aprovado', color: 'bg-emerald-600', hex: '#059669' },
  { id: 'agendado', label: 'Programado', color: 'bg-violet-600', hex: '#7c3aed' },
  { id: 'publicado', label: 'Publicado', color: 'bg-green-700', hex: '#15803d' },
] as const;

const PLATFORM = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'linkedin', label: 'LinkedIn' },
] as const;

const FORMAT = [
  { id: 'reels', label: 'Reel / corte' },
  { id: 'feed', label: 'Post simples' },
  { id: 'stories', label: 'Story' },
  { id: 'carrossel', label: 'Carrossel' },
  { id: 'video', label: 'Vídeo' },
  { id: 'short', label: 'Short' },
  { id: 'anuncio', label: 'Anúncio' },
] as const;

const CATEGORIAS = [
  { label: 'Tudo', test: () => true },
  { label: '🎬 Reels/Shorts/TikTok', test: (c: ConteudoCalendario) => c.formato === 'reels' || c.formato === 'short' },
  { label: '📢 Anúncios', test: (c: ConteudoCalendario) => c.formato === 'anuncio' },
  { label: '📺 YouTube Longo', test: (c: ConteudoCalendario) => c.plataforma === 'youtube' && c.formato === 'video' },
] as const;

const emptyForm = (date = ''): ContentForm => ({
  titulo: '',
  plataforma: 'instagram',
  formato: 'reels',
  status: 'ideia',
  data_publicacao: date,
  legenda: '',
  observacoes: '',
  texto_peca: '',
  link: '',
});

const normalizeStatus = (status: string | null): ContentStatus => {
  if (STATUS.some(item => item.id === status)) return status as ContentStatus;
  return 'ideia';
};

const statusMeta = (status: string | null) => STATUS.find(item => item.id === normalizeStatus(status)) ?? STATUS[0];
const formatMeta = (contentFormat?: string | null) => FORMAT.find(item => item.id === contentFormat)?.label ?? contentFormat ?? 'Conteúdo';
const dateLabel = (value: string | null) => value ? format(parseISO(value.slice(0, 10)), 'dd/MM/yyyy') : 'Sem data';
const searchText = (content: ConteudoCalendario) => `${content.titulo} ${content.legenda ?? ''} ${content.observacoes ?? ''}`.toLocaleLowerCase('pt-BR');

function PlatformIcon({ platform, className = 'h-4 w-4' }: { platform: string | null; className?: string }) {
  const Icon = platform === 'youtube' ? Youtube : platform === 'tiktok' ? Music : platform === 'linkedin' ? Linkedin : Instagram;
  return <Icon className={className} />;
}

function ContentCard({
  content,
  onOpen,
  onStatusChange,
}: {
  content: ConteudoCalendario;
  onOpen: (content: ConteudoCalendario) => void;
  onStatusChange: (content: ConteudoCalendario, status: ContentStatus) => void;
}) {
  const status = normalizeStatus(content.status);
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors">
      <button type="button" className="w-full text-left" onClick={() => onOpen(content)}>
        <p className="font-semibold text-sm line-clamp-2 text-foreground">{content.titulo}</p>
        <p className="text-xs text-muted-foreground mt-1">{dateLabel(content.data_publicacao)} · {formatMeta(content.formato)}</p>
        {content.texto_peca ? <p className="mt-1 text-xs text-primary">Roteiro completo no card</p> : null}
      </button>
      <div className="flex items-center gap-2">
        <select
          aria-label={`Status de ${content.titulo}`}
          value={status}
          onChange={event => onStatusChange(content, event.target.value as ContentStatus)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {STATUS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {content.link || content.imagem_url ? (
          <a href={content.link ?? content.imagem_url ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir mídia de ${content.titulo}`}>
            <ExternalLink className="h-4 w-4 text-primary" />
          </a>
        ) : null}
      </div>
      {!content.link && !content.imagem_url ? <p className="text-xs text-amber-600">Arquivo/link pendente</p> : null}
    </div>
  );
}

function ContentFormFields({ form, onChange }: { form: ContentForm; onChange: (next: ContentForm) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="conteudo-titulo">Título *</Label>
        <Input id="conteudo-titulo" required minLength={2} maxLength={160} value={form.titulo} onChange={event => onChange({ ...form, titulo: event.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Data planejada</Label>
          <Input type="date" value={form.data_publicacao} onChange={event => onChange({ ...form, data_publicacao: event.target.value })} />
        </div>
        <div>
          <Label>Formato</Label>
          <Select value={form.formato} onValueChange={value => onChange({ ...form, formato: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FORMAT.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Plataforma</Label>
          <Select value={form.plataforma} onValueChange={value => onChange({ ...form, plataforma: value as ContentPlatform })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PLATFORM.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={value => onChange({ ...form, status: value as ContentStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Link do vídeo ou arte</Label>
        <Input type="url" maxLength={2000} placeholder="https://drive.google.com/..." value={form.link} onChange={event => onChange({ ...form, link: event.target.value })} />
      </div>
      <div>
        <Label>Legenda / copy</Label>
        <Textarea rows={4} maxLength={5000} value={form.legenda} onChange={event => onChange({ ...form, legenda: event.target.value })} />
      </div>
      <div>
        <Label htmlFor="conteudo-roteiro">Roteiro completo / falas de gravação</Label>
        <Textarea id="conteudo-roteiro" rows={16} className="font-mono text-xs" value={form.texto_peca} onChange={event => onChange({ ...form, texto_peca: event.target.value })} placeholder="Cole aqui a copy completa, com falas, cenas e CTA." />
      </div>
      <div>
        <Label>Observações internas</Label>
        <Textarea rows={3} maxLength={5000} value={form.observacoes} onChange={event => onChange({ ...form, observacoes: event.target.value })} />
      </div>
    </div>
  );
}

export function CalendarioConteudoView({ conteudos, onLoadData, createRequest = 0 }: CalendarioConteudoViewProps) {
  const { currentDate, currentMonth, currentYear, getWeeksInMonth, mesAnterior, mesProximo, irParaHoje } = useCalendario();
  const [view, setView] = useState<ContentView>('grade');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [platformFilter, setPlatformFilter] = useState('todas');
  const [formatFilter, setFormatFilter] = useState('todos');
  const [categoria, setCategoria] = useState('Tudo');
  const [editing, setEditing] = useState<ConteudoCalendario | null | undefined>();
  const [form, setForm] = useState<ContentForm>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadToDrive, getAccessToken, hasAccessToken, uploading, progress, statusMessage } = useGoogleDriveUpload();

  useEffect(() => {
    if (createRequest > 0) {
      setEditing(null);
      setForm(emptyForm());
    }
  }, [createRequest]);

  const filtered = useMemo(() => {
    const query = search.toLocaleLowerCase('pt-BR').trim();
    const categoriaAtiva = CATEGORIAS.find(c => c.label === categoria) ?? CATEGORIAS[0];
    return conteudos.filter(content => {
      const matchesSearch = !query || searchText(content).includes(query);
      const matchesStatus = statusFilter === 'todos' || normalizeStatus(content.status) === statusFilter;
      const matchesPlatform = platformFilter === 'todas' || content.plataforma === platformFilter;
      const matchesFormat = formatFilter === 'todos' || content.formato === formatFilter;
      const matchesCategoria = categoriaAtiva.test(content);
      return matchesSearch && matchesStatus && matchesPlatform && matchesFormat && matchesCategoria;
    });
  }, [categoria, conteudos, formatFilter, platformFilter, search, statusFilter]);

  const byDate = useMemo(() => {
    const grouped = new Map<string, ConteudoCalendario[]>();
    for (const content of filtered) {
      if (!content.data_publicacao) continue;
      const key = content.data_publicacao.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), content]);
    }
    return grouped;
  }, [filtered]);

  const openCreate = (date = '') => {
    setForm(emptyForm(date));
    setEditing(null);
  };

  const openEdit = (content: ConteudoCalendario) => {
    setForm({
      titulo: content.titulo,
      plataforma: (content.plataforma ?? 'instagram') as ContentPlatform,
      formato: content.formato ?? 'reels',
      status: normalizeStatus(content.status),
      data_publicacao: content.data_publicacao?.slice(0, 10) ?? '',
      legenda: content.legenda ?? '',
      observacoes: content.observacoes ?? '',
      texto_peca: content.texto_peca ?? '',
      link: content.link ?? '',
    });
    setEditing(content);
  };

  const validateReadyContent = (next: ContentForm | ConteudoCalendario, status: ContentStatus) => {
    if (!['agendado', 'publicado'].includes(status)) return true;
    if (next.data_publicacao && next.link && next.legenda?.trim()) return true;
    toast({ variant: 'destructive', title: 'Antes de programar ou publicar, informe data, legenda e link.' });
    return false;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.titulo.trim() || !form.data_publicacao || !validateReadyContent(form, form.status)) return;
    setSaving(true);
    const values = {
      titulo: form.titulo.trim(),
      plataforma: form.plataforma,
      formato: form.formato,
      status: form.status,
      data_publicacao: form.data_publicacao,
      legenda: form.legenda.trim() || null,
      observacoes: form.observacoes.trim() || null,
      texto_peca: form.texto_peca.trim() || null,
      link: form.link.trim() || null,
    };
    const result = editing
      ? await supabase.from('conteudo_calendario').update(values).eq('id', editing.id)
      : await supabase.from('conteudo_calendario').insert(values);
    setSaving(false);
    if (result.error) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar o conteúdo', description: result.error.message });
      return;
    }
    setEditing(undefined);
    onLoadData();
    toast({ title: editing ? 'Conteúdo atualizado' : 'Conteúdo criado' });
  };

  const changeStatus = async (content: ConteudoCalendario, status: ContentStatus) => {
    if (!validateReadyContent(content, status)) return;
    const { error } = await supabase.from('conteudo_calendario').update({ status }).eq('id', content.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível mover o conteúdo', description: error.message });
      return;
    }
    onLoadData();
  };

  const remove = async () => {
    if (!editing) return;
    setDeleting(true);
    const { error } = await supabase.from('conteudo_calendario').delete().eq('id', editing.id);
    setDeleting(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível excluir o conteúdo', description: error.message });
      return;
    }
    setEditing(undefined);
    onLoadData();
    toast({ title: 'Conteúdo excluído' });
  };

  const chooseFile = async () => {
    if (!editing || uploading) return;
    if (!hasAccessToken()) {
      try {
        await getAccessToken();
        toast({ title: 'Drive autorizado', description: 'Clique em Enviar arquivo novamente para escolher a mídia.' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Não foi possível autorizar o Drive', description: error instanceof Error ? error.message : undefined });
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editing) return;
    const contentId = editing.id;
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const mesAtual = `${partes.find(p => p.type === 'year')?.value}-${partes.find(p => p.type === 'month')?.value}`;
    const mes = editing.data_publicacao?.slice(0, 7) || mesAtual;
    try {
      const url = await uploadToDrive(file, { month: mes, cardId: contentId, publicLink: false });
      const { error } = await supabase.from('conteudo_calendario').update({ link: url }).eq('id', contentId);
      if (error) throw error;
      setForm(current => ({ ...current, link: url }));
      onLoadData();
      toast({ title: 'Arquivo enviado para a pasta do conteúdo', description: file.name });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Falha ao enviar arquivo', description: error instanceof Error ? error.message : 'Tente novamente.' });
    }
  };

  const weeks = getWeeksInMonth(currentYear, currentMonth);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Produção de conteúdo</h2>
          <p className="text-sm text-muted-foreground">Planeje cortes, acompanhe a criação e organize a publicação.</p>
        </div>
        <Button onClick={() => openCreate()}><Plus className="mr-2 h-4 w-4" />Novo conteúdo</Button>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="font-semibold text-foreground">Calendário editorial</p>
        <p className="text-sm text-muted-foreground">“Programado” registra a data no planejamento. A publicação na rede social continua manual até conectarmos a conta da plataforma.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIAS.map(cat => {
          const count = conteudos.filter(cat.test).length;
          const active = categoria === cat.label;
          return (
            <Button
              key={cat.label}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              onClick={() => setCategoria(cat.label)}
              className="gap-1.5"
            >
              {cat.label} <span className="opacity-70">({count})</span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar conteúdos" className="pl-9" placeholder="Buscar conteúdo..." value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{STATUS.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Plataforma" /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as redes</SelectItem>{PLATFORM.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-44" aria-label="Filtrar por formato"><SelectValue placeholder="Formato" /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os formatos</SelectItem>{FORMAT.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-lg border border-border p-1 gap-1">
          {([
            ['grade', 'Grade', LayoutGrid],
            ['calendario', 'Calendário', CalendarDays],
            ['kanban', 'Kanban', ListFilter],
          ] as const).map(([id, label, Icon]) => (
            <Button key={id} size="sm" variant={view === id ? 'default' : 'ghost'} onClick={() => setView(id)}>
              <Icon className="mr-1.5 h-4 w-4" />{label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} conteúdo(s) · {filtered.filter(content => normalizeStatus(content.status) === 'publicado').length} publicado(s)</p>

      {view === 'grade' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(content => <ContentCard key={content.id} content={content} onOpen={openEdit} onStatusChange={changeStatus} />)}
        </div>
      ) : null}

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {STATUS.map(status => {
            const column = filtered.filter(content => normalizeStatus(content.status) === status.id);
            return (
              <section key={status.id} className="w-72 shrink-0 rounded-xl border border-border bg-muted/20" aria-label={status.label}>
                <h3 className={cn(status.color, 'rounded-t-xl px-3 py-2 text-sm font-semibold text-white flex justify-between')}>
                  <span>{status.label}</span><span>{column.length}</span>
                </h3>
                <div className="p-2 space-y-2 min-h-24">{column.map(content => <ContentCard key={content.id} content={content} onOpen={openEdit} onStatusChange={changeStatus} />)}</div>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === 'calendario' ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <Button size="icon" variant="ghost" aria-label="Mês anterior" onClick={mesAnterior}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</h3>
              <Button size="sm" variant="outline" onClick={irParaHoje}>Hoje</Button>
            </div>
            <Button size="icon" variant="ghost" aria-label="Próximo mês" onClick={mesProximo}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold bg-muted/50">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day} className="p-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flat().map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const dayContents = byDate.get(key) ?? [];
              return (
                <div key={key} className={cn('min-h-28 border-t border-r border-border p-1.5', !isSameMonth(day, currentDate) && 'bg-muted/30 text-muted-foreground', isSameDay(day, new Date()) && 'bg-primary/5')}>
                  <button type="button" className={cn('rounded px-1 text-xs font-medium hover:bg-primary/10', isSameDay(day, new Date()) && 'bg-primary text-primary-foreground')} onClick={() => openCreate(key)}>{day.getDate()}</button>
                  <div className="mt-1 space-y-1">
                    {dayContents.slice(0, 3).map(content => (
                      <button key={content.id} type="button" onClick={() => openEdit(content)} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[10px] text-white" style={{ backgroundColor: statusMeta(content.status).hex }} title={content.titulo}>
                        <PlatformIcon platform={content.plataforma} className="h-3 w-3 shrink-0" /><span className="truncate">{content.titulo}</span>
                      </button>
                    ))}
                    {dayContents.length > 3 ? <p className="text-[10px] text-muted-foreground">+{dayContents.length - 3} mais</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum conteúdo encontrado. Crie o primeiro pelo botão acima.</div> : null}

      <Dialog open={editing !== undefined} onOpenChange={open => { if (!open && !uploading) setEditing(undefined); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar conteúdo' : 'Novo conteúdo'}</DialogTitle>
            <DialogDescription>O mesmo registro aparece na grade, no Kanban e no calendário editorial.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <ContentFormFields form={form} onChange={setForm} />
            {editing && <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <input ref={fileInputRef} type="file" accept="video/*,image/*,application/pdf" className="hidden" onChange={event => void uploadFile(event)} aria-label="Arquivo de mídia do conteúdo" />
              <Button type="button" variant="outline" disabled={uploading || saving} onClick={() => void chooseFile()}><UploadCloud className="mr-2 h-4 w-4" />{uploading ? `Enviando ${progress}%` : 'Enviar arquivo ao Drive'}</Button>
              <p className="text-xs text-muted-foreground">Arquivos em Marketing / mês / card. Salve o conteúdo antes do primeiro upload. O link novo substitui o link principal; versões anteriores permanecem na pasta. Acesso conforme permissões do Drive.</p>
              {uploading && <p role="status" className="text-xs text-muted-foreground">{statusMessage}</p>}
            </div>}
            <div className="flex justify-between gap-2 pt-2">
              {editing ? <Button type="button" variant="destructive" disabled={deleting || uploading} onClick={remove}><Trash2 className="mr-1 h-4 w-4" />{deleting ? 'Excluindo...' : 'Excluir'}</Button> : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={uploading} onClick={() => setEditing(undefined)}>Cancelar</Button>
                <Button type="submit" disabled={saving || uploading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{saving ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
