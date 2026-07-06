import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleDriveUpload } from '@/hooks/useGoogleDriveUpload';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Plus, Upload, Send, FileText, Mic, Video as VideoIcon, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type ParceiroLite = { id: string; nome: string };
type ProdutoLite = { id: string; nome: string; parceiro_id: string };

type EntregaStatus = 'conteudo_novo' | 'em_producao' | 'em_revisao' | 'publicado';

type Entrega = {
  id: string;
  parceiro_id: string;
  produto_id: string | null;
  titulo: string;
  tipo: 'audio' | 'video';
  destinos: string[];
  roteiro: string | null;
  status: EntregaStatus;
  created_at: string;
  parceiros: { nome: string } | null;
};

type Arquivo = { id: string; entrega_id: string; nome: string | null; url: string; created_at: string };
type Comentario = { id: string; entrega_id: string; autor_id: string | null; mensagem: string; created_at: string; profiles: { nome: string } | null };

const COLUNAS: { key: EntregaStatus; label: string }[] = [
  { key: 'conteudo_novo', label: 'Conteúdo novo' },
  { key: 'em_producao', label: 'Em produção' },
  { key: 'em_revisao', label: 'Em revisão' },
  { key: 'publicado', label: 'Publicado' },
];

const DESTINOS_OPCOES = ['reels', 'tiktok', 'youtube'];

const EMPTY_FORM = { parceiro_id: '', produto_id: '', titulo: '', tipo: 'video' as 'audio' | 'video', destinos: [] as string[], roteiro: '' };

// ── Componente principal ─────────────────────────────────────────────────────

