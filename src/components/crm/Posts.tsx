import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Image as ImageIcon, Clock, CheckCircle2, Send, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type PostStatus = 'rascunho' | 'aprovado' | 'publicado' | 'rejeitado';

type ConteudoCliente = { id: string; slug: string; nome: string };

type ConteudoPost = {
  id: string;
  cliente_id: string;
  data_post: string;
  tema: string | null;
  tema_fonte: string | null;
  legenda: string | null;
  imagem_feed_url: string | null;
  imagem_stories_url: string | null;
  status: PostStatus;
  conteudo_clientes: ConteudoCliente | null;
};

const STATUS_CONFIG: Record<PostStatus, { label: string; className: string }> = {
  rascunho:  { label: 'Rascunho',  className: 'bg-gray-100 text-gray-700 border-gray-200' },
  aprovado:  { label: 'Aprovado',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  publicado: { label: 'Publicado', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  rejeitado: { label: 'Rejeitado', className: 'bg-red-100 text-red-700 border-red-200' },
};

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Posts tab ────────────────────────────────────────────────────────────────

export function Posts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<ConteudoPost[]>([]);
  const [clientes, setClientes] = useState<ConteudoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCliente, setFilterCliente] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [stats, setStats] = useState({ hoje: 0, pendentes: 0, publicadosMes: 0 });
  const [detailPost, setDetailPost] = useState<ConteudoPost | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('conteudo_clientes' as any).select('id, slug, nome').order('nome')
      .then(({ data }) => setClientes((data as any) || []));
  }, []);

  const loadStats = useCallback(async () => {
    const hojeStr = format(new Date(), 'yyyy-MM-dd');
    const primeiroDiaMes = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
    const [hoje, pendentes, publicadosMes] = await Promise.all([
      supabase.from('conteudo_posts' as any).select('id', { count: 'exact', head: true }).eq('data_post', hojeStr),
      supabase.from('conteudo_posts' as any).select('id', { count: 'exact', head: true }).eq('status', 'rascunho'),
      supabase.from('conteudo_posts' as any).select('id', { count: 'exact', head: true }).eq('status', 'publicado').gte('data_post', primeiroDiaMes),
    ]);
    setStats({
      hoje: (hoje as any).count || 0,
      pendentes: (pendentes as any).count || 0,
      publicadosMes: (publicadosMes as any).count || 0,
    });
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    let query = (supabase.from('conteudo_posts' as any) as any)
      .select('id, cliente_id, data_post, tema, tema_fonte, legenda, imagem_feed_url, imagem_stories_url, status, conteudo_clientes(id, slug, nome)')
      .order('data_post', { ascending: false })
      .limit(60);

    if (filterCliente !== 'all') query = query.eq('cliente_id', filterCliente);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data, error } = await query;
    if (error) {
      toast.error(`Erro ao carregar posts: ${error.message}`);
      setLoading(false);
      return;
    }
    setPosts((data as any) || []);
    setLoading(false);
  }, [filterCliente, filterStatus]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  const updateStatus = async (post: ConteudoPost, status: PostStatus) => {
    setActingId(post.id);
    const patch: Record<string, unknown> = { status };
    if (status === 'aprovado') {
      patch.aprovado_por = user?.id ?? null;
      patch.aprovado_em = new Date().toISOString();
    }
    const { error } = await (supabase.from('conteudo_posts' as any) as any).update(patch).eq('id', post.id);
    setActingId(null);
    if (error) {
      toast.error(`Erro ao atualizar post: ${error.message}`);
      return;
    }
    toast.success(
      status === 'aprovado' ? 'Post aprovado!' : status === 'publicado' ? 'Post marcado como publicado!' : 'Post rejeitado.',
    );
    loadPosts();
    loadStats();
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Post</h1>
        <p className="text-sm text-muted-foreground">Criativos e legendas gerados diariamente para revisão e aprovação.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Clock} label="Posts hoje" value={stats.hoje} color="bg-blue-50 text-blue-600" />
        <StatCard icon={ImageIcon} label="Pendentes de aprovação" value={stats.pendentes} color="bg-amber-50 text-amber-600" />
        <StatCard icon={CheckCircle2} label="Publicados no mês" value={stats.publicadosMes} color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterCliente} onValueChange={setFilterCliente}>
          <SelectTrigger className="w-[200px] border-border"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px] border-border"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([value, cfg]) => <SelectItem key={value} value={value}>{cfg.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum post gerado ainda para os filtros selecionados.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {posts.map((post) => {
            const statusCfg = STATUS_CONFIG[post.status];
            return (
              <div key={post.id} className="bg-white border border-border rounded-xl overflow-hidden flex flex-col">
                <button className="aspect-square bg-muted overflow-hidden w-full" onClick={() => setDetailPost(post)}>
                  {post.imagem_feed_url
                    ? <img src={post.imagem_feed_url} alt={post.tema ?? 'Criativo'} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>}
                </button>
                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary truncate">{post.conteudo_clientes?.nome ?? 'Cliente'}</span>
                    <Badge variant="outline" className={statusCfg.className}>{statusCfg.label}</Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">{post.tema ?? 'Sem tema'}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{post.legenda ?? 'Sem legenda'}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(post.data_post), "dd 'de' MMMM", { locale: ptBR })}</p>
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      disabled={actingId === post.id || post.status === 'aprovado'}
                      onClick={() => updateStatus(post, 'aprovado')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      disabled={actingId === post.id || post.status === 'publicado'}
                      onClick={() => updateStatus(post, 'publicado')}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Publicado
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      disabled={actingId === post.id}
                      onClick={() => updateStatus(post, 'rejeitado')}
                      title="Rejeitar"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailPost} onOpenChange={(open) => !open && setDetailPost(null)}>
        <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden rounded-xl">
          {detailPost && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{detailPost.conteudo_clientes?.nome} · {detailPost.tema}</DialogTitle>
                <DialogDescription>Preview do post</DialogDescription>
              </DialogHeader>

              {/* Instagram-style header */}
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(detailPost.conteudo_clientes?.nome ?? 'C')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{detailPost.conteudo_clientes?.nome ?? 'Cliente'}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{detailPost.tema ?? 'Post'}</p>
                </div>
                <Badge variant="outline" className={STATUS_CONFIG[detailPost.status].className + ' text-[10px]'}>
                  {STATUS_CONFIG[detailPost.status].label}
                </Badge>
              </div>

              {/* Image — square aspect ratio */}
              <div className="aspect-square w-full bg-black overflow-hidden">
                {detailPost.imagem_feed_url
                  ? <img src={detailPost.imagem_feed_url} alt={detailPost.tema ?? ''} className="w-full h-full object-contain" />
                  : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="h-12 w-12" /></div>}
              </div>

              {/* Caption area */}
              <div className="px-3.5 py-3 space-y-2 max-h-[200px] overflow-y-auto border-t border-border">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  <span className="font-semibold">{detailPost.conteudo_clientes?.slug ?? detailPost.conteudo_clientes?.nome?.toLowerCase().replace(/\s+/g, '') ?? 'cliente'}</span>{' '}
                  {detailPost.legenda ?? 'Sem legenda'}
                </p>
                <p className="text-[11px] text-muted-foreground uppercase">
                  {format(new Date(detailPost.data_post), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5 px-3.5 py-2.5 border-t border-border bg-muted/30">
                <Button
                  size="sm" variant="outline" className="flex-1 h-8 text-xs"
                  disabled={actingId === detailPost.id || detailPost.status === 'aprovado'}
                  onClick={() => { updateStatus(detailPost, 'aprovado'); setDetailPost(null); }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                </Button>
                <Button
                  size="sm" variant="outline" className="flex-1 h-8 text-xs"
                  disabled={actingId === detailPost.id || detailPost.status === 'publicado'}
                  onClick={() => { updateStatus(detailPost, 'publicado'); setDetailPost(null); }}
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Publicado
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                  disabled={actingId === detailPost.id}
                  onClick={() => { updateStatus(detailPost, 'rejeitado'); setDetailPost(null); }}
                  title="Rejeitar"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
