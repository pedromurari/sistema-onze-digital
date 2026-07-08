import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Image as ImageIcon, Clock, CheckCircle2, Send, XCircle, Loader2, Download, Copy, Users, Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type PostStatus = 'rascunho' | 'aprovado' | 'publicado' | 'rejeitado';

type ConteudoCliente = { id: string; slug: string; nome: string };

type EstiloVisual = 'manchete' | 'editorial';

type ConteudoClienteFull = {
  id: string;
  slug: string;
  nome: string;
  nicho: string | null;
  publico_alvo: string | null;
  tom_de_voz: string | null;
  cta_padrao: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  logo_url: string | null;
  hashtags_fixas: string[] | null;
  temas_evitar: string[] | null;
  pilares_conteudo: string[] | null;
  estilo_visual: EstiloVisual;
  formula_headline: string | null;
  arquetipos_visuais_preferidos: string[] | null;
  arquetipos_visuais_evitar: string[] | null;
  ativo: boolean;
};

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

// ── Clientes tab ─────────────────────────────────────────────────────────────

function slugify(nome: string) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const CLIENTE_VAZIO = {
  nome: '', slug: '', nicho: '', publico_alvo: '', tom_de_voz: '', cta_padrao: '',
  cor_primaria: '', cor_secundaria: '', logo_url: '',
  hashtags_fixas: '', temas_evitar: '', pilares_conteudo: '',
  estilo_visual: 'manchete' as EstiloVisual, formula_headline: '',
  arquetipos_visuais_preferidos: '', arquetipos_visuais_evitar: '',
  ativo: true,
};

const arrParaTexto = (arr: string[] | null | undefined) => (arr ?? []).join(', ');
const textoParaArr = (texto: string) => texto.split(',').map(s => s.trim()).filter(Boolean);

