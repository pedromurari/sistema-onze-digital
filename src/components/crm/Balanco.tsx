import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Trash2,
  RefreshCw, CheckCircle2, AlertTriangle, Info,
  Receipt, UserCheck, ShoppingBag, ChevronLeft, ChevronRight,
  Lock, Unlock, Download, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calcTaxaTransacao, calcRepasses, calcRepassePagamento, getPeriodRange, shiftPeriodo, periodoTipoLabel,
  type TaxaDetalhe, type PeriodoTipo, type ResponsavelRow, type TurmaResponsavelRow,
  type RepasseCalculado, type Produto, type PagamentoParaRepasse,
} from '@/lib/financial-utils';
import { useAuth } from '@/contexts/AuthContext';
import { TaxasPagamentoConfig } from './finance/TaxasPagamentoConfig';
import { RepasseTurmasConfig } from './finance/RepasseTurmasConfig';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tipo = 'entrada' | 'saida';
type Categoria =
  | 'matricula' | 'outro_entrada'
  | 'custo_fixo' | 'custo_variavel' | 'ads' | 'alocacao' | 'outro_saida';
type View = 'fechamento' | 'config';
type StatusFechamento = 'aberto' | 'fechado';

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

// ─── Tipos: Fechamento por período ─────────────────────────────────────────────

interface ReceitaHoje {
  id: string;
  aluno_id: string | null;
  turma_id: string | null;
  valor: number;
  produto: string | null;
  produto_label: string;
  forma_pagamento: string;
  mes_referencia: string;
  data_pagamento: string;
  canal_cobranca: string | null;
  numero_parcela: number | null;
  aluno_nome: string | null;
  conferido_em: string | null;
  conferido_por: string | null;
}

interface AlunoNovo {
  id: string;
  nome: string;
  turma_id: string;
  status: string;
  forma_pagamento: string | null;
  valor_mensalidade: number | null;
  total_mensalidades: number | null;
  created_at: string;
}

interface TurmaInfo {
  id: string;
  nome: string;
  produto: string | null;
  valor_mensalidade: number | null;
}

interface CanalCobranca {
  id: string;
  nome: string;
  ativo: boolean;
}