export function EntregasParceiros({ scopedParceiroId }: { scopedParceiroId?: string }) {
  const admin = !scopedParceiroId;
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoDialog, setNovoDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detalhe, setDetalhe] = useState<Entrega | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('parceiros_entregas' as any)
      .select('id, parceiro_id, produto_id, titulo, tipo, destinos, roteiro, status, created_at, parceiros(nome)')
      .order('created_at', { ascending: false });
    if (scopedParceiroId) query = query.eq('parceiro_id', scopedParceiroId);
    const { data, error } = await query;
    if (error) { toast.error(`Erro ao carregar entregas: ${error.message}`); setLoading(false); return; }
    setEntregas((data as any) || []);
    setLoading(false);
  }, [scopedParceiroId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setParceiros((data as any) || []));
  }, [admin]);

  useEffect(() => {
    let query = supabase.from('parceiros_produtos' as any).select('id, nome, parceiro_id');
    if (scopedParceiroId) query = query.eq('parceiro_id', scopedParceiroId);
    query.then(({ data }) => setProdutos((data as any) || []));
  }, [scopedParceiroId]);

  const criarEntrega = async () => {
    if (!form.parceiro_id || !form.titulo.trim()) { toast.error('Selecione a parceira e informe um título.'); return; }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from('parceiros_entregas' as any).insert({
      parceiro_id: form.parceiro_id,
      produto_id: form.produto_id || null,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      destinos: form.destinos,
      roteiro: form.roteiro.trim() || null,
      criado_por: sessionData.session?.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(`Erro ao criar pedido: ${error.message}`); return; }
    toast.success('Pedido de gravação criado.');
    setForm(EMPTY_FORM);
    setNovoDialog(false);
    load();
  };

  const moverStatus = async (entrega: Entrega, status: EntregaStatus) => {
    const { error } = await supabase.from('parceiros_entregas' as any).update({ status }).eq('id', entrega.id);
    if (error) { toast.error(`Erro ao mover: ${error.message}`); return; }
    load();
    setDetalhe(d => d && d.id === entrega.id ? { ...d, status } : d);
  };

  return (
    <div className="space-y-4">
      {admin && (
        <div className="flex justify-end">
          <Button onClick={() => setNovoDialog(true)}><Plus className="h-4 w-4 mr-1" /> Novo pedido de gravação</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLUNAS.map(col => {
            const cards = entregas.filter(e => e.status === col.key);
            return (
              <div key={col.key} className="bg-muted/30 rounded-xl p-2 space-y-2 min-h-[200px]">
                <p className="text-xs font-semibold text-muted-foreground px-2 py-1">{col.label} · {cards.length}</p>
                {cards.map(e => (
                  <button key={e.id} onClick={() => setDetalhe(e)} className="w-full text-left bg-white border border-border rounded-lg p-3 hover:border-primary/40 transition-colors space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {e.tipo === 'audio' ? <Mic className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" /> : <VideoIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                      <p className="text-sm font-medium text-foreground truncate">{e.titulo}</p>
                    </div>
                    {admin && <p className="text-xs text-muted-foreground">{e.parceiros?.nome ?? 'Parceira'}</p>}
                    <div className="flex flex-wrap gap-1">
                      {e.destinos?.map(d => <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{d}</Badge>)}
                    </div>
                  </button>
                ))}
                {cards.length === 0 && <p className="text-xs text-muted-foreground/60 text-center py-6">Nenhum card</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Novo pedido */}
      <Dialog open={novoDialog} onOpenChange={setNovoDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo pedido de gravação</DialogTitle>
            <DialogDescription>Entra automaticamente na coluna "Conteúdo novo".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.parceiro_id} onValueChange={v => setForm(f => ({ ...f, parceiro_id: v, produto_id: '' }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Parceira" /></SelectTrigger>
                <SelectContent>{parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.produto_id || 'none'} onValueChange={v => setForm(f => ({ ...f, produto_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Produto (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem produto específico</SelectItem>
                  {produtos.filter(p => !form.parceiro_id || p.parceiro_id === form.parceiro_id).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Título do pedido (ex: Corte semanal — episódio 12)" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            <div className="flex items-center gap-4">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as 'audio' | 'video' }))}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destino</Label>
              <div className="flex gap-2">
                {DESTINOS_OPCOES.map(d => {
                  const ativo = form.destinos.includes(d);
                  return (
                    <button
                      key={d} type="button"
                      onClick={() => setForm(f => ({ ...f, destinos: ativo ? f.destinos.filter(x => x !== d) : [...f.destinos, d] }))}
                      className={cn('px-3 py-1.5 rounded-md border text-xs capitalize transition-colors', ativo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted')}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Roteiro completo</Label>
              <Textarea rows={5} placeholder="Cole aqui o roteiro completo da gravação..." value={form.roteiro} onChange={e => setForm(f => ({ ...f, roteiro: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={saving} onClick={criarEntrega}>{saving ? 'Criando...' : 'Criar pedido'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhe do card */}
      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detalhe && <DetalheEntrega entrega={detalhe} admin={admin} onMover={moverStatus} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Detalhe do card (roteiro, upload, comentarios) ───────────────────────────

function DetalheEntrega({ entrega, admin, onMover }: { entrega: Entrega; admin: boolean; onMover: (e: Entrega, status: EntregaStatus) => void }) {
  const { user } = useAuth();
  const { uploadToDrive, uploading, progress, statusMessage } = useGoogleDriveUpload();
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [arqRes, comRes] = await Promise.all([
      supabase.from('parceiros_entregas_arquivos' as any).select('id, entrega_id, nome, url, created_at').eq('entrega_id', entrega.id).order('created_at', { ascending: false }),
      supabase.from('parceiros_entregas_comentarios' as any).select('id, entrega_id, autor_id, mensagem, created_at, profiles(nome)').eq('entrega_id', entrega.id).order('created_at', { ascending: true }),
    ]);
    setArquivos((arqRes.data as any) || []);
    setComentarios((comRes.data as any) || []);
    setLoading(false);
  }, [entrega.id]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const url = await uploadToDrive(file);
      const { error } = await supabase.from('parceiros_entregas_arquivos' as any).insert({
        entrega_id: entrega.id, nome: file.name, url, enviado_por: user?.id ?? null,
      });
      if (error) { toast.error(`Arquivo enviado ao Drive, mas não salvei o link: ${error.message}`); return; }
      toast.success('Gravação enviada!');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Erro no upload.');
    }
  };

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    setEnviandoComentario(true);
    const { error } = await supabase.from('parceiros_entregas_comentarios' as any).insert({
      entrega_id: entrega.id, autor_id: user?.id ?? null, mensagem: novoComentario.trim(),
    });
    setEnviandoComentario(false);
    if (error) { toast.error(`Erro ao comentar: ${error.message}`); return; }
    setNovoComentario('');
    load();
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{entrega.titulo}</DialogTitle>
        <DialogDescription>
          {entrega.parceiros?.nome ?? 'Parceira'} · {entrega.tipo === 'audio' ? 'Áudio' : 'Vídeo'}
          {entrega.destinos?.length ? ` · ${entrega.destinos.join(', ')}` : ''}
        </DialogDescription>
      </DialogHeader>

      {admin && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Status:</Label>
          <Select value={entrega.status} onValueChange={(v) => onMover(entrega, v as EntregaStatus)}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{COLUNAS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {entrega.roteiro && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Roteiro</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{entrega.roteiro}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Gravações</p>
        {arquivos.map(a => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> {a.nome || 'Arquivo'}
          </a>
        ))}
        <label className="inline-flex items-center gap-1.5 text-xs h-9 px-3 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors w-fit">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? `${statusMessage} ${progress}%` : 'Anexar gravação (Google Drive)'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Conversa</p>
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {comentarios.length === 0 && <p className="text-xs text-muted-foreground/60">Nenhuma mensagem ainda.</p>}
            {comentarios.map(c => {
              const mine = c.autor_id === user?.id;
              return (
                <div key={c.id} className={cn('max-w-[85%] rounded-lg px-3 py-2', mine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
                  <p className={cn('text-[11px] font-medium mb-0.5', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{c.profiles?.nome ?? 'Usuário'}</p>
                  <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Input placeholder="Escreva uma mensagem..." value={novoComentario} onChange={e => setNovoComentario(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviarComentario()} />
          <Button size="sm" disabled={enviandoComentario} onClick={enviarComentario}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
