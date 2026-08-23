import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Users, TrendingUp, DollarSign, AlertTriangle, BarChart3,
  AlertCircle, Zap, CheckCircle2, CalendarDays, Rocket, Target, ChevronDown,
  UserPlus, Receipt, Handshake, Video, ShoppingBag, GraduationCap,
  Plus, Pencil, StickyNote, Trash2,
} from 'lucide-react';
import { isPast, format, differenceInDays, isToday, isTomorrow, startOfWeek, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  LineChart, Line,
} from 'recharts';
import {
  useAlunos, usePagamentos, useTurmas, useResponsaveis, useTurmaResponsaveis,
  COLUNAS_PAGAMENTO_RESUMO,
} from '@/lib/db';
import {
  isAlunoAtivo, isPagamentoInadimplente, calcMRR, calcInadimplencia, makeGetOwnerShare,
  filtrarPagamentosPorPeriodo, getPeriodRange,
} from '@/lib/financial-utils';
import { INITIAL_VENDORS } from '@/lib/vendedores';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Aluno {
  id: string; nome: string; produto: 'psicanalise' | 'numerologia';
  status: 'ativo' | 'inadimplente' | 'cancelado' | 'concluido' | 'pre_matricula';
  turma_id?: string; data_inicio: string; created_at: string; data_matricula?: string | null;
  valor_mensalidade?: number; mensalidades_pagas?: number; total_mensalidades?: number;
}
interface Pagamento {
  id: string; aluno_id: string; turma_id?: string | null; valor: number; mes_referencia: string;
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
  responsavel_id?: string | null; vagas?: number | null;
}
interface ParceiroRow {
  id: string; nome: string; ativo: boolean | null;
  meta_videos_semanal: number | null; meta_videos_mensal: number | null;
  meta_vendas_semanal: number | null; meta_vendas_mensal: number | null;
}
interface VendaMesVendedor { mes: string; vendedor: string; vista_cartao: number; boleto: number; total: number; }

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

// Rótulo de exibição do filtro de responsável — o valor comparado em makeGetOwnerShare
// continua sendo o nome exato cadastrado (Rodrygo, Keila); só a etiqueta do chip muda.
const OWNER_LABELS: Record<string, string> = {
  'Rodrygo': 'Instituto Despertamente',
  'Keila': 'Investidores',
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

// ─── Meta bar (parceiro: vídeo/venda × semana/mês) ────────────────────────────

function MetaBarra({ rotulo, atual, meta }: { rotulo: string; atual: number; meta: number | null }) {
  const pct = meta && meta > 0 ? Math.min(Math.round((atual / meta) * 100), 100) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-12 shrink-0">{rotulo}</span>
      {meta ? (
        <>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', (pct ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] font-semibold tabular-nums w-12 text-right">{atual}/{meta}</span>
        </>
      ) : (
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{atual} · sem meta</span>
      )}
    </div>
  );
}

