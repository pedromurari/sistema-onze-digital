import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, DollarSign, ShoppingCart, MousePointerClick, Target, Plus, Instagram, Youtube, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type ParceiroLite = { id: string; nome: string };

type ProdutoLite = {
  id: string; nome: string; parceiro_id: string;
  meta_campaign_id: string | null; meta_ad_account_id: string | null; meta_access_token: string | null;
};

type VideoMetrica = { id: string; parceiro_id: string; produto_id: string | null; plataforma: 'instagram' | 'youtube'; views: number; data_post: string };

type MetaTipo = 'vendas' | 'videos_instagram' | 'videos_youtube';

type MetaRow = { id: string; parceiro_id: string; produto_id: string | null; tipo: MetaTipo; valor_meta: number; periodo_mes: string };

type AdsInsights = { spend: string; clicks: string; cpc: string; leads: number; cpl: number };

const TIPO_META_LABEL: Record<MetaTipo, string> = {
  vendas: 'Vendas (R$)',
  videos_instagram: 'Vídeos postados — Instagram',
  videos_youtube: 'Vídeos postados — YouTube',
};

function currentMonthStr() { return format(new Date(), 'yyyy-MM'); }

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function DesempenhoParceiros({ scopedParceiroId }: { scopedParceiroId?: string }) {
  const [subTab, setSubTab] = useState<'geral' | 'metas'>('geral');
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [filtroParceira, setFiltroParceira] = useState<string>(scopedParceiroId || 'all');
  const [filtroProduto, setFiltroProduto] = useState<string>('all');
  const [mes, setMes] = useState(currentMonthStr());
  const [videos, setVideos] = useState<VideoMetrica[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [adsInsights, setAdsInsights] = useState<AdsInsights | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);

  const [novoVideo, setNovoVideo] = useState({ produto_id: '', plataforma: 'instagram' as 'instagram' | 'youtube', views: '', data_post: format(new Date(), 'yyyy-MM-dd') });
  const [salvandoVideo, setSalvandoVideo] = useState(false);

  const admin = !scopedParceiroId;

  useEffect(() => {
    if (!admin) return;
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setParceiros((data as any) || []));
  }, [admin]);

  const parceiraAtual = admin ? (filtroParceira === 'all' ? null : filtroParceira) : scopedParceiroId!;

  const loadProdutos = useCallback(async () => {
    let query = supabase.from('parceiros_produtos' as any)
      .select('id, nome, parceiro_id, meta_campaign_id, meta_ad_account_id, meta_access_token');
    if (parceiraAtual) query = query.eq('parceiro_id', parceiraAtual);
    const { data } = await query.order('nome');
    setProdutos((data as any) || []);
  }, [parceiraAtual]);

  useEffect(() => { loadProdutos(); }, [loadProdutos]);
  useEffect(() => { setFiltroProduto('all'); }, [filtroParceira]);

  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    const inicio = format(startOfMonth(new Date(`${mes}-01T12:00:00`)), 'yyyy-MM-dd');
    const fim = format(endOfMonth(new Date(`${mes}-01T12:00:00`)), 'yyyy-MM-dd');
    let query = supabase.from('parceiros_video_metricas' as any)
      .select('id, parceiro_id, produto_id, plataforma, views, data_post')
      .gte('data_post', inicio).lte('data_post', fim);
    if (parceiraAtual) query = query.eq('parceiro_id', parceiraAtual);
    if (filtroProduto !== 'all') query = query.eq('produto_id', filtroProduto);
    const { data } = await query;
    setVideos((data as any) || []);
    setLoadingVideos(false);
  }, [parceiraAtual, filtroProduto, mes]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const produtoSelecionado = filtroProduto !== 'all' ? produtos.find(p => p.id === filtroProduto) : null;

  useEffect(() => {
    if (!produtoSelecionado?.meta_campaign_id || !produtoSelecionado?.meta_access_token) { setAdsInsights(null); return; }
    setLoadingAds(true);
    const fields = 'spend,clicks,cpc,actions';
    const url = `https://graph.facebook.com/v19.0/${produtoSelecionado.meta_campaign_id}/insights?fields=${fields}&date_preset=this_month&access_token=${produtoSelecionado.meta_access_token}`;
    fetch(url).then(r => r.json()).then(json => {
      if (json.error) { toast.error(`Meta Ads: ${json.error.message}`); setAdsInsights(null); return; }
      const d = json.data?.[0];
      if (!d) { setAdsInsights(null); return; }
      const leadAction = d.actions?.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
      const leads = leadAction ? parseFloat(leadAction.value) : 0;
      const spend = parseFloat(d.spend || '0');
      setAdsInsights({ spend: d.spend || '0', clicks: d.clicks || '0', cpc: d.cpc || '0', leads, cpl: leads > 0 ? spend / leads : 0 });
    }).catch(() => setAdsInsights(null)).finally(() => setLoadingAds(false));
  }, [produtoSelecionado?.meta_campaign_id, produtoSelecionado?.meta_access_token]);

  const viewsInstagram = useMemo(() => videos.filter(v => v.plataforma === 'instagram').reduce((s, v) => s + (v.views || 0), 0), [videos]);
  const viewsYoutube = useMemo(() => videos.filter(v => v.plataforma === 'youtube').reduce((s, v) => s + (v.views || 0), 0), [videos]);
  const qtdInstagram = useMemo(() => videos.filter(v => v.plataforma === 'instagram').length, [videos]);
  const qtdYoutube = useMemo(() => videos.filter(v => v.plataforma === 'youtube').length, [videos]);

  const registrarVideo = async () => {
    if (!parceiraAtual) { toast.error('Selecione uma parceira.'); return; }
    if (!novoVideo.views) { toast.error('Informe as views.'); return; }
    setSalvandoVideo(true);
    const { error } = await supabase.from('parceiros_video_metricas' as any).insert({
      parceiro_id: parceiraAtual,
      produto_id: novoVideo.produto_id || null,
      plataforma: novoVideo.plataforma,
      views: Number(novoVideo.views),
      data_post: novoVideo.data_post,
    });
    setSalvandoVideo(false);
    if (error) { toast.error(`Erro ao registrar: ${error.message}`); return; }
    toast.success('Métrica registrada.');
    setNovoVideo({ produto_id: '', plataforma: 'instagram', views: '', data_post: format(new Date(), 'yyyy-MM-dd') });
    loadVideos();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {admin && (
          <Select value={filtroParceira} onValueChange={setFiltroParceira}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Parceira" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as parceiras</SelectItem>
              {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filtroProduto} onValueChange={setFiltroProduto}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="month" className="w-[160px] h-9" value={mes} onChange={e => setMes(e.target.value)} />
      </div>

      <div className="flex gap-1 border-b">
        <button onClick={() => setSubTab('geral')} className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px', subTab === 'geral' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>Visão geral</button>
        <button onClick={() => setSubTab('metas')} className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px', subTab === 'metas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>Metas</button>
      </div>

      {subTab === 'geral' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={DollarSign} label="Vendas no período" value="—" sub="Aguardando checkout próprio" color="bg-gray-100 text-gray-500" />
            <StatCard icon={ShoppingCart} label="Carrinhos" value="—" sub="Aguardando checkout próprio" color="bg-gray-100 text-gray-500" />
            <StatCard icon={Instagram} label="Views Instagram" value={viewsInstagram.toLocaleString('pt-BR')} sub={`${qtdInstagram} vídeo(s) postado(s)`} color="bg-pink-50 text-pink-600" />
            <StatCard icon={Youtube} label="Views YouTube" value={viewsYoutube.toLocaleString('pt-BR')} sub={`${qtdYoutube} vídeo(s) postado(s)`} color="bg-red-50 text-red-600" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loadingAds ? (
              <div className="col-span-2 flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : produtoSelecionado && adsInsights ? (
              <>
                <StatCard icon={MousePointerClick} label="Cliques (Meta Ads)" value={Number(adsInsights.clicks).toLocaleString('pt-BR')} color="bg-blue-50 text-blue-600" />
                <StatCard icon={TrendingUp} label="CPC" value={`US$ ${Number(adsInsights.cpc).toFixed(2)}`} color="bg-blue-50 text-blue-600" />
                <StatCard icon={Target} label="Leads" value={String(adsInsights.leads)} color="bg-violet-50 text-violet-600" />
                <StatCard icon={DollarSign} label="Custo por lead" value={`US$ ${adsInsights.cpl.toFixed(2)}`} color="bg-violet-50 text-violet-600" />
              </>
            ) : (
              <div className="col-span-4 text-sm text-muted-foreground py-2">
                {filtroProduto === 'all'
                  ? 'Selecione um produto específico para ver CPC e custo por lead da campanha de Meta Ads vinculada a ele.'
                  : 'Este produto ainda não tem campanha de Meta Ads vinculada (configure em Produtos).'}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Registrar métrica de vídeo (manual)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Select value={novoVideo.plataforma} onValueChange={(v) => setNovoVideo(f => ({ ...f, plataforma: v as 'instagram' | 'youtube' }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                </SelectContent>
              </Select>
              <Select value={novoVideo.produto_id || 'none'} onValueChange={(v) => setNovoVideo(f => ({ ...f, produto_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Produto (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem produto específico</SelectItem>
                  {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-9" type="number" placeholder="Views" value={novoVideo.views} onChange={e => setNovoVideo(f => ({ ...f, views: e.target.value }))} />
              <Input className="h-9" type="date" value={novoVideo.data_post} onChange={e => setNovoVideo(f => ({ ...f, data_post: e.target.value }))} />
            </div>
            <Button disabled={salvandoVideo} onClick={registrarVideo}>
              <Plus className="h-4 w-4 mr-1" /> {salvandoVideo ? 'Salvando...' : 'Registrar'}
            </Button>
          </div>

          {loadingVideos ? null : videos.length > 0 && (
            <div className="bg-white border border-border rounded-xl divide-y divide-border">
              {videos.slice(0, 20).map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 text-sm">
                  {v.plataforma === 'instagram' ? <Instagram className="h-4 w-4 text-pink-500" /> : <Youtube className="h-4 w-4 text-red-500" />}
                  <span className="flex-1 text-muted-foreground">{format(new Date(`${v.data_post}T12:00:00`), "dd/MM/yy", { locale: ptBR })}</span>
                  <span className="font-medium">{v.views.toLocaleString('pt-BR')} views</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <MetasTab admin={admin} scopedParceiroId={scopedParceiroId} parceiros={parceiros} produtos={produtos} />
      )}
    </div>
  );
}

// ── Metas ─────────────────────────────────────────────────────────────────────

function MetasTab({ admin, scopedParceiroId, parceiros, produtos }: {
  admin: boolean; scopedParceiroId?: string; parceiros: ParceiroLite[]; produtos: ProdutoLite[];
}) {
  const [metas, setMetas] = useState<MetaRow[]>([]);
  const [realizadoVideos, setRealizadoVideos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ parceiro_id: scopedParceiroId || '', produto_id: '', tipo: 'vendas' as MetaTipo, valor_meta: '', periodo_mes: currentMonthStr() });

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('parceiros_metas' as any).select('id, parceiro_id, produto_id, tipo, valor_meta, periodo_mes').order('periodo_mes', { ascending: false });
    if (scopedParceiroId) query = query.eq('parceiro_id', scopedParceiroId);
    const { data } = await query;
    const rows = ((data as any) || []) as MetaRow[];
    setMetas(rows);

    // realizado de metas de vídeo: conta posts por parceiro/plataforma/mes
    const videoMetas = rows.filter(m => m.tipo !== 'vendas');
    if (videoMetas.length > 0) {
      const parceiroIds = [...new Set(videoMetas.map(m => m.parceiro_id))];
      const { data: vids } = await supabase.from('parceiros_video_metricas' as any)
        .select('parceiro_id, plataforma, data_post')
        .in('parceiro_id', parceiroIds);
      const counts: Record<string, number> = {};
      ((vids as any) || []).forEach((v: any) => {
        const mesRef = v.data_post.slice(0, 7);
        const plataformaTipo = v.plataforma === 'instagram' ? 'videos_instagram' : 'videos_youtube';
        const key = `${v.parceiro_id}|${plataformaTipo}|${mesRef}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      setRealizadoVideos(counts);
    }
    setLoading(false);
  }, [scopedParceiroId]);

  useEffect(() => { load(); }, [load]);

  const criarMeta = async () => {
    if (!form.parceiro_id) { toast.error('Selecione a parceira.'); return; }
    if (!form.valor_meta) { toast.error('Informe o valor da meta.'); return; }
    setSaving(true);
    const { error } = await supabase.from('parceiros_metas' as any).insert({
      parceiro_id: form.parceiro_id,
      produto_id: form.produto_id || null,
      tipo: form.tipo,
      valor_meta: Number(form.valor_meta),
      periodo_mes: `${form.periodo_mes}-01`,
    });
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar meta: ${error.message}`); return; }
    toast.success('Meta definida.');
    setForm(f => ({ ...f, valor_meta: '' }));
    load();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Nova meta</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {admin && (
            <Select value={form.parceiro_id} onValueChange={v => setForm(f => ({ ...f, parceiro_id: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Parceira" /></SelectTrigger>
              <SelectContent>{parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={form.produto_id || 'none'} onValueChange={v => setForm(f => ({ ...f, produto_id: v === 'none' ? '' : v }))}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Produto (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Meta geral da parceira</SelectItem>
              {produtos.filter(p => !form.parceiro_id || p.parceiro_id === form.parceiro_id).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as MetaTipo }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vendas">Vendas (R$)</SelectItem>
              <SelectItem value="videos_instagram">Vídeos — Instagram</SelectItem>
              <SelectItem value="videos_youtube">Vídeos — YouTube</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-9" type="number" placeholder="Valor da meta" value={form.valor_meta} onChange={e => setForm(f => ({ ...f, valor_meta: e.target.value }))} />
          <Input className="h-9" type="month" value={form.periodo_mes} onChange={e => setForm(f => ({ ...f, periodo_mes: e.target.value }))} />
        </div>
        <Button disabled={saving} onClick={criarMeta}><Plus className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Definir meta'}</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : metas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhuma meta definida ainda.</div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {metas.map(m => {
            const parceiraNome = parceiros.find(p => p.id === m.parceiro_id)?.nome ?? '—';
            const produtoNome = m.produto_id ? produtos.find(p => p.id === m.produto_id)?.nome : null;
            const mesRef = m.periodo_mes.slice(0, 7);
            const key = `${m.parceiro_id}|${m.tipo}|${mesRef}`;
            const realizado = m.tipo === 'vendas' ? null : (realizadoVideos[key] ?? 0);
            const pct = realizado != null ? Math.min(100, Math.round((realizado / m.valor_meta) * 100)) : null;
            return (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{TIPO_META_LABEL[m.tipo]}{produtoNome ? ` · ${produtoNome}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{admin ? `${parceiraNome} · ` : ''}{format(new Date(`${mesRef}-01T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR })}</p>
                </div>
                {realizado == null ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Meta: {Number(m.valor_meta).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · aguardando checkout</Badge>
                ) : (
                  <Badge variant="outline" className={cn(pct! >= 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200')}>
                    {realizado} / {m.valor_meta} ({pct}%)
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
