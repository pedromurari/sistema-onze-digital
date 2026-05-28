import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Trash2,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tipo = 'entrada' | 'saida';
type Categoria =
  | 'matricula' | 'outro_entrada'
  | 'custo_fixo' | 'custo_variavel' | 'ads' | 'alocacao' | 'outro_saida';
type View = 'overview' | 'entradas' | 'despesas' | 'config';
type Health = 'ok' | 'warn' | 'bad';

interface Taxa { nome: string; percentual: number; }
interface Socio { nome: string; percentual: number; }
interface Config { taxas: Taxa[]; socios: Socio[]; }

interface BalancoItem {
  id: string;
  descricao: string;
  valor: number;
  tipo: Tipo;
  categoria: Categoria;
  produto: string;
  mes_referencia: string;
  recorrente: boolean;
  retorno_realizado: number;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function mesLabel(mes: string) {
  const [y, m] = mes.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomes[parseInt(m) - 1]}/${y}`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesesOpcoes() {
  const hoje = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

const CAT_LABELS: Record<Categoria, string> = {
  matricula:      'Matrícula / Receita',
  outro_entrada:  'Outra Entrada',
  custo_fixo:     'Custo Fixo',
  custo_variavel: 'Custo Variável',
  ads:            'Ads / Marketing',
  alocacao:       'Alocação de Caixa',
  outro_saida:    'Outra Saída',
};

const DEFAULT_CONFIG: Config = { taxas: [], socios: [] };

function healthIcon(h: Health) {
  if (h === 'ok')   return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
  if (h === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
}
function healthLabel(h: Health) {
  const cls = { ok: 'bg-emerald-50 text-emerald-700 border-emerald-200', warn: 'bg-amber-50 text-amber-700 border-amber-200', bad: 'bg-red-50 text-red-700 border-red-200' }[h];
  const text = { ok: 'Saudável', warn: 'Atenção', bad: 'Crítico' }[h];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{text}</span>;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CascadeSection({ label, value, positive, large }: { label: string; value: number; positive?: boolean; large?: boolean }) {
  const isPos = positive ?? value >= 0;
  return (
    <div className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${large ? 'bg-muted/40' : 'bg-muted/20'} my-1`}>
      <span className={`font-bold uppercase tracking-wide ${large ? 'text-sm' : 'text-xs'} text-foreground`}>{label}</span>
      <span className={`font-bold tabular-nums ${large ? 'text-lg' : 'text-sm'} ${isPos ? 'text-foreground' : 'text-red-600'}`}>
        {!isPos && '−'}R$ {fmt(Math.abs(value))}
      </span>
    </div>
  );
}

function CascadeDeduction({ label, value, sub, color = 'default' }: { label: string; value: number; sub?: string; color?: 'default' | 'violet' | 'sky' }) {
  const valueColor = { default: 'text-red-500', violet: 'text-violet-600', sky: 'text-sky-600' }[color];
  return (
    <div className="flex items-center justify-between py-1.5 pl-6 pr-1">
      <div>
        <span className="text-sm text-muted-foreground">↳ {label}</span>
        {sub && <span className="text-[10px] text-muted-foreground/70 ml-2">{sub}</span>}
      </div>
      <span className={`text-sm font-semibold tabular-nums ${valueColor}`}>
        {color === 'default' ? '−' : ''}R$ {fmt(value)}
      </span>
    </div>
  );
}

