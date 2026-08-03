import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Trash2,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Settings, Info,
  Receipt, UserCheck, ShoppingBag, ChevronLeft, ChevronRight,
  Lock, Unlock, Download, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calcTaxaTransacao, calcRepasses, getPeriodRange, shiftPeriodo, periodoTipoLabel,
  type TaxaDetalhe, type PeriodoTipo, type ResponsavelRow, type TurmaResponsavelRow,
  type RepasseCalculado, type Produto,
} from '@/lib/financial-utils';
import { useAuth } from '@/contexts/AuthContext';
import { TaxasPagamentoConfig } from './finance/TaxasPagamentoConfig';
import { RepasseTurmasConfig } from './finance/RepasseTurmasConfig';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tipo = 'entrada' | 'saida';
type Categoria =
  | 'matricula' | 'outro_entrada'
  | 'custo_fixo' | 'custo_variavel' | 'ads' | 'alocacao' | 'outro_saida';
type View = 'overview' | 'entradas' | 'despesas' | 'config' | 'fechamento';
type Health = 'ok' | 'warn' | 'bad';
type Empresa = 'onze_digital' | 'idm';
type StatusFechamento = 'aberto' | 'fechado';

const EMPRESA_LABELS: Record<Empresa, string> = { onze_digital: 'Onze Digital', idm: 'IDM' };
const EMPRESA_COR: Record<Empresa, { badge: string; ring: string }> = {
  onze_digital: { badge: 'bg-blue-50 text-blue-700 border-blue-200',   ring: 'ring-blue-500' },
  idm:          { badge: 'bg-violet-50 text-violet-700 border-violet-200', ring: 'ring-violet-500' },
};
function produtoToEmpresa(produto: string | null | undefined): Empresa {
  return produto === 'npa' ? 'idm' : 'onze_digital';
}

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
  empresa: Empresa;
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
const FORMA_LABELS: Record<string, string> = {
  boleto: 'Boleto', cartao: 'Cartão', pix: 'PIX', avista: 'À Vista',
};
const FORMA_COR: Record<string, string> = {
  boleto: 'bg-amber-50 text-amber-700 border-amber-200',
  cartao: 'bg-blue-50 text-blue-700 border-blue-200',
  pix:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  avista: 'bg-violet-50 text-violet-700 border-violet-200',
};
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
  const [empresa, setEmpresa] = useState<Empresa>('onze_digital');
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

  // Receita real do CRM (vw_receita_por_fonte) para comparação com lançamentos manuais
  const [receitaRealTotal, setReceitaRealTotal] = useState(0);
  const [receitaRealPorProduto, setReceitaRealPorProduto] = useState<Record<string, { total: number; nome: string }>>({});

  // ─── Estado: Fechamento por período ──────────────────────────────────────
  const { user: currentUser } = useAuth();
  const [periodoTipo, setPeriodoTipo]       = useState<PeriodoTipo>('dia');
  const [refDate, setRefDate]               = useState(() => new Date());
  const range = useMemo(() => getPeriodRange(periodoTipo, refDate), [periodoTipo, refDate]);

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
  // draft por aluno: forma_pagamento, valor e empresa editáveis
  const [matriculasDraft, setMatriculasDraft] = useState<Record<string, { forma: string; valor: string; empresa: Empresa }>>({});
  const [savingAluno, setSavingAluno]       = useState<string | null>(null);
  // form gasto rápido do período
  const [gastoForm, setGastoForm]           = useState({ descricao: '', valor: '', categoria: 'custo_variavel' as Categoria });
  const [savingGasto, setSavingGasto]       = useState(false);
  const [savingCanal, setSavingCanal]       = useState<string | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [itemsRes, cfgRes, receitaRealRes] = await Promise.all([
          supabase.from('balanco_itens').select('*').eq('mes_referencia', mes).eq('empresa', empresa).order('created_at', { ascending: false }),
          supabase.from('balanco_config').select('*').eq('id', empresa).single(),
          // Receita real do CRM — JOIN pagamentos + alunos via view
          supabase.from('vw_receita_por_fonte').select('valor, produto, produto_label').like('mes_referencia', `${mes}%`),
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
        // Agrupa receita real por produto para o banner
        const porProd: Record<string, { total: number; nome: string }> = {};
        let totalReal = 0;
        for (const row of (receitaRealRes.data || [])) {
          const slug = row.produto || 'outros';
          const nome = row.produto_label || slug;
          if (!porProd[slug]) porProd[slug] = { total: 0, nome };
          porProd[slug].total += row.valor || 0;
          totalReal += row.valor || 0;
        }
        setReceitaRealTotal(totalReal);
        setReceitaRealPorProduto(porProd);
      } catch {
        toast.error('Erro ao carregar balanço. Recarregue a página.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mes, empresa]);

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
          .select('id, aluno_id, turma_id, valor, produto, produto_label, forma_pagamento, mes_referencia, data_pagamento, canal_cobranca')
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
      const draft: Record<string, { forma: string; valor: string; empresa: Empresa }> = {};
      for (const a of novos) {
        const turmaInfo = turmasInfo.find(t => t.id === a.turma_id);
        draft[a.id] = {
          forma: a.forma_pagamento || 'boleto',
          valor: a.valor_mensalidade ? String(a.valor_mensalidade) : '',
          empresa: produtoToEmpresa(turmaInfo?.produto),
        };
      }
      setMatriculasDraft(draft);
    } catch {
      toast.error('Erro ao carregar o fechamento do período.');
    } finally {
      setLoadingDiario(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, range.key, periodoTipo]);

  useEffect(() => {
    if (view === 'fechamento') loadPeriodo();
  }, [view, loadPeriodo]);

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
      { id: empresa, taxas: editConfig.taxas, socios: editConfig.socios, updated_at: new Date().toISOString() },
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
        empresa,
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

  // ─── Actions: Fechamento por período ──────────────────────────────────────

  async function handleConfirmarAluno(alunoId: string) {
    const draft = matriculasDraft[alunoId];
    if (!draft) return;
    setSavingAluno(alunoId);
    const valor = parseFloat(draft.valor.replace(',', '.'));
    const updates: Record<string, unknown> = { forma_pagamento: draft.forma };
    if (!isNaN(valor) && valor > 0) updates.valor_mensalidade = valor;

    const { error } = await supabase.from('alunos').update(updates).eq('id', alunoId);
    if (error) { setSavingAluno(null); toast.error('Erro ao salvar matrícula.'); return; }

    // Inserir na balanco_itens como entrada de matrícula
    if (!isNaN(valor) && valor > 0) {
      const aluno = alunosHoje.find(a => a.id === alunoId);
      const turma = turmasInfo.find(t => t.id === aluno?.turma_id);
      const produto = turma?.produto || 'geral';
      const prodNorm = produto === 'psicanalise' ? 'psicanalise' : produto === 'npa' ? 'npa' : 'geral';
      const desc = `Matrícula — ${aluno?.nome ?? 'Aluno'} — ${turma?.nome ?? 'Sem turma'}`;

      await supabase.from('balanco_itens').insert({
        descricao: desc,
        valor,
        tipo: 'entrada',
        categoria: 'matricula',
        produto: prodNorm,
        mes_referencia: range.start.slice(0, 7),
        recorrente: false,
        retorno_realizado: 0,
        empresa: draft.empresa,
      });
    }

    setSavingAluno(null);
    setConfirmados(prev => new Set([...prev, alunoId]));
    setAlunosHoje(prev => prev.map(a => a.id === alunoId
      ? { ...a, forma_pagamento: draft.forma, valor_mensalidade: !isNaN(valor) ? valor : a.valor_mensalidade }
      : a
    ));
    toast.success(`Matrícula confirmada e adicionada ao balanço ${EMPRESA_LABELS[draft.empresa]}!`);
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
      empresa,
    }).select('*').single();
    setSavingGasto(false);
    if (error || !data) { toast.error('Erro ao registrar gasto.'); return; }
    setGastosHoje(prev => [data as BalancoItem, ...prev]);
    setItems(prev => [data as BalancoItem, ...prev]); // atualiza overview também
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

  function exportarCSVPeriodo(receitas: ReceitaHoje[], taxaFn: (r: ReceitaHoje) => number) {
    const headers = ['Data', 'Turma', 'Produto', 'Forma', 'Canal', 'Valor', 'Taxa', 'Líquido'];
    const rows = receitas.map(r => {
      const turma = turmasInfo.find(t => t.id === r.turma_id);
      const taxa = taxaFn(r);
      const [y, m, d] = r.data_pagamento.split('T')[0].split('-');
      return [
        `${d}/${m}/${y}`,
        turma?.nome || '—',
        r.produto_label,
        FORMA_LABELS[r.forma_pagamento] || r.forma_pagamento,
        r.canal_cobranca || '',
        r.valor.toFixed(2).replace('.', ','),
        taxa.toFixed(2).replace('.', ','),
        (r.valor - taxa).toFixed(2).replace('.', ','),
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
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success('Removido!');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const { receita_bruta, total_taxas, receita_liq, custo_fixo, custo_var, ads, outras, alocacoes,
    total_op, lucro, total_socios, saldo_empresa, saldo_livre, retorno_ads, roi_ads,
    margem, pct_ads, h_margem, h_ads, h_roi, entradas, saidas } = calc;

  const tabs: { id: View; label: string }[] = [
    { id: 'fechamento', label: '🔒 Fechamento' },
    { id: 'overview', label: 'Visão Geral' },
    { id: 'entradas', label: `Entradas (${entradas.length})` },
    { id: 'despesas', label: `Despesas (${saidas.length})` },
    { id: 'config',   label: '⚙ Config' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Balanço</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{mesLabel(mes)} · {EMPRESA_LABELS[empresa]}</p>
          </div>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mesesOpcoes().map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Toggle Empresa */}
        <div className="flex gap-1 p-1 rounded-lg border border-border bg-muted/30 w-fit">
          {(['onze_digital', 'idm'] as Empresa[]).map(e => (
            <button
              key={e}
              onClick={() => setEmpresa(e)}
              className={`px-5 py-1.5 rounded text-sm font-semibold transition-all ${
                empresa === e
                  ? `bg-white shadow-sm ${e === 'onze_digital' ? 'text-blue-700' : 'text-violet-700'}`
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {EMPRESA_LABELS[e]}
            </button>
          ))}
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

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (

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

              {loadingDiario ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (() => {
                // ── Computado ao vivo a partir dos pagamentos do período ──
                const brutoVivo = receitasHoje.reduce((s, r) => s + r.valor, 0);
                const taxasVivo = receitasHoje.reduce((s, r) =>
                  s + calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates), 0);
                const liquidoVivo = brutoVivo - taxasVivo;
                const saidasVivo = gastosHoje.reduce((s, g) => s + g.valor, 0);

                const liquidoPorTurma: Record<string, number> = {};
                for (const r of receitasHoje) {
                  if (!r.turma_id) continue;
                  const taxa = calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates);
                  liquidoPorTurma[r.turma_id] = (liquidoPorTurma[r.turma_id] || 0) + (r.valor - taxa);
                }
                const repasseVivo = calcRepasses(liquidoPorTurma, turmasResp, responsaveisList);
                const saldoFinalVivo = repasseVivo.valorIdm - saidasVivo;

                const isFechado = fechamentoAtual?.status === 'fechado';
                const bruto      = isFechado ? fechamentoAtual!.bruto : brutoVivo;
                const taxasTotal = isFechado ? fechamentoAtual!.taxas : taxasVivo;
                const liquido    = isFechado ? fechamentoAtual!.liquido : liquidoVivo;
                const repasses: RepasseCalculado[] = isFechado ? fechamentoAtual!.repasses : repasseVivo.repasses;
                const saldoIdm    = isFechado ? fechamentoAtual!.saldo_idm : repasseVivo.valorIdm;
                const saidasTotal = isFechado ? fechamentoAtual!.saidas_operacionais : saidasVivo;
                const saldoFinal  = isFechado ? fechamentoAtual!.saldo_final : saldoFinalVivo;

                // agrupa entradas por produto
                const porProduto: Record<string, { label: string; itens: ReceitaHoje[] }> = {};
                for (const r of receitasHoje) {
                  const key = r.produto || 'outros';
                  if (!porProduto[key]) porProduto[key] = { label: r.produto_label || key, itens: [] };
                  porProduto[key].itens.push(r);
                }

                const pendenteCount = alunosHoje.filter(a => !confirmados.has(a.id) && !a.forma_pagamento).length;

                return (
                  <>
                    {/* Ações de fechamento */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isFechado ? (
                        <Button
                          size="sm" className="gap-1.5 bg-slate-800 hover:bg-slate-900 text-white"
                          disabled={savingFechamento}
                          onClick={() => handleFecharPeriodo({
                            bruto: brutoVivo, taxas: taxasVivo, liquido: liquidoVivo,
                            repasses: repasseVivo.repasses, saldo_idm: repasseVivo.valorIdm,
                            saidas_operacionais: saidasVivo, saldo_final: saldoFinalVivo,
                            total_pagamentos: receitasHoje.length,
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
                        onClick={() => exportarCSVPeriodo(receitasHoje, r => calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates))}>
                        <Download className="h-3.5 w-3.5" /> Exportar CSV
                      </Button>
                    </div>

                    {/* KPI do período */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { icon: <Receipt className="h-4 w-4" />, label: 'Bruto', value: bruto, cls: 'text-emerald-600' },
                        { icon: <Info className="h-4 w-4" />, label: 'Taxas', value: taxasTotal, cls: 'text-red-500', prefix: '−' },
                        { icon: <DollarSign className="h-4 w-4" />, label: 'Líquido', value: liquido, cls: 'text-sky-600' },
                        { icon: <ShoppingBag className="h-4 w-4" />, label: 'Saídas', value: saidasTotal, cls: 'text-orange-600', prefix: '−' },
                      ].map(k => (
                        <Card key={k.label} className="p-4 border-border/60 shadow-none">
                          <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{k.icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{k.label}</span></div>
                          <p className={`text-xl font-bold tabular-nums ${k.cls}`}>{k.prefix || ''}R$ {fmt(k.value)}</p>
                        </Card>
                      ))}
                    </div>

                    {/* Repasse por responsável */}
                    {repasses.length > 0 && (
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

                    {/* Entradas do período por produto */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Entradas — {receitasHoje.length} pagamento{receitasHoje.length !== 1 ? 's' : ''}
                      </p>
                      {receitasHoje.length === 0 ? (
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
                                <div className="divide-y divide-border/40">
                                  {itens.map(r => {
                                    const taxa = calcTaxaTransacao(r.valor, r.produto || '', r.forma_pagamento, taxasRates);
                                    const resps = turmasResp.filter(tr => tr.turma_id === r.turma_id);
                                    const turma = turmasInfo.find(t => t.id === r.turma_id);
                                    return (
                                      <div key={r.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                        <span className="font-medium flex-1 min-w-0 truncate">{turma?.nome || '—'}</span>
                                        <Badge className={`text-[10px] border ${FORMA_COR[r.forma_pagamento] || 'bg-muted text-muted-foreground'}`}>
                                          {FORMA_LABELS[r.forma_pagamento] || r.forma_pagamento}
                                        </Badge>
                                        <Select
                                          value={r.canal_cobranca || '__none__'}
                                          onValueChange={v => handleUpdateCanal(r.id, v === '__none__' ? '' : v)}
                                        >
                                          <SelectTrigger className="h-6 text-[11px] w-32" disabled={savingCanal === r.id}>
                                            <SelectValue placeholder="Canal" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="__none__">— Canal —</SelectItem>
                                            {canaisCobranca.map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                        <span className="tabular-nums font-semibold">R$ {fmt(r.valor)}</span>
                                        <span className="tabular-nums text-red-500 text-xs">−R$ {fmt(taxa)}</span>
                                        <span className="tabular-nums text-emerald-600 text-xs font-semibold">R$ {fmt(r.valor - taxa)}</span>
                                        {resps.length > 0 && (
                                          <span className="text-xs text-muted-foreground w-full pl-0.5">
                                            {resps.map(r2 => `${r2.nome_ref} ${r2.percentual}%`).join(' · ')}
                                          </span>
                                        )}
                                      </div>
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
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" /> Matrículas — {alunosHoje.length} nova{alunosHoje.length !== 1 ? 's' : ''}
                        {pendenteCount > 0 && (
                          <Badge className="ml-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">{pendenteCount} pendente{pendenteCount !== 1 ? 's' : ''}</Badge>
                        )}
                      </p>
                      {alunosHoje.length === 0 ? (
                        <Card className="p-6 text-center border-border/50 shadow-none">
                          <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado nesse período</p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {alunosHoje.map(aluno => {
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
                                      {/* Empresa destino */}
                                      <div>
                                        <label className="text-[10px] text-muted-foreground font-medium block mb-1">Adicionar ao balanço de</label>
                                        <div className="flex gap-1.5">
                                          {(['onze_digital', 'idm'] as Empresa[]).map(e => (
                                            <button
                                              key={e}
                                              onClick={() => setMatriculasDraft(prev => ({ ...prev, [aluno.id]: { ...prev[aluno.id], empresa: e } }))}
                                              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                                draft.empresa === e
                                                  ? EMPRESA_COR[e].badge + ' shadow-sm'
                                                  : 'bg-muted/40 text-muted-foreground border-border'
                                              }`}
                                            >
                                              {EMPRESA_LABELS[e]}
                                            </button>
                                          ))}
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
                                      {confirmados.has(aluno.id) && draft?.empresa && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${EMPRESA_COR[draft.empresa].badge}`}>
                                          ✓ {EMPRESA_LABELS[draft.empresa]}
                                        </span>
                                      )}
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

                    {/* Saídas do período */}
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

                  </>
                );
              })()}
            </div>
          )}

          {/* ────────────────── OVERVIEW ────────────────── */}
          {view === 'overview' && (
            <div className="space-y-5">

              {/* Banner: receita real do CRM vs lançamentos manuais */}
              {receitaRealTotal > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3">
                  <div className="flex items-start gap-2 mb-2">
                    <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-700">
                        Receita registrada no CRM — {mesLabel(mes)}
                      </p>
                      <p className="text-[11px] text-blue-500 mt-0.5">
                        Pagamentos com status='pago' em <code className="bg-blue-100 px-1 rounded">pagamentos</code> via <code className="bg-blue-100 px-1 rounded">vw_receita_por_fonte</code>. Compare com os lançamentos manuais abaixo.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-6">
                    {Object.values(receitaRealPorProduto).map(({ nome, total }) => (
                      <span key={nome} className="text-xs text-blue-700">
                        {nome}: <strong>R$ {fmt(total)}</strong>
                      </span>
                    ))}
                    <span className="text-xs font-bold text-blue-800 border-l border-blue-200 pl-3">
                      Total: R$ {fmt(receitaRealTotal)}
                    </span>
                  </div>
                  {Math.abs(receitaRealTotal - calc.receita_bruta) > 1 && calc.receita_bruta > 0 && (
                    <div className="mt-2 pl-6 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      <p className="text-[11px] text-amber-700">
                        Divergência de R$ {fmt(Math.abs(receitaRealTotal - calc.receita_bruta))} em relação ao lançamento manual
                        {receitaRealTotal > calc.receita_bruta ? ' — há pagamentos no CRM não lançados no balanço' : ' — balanço tem entradas extras não refletidas no CRM'}.
                      </p>
                    </div>
                  )}
                </div>
              )}

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
            <div className="space-y-6">

              <TaxasPagamentoConfig produtos={produtos} taxas={taxasRates} onSaved={setTaxasRates} />
              <RepasseTurmasConfig turmas={turmasInfo} onSaved={reloadTurmaResponsaveis} />

              <Card className="p-5 border-border/60 shadow-none max-w-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Taxas Financeiras (flat, % da receita total)</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Estimativa simples de taxa sobre o total lançado manualmente aqui no Balanço. Para a taxa exata por forma de pagamento (usada no Fechamento), use o card "Taxas por Forma de Pagamento" acima.
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

              <Card className="p-5 border-border/60 shadow-none max-w-2xl">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Repartição entre Sócios (lucro da IDM)</p>
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