function MetaLinha({ icon: Icon, label, semana, metaSemana, mes, metaMes }: {
  icon: React.ElementType; label: string; semana: number; metaSemana: number | null; mes: number; metaMes: number | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <MetaBarra rotulo="Semana" atual={semana} meta={metaSemana} />
      <MetaBarra rotulo="Mês" atual={mes} meta={metaMes} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth();
  // Alunos e pagamentos vem do React Query (src/lib/db), nao mais de useState local.
  // Ganho concreto: o Financeiro carrega exatamente as mesmas chaves, entao abrir as duas
  // telas na mesma sessao reaproveita o cache em vez de baixar os 2.462 pagamentos duas
  // vezes — e o canal central de realtime invalida as duas de uma so vez.
  const { data: alunosQuery, isLoading: carregandoAlunos } = useAlunos<Aluno>();
  const { data: pagamentosQuery, isLoading: carregandoPagamentos } =
    usePagamentos<Pagamento>(COLUNAS_PAGAMENTO_RESUMO);
  const alunos     = alunosQuery ?? [];
  const pagamentos = pagamentosQuery ?? [];
  const [tasks, setTasks]             = useState<Task[]>([]);
  // Turmas e split saem da camada única — o Balanço e o CFO liam as mesmas tabelas com
  // outros conjuntos de colunas, e editar o split lá não chegava aqui.
  const { data: turmas = [] }            = useTurmas();
  const { data: turmaResponsaveis = [] } = useTurmaResponsaveis();
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [lancLeads, setLancLeads]     = useState<any[]>([]);    // deduped per lancamento
  const [allLancLeads, setAllLancLeads] = useState<any[]>([]);  // all, for cross-lancamento dedup
  const [npaEventos, setNpaEventos]   = useState<any[]>([]);
  const [npaLeads, setNpaLeads]       = useState<any[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<{id: string; titulo: string; data_inicio: string; data_fim?: string | null; cor: string; descricao?: string | null}[]>([]);
  const { data: responsaveisList = [] } = useResponsaveis();
  const [selLancId, setSelLancId]     = useState('');
  const [selNpaId, setSelNpaId]       = useState('');
  // Default 'Todos' (vazio) — antes vinha filtrado silenciosamente por 'Onze
  // Digital', fazendo o Dashboard mostrar só uma fatia dos inadimplentes/MRR
  // reais em vez do total (divergindo de Financeiro/CFO, que não filtram).
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  // Leads que entraram hoje, vencimentos/cobrança do dia, ocupação de turma e o
  // desempenho real de vendedores(as)/parceiros — pedido do dono depois de ver o
  // dashboard antigo: "funções que vamos usar de verdade".
  const [leadsHoje, setLeadsHoje]         = useState<{ id: string; canal: string | null }[]>([]);
  const [parceiros, setParceiros]         = useState<ParceiroRow[]>([]);
  const [parceiroProdutos, setParceiroProdutos] = useState<{ id: string; parceiro_id: string }[]>([]);
  const [parceiroVendas, setParceiroVendas]     = useState<{ produto_id: string; created_at: string }[]>([]);
  const [parceiroVideos, setParceiroVideos]     = useState<{ parceiro_id: string; data_postagem: string }[]>([]);
  const [vendasPorMesVendedor, setVendasPorMesVendedor] = useState<VendaMesVendedor[]>([]);
  const [carregandoResto, setLoading] = useState(true);
  const loading = carregandoResto || carregandoAlunos || carregandoPagamentos;
  const isAdmin = user?.tipo === 'admin';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const inicioMes = startOfMonth(hoje);
      const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 });
      const inicioBusca = inicioSemana < inicioMes ? inicioSemana : inicioMes;

      // Alunos, pagamentos, turmas, sócios e split saem daqui: quem cuida deles agora é a
      // camada única em src/lib/db, lá em cima com React Query.
      const [
        tasksRes, lancRes, npaEvtRes, evtCalRes, leadsHojeRes,
        parceirosRes, parceiroProdutosRes, parceiroVendasRes, parceiroVideosRes, vendasMesRes,
      ] = await Promise.all([
        supabase.from('tarefas').select('id, titulo, status, prioridade, responsavel_id, responsaveis, prazo, categoria, pagina, created_at').order('prazo').limit(50),
        supabase.from('lancamentos').select('id, nome, ativo, status, created_at, data_live').order('created_at', { ascending: false }).limit(20),
        supabase.from('npa_eventos').select('id, nome, ativo, data_evento').order('created_at', { ascending: false }).limit(20),
        // Inclui eventos futuros E eventos em andamento (data_fim >= hoje, mesmo que data_inicio < hoje)
        supabase.from('eventos_calendario').select('id, titulo, data_inicio, data_fim, cor, descricao')
          .or(`data_inicio.gte.${hoje.toISOString()},data_fim.gte.${hoje.toISOString()}`)
          .order('data_inicio').limit(30),
        supabase.from('leads').select('id, canal').gte('criado_em', hoje.toISOString()).limit(500),
        supabase.from('parceiros' as any).select('id, nome, ativo, meta_videos_semanal, meta_videos_mensal, meta_vendas_semanal, meta_vendas_mensal').eq('ativo', true),
        supabase.from('parceiros_produtos' as any).select('id, parceiro_id'),
        supabase.from('parceiros_vendas' as any).select('produto_id, created_at').eq('status', 'aprovado').gte('created_at', inicioBusca.toISOString()),
        supabase.from('parceiro_videos' as any).select('parceiro_id, data_postagem').gte('data_postagem', inicioBusca.toISOString().slice(0, 10)),
        (supabase as any).rpc('time_comercial_vendas_por_mes'),
      ]);

      if (tasksRes.data) setTasks(tasksRes.data as Task[]);
      if (evtCalRes.data) setEventosCalendario(evtCalRes.data as any);
      if (leadsHojeRes.data) setLeadsHoje(leadsHojeRes.data as any);
      if (parceirosRes.data) setParceiros(parceirosRes.data as any);
      if (parceiroProdutosRes.data) setParceiroProdutos(parceiroProdutosRes.data as any);
      if (parceiroVendasRes.data) setParceiroVendas(parceiroVendasRes.data as any);
      if (parceiroVideosRes.data) setParceiroVideos(parceiroVideosRes.data as any);
      if (vendasMesRes.data) setVendasPorMesVendedor(vendasMesRes.data as VendaMesVendedor[]);

      const lancList = lancRes.data || [];
      const npaList  = npaEvtRes.data || [];
      setLancamentos(lancList);
      setNpaEventos(npaList);
      // Prioriza o lançamento com status 'em_andamento' — antes caía sempre no primeiro
      // da lista (mais recente por created_at), que podia já estar encerrado.
      setSelLancId(prev => prev || (lancList as any[]).find(l => l.status === 'em_andamento')?.id || lancList[0]?.id || '');
      setSelNpaId(prev => prev || npaList[0]?.id || '');

      if (showLoading) setLoading(false);
    };

    load(true);

    const reload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(false), 2000);
    };

    // `alunos` e `pagamentos` saem daqui: o canal central do CRMLayout invalida as
    // queries dos dois. Este canal cuida so do que ainda e estado local desta tela.
    const ch = supabase.channel('dashboard-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamento_leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npa_evento_leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parceiro_videos' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parceiros_vendas' }, reload)
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
  const mesRange = useMemo(() => getPeriodRange('mes'), [mesAtual]);

  // Aluno ativo canônico: 'ativo' literal OU 'pre_matricula' cuja data_matricula
  // já chegou — derivado na leitura, não depende de nenhum job de correção.
  const alunosAtivos = useMemo(() => alunos.filter(a => isAlunoAtivo(a)), [alunos]);
  const alunoPorId = useMemo(() => new Map(alunos.map(a => [a.id, a])), [alunos]);

  // getOwnerShare canônico (compartilhado com FinanceiroCFO/Balanco): binário via
  // turmas.responsavel_id quando existir, proporcional via turma_responsaveis senão.
  const getOwnerShare = useMemo(
    () => makeGetOwnerShare(ownerFilter, turmas, turmaResponsaveis, responsaveisList),
    [ownerFilter, turmas, turmaResponsaveis, responsaveisList]
  );

  const filteredAlunosAtivos = useMemo(() =>
    alunosAtivos.filter(a => getOwnerShare(a.turma_id ?? null) > 0),
  [alunosAtivos, getOwnerShare]);

  const mrrEfetivo = useMemo(
    () => calcMRR(alunos, turmas, getOwnerShare),
    [alunos, turmas, getOwnerShare]
  );

  // Recebido no mês: campo canônico de data é data_pagamento (data real do
  // caixa), não mes_referencia — um pagamento quitado com atraso conta no mês
  // em que o dinheiro efetivamente entrou.
  const recebidoMes = useMemo(() =>
    filtrarPagamentosPorPeriodo(pagamentos, mesRange.start, mesRange.end)
      .reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id ?? null), 0),
  [pagamentos, mesRange, getOwnerShare]);

  const taxaColeta = mrrEfetivo > 0 ? Math.round((recebidoMes / mrrEfetivo) * 100) : 0;

  // Recebido dos últimos 6 meses — o card do topo só mostra a foto do mês atual, sem dizer
  // se a coleta está subindo ou caindo. Mesma fonte (pagamentos + getOwnerShare) do card,
  // só que repetida mês a mês.
  const receitaMensalHistorico = useMemo(() => {
    const meses: { mes: string; label: string; recebido: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() - i);
      const range = getPeriodRange('mes', ref);
      const recebido = filtrarPagamentosPorPeriodo(pagamentos, range.start, range.end)
        .reduce((s, p) => s + (p.valor || 0) * getOwnerShare(p.turma_id ?? null), 0);
      meses.push({ mes: range.key, label: format(ref, 'MMM', { locale: ptBR }), recebido });
    }
    return meses;
  }, [pagamentos, getOwnerShare]);

  // Matriculado de verdade = pagou a primeira parcela — preencher a ficha não é matrícula,
  // é intenção. `data_matricula` marca a ficha, não o dinheiro; o campo confiável é a data
  // do primeiro pagamento pago de cada aluno.
  const primeiroPagamentoPorAluno = useMemo(() => {
    const map = new Map<string, string>();
    pagamentos.forEach(p => {
      if (p.status !== 'pago' || !p.data_pagamento) return;
      const atual = map.get(p.aluno_id);
      if (!atual || p.data_pagamento < atual) map.set(p.aluno_id, p.data_pagamento);
    });
    return map;
  }, [pagamentos]);

  // Novas matrículas por mês, pela data do primeiro pagamento — ao lado da receita, mostra
  // se o crescimento vem antes ou depois do dinheiro entrar de verdade.
  const matriculasMensalHistorico = useMemo(() => {
    const meses: { mes: string; label: string; matriculas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() - i);
      const range = getPeriodRange('mes', ref);
      const matriculas = alunos.filter(a => {
        if (getOwnerShare(a.turma_id ?? null) <= 0) return false;
        const data = primeiroPagamentoPorAluno.get(a.id);
        return data && data >= range.start && data <= range.end;
      }).length;
      meses.push({ mes: range.key, label: format(ref, 'MMM', { locale: ptBR }), matriculas });
    }
    return meses;
  }, [alunos, getOwnerShare, primeiroPagamentoPorAluno]);

  const hojeStr = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0, 10);
  }, []);

  // Inadimplência canônica: só entre alunos ativos, ponderada pelo rateio de
  // responsável (compartilhado com FinanceiroCFO/Balanco).
  const alunoAtivoIds = useMemo(() => new Set(alunosAtivos.map(a => a.id)), [alunosAtivos]);

  const pagamentosInadimplentesElegiveis = useMemo(
    () => pagamentos.filter(p => alunoAtivoIds.has(p.aluno_id)),
    [pagamentos, alunoAtivoIds]
  );

  // Versão global (sem filtro de responsável) — usada no breakdown por produto.
  const inadimplenciaGlobal = useMemo(
    () => calcInadimplencia(pagamentosInadimplentesElegiveis),
    [pagamentosInadimplentesElegiveis]
  );
  const alunoInadimplentesIds = useMemo(
    () => new Set(Object.keys(inadimplenciaGlobal.porAluno)),
    [inadimplenciaGlobal]
  );

  // Versão filtrada por responsável — usada nos KPIs do topo.
  const inadimplenciaOwner = useMemo(() => {
    const elegiveis = pagamentosInadimplentesElegiveis
      .filter(p => getOwnerShare(p.turma_id ?? null) > 0)
      .map(p => ({ ...p, valor: (p.valor || 0) * getOwnerShare(p.turma_id ?? null) }));
    return calcInadimplencia(elegiveis);
  }, [pagamentosInadimplentesElegiveis, getOwnerShare]);

  const inadimplentesCount  = inadimplenciaOwner.count;
  const valorInadimplente   = inadimplenciaOwner.valorTotal;

  // Receita restante (parcelas futuras ainda a receber)
  const receitaRestante = useMemo(() => {
    return filteredAlunosAtivos.reduce((sum, a) => {
      const turma = turmas.find(t => t.id === a.turma_id);
      const val = a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0;
      const total = a.total_mensalidades ?? 15;
      const pagas = a.mensalidades_pagas ?? 0;
      const restantes = Math.max(total - pagas, 0);
      return sum + val * restantes * getOwnerShare(a.turma_id ?? null);
    }, 0);
  }, [filteredAlunosAtivos, turmas, getOwnerShare]);

  // ── Ação de hoje: leads novos, vencimentos e atraso ───────────────────────

  const vencimentosHojeList = useMemo(
    () => pagamentos.filter(p => p.status === 'pendente' && p.data_vencimento === hojeStr),
    [pagamentos, hojeStr]
  );
  const valorVenceHoje = useMemo(
    () => vencimentosHojeList.reduce((s, p) => s + (p.valor || 0), 0),
    [vencimentosHojeList]
  );

  // Mesma regra canônica de inadimplência (isPagamentoInadimplente) — só ordenada por
  // quem está atrasado há mais tempo, pro dono saber quem cobrar primeiro.
  const atrasadosOrdenados = useMemo(() => {
    return pagamentosInadimplentesElegiveis
      .filter(p => isPagamentoInadimplente(p))
      .map(p => ({ ...p, dias: p.data_vencimento ? differenceInDays(new Date(), new Date(p.data_vencimento)) : 0 }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 6);
  }, [pagamentosInadimplentesElegiveis]);

  // ── Ocupação de turmas ─────────────────────────────────────────────────────

  const turmasComVagas = useMemo(() => {
    // 2 semanas após o início a turma já fechou matrícula na prática — fica de fora pra
    // não poluir a seção com turma que não recebe mais aluno novo.
    const limiteAntigo = new Date(); limiteAntigo.setDate(limiteAntigo.getDate() - 14);
    return turmas
      .filter(t => t.vagas != null && (t.vagas as number) > 0)
      .filter(t => t.nome?.trim().toUpperCase() !== 'NPS') // turma de teste, não é turma de verdade
      .filter(t => !t.data_inicio || new Date(t.data_inicio) >= limiteAntigo)
      .map(t => {
        const matriculados = alunosAtivos.filter(a => a.turma_id === t.id).length;
        const vagas = t.vagas as number;
        const pct = Math.min(Math.round((matriculados / vagas) * 100), 100);
        return { ...t, matriculados, vagas, pct, restantes: Math.max(vagas - matriculados, 0) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [turmas, alunosAtivos]);

  // ── Vendedores reais (Helen/Miguel) ───────────────────────────────────────
  // Fonte única em src/lib/vendedores.ts — antes o Dashboard nem olhava pra isso e
  // mostrava "Performance do Time" com todo usuário ativo (inclusive quem não vende).

  const vendasMesPorVendedor = useMemo(() => {
    const map: Record<string, number> = {};
    vendasPorMesVendedor.filter(v => v.mes === mesAtual).forEach(v => {
      map[v.vendedor] = (map[v.vendedor] || 0) + Number(v.vista_cartao || 0) + Number(v.boleto || 0);
    });
    return map;
  }, [vendasPorMesVendedor, mesAtual]);

  // Últimos 6 meses por vendedor(a), pro sparkline — mesma RPC de vendasMesPorVendedor,
  // só que sem filtrar pelo mês atual, pra mostrar se a venda está subindo ou caindo.
  const vendasHistoricoPorVendedor = useMemo(() => {
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      meses.push(d.toISOString().slice(0, 7));
    }
    const porVendedor: Record<string, { mes: string; total: number }[]> = {};
    INITIAL_VENDORS.forEach(v => {
      porVendedor[v.name] = meses.map(mes => ({
        mes,
        total: vendasPorMesVendedor
          .filter(x => x.mes === mes && x.vendedor === v.name)
          .reduce((s, x) => s + Number(x.vista_cartao || 0) + Number(x.boleto || 0), 0),
      }));
    });
    return porVendedor;
  }, [vendasPorMesVendedor]);

  // ── Parceiros: meta de vídeo e de venda, semanal e mensal ─────────────────

  const inicioSemanaRef = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const inicioMesRef    = useMemo(() => startOfMonth(new Date()), []);

  const parceiroProdutoMap = useMemo(() => {
    const map = new Map<string, string>(); // produto_id -> parceiro_id
    parceiroProdutos.forEach(pp => map.set(pp.id, pp.parceiro_id));
    return map;
  }, [parceiroProdutos]);

  const parceiroStats = useMemo(() => {
    type Stat = { videosSemana: number; videosMes: number; vendasSemana: number; vendasMes: number };
    const stats: Record<string, Stat> = {};
    const ensure = (id: string): Stat => stats[id] ?? (stats[id] = { videosSemana: 0, videosMes: 0, vendasSemana: 0, vendasMes: 0 });

    parceiroVideos.forEach(v => {
      const d = new Date(v.data_postagem);
      const s = ensure(v.parceiro_id);
      if (d >= inicioMesRef) s.videosMes++;
      if (d >= inicioSemanaRef) s.videosSemana++;
    });
    parceiroVendas.forEach(v => {
      const parceiroId = parceiroProdutoMap.get(v.produto_id);
      if (!parceiroId) return;
      const d = new Date(v.created_at);
      const s = ensure(parceiroId);
      if (d >= inicioMesRef) s.vendasMes++;
      if (d >= inicioSemanaRef) s.vendasSemana++;
    });
    return stats;
  }, [parceiroVideos, parceiroVendas, parceiroProdutoMap, inicioMesRef, inicioSemanaRef]);

  // ── Funil Lancamento (cumulativo — quem chegou a uma fase conta nela pra sempre,
  //    mesmo depois de avançar. Antes contava só a fase atual, e o número de quem
  //    "esteve no grupo" caía assim que a pessoa avançava — parecia que tinha sumido
  //    gente, quando na verdade ela só tinha progredido no funil) ───────────────

  const funilLanc = useMemo(() => {
    const rankOf = (l: any) => LANCAMENTO_STAGE_RANK[getLancamentoStage(l)] ?? 0;
    const countAtLeast = (min: number) => lancLeads.filter(l => rankOf(l) >= min).length;
    return {
      planilha:        countAtLeast(LANCAMENTO_STAGE_RANK.planilha),
      grupoLancamento: countAtLeast(LANCAMENTO_STAGE_RANK.grupoLancamento),
      grupoOferta:     countAtLeast(LANCAMENTO_STAGE_RANK.grupoOferta),
      followUp01:      countAtLeast(LANCAMENTO_STAGE_RANK.followUp01),
      followUp02:      countAtLeast(LANCAMENTO_STAGE_RANK.followUp02),
      followUp03:      countAtLeast(LANCAMENTO_STAGE_RANK.followUp03),
      matricula:       countAtLeast(LANCAMENTO_STAGE_RANK.matricula),
    };
  }, [lancLeads]);

  const funilNpa = useMemo(() => {
    const rankOf = (l: any) => NPA_STAGE_RANK[l.fase] ?? (isTruthyFlag(l.matriculado) ? NPA_STAGE_RANK.matricula : 0);
    const countAtLeast = (min: number) => npaLeads.filter(l => rankOf(l) >= min).length;
    return {
      novo:        countAtLeast(NPA_STAGE_RANK.novo),
      ingressoPago:countAtLeast(NPA_STAGE_RANK.ingresso_pago),
      noGrupo:     countAtLeast(NPA_STAGE_RANK.no_grupo),
      confirmado:  countAtLeast(NPA_STAGE_RANK.confirmado),
      evento:      countAtLeast(NPA_STAGE_RANK.evento),
      closer:      countAtLeast(NPA_STAGE_RANK.closer),
      followUp01:  countAtLeast(NPA_STAGE_RANK.follow_up_01),
      followUp02:  countAtLeast(NPA_STAGE_RANK.follow_up_02),
      followUp03:  countAtLeast(NPA_STAGE_RANK.follow_up_03),
      matricula:   countAtLeast(NPA_STAGE_RANK.matricula),
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

  // Lançamentos ordenados: em andamento primeiro, depois ativos, depois encerrados —
  // pedido do dono pra distinguir "lançamento em andamento" de "quando eu desligo".
  const lancamentosOrdenados = useMemo(() => {
    const rank = (l: any) => l.status === 'em_andamento' ? 0 : l.ativo ? 1 : 2;
    return [...lancamentos].sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [lancamentos]);

  const situacaoLancamento = (l: any) => {
    if (l.status === 'em_andamento') return ' · em andamento';
    if (!l.ativo) return ' · desligado';
    if (l.status === 'finalizado') return ' · encerrado';
    return '';
  };

  // ── Team stats ────────────────────────────────────────────────────────────

  const tarefasCriticas = tasks.filter(t => t.status !== 'concluido' && t.prazo && isPast(new Date(t.prazo))).slice(0, 4);

  // ── Próximas datas ─────────────────────────────────────────────────────────

  const proximosEventos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    type ProxEvento = {
      id: string; titulo: string; data: Date; tipo: 'evento' | 'lancamento' | 'npa' | 'tarefa'; cor: string;
      descricao?: string | null; rawId?: string;
    };
    const items: ProxEvento[] = [];

    eventosCalendario.forEach(e => {
      const dataInicio = new Date(e.data_inicio);
      // Para eventos em andamento (data_inicio < hoje mas data_fim >= hoje),
      // mostra com a data de hoje para aparecer no topo da lista
      const dataExibir = dataInicio < hoje && e.data_fim && new Date(e.data_fim) >= hoje
        ? hoje
        : dataInicio;
      // rawId aponta pro registro de verdade em eventos_calendario — é o único tipo aqui
      // que o dono edita/anota direto (lançamento, NPA e tarefa vêm de outras telas).
      items.push({ id: `evt-${e.id}`, titulo: e.titulo, data: dataExibir, tipo: 'evento', cor: e.cor, descricao: e.descricao, rawId: e.id });
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
    const recebido = filtrarPagamentosPorPeriodo(pagamentos, mesRange.start, mesRange.end)
      .filter(p => ids.has(p.aluno_id)).reduce((s, p) => s + (p.valor || 0), 0);
    const inadimp = ativos.filter(a => alunoInadimplentesIds.has(a.id)).length;
    const txInad = ativos.length > 0 ? Math.round((inadimp / ativos.length) * 100) : 0;
    const proxTurma = turmas.filter(t => t.produto === produto).sort((a, b) => new Date(a.data_inicio || '').getTime() - new Date(b.data_inicio || '').getTime())[0];
    const mrr = ativos.reduce((sum, a) => {
      const t = turmas.find(tr => tr.id === a.turma_id);
      return sum + (a.valor_mensalidade ?? t?.valor_mensalidade ?? 0);
    }, 0);
    return { ativos: ativos.length, recebido, inadimp, txInad, proxTurma, mrr };
  };

  // ── Próximas datas: adicionar e anotar direto do Dashboard ────────────────
  // Mesma tabela e mesmo padrão de campos da tela Calendário (CalendarioGeralView) —
  // só um atalho pra não precisar sair do Dashboard pra registrar um lembrete rápido.

  const EVENTO_CORES = ['#A93356', '#EA580C', '#7C3AED', '#2E9E6C', '#4A90E2', '#ef4444'];

  const [novoEventoOpen, setNovoEventoOpen] = useState(false);
  const [novoEventoForm, setNovoEventoForm] = useState({ titulo: '', data: '', descricao: '', cor: EVENTO_CORES[0] });
  const [salvandoNovoEvento, setSalvandoNovoEvento] = useState(false);

  const [eventoEditando, setEventoEditando] = useState<{ id: string; titulo: string; data_inicio: string; descricao: string; cor: string } | null>(null);
  const [salvandoEdicaoEvento, setSalvandoEdicaoEvento] = useState(false);
  const [excluindoEvento, setExcluindoEvento] = useState(false);

  const refetchEventosCalendario = async () => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data } = await supabase.from('eventos_calendario').select('id, titulo, data_inicio, data_fim, cor, descricao')
      .or(`data_inicio.gte.${hoje.toISOString()},data_fim.gte.${hoje.toISOString()}`)
      .order('data_inicio').limit(30);
    if (data) setEventosCalendario(data as any);
  };

  const handleCriarEvento = async () => {
    if (!novoEventoForm.titulo.trim() || !novoEventoForm.data) {
      toast.error('Preencha o título e a data.');
      return;
    }
    setSalvandoNovoEvento(true);
    const { error } = await supabase.from('eventos_calendario').insert({
      titulo: novoEventoForm.titulo.trim(),
      descricao: novoEventoForm.descricao.trim() || null,
      data_inicio: new Date(novoEventoForm.data).toISOString(),
      cor: novoEventoForm.cor,
    });
    setSalvandoNovoEvento(false);
    if (error) { toast.error(`Erro ao criar: ${error.message}`); return; }
    toast.success('Adicionado ao calendário.');
    setNovoEventoOpen(false);
    setNovoEventoForm({ titulo: '', data: '', descricao: '', cor: EVENTO_CORES[0] });
    refetchEventosCalendario();
  };

  const abrirEdicaoEvento = (ev: { rawId?: string; titulo: string; data: Date; descricao?: string | null; cor: string }) => {
    if (!ev.rawId) return;
    setEventoEditando({
      id: ev.rawId,
      titulo: ev.titulo,
      data_inicio: format(ev.data, "yyyy-MM-dd'T'HH:mm"),
      descricao: ev.descricao || '',
      cor: ev.cor,
    });
  };

  const handleSalvarEdicaoEvento = async () => {
    if (!eventoEditando || !eventoEditando.titulo.trim()) return;
    setSalvandoEdicaoEvento(true);
    const { error } = await supabase.from('eventos_calendario').update({
      titulo: eventoEditando.titulo.trim(),
      descricao: eventoEditando.descricao.trim() || null,
      data_inicio: new Date(eventoEditando.data_inicio).toISOString(),
      cor: eventoEditando.cor,
    }).eq('id', eventoEditando.id);
    setSalvandoEdicaoEvento(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success('Atualizado.');
    setEventoEditando(null);
    refetchEventosCalendario();
  };

  const handleExcluirEvento = async () => {
    if (!eventoEditando) return;
    setExcluindoEvento(true);
    const { error } = await supabase.from('eventos_calendario').delete().eq('id', eventoEditando.id);
    setExcluindoEvento(false);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success('Removido do calendário.');
    setEventoEditando(null);
    refetchEventosCalendario();
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
        {/* Owner filter chips — o valor é o nome exato cadastrado em turma_responsaveis/
            responsaveis (é isso que makeGetOwnerShare casa); o rótulo é só como aparece
            pro dono. Keila é rotulada "Investidores" porque hoje é a única, mas o filtro
            continua sendo o nome dela — no dia que entrar outro investidor, o rótulo vira
            plural de verdade sem trocar o valor que já é comparado no resto do código. */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { value: 'Onze Digital', label: 'Onze Digital' },
            { value: 'Rodrygo', label: 'Instituto Despertamente' },
            { value: 'Keila', label: 'Investidores' },
            { value: '', label: 'Todos' },
          ].map(owner => (
            <button
              key={owner.value || '__todos__'}
              onClick={() => setOwnerFilter(owner.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                ownerFilter === owner.value
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-muted-foreground border-border/60 hover:border-primary/40'
              }`}
            >
              {owner.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="MRR Projetado"
            value={fmtK(mrrEfetivo)}
            hint={`${filteredAlunosAtivos.length} alunos ativos${ownerFilter ? ` · ${OWNER_LABELS[ownerFilter] ?? ownerFilter}` : ''}`}
            icon={DollarSign}
            tom="bom"
          />
          <StatTile
            label={`Recebido ${new Date().toLocaleDateString('pt-BR', { month: 'short' })}`}
            value={fmtK(recebidoMes)}
            hint={`Taxa de coleta: ${taxaColeta}%`}
            icon={TrendingUp}
            tom={taxaColeta >= 80 ? 'bom' : taxaColeta >= 50 ? 'atencao' : 'ruim'}
          />
          <StatTile
            label="Inadimplência"
            value={inadimplentesCount > 0 ? fmt(valorInadimplente) : 'Zerada'}
            hint={inadimplentesCount > 0 ? `${inadimplentesCount} alunos em atraso` : 'Sem atrasos'}
            icon={inadimplentesCount > 0 ? AlertTriangle : CheckCircle2}
            tom={inadimplentesCount === 0 ? 'bom' : inadimplentesCount <= 5 ? 'atencao' : 'ruim'}
          />
          <StatTile
            label="Receita Restante"
            value={fmtK(receitaRestante)}
            hint="Parcelas futuras a receber"
            icon={BarChart3}
            tom="padrao"
          />
        </div>
      </div>

      {/* ── Receita mensal & Novas matrículas (últimos 6 meses) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={15} className="text-muted-foreground" /> Receita mensal
            </CardTitle>
            <p className="text-xs text-muted-foreground">Recebido por mês contra o MRR atual — se a coleta está subindo ou caindo.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={receitaMensalHistorico} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                  width={48}
                  domain={[0, (dataMax: number) => Math.max(dataMax, mrrEfetivo) * 1.05]}
                />
                <Tooltip formatter={(value: unknown) => [fmt(value as number), 'Recebido']} />
                <Bar dataKey="recebido" fill="#A93356" radius={[3, 3, 0, 0]} />
                {mrrEfetivo > 0 && (
                  <ReferenceLine
                    y={mrrEfetivo}
                    stroke="#f59e0b"
                    strokeDasharray="5 3"
                    label={{ value: 'MRR atual', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GraduationCap size={15} className="text-muted-foreground" /> Novas matrículas
            </CardTitle>
            <p className="text-xs text-muted-foreground">Quem pagou a 1ª parcela por mês — ficha preenchida não conta, só matrícula paga.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={matriculasMensalHistorico} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                <Tooltip formatter={(value: unknown) => [`${value} matrícula(s)`, '']} labelFormatter={(l: string) => l} />
                <Bar dataKey="matriculas" fill="#2E9E6C" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Ação de hoje ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionBar title="Hoje" subtitle="O que precisa de atenção agora — não o mês inteiro." icon={Zap} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Leads novos" value={leadsHoje.length} hint="Entraram hoje" icon={UserPlus} tom="padrao" />
          <StatTile
            label="Vence hoje"
            value={fmt(valorVenceHoje)}
            hint={`${vencimentosHojeList.length} pagamento(s)`}
            icon={Receipt}
            tom={vencimentosHojeList.length > 0 ? 'atencao' : 'bom'}
          />
          <StatTile
            label="Atraso mais antigo"
            value={atrasadosOrdenados[0] ? `${atrasadosOrdenados[0].dias} dias` : '—'}
            hint={atrasadosOrdenados[0] ? (alunoPorId.get(atrasadosOrdenados[0].aluno_id)?.nome ?? 'Aluno') : 'Nenhum atraso'}
            icon={AlertTriangle}
            tom={atrasadosOrdenados.length > 0 ? 'ruim' : 'bom'}
          />
          <StatTile
            label="Tarefas atrasadas"
            value={tarefasCriticas.length}
            hint="Do time"
            icon={AlertCircle}
            tom={tarefasCriticas.length > 0 ? 'atencao' : 'bom'}
          />
        </div>

        {(vencimentosHojeList.length > 0 || atrasadosOrdenados.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt size={15} className="text-muted-foreground" /> Vence hoje
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {vencimentosHojeList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Nada vencendo hoje</p>
                ) : vencimentosHojeList.slice(0, 6).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                    <span className="text-sm truncate">{alunoPorId.get(p.aluno_id)?.nome ?? 'Aluno'}</span>
                    <span className="text-sm font-semibold text-amber-700 tabular-nums">{fmt(p.valor || 0)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle size={15} className="text-muted-foreground" /> Atrasados há mais tempo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {atrasadosOrdenados.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Sem atrasos entre alunos ativos</p>
                ) : atrasadosOrdenados.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                    <span className="text-sm truncate">{alunoPorId.get(p.aluno_id)?.nome ?? 'Aluno'}</span>
                    <span className="text-sm font-semibold text-red-700 tabular-nums">{p.dias} dias</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Próximas datas importantes ────────────────────────────────────── */}
      <Card className="border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays size={15} className="text-muted-foreground" /> Próximas datas importantes
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => { setNovoEventoForm({ titulo: '', data: '', descricao: '', cor: EVENTO_CORES[0] }); setNovoEventoOpen(true); }}
            >
              <Plus size={13} /> Adicionar
            </Button>
          </div>
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
                const editavel = ev.tipo === 'evento' && !!ev.rawId;
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'group flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-xl border transition-colors',
                      isHoje ? 'bg-amber-50/70 border-amber-200/70' : 'bg-white border border-border/40 hover:border-border',
                    )}
                  >
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{ev.titulo}</p>
                        {ev.descricao && <StickyNote size={11} className="text-muted-foreground shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{tipoLabel[ev.tipo]}</p>
                      {ev.descricao && <p className="text-xs text-muted-foreground/80 italic truncate mt-0.5">{ev.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editavel && (
                        <button
                          onClick={() => abrirEdicaoEvento(ev)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                          title="Editar / anotar"
                        >
                          <Pencil size={13} className="text-muted-foreground" />
                        </button>
                      )}
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

      {/* Novo evento/observação */}
      <Dialog open={novoEventoOpen} onOpenChange={setNovoEventoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova data importante</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={novoEventoForm.titulo}
                onChange={e => setNovoEventoForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex.: Reunião com o banco"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="datetime-local"
                value={novoEventoForm.data}
                onChange={e => setNovoEventoForm(f => ({ ...f, data: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                rows={3}
                value={novoEventoForm.descricao}
                onChange={e => setNovoEventoForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Detalhes, contexto, o que não pode esquecer..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2">
                {EVENTO_CORES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNovoEventoForm(f => ({ ...f, cor: c }))}
                    className={cn('w-6 h-6 rounded-full transition-transform', novoEventoForm.cor === c && 'ring-2 ring-offset-2 ring-foreground/40 scale-110')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoEventoOpen(false)}>Cancelar</Button>
            <Button onClick={handleCriarEvento} disabled={salvandoNovoEvento}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar / anotar evento existente */}
      <Dialog open={!!eventoEditando} onOpenChange={o => { if (!o) setEventoEditando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar data</DialogTitle>
          </DialogHeader>
          {eventoEditando && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={eventoEditando.titulo}
                  onChange={e => setEventoEditando(v => v && ({ ...v, titulo: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="datetime-local"
                  value={eventoEditando.data_inicio}
                  onChange={e => setEventoEditando(v => v && ({ ...v, data_inicio: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Textarea
                  rows={3}
                  value={eventoEditando.descricao}
                  onChange={e => setEventoEditando(v => v && ({ ...v, descricao: e.target.value }))}
                  placeholder="Detalhes, contexto, o que não pode esquecer..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex gap-2">
                  {EVENTO_CORES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEventoEditando(v => v && ({ ...v, cor: c }))}
                      className={cn('w-6 h-6 rounded-full transition-transform', eventoEditando.cor === c && 'ring-2 ring-offset-2 ring-foreground/40 scale-110')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="ghost" className="text-destructive hover:text-destructive gap-1.5" onClick={handleExcluirEvento} disabled={excluindoEvento}>
              <Trash2 size={14} /> Excluir
            </Button>
            <Button onClick={handleSalvarEdicaoEvento} disabled={salvandoEdicaoEvento}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vendedores reais & Parceiros ───────────────────────────────────── */}
      <CollapsibleSection title="Vendedores & Parceiros" icon={Handshake}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Vendedores */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users size={15} className="text-muted-foreground" /> Vendedores
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {INITIAL_VENDORS.map(v => {
                const vendasMes = vendasMesPorVendedor[v.name] ?? 0;
                const pct = v.meta > 0 ? Math.min(Math.round((vendasMes / v.meta) * 100), 100) : 0;
                const historico = vendasHistoricoPorVendedor[v.name] ?? [];
                return (
                  <div key={v.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-muted/20">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: v.cor }}>
                      {v.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{v.name}</p>
                        <span className="text-xs font-semibold tabular-nums">{vendasMes}/{v.meta}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {/* Sparkline: vendas dos últimos 6 meses — mostra se está subindo ou caindo, não só o número de hoje. */}
                    <div className="w-16 h-8 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historico} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <Tooltip
                            formatter={(value: unknown) => [`${value} venda(s)`, '']}
                            labelFormatter={() => ''}
                            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                          />
                          <Line type="monotone" dataKey="total" stroke={v.cor} strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">Vendas fechadas no mês, contra a meta mensal de cada vendedor(a).</p>
            </CardContent>
          </Card>

          {/* Parceiros */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Handshake size={15} className="text-muted-foreground" /> Parceiros — vídeos & vendas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {parceiros.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum parceiro ativo cadastrado</p>
              ) : parceiros.map(p => {
                const s = parceiroStats[p.id] ?? { videosSemana: 0, videosMes: 0, vendasSemana: 0, vendasMes: 0 };
                return (
                  <div key={p.id} className="p-3 rounded-xl border bg-muted/20">
                    <p className="text-sm font-semibold mb-2 truncate">{p.nome}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <MetaLinha icon={Video} label="Vídeos" semana={s.videosSemana} metaSemana={p.meta_videos_semanal} mes={s.videosMes} metaMes={p.meta_videos_mensal} />
                      <MetaLinha icon={ShoppingBag} label="Vendas" semana={s.vendasSemana} metaSemana={p.meta_vendas_semanal} mes={s.vendasMes} metaMes={p.meta_vendas_mensal} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>

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
                <SelectContent>
                  {lancamentosOrdenados.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}{situacaoLancamento(l)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs">{lancTotal} leads únicos</Badge>
                {lancConv > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">{lancConv}% conversão</Badge>}
                {totalMatriculasLanc > 0 && <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{totalMatriculasLanc} matrículas (todos)</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Cada barra soma quem chegou até ali ou foi além — não zera quando a pessoa avança.</p>
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
              <p className="text-xs text-muted-foreground mt-1.5">Cada barra soma quem chegou até ali ou foi além — não zera quando a pessoa avança.</p>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[['Novo','novo'],['Ingresso Pago','ingressoPago'],['No Grupo','noGrupo'],['Confirmado','confirmado'],['Evento','evento'],['Closer','closer'],['Follow-up 01','followUp01'],['Follow-up 02','followUp02'],['Follow-up 03','followUp03'],['Matrícula','matricula']].map(([label, key], i, arr) => (
                <FunnelBar key={key} label={label} count={(funilNpa as any)[key] ?? 0} total={npaTotal} isLast={i === arr.length - 1} accent="#f59e0b" />
              ))}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>

      {/* ── Ocupação de turmas ──────────────────────────────────────────────── */}
      <CollapsibleSection title="Ocupação de Turmas" icon={GraduationCap}>
        <Card>
          <CardContent className="pt-4">
            {turmasComVagas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma turma com número de vagas cadastrado ainda</p>
            ) : (
              <div className="space-y-2.5">
                {turmasComVagas.map(t => (
                  <div key={t.id} className="px-3 py-2.5 rounded-xl border bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{t.nome}</p>
                      <span className={cn('text-xs font-semibold tabular-nums shrink-0',
                        t.pct >= 90 ? 'text-red-600' : t.pct >= 70 ? 'text-amber-600' : 'text-emerald-600')}>
                        {t.matriculados}/{t.vagas} ({t.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                      <div className={cn('h-full rounded-full', t.pct >= 90 ? 'bg-red-500' : t.pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${t.pct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.restantes > 0 ? `${t.restantes} vaga(s) restante(s)` : 'Lotada'}
                      {t.data_inicio && ` · início ${format(new Date(t.data_inicio), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleSection>

      {/* ── Saúde financeira por produto ────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionBar title="Saúde Financeira" subtitle="Ativos, MRR e inadimplência — separado por produto." icon={BarChart3} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardContent className="pt-4">
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
                          <GraduationCap size={14} className="text-purple-600 shrink-0" />
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
      </div>

    </div>
  );
}