function ItemsTable({ items, onDelete, showRetorno }: {
  items: BalancoItem[];
  onDelete: (id: string) => void;
  showRetorno?: boolean;
}) {
  if (items.length === 0)
    return <p className="text-xs text-muted-foreground text-center py-6">Nenhum item registrado.</p>;
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/20">
          <tr>
            <th className="text-left py-2 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Descrição</th>
            <th className="text-left py-2 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Categoria</th>
            {showRetorno && <th className="text-right py-2 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Retorno</th>}
            <th className="text-right py-2 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-2">
                  <span>{item.descricao}</span>
                  {item.recorrente && <RefreshCw className="h-3 w-3 text-muted-foreground flex-shrink-0" title="Recorrente" />}
                </div>
              </td>
              <td className="py-2.5 px-4 text-muted-foreground text-xs hidden sm:table-cell">{CAT_LABELS[item.categoria]}</td>
              {showRetorno && (
                <td className="py-2.5 px-4 text-right hidden md:table-cell">
                  {(item.retorno_realizado ?? 0) > 0
                    ? <span className="text-xs font-semibold text-emerald-600">R$ {fmt(item.retorno_realizado)}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              )}
              <td className="py-2.5 px-4 text-right font-semibold tabular-nums">R$ {fmt(item.valor)}</td>
              <td className="py-2.5 px-2 text-center">
                <button onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function Balanco() {
  const [mes, setMes] = useState(mesAtual());
  const [view, setView] = useState<View>('overview');
  const [items, setItems] = useState<BalancoItem[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [editConfig, setEditConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Add dialog
  const [addDialog, setAddDialog] = useState<{ tipo: Tipo; categoria: Categoria } | null>(null);
  const [addForm, setAddForm] = useState({ descricao: '', valor: '', recorrente: false, retorno_realizado: '' });
  const [savingAdd, setSavingAdd] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [itemsRes, cfgRes] = await Promise.all([
        supabase.from('balanco_itens').select('*').eq('mes_referencia', mes).order('created_at', { ascending: false }),
        supabase.from('balanco_config').select('*').eq('id', 'default').single(),
      ]);
      setItems((itemsRes.data ?? []) as BalancoItem[]);
      if (cfgRes.data) {
        const c: Config = {
          taxas: Array.isArray(cfgRes.data.taxas) ? cfgRes.data.taxas : [],
          socios: Array.isArray(cfgRes.data.socios) ? cfgRes.data.socios : [],
        };
        setConfig(c);
        setEditConfig(c);
      }
      setLoading(false);
    };
    load();
  }, [mes]);

  // ─── Computed ──────────────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const entradas = items.filter(i => i.tipo === 'entrada');
    const saidas   = items.filter(i => i.tipo === 'saida');

    const receita_bruta     = entradas.reduce((s, i) => s + i.valor, 0);
    const total_taxas       = config.taxas.reduce((s, t) => s + receita_bruta * t.percentual / 100, 0);
    const receita_liq       = receita_bruta - total_taxas;

    const custo_fixo        = saidas.filter(i => i.categoria === 'custo_fixo').reduce((s, i) => s + i.valor, 0);
    const custo_var         = saidas.filter(i => i.categoria === 'custo_variavel').reduce((s, i) => s + i.valor, 0);
    const ads               = saidas.filter(i => i.categoria === 'ads').reduce((s, i) => s + i.valor, 0);
    const outras            = saidas.filter(i => i.categoria === 'outro_saida').reduce((s, i) => s + i.valor, 0);
    const alocacoes         = saidas.filter(i => i.categoria === 'alocacao').reduce((s, i) => s + i.valor, 0);

    const total_op          = custo_fixo + custo_var + ads + outras;
    const lucro             = receita_liq - total_op;

    const total_socios      = config.socios.reduce((s, so) => s + (lucro > 0 ? lucro * so.percentual / 100 : 0), 0);
    const saldo_empresa     = lucro - total_socios;
    const saldo_livre       = saldo_empresa - alocacoes;

    const retorno_ads       = saidas.filter(i => i.categoria === 'ads').reduce((s, i) => s + (i.retorno_realizado || 0), 0);
    const roi_ads           = ads > 0 ? retorno_ads / ads : 0;

    const margem            = receita_bruta > 0 ? (lucro / receita_bruta) * 100 : 0;
    const pct_ads           = receita_bruta > 0 ? (ads / receita_bruta) * 100 : 0;
    const pct_fixos         = receita_bruta > 0 ? (custo_fixo / receita_bruta) * 100 : 0;

    const h_margem: Health  = margem >= 40 ? 'ok' : margem >= 20 ? 'warn' : 'bad';
    const h_ads: Health     = pct_ads === 0 ? 'ok' : pct_ads <= 15 ? 'ok' : pct_ads <= 25 ? 'warn' : 'bad';
    const h_roi: Health     = ads === 0 ? 'ok' : roi_ads >= 3 ? 'ok' : roi_ads >= 1 ? 'warn' : 'bad';

    return {
      receita_bruta, total_taxas, receita_liq,
      custo_fixo, custo_var, ads, outras, alocacoes,
      total_op, lucro,
      total_socios, saldo_empresa, saldo_livre,
      retorno_ads, roi_ads,
      margem, pct_ads, pct_fixos,
      h_margem, h_ads, h_roi,
      entradas, saidas,
    };
  }, [items, config]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setSavingConfig(true);
    const { error } = await supabase.from('balanco_config').upsert(
      { id: 'default', taxas: editConfig.taxas, socios: editConfig.socios, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
    setSavingConfig(false);
    if (error) { toast.error('Erro ao salvar configurações'); return; }
    setConfig(editConfig);
    toast.success('Configurações salvas!');
  };

  const openAdd = (tipo: Tipo, categoria: Categoria) => {
    setAddDialog({ tipo, categoria });
    setAddForm({ descricao: '', valor: '', recorrente: false, retorno_realizado: '' });
  };

  const addItem = async () => {
    if (!addDialog) return;
    const valor = parseFloat(addForm.valor.replace(',', '.'));
    if (!addForm.descricao.trim() || isNaN(valor) || valor <= 0) {
      toast.error('Preencha descrição e valor válido');
      return;
    }
    setSavingAdd(true);
    const retorno = addDialog.categoria === 'ads' && addForm.retorno_realizado
      ? parseFloat(addForm.retorno_realizado.replace(',', '.')) || 0
      : 0;
    const { data, error } = await supabase
      .from('balanco_itens')
      .insert({
        descricao: addForm.descricao.trim(),
        valor,
        tipo: addDialog.tipo,
        categoria: addDialog.categoria,
        produto: 'geral',
        mes_referencia: mes,
        recorrente: addForm.recorrente,
        retorno_realizado: retorno,
      })
      .select('*')
      .single();
    setSavingAdd(false);
    if (error || !data) { toast.error('Erro ao salvar'); return; }
    setItems(prev => [data as BalancoItem, ...prev]);
    setAddDialog(null);
    toast.success('Item adicionado!');
  };

  const deleteItem = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('balanco_itens').delete().eq('id', deleteId);
    if (error) { toast.error('Erro ao remover'); return; }
    setItems(prev => prev.filter(i => i.id !== deleteId));
    setDeleteId(null);
    toast.success('Removido!');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const { receita_bruta, total_taxas, receita_liq, custo_fixo, custo_var, ads, outras, alocacoes,
    total_op, lucro, total_socios, saldo_empresa, saldo_livre, retorno_ads, roi_ads,
    margem, pct_ads, h_margem, h_ads, h_roi, entradas, saidas } = calc;

  const tabs: { id: View; label: string }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'entradas', label: `Entradas (${entradas.length})` },
    { id: 'despesas', label: `Despesas (${saidas.length})` },
    { id: 'config',   label: '⚙ Config' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balanço</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mesLabel(mes)} · Saúde financeira</p>
        </div>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {mesesOpcoes().map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              view === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (

        <>
          {/* ────────────────── OVERVIEW ────────────────── */}
          {view === 'overview' && (
            <div className="space-y-5">

              {/* 5 KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Receita Bruta',  value: receita_bruta, color: 'text-emerald-600', sub: `${entradas.length} entrada${entradas.length !== 1 ? 's' : ''}` },
                  { label: 'Taxas',          value: total_taxas,   color: 'text-red-500',     sub: config.taxas.length > 0 ? config.taxas.map(t => `${t.percentual}%`).join(' + ') : 'Não configurado' },
                  { label: 'Custos',         value: total_op,      color: 'text-orange-600',  sub: `${saidas.filter(i => i.categoria !== 'alocacao').length} despesa${saidas.filter(i => i.categoria !== 'alocacao').length !== 1 ? 's' : ''}` },
                  { label: 'Lucro',          value: lucro,         color: lucro >= 0 ? 'text-sky-600' : 'text-red-600', sub: lucro >= 0 ? 'Positivo' : 'Negativo' },
                  { label: 'Margem',         value: margem,        color: h_margem === 'ok' ? 'text-emerald-600' : h_margem === 'warn' ? 'text-amber-600' : 'text-red-600', isPct: true, sub: h_margem === 'ok' ? 'Saudável ✓' : h_margem === 'warn' ? 'Atenção' : 'Crítico' },
                ].map(card => (
                  <Card key={card.label} className="p-4 border-border/60 shadow-none">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{card.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${card.color}`}>
                      {card.isPct ? fmtPct(card.value) : `R$ ${fmt(Math.abs(card.value))}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{card.sub}</p>
                  </Card>
                ))}
              </div>

              {/* Main 2-col layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* CASCADE — left 2/3 */}
                <Card className="lg:col-span-2 p-5 border-border/60 shadow-none">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">Fluxo do Dinheiro</p>

                  <CascadeSection label="Receita Bruta" value={receita_bruta} large
                    positive={receita_bruta >= 0} />

                  {config.taxas.length > 0 && config.taxas.map(t => (
                    <CascadeDeduction
                      key={t.nome}
                      label={`Taxa ${t.nome}`}
                      value={receita_bruta * t.percentual / 100}
                      sub={`${t.percentual}% × R$ ${fmt(receita_bruta)}`}
                    />
                  ))}

                  {total_taxas > 0 && (
                    <div className="my-2 border-t border-dashed border-border/50" />
                  )}

                  <CascadeSection label="Receita Líquida" value={receita_liq} positive={receita_liq >= 0} />

                  {custo_fixo > 0 && (
                    <CascadeDeduction
                      label="Custos Fixos"
                      value={custo_fixo}
                      sub={`${saidas.filter(i => i.categoria === 'custo_fixo').length} itens`}
                    />
                  )}
                  {custo_var > 0 && (
                    <CascadeDeduction
                      label="Custos Variáveis"
                      value={custo_var}
                      sub={`${saidas.filter(i => i.categoria === 'custo_variavel').length} itens`}
                    />
                  )}
                  {ads > 0 && (
                    <CascadeDeduction
                      label="Ads / Marketing"
                      value={ads}
                      sub={`${fmtPct(pct_ads)} da receita`}
                    />
                  )}
                  {outras > 0 && (
                    <CascadeDeduction label="Outras Saídas" value={outras} />
                  )}

                  <div className="my-2 border-t border-border/50" />

                  <CascadeSection label={lucro >= 0 ? 'Lucro Operacional' : 'Prejuízo Operacional'} value={lucro} large positive={lucro >= 0} />

                  {config.socios.length > 0 && lucro > 0 && config.socios.map(s => (
                    <CascadeDeduction
                      key={s.nome}
                      label={`${s.nome} (${s.percentual}%)`}
                      value={lucro * s.percentual / 100}
                      sub="distribuição de lucro"
                      color="violet"
                    />
                  ))}

                  {alocacoes > 0 && (
                    <CascadeDeduction
                      label="Alocações de Caixa"
                      value={alocacoes}
                      sub={`${saidas.filter(i => i.categoria === 'alocacao').length} itens`}
                      color="sky"
                    />
                  )}

                  {(config.socios.length > 0 || alocacoes > 0) && (
                    <>
                      <div className="my-2 border-t border-border/50" />
                      <CascadeSection label="Saldo Livre da Empresa" value={saldo_livre} large positive={saldo_livre >= 0} />
                    </>
                  )}

                  {receita_bruta === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma entrada registrada. Vá em "Entradas" para adicionar.
                    </p>
                  )}
                </Card>

                {/* RIGHT COLUMN */}
                <div className="space-y-4">

                  {/* Health */}
                  <Card className="p-4 border-border/60 shadow-none">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Saúde Financeira</p>
                    <div className="space-y-3">
                      {[
                        { icon: healthIcon(h_margem), label: 'Margem Líquida', val: fmtPct(margem), badge: healthLabel(h_margem) },
                        { icon: healthIcon(h_ads),    label: 'Ads / Receita',  val: fmtPct(pct_ads),  badge: healthLabel(h_ads) },
                        ...(ads > 0 ? [{ icon: healthIcon(h_roi), label: 'ROI de Ads', val: roi_ads > 0 ? `${roi_ads.toFixed(1)}×` : '—', badge: healthLabel(h_roi) }] : []),
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {row.icon}
                            <span className="text-sm truncate">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold tabular-nums">{row.val}</span>
                            {row.badge}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Referência</p>
                      <p className="text-[10px] text-muted-foreground">Margem ≥40% saudável · ≥20% atenção · &lt;20% crítico</p>
                      <p className="text-[10px] text-muted-foreground">Ads ≤15% normal · ≤25% atenção · &gt;25% alto</p>
                      <p className="text-[10px] text-muted-foreground">ROI ≥3× excelente · ≥1× regular · &lt;1× prejuízo</p>
                    </div>
                  </Card>

                  {/* Sócios */}
                  {config.socios.length > 0 && lucro > 0 && (
                    <Card className="p-4 border-border/60 shadow-none">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Repartição dos Sócios</p>
                      <div className="space-y-2.5">
                        {config.socios.map(s => (
                          <div key={s.nome} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                              <span className="text-sm font-medium">{s.nome}</span>
                              <span className="text-[10px] text-muted-foreground">{s.percentual}%</span>
                            </div>
                            <span className="text-sm font-bold text-violet-700 tabular-nums">
                              R$ {fmt(lucro * s.percentual / 100)}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-border/40 pt-2 flex justify-between">
                          <span className="text-xs text-muted-foreground">Empresa retém</span>
                          <span className="text-sm font-bold tabular-nums">R$ {fmt(saldo_empresa)}</span>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* ROI de Ads */}
                  {ads > 0 && (
                    <Card className="p-4 border-border/60 shadow-none">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">ROI de Ads</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Investido</span>
                          <span className="font-semibold tabular-nums">R$ {fmt(ads)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Retorno registrado</span>
                          <span className="font-semibold tabular-nums text-emerald-600">R$ {fmt(retorno_ads)}</span>
                        </div>
                        <div className="border-t border-border/40 pt-1.5 flex justify-between">
                          <span className="text-sm font-semibold">ROI</span>
                          <span className={`text-base font-bold tabular-nums ${h_roi === 'ok' ? 'text-emerald-600' : h_roi === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>
                            {retorno_ads > 0 ? `${roi_ads.toFixed(1)}×` : '—'}
                          </span>
                        </div>
                      </div>
                      {retorno_ads === 0 && (
                        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                          Registre o retorno ao adicionar um item de Ads para calcular o ROI automaticamente.
                        </p>
                      )}
                    </Card>
                  )}

                  {/* Caixa da empresa */}
                  {saldo_empresa > 0 && (
                    <Card className="p-4 border-sky-200 bg-sky-50/30 shadow-none">
                      <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Caixa da Empresa</p>
                      <p className="text-2xl font-bold text-sky-700 tabular-nums">R$ {fmt(saldo_empresa)}</p>
                      {alocacoes > 0 && (
                        <div className="mt-2 pt-2 border-t border-sky-200 space-y-1">
                          {saidas.filter(i => i.categoria === 'alocacao').map(a => (
                            <div key={a.id} className="flex justify-between text-xs">
                              <span className="text-sky-700">↳ {a.descricao}</span>
                              <span className="font-semibold text-sky-800 tabular-nums">R$ {fmt(a.valor)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-xs font-bold border-t border-sky-200 pt-1">
                            <span className="text-sky-900">Saldo livre</span>
                            <span className="text-sky-900 tabular-nums">R$ {fmt(saldo_livre)}</span>
                          </div>
                        </div>
                      )}
                      {alocacoes === 0 && (
                        <p className="text-[10px] text-sky-600 mt-1 leading-relaxed">
                          Adicione "Alocação de Caixa" em Despesas para planejar o destino desse dinheiro.
                        </p>
                      )}
                    </Card>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* ────────────────── ENTRADAS ────────────────── */}
          {view === 'entradas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Entradas — {mesLabel(mes)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Total: <span className="font-bold text-emerald-600">R$ {fmt(receita_bruta)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openAdd('entrada', 'outro_entrada')}>
                    <Plus className="h-4 w-4" />Outra Entrada
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => openAdd('entrada', 'matricula')}>
                    <Plus className="h-4 w-4" />Matrícula
                  </Button>
                </div>
              </div>
              <ItemsTable items={entradas} onDelete={setDeleteId} />
            </div>
          )}

          {/* ────────────────── DESPESAS ────────────────── */}
          {view === 'despesas' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Despesas — {mesLabel(mes)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Total operacional: <span className="font-bold text-red-600">R$ {fmt(total_op)}</span>
                  </p>
                </div>
                <Button size="sm" className="gap-1.5 bg-zinc-800 hover:bg-zinc-900 text-white"
                  onClick={() => openAdd('saida', 'custo_fixo')}>
                  <Plus className="h-4 w-4" />Adicionar Despesa
                </Button>
              </div>

              {(['custo_fixo', 'custo_variavel', 'ads', 'alocacao', 'outro_saida'] as Categoria[]).map(cat => {
                const catItems = saidas.filter(i => i.categoria === cat);
                const catTotal = catItems.reduce((s, i) => s + i.valor, 0);
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{CAT_LABELS[cat]}</p>
                        {catTotal > 0 && (
                          <span className="text-xs text-muted-foreground font-medium">— R$ {fmt(catTotal)}</span>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => openAdd('saida', cat)}>
                        <Plus className="h-3 w-3" />Adicionar
                      </Button>
                    </div>
                    <ItemsTable items={catItems} onDelete={setDeleteId} showRetorno={cat === 'ads'} />
                  </div>
                );
              })}
            </div>
          )}

          {/* ────────────────── CONFIG ────────────────── */}
          {view === 'config' && (
            <div className="space-y-6 max-w-2xl">

              <Card className="p-5 border-border/60 shadow-none">
                <div className="flex items-center gap-2 mb-1">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Taxas Financeiras</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Taxa de cartão, boleto, antecipação, gateway etc. São descontadas automaticamente da receita bruta no fluxo.
                </p>
                <div className="space-y-2">
                  {editConfig.taxas.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={t.nome}
                        onChange={e => setEditConfig(c => ({ ...c, taxas: c.taxas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))}
                        placeholder="Ex: Cartão de crédito"
                        className="h-8 text-sm flex-1"
                      />
                      <div className="flex items-center gap-1 w-28 flex-shrink-0">
                        <Input
                          type="number" step="0.01"
                          value={t.percentual}
                          onChange={e => setEditConfig(c => ({ ...c, taxas: c.taxas.map((x, j) => j === i ? { ...x, percentual: parseFloat(e.target.value) || 0 } : x) }))}
                          placeholder="0"
                          className="h-8 text-sm"
                        />
                        <span className="text-muted-foreground text-sm font-medium">%</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setEditConfig(c => ({ ...c, taxas: c.taxas.filter((_, j) => j !== i) }))}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 flex-shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-1.5 mt-1"
                    onClick={() => setEditConfig(c => ({ ...c, taxas: [...c.taxas, { nome: '', percentual: 0 }] }))}>
                    <Plus className="h-3.5 w-3.5" />Adicionar Taxa
                  </Button>
                </div>
              </Card>

              <Card className="p-5 border-border/60 shadow-none">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Repartição entre Sócios</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Percentual do lucro para cada sócio. O restante até 100% fica no caixa da empresa.
                </p>
                <div className="space-y-2">
                  {editConfig.socios.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={s.nome}
                        onChange={e => setEditConfig(c => ({ ...c, socios: c.socios.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))}
                        placeholder="Nome do sócio"
                        className="h-8 text-sm flex-1"
                      />
                      <div className="flex items-center gap-1 w-28 flex-shrink-0">
                        <Input
                          type="number" step="0.1"
                          value={s.percentual}
                          onChange={e => setEditConfig(c => ({ ...c, socios: c.socios.map((x, j) => j === i ? { ...x, percentual: parseFloat(e.target.value) || 0 } : x) }))}
                          placeholder="0"
                          className="h-8 text-sm"
                        />
                        <span className="text-muted-foreground text-sm font-medium">%</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setEditConfig(c => ({ ...c, socios: c.socios.filter((_, j) => j !== i) }))}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 flex-shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {editConfig.socios.length > 0 && (
                    <p className="text-xs text-muted-foreground pt-1">
                      {editConfig.socios.reduce((s, x) => s + x.percentual, 0).toFixed(1)}% distribuído
                      {' · '}
                      {(100 - editConfig.socios.reduce((s, x) => s + x.percentual, 0)).toFixed(1)}% fica na empresa
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 mt-1"
                    onClick={() => setEditConfig(c => ({ ...c, socios: [...c.socios, { nome: '', percentual: 0 }] }))}>
                    <Plus className="h-3.5 w-3.5" />Adicionar Sócio
                  </Button>
                </div>
              </Card>

              <Button onClick={saveConfig} disabled={savingConfig} className="bg-primary text-white">
                {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Add Dialog ── */}
      <Dialog open={!!addDialog} onOpenChange={o => !o && setAddDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar {addDialog?.tipo === 'entrada' ? 'Entrada' : 'Despesa'}</DialogTitle>
            <DialogDescription>{mesLabel(mes)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Categoria</label>
              <Select value={addDialog?.categoria} onValueChange={v => setAddDialog(d => d ? { ...d, categoria: v as Categoria } : null)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {addDialog?.tipo === 'entrada'
                    ? (['matricula', 'outro_entrada'] as Categoria[]).map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)
                    : (['custo_fixo', 'custo_variavel', 'ads', 'alocacao', 'outro_saida'] as Categoria[]).map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Descrição</label>
              <Input value={addForm.descricao} onChange={e => setAddForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder={addDialog?.categoria === 'ads' ? 'Ex: Google Ads — campanha maio' : 'Descrição'}
                className="mt-1 h-8 text-sm"
                onKeyDown={e => e.key === 'Enter' && addItem()} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor (R$)</label>
              <Input type="number" step="0.01" value={addForm.valor}
                onChange={e => setAddForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="0,00" className="mt-1 h-8 text-sm"
                onKeyDown={e => e.key === 'Enter' && addItem()} />
            </div>
            {addDialog?.categoria === 'ads' && (
              <div>
                <label className="text-xs text-muted-foreground">
                  Retorno gerado por este ad (R$) <span className="opacity-60">— opcional, para cálculo de ROI</span>
                </label>
                <Input type="number" step="0.01" value={addForm.retorno_realizado}
                  onChange={e => setAddForm(f => ({ ...f, retorno_realizado: e.target.value }))}
                  placeholder="Receita atribuída a este anúncio..." className="mt-1 h-8 text-sm" />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={addForm.recorrente}
                onChange={e => setAddForm(f => ({ ...f, recorrente: e.target.checked }))} />
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Custo recorrente mensal
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)}>Cancelar</Button>
            <Button onClick={addItem} disabled={savingAdd}>{savingAdd ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover item?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteItem}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
