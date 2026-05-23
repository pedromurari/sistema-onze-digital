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
  Users, BarChart3, CheckCircle2, TrendingDown, Pencil, Save, X, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO, subDays, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

type Periodo = 'hoje' | 'semana' | 'mes' | '3m';

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

const OWNERS = ['Onze Digital', 'Rodrygo', 'Keila'] as const;
type Owner = typeof OWNERS[number] | '';

const METAS_KEY = 'cfo_metas_v1';
const METAS_DEFAULT: Metas = { mrr: 50000, coleta_mes: 40000, inadimplencia_max: 5, receita_hoje: 2000 };

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
  icon, label, value, sub, color, progress, meta, fonte,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color: 'blue' | 'emerald' | 'red' | 'violet' | 'amber';
  progress?: number; meta?: { atual: number; alvo: number; label: string };
  fonte?: string;
}) {
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
    <Card className="border border-border/60 shadow-sm bg-white hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-xl ${cls}`}>{icon}</div>
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            {label}
            {fonte && <InfoTip text={fonte} />}
          </span>
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

  // Configuração de responsáveis por turma
  type RespEntry = { owner1: Owner; pct1: number; owner2: Owner; pct2: number };
  const [cfgResp, setCfgResp]       = useState<Record<string, RespEntry>>({});
  const [savingResp, setSavingResp] = useState(false);

  const mesAtual   = useMemo(() => mesStr(0), []);
  const mesAnterior = useMemo(() => mesStr(1), []);
  const hoje       = useMemo(() => todayStr(), []);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: t }, { data: a }, { data: p }, { data: r }, { data: rl }] = await Promise.all([
        supabase.from('turmas').select('id, nome, produto, valor_mensalidade, total_mensalidades, responsavel_id'),
        supabase.from('alunos').select('id, nome, turma_id, status, dia_vencimento, valor_mensalidade, mensalidades_pagas, total_mensalidades').neq('status', 'cancelado'),
        supabase.from('pagamentos').select('id, aluno_id, turma_id, valor, status, data_pagamento, data_vencimento, mes_referencia'),
        supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual'),
        supabase.from('responsaveis').select('id, nome'),
      ]);
      setTurmas(t || []);
      setAlunos(a || []);
      setPagamentos(p || []);
      setResponsaveis(r || []);
      setResponsaveisList(rl || []);
      setLoading(false);
    };
    load();
  }, []);

  // ── Build cfgResp from loaded responsaveis ───────────────────────────────
  useEffect(() => {
    const cfg: Record<string, RespEntry> = {};
    for (const turma of turmas) {
      const entries = responsaveis.filter(r => r.turma_id === turma.id && r.nome_ref);
      const [e1, e2] = entries;
      cfg[turma.id] = {
        owner1: (e1?.nome_ref as Owner) || '',
        pct1:   e1?.percentual ?? 100,
        owner2: (e2?.nome_ref as Owner) || '',
        pct2:   e2?.percentual ?? 0,
      };
    }
    setCfgResp(cfg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmas, responsaveis]);

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
      const dias = differenceInDays(new Date(hoje), parseISO(pag.data_vencimento));
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
    for (const owner of OWNERS) map[owner] = { nome: owner, mrr: 0, recebido: 0, txColeta: 0 };

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

  // ── Resp config save ─────────────────────────────────────────────────────

  async function handleSaveResp() {
    setSavingResp(true);
    const turmaIds = Object.keys(cfgResp);
    if (turmaIds.length) {
      await supabase.from('turma_responsaveis').delete().in('turma_id', turmaIds);
    }
    const rows: { turma_id: string; nome_ref: string; percentual: number; user_id: string }[] = [];
    for (const [turmaId, entry] of Object.entries(cfgResp)) {
      if (entry.owner1) rows.push({ turma_id: turmaId, nome_ref: entry.owner1, percentual: entry.pct1, user_id: crypto.randomUUID() });
      if (entry.owner2) rows.push({ turma_id: turmaId, nome_ref: entry.owner2, percentual: entry.pct2, user_id: crypto.randomUUID() });
    }
    if (rows.length) await supabase.from('turma_responsaveis').insert(rows);
    const { data: r } = await supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual');
    setResponsaveis(r || []);
    setSavingResp(false);
    toast.success('Distribuição salva!');
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
        {/* Owner filter — sempre visível com os 3 donos */}
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          {(['', ...OWNERS] as const).map(owner => (
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<DollarSign className="h-4 w-4" />}
          label="MRR Projetado"
          value={fmtK(mrrTotal)}
          sub={`${alunosAtivos.length} alunos ativos${ownerFilter ? ` · ${ownerFilter}` : ''}`}
          color="blue"
          meta={{ atual: mrrTotal, alvo: metas.mrr, label: 'Meta MRR' }}
          fonte={`Soma do valor_mensalidade de todos os alunos com status='ativo'${ownerFilter ? `, ponderado pela % de ${ownerFilter} em turma_responsaveis` : ''}. Fonte: tabelas alunos + turmas${ownerFilter ? ' + turma_responsaveis' : ''}.`}
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
        />
        <KPICard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Inadimplência"
          value={fmtK(inadimplencia.valorTotal)}
          sub={`${inadimplencia.totalInadimplentes} alunos · ${inadimplencia.txInadimplencia}% da base ativa`}
          color={inadimplencia.txInadimplencia > metas.inadimplencia_max ? 'red' : 'amber'}
          fonte={`Pagamentos com status='atrasado'. Taxa = inadimplentes / total ativos. Meta máxima: ${metas.inadimplencia_max}%. Fonte: tabela pagamentos (data_vencimento + status).`}
        />
        <KPICard
          icon={<Target className="h-4 w-4" />}
          label="LTV Restante"
          value={fmtK(ltvRestante)}
          sub={`Parcelas futuras a receber — ${alunosAtivos.length} alunos`}
          color="violet"
          fonte={`(total_mensalidades - mensalidades_pagas) × valor_mensalidade por aluno ativo${ownerFilter ? `, ponderado pela % de ${ownerFilter}` : ''}. Fonte: tabelas alunos + turmas.`}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="receita">
        <TabsList className="bg-muted/40 flex-wrap h-auto gap-1">
          <TabsTrigger value="receita">Receita</TabsTrigger>
          <TabsTrigger value="turmas">Por Turma</TabsTrigger>
          <TabsTrigger value="responsavel">Responsáveis</TabsTrigger>
          <TabsTrigger value="vencimento">Por Vencimento</TabsTrigger>
          <TabsTrigger value="aging">Inadimplência</TabsTrigger>
          <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
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

          {/* Configurar distribuição por turma */}
          <Card className="border border-border/60 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Settings2 size={14} className="text-muted-foreground" />
                  Configurar distribuição por turma
                  <InfoTip text="Defina qual % de cada turma pertence a cada responsável. Onze Digital, Rodrygo e Keila podem dividir a mesma turma proporcionalmente. Total deve somar 100%." />
                </CardTitle>
                <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveResp} disabled={savingResp}>
                  {savingResp ? <><span className="animate-spin">⏳</span> Salvando...</> : <><Save className="h-3 w-3" /> Salvar</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {turmas.filter(t => {
                  const ativos = alunos.filter(a => a.turma_id === t.id && a.status === 'ativo');
                  return ativos.length > 0;
                }).map(turma => {
                  const entry = cfgResp[turma.id] ?? { owner1: '', pct1: 100, owner2: '', pct2: 0 };
                  const pct1 = entry.pct1;
                  const pct2 = entry.pct2;
                  const total = (entry.owner1 ? pct1 : 0) + (entry.owner2 ? pct2 : 0);
                  const ok = !entry.owner1 || total === 100;
                  return (
                    <div key={turma.id} className={`rounded-lg border px-4 py-3 ${ok ? 'border-border/60' : 'border-amber-300 bg-amber-50/30'}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-medium w-32 shrink-0">{turma.nome}</span>
                        {/* Owner 1 */}
                        <Select
                          value={entry.owner1 || '__none__'}
                          onValueChange={v => {
                            const owner = v === '__none__' ? '' : v;
                            setCfgResp(prev => ({
                              ...prev,
                              [turma.id]: { ...entry, owner1: owner as Owner, pct1: owner ? (entry.owner2 ? entry.pct1 : 100) : 100 },
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs w-36">
                            <SelectValue placeholder="Responsável 1..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Nenhum —</SelectItem>
                            {OWNERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {entry.owner1 && (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min={0} max={100} className="h-8 w-16 text-xs"
                              value={pct1}
                              onChange={e => setCfgResp(prev => ({ ...prev, [turma.id]: { ...entry, pct1: Number(e.target.value) } }))}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                        {/* Owner 2 (opcional) */}
                        {entry.owner1 && (
                          <>
                            <span className="text-xs text-muted-foreground">+</span>
                            <Select
                              value={entry.owner2 || '__none__'}
                              onValueChange={v => {
                                const owner = v === '__none__' ? '' : v;
                                setCfgResp(prev => ({
                                  ...prev,
                                  [turma.id]: { ...entry, owner2: owner as Owner, pct2: owner ? 100 - entry.pct1 : 0 },
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-36">
                                <SelectValue placeholder="Responsável 2..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Nenhum —</SelectItem>
                                {OWNERS.filter(o => o !== entry.owner1).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {entry.owner2 && (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number" min={0} max={100} className="h-8 w-16 text-xs"
                                  value={pct2}
                                  onChange={e => setCfgResp(prev => ({ ...prev, [turma.id]: { ...entry, pct2: Number(e.target.value) } }))}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* Validação total */}
                        {entry.owner1 && !ok && (
                          <span className="text-xs text-amber-700 font-medium">total {total}% (precisa ser 100%)</span>
                        )}
                        {entry.owner1 && ok && (
                          <span className="text-xs text-emerald-600">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
}