interface FechamentoRow {
  id: string;
  periodo_tipo: PeriodoTipo;
  periodo_key: string;
  periodo_inicio: string;
  periodo_fim: string;
  status: StatusFechamento;
  bruto: number;
  taxas: number;
  liquido: number;
  repasses: RepasseCalculado[];
  saldo_idm: number;
  saidas_operacionais: number;
  saldo_final: number;
  total_pagamentos: number;
  fechado_em: string | null;
  fechado_por: string | null;
  reaberto_em: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FORMA_LABELS: Record<string, string> = {
  boleto: 'Boleto', cartao: 'Cartão', pix: 'PIX', avista: 'À Vista',
};
const FORMA_COR: Record<string, string> = {
  boleto: 'bg-amber-50 text-amber-700 border-amber-200',
  cartao: 'bg-blue-50 text-blue-700 border-blue-200',
  pix:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  avista: 'bg-violet-50 text-violet-700 border-violet-200',
};

const CAT_LABELS: Record<Categoria, string> = {
  matricula:      'Matrícula / Receita',
  outro_entrada:  'Outra Entrada',
  custo_fixo:     'Custo Fixo',
  custo_variavel: 'Custo Variável',
  ads:            'Ads / Marketing',
  alocacao:       'Alocação de Caixa',
  outro_saida:    'Outra Saída',
};

// ─── Main ──────────────────────────────────────────────────────────────────────

export function Balanco() {
  const [view, setView] = useState<View>('fechamento');

  // ─── Estado: Fechamento por período ──────────────────────────────────────
  const { user: currentUser } = useAuth();
  const [periodoTipo, setPeriodoTipo]       = useState<PeriodoTipo>('dia');
  const [refDate, setRefDate]               = useState(() => new Date());
  const range = useMemo(() => getPeriodRange(periodoTipo, refDate), [periodoTipo, refDate]);
  // '' = fechamento geral (todos os responsáveis); id = ver só o repasse de um responsável
  const [responsavelFiltro, setResponsavelFiltro] = useState('');

  const [loadingDiario, setLoadingDiario]   = useState(false);
  const [receitasHoje, setReceitasHoje]     = useState<ReceitaHoje[]>([]);
  const [alunosHoje, setAlunosHoje]         = useState<AlunoNovo[]>([]);
  const [turmasInfo, setTurmasInfo]         = useState<TurmaInfo[]>([]);
  const [turmasResp, setTurmasResp]         = useState<TurmaResponsavelRow[]>([]);
  const [responsaveisList, setResponsaveisList] = useState<ResponsavelRow[]>([]);
  const [taxasRates, setTaxasRates]         = useState<TaxaDetalhe[]>([]);
  const [produtos, setProdutos]             = useState<Produto[]>([]);
  const [canaisCobranca, setCanaisCobranca] = useState<CanalCobranca[]>([]);
  const [gastosHoje, setGastosHoje]         = useState<BalancoItem[]>([]);
  const [fechamentoAtual, setFechamentoAtual] = useState<FechamentoRow | null>(null);
  const [savingFechamento, setSavingFechamento] = useState(false);
  const [reabrindo, setReabrindo]           = useState(false);
  const [confirmados, setConfirmados]       = useState<Set<string>>(new Set());
  // draft por aluno: forma_pagamento e valor editáveis
  const [matriculasDraft, setMatriculasDraft] = useState<Record<string, { forma: string; valor: string }>>({});
  const [savingAluno, setSavingAluno]       = useState<string | null>(null);
  // form gasto rápido do período
  const [gastoForm, setGastoForm]           = useState({ descricao: '', valor: '', categoria: 'custo_variavel' as Categoria });
  const [savingGasto, setSavingGasto]       = useState(false);
  const [savingCanal, setSavingCanal]       = useState<string | null>(null);
  const [savingConferencia, setSavingConferencia] = useState<string | null>(null);

  // ─── Load: dados de referência (não dependem do período) ─────────────────
  // Turmas, repasse por turma, responsáveis, taxas e canais de cobrança são
  // config — carregam uma vez, não a cada troca de período.

  useEffect(() => {
    const loadReferencias = async () => {
      const [turRes, respRes, respListRes, taxRes, prodRes, canaisRes] = await Promise.all([
        supabase.from('turmas').select('id, nome, produto, valor_mensalidade'),
        supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual'),
        supabase.from('responsaveis').select('id, nome, email, ativo'),
        supabase.from('payment_method_rates').select('*').eq('ativo', true),
        supabase.from('produtos').select('id, nome, slug, cor, ativo, ordem').eq('ativo', true).order('ordem'),
        supabase.from('canais_cobranca').select('id, nome, ativo').eq('ativo', true).order('nome'),
      ]);
      setTurmasInfo((turRes.data || []) as TurmaInfo[]);
      setTurmasResp((respRes.data || []) as TurmaResponsavelRow[]);
      setResponsaveisList((respListRes.data || []) as ResponsavelRow[]);
      setTaxasRates((taxRes.data || []) as TaxaDetalhe[]);
      setProdutos((prodRes.data || []) as Produto[]);
      setCanaisCobranca((canaisRes.data || []) as CanalCobranca[]);
    };
    loadReferencias();
  }, []);

  const reloadTurmaResponsaveis = useCallback(async () => {
    const { data } = await supabase.from('turma_responsaveis').select('id, turma_id, user_id, nome_ref, percentual');
    setTurmasResp((data || []) as TurmaResponsavelRow[]);
  }, []);

  // ─── Load: Fechamento do período selecionado ─────────────────────────────

  const loadPeriodo = useCallback(async () => {
    setLoadingDiario(true);
    try {
      const [recRes, aluRes, gasRes, fechRes] = await Promise.all([
        // Pagamentos recebidos no período (produto + forma_pagamento + canal via view)
        supabase.from('vw_receita_por_fonte')
          .select('id, aluno_id, turma_id, valor, produto, produto_label, forma_pagamento, mes_referencia, data_pagamento, canal_cobranca, numero_parcela, aluno_nome, conferido_em, conferido_por')
          .gte('data_pagamento', range.start)
          .lte('data_pagamento', range.end),
        // Novos alunos cadastrados no período
        supabase.from('alunos')
          .select('id, nome, turma_id, status, forma_pagamento, valor_mensalidade, total_mensalidades, created_at')
          .gte('created_at', range.start + 'T00:00:00')
          .lt('created_at', range.end + 'T23:59:59'),
        // Lançamentos manuais de saída feitos no período
        supabase.from('balanco_itens')
          .select('*')
          .eq('tipo', 'saida')
          .gte('created_at', range.start + 'T00:00:00')
          .lt('created_at', range.end + 'T23:59:59'),
        // Snapshot de fechamento (se já foi fechado)
        supabase.from('fechamentos').select('*').eq('periodo_tipo', periodoTipo).eq('periodo_key', range.key).maybeSingle(),
      ]);
      setReceitasHoje((recRes.data || []) as ReceitaHoje[]);
      const novos = (aluRes.data || []) as AlunoNovo[];
      setAlunosHoje(novos);
      setGastosHoje((gasRes.data || []) as BalancoItem[]);
      setFechamentoAtual((fechRes.data || null) as FechamentoRow | null);
      // Inicializa o draft com os valores atuais de cada aluno novo
      const draft: Record<string, { forma: string; valor: string }> = {};
      for (const a of novos) {
        draft[a.id] = {
          forma: a.forma_pagamento || 'boleto',
          valor: a.valor_mensalidade ? String(a.valor_mensalidade) : '',
        };
      }
      setMatriculasDraft(draft);
    } catch {
      toast.error('Erro ao carregar o fechamento do período.');
    } finally {
      setLoadingDiario(false);
    }
  }, [range.start, range.end, range.key, periodoTipo]);

  useEffect(() => {
    if (view === 'fechamento') loadPeriodo();
  }, [view, loadPeriodo]);

  // ─── Actions: Fechamento por período ──────────────────────────────────────

  async function handleConfirmarAluno(alunoId: string) {
    const draft = matriculasDraft[alunoId];
    if (!draft) return;
    setSavingAluno(alunoId);
    const valor = parseFloat(draft.valor.replace(',', '.'));
    const updates: Record<string, unknown> = { forma_pagamento: draft.forma };
    if (!isNaN(valor) && valor > 0) updates.valor_mensalidade = valor;

    const { error } = await supabase.from('alunos').update(updates).eq('id', alunoId);
    setSavingAluno(null);
    if (error) { toast.error('Erro ao salvar matrícula.'); return; }

    setConfirmados(prev => new Set([...prev, alunoId]));
    setAlunosHoje(prev => prev.map(a => a.id === alunoId
      ? { ...a, forma_pagamento: draft.forma, valor_mensalidade: !isNaN(valor) ? valor : a.valor_mensalidade }
      : a
    ));
    toast.success('Matrícula confirmada!');
  }

  async function handleAddGastoHoje() {
    const valor = parseFloat(gastoForm.valor.replace(',', '.'));
    if (!gastoForm.descricao.trim() || isNaN(valor) || valor <= 0) {
      toast.error('Preencha descrição e valor.');
      return;
    }
    setSavingGasto(true);
    const { data, error } = await supabase.from('balanco_itens').insert({
      descricao: gastoForm.descricao.trim(),
      valor,
      tipo: 'saida',
      categoria: gastoForm.categoria,
      produto: 'geral',
      mes_referencia: range.start.slice(0, 7),
      recorrente: false,
      retorno_realizado: 0,
    }).select('*').single();
    setSavingGasto(false);
    if (error || !data) { toast.error('Erro ao registrar gasto.'); return; }
    setGastosHoje(prev => [data as BalancoItem, ...prev]);
    setGastoForm({ descricao: '', valor: '', categoria: 'custo_variavel' });
    toast.success('Gasto registrado!');
  }

  async function handleUpdateCanal(pagamentoId: string, canal: string) {
    setSavingCanal(pagamentoId);
    const { error } = await supabase.from('pagamentos').update({ canal_cobranca: canal || null }).eq('id', pagamentoId);
    setSavingCanal(null);
    if (error) { toast.error('Erro ao salvar canal.'); return; }
    setReceitasHoje(prev => prev.map(r => r.id === pagamentoId ? { ...r, canal_cobranca: canal || null } : r));
  }

  async function handleConfirmarPagamento(pagamentoId: string) {
    setSavingConferencia(pagamentoId);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('pagamentos')
      .update({ conferido_em: agora, conferido_por: currentUser?.nome || null })
      .eq('id', pagamentoId);
    setSavingConferencia(null);
    if (error) { toast.error('Erro ao confirmar pagamento.'); return; }
    setReceitasHoje(prev => prev.map(r => r.id === pagamentoId ? { ...r, conferido_em: agora, conferido_por: currentUser?.nome || null } : r));
  }

  function exportarCSVPeriodo(receitas: ReceitaHoje[], taxaFn: (r: ReceitaHoje) => number) {
    const headers = ['Data', 'Aluno', 'Turma', 'Tipo', 'Produto', 'Forma', 'Canal', 'Valor', 'Taxa', 'Líquido', 'Conferido'];
    const rows = receitas.map(r => {
      const turma = turmasInfo.find(t => t.id === r.turma_id);
      const taxa = taxaFn(r);
      const [y, m, d] = r.data_pagamento.split('T')[0].split('-');
      return [
        `${d}/${m}/${y}`,
        r.aluno_nome || '—',
        turma?.nome || '—',
        (r.numero_parcela ?? 0) <= 1 ? 'Comercial' : 'Recorrência',
        r.produto_label,
        FORMA_LABELS[r.forma_pagamento] || r.forma_pagamento,
        r.canal_cobranca || '',
        r.valor.toFixed(2).replace('.', ','),
        taxa.toFixed(2).replace('.', ','),
        (r.valor - taxa).toFixed(2).replace('.', ','),
        r.conferido_em ? 'Sim' : 'Não',
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fechamento_${periodoTipo}_${range.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFecharPeriodo(payload: Omit<FechamentoRow, 'id' | 'periodo_tipo' | 'periodo_key' | 'periodo_inicio' | 'periodo_fim' | 'status' | 'fechado_em' | 'fechado_por' | 'reaberto_em'>) {
    setSavingFechamento(true);
    const { data, error } = await supabase
      .from('fechamentos')
      .upsert({
        periodo_tipo: periodoTipo,
        periodo_key: range.key,
        periodo_inicio: range.start,
        periodo_fim: range.end,
        status: 'fechado' as StatusFechamento,
        ...payload,
        fechado_em: new Date().toISOString(),
        fechado_por: currentUser?.nome || null,
        reaberto_em: null,
      }, { onConflict: 'periodo_tipo,periodo_key' })
      .select('*')
      .single();
    setSavingFechamento(false);
    if (error || !data) { toast.error('Erro ao fechar período.'); return; }
    setFechamentoAtual(data as FechamentoRow);
    toast.success(`${periodoTipoLabel(periodoTipo)} fechado!`);
  }

  async function handleReabrirPeriodo() {
    if (!fechamentoAtual) return;
    setReabrindo(true);
    const { data, error } = await supabase
      .from('fechamentos')
      .update({ status: 'aberto' as StatusFechamento, reaberto_em: new Date().toISOString() })
      .eq('id', fechamentoAtual.id)
      .select('*')
      .single();
    setReabrindo(false);
    if (error || !data) { toast.error('Erro ao reabrir período.'); return; }
    setFechamentoAtual(data as FechamentoRow);
    toast.success('Período reaberto — os números voltam a ser recalculados ao vivo.');
  }

  async function handleDeleteGastoHoje(id: string) {
    const { error } = await supabase.from('balanco_itens').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover.'); return; }
    setGastosHoje(prev => prev.filter(g => g.id !== id));
    toast.success('Removido!');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const tabs: { id: View; label: string }[] = [
    { id: 'fechamento', label: '🔒 Fechamento' },
    { id: 'config',   label: '⚙ Config' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balanço</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fechamento financeiro geral</p>
        </div>
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

      <>
          {/* ────────────────── FECHAMENTO ────────────────── */}
          {view === 'fechamento' && (
            <div className="space-y-5">

              {/* Seletor de período */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 p-1 rounded-lg border border-border bg-muted/30">
                  {(['dia', 'semana', 'mes', 'trimestre', 'semestre', 'ano'] as PeriodoTipo[]).map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => setPeriodoTipo(tipo)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        periodoTipo === tipo ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {periodoTipoLabel(tipo)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRefDate(d => shiftPeriodo(periodoTipo, d, -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[140px] text-center">{range.label}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRefDate(d => shiftPeriodo(periodoTipo, d, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {fechamentoAtual?.status === 'fechado' ? (
                  <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
                    <Lock className="h-3 w-3" />
                    Fechado em {new Date(fechamentoAtual.fechado_em!).toLocaleDateString('pt-BR')} às {new Date(fechamentoAtual.fechado_em!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {fechamentoAtual.fechado_por ? ` por ${fechamentoAtual.fechado_por}` : ''}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                    <Unlock className="h-3 w-3" /> Não fechado — números ao vivo
                  </Badge>
                )}
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={loadPeriodo}>
                  <RefreshCw className="h-3 w-3" /> Atualizar
                </Button>
              </div>

              {/* Fechamento geral × por responsável */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  onClick={() => setResponsavelFiltro('')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    responsavelFiltro === '' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  Geral
                </button>
                {responsaveisList.filter(r => r.ativo !== false).map(r => (
                  <button
                    key={r.id}
                    onClick={() => setResponsavelFiltro(r.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      responsavelFiltro === r.id ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    {r.nome}
                  </button>
                ))}
              </div>

              {loadingDiario ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (() => {
                const filtroAtivo = responsavelFiltro !== '';
                const respSelecionado = responsaveisList.find(r => r.id === responsavelFiltro);
                // Matrículas (ainda sem pagamento) continuam ligadas à turma; o repasse de
                // pagamento em si (abaixo) não depende mais de "turma do responsável", já
                // que comercial de PSI vai pra Onze Digital e recorrência é 50/50 com o IDM
                // independente de quem está cadastrado como investidor da turma.
                const turmaIdsResp = new Set(turmasResp.filter(tr => tr.user_id === responsavelFiltro).map(tr => tr.turma_id));
                const alunosView = filtroAtivo ? alunosHoje.filter(a => turmaIdsResp.has(a.turma_id)) : alunosHoje;

                // repasse calculado pagamento a pagamento (sempre a partir do período geral)
                const pagamentosComRepasse = receitasHoje.map(r => {
                  const taxa = calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates);
                  const liquido = r.valor - taxa;
                  const linhas = calcRepassePagamento(liquido, r.produto, r.numero_parcela, r.turma_id, turmasResp, responsaveisList);
                  return { r, taxa, liquido, linhas };
                });

                // no fechamento por responsável, só entram pagamentos onde ele de fato recebe algo
                const receitasView = filtroAtivo
                  ? pagamentosComRepasse.filter(x => x.linhas.some(l => l.responsavel_id === responsavelFiltro)).map(x => x.r)
                  : receitasHoje;
                const meuRepasseTotal = pagamentosComRepasse.reduce(
                  (s, x) => s + (x.linhas.find(l => l.responsavel_id === responsavelFiltro)?.valor || 0), 0);

                // ── Computado ao vivo a partir dos pagamentos do período ──
                const brutoVivo = receitasView.reduce((s, r) => s + r.valor, 0);
                const taxasVivo = receitasView.reduce((s, r) =>
                  s + calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates), 0);
                const liquidoVivo = brutoVivo - taxasVivo;
                const saidasVivo = filtroAtivo ? 0 : gastosHoje.reduce((s, g) => s + g.valor, 0);

                const pagamentosParaRepasse: PagamentoParaRepasse[] = receitasHoje.map(r => ({
                  turma_id: r.turma_id,
                  produto: r.produto,
                  numero_parcela: r.numero_parcela,
                  liquido: r.valor - calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates),
                }));
                const repasseVivo = calcRepasses(pagamentosParaRepasse, turmasResp, responsaveisList);
                const saldoFinalVivo = repasseVivo.valorIdm - saidasVivo;

                const isFechado = !filtroAtivo && fechamentoAtual?.status === 'fechado';
                const bruto      = isFechado ? fechamentoAtual!.bruto : brutoVivo;
                const taxasTotal = isFechado ? fechamentoAtual!.taxas : taxasVivo;
                const liquido    = isFechado ? fechamentoAtual!.liquido : liquidoVivo;
                const repasses: RepasseCalculado[] = isFechado ? fechamentoAtual!.repasses : repasseVivo.repasses;
                const saldoIdm    = isFechado ? fechamentoAtual!.saldo_idm : repasseVivo.valorIdm;
                const saidasTotal = isFechado ? fechamentoAtual!.saidas_operacionais : saidasVivo;
                const saldoFinal  = isFechado ? fechamentoAtual!.saldo_final : saldoFinalVivo;

                // agrupa entradas por produto
                const porProduto: Record<string, { label: string; itens: ReceitaHoje[] }> = {};
                for (const r of receitasView) {
                  const key = r.produto || 'outros';
                  if (!porProduto[key]) porProduto[key] = { label: r.produto_label || key, itens: [] };
                  porProduto[key].itens.push(r);
                }

                // comercial (1ª parcela = matrícula nova) × recorrência (parcelas seguintes)
                const comercialItens = receitasView.filter(r => (r.numero_parcela ?? 1) <= 1);
                const recorrenciaItens = receitasView.filter(r => (r.numero_parcela ?? 1) > 1);
                const comercialTotal = comercialItens.reduce((s, r) => s + r.valor, 0);
                const recorrenciaTotal = recorrenciaItens.reduce((s, r) => s + r.valor, 0);

                // turmas que geraram receita nesse período
                const turmasDoPeriodo = Array.from(new Set(receitasView.map(r => r.turma_id).filter((id): id is string => !!id)))
                  .map(id => ({ turma: turmasInfo.find(t => t.id === id), count: receitasView.filter(r => r.turma_id === id).length }))
                  .filter(t => t.turma)
                  .sort((a, b) => b.count - a.count);

                const pendenteCount = alunosView.filter(a => !confirmados.has(a.id) && !a.forma_pagamento).length;

                return (
                  <>
                    {/* Ações de fechamento (só no fechamento geral — cada responsável só visualiza) */}
                    <div className="flex flex-wrap items-center gap-2">
                      {filtroAtivo ? (
                        <Badge className="bg-violet-50 text-violet-700 border-violet-200 gap-1">
                          <Users className="h-3 w-3" /> Fechamento individual — {respSelecionado?.nome}
                        </Badge>
                      ) : !isFechado ? (
                        <Button
                          size="sm" className="gap-1.5 bg-slate-800 hover:bg-slate-900 text-white"
                          disabled={savingFechamento}
                          onClick={() => handleFecharPeriodo({
                            bruto: brutoVivo, taxas: taxasVivo, liquido: liquidoVivo,
                            repasses: repasseVivo.repasses, saldo_idm: repasseVivo.valorIdm,
                            saidas_operacionais: saidasVivo, saldo_final: saldoFinalVivo,
                            total_pagamentos: receitasView.length,
                          })}
                        >
                          <Lock className="h-3.5 w-3.5" /> {savingFechamento ? 'Fechando…' : `Fechar ${periodoTipoLabel(periodoTipo).toLowerCase()}`}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={reabrindo} onClick={handleReabrirPeriodo}>
                          <Unlock className="h-3.5 w-3.5" /> {reabrindo ? 'Reabrindo…' : 'Reabrir período'}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1.5"
                        onClick={() => exportarCSVPeriodo(receitasView, r => calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates))}>
                        <Download className="h-3.5 w-3.5" /> Exportar CSV
                      </Button>
                    </div>

                    {/* KPI do período */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(filtroAtivo ? [
                        { icon: <Receipt className="h-4 w-4" />, label: 'Bruto (pagamentos c/ sua parte)', value: bruto, cls: 'text-emerald-600' },
                        { icon: <Info className="h-4 w-4" />, label: 'Taxas', value: taxasTotal, cls: 'text-red-500', prefix: '−' },
                        { icon: <DollarSign className="h-4 w-4" />, label: 'Líquido', value: liquido, cls: 'text-sky-600' },
                        { icon: <Users className="h-4 w-4" />, label: 'Seu repasse', value: meuRepasseTotal, cls: 'text-violet-600' },
                      ] : [
                        { icon: <Receipt className="h-4 w-4" />, label: 'Bruto', value: bruto, cls: 'text-emerald-600' },
                        { icon: <Info className="h-4 w-4" />, label: 'Taxas', value: taxasTotal, cls: 'text-red-500', prefix: '−' },
                        { icon: <DollarSign className="h-4 w-4" />, label: 'Líquido', value: liquido, cls: 'text-sky-600' },
                        { icon: <ShoppingBag className="h-4 w-4" />, label: 'Saídas', value: saidasTotal, cls: 'text-orange-600', prefix: '−' },
                      ]).map(k => (
                        <Card key={k.label} className="p-4 border-border/60 shadow-none">
                          <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{k.icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{k.label}</span></div>
                          <p className={`text-xl font-bold tabular-nums ${k.cls}`}>{k.prefix || ''}R$ {fmt(k.value)}</p>
                        </Card>
                      ))}
                    </div>

                    {/* Repasse por responsável (só no fechamento geral) */}
                    {!filtroAtivo && repasses.length > 0 && (
                      <Card className="p-4 border-border/60 shadow-none">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" /> Repasse do período
                        </p>
                        <div className="space-y-2">
                          {repasses.map(r => (
                            <div key={r.responsavel_id || r.nome} className="flex items-center justify-between">
                              <span className="text-sm font-medium">{r.nome} <span className="text-xs text-muted-foreground">({r.percentual.toFixed(1)}%)</span></span>
                              <span className="text-sm font-bold text-violet-700 tabular-nums">R$ {fmt(r.valor)}</span>
                            </div>
                          ))}
                          <div className="border-t border-border/40 pt-2 flex justify-between">
                            <span className="text-xs text-muted-foreground">Fica no IDM</span>
                            <span className="text-sm font-bold tabular-nums">R$ {fmt(saldoIdm)}</span>
                          </div>
                        </div>
                      </Card>
                    )}

                    {!filtroAtivo && (
                      <Card className={`p-4 border shadow-none ${saldoFinal >= 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/30'}`}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Saldo final ({repasses.length > 0 ? 'IDM pós-repasse' : 'líquido'} − saídas)
                        </p>
                        <p className={`text-2xl font-bold tabular-nums mt-1 ${saldoFinal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {saldoFinal >= 0 ? '' : '−'}R$ {fmt(Math.abs(saldoFinal))}
                        </p>
                        {isFechado && (
                          <p className="text-[10px] text-muted-foreground mt-1">Valores congelados no fechamento — a lista de pagamentos abaixo continua ao vivo.</p>
                        )}
                      </Card>
                    )}

                    {/* Entradas do período por produto */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Entradas — {receitasView.length} pagamento{receitasView.length !== 1 ? 's' : ''}
                      </p>

                      {receitasView.length > 0 && (
                        <>
                          {/* Comercial × Recorrência */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <Card className="p-3 border-emerald-200 bg-emerald-50/30 shadow-none">
                              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Comercial · matrículas novas</p>
                              <p className="text-lg font-bold text-emerald-700 tabular-nums">R$ {fmt(comercialTotal)}</p>
                              <p className="text-[10px] text-muted-foreground">{comercialItens.length} pagamento{comercialItens.length !== 1 ? 's' : ''}</p>
                            </Card>
                            <Card className="p-3 border-sky-200 bg-sky-50/30 shadow-none">
                              <p className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide">Recorrência · parcelas</p>
                              <p className="text-lg font-bold text-sky-700 tabular-nums">R$ {fmt(recorrenciaTotal)}</p>
                              <p className="text-[10px] text-muted-foreground">{recorrenciaItens.length} pagamento{recorrenciaItens.length !== 1 ? 's' : ''}</p>
                            </Card>
                          </div>

                          {/* Turmas do período */}
                          {turmasDoPeriodo.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mb-3">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Turmas do período:</span>
                              {turmasDoPeriodo.map(({ turma, count }) => (
                                <span key={turma!.id} className="text-[11px] bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                                  {turma!.nome} <span className="text-muted-foreground">({count})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {receitasView.length === 0 ? (
                        <Card className="p-6 text-center border-border/50 shadow-none">
                          <p className="text-sm text-muted-foreground">Nenhum pagamento recebido nesse período</p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(porProduto).map(([slug, { label, itens }]) => {
                            const subtotal = itens.reduce((s, r) => s + r.valor, 0);
                            const subtaxas = itens.reduce((s, r) =>
                              s + calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates), 0);
                            return (
                              <Card key={slug} className="border-border/60 shadow-none overflow-hidden">
                                <div className="bg-muted/30 px-4 py-2 flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Bruto <strong>R$ {fmt(subtotal)}</strong> · Taxa <strong className="text-red-500">−R$ {fmt(subtaxas)}</strong> · Líq <strong className="text-emerald-600">R$ {fmt(subtotal - subtaxas)}</strong>
                                  </span>
                                </div>
                                <div className="p-3 space-y-2 bg-muted/10">
                                  {itens.map(r => {
                                    const taxa = calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates);
                                    const liquidoLinha = r.valor - taxa;
                                    const resps = calcRepassePagamento(liquidoLinha, r.produto, r.numero_parcela, r.turma_id, turmasResp, responsaveisList);
                                    const turma = turmasInfo.find(t => t.id === r.turma_id);
                                    const comercial = (r.numero_parcela ?? 1) <= 1;
                                    const conferido = !!r.conferido_em;
                                    return (
                                      <Card key={r.id} className={`border shadow-none ${conferido ? 'border-emerald-200 bg-emerald-50/20' : 'border-amber-200 bg-amber-50/20'}`}>
                                        <div className="px-4 py-3 space-y-2">
                                          {/* Header */}
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                {conferido
                                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                  : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                                                <span className="font-semibold text-sm">{r.aluno_nome || '—'}</span>
                                                <Badge className={`text-[10px] border ${comercial ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                                                  {comercial ? 'Comercial' : 'Recorrência'}
                                                </Badge>
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                                                {turma?.nome || 'Sem turma'}
                                              </p>
                                            </div>
                                            <Badge className={`text-[10px] shrink-0 ${conferido ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                                              title={conferido && r.conferido_por ? `Conferido por ${r.conferido_por}` : undefined}>
                                              {conferido ? '✓ Conferido' : 'Pendente'}
                                            </Badge>
                                          </div>

                                          {/* Repasse por responsável (comercial PSI = 100% Onze Digital; recorrência = 50% IDM + 50% investidor) */}
                                          {resps.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pl-6">
                                              {resps.map((r2, i) => (
                                                <span key={r2.responsavel_id || `${r2.nome}-${i}`} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full">
                                                  {r2.nome} <strong>R$ {fmt(r2.valor)}</strong> <span className="text-muted-foreground">({r2.percentual.toFixed(0)}%)</span>
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Valores */}
                                          <div className="pl-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
                                            <div>
                                              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Forma</label>
                                              <Badge className={`text-[10px] border ${FORMA_COR[r.forma_pagamento] || 'bg-muted text-muted-foreground'}`}>
                                                {FORMA_LABELS[r.forma_pagamento] || r.forma_pagamento}
                                              </Badge>
                                            </div>
                                            <div>
                                              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Canal</label>
                                              <Select
                                                value={r.canal_cobranca || '__none__'}
                                                onValueChange={v => handleUpdateCanal(r.id, v === '__none__' ? '' : v)}
                                              >
                                                <SelectTrigger className="h-7 text-xs" disabled={savingCanal === r.id}>
                                                  <SelectValue placeholder="Canal" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none__">— Canal —</SelectItem>
                                                  {canaisCobranca.map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div>
                                              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Valor</label>
                                              <div className="h-7 flex items-center text-xs font-semibold">R$ {fmt(r.valor)}</div>
                                            </div>
                                            <div>
                                              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Taxa</label>
                                              <div className="h-7 flex items-center text-xs text-red-500 font-semibold">−R$ {fmt(taxa)}</div>
                                            </div>
                                            <div>
                                              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Líquido</label>
                                              <div className="h-7 flex items-center text-xs text-emerald-600 font-semibold">R$ {fmt(liquidoLinha)}</div>
                                            </div>
                                          </div>

                                          {/* Botão confirmar */}
                                          {!conferido && (
                                            <div className="pl-6">
                                              <Button
                                                size="sm" className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                                onClick={() => handleConfirmarPagamento(r.id)}
                                                disabled={savingConferencia === r.id}
                                              >
                                                <CheckCircle2 className="h-3 w-3" />
                                                {savingConferencia === r.id ? 'Salvando…' : 'Confirmar pagamento'}
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Matrículas do período */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" /> Matrículas — {alunosView.length} nova{alunosView.length !== 1 ? 's' : ''}
                        {pendenteCount > 0 && (
                          <Badge className="ml-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">{pendenteCount} pendente{pendenteCount !== 1 ? 's' : ''}</Badge>
                        )}
                      </div>
                      {alunosView.length === 0 ? (
                        <Card className="p-6 text-center border-border/50 shadow-none">
                          <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado nesse período</p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {alunosView.map(aluno => {
                            const turma = turmasInfo.find(t => t.id === aluno.turma_id);
                            const resps = turmasResp.filter(tr => tr.turma_id === aluno.turma_id);
                            const draft = matriculasDraft[aluno.id] || { forma: aluno.forma_pagamento || 'boleto', valor: String(aluno.valor_mensalidade || '') };
                            const valorNum = parseFloat(draft.valor.replace(',', '.')) || 0;
                            const taxaEst = calcTaxaTransacao(valorNum, turma?.produto || '', draft.forma, taxasRates);
                            const jaConfirmado = confirmados.has(aluno.id) || (!!aluno.forma_pagamento && aluno.forma_pagamento !== '');
                            const produto = turma?.produto || 'geral';
                            const PROD_COR: Record<string, string> = { psicanalise: '#3b82f6', npa: '#8b5cf6', geral: '#6b7280' };

                            return (
                              <Card key={aluno.id} className={`border shadow-none ${jaConfirmado ? 'border-emerald-200 bg-emerald-50/20' : 'border-amber-200 bg-amber-50/20'}`}>
                                <div className="px-4 py-3 space-y-3">
                                  {/* Header da matrícula */}
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {jaConfirmado
                                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                          : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                                        <span className="font-semibold text-sm">{aluno.nome}</span>
                                        {produto !== 'geral' && (
                                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: PROD_COR[produto] + '20', color: PROD_COR[produto] }}>
                                            {produto === 'psicanalise' ? 'PSI' : produto.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                                        {turma?.nome || 'Turma não encontrada'}
                                      </p>
                                    </div>
                                    <Badge className={`text-[10px] shrink-0 ${jaConfirmado ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                      {jaConfirmado ? '✓ Confirmado' : 'Pendente'}
                                    </Badge>
                                  </div>

                                  {/* Responsáveis da turma */}
                                  {resps.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pl-6">
                                      {resps.map(r => (
                                        <span key={r.nome_ref} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full">
                                          {r.nome_ref} <strong>{r.percentual}%</strong>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Campos editáveis */}
                                  {!jaConfirmado && (
                                    <div className="pl-6 space-y-2">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <div>
                                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Forma pgto</label>
                                          <Select
                                            value={draft.forma}
                                            onValueChange={v => setMatriculasDraft(prev => ({ ...prev, [aluno.id]: { ...prev[aluno.id], forma: v } }))}
                                          >
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="boleto">Boleto</SelectItem>
                                              <SelectItem value="pix">PIX</SelectItem>
                                              <SelectItem value="cartao">Cartão</SelectItem>
                                              <SelectItem value="avista">À Vista</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Valor parcela (R$)</label>
                                          <Input
                                            type="number" step="0.01" className="h-7 text-xs"
                                            value={draft.valor}
                                            onChange={e => setMatriculasDraft(prev => ({ ...prev, [aluno.id]: { ...prev[aluno.id], valor: e.target.value } }))}
                                            placeholder={String(turma?.valor_mensalidade || '')}
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Taxa estimada</label>
                                          <div className="h-7 flex items-center text-xs text-red-500 font-semibold">
                                            {valorNum > 0 ? `−R$ ${fmt(taxaEst)}` : '—'}
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Líquido estimado</label>
                                          <div className="h-7 flex items-center text-xs text-emerald-600 font-semibold">
                                            {valorNum > 0 ? `R$ ${fmt(valorNum - taxaEst)}` : '—'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Valores já confirmados */}
                                  {jaConfirmado && aluno.valor_mensalidade && (
                                    <div className="pl-6 flex flex-wrap gap-4 text-xs items-center">
                                      <span>Forma: <strong>{FORMA_LABELS[aluno.forma_pagamento || ''] || aluno.forma_pagamento || '—'}</strong></span>
                                      <span>Parcela: <strong>R$ {fmt(aluno.valor_mensalidade)}</strong></span>
                                      {aluno.total_mensalidades && <span>Total: <strong>{aluno.total_mensalidades}x</strong></span>}
                                    </div>
                                  )}

                                  {/* Botão confirmar */}
                                  {!jaConfirmado && (
                                    <div className="pl-6">
                                      <Button
                                        size="sm" className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => handleConfirmarAluno(aluno.id)}
                                        disabled={savingAluno === aluno.id}
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                        {savingAluno === aluno.id ? 'Salvando…' : 'Confirmar matrícula'}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Saídas do período (custo operacional é da empresa, não de um responsável) */}
                    {!filtroAtivo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" /> Saídas do período
                      </p>
                      {/* Quick add */}
                      <Card className="p-3 border-border/60 shadow-none mb-3">
                        <p className="text-xs font-medium mb-2">Registrar gasto nesse período</p>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <Input
                            className="h-8 text-sm sm:col-span-2"
                            placeholder="Descrição (ex: Almoço equipe)"
                            value={gastoForm.descricao}
                            onChange={e => setGastoForm(f => ({ ...f, descricao: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddGastoHoje()}
                          />
                          <Select value={gastoForm.categoria} onValueChange={v => setGastoForm(f => ({ ...f, categoria: v as Categoria }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custo_fixo">Custo Fixo</SelectItem>
                              <SelectItem value="custo_variavel">Custo Variável</SelectItem>
                              <SelectItem value="ads">Ads / Marketing</SelectItem>
                              <SelectItem value="alocacao">Alocação</SelectItem>
                              <SelectItem value="outro_saida">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Input
                              type="number" step="0.01" className="h-8 text-sm flex-1"
                              placeholder="R$ 0,00"
                              value={gastoForm.valor}
                              onChange={e => setGastoForm(f => ({ ...f, valor: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleAddGastoHoje()}
                            />
                            <Button size="sm" className="h-8 px-3" onClick={handleAddGastoHoje} disabled={savingGasto}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                      {/* Lista */}
                      {gastosHoje.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-3">Nenhuma saída registrada nesse período</p>
                      ) : (
                        <div className="space-y-1.5">
                          {gastosHoje.map(g => (
                            <div key={g.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-white">
                              <span className="flex-1 text-sm">{g.descricao}</span>
                              <span className="text-xs text-muted-foreground">{CAT_LABELS[g.categoria]}</span>
                              <span className="text-sm font-semibold tabular-nums text-red-500">−R$ {fmt(g.valor)}</span>
                              <button onClick={() => handleDeleteGastoHoje(g.id)} className="text-muted-foreground hover:text-red-500 transition-colors ml-1">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <div className="flex justify-end px-3 pt-1">
                            <span className="text-sm font-bold text-red-500">Total saídas: −R$ {fmt(gastosHoje.reduce((s, g) => s + g.valor, 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    )}

                  </>
                );
              })()}
            </div>
          )}

          {/* ────────────────── CONFIG ────────────────── */}
          {view === 'config' && (
            <div className="space-y-6">

              <TaxasPagamentoConfig produtos={produtos} taxas={taxasRates} onSaved={setTaxasRates} />
              <RepasseTurmasConfig turmas={turmasInfo} onSaved={reloadTurmaResponsaveis} />
            </div>
          )}
        </>

    </div>
  );
}
