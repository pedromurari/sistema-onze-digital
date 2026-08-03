import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign, TrendingUp, AlertTriangle, Target, Info, Calendar,
  Users, BarChart3, CheckCircle2, TrendingDown, Pencil, Save, X,
  Layers, Droplets, Plus, Trash2, ChevronDown, Copy, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO, subDays, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  type Produto, type TaxaDetalhe, type PagamentoComFonte,
  calcTaxaTransacao, calcLiquidoPorProduto, calcTotaisLiquido,
  agruparReceitaSemanal, agruparReceitaMensal, agruparReceitaPorMetodo,
  fmtBRL, mesLabel,
} from '@/lib/financial-utils';
import { TaxasPagamentoConfig } from './finance/TaxasPagamentoConfig';
import { RepasseTurmasConfig } from './finance/RepasseTurmasConfig';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Turma {
  id: string; nome: string; produto?: string;
  valor_mensalidade?: number | null; total_mensalidades?: number | null;
  responsavel_id?: string | null;
}
interface Responsavel {
  id: string; nome: string;
}
interface Aluno {
  id: string; nome: string; turma_id: string;
  status: 'ativo' | 'inadimplente' | 'cancelado' | 'concluido';
  dia_vencimento?: number | null; valor_mensalidade?: number | null;
  mensalidades_pagas?: number | null; total_mensalidades?: number | null;
}
interface Pagamento {
  id: string; aluno_id: string | null; turma_id: string | null;
  valor: number | null; status: string | null;
  data_pagamento: string | null; data_vencimento: string | null;
  mes_referencia: string;
}
interface TurmaResponsavel {
  id: string; turma_id: string; user_id: string; nome_ref: string; percentual: number;
}
interface Metas {
  mrr: number; coleta_mes: number; inadimplencia_max: number; receita_hoje: number;
  cac_estimado: number; gross_margin_pct: number;
}

