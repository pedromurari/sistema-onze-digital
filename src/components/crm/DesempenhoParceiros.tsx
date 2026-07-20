import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Loader2, DollarSign, ShoppingCart, MousePointerClick, Target, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { VendasParceiros } from './VendasParceiros';

// ── Types ────────────────────────────────────────────────────────────────────

type ParceiroLite = { id: string; nome: string };

type ProdutoLite = {
  id: string; nome: string; parceiro_id: string;
  meta_campaign_id: string | null; meta_ad_account_id: string | null; meta_access_token: string | null;
};

type AdsInsights = { spend: string; clicks: string; cpc: string; leads: number; cpl: number };

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
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [filtroParceira, setFiltroParceira] = useState<string>(scopedParceiroId || 'all');
  const [filtroProduto, setFiltroProduto] = useState<string>('all');
  const [mes, setMes] = useState(currentMonthStr());
  const [adsInsights, setAdsInsights] = useState<AdsInsights | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);
  const [resumoVendas, setResumoVendas] = useState({ total: 0, qtd: 0 });

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

      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={DollarSign}
            label="Vendas no período"
            value={resumoVendas.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            sub={`${resumoVendas.qtd} venda(s) aprovada(s)`}
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard icon={ShoppingCart} label="Carrinhos" value="—" sub="Aguardando checkout próprio" color="bg-gray-100 text-gray-500" />
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

        <VendasParceiros
          scopedParceiroId={parceiraAtual ?? undefined}
          produtoId={filtroProduto !== 'all' ? filtroProduto : undefined}
          mes={mes}
          onResumo={setResumoVendas}
        />
      </div>
    </div>
  );
}