function ClientesTab({ onClientesChanged }: { onClientesChanged: () => void }) {
  const [clientes, setClientes] = useState<ConteudoClienteFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConteudoClienteFull | null>(null);
  const [form, setForm] = useState(CLIENTE_VAZIO);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from('conteudo_clientes' as any) as any)
      .select('id, slug, nome, nicho, publico_alvo, tom_de_voz, cta_padrao, cor_primaria, cor_secundaria, logo_url, hashtags_fixas, temas_evitar, pilares_conteudo, estilo_visual, formula_headline, arquetipos_visuais_preferidos, arquetipos_visuais_evitar, ativo')
      .order('nome');
    if (error) { toast.error(`Erro ao carregar clientes: ${error.message}`); setLoading(false); return; }
    setClientes((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadClientes(); }, [loadClientes]);

  const abrirNovo = () => { setEditing(null); setForm(CLIENTE_VAZIO); setDialogOpen(true); };
  const abrirEdicao = (c: ConteudoClienteFull) => {
    setEditing(c);
    setForm({
      nome: c.nome, slug: c.slug, nicho: c.nicho ?? '', publico_alvo: c.publico_alvo ?? '',
      tom_de_voz: c.tom_de_voz ?? '', cta_padrao: c.cta_padrao ?? '',
      cor_primaria: c.cor_primaria ?? '', cor_secundaria: c.cor_secundaria ?? '', logo_url: c.logo_url ?? '',
      hashtags_fixas: arrParaTexto(c.hashtags_fixas), temas_evitar: arrParaTexto(c.temas_evitar),
      pilares_conteudo: arrParaTexto(c.pilares_conteudo), estilo_visual: c.estilo_visual,
      formula_headline: c.formula_headline ?? '',
      arquetipos_visuais_preferidos: arrParaTexto(c.arquetipos_visuais_preferidos),
      arquetipos_visuais_evitar: arrParaTexto(c.arquetipos_visuais_evitar),
      ativo: c.ativo,
    });
    setDialogOpen(true);
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('conteudo-clientes-logos').upload(path, file);
    if (error) { toast.error(`Erro ao subir logo: ${error.message}`); setUploadingLogo(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('conteudo-clientes-logos').getPublicUrl(path);
    setForm(f => ({ ...f, logo_url: publicUrl }));
    setUploadingLogo(false);
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    const slug = form.slug.trim() || slugify(form.nome);
    setSaving(true);
    const payload = {
      nome: form.nome.trim(), slug,
      nicho: form.nicho.trim() || null,
      publico_alvo: form.publico_alvo.trim() || null,
      tom_de_voz: form.tom_de_voz.trim() || null,
      cta_padrao: form.cta_padrao.trim() || null,
      cor_primaria: form.cor_primaria.trim() || null,
      cor_secundaria: form.cor_secundaria.trim() || null,
      logo_url: form.logo_url.trim() || null,
      hashtags_fixas: textoParaArr(form.hashtags_fixas),
      temas_evitar: textoParaArr(form.temas_evitar),
      pilares_conteudo: textoParaArr(form.pilares_conteudo),
      estilo_visual: form.estilo_visual,
      formula_headline: form.formula_headline.trim() || null,
      arquetipos_visuais_preferidos: textoParaArr(form.arquetipos_visuais_preferidos),
      arquetipos_visuais_evitar: textoParaArr(form.arquetipos_visuais_evitar),
      ativo: form.ativo,
    };
    const { error } = editing
      ? await (supabase.from('conteudo_clientes' as any) as any).update(payload).eq('id', editing.id)
      : await (supabase.from('conteudo_clientes' as any) as any).insert(payload);
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar cliente: ${error.message}`); return; }
    toast.success(editing ? 'Cliente atualizado!' : 'Cliente criado!');
    setDialogOpen(false);
    loadClientes();
    onClientesChanged();
  };

  const alternarAtivo = async (c: ConteudoClienteFull) => {
    const { error } = await (supabase.from('conteudo_clientes' as any) as any).update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) { toast.error(`Erro ao atualizar cliente: ${error.message}`); return; }
    setClientes(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x));
    onClientesChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Clientes ativos entram automaticamente na rotina diária de posts da Equipe 11DS.
        </p>
        <Button size="sm" className="gap-1.5" onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo cliente</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum cliente cadastrado ainda.</div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Nicho</th>
                <th className="px-4 py-2.5 font-medium">Ativo</th>
                <th className="px-4 py-2.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.slug}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.nicho || '—'}</td>
                  <td className="px-4 py-2.5">
                    <Switch checked={c.ativo} onCheckedChange={() => alternarAtivo(c)} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => abrirEdicao(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>Clientes ativos recebem post diário automático da Equipe 11DS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cliente-nome">Nome</Label>
                <Input id="cliente-nome" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Instituto Despertamente" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-slug">Slug</Label>
                <Input id="cliente-slug" value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} placeholder={form.nome ? slugify(form.nome) : 'gerado a partir do nome'} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-nicho">Nicho</Label>
                <Input id="cliente-nicho" value={form.nicho} onChange={(e) => setForm(f => ({ ...f, nicho: e.target.value }))} placeholder="Ex: autoconhecimento, psicanálise..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-publico">Público-alvo</Label>
                <Input id="cliente-publico" value={form.publico_alvo} onChange={(e) => setForm(f => ({ ...f, publico_alvo: e.target.value }))} placeholder="Ex: mulheres 30-45 anos buscando autoconhecimento" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-tom">Tom de voz</Label>
                <Input id="cliente-tom" value={form.tom_de_voz} onChange={(e) => setForm(f => ({ ...f, tom_de_voz: e.target.value }))} placeholder="Ex: acolhedor, direto, inspirador..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-cta">CTA padrão</Label>
                <Input id="cliente-cta" value={form.cta_padrao} onChange={(e) => setForm(f => ({ ...f, cta_padrao: e.target.value }))} placeholder="Ex: Chama no direct pra saber mais" />
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identidade visual</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cliente-cor1">Cor primária</Label>
                  <Input id="cliente-cor1" value={form.cor_primaria} onChange={(e) => setForm(f => ({ ...f, cor_primaria: e.target.value }))} placeholder="#4C1D95" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cliente-cor2">Cor secundária</Label>
                  <Input id="cliente-cor2" value={form.cor_secundaria} onChange={(e) => setForm(f => ({ ...f, cor_secundaria: e.target.value }))} placeholder="#F59E0B" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-2">
                  {form.logo_url && <img src={form.logo_url} alt="Logo" className="h-9 w-9 rounded object-contain border border-border" />}
                  <Input type="file" accept="image/*" disabled={uploadingLogo}
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} className="text-xs" />
                  {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-estilo">Estilo visual do headline</Label>
                <Select value={form.estilo_visual} onValueChange={(v) => setForm(f => ({ ...f, estilo_visual: v as EstiloVisual }))}>
                  <SelectTrigger id="cliente-estilo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manchete">Manchete (caixa alta, direto, provocador)</SelectItem>
                    <SelectItem value="editorial">Editorial (contemplativo, poético)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-formula">Fórmula de headline (opcional)</Label>
                <Textarea id="cliente-formula" value={form.formula_headline} onChange={(e) => setForm(f => ({ ...f, formula_headline: e.target.value }))} placeholder="Ex: sempre uma pergunta que confronta uma crença limitante" className="min-h-[60px] text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-arq-pref">Arquétipos visuais preferidos</Label>
                <Input id="cliente-arq-pref" value={form.arquetipos_visuais_preferidos} onChange={(e) => setForm(f => ({ ...f, arquetipos_visuais_preferidos: e.target.value }))} placeholder="especialista em ação, retrato com expressão, still life..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-arq-evitar">Arquétipos visuais a evitar</Label>
                <Input id="cliente-arq-evitar" value={form.arquetipos_visuais_evitar} onChange={(e) => setForm(f => ({ ...f, arquetipos_visuais_evitar: e.target.value }))} placeholder="ambientes vazios, ilustração flat..." />
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estratégia de conteúdo</p>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-pilares">Pilares de conteúdo</Label>
                <Input id="cliente-pilares" value={form.pilares_conteudo} onChange={(e) => setForm(f => ({ ...f, pilares_conteudo: e.target.value }))} placeholder="autoconhecimento, bastidores, prova social, educacional..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-hashtags">Hashtags fixas</Label>
                <Input id="cliente-hashtags" value={form.hashtags_fixas} onChange={(e) => setForm(f => ({ ...f, hashtags_fixas: e.target.value }))} placeholder="#autoconhecimento, #psicanalise" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-evitar">Temas a evitar (brand safety)</Label>
                <Input id="cliente-evitar" value={form.temas_evitar} onChange={(e) => setForm(f => ({ ...f, temas_evitar: e.target.value }))} placeholder="política, religião..." />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border">
              <Label htmlFor="cliente-ativo" className="pt-3">Ativo (entra na rotina diária)</Label>
              <Switch id="cliente-ativo" checked={form.ativo} onCheckedChange={(v) => setForm(f => ({ ...f, ativo: v }))} className="mt-3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const loadClientesLeve = useCallback(() => {
    supabase.from('conteudo_clientes' as any).select('id, slug, nome').order('nome')
      .then(({ data }) => setClientes((data as any) || []));
  }, []);

  useEffect(() => { loadClientesLeve(); }, [loadClientesLeve]);

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

  const downloadImage = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('Erro ao baixar a imagem.');
    }
  };

  const copyLegenda = async (legenda: string) => {
    try {
      await navigator.clipboard.writeText(legenda);
      toast.success('Legenda copiada!');
    } catch {
      toast.error('Erro ao copiar a legenda.');
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Post</h1>
        <p className="text-sm text-muted-foreground">Criativos e legendas gerados diariamente para revisão e aprovação.</p>
      </div>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts" className="gap-1.5"><ImageIcon className="h-4 w-4" /> Posts</TabsTrigger>
          <TabsTrigger value="clientes" className="gap-1.5"><Users className="h-4 w-4" /> Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-4">
          <ClientesTab onClientesChanged={loadClientesLeve} />
        </TabsContent>

        <TabsContent value="posts" className="mt-4 space-y-5">
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
                <button className="aspect-[4/5] bg-muted overflow-hidden w-full" onClick={() => setDetailPost(post)}>
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

              {/* Image — formato 4:5 do feed do Instagram */}
              <div className="aspect-[4/5] w-full bg-black overflow-hidden">
                {detailPost.imagem_feed_url
                  ? <img src={detailPost.imagem_feed_url} alt={detailPost.tema ?? ''} className="w-full h-full object-contain" />
                  : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="h-12 w-12" /></div>}
              </div>

              {/* Baixar imagem / copiar legenda */}
              <div className="flex gap-1.5 px-3.5 py-2 border-t border-border">
                <Button
                  size="sm" variant="outline" className="flex-1 h-8 text-xs"
                  disabled={!detailPost.imagem_feed_url}
                  onClick={() => detailPost.imagem_feed_url && downloadImage(
                    detailPost.imagem_feed_url,
                    `${detailPost.conteudo_clientes?.slug ?? 'post'}-${detailPost.data_post}.png`,
                  )}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Baixar imagem
                </Button>
                <Button
                  size="sm" variant="outline" className="flex-1 h-8 text-xs"
                  disabled={!detailPost.legenda}
                  onClick={() => detailPost.legenda && copyLegenda(detailPost.legenda)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar legenda
                </Button>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
