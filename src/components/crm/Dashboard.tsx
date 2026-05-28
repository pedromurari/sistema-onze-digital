import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Users, TrendingUp, DollarSign, AlertTriangle, BarChart3, Clock,
  AlertCircle, Zap, TrendingDown, CheckCircle2, CalendarDays, Rocket, Target, ChevronDown,
} from 'lucide-react';
import { isPast, format, differenceInDays, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Aluno {
  id: string; nome: string; produto: 'psicanalise' | 'numerologia';
  status: 'ativo' | 'inadimplente' | 'cancelado' | 'concluido';
  turma_id?: string; data_inicio: string; created_at: string;
  valor_mensalidade?: number; mensalidades_pagas?: number; total_mensalidades?: number;
}
interface Pagamento {
  id: string; aluno_id: string; valor: number; mes_referencia: string;
  status: 'pago' | 'pendente' | 'atrasado'; data_pagamento?: string;
  data_vencimento?: string; created_at: string;
}
interface Task {
  id: string; titulo: string; status: string; prioridade: string;
  responsavel_id?: string; responsaveis?: string[]; prazo?: string;
  categoria: string; pagina: string; created_at: string;
}
interface Turma {
  id: string; nome: string; produto: 'psicanalise' | 'numerologia';
  valor_mensalidade?: number; total_mensalidades?: number;
  data_inicio?: string; data_fim?: string; tipo?: string;
  responsavel_id?: string | null;
}
interface Responsavel { id: string; nome: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTruthyFlag(v: unknown) {
  return v === true || String(v || '').trim().toUpperCase() === 'SIM';
}

function getLancamentoStage(lead: any): string {
  if (lead.fase === 'matricula' || isTruthyFlag(lead.matriculado)) return 'matricula';
  if (lead.fase === 'follow_up_03' || isTruthyFlag(lead.follow_up_03)) return 'followUp03';
  if (lead.fase === 'follow_up_02' || isTruthyFlag(lead.follow_up_02)) return 'followUp02';
  if (lead.fase === 'follow_up_01' || isTruthyFlag(lead.follow_up_01)) return 'followUp01';
  if (lead.fase === 'grupo_oferta' || isTruthyFlag(lead.grupo_oferta)) return 'grupoOferta';
  if (lead.fase === 'grupo_lancamento' || lead.fase === 'no_grupo' || isTruthyFlag(lead.no_grupo)) return 'grupoLancamento';
  return 'planilha';
}

const LANCAMENTO_STAGE_RANK: Record<string, number> = {
  planilha: 0, grupoLancamento: 1, grupoOferta: 2,
  followUp01: 3, followUp02: 4, followUp03: 5, matricula: 6,
};

const NPA_STAGE_RANK: Record<string, number> = {
  novo: 0, ingresso_pago: 1, no_grupo: 2, confirmado: 3, evento: 4,
  closer: 5, follow_up_01: 6, follow_up_02: 7, follow_up_03: 8, matricula: 9,
};

// Deduplicates rows by a key function, keeping the highest-rank row
function dedupByKey<T>(
  rows: T[],
  keyFn: (r: T) => string | null | undefined,
  rankFn: (r: T) => number,
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || rankFn(row) > rankFn(existing)) map.set(key, row);
  }
  return Array.from(map.values());
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = 'blue',
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: 'blue' | 'green' | 'red' | 'purple' | 'amber';
}) {
  const c = {
    blue:   { icon: 'text-blue-500',    bg: 'bg-blue-500/10' },
    green:  { icon: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    red:    { icon: 'text-red-500',     bg: 'bg-red-500/10' },
    purple: { icon: 'text-purple-500',  bg: 'bg-purple-500/10' },
    amber:  { icon: 'text-amber-500',   bg: 'bg-amber-500/10' },
  }[accent];

  return (
    <Card className="border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow bg-white">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
            <p className="text-[28px] font-bold text-foreground mt-1.5 leading-none tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-2 leading-snug">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={18} className={c.icon} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-1 py-2 text-sm font-semibold text-foreground/80 hover:text-foreground transition-colors group"
      >
        <Icon size={14} className="text-muted-foreground" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-4 mt-2">{children}</div>}
    </div>
  );
}

// ─── Funnel Bar ──────────────────────────────────────────────────────────────

function FunnelBar({ label, count, total, isLast = false, accent = '#6366f1' }: {
  label: string; count: number; total: number; isLast?: boolean; accent?: string;
}) {
  const pct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 4 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 sm:w-36 text-right shrink-0">
        <span className={`text-xs font-medium ${isLast ? 'text-emerald-700' : 'text-muted-foreground'}`}>{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: isLast ? '#10b981' : accent + 'cc' }}
          />
        </div>
        <span className={`text-sm font-semibold w-8 text-right tabular-nums ${isLast ? 'text-emerald-700' : ''}`}>{count}</span>
        {total > 0 && count > 0 && (
          <span className="text-xs text-muted-foreground w-9 tabular-nums">{Math.round((count / total) * 100)}%</span>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user, users } = useAuth();
  const [alunos, setAlunos]           = useState<Aluno[]>([]);
  const [pagamentos, setPagamentos]   = useState<Pagamento[]>([]);
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [turmas, setTurmas]           = useState<Turma[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [lancLeads, setLancLeads]     = useState<any[]>([]);    // deduped per lancamento
  const [allLancLeads, setAllLancLeads] = useState<any[]>([]);  // all, for cross-lancamento dedup
  const [npaEventos, setNpaEventos]   = useState<any[]>([]);
  const [npaLeads, setNpaLeads]       = useState<any[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<{id: string; titulo: string; data_inicio: string; data_fim?: string | null; cor: string}[]>([]);
  const [responsaveisList, setResponsaveisList] = useState<Responsavel[]>([]);
  const [selLancId, setSelLancId]     = useState('');
  const [selNpaId, setSelNpaId]       = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('Onze Digital');
  const [loading, setLoading]         = useState(true);
  const isAdmin = user?.tipo === 'admin';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const [alunosRes, pagRes, tasksRes, turmasRes, lancRes, npaEvtRes, evtCalRes, respRes] = await Promise.all([
        supabase.from('alunos').select('id, nome, produto, status, turma_id, data_inicio, created_at, valor_mensalidade, mensalidades_pagas, total_mensalidades').limit(500),
        supabase.from('pagamentos').select('id, aluno_id, valor, mes_referencia, status, data_pagamento, data_vencimento, created_at').order('created_at', { ascending: false }).limit(5000),
        supabase.from('tarefas').select('id, titulo, status, prioridade, responsavel_id, responsaveis, prazo, categoria, pagina, created_at').order('prazo').limit(50),
        supabase.from('turmas').select('id, nome, produto, valor_mensalidade, total_mensalidades, data_inicio, data_fim, responsavel_id'),
        supabase.from('lancamentos').select('id, nome, ativo, created_at, data_live').order('created_at', { ascending: false }).limit(20),
        supabase.from('npa_eventos').select('id, nome, ativo, data_evento').order('created_at', { ascending: false }).limit(20),
        // Inclui eventos futuros E eventos em andamento (data_fim >= hoje, mesmo que data_inicio < hoje)
        supabase.from('eventos_calendario').select('id, titulo, data_inicio, data_fim, cor')
          .or(`data_inicio.gte.${hoje.toISOString()},data_fim.gte.${hoje.toISOString()}`)
          .order('data_inicio').limit(30),
        supabase.from('responsaveis').select('id, nome'),
      ]);

      if (alunosRes.data) setAlunos(alunosRes.data as Aluno[]);
      if (pagRes.data) setPagamentos(pagRes.data as Pagamento[]);
      if (tasksRes.data) setTasks(tasksRes.data as Task[]);
      if (turmasRes.data) setTurmas(turmasRes.data as Turma[]);
      if (respRes.data) setResponsaveisList(respRes.data as Responsavel[]);
      if (evtCalRes.data) setEventosCalendario(evtCalRes.data as any);

      const lancList = lancRes.data || [];
      const npaList  = npaEvtRes.data || [];
      setLancamentos(lancList);
      setNpaEventos(npaList);
      setSelLancId(prev => prev || lancList[0]?.id || '');
      setSelNpaId(prev => prev || npaList[0]?.id || '');

      if (showLoading) setLoading(false);
    };

    load(true);

    const reload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(false), 2000);
    };

    const ch = supabase.channel('dashboard-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alunos' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamento_leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npa_evento_leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, reload)
      .subscribe();

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); supabase.removeChannel(ch); };
  }, []);

  // ── Load lancamento leads (with deduplication) ────────────────────────────

  useEffect(() => {
    if (!selLancId) return;
    const load = async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data: page } = await supabase.from('lancamento_leads')
          .select('id, lancamento_id, fase, no_grupo, grupo_oferta, follow_up_01, follow_up_02, follow_up_03, matriculado, whatsapp, email')
          .eq('lancamento_id', selLancId)
          .range(from, from + 999);
        if (!page || page.length === 0) break;
        all.push(...page);
        if (page.length < 1000) break;
        from += 1000;
      }
      // Deduplicate by whatsapp within this lancamento, keeping highest stage
      const deduped = dedupByKey(
        all,
        r => r.whatsapp || r.email || r.id,
        r => LANCAMENTO_STAGE_RANK[getLancamentoStage(r)] ?? 0,
      );
      setLancLeads(deduped);
      setAllLancLeads(prev => {
        // Replace rows for this lancamento in the master list
        const other = prev.filter(r => r.lancamento_id !== selLancId);
        return [...other, ...deduped];
      });
    };
    load();
  }, [selLancId]);

  // ── Load NPA leads (with deduplication) ──────────────────────────────────

  useEffect(() => {
    if (!selNpaId) return;
    const load = async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data: page } = await supabase.from('npa_evento_leads')
          .select('id, npa_evento_id, fase, matriculado, whatsapp, email')
          .eq('npa_evento_id', selNpaId)
          .range(from, from + 999);
        if (!page || page.length === 0) break;
        all.push(...page);
        if (page.length < 1000) break;
        from += 1000;
      }
      // Dedup by whatsapp within this NPA
      const deduped = dedupByKey(
        all,
        r => r.whatsapp || r.email || r.id,
        r => NPA_STAGE_RANK[r.fase] ?? 0,
      );
      setNpaLeads(deduped);
    };
    load();
  }, [selNpaId]);

  // ── Financial KPIs ────────────────────────────────────────────────────────

  const mesAtual = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const alunosAtivos = useMemo(() => alunos.filter(a => a.status === 'ativo'), [alunos]);

  // Owner filter: 1 = include, 0 = exclude
  const ownerTurmaIds = useMemo(() => {
    if (!ownerFilter) return null; // null = todos
    const ids = new Set<string>();
    for (const turma of turmas) {
      if (!turma.responsavel_id) continue;
      const resp = responsaveisList.find(r => r.id === turma.responsavel_id);
      if (resp?.nome === ownerFilter) ids.add(turma.id);
    }
    return ids;
  }, [ownerFilter, turmas, responsaveisList]);

  const ownerAlunoIds = useMemo(() => {
    if (!ownerTurmaIds) return null;
    return new Set(alunos.filter(a => a.turma_id && ownerTurmaIds.has(a.turma_id)).map(a => a.id));
  }, [alunos, ownerTurmaIds]);

  const filteredAlunosAtivos = useMemo(() =>
    ownerAlunoIds ? alunosAtivos.filter(a => ownerAlunoIds.has(a.id)) : alunosAtivos,
  [alunosAtivos, ownerAlunoIds]);

  const mrrEfetivo = useMemo(() => {
    return filteredAlunosAtivos.reduce((sum, a) => {
      const turma = turmas.find(t => t.id === a.turma_id);
      const val = a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0;
      return sum + val;
    }, 0);
  }, [filteredAlunosAtivos, turmas]);

  const recebidoMes = useMemo(() =>
    pagamentos
      .filter(p => p.status === 'pago' && p.mes_referencia?.startsWith(mesAtual) && (!ownerAlunoIds || ownerAlunoIds.has(p.aluno_id)))
      .reduce((s, p) => s + p.valor, 0),
  [pagamentos, mesAtual, ownerAlunoIds]);

  const taxaColeta = mrrEfetivo > 0 ? Math.round((recebidoMes / mrrEfetivo) * 100) : 0;

  const alunoInadimplentesIds = useMemo(() =>
    new Set(pagamentos.filter(p => p.status === 'atrasado').map(p => p.aluno_id)),
  [pagamentos]);

  const inadimplentesCount = useMemo(() =>
    alunos.filter(a => a.status === 'inadimplente' && (!ownerAlunoIds || ownerAlunoIds.has(a.id))).length,
  [alunos, ownerAlunoIds]);

  const valorInadimplente = useMemo(() =>
    pagamentos
      .filter(p => p.status === 'atrasado' && (!ownerAlunoIds || ownerAlunoIds.has(p.aluno_id)))
      .reduce((s, p) => s + p.valor, 0),
  [pagamentos, ownerAlunoIds]);

  // Receita restante (parcelas futuras ainda a receber)
  const receitaRestante = useMemo(() => {
    return filteredAlunosAtivos.reduce((sum, a) => {
      const turma = turmas.find(t => t.id === a.turma_id);
      const val = a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0;
      const total = a.total_mensalidades ?? 15;
      const pagas = a.mensalidades_pagas ?? 0;
      const restantes = Math.max(total - pagas, 0);
      return sum + val * restantes;
    }, 0);
  }, [filteredAlunosAtivos, turmas]);

  // ── Funil Lancamento ──────────────────────────────────────────────────────

  const funilLanc = useMemo(() => {
    const ll = lancLeads; // already deduped
    return {
      planilha:        ll.filter(l => getLancamentoStage(l) === 'planilha').length,
      grupoLancamento: ll.filter(l => getLancamentoStage(l) === 'grupoLancamento').length,
      grupoOferta:     ll.filter(l => getLancamentoStage(l) === 'grupoOferta').length,
      followUp01:      ll.filter(l => getLancamentoStage(l) === 'followUp01').length,
      followUp02:      ll.filter(l => getLancamentoStage(l) === 'followUp02').length,
      followUp03:      ll.filter(l => getLancamentoStage(l) === 'followUp03').length,
      matricula:       ll.filter(l => getLancamentoStage(l) === 'matricula').length,
    };
  }, [lancLeads]);

  const funilNpa = useMemo(() => {
    const nl = npaLeads;
    return {
      novo:        nl.filter(l => l.fase === 'novo').length,
      ingressoPago:nl.filter(l => l.fase === 'ingresso_pago').length,
      noGrupo:     nl.filter(l => l.fase === 'no_grupo').length,
      confirmado:  nl.filter(l => l.fase === 'confirmado').length,
      evento:      nl.filter(l => l.fase === 'evento').length,
      closer:      nl.filter(l => l.fase === 'closer').length,
      followUp01:  nl.filter(l => l.fase === 'follow_up_01').length,
      followUp02:  nl.filter(l => l.fase === 'follow_up_02').length,
      followUp03:  nl.filter(l => l.fase === 'follow_up_03').length,
      matricula:   nl.filter(l => l.fase === 'matricula' || isTruthyFlag(l.matriculado)).length,
    };
  }, [npaLeads]);

  // ── Unique matriculas across all lancamentos (deduped by whatsapp) ─────────
  const totalMatriculasLanc = useMemo(() => {
    const seen = new Set<string>();
    for (const row of allLancLeads) {
      if (getLancamentoStage(row) === 'matricula') {
        seen.add(row.whatsapp || row.email || row.id);
      }
    }
    return seen.size;
  }, [allLancLeads]);

  // ── Team stats ────────────────────────────────────────────────────────────

  const getColabStats = (uid: string) => {
    const colabTasks = tasks.filter(t => t.responsavel_id === uid || t.responsaveis?.includes(uid));
    return {
      tarefasPendentes:   colabTasks.filter(t => t.status === 'a_fazer').length,
      tarefasEmAndamento: colabTasks.filter(t => t.status === 'em_andamento').length,
      proximaTarefa: colabTasks.filter(t => t.status !== 'concluido').sort((a, b) =>
        new Date(a.prazo || '9999').getTime() - new Date(b.prazo || '9999').getTime())[0],
    };
  };

  const tarefasCriticas = tasks.filter(t => t.status !== 'concluido' && t.prazo && isPast(new Date(t.prazo))).slice(0, 4);

  // ── Próximas datas ─────────────────────────────────────────────────────────

  const proximosEventos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    type ProxEvento = { id: string; titulo: string; data: Date; tipo: 'evento' | 'lancamento' | 'npa' | 'tarefa'; cor: string };
    const items: ProxEvento[] = [];

    eventosCalendario.forEach(e => {
      const dataInicio = new Date(e.data_inicio);
      // Para eventos em andamento (data_inicio < hoje mas data_fim >= hoje),
      // mostra com a data de hoje para aparecer no topo da lista
      const dataExibir = dataInicio < hoje && e.data_fim && new Date(e.data_fim) >= hoje
        ? hoje
        : dataInicio;
      items.push({ id: `evt-${e.id}`, titulo: e.titulo, data: dataExibir, tipo: 'evento', cor: e.cor });
    });
    lancamentos.filter(l => (l as any).data_live && new Date((l as any).data_live) >= hoje).forEach(l => {
      items.push({ id: `lanc-${l.id}`, titulo: l.nome, data: new Date((l as any).data_live), tipo: 'lancamento', cor: '#EA580C' });
    });
    (npaEventos as any[]).filter(n => n.data_evento && new Date(n.data_evento) >= hoje).forEach(n => {
      items.push({ id: `npa-${n.id}`, titulo: n.nome, data: new Date(n.data_evento), tipo: 'npa', cor: '#7C3AED' });
    });
    tasks.filter(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) >= hoje).forEach(t => {
      items.push({ id: `tar-${t.id}`, titulo: t.titulo, data: new Date(t.prazo!), tipo: 'tarefa', cor: '#ef4444' });
    });

    return items.sort((a, b) => a.data.getTime() - b.data.getTime()).slice(0, 10);
  }, [eventosCalendario, lancamentos, npaEventos, tasks]);

  // ── Financial health by product ───────────────────────────────────────────

  const getSaude = (produto: 'psicanalise' | 'numerologia') => {
    const ativos = alunosAtivos.filter(a => a.produto === produto);
    const ids = new Set(ativos.map(a => a.id));
    const recebido = pagamentos.filter(p => p.status === 'pago' && ids.has(p.aluno_id) && p.mes_referencia?.startsWith(mesAtual)).reduce((s, p) => s + p.valor, 0);
    const inadimp = ativos.filter(a => alunoInadimplentesIds.has(a.id)).length;
    const txInad = ativos.length > 0 ? Math.round((inadimp / ativos.length) * 100) : 0;
    const proxTurma = turmas.filter(t => t.produto === produto).sort((a, b) => new Date(a.data_inicio || '').getTime() - new Date(b.data_inicio || '').getTime())[0];
    const mrr = ativos.reduce((sum, a) => {
      const t = turmas.find(tr => tr.id === a.turma_id);
      return sum + (a.valor_mensalidade ?? t?.valor_mensalidade ?? 0);
    }, 0);
    return { ativos: ativos.length, recebido, inadimp, txInad, proxTurma, mrr };
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmt(v);

  if (loading) return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Card key={i} className="p-4 animate-pulse"><div className="h-16 bg-muted rounded" /></Card>)}
      </div>
    </div>
  );

  const lancTotal = lancLeads.length;
  const lancConv  = lancTotal > 0 ? Math.round((funilLanc.matricula / lancTotal) * 100) : 0;
  const npaTotal  = npaLeads.length;
  const npaConv   = npaTotal > 0 ? Math.round((funilNpa.matricula / npaTotal) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{isAdmin ? 'Visão executiva · dados em tempo real' : 'Minha área'}</p>
        </div>
      </div>

      {/* ── KPIs financeiros reais ─────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Owner filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {['Onze Digital', 'Rodrygo', 'Keila', ''].map(owner => (
            <button
              key={owner || '__todos__'}
              onClick={() => setOwnerFilter(owner)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                ownerFilter === owner
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-muted-foreground border-border/60 hover:border-primary/40'
              }`}
            >
              {owner || 'Todos'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="MRR Projetado"
            value={fmtK(mrrEfetivo)}
            sub={`${filteredAlunosAtivos.length} alunos ativos${ownerFilter ? ` · ${ownerFilter}` : ''}`}
            icon={DollarSign}
            accent="green"
          />
          <KpiCard
            label={`Recebido ${new Date().toLocaleDateString('pt-BR', { month: 'short' })}`}
            value={fmtK(recebidoMes)}
            sub={`Taxa de coleta: ${taxaColeta}%`}
            icon={TrendingUp}
            accent={taxaColeta >= 80 ? 'green' : taxaColeta >= 50 ? 'amber' : 'red'}
          />
          <KpiCard
            label="Inadimplência"
            value={inadimplentesCount > 0 ? fmt(valorInadimplente) : 'Zerada'}
            sub={inadimplentesCount > 0 ? `${inadimplentesCount} alunos em atraso` : 'Sem atrasos'}
            icon={inadimplentesCount > 0 ? AlertTriangle : CheckCircle2}
            accent={inadimplentesCount === 0 ? 'green' : inadimplentesCount <= 5 ? 'amber' : 'red'}
          />
          <KpiCard
            label="Receita Restante"
            value={fmtK(receitaRestante)}
            sub="Parcelas futuras a receber"
            icon={BarChart3}
            accent="purple"
          />
        </div>
      </div>

      {/* ── Próximas datas importantes ────────────────────────────────────── */}
      <Card className="border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays size={15} className="text-muted-foreground" /> Próximas datas importantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proximosEventos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento futuro cadastrado no calendário</p>
          ) : (
            <div className="space-y-2">
              {proximosEventos.map(ev => {
                const isHoje   = isToday(ev.data);
                const isAmanha = isTomorrow(ev.data);
                const diasStr  = isHoje ? 'Hoje' : isAmanha ? 'Amanhã' : format(ev.data, "dd 'de' MMM", { locale: ptBR });
                const tipoIcon: Record<string, React.ElementType> = {
                  evento: CalendarDays, lancamento: Rocket, npa: Target, tarefa: CheckCircle2,
                };
                const TipoIcon = tipoIcon[ev.tipo] ?? CalendarDays;
                const tipoLabel: Record<string, string> = {
                  evento: 'Evento', lancamento: 'Lançamento', npa: 'NPA', tarefa: 'Tarefa',
                };
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                      isHoje
                        ? 'bg-amber-50/70 border-amber-200/70'
                        : 'bg-white border border-border/40 hover:border-border',
                    )}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.titulo}</p>
                      <p className="text-xs text-muted-foreground capitalize">{tipoLabel[ev.tipo]}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TipoIcon size={13} className="text-muted-foreground" />
                      <span className={`text-xs font-semibold tabular-nums ${isHoje ? 'text-amber-600' : 'text-muted-foreground'}`}>{diasStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Funnels (collapsible) ─────────────────────────────────────────── */}
      <CollapsibleSection title="Funis de Vendas" icon={BarChart3}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Lancamento */}
          <Card>
            <CardHeader className="pb-3">
              <Select value={selLancId} onValueChange={setSelLancId}>
                <SelectTrigger className="h-8 text-sm font-semibold border-0 shadow-none px-0 focus:ring-0">
                  <SelectValue placeholder="Selecionar lançamento" />
                </SelectTrigger>
                <SelectContent>{lancamentos.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{lancTotal} leads únicos</Badge>
                {lancConv > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">{lancConv}% conversão</Badge>}
                {totalMatriculasLanc > 0 && <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{totalMatriculasLanc} matrículas (todos)</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[['Planilha','planilha'],['Grupo Lançamento','grupoLancamento'],['Grupo Oferta','grupoOferta'],['Follow-up 01','followUp01'],['Follow-up 02','followUp02'],['Follow-up 03','followUp03'],['Matrícula','matricula']].map(([label, key], i, arr) => (
                <FunnelBar key={key} label={label} count={(funilLanc as any)[key] ?? 0} total={lancTotal} isLast={i === arr.length - 1} accent="#8b5cf6" />
              ))}
            </CardContent>
          </Card>

          {/* NPA */}
          <Card>
            <CardHeader className="pb-3">
              <Select value={selNpaId} onValueChange={setSelNpaId}>
                <SelectTrigger className="h-8 text-sm font-semibold border-0 shadow-none px-0 focus:ring-0">
                  <SelectValue placeholder="Selecionar NPA" />
                </SelectTrigger>
                <SelectContent>{npaEventos.map(n => <SelectItem key={n.id} value={n.id}>{n.nome}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{npaTotal} leads únicos</Badge>
                {npaConv > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">{npaConv}% conversão</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[['Novo','novo'],['Ingresso Pago','ingressoPago'],['No Grupo','noGrupo'],['Confirmado','confirmado'],['Evento','evento'],['Closer','closer'],['Follow-up 01','followUp01'],['Follow-up 02','followUp02'],['Follow-up 03','followUp03'],['Matrícula','matricula']].map(([label, key], i, arr) => (
                <FunnelBar key={key} label={label} count={(funilNpa as any)[key] ?? 0} total={npaTotal} isLast={i === arr.length - 1} accent="#f59e0b" />
              ))}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>

      {/* ── Team + Financial (collapsible) ────────────────────────────────── */}
      <CollapsibleSection title="Time & Financeiro" icon={Users}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Team */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users size={15} className="text-muted-foreground" /> Performance do Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {users.filter(u => u.ativo).map(u => {
                const stats = getColabStats(u.id);
                return (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: u.cor }}>
                      {u.nome.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{u.nome}</p>
                      <p className="text-xs text-muted-foreground capitalize">{u.tipo}</p>
                    </div>
                    <div className="flex items-center gap-3 text-right shrink-0">
                      <div><p className="text-sm font-bold text-amber-600">{stats.tarefasPendentes}</p><p className="text-xs text-muted-foreground">A fazer</p></div>
                      <div><p className="text-sm font-bold text-orange-500">{stats.tarefasEmAndamento}</p><p className="text-xs text-muted-foreground">Andamento</p></div>
                      {stats.proximaTarefa && (
                        <div className="max-w-[90px] text-right">
                          <p className="text-xs font-medium truncate">{stats.proximaTarefa.titulo}</p>
                          <p className="text-xs text-muted-foreground">{stats.proximaTarefa.prazo ? format(new Date(stats.proximaTarefa.prazo), 'dd/MM') : '—'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {tarefasCriticas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-red-100">
                  <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide flex items-center gap-1"><AlertCircle size={11}/> Tarefas atrasadas</p>
                  <div className="space-y-1.5">
                    {tarefasCriticas.map(t => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-sm truncate flex-1">{t.titulo}</p>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          {t.prazo && <p className="text-xs text-red-500 font-medium">{format(new Date(t.prazo), 'dd/MM')}</p>}
                          <Badge variant="destructive" className="text-xs px-1.5">{t.prioridade}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={15} className="text-muted-foreground" /> Saúde Financeira
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="psicanalise">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="psicanalise">Psicanálise</TabsTrigger>
                  <TabsTrigger value="numerologia">Numerologia</TabsTrigger>
                </TabsList>
                {(['psicanalise', 'numerologia'] as const).map(prod => {
                  const s = getSaude(prod);
                  return (
                    <TabsContent key={prod} value={prod} className="space-y-3 mt-0">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                          <p className="text-2xl font-bold text-blue-700">{s.ativos}</p>
                          <p className="text-xs text-blue-600 mt-0.5">Ativos</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                          <p className="text-sm font-bold text-emerald-700 leading-tight mt-1">{fmtK(s.mrr)}</p>
                          <p className="text-xs text-emerald-600 mt-0.5">MRR</p>
                        </div>
                        <div className={`text-center p-3 rounded-xl border ${s.inadimp > 0 ? 'bg-red-50 border-red-100' : 'bg-muted border-border'}`}>
                          <p className={`text-2xl font-bold ${s.inadimp > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{s.inadimp}</p>
                          <p className={`text-xs mt-0.5 ${s.inadimp > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Inadimp.</p>
                        </div>
                      </div>
                      {s.ativos > 0 && (
                        <div>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground">Coleta {mesAtual}</span>
                            <span className={`text-xs font-semibold ${s.mrr > 0 && (s.recebido / s.mrr) >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {fmtK(s.recebido)} / {fmtK(s.mrr)}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(s.mrr > 0 ? (s.recebido / s.mrr) * 100 : 0, 100)}%` }} />
                          </div>
                          {s.txInad > 0 && (
                            <div className="mt-2">
                              <div className="flex justify-between mb-1">
                                <span className="text-xs text-muted-foreground">Inadimplência</span>
                                <span className={`text-xs font-semibold ${s.txInad > 10 ? 'text-red-600' : 'text-amber-600'}`}>{s.txInad}%</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${s.txInad > 10 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(s.txInad, 100)}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {s.proxTurma && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
                          <Zap size={14} className="text-purple-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-purple-700 truncate">{s.proxTurma.nome}</p>
                            <p className="text-xs text-purple-500">{s.proxTurma.data_inicio ? format(new Date(s.proxTurma.data_inicio), 'dd/MM/yyyy') : 'A definir'}</p>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>

    </div>
  );
}