type Periodo = 'hoje' | 'semana' | 'mes' | '3m';
type GranularidadeFluxo = 'diario' | 'semanal' | 'mensal';

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmt(v);
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mesStr(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const METAS_KEY = 'cfo_metas_v2';
const METAS_DEFAULT: Metas = {
  mrr: 50000, coleta_mes: 40000, inadimplencia_max: 5, receita_hoje: 2000,
  cac_estimado: 150, gross_margin_pct: 70,
};

function loadMetas(): Metas {
  try { return { ...METAS_DEFAULT, ...JSON.parse(localStorage.getItem(METAS_KEY) || '{}') }; }
  catch { return METAS_DEFAULT; }
}
function saveMetas(m: Metas) { localStorage.setItem(METAS_KEY, JSON.stringify(m)); }

// ── Tooltip / Info ─────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <Info className="h-3 w-3 text-muted-foreground/60" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg leading-relaxed">
        {text}
      </span>
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  icon, label, value, sub, color, progress, meta, fonte, details,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color: 'blue' | 'emerald' | 'red' | 'violet' | 'amber';
  progress?: number; meta?: { atual: number; alvo: number; label: string };
  fonte?: string;
  details?: { label: string; value: string; highlight?: boolean }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const cls = {
    blue:   'bg-blue-50 text-blue-600',
    emerald:'bg-emerald-50 text-emerald-600',
    red:    'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
    amber:  'bg-amber-50 text-amber-600',
  }[color];
  const progressColor = {
    blue: 'bg-blue-500', emerald: 'bg-emerald-500',
    red: 'bg-red-500', violet: 'bg-violet-500', amber: 'bg-amber-500',
  }[color];

  return (
    <Card
      className={`border border-border/60 shadow-sm bg-white transition-shadow hover:shadow-md ${details ? 'cursor-pointer' : ''}`}
      onClick={() => details && setExpanded(e => !e)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-xl ${cls}`}>{icon}</div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            {fonte && <InfoTip text={fonte} />}
            {details && (
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform ml-0.5 ${expanded ? 'rotate-180' : ''}`} />
            )}
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        )}
        {meta && (
          <div className="mt-3 pt-2 border-t border-border/50">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{meta.label}</span>
              <span className={`font-semibold ${meta.atual >= meta.alvo ? 'text-emerald-600' : 'text-amber-600'}`}>
                {pct(meta.atual, meta.alvo)}%
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${meta.atual >= meta.alvo ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(pct(meta.atual, meta.alvo), 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {fmtK(meta.atual)} / meta {fmtK(meta.alvo)}
            </p>
          </div>
        )}
        {expanded && details && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
            {details.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className={row.highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{row.label}</span>
                <span className={`tabular-nums ${row.highlight ? 'font-bold text-foreground' : 'font-medium'}`}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Period selector ────────────────────────────────────────────────────────────

function PeriodBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-primary text-white shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────────

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/40 ${bold ? 'bg-muted/30' : 'bg-white'}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm tabular-nums ${bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>{value}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function FinanceiroCFO() {
  const [turmas, setTurmas]           = useState<Turma[]>([]);
  const [alunos, setAlunos]           = useState<Aluno[]>([]);
  const [pagamentos, setPagamentos]   = useState<Pagamento[]>([]);
  const [responsaveis, setResponsaveis] = useState<TurmaResponsavel[]>([]);
  const [responsaveisList, setResponsaveisList] = useState<Responsavel[]>([]); // tabela responsaveis (donos)
  const [loading, setLoading]         = useState(true);
  const [periodo, setPeriodo]         = useState<Periodo>('mes');
  const [ownerFilter, setOwnerFilter] = useState<string>(''); // '' = todos
  const [metas, setMetas]             = useState<Metas>(loadMetas);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metasDraft, setMetasDraft]   = useState<Metas>(loadMetas);

  // ── Novos estados: produtos, taxas e receita por fonte ─────────────────────
  const [produtos, setProdutos]                       = useState<Produto[]>([]);
  const [taxasDetalhe, setTaxasDetalhe]               = useState<TaxaDetalhe[]>([]);
  const [pagamentosComFonte, setPagamentosComFonte]   = useState<PagamentoComFonte[]>([]);
  const [granularidadeFluxo, setGranularidadeFluxo]   = useState<GranularidadeFluxo>('diario');
  const [produtosDraft, setProdutosDraft]             = useState<Produto[]>([]);
  const [editingProdutos, setEditingProdutos]         = useState(false);
  const [savingProdutos, setSavingProdutos]           = useState(false);

  const mesAtual   = useMemo(() => mesStr(0), []);
  const mesAnterior = useMemo(() => mesStr(1), []);
  const hoje       = useMemo(() => todayStr(), []);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const dataCorte = subDays(new Date(), 90).toISOString().slice(0, 10);
        const [
          { data: t }, { data: a }, { data: p }, { data: r }, { data: rl },
          { data: prod }, { data: taxas }, { data: recFonte },
        ] = await Promise.all([
          supabase.from('turmas').select('id, nome, produto, valor_mensalidade, total_mensalidades, responsavel_id'),
          supabase.from('alunos').select('id, nome, turma_id, status, dia_vencimento, valor_mensalidade, mensalidades_pagas, total_mensalidades'),
          supabase.from('pagamentos').select('id, aluno_id, turma_id, valor, status, data_pagamento, data_vencimento, mes_referencia'),
          supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual'),
          supabase.from('responsaveis').select('id, nome, email, ativo'),
          // Produtos configuráveis (não mais hardcoded)
          supabase.from('produtos').select('id, nome, slug, cor, ativo, ordem').eq('ativo', true).order('ordem'),
          // Taxas por produto + método de pagamento
          supabase.from('payment_method_rates').select('*').eq('ativo', true),
          // Receita dos últimos 90 dias com produto + forma_pagamento (via JOIN view)
          supabase.from('vw_receita_por_fonte')
            .select('id, aluno_id, turma_id, valor, data_pagamento, mes_referencia, numero_parcela, produto, forma_pagamento, produto_label')
            .gte('data_pagamento', dataCorte),
        ]);
        setTurmas(t || []);
        setAlunos(a || []);
        setPagamentos(p || []);
        setResponsaveis(r || []);
        setResponsaveisList(rl || []);
        setProdutos((prod || []) as Produto[]);
        setTaxasDetalhe((taxas || []) as TaxaDetalhe[]);
        setPagamentosComFonte((recFonte || []) as PagamentoComFonte[]);
      } catch {
        toast.error('Erro ao carregar dados financeiros. Recarregue a página.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const reloadTurmaResponsaveis = useCallback(async () => {
    const { data: r } = await supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual');
    setResponsaveis(r || []);
  }, []);

  // ── Base sets ────────────────────────────────────────────────────────────

  const alunosAtivos = useMemo(() =>
    alunos.filter(a => a.status === 'ativo'),
  [alunos]);

  const pagamentosPagos = useMemo(() =>
    pagamentos.filter(p => (p.status || '') === 'pago' && p.data_pagamento),
  [pagamentos]);

  // Returns MRR share for a turma considering owner filter.
  // Primary: turmas.responsavel_id → responsaveis.nome (1-to-1 ownership).
  // Fallback: turma_responsaveis with nome_ref (split ownership).
  const getOwnerShare = useCallback((turmaId: string | null): number => {
    if (!ownerFilter || !turmaId) return 1;
    const turma = turmas.find(t => t.id === turmaId);
    if (turma?.responsavel_id) {
      const resp = responsaveisList.find(r => r.id === turma.responsavel_id);
      if (resp) return resp.nome === ownerFilter ? 1 : 0;
    }
    const turmaResps = responsaveis.filter(r => r.turma_id === turmaId && r.nome_ref);
    if (!turmaResps.length) return 0;
    const ownerPct = turmaResps.filter(r => r.nome_ref === ownerFilter).reduce((s, r) => s + r.percentual, 0);
    return ownerPct / 100;
  }, [ownerFilter, responsaveis, turmas, responsaveisList]);

  // ── MRR ──────────────────────────────────────────────────────────────────

  const mrrTotal = useMemo(() => {
    return alunosAtivos.reduce((sum, a) => {
      const turma = turmas.find(t => t.id === a.turma_id);
      const val = (a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0) as number;
      const share = getOwnerShare(a.turma_id);
      return sum + val * share;
    }, 0);
  }, [alunosAtivos, turmas, getOwnerShare]);

  // ── Revenue by period ─────────────────────────────────────────────────────

  const receitaPeriodo = useMemo(() => {
    const start = (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      if (periodo === 'hoje') return hoje;
      if (periodo === 'semana') return subDays(d, 6).toISOString().slice(0, 10);
      if (periodo === 'mes') return mesAtual;
      return subMonths(d, 3).toISOString().slice(0, 10);
    })();

    return pagamentosPagos.filter(p => {
      const dp = p.data_pagamento!;
      if (periodo === 'mes') return p.mes_referencia?.startsWith(mesAtual);
      return dp >= start;
    }).reduce((sum, p) => {
      const share = getOwnerShare(p.turma_id);
      return sum + (p.valor || 0) * share;
    }, 0);
  }, [pagamentosPagos, periodo, hoje, mesAtual, getOwnerShare]);

  const receitaHoje = useMemo(() =>
    pagamentosPagos.filter(p => p.data_pagamento?.startsWith(hoje))
      .reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id), 0),
  [pagamentosPagos, hoje, getOwnerShare]);

  const receitaMesAnterior = useMemo(() =>
    pagamentosPagos.filter(p => p.mes_referencia?.startsWith(mesAnterior))
      .reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id), 0),
  [pagamentosPagos, mesAnterior, getOwnerShare]);

  const receitaMesAtual = useMemo(() =>
    pagamentosPagos.filter(p => p.mes_referencia?.startsWith(mesAtual))
      .reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id), 0),
  [pagamentosPagos, mesAtual, getOwnerShare]);

  const taxaColeta = pct(receitaMesAtual, mrrTotal);

  // ── Inadimplência ─────────────────────────────────────────────────────────

  const inadimplencia = useMemo(() => {
    const atrasados = pagamentos.filter(p => (p.status || '') === 'atrasado');
    const valorTotal = atrasados.reduce((s, p) => {
      const share = getOwnerShare(p.turma_id);
      return s + (p.valor || 0) * share;
    }, 0);
    const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
    const counts  = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
    for (const pag of atrasados) {
      if (!pag.data_vencimento) continue;
      const dias = differenceInDays(parseISO(hoje), parseISO(pag.data_vencimento));
      const share = getOwnerShare(pag.turma_id);
      const val = (pag.valor || 0) * share;
      if (dias <= 30)       { buckets.b0_30  += val; counts.b0_30++; }
      else if (dias <= 60)  { buckets.b31_60 += val; counts.b31_60++; }
      else if (dias <= 90)  { buckets.b61_90 += val; counts.b61_90++; }
      else                  { buckets.b90p   += val; counts.b90p++;   }
    }
    const totalInadimplentes = alunos.filter(a =>
      a.status === 'inadimplente' && getOwnerShare(a.turma_id) > 0
    ).length;
    const ativosOwner = alunosAtivos.filter(a => getOwnerShare(a.turma_id) > 0).length;
    const txInadimplencia = ativosOwner > 0 ? pct(totalInadimplentes, ativosOwner) : 0;
    return { valorTotal, buckets, counts, totalInadimplentes, txInadimplencia };
  }, [pagamentos, alunos, alunosAtivos, hoje, getOwnerShare]);

  // ── LTV Restante ──────────────────────────────────────────────────────────

  const ltvRestante = useMemo(() =>
    alunosAtivos.reduce((sum, a) => {
      const turma = turmas.find(t => t.id === a.turma_id);
      const val = (a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0) as number;
      const total = (a.total_mensalidades ?? turma?.total_mensalidades ?? 15) as number;
      const pagas = (a.mensalidades_pagas ?? 0) as number;
      const share = getOwnerShare(a.turma_id);
      return sum + val * Math.max(total - pagas, 0) * share;
    }, 0),
  [alunosAtivos, turmas, getOwnerShare]);

  // ── MRR por turma ─────────────────────────────────────────────────────────

  const mrrPorTurma = useMemo(() => {
    return turmas.map(turma => {
      const ativos = alunosAtivos.filter(a => a.turma_id === turma.id);
      if (!ativos.length) return null;
      const share = getOwnerShare(turma.id);
      const mrrReal = ativos.reduce((s, a) =>
        s + ((a.valor_mensalidade ?? turma.valor_mensalidade ?? 0) as number), 0) * share;
      const recebido = pagamentos.filter(p =>
        p.turma_id === turma.id && (p.status || '') === 'pago' && p.mes_referencia?.startsWith(mesAtual)
      ).reduce((s, p) => s + (p.valor || 0) * share, 0);
      const turmaResps = responsaveis.filter(r => r.turma_id === turma.id);
      const ownerName = !turmaResps.length && turma.responsavel_id
        ? responsaveisList.find(r => r.id === turma.responsavel_id)?.nome ?? null
        : null;
      return { turma, ativos: ativos.length, mrrReal, recebido, tc: pct(recebido, mrrReal), turmaResps, ownerName };
    }).filter(Boolean).sort((a, b) => b!.mrrReal - a!.mrrReal) as NonNullable<ReturnType<typeof turmas.map>[0]>[];
  }, [turmas, alunosAtivos, pagamentos, mesAtual, responsaveis, responsaveisList, getOwnerShare]);

  // ── Receita por responsável ───────────────────────────────────────────────

  const receitaPorOwner = useMemo(() => {
    const map: Record<string, { nome: string; mrr: number; recebido: number; txColeta: number }> = {};
    for (const resp of responsaveisList) map[resp.nome] = { nome: resp.nome, mrr: 0, recebido: 0, txColeta: 0 };

    for (const turma of turmas) {
      const ativosRaw = alunosAtivos.filter(a => a.turma_id === turma.id);
      if (!ativosRaw.length) continue;
      const mrrRaw = ativosRaw.reduce((s, a) =>
        s + ((a.valor_mensalidade ?? turma.valor_mensalidade ?? 0) as number), 0);
      const recRaw = pagamentos.filter(p =>
        p.turma_id === turma.id && (p.status || '') === 'pago' && p.mes_referencia?.startsWith(mesAtual)
      ).reduce((s, p) => s + (p.valor || 0), 0);

      // Primary: turmas.responsavel_id → responsaveis.nome
      if (turma.responsavel_id) {
        const resp = responsaveisList.find(r => r.id === turma.responsavel_id);
        if (resp && map[resp.nome]) {
          map[resp.nome].mrr      += mrrRaw;
          map[resp.nome].recebido += recRaw;
        }
        continue;
      }
      // Fallback: turma_responsaveis (split ownership)
      const turmaResps = responsaveis.filter(r => r.turma_id === turma.id && r.nome_ref);
      for (const resp of turmaResps) {
        const nome = resp.nome_ref;
        if (!map[nome]) map[nome] = { nome, mrr: 0, recebido: 0, txColeta: 0 };
        map[nome].mrr      += mrrRaw * (resp.percentual / 100);
        map[nome].recebido += recRaw * (resp.percentual / 100);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].txColeta = pct(map[key].recebido, map[key].mrr);
    }
    return Object.values(map).filter(o => o.mrr > 0).sort((a, b) => b.mrr - a.mrr);
  }, [responsaveis, responsaveisList, alunosAtivos, turmas, pagamentos, mesAtual]);

  // ── Receita diária (últimos 30 dias) ─────────────────────────────────────

  const receitaDiaria = useMemo(() => {
    const dias = periodo === 'hoje' ? 1 : periodo === 'semana' ? 7 : periodo === 'mes' ? 30 : 90;
    const map: Record<string, number> = {};
    const d = new Date(); d.setHours(0, 0, 0, 0);
    for (let i = dias - 1; i >= 0; i--) {
      const dd = subDays(d, i);
      map[dd.toISOString().slice(0, 10)] = 0;
    }
    for (const p of pagamentosPagos) {
      const dp = p.data_pagamento!.slice(0, 10);
      if (dp in map) map[dp] += (p.valor || 0) * getOwnerShare(p.turma_id);
    }
    return Object.entries(map).map(([data, valor]) => ({ data, valor }));
  }, [pagamentosPagos, periodo, getOwnerShare]);

  // ── Slugs de produtos (exceto 'geral') ───────────────────────────────────
  // Fonte: tabela produtos — dinâmico, não hardcoded
  const slugsProdutos = useMemo(
    () => produtos.filter(p => p.slug !== 'geral').map(p => p.slug),
    [produtos]
  );

  // ── Receita diária com breakdown por produto (para aba Fluxo) ────────────
  // Fonte: vw_receita_por_fonte × período selecionado
  const receitaDiariaDetalhada = useMemo(() => {
    const dias = periodo === 'hoje' ? 1 : periodo === 'semana' ? 7 : periodo === 'mes' ? 30 : 90;
    const map: Record<string, Record<string, number> & { data: string; total: number }> = {};
    const d = new Date(); d.setHours(0, 0, 0, 0);
    for (let i = dias - 1; i >= 0; i--) {
      const key = subDays(d, i).toISOString().slice(0, 10);
      map[key] = { data: key, total: 0 };
      for (const s of slugsProdutos) map[key][s] = 0;
    }
    for (const p of pagamentosComFonte) {
      if (!p.data_pagamento) continue;
      const dp = p.data_pagamento.slice(0, 10);
      if (!(dp in map)) continue;
      const val = (p.valor || 0) * getOwnerShare(p.turma_id);
      const slug = p.produto || 'outros';
      if (slug in map[dp]) (map[dp][slug] as number) += val;
      map[dp].total += val;
    }
    return Object.values(map);
  }, [pagamentosComFonte, periodo, getOwnerShare, slugsProdutos]);

  // ── Receita semanal (últimas 12 semanas, breakdown por produto) ───────────
  // Fonte: receitaDiaria + vw_receita_por_fonte
  const receitaSemanal = useMemo(
    () => agruparReceitaSemanal(receitaDiaria, pagamentosComFonte, slugsProdutos),
    [receitaDiaria, pagamentosComFonte, slugsProdutos]
  );

  // ── Receita mensal (últimos 6 meses, breakdown por produto) ───────────────
  // Fonte: vw_receita_por_fonte × owner share
  const receitaMensal = useMemo(
    () => agruparReceitaMensal(pagamentosComFonte, slugsProdutos, getOwnerShare),
    [pagamentosComFonte, slugsProdutos, getOwnerShare]
  );

  // ── Líquido por produto (mês atual) ──────────────────────────────────────
  // Fonte: vw_receita_por_fonte × payment_method_rates
  // Método: calcTaxaTransacao() — regra mais específica prevalece (produto+forma > *+forma > produto+* > *+*)
  const liquidoPorProduto = useMemo(
    () => calcLiquidoPorProduto(pagamentosComFonte, taxasDetalhe, mesAtual, getOwnerShare),
    [pagamentosComFonte, taxasDetalhe, mesAtual, getOwnerShare]
  );

  // ── Totais consolidados de líquido ────────────────────────────────────────
  const totaisLiquido = useMemo(
    () => calcTotaisLiquido(liquidoPorProduto),
    [liquidoPorProduto]
  );

  // ── Receita por forma de pagamento (mês atual) ────────────────────────────
  // Fonte: vw_receita_por_fonte agrupado por forma_pagamento
  const receitaPorMetodo = useMemo(
    () => agruparReceitaPorMetodo(pagamentosComFonte, mesAtual, getOwnerShare),
    [pagamentosComFonte, mesAtual, getOwnerShare]
  );

  // ── Fluxo por dia de vencimento ───────────────────────────────────────────

  const fluxoPorDia = useMemo(() => {
    const days: Record<number, { count: number; mrr: number; recebido: number; pendente: number; atrasado: number }> = {};
    for (const aluno of alunosAtivos) {
      const dia = (aluno.dia_vencimento ?? 10) as number;
      if (!days[dia]) days[dia] = { count: 0, mrr: 0, recebido: 0, pendente: 0, atrasado: 0 };
      const turma = turmas.find(t => t.id === aluno.turma_id);
      const share = getOwnerShare(aluno.turma_id);
      days[dia].count++;
      days[dia].mrr += ((aluno.valor_mensalidade ?? turma?.valor_mensalidade ?? 0) as number) * share;
    }
    for (const pag of pagamentos) {
      if (!pag.mes_referencia?.startsWith(mesAtual)) continue;
      const aluno = alunosAtivos.find(a => a.id === pag.aluno_id);
      if (!aluno) continue;
      const dia = (aluno.dia_vencimento ?? 10) as number;
      if (!days[dia]) days[dia] = { count: 0, mrr: 0, recebido: 0, pendente: 0, atrasado: 0 };
      const share = getOwnerShare(pag.turma_id);
      const val = (pag.valor || 0) * share;
      if ((pag.status || '') === 'pago')     days[dia].recebido += val;
      else if ((pag.status || '') === 'pendente') days[dia].pendente += val;
      else if ((pag.status || '') === 'atrasado') days[dia].atrasado += val;
    }
    return Object.entries(days).map(([dia, v]) => ({ dia: Number(dia), ...v })).sort((a, b) => a.dia - b.dia);
  }, [alunosAtivos, turmas, pagamentos, mesAtual, getOwnerShare]);

  // ── Parcelas ─────────────────────────────────────────────────────────────

  const parcelasPorTurma = useMemo(() => {
    return turmas.map(turma => {
      const ativos = alunosAtivos.filter(a => a.turma_id === turma.id);
      if (!ativos.length) return null;
      const totalMens = (turma.total_mensalidades ?? 15) as number;
      const avgPagas = ativos.reduce((s, a) => s + ((a.mensalidades_pagas ?? 0) as number), 0) / ativos.length;
      const share = getOwnerShare(turma.id);
      const receitaRestante = ativos.reduce((s, a) => {
        const val = (a.valor_mensalidade ?? turma.valor_mensalidade ?? 0) as number;
        const t = (a.total_mensalidades ?? totalMens) as number;
        const pg = (a.mensalidades_pagas ?? 0) as number;
        return s + val * Math.max(t - pg, 0) * share;
      }, 0);
      return { turma, ativos: ativos.length, total: totalMens, avgPagas, receitaRestante, progressPct: pct(avgPagas, totalMens) };
    }).filter(Boolean).sort((a, b) => b!.receitaRestante - a!.receitaRestante) as NonNullable<ReturnType<typeof turmas.map>[0]>[];
  }, [turmas, alunosAtivos, getOwnerShare]);

  const receitaRestanteTotal = (parcelasPorTurma as any[]).reduce((s: number, t: any) => s + (t?.receitaRestante ?? 0), 0);

  // ── Variação mês a mês ────────────────────────────────────────────────────

  const variacaoMensal = receitaMesAnterior > 0
    ? ((receitaMesAtual - receitaMesAnterior) / receitaMesAnterior) * 100
    : 0;

  // ── Produtos handlers ─────────────────────────────────────────────────────

  async function handleSaveProdutos() {
    setSavingProdutos(true);
    try {
      const rows = produtosDraft.map((p, i) => ({ ...p, ordem: i + 1 }));
      const { error } = await supabase.from('produtos').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      // Desativar produtos removidos do draft (mantém histórico)
      const removedSlugs = produtos
        .filter(p => !produtosDraft.find(d => d.id === p.id))
        .map(p => p.id);
      if (removedSlugs.length) {
        await supabase.from('produtos').update({ ativo: false }).in('id', removedSlugs);
      }
      const { data: fresh } = await supabase.from('produtos').select('id, nome, slug, cor, ativo, ordem').eq('ativo', true).order('ordem');
      setProdutos((fresh || []) as Produto[]);
      setProdutosDraft((fresh || []) as Produto[]);
      setEditingProdutos(false);
      toast.success('Produtos salvos!');
    } catch {
      toast.error('Erro ao salvar produtos. Tente novamente.');
    } finally {
      setSavingProdutos(false);
    }
  }

  // ── Metas handlers ────────────────────────────────────────────────────────

  function handleSaveMetas() {
    saveMetas(metasDraft);
    setMetas(metasDraft);
    setEditingMeta(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const periodoLabel: Record<Periodo, string> = {
    hoje: 'Hoje', semana: 'Esta semana', mes: format(new Date(), 'MMMM', { locale: ptBR }), '3m': 'Últimos 3 meses',
  };

  // ── Métricas complementares ───────────────────────────────────────────────
  const arr = mrrTotal * 12;
  const alunosCancelados = alunos.filter(a => a.status === 'cancelado');
  const churnPct = alunos.length > 0 ? Math.round((alunosCancelados.length / alunos.length) * 100) : 0;
  const pagsMesCount = pagamentosPagos.filter(p => (p.mes_referencia || '').startsWith(mesAtual)).length;
  const ticketMedio = pagsMesCount > 0 ? receitaMesAtual / pagsMesCount : 0;

  function gerarRelatorioDiario() {
    const hoje_ = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
    const text = [
      `📊 RELATÓRIO FINANCEIRO — ${hoje_}`,
      ownerFilter ? `👤 Filtrado por: ${ownerFilter}` : `👥 Visão consolidada`,
      ``,
      `MRR Projetado......... ${fmtK(mrrTotal)}`,
      `ARR (projeção anual).. ${fmtK(arr)}`,
      `Recebido hoje......... ${fmtK(receitaHoje)}`,
      `Recebido no mês....... ${fmtK(receitaMesAtual)} (${taxaColeta}% de coleta)`,
      `Líquido (pós-taxas)... ${fmtK(totaisLiquido.liquido)}`,
      `Ticket médio.......... ${fmtK(ticketMedio)}`,
      ``,
      `Inadimplência......... ${fmtK(inadimplencia.valorTotal)} (${inadimplencia.txInadimplencia}% · ${inadimplencia.totalInadimplentes} alunos)`,
      `Churn estimado........ ${churnPct}% (${alunosCancelados.length} cancelados)`,
      `LTV Restante.......... ${fmtK(ltvRestante)}`,
      ``,
      `Alunos ativos......... ${alunosAtivos.length}`,
      `Variação vs mês ant... ${variacaoMensal >= 0 ? '+' : ''}${variacaoMensal.toFixed(1)}%`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success('Relatório copiado para a área de transferência!'));
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto pb-20 lg:pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Análise CFO</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })} · Visão financeira executiva
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Owner filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            {['', ...responsaveisList.map(r => r.nome)].map(owner => (
              <button
                key={owner || '__todos__'}
                onClick={() => setOwnerFilter(owner === ownerFilter ? '' : owner)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  ownerFilter === owner
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {owner || 'Todos'}
              </button>
            ))}
          </div>
          {/* Relatório diário */}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0" onClick={gerarRelatorioDiario}>
            <Copy className="h-3.5 w-3.5" />
            Relatório
          </Button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {(['hoje', 'semana', 'mes', '3m'] as Periodo[]).map(p => (
          <PeriodBtn key={p} active={periodo === p} onClick={() => setPeriodo(p)}>
            {periodoLabel[p]}
          </PeriodBtn>
        ))}
        {ownerFilter && (
          <Badge className="ml-2 bg-primary/10 text-primary border-primary/20">
            Filtrado: {ownerFilter}
          </Badge>
        )}
      </div>

      {/* KPI Cards — clique para expandir o detalhamento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<DollarSign className="h-4 w-4" />}
          label="MRR Projetado"
          value={fmtK(mrrTotal)}
          sub={`${alunosAtivos.length} alunos ativos${ownerFilter ? ` · ${ownerFilter}` : ''}`}
          color="blue"
          meta={{ atual: mrrTotal, alvo: metas.mrr, label: 'Meta MRR' }}
          fonte={`Soma do valor_mensalidade de todos os alunos com status='ativo'${ownerFilter ? `, ponderado pela % de ${ownerFilter}` : ''}. Fonte: tabelas alunos + turmas.`}
          details={[
            { label: 'Alunos ativos', value: `${alunosAtivos.length}` },
            ...(mrrPorTurma as any[]).slice(0, 4).map((t: any) => ({ label: t.turma.nome, value: fmtK(t.mrrReal) })),
            ...((mrrPorTurma as any[]).length > 4 ? [{ label: `+${(mrrPorTurma as any[]).length - 4} outras turmas`, value: fmtK((mrrPorTurma as any[]).slice(4).reduce((s: number, t: any) => s + t.mrrReal, 0)) }] : []),
            { label: 'Total MRR', value: fmtK(mrrTotal), highlight: true },
          ]}
        />
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label={`Recebido — ${periodoLabel[periodo]}`}
          value={fmtK(receitaPeriodo)}
          sub={`Taxa de coleta: ${taxaColeta}% · ${variacaoMensal >= 0 ? '+' : ''}${variacaoMensal.toFixed(1)}% vs mês ant.`}
          color="emerald"
          progress={taxaColeta}
          meta={periodo === 'hoje' ? { atual: receitaHoje, alvo: metas.receita_hoje, label: 'Meta hoje' } : { atual: receitaMesAtual, alvo: metas.coleta_mes, label: 'Meta mês' }}
          fonte={`Pagamentos com status='pago' ${periodo === 'hoje' ? "com data_pagamento = hoje" : periodo === 'semana' ? "dos últimos 7 dias" : periodo === 'mes' ? "com mes_referencia = mês atual" : "dos últimos 3 meses"}${ownerFilter ? `, ponderado pela % de ${ownerFilter}` : ''}. Fonte: tabela pagamentos.`}
          details={[
            { label: 'Hoje', value: fmtK(receitaHoje) },
            { label: `${format(new Date(), 'MMMM', { locale: ptBR })} (atual)`, value: fmtK(receitaMesAtual) },
            { label: 'Mês anterior', value: fmtK(receitaMesAnterior) },
            { label: 'Variação mensal', value: `${variacaoMensal >= 0 ? '+' : ''}${variacaoMensal.toFixed(1)}%` },
            { label: 'Taxa de coleta', value: `${taxaColeta}%`, highlight: true },
          ]}
        />
        <KPICard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Inadimplência"
          value={fmtK(inadimplencia.valorTotal)}
          sub={`${inadimplencia.totalInadimplentes} alunos · ${inadimplencia.txInadimplencia}% da base ativa`}
          color={inadimplencia.txInadimplencia > metas.inadimplencia_max ? 'red' : 'amber'}
          fonte={`Pagamentos com status='atrasado'. Taxa = inadimplentes / total ativos. Meta máxima: ${metas.inadimplencia_max}%. Fonte: tabela pagamentos.`}
          details={[
            { label: '0–30 dias', value: fmtK(inadimplencia.buckets.b0_30) },
            { label: '31–60 dias', value: fmtK(inadimplencia.buckets.b31_60) },
            { label: '61–90 dias', value: fmtK(inadimplencia.buckets.b61_90) },
            { label: '+90 dias (risco perda)', value: fmtK(inadimplencia.buckets.b90p) },
            { label: `${inadimplencia.totalInadimplentes} alunos · ${inadimplencia.txInadimplencia}% da base`, value: fmtK(inadimplencia.valorTotal), highlight: true },
          ]}
        />
        <KPICard
          icon={<Target className="h-4 w-4" />}
          label="LTV Restante"
          value={fmtK(ltvRestante)}
          sub={`Parcelas futuras a receber — ${alunosAtivos.length} alunos`}
          color="violet"
          fonte={`(total_mensalidades - mensalidades_pagas) × valor_mensalidade por aluno ativo${ownerFilter ? `, ponderado pela % de ${ownerFilter}` : ''}. Fonte: tabelas alunos + turmas.`}
          details={[
            ...(parcelasPorTurma as any[]).slice(0, 4).map((t: any) => ({ label: t.turma.nome, value: fmtK(t.receitaRestante) })),
            ...((parcelasPorTurma as any[]).length > 4 ? [{ label: `+${(parcelasPorTurma as any[]).length - 4} outras turmas`, value: fmtK((parcelasPorTurma as any[]).slice(4).reduce((s: number, t: any) => s + t.receitaRestante, 0)) }] : []),
            { label: 'LTV Total', value: fmtK(ltvRestante), highlight: true },
          ]}
        />
      </div>

      {/* KPI Cards — Row 2: métricas complementares */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label="ARR (Anual)"
          value={fmtK(arr)}
          sub={`MRR × 12 — projeção anual${ownerFilter ? ` · ${ownerFilter}` : ''}`}
          color="blue"
          fonte="ARR = MRR Projetado × 12. Representa a receita anual recorrente projetada se a base de alunos se mantiver. Não considera churn ou novas matrículas."
          details={[
            { label: 'MRR base', value: fmtK(mrrTotal) },
            { label: 'Fator', value: '× 12 meses' },
            { label: 'ARR projetado', value: fmtK(arr), highlight: true },
          ]}
        />
        <KPICard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Ticket Médio"
          value={fmtK(ticketMedio)}
          sub={`${pagsMesCount} pagamentos no mês`}
          color="emerald"
          fonte="Ticket médio = receita do mês corrente / número de pagamentos recebidos. Representa o valor médio por transação no mês."
          details={[
            { label: 'Receita do mês', value: fmtK(receitaMesAtual) },
            { label: 'Nº de pagamentos', value: `${pagsMesCount} transações` },
            { label: 'Ticket médio', value: fmtK(ticketMedio), highlight: true },
          ]}
        />
        <KPICard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Churn Estimado"
          value={`${churnPct}%`}
          sub={`${alunosCancelados.length} cancelados de ${alunos.length} total`}
          color={churnPct > 10 ? 'red' : churnPct > 5 ? 'amber' : 'emerald'}
          fonte="Churn = cancelados / total (ativos + cancelados). Referência: <5% saudável, 5–10% atenção, >10% crítico. Fonte: tabela alunos."
          details={[
            { label: 'Ativos', value: `${alunosAtivos.length}` },
            { label: 'Inadimplentes', value: `${inadimplencia.totalInadimplentes}` },
            { label: 'Cancelados', value: `${alunosCancelados.length}` },
            { label: 'Total histórico', value: `${alunos.length}` },
            { label: 'Churn estimado', value: `${churnPct}%`, highlight: true },
          ]}
        />
        <KPICard
          icon={<DollarSign className="h-4 w-4" />}
          label="Líquido Real"
          value={fmtK(totaisLiquido.liquido)}
          sub={`Pós-taxas · ${totaisLiquido.bruto > 0 ? `${((totaisLiquido.taxas / totaisLiquido.bruto) * 100).toFixed(1)}% de taxas` : 'sem dados de taxa'}`}
          color="emerald"
          fonte="Líquido Real = Receita Bruta − Taxas de gateway (calculadas via payment_method_rates). Use este número para margens reais — não a receita bruta."
          details={[
            { label: 'Receita bruta', value: fmtK(totaisLiquido.bruto) },
            { label: `Taxas (${totaisLiquido.bruto > 0 ? ((totaisLiquido.taxas / totaisLiquido.bruto) * 100).toFixed(1) : 0}%)`, value: `−${fmtK(totaisLiquido.taxas)}` },
            { label: `${totaisLiquido.count} transações`, value: '' },
            { label: 'Líquido Real', value: fmtK(totaisLiquido.liquido), highlight: true },
          ]}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="receita">
        <TabsList className="bg-muted/40 flex-wrap h-auto gap-1">
          <TabsTrigger value="receita">Receita</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
          <TabsTrigger value="liquido">Líquido Real</TabsTrigger>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="turmas">Por Turma</TabsTrigger>
          <TabsTrigger value="responsavel">Responsáveis</TabsTrigger>
          <TabsTrigger value="vencimento">Por Vencimento</TabsTrigger>
          <TabsTrigger value="aging">Inadimplência</TabsTrigger>
          <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* ── Receita ───────────────────────────────────────────────────────── */}
        <TabsContent value="receita" className="mt-4 space-y-4">

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border border-border/60 bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Hoje</p>
                <p className="text-lg font-bold tabular-nums">{fmtK(receitaHoje)}</p>
              </CardContent>
            </Card>
            <Card className="border border-border/60 bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Esta semana</p>
                <p className="text-lg font-bold tabular-nums">
                  {fmtK(pagamentosPagos.filter(p => {
                    const dp = p.data_pagamento!;
                    const inicio = subDays(new Date(), 6).toISOString().slice(0, 10);
                    return dp >= inicio;
                  }).reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id), 0))}
                </p>
              </CardContent>
            </Card>
            <Card className="border border-border/60 bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{format(new Date(), 'MMMM', { locale: ptBR })}</p>
                <p className="text-lg font-bold tabular-nums">{fmtK(receitaMesAtual)}</p>
                <p className="text-xs text-muted-foreground">{taxaColeta}% coleta</p>
              </CardContent>
            </Card>
            <Card className="border border-border/60 bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Mês anterior</p>
                <p className="text-lg font-bold tabular-nums">{fmtK(receitaMesAnterior)}</p>
                <p className={`text-xs font-medium ${variacaoMensal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {variacaoMensal >= 0 ? '+' : ''}{variacaoMensal.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily breakdown */}
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={14} className="text-muted-foreground" />
                Receita diária — {periodoLabel[periodo]}
                <InfoTip text="Soma dos pagamentos com status='pago' agrupados por data_pagamento. Mostra apenas dias com algum pagamento registrado." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {receitaDiaria.filter(d => d.valor > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento no período selecionado</p>
              ) : (
                <div className="space-y-1.5">
                  {receitaDiaria.filter(d => d.valor > 0).map(({ data, valor }) => {
                    const maxVal = Math.max(...receitaDiaria.map(d => d.valor));
                    return (
                      <div key={data} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 shrink-0 tabular-nums">
                          {format(parseISO(data), 'dd/MM (EEE)', { locale: ptBR })}
                        </span>
                        <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full transition-all"
                            style={{ width: `${maxVal > 0 ? (valor / maxVal) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold tabular-nums w-24 text-right">{fmtK(valor)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data source note */}
          <Card className="border border-blue-100 bg-blue-50/30">
            <CardContent className="p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">📊 Fonte dos dados</p>
              <p className="text-xs text-blue-600">
                Receita = pagamentos com <code className="bg-blue-100 px-1 rounded">status = 'pago'</code> filtrados por <code className="bg-blue-100 px-1 rounded">data_pagamento</code> (data real do recebimento).
                {ownerFilter && ` Valores ponderados pela % de "${ownerFilter}" na tabela turma_responsaveis.`}
                {' '}MRR = soma dos <code className="bg-blue-100 px-1 rounded">valor_mensalidade</code> de alunos com <code className="bg-blue-100 px-1 rounded">status = 'ativo'</code>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Por Turma ─────────────────────────────────────────────────────── */}
        <TabsContent value="turmas" className="mt-4">
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Por Turma — {format(new Date(), 'MMMM yyyy', { locale: ptBR })}
                <InfoTip text="MRR = valor mensal de todos os alunos ativos da turma. Coleta = pagamentos recebidos no mês atual com mes_referencia. Responsáveis mostram % de propriedade por turma." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turma</TableHead>
                    <TableHead className="text-right">Alunos</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Coleta</TableHead>
                    <TableHead>Responsáveis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mrrPorTurma as any[]).map((item: any) => (
                    <TableRow key={item.turma.id}>
                      <TableCell className="font-medium">{item.turma.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.ativos}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtK(item.mrrReal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtK(item.recebido)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={`tabular-nums text-xs ${item.tc >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.tc >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {item.tc}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {item.turmaResps?.map((r: any) => (
                            <span key={r.id} className="text-xs bg-muted px-1.5 py-0.5 rounded-md border border-border/50">
                              {r.nome_ref} {r.percentual}%
                            </span>
                          ))}
                          {!item.turmaResps?.length && item.ownerName && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-md border border-border/50">
                              {item.ownerName} 100%
                            </span>
                          )}
                          {!item.turmaResps?.length && !item.ownerName && (
                            <span className="text-xs text-muted-foreground">Não atribuído</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(mrrPorTurma as any[]).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma turma com alunos ativos</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Responsáveis ──────────────────────────────────────────────────── */}
        <TabsContent value="responsavel" className="mt-4 space-y-4">

          {/* Métricas por responsável */}
          {receitaPorOwner.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {receitaPorOwner.map(({ nome, mrr, recebido, txColeta }) => {
                const totalMrr = receitaPorOwner.reduce((s, r) => s + r.mrr, 0);
                const participacao = pct(mrr, totalMrr);
                const colors: Record<string, string> = {
                  'Onze Digital': 'from-blue-500 to-blue-600',
                  'Rodrygo':      'from-violet-500 to-violet-600',
                  'Keila':        'from-pink-500 to-pink-600',
                };
                const grad = colors[nome] || 'from-gray-500 to-gray-600';
                return (
                  <div key={nome} className="rounded-xl border border-border/60 bg-white overflow-hidden shadow-sm">
                    <div className={`bg-gradient-to-r ${grad} p-4 text-white`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-sm">{nome}</p>
                        <Badge className="bg-white/20 text-white border-0 text-xs">{participacao}% do MRR</Badge>
                      </div>
                      <p className="text-2xl font-bold tabular-nums">{fmtK(mrr)}</p>
                      <p className="text-xs text-white/70">MRR mensal</p>
                    </div>
                    <div className="p-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmtK(recebido)}</p>
                        <p className="text-xs text-muted-foreground">Recebido</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-700 tabular-nums">{fmtK(Math.max(0, mrr - recebido))}</p>
                        <p className="text-xs text-muted-foreground">Pendente</p>
                      </div>
                      <div>
                        <p className={`text-sm font-bold tabular-nums ${txColeta >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>{txColeta}%</p>
                        <p className="text-xs text-muted-foreground">Coleta</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {receitaPorOwner.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Configure a distribuição abaixo para ver as métricas por responsável.
            </div>
          )}

          {/* Configurar responsáveis + repasse por turma (compartilhado com a Balanço) */}
          <RepasseTurmasConfig turmas={turmas} onSaved={reloadTurmaResponsaveis} />
        </TabsContent>

        {/* ── Por Vencimento ────────────────────────────────────────────────── */}
        <TabsContent value="vencimento" className="mt-4">
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Fluxo por dia de vencimento — {format(new Date(), 'MMMM', { locale: ptBR })}
                <InfoTip text="Alunos agrupados pelo dia do mês em que pagam (dia_vencimento na tabela alunos). Mostra o perfil de fluxo de caixa: quanto entra em cada dia do mês." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead className="text-right">Alunos</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Pendente</TableHead>
                    <TableHead className="text-right">Atrasado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fluxoPorDia.map(({ dia, count, mrr, recebido, pendente, atrasado }) => (
                    <TableRow key={dia}>
                      <TableCell className="font-semibold">Dia {dia}</TableCell>
                      <TableCell className="text-right tabular-nums">{count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtK(mrr)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{fmtK(recebido)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700">{fmtK(pendente)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-700">{fmtK(atrasado)}</TableCell>
                    </TableRow>
                  ))}
                  {fluxoPorDia.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem dados de vencimento</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inadimplência (Aging) ─────────────────────────────────────────── */}
        <TabsContent value="aging" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: '0–30 dias', val: inadimplencia.buckets.b0_30,  cnt: inadimplencia.counts.b0_30,  color: 'amber' },
              { label: '31–60 dias', val: inadimplencia.buckets.b31_60, cnt: inadimplencia.counts.b31_60, color: 'orange' },
              { label: '61–90 dias', val: inadimplencia.buckets.b61_90, cnt: inadimplencia.counts.b61_90, color: 'red' },
              { label: '+90 dias',   val: inadimplencia.buckets.b90p,   cnt: inadimplencia.counts.b90p,   color: 'red' },
            ].map(({ label, val, cnt, color }) => (
              <Card key={label} className="border border-border/60 bg-white">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">{label}</p>
                  <p className={`text-xl font-bold tabular-nums ${color === 'amber' ? 'text-amber-700' : color === 'orange' ? 'text-orange-700' : 'text-red-700'}`}>
                    {fmtK(val)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{cnt} pagamento{cnt !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border border-border/60 bg-white">
            <CardContent className="p-4 space-y-2">
              <Row label="Total inadimplente" value={fmt(inadimplencia.valorTotal)} bold />
              <Row label="Nº de inadimplentes" value={`${inadimplencia.totalInadimplentes} alunos`} sub={`${inadimplencia.txInadimplencia}% da base ativa`} />
              <Row label="Meta máxima de inadimplência" value={`${metas.inadimplencia_max}%`} />
              <Row
                label="Status"
                value={inadimplencia.txInadimplencia <= metas.inadimplencia_max ? '✓ Dentro da meta' : '⚠ Acima da meta'}
                bold
              />
            </CardContent>
          </Card>
          <Card className="border border-blue-100 bg-blue-50/30">
            <CardContent className="p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">📊 Metodologia do aging</p>
              <p className="text-xs text-blue-600">
                Aging = tempo entre <code className="bg-blue-100 px-1 rounded">data_vencimento</code> e hoje para pagamentos com
                <code className="bg-blue-100 px-1 rounded">status = 'atrasado'</code>. Buckets: 0–30 dias (recuperável), 31–60 (atenção),
                61–90 (crítico), +90 dias (provisionável como perda).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Parcelas ──────────────────────────────────────────────────────── */}
        <TabsContent value="parcelas" className="mt-4">
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Progresso de parcelas por turma
                <InfoTip text="Média de mensalidades_pagas / total_mensalidades por aluno ativo em cada turma. LTV Restante = (total - pagas) × valor mensal. Fonte: tabelas alunos + turmas." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(parcelasPorTurma as any[]).map((item: any) => (
                <div key={item.turma.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.turma.nome}</span>
                    <span className="text-muted-foreground tabular-nums">
                      média {item.avgPagas.toFixed(1)}/{item.total} parcelas
                    </span>
                  </div>
                  <Progress value={item.progressPct} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.ativos} alunos · {item.progressPct}% concluído</span>
                    <span className="font-medium text-foreground">LTV restante: {fmtK(item.receitaRestante)}</span>
                  </div>
                </div>
              ))}
              {parcelasPorTurma.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma turma com dados de parcelas</p>
              )}
              <div className="mt-3 pt-3 border-t border-border/50">
                <Row label="LTV Restante Total" value={fmt(receitaRestanteTotal)} bold />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fluxo ─────────────────────────────────────────────────────────── */}
        <TabsContent value="fluxo" className="mt-4 space-y-4">
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 size={14} className="text-muted-foreground" />
                  Fluxo de Receita
                  <InfoTip text="Receita efetivamente recebida (status='pago') agrupada por período. Barras empilhadas por produto — dinâmico, baseado na tabela produtos. Linha tracejada amarela = meta MRR (modo Mensal). Fonte: vw_receita_por_fonte." />
                </CardTitle>
                <div className="flex gap-1">
                  {(['diario', 'semanal', 'mensal'] as GranularidadeFluxo[]).map(g => (
                    <PeriodBtn key={g} active={granularidadeFluxo === g} onClick={() => setGranularidadeFluxo(g)}>
                      {g === 'diario' ? 'Diário' : g === 'semanal' ? 'Semanal' : 'Mensal'}
                    </PeriodBtn>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const chartData = granularidadeFluxo === 'diario'
                  ? receitaDiariaDetalhada
                  : granularidadeFluxo === 'semanal'
                  ? receitaSemanal
                  : receitaMensal;
                const xKey = granularidadeFluxo === 'diario' ? 'data' : granularidadeFluxo === 'semanal' ? 'semana' : 'mes';
                const prodsFiltrados = produtos.filter(p => p.slug !== 'geral');
                if (!chartData.length || prodsFiltrados.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-10">Nenhum dado no período. Execute a migration para carregar produtos.</p>;
                }
                return (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData as any[]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey={xKey}
                        tick={{ fontSize: 11 }}
                        tickFormatter={granularidadeFluxo === 'diario'
                          ? (v: string) => { try { return format(parseISO(v), 'dd/MM', { locale: ptBR }); } catch { return v; } }
                          : undefined}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                      />
                      <Tooltip
                        formatter={(value: unknown, name: string) => {
                          const p = prodsFiltrados.find(pr => pr.slug === name);
                          return [fmt(value as number), p?.nome || name];
                        }}
                        labelFormatter={(label: string) =>
                          granularidadeFluxo === 'diario'
                            ? (() => { try { return format(parseISO(label), "dd 'de' MMMM", { locale: ptBR }); } catch { return label; } })()
                            : label
                        }
                      />
                      <Legend formatter={(value: string) => prodsFiltrados.find(pr => pr.slug === value)?.nome || value} />
                      {prodsFiltrados.map((produto, i) => (
                        <Bar
                          key={produto.slug}
                          dataKey={produto.slug}
                          stackId="stack"
                          fill={produto.cor}
                          radius={i === prodsFiltrados.length - 1 ? [3, 3, 0, 0] : undefined}
                        />
                      ))}
                      {granularidadeFluxo === 'mensal' && mrrTotal > 0 && (
                        <ReferenceLine
                          y={mrrTotal}
                          stroke="#f59e0b"
                          strokeDasharray="5 3"
                          label={{ value: 'Meta MRR', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
          <Card className="border border-blue-100 bg-blue-50/30">
            <CardContent className="p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">📊 Como ler este gráfico</p>
              <p className="text-xs text-blue-600">
                Cada barra = receita efetivamente recebida naquele período (<code className="bg-blue-100 px-1 rounded">status='pago'</code>).
                Cores = produtos configurados em <code className="bg-blue-100 px-1 rounded">produtos</code> — novos produtos aparecem aqui automaticamente.
                A linha amarela tracejada (modo Mensal) = meta MRR definida na aba Metas.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Líquido Real ───────────────────────────────────────────────────── */}
        <TabsContent value="liquido" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border border-border/60 bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Receita Bruta
                  <InfoTip text="Soma de todos os pagamentos com status='pago' no mês atual. Fonte: vw_receita_por_fonte (JOIN pagamentos + alunos)." />
                </p>
                <p className="text-xl font-bold tabular-nums">{fmtK(totaisLiquido.bruto)}</p>
                <p className="text-xs text-muted-foreground">{totaisLiquido.count} transações</p>
              </CardContent>
            </Card>
            <Card className="border border-red-100 bg-red-50/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Taxas Estimadas
                  <InfoTip text="Calculado transação a transação via payment_method_rates. Boleto PSI = valor×1%+R$1,99. PIX = valor×0,99%. Cartão = valor×3,49%. Edite as taxas abaixo." />
                </p>
                <p className="text-xl font-bold tabular-nums text-red-600">−{fmtK(totaisLiquido.taxas)}</p>
                {totaisLiquido.bruto > 0 && (
                  <p className="text-xs text-muted-foreground">{((totaisLiquido.taxas / totaisLiquido.bruto) * 100).toFixed(2)}% do bruto</p>
                )}
              </CardContent>
            </Card>
            <Card className="border border-emerald-100 bg-emerald-50/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Líquido Real
                  <InfoTip text="Bruto − Taxas. O que efetivamente fica após pagar os gateways. Use este número para calcular margens — não a receita bruta." />
                </p>
                <p className="text-xl font-bold tabular-nums text-emerald-600">{fmtK(totaisLiquido.liquido)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers size={14} className="text-muted-foreground" />
                Breakdown por produto — {mesLabel(mesAtual)}
                <InfoTip text="Cálculo por produto. Regra de taxa: produto+forma exato > produto+* > *+forma > *+*. Fonte: vw_receita_por_fonte × payment_method_rates." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {produtos.filter(p => p.slug !== 'geral').length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Execute a migration para carregar produtos configuráveis</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Bruto</TableHead>
                      <TableHead className="text-right">Taxas</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead className="text-right">Transações</TableHead>
                      <TableHead className="text-right">% Taxa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtos.filter(p => p.slug !== 'geral').map(produto => {
                      const d = liquidoPorProduto[produto.slug] || { bruto: 0, taxas: 0, liquido: 0, count: 0 };
                      return (
                        <TableRow key={produto.id}>
                          <TableCell>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: produto.cor + '20', color: produto.cor }}>
                              {produto.nome}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(d.bruto)}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">−{fmt(d.taxas)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-emerald-600">{fmt(d.liquido)}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">{d.count}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {d.bruto > 0 ? `${((d.taxas / d.bruto) * 100).toFixed(2)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/20">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(totaisLiquido.bruto)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-red-600">−{fmt(totaisLiquido.taxas)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-emerald-600">{fmt(totaisLiquido.liquido)}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">{totaisLiquido.count}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {totaisLiquido.bruto > 0 ? `${((totaisLiquido.taxas / totaisLiquido.bruto) * 100).toFixed(2)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <TaxasPagamentoConfig produtos={produtos} taxas={taxasDetalhe} onSaved={setTaxasDetalhe} />
        </TabsContent>

        {/* ── Fontes ─────────────────────────────────────────────────────────── */}
        <TabsContent value="fontes" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-border/60 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers size={14} className="text-muted-foreground" />
                  Por Produto — {mesLabel(mesAtual)}
                  <InfoTip text="Concentração de receita por produto no mês atual. Concentração > 70% em um produto = risco de dependência. Fonte: vw_receita_por_fonte.produto." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const total = Object.values(liquidoPorProduto).reduce((s, v) => s + v.bruto, 0);
                  const comDados = produtos.filter(p => p.slug !== 'geral' && (liquidoPorProduto[p.slug]?.bruto || 0) > 0);
                  return comDados.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sem receita registrada no mês atual</p>
                  ) : (
                    <div className="space-y-3">
                      {comDados.map(produto => {
                        const val = liquidoPorProduto[produto.slug]?.bruto || 0;
                        const pctVal = total > 0 ? (val / total) * 100 : 0;
                        return (
                          <div key={produto.id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: produto.cor }} />
                                {produto.nome}
                              </span>
                              <span className="tabular-nums font-medium">{fmtK(val)} · {pctVal.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, background: produto.cor }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border border-border/60 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Droplets size={14} className="text-muted-foreground" />
                  Por Forma de Pagamento — {mesLabel(mesAtual)}
                  <InfoTip text="Mix de pagamentos do mês. Boleto: R$1,99+1% por emissão — ruim para valores baixos. PIX: 0,99% — mais barato, liquidação imediata. Cartão: 3,49% — menor inadimplência. Fonte: vw_receita_por_fonte.forma_pagamento." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {receitaPorMetodo.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados de pagamento no mês atual</p>
                ) : (
                  <div className="space-y-3">
                    {receitaPorMetodo.map(({ forma, label, valor, pct: pctVal }) => {
                      const cor: Record<string, string> = { boleto: '#f59e0b', cartao: '#3b82f6', pix: '#10b981', avista: '#8b5cf6' };
                      const c = cor[forma] || '#6b7280';
                      return (
                        <div key={forma} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: c }} />
                              {label}
                            </span>
                            <span className="tabular-nums font-medium">{fmtK(valor)} · {pctVal.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, background: c }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Produto × Forma de Pagamento — {mesLabel(mesAtual)}
                <InfoTip text="Cruzamento receita por produto e forma de pagamento. Soma horizontal = total do produto. Soma vertical = total da forma. Fonte: vw_receita_por_fonte." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const formas = ['boleto', 'cartao', 'pix', 'avista'];
                const LABELS: Record<string, string> = { boleto: 'Boleto', cartao: 'Cartão', pix: 'PIX', avista: 'À Vista' };
                const prodsFiltrados = produtos.filter(p => p.slug !== 'geral');
                const cross: Record<string, Record<string, number>> = {};
                const colTotais: Record<string, number> = {};
                for (const p of prodsFiltrados) { cross[p.slug] = {}; for (const f of formas) cross[p.slug][f] = 0; }
                for (const f of formas) colTotais[f] = 0;
                for (const pag of pagamentosComFonte.filter(x => x.mes_referencia?.startsWith(mesAtual))) {
                  const slug = pag.produto || 'outros';
                  const forma = pag.forma_pagamento || 'boleto';
                  const val = (pag.valor || 0) * getOwnerShare(pag.turma_id);
                  if (cross[slug]) {
                    cross[slug][forma] = (cross[slug][forma] || 0) + val;
                    colTotais[forma] = (colTotais[forma] || 0) + val;
                  }
                }
                const linhasComDados = prodsFiltrados.filter(p => formas.some(f => (cross[p.slug]?.[f] || 0) > 0));
                return linhasComDados.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados cruzados no mês atual</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          {formas.map(f => <TableHead key={f} className="text-right">{LABELS[f]}</TableHead>)}
                          <TableHead className="text-right font-semibold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhasComDados.map(produto => {
                          const row = cross[produto.slug] || {};
                          const rowTotal = formas.reduce((s, f) => s + (row[f] || 0), 0);
                          return (
                            <TableRow key={produto.id}>
                              <TableCell>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: produto.cor + '20', color: produto.cor }}>
                                  {produto.nome}
                                </span>
                              </TableCell>
                              {formas.map(f => (
                                <TableCell key={f} className="text-right tabular-nums text-sm">
                                  {(row[f] || 0) > 0 ? fmtK(row[f]) : '—'}
                                </TableCell>
                              ))}
                              <TableCell className="text-right tabular-nums font-semibold">{fmtK(rowTotal)}</TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/20">
                          <TableCell className="font-semibold">Total</TableCell>
                          {formas.map(f => (
                            <TableCell key={f} className="text-right tabular-nums font-semibold">
                              {colTotais[f] > 0 ? fmtK(colTotais[f]) : '—'}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums font-bold">
                            {fmtK(formas.reduce((s, f) => s + colTotais[f], 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Metas ─────────────────────────────────────────────────────────── */}
        <TabsContent value="metas" className="mt-4 space-y-4">
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target size={14} className="text-muted-foreground" />
                  Metas internas
                  <InfoTip text="Metas salvas localmente no navegador (localStorage). Comparadas com os dados reais para mostrar progresso nos KPI cards acima." />
                </CardTitle>
                {!editingMeta ? (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setMetasDraft({...metas}); setEditingMeta(true); }}>
                    <Pencil className="h-3 w-3" /> Editar metas
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setEditingMeta(false)}>
                      <X className="h-3 w-3" /> Cancelar
                    </Button>
                    <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveMetas}>
                      <Save className="h-3 w-3" /> Salvar
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'mrr', label: 'Meta MRR mensal', atual: mrrTotal, unit: 'R$', fonte: 'Comparado com MRR projetado (alunos ativos)' },
                { key: 'coleta_mes', label: 'Meta receita mensal (coleta)', atual: receitaMesAtual, unit: 'R$', fonte: 'Comparado com pagamentos recebidos no mês atual' },
                { key: 'receita_hoje', label: 'Meta receita diária', atual: receitaHoje, unit: 'R$', fonte: 'Comparado com pagamentos de hoje' },
                { key: 'inadimplencia_max', label: 'Inadimplência máxima (%)', atual: inadimplencia.txInadimplencia, unit: '%', fonte: 'Comparado com % de alunos com pagamento atrasado', invert: true },
              ].map(({ key, label, atual, unit, fonte, invert }) => {
                const metaVal = (metas as any)[key] as number;
                const atingiu = invert ? atual <= metaVal : atual >= metaVal;
                const progresso = invert
                  ? Math.max(0, 100 - pct(Math.max(0, atual - metaVal), metaVal))
                  : pct(atual, metaVal);
                return (
                  <div key={key} className="p-4 rounded-xl border border-border/60 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold flex items-center gap-1">
                          {label}
                          <InfoTip text={fonte} />
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Atual: <span className="font-medium text-foreground">
                            {unit === 'R$' ? fmtK(atual) : `${atual}%`}
                          </span>
                          {' '}/ Meta: <span className="font-medium text-foreground">
                            {unit === 'R$' ? fmtK(metaVal) : `${metaVal}%`}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0">
                        {editingMeta ? (
                          <Input
                            type="number"
                            className="w-28 h-8 text-sm"
                            value={(metasDraft as any)[key]}
                            onChange={e => setMetasDraft(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                          />
                        ) : (
                          <Badge className={`text-xs ${atingiu ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            {atingiu ? '✓ Atingida' : `${progresso}%`}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {!editingMeta && (
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${atingiu ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.min(progresso, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border border-blue-100 bg-blue-50/30">
            <CardContent className="p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">💾 Armazenamento das metas</p>
              <p className="text-xs text-blue-600">
                As metas são salvas no <strong>localStorage</strong> deste navegador (chave: <code className="bg-blue-100 px-1 rounded">{METAS_KEY}</code>).
                São mantidas entre sessões mas são específicas para este dispositivo/navegador.
                Para compartilhar metas com o time, seria necessário salvar em tabela Supabase.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Config ─────────────────────────────────────────────────────────── */}
        <TabsContent value="config" className="mt-4 space-y-4">

          {/* Produtos */}
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers size={14} className="text-muted-foreground" />
                  Produtos
                  <InfoTip text="Lista de produtos configuráveis. Cada produto aparece automaticamente nas abas Fluxo, Fontes e Líquido Real. Novos produtos são adicionados aqui — sem deploy. Fonte: tabela public.produtos." />
                </CardTitle>
                {!editingProdutos ? (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setProdutosDraft([...produtos]); setEditingProdutos(true); }}>
                    <Pencil className="h-3 w-3" /> Editar produtos
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setEditingProdutos(false); setProdutosDraft([...produtos]); }}>
                      <X className="h-3 w-3" /> Cancelar
                    </Button>
                    <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveProdutos} disabled={savingProdutos}>
                      <Save className="h-3 w-3" /> {savingProdutos ? 'Salvando…' : 'Salvar'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingProdutos ? (
                <div className="space-y-2">
                  {produtosDraft.map((produto, idx) => (
                    <div key={produto.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/40">
                      <input
                        type="color"
                        value={produto.cor}
                        onChange={e => setProdutosDraft(prev => prev.map((p, i) => i === idx ? { ...p, cor: e.target.value } : p))}
                        className="w-8 h-8 rounded border-0 cursor-pointer p-0"
                        title="Cor do produto"
                      />
                      <Input
                        className="h-8 text-sm flex-1"
                        value={produto.nome}
                        onChange={e => setProdutosDraft(prev => prev.map((p, i) => i === idx ? { ...p, nome: e.target.value } : p))}
                        placeholder="Nome do produto"
                      />
                      <Input
                        className="h-8 text-sm w-36 font-mono text-xs"
                        value={produto.slug}
                        onChange={e => setProdutosDraft(prev => prev.map((p, i) => i === idx ? { ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') } : p))}
                        placeholder="slug-do-produto"
                        title="Slug (chave única, sem espaços)"
                      />
                      {produto.slug !== 'geral' && (
                        <Button
                          size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 shrink-0"
                          onClick={() => setProdutosDraft(prev => prev.filter((_, i) => i !== idx))}
                          title="Remover produto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    size="sm" variant="outline" className="gap-1.5 text-xs mt-1"
                    onClick={() => setProdutosDraft(prev => [...prev, {
                      id: crypto.randomUUID(), nome: 'Novo Produto', slug: `produto-${Date.now()}`,
                      cor: '#6366f1', ativo: true, ordem: prev.length + 1,
                    }])}
                  >
                    <Plus className="h-3 w-3" /> Novo produto
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    O slug é a chave usada internamente. Mude apenas em novos produtos — alterar o slug de um produto existente quebra o vínculo com dados históricos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {produtos.map(produto => (
                    <div key={produto.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/30">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: produto.cor }} />
                      <span className="flex-1 text-sm font-medium">{produto.nome}</span>
                      <code className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded">{produto.slug}</code>
                    </div>
                  ))}
                  {produtos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto. Execute a migration SQL primeiro.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-blue-100 bg-blue-50/30">
            <CardContent className="p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">📋 Como funciona a escalabilidade de produtos</p>
              <p className="text-xs text-blue-600">
                Adicionar um novo produto aqui faz ele aparecer automaticamente nas abas Fluxo (barras no gráfico), Fontes (linhas na tabela) e Líquido Real (breakdown por produto).
                Configure as taxas do novo produto na aba <strong>Líquido Real → Configuração de Taxas</strong>.
                Associe turmas ao novo produto pelo campo <code className="bg-blue-100 px-1 rounded">produto</code> na tabela turmas.
              </p>
            </CardContent>
          </Card>

        </TabsContent>

      </Tabs>
    </div>
  );
}
