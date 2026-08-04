import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, DollarSign, ShoppingCart, MousePointerClick, Target, TrendingUp, HandCoins, Receipt, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { VendasParceiros, type ResumoVendas, type PeriodoRange } from './VendasParceiros';

// ── Types ────────────────────────────────────────────────────────────────────

type ParceiroLite = { id: string; nome: string };

type ProdutoLite = {
  id: string; nome: string; parceiro_id: string;
  comissao_parceiro_pct: number | null; syncpay_taxa_fixa: number | null;
  meta_campaign_id: string | null; meta_ad_account_id: string | null; meta_access_token: string | null;
};

type AdsInsights = { spend: string; clicks: string; cpc: string; leads: number; cpl: number };

type PeriodoTipo = 'todos' | 'hoje' | 'ontem' | '7d' | '14d' | 'mes' | 'custom';
type Periodo = { tipo: PeriodoTipo; inicio?: string; fim?: string };

const PERIODO_LABEL: Record<Exclude<PeriodoTipo, 'custom'>, string> = {
  todos: 'Todos os períodos',
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  '14d': 'Últimos 14 dias',
  mes: 'Este mês',
};

function resolvePeriodo(p: Periodo): PeriodoRange {
  const hoje = new Date();
  switch (p.tipo) {
    case 'todos':
      return { inicio: null, fim: null };
    case 'hoje':
      return { inicio: startOfDay(hoje).toISOString(), fim: endOfDay(hoje).toISOString() };
    case 'ontem': {
      const d = subDays(hoje, 1);
      return { inicio: startOfDay(d).toISOString(), fim: endOfDay(d).toISOString() };
    }
    case '7d':
      return { inicio: startOfDay(subDays(hoje, 6)).toISOString(), fim: endOfDay(hoje).toISOString() };
    case '14d':
      return { inicio: startOfDay(subDays(hoje, 13)).toISOString(), fim: endOfDay(hoje).toISOString() };
    case 'mes':
      return { inicio: startOfMonth(hoje).toISOString(), fim: endOfMonth(hoje).toISOString() };
    case 'custom':
      return {
        inicio: p.inicio ? startOfDay(new Date(p.inicio)).toISOString() : null,
        fim: p.fim ? endOfDay(new Date(p.fim)).toISOString() : null,
      };
  }
}

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

// ── Filtro de período ────────────────────────────────────────────────────────

function FiltroPeriodo({ periodo, onChange }: { periodo: Periodo; onChange: (p: Periodo) => void }) {
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <div className="flex items-center gap-2">
      <Select
        value={periodo.tipo}
        onValueChange={(v) => {
          if (v === 'custom') { onChange({ tipo: 'custom', inicio: periodo.inicio, fim: periodo.fim }); return; }
          onChange({ tipo: v as PeriodoTipo });
        }}
      >
        <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIODO_LABEL) as (keyof typeof PERIODO_LABEL)[]).map(k => (
            <SelectItem key={k} value={k}>{PERIODO_LABEL[k]}</SelectItem>
          ))}
          <SelectItem value="custom">Personalizado…</SelectItem>
        </SelectContent>
      </Select>

      {periodo.tipo === 'custom' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {periodo.inicio && periodo.fim
                ? `${format(new Date(periodo.inicio), 'dd/MM/yy')} – ${format(new Date(periodo.fim), 'dd/MM/yy')}`
                : 'Escolher datas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range as any}
              onSelect={(r: any) => {
                setRange(r || {});
                if (r?.from && r?.to) {
                  onChange({ tipo: 'custom', inicio: format(r.from, 'yyyy-MM-dd'), fim: format(r.to, 'yyyy-MM-dd') });
                }
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function DesempenhoParceiros({ scopedParceiroId }: { scopedParceiroId?: string }) {
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [filtroParceira, setFiltroParceira] = useState<string>(scopedParceiroId || 'all');
  const [filtroProduto, setFiltroProduto] = useState<string>('all');
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: 'mes' });
  const [adsInsights, setAdsInsights] = useState<AdsInsights | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);
  const [resumoVendas, setResumoVendas] = useState<ResumoVendas>({ total: 0, qtd: 0, pendentesQtd: 0, porProduto: {} });

  const admin = !scopedParceiroId;
  const periodoRange = useMemo(() => resolvePeriodo(periodo), [periodo]);

  useEffect(() => {
    if (!admin) return;
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setParceiros((data as any) || []));
  }, [admin]);

  const parceiraAtual = admin ? (filtroParceira === 'all' ? null : filtroParceira) : scopedParceiroId!;

  const loadProdutos = useCallback(async () => {
    let query = supabase.from('parceiros_produtos' as any)
      .select('id, nome, parceiro_id, comissao_parceiro_pct, syncpay_taxa_fixa, meta_campaign_id, meta_ad_account_id, meta_access_token');
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

  const suaParte = useMemo(() => {
    return produtos.reduce((s, p) => {
      const dados = resumoVendas.porProduto[p.id];
      if (!dados || p.comissao_parceiro_pct == null) return s;
      return s + dados.valor * (p.comissao_parceiro_pct / 100);
    }, 0);
  }, [produtos, resumoVendas]);

  const taxaSyncPay = useMemo(() => {
    return produtos.reduce((s, p) => {
      const dados = resumoVendas.porProduto[p.id];
      if (!dados || !p.syncpay_taxa_fixa) return s;
      return s + dados.qtd * p.syncpay_taxa_fixa;
    }, 0);
  }, [produtos, resumoVendas]);

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
        <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />
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
          <StatCard
            icon={ShoppingCart}
            label="Carrinho abandonado"
            value={String(resumoVendas.pendentesQtd)}
            sub="Pix gerado, não pago"
            color="bg-amber-50 text-amber-600"
          />
          <StatCard
            icon={HandCoins}
            label="Sua parte"
            value={suaParte.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            sub="Com base na coprodução configurada"
            color="bg-violet-50 text-violet-600"
          />
          <StatCard
            icon={Receipt}
            label="Taxa SyncPay"
            value={taxaSyncPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            sub="Estimada, configurada por produto"
            color="bg-gray-100 text-gray-500"
          />
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
          periodo={periodoRange}
          onResumo={setResumoVendas}
        />
      </div>
    </div>
  );
}
