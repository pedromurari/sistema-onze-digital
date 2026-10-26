import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Pause, Play, RefreshCw, TrendingUp, MousePointerClick, Users, DollarSign, AlertTriangle, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';

interface Campanha {
  id: string;
  nome: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';
  status_efetivo: string;
  objetivo: string;
  orcamento_diario: number | null;
  orcamento_diario_brl: number | null;
  orcamento_total: number | null;
  orcamento_total_brl: number | null;
  gasto: number;
  gasto_brl: number | null;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  alcance: number;
  leads: number;
  compras: number;
  custo_por_lead: number | null;
  custo_por_lead_brl: number | null;
}

interface Conta {
  id: string;
  nome: string;
  moeda: string;
  ativa?: boolean;
}

interface Cambio {
  moeda_origem: string;
  taxa: number;
  atualizado_em: string;
}

interface Conjunto {
  id: string;
  nome: string;
  status: string;
  orcamento_diario: number | null;
  orcamento_diario_brl: number | null;
  gasto: number;
  gasto_brl: number | null;
}

type PeriodoFiltro = 'hoje' | 'ontem' | '3' | '7' | '14' | '30' | 'personalizado';

function dataBrasil(offsetDias = 0) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + offsetDias);
  return data.toISOString().slice(0, 10);
}

function FiltroOrcamento({ id, tipo, valor, moeda, onSave, saving }: {
  id: string; tipo: 'campanha' | 'conjunto'; valor: number; moeda: string;
  onSave: (id: string, tipo: 'campanha' | 'conjunto', valor: number) => void; saving: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [entrada, setEntrada] = useState(String(valor));
  useEffect(() => { if (!editando) setEntrada(String(valor)); }, [editando, valor]);
  const salvar = () => {
    const numero = Number(entrada.replace(',', '.'));
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(entrada.trim()) || !Number.isFinite(numero) || numero < 1 || numero > 100000) {
      alert('Informe um orçamento diário válido entre 1 e 100.000, com até duas casas decimais.');
      return;
    }
    if (!window.confirm(`Alterar o orçamento diário deste ${tipo} de ${valor.toLocaleString('pt-BR', { style: 'currency', currency: moeda })} para ${numero.toLocaleString('pt-BR', { style: 'currency', currency: moeda })}?`)) return;
    onSave(id, tipo, numero);
    setEditando(false);
  };
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className="text-gray-500">Orçamento diário:</span>
    {editando ? <><input aria-label={`Novo orçamento diário do ${tipo}`} type="text" inputMode="decimal" value={entrada} onChange={e => setEntrada(e.target.value)} className="w-28 rounded border px-2 py-1 text-gray-900" /><span>{moeda}</span><Button type="button" size="sm" disabled={saving} onClick={salvar}>Salvar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button></>
      : <button type="button" className="font-bold text-gray-900 underline underline-offset-2" disabled={saving} onClick={() => setEditando(true)} aria-label={`Editar orçamento diário do ${tipo}`}>{valor.toLocaleString('pt-BR', { style: 'currency', currency: moeda })}</button>}
  </div>;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR');

// Valor principal pra exibir: converte pra BRL quando a conta é estrangeira e a
// cotação do dia veio certa; senão mostra na moeda original da conta (nunca rotula
// dólar como real).
function valorPrincipal(nativo: number, brl: number | null, moeda: string) {
  return moeda === 'BRL' ? nativo : (brl ?? nativo);
}

function fmtPrincipal(nativo: number, brl: number | null, moeda: string) {
  if (moeda === 'BRL') return fmtBRL(nativo);
  if (brl !== null) return fmtBRL(brl);
  return nativo.toLocaleString('pt-BR', { style: 'currency', currency: moeda });
}

interface Produto {
  id: string;
  nome: string;
}

function CampanhaCard({ campanha, moeda, produtos, produtoId, onProdutoChange, onToggle, toggling, expanded, onToggleExpanded, conjuntos, conjuntosLoading, onBudget, budgetSaving }: {
  campanha: Campanha;
  moeda: string;
  produtos: Produto[];
  produtoId: string | null;
  onProdutoChange: (produtoId: string | null) => void;
  onToggle: (c: Campanha) => void;
  toggling: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  conjuntos?: Conjunto[];
  conjuntosLoading: boolean;
  onBudget: (id: string, tipo: 'campanha' | 'conjunto', valor: number) => void;
  budgetSaving: boolean;
}) {
  const ativa = campanha.status === 'ACTIVE';
  const custoPorLeadPrincipal = campanha.custo_por_lead !== null
    ? valorPrincipal(campanha.custo_por_lead, campanha.custo_por_lead_brl, moeda)
    : null;
  const cpaAlerta = custoPorLeadPrincipal !== null && custoPorLeadPrincipal > 30;

  if (!expanded) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow flex flex-wrap items-center gap-3">
        <button
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          <span className={`shrink-0 w-2 h-2 rounded-full ${ativa ? 'bg-green-500' : 'bg-gray-300'}`} />
          <p className="text-xs font-bold text-gray-900 truncate flex-1" title={campanha.nome}>{campanha.nome}</p>
          {cpaAlerta && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
        </button>
        <span className="text-xs text-gray-600">Gasto: {fmtPrincipal(campanha.gasto, campanha.gasto_brl, moeda)}</span>
        {custoPorLeadPrincipal !== null && <span className={`text-xs font-semibold ${cpaAlerta ? 'text-amber-600' : 'text-gray-600'}`}>Custo/lead: {fmtPrincipal(campanha.custo_por_lead!, campanha.custo_por_lead_brl, moeda)}</span>}
        <span className="text-xs text-gray-600">{campanha.orcamento_diario !== null ? `Orçamento: ${campanha.orcamento_diario.toLocaleString('pt-BR', { style: 'currency', currency: moeda })}/dia` : 'Orçamento nos conjuntos'}</span>
        <Button type="button" size="sm" variant="outline" disabled={toggling || campanha.status === 'ARCHIVED' || campanha.status === 'DELETED'} onClick={() => onToggle(campanha)} aria-label={`${ativa ? 'Pausar' : 'Ativar'} campanha ${campanha.nome}`}>
          {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ativa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {ativa ? 'Pausar' : 'Ativar'}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <button onClick={onToggleExpanded} className="flex items-start gap-1.5 min-w-0 text-left">
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate" title={campanha.nome}>{campanha.nome}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{campanha.objetivo.replace('OUTCOME_', '')}</p>
          </div>
        </button>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            ativa ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${ativa ? 'bg-green-500' : 'bg-gray-300'}`} />
          {ativa ? 'Ativa' : 'Pausada'}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><DollarSign className="h-3 w-3" />Gasto</p>
          <p className="text-sm font-bold text-gray-800">{fmtPrincipal(campanha.gasto, campanha.gasto_brl, moeda)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><MousePointerClick className="h-3 w-3" />Cliques</p>
          <p className="text-sm font-bold text-gray-800">{fmtNum(campanha.cliques)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><TrendingUp className="h-3 w-3" />CTR</p>
          <p className="text-sm font-bold text-gray-800">{campanha.ctr.toFixed(2)}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Users className="h-3 w-3" />Leads</p>
          <p className="text-sm font-bold text-gray-800">{fmtNum(campanha.leads)}</p>
        </div>
        <div className="text-center">
          <p className={`text-[10px] flex items-center justify-center gap-0.5 ${cpaAlerta ? 'text-amber-600' : 'text-gray-400'}`}><DollarSign className="h-3 w-3" />Custo/lead</p>
          <p className={`text-sm font-bold ${cpaAlerta ? 'text-amber-600' : 'text-gray-800'}`}>{custoPorLeadPrincipal !== null ? fmtPrincipal(campanha.custo_por_lead!, campanha.custo_por_lead_brl, moeda) : '—'}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Users className="h-3 w-3" />Compras</p>
          <p className="text-sm font-bold text-gray-800">{campanha.compras}</p>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-gray-50 p-3 space-y-3">
        {campanha.orcamento_diario !== null ? <FiltroOrcamento id={campanha.id} tipo="campanha" valor={campanha.orcamento_diario} moeda={moeda} onSave={onBudget} saving={budgetSaving} /> : <p className="text-xs text-gray-500">Esta campanha não tem orçamento diário próprio; edite o orçamento dos conjuntos abaixo.</p>}
        {conjuntosLoading ? <p className="text-xs text-gray-500">Carregando conjuntos...</p> : conjuntos?.map(conjunto => <div key={conjunto.id} className="border-t pt-2 space-y-1"><p className="text-xs font-semibold text-gray-800">{conjunto.nome}</p>{conjunto.orcamento_diario !== null ? <FiltroOrcamento id={conjunto.id} tipo="conjunto" valor={conjunto.orcamento_diario} moeda={moeda} onSave={onBudget} saving={budgetSaving} /> : <p className="text-xs text-gray-500">Sem orçamento diário neste conjunto.</p>}</div>)}
      </div>

      {cpaAlerta && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Custo por lead alto: {fmtPrincipal(campanha.custo_por_lead!, campanha.custo_por_lead_brl, moeda)}
        </div>
      )}

      <select
        value={produtoId ?? ''}
        onChange={(e) => onProdutoChange(e.target.value || null)}
        className="w-full mb-2 px-2 py-1.5 rounded-lg text-xs bg-gray-50 border border-gray-100 text-gray-600"
      >
        <option value="">Produto: sem tag</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>

      <Button
        size="sm"
        variant={ativa ? 'outline' : 'default'}
        className={`w-full gap-1.5 ${ativa ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'bg-green-600 hover:bg-green-700'}`}
        onClick={() => onToggle(campanha)}
        disabled={toggling || campanha.status === 'ARCHIVED' || campanha.status === 'DELETED'}
      >
        {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ativa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {ativa ? 'Pausar' : 'Ativar'}
      </Button>
    </div>
  );
}

export function MetaAdsPanel({ seletorConta = false }: { seletorConta?: boolean }) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [conta, setConta] = useState<Conta | null>(null);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('7');
  const [dataInicio, setDataInicio] = useState(dataBrasil(-6));
  const [dataFim, setDataFim] = useState(dataBrasil());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [budgetSavingId, setBudgetSavingId] = useState<string | null>(null);
  const [conjuntosPorCampanha, setConjuntosPorCampanha] = useState<Record<string, Conjunto[]>>({});
  const [conjuntosLoadingId, setConjuntosLoadingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tags, setTags] = useState<Record<string, string | null>>({});
  const [filtroStatus, setFiltroStatus] = useState<'ativas' | 'pausadas' | 'todas'>('ativas');
  const [filtroProduto, setFiltroProduto] = useState<string>('todos');

  useEffect(() => {
    if (!seletorConta) return;
    supabase.functions.invoke('meta-ads', { body: { action: 'contas' } }).then(({ data }) => {
      if (data?.ok) setContas(data.contas);
    });
  }, [seletorConta]);

  useEffect(() => {
    supabase.from('produtos').select('id, nome').order('nome').then(({ data }) => {
      if (data) setProdutos(data);
    });
  }, []);

  useEffect(() => {
    if (!conta?.id) return;
    supabase.from('trafego_campanha_produto').select('campanha_id, produto_id').eq('conta_id', conta.id).then(({ data }) => {
      if (data) setTags(Object.fromEntries(data.map((t) => [t.campanha_id, t.produto_id])));
    });
  }, [conta?.id]);

  const definirProduto = async (campanhaId: string, produtoId: string | null) => {
    setTags((prev) => ({ ...prev, [campanhaId]: produtoId }));
    await supabase.from('trafego_campanha_produto').upsert({
      campanha_id: campanhaId,
      conta_id: conta?.id ?? '',
      produto_id: produtoId,
      atualizado_em: new Date().toISOString(),
    });
  };

  const periodoBody = useCallback(() => periodo === 'personalizado'
    ? { since: dataInicio, until: dataFim }
    : periodo === 'ontem' ? { since: dataBrasil(-1), until: dataBrasil(-1) }
      : { dias: periodo === 'hoje' ? 1 : Number(periodo) }, [periodo, dataInicio, dataFim]);

  const toggleExpanded = (id: string) => {
    if (!expandedIds.has(id) && !conjuntosPorCampanha[id]) {
      setConjuntosLoadingId(id);
      supabase.functions.invoke('meta-ads', { body: { action: 'listar_conjuntos', campaign_id: id, ad_account_id: contaId, ...periodoBody() } })
        .then(({ data, error }) => { if (error || !data?.ok) alert(data?.error || error?.message || 'Não foi possível carregar conjuntos.'); else setConjuntosPorCampanha(prev => ({ ...prev, [id]: data.conjuntos })); })
        .finally(() => setConjuntosLoadingId(null));
    }
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const carregar = useCallback(async () => {
    if (periodo === 'personalizado' && (!dataInicio || !dataFim || dataInicio > dataFim || dataFim > dataBrasil())) {
      setErro('Confira as datas do intervalo personalizado.');
      return;
    }
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('meta-ads', {
      body: { action: 'listar', ...periodoBody(), ad_account_id: contaId },
    });
    if (error || !data?.ok) {
      setErro(data?.error || error?.message || 'Erro ao buscar campanhas da Meta');
      setCampanhas([]);
      setConta(null);
      setCambio(null);
    } else {
      setCampanhas(data.campanhas);
      setConta(data.conta ?? null);
      setCambio(data.cambio ?? null);
      setConjuntosPorCampanha({});
    }
    setLoading(false);
  }, [periodo, dataInicio, dataFim, contaId, periodoBody]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleCampanha = async (c: Campanha) => {
    const novoStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    if (!window.confirm(`${novoStatus === 'PAUSED' ? 'Pausar' : 'Ativar'} a campanha “${c.nome}” na Meta?`)) return;
    setTogglingId(c.id);
    const { data, error } = await supabase.functions.invoke('meta-ads', {
      body: { action: 'atualizar_status', campaign_id: c.id, status: novoStatus, ad_account_id: contaId },
    });
    if (error || !data?.ok) {
      alert(`Erro ao ${novoStatus === 'PAUSED' ? 'pausar' : 'ativar'} campanha: ${data?.error || error?.message}`);
    } else {
      setCampanhas(prev => prev.map(x => x.id === c.id ? { ...x, status: novoStatus, status_efetivo: novoStatus } : x));
    }
    setTogglingId(null);
  };

  const salvarOrcamento = async (id: string, tipo: 'campanha' | 'conjunto', valor: number) => {
    setBudgetSavingId(id);
    const { data, error } = await supabase.functions.invoke('meta-ads', { body: { action: 'atualizar_orcamento', id, tipo, centavos: Math.round(valor * 100), ad_account_id: contaId } });
    if (error || !data?.ok) alert(data?.error || error?.message || 'Falha ao alterar orçamento.');
    else {
      if (tipo === 'campanha') setCampanhas(prev => prev.map(c => c.id === id ? { ...c, orcamento_diario: valor, orcamento_diario_brl: cambio ? Math.round(valor * cambio.taxa * 100) / 100 : null } : c));
      else setConjuntosPorCampanha(prev => Object.fromEntries(Object.entries(prev).map(([key, conjuntos]) => [key, conjuntos.map(c => c.id === id ? { ...c, orcamento_diario: valor } : c)])));
    }
    setBudgetSavingId(null);
  };

  const ativasCount = campanhas.filter((c) => c.status === 'ACTIVE').length;
  const pausadasCount = campanhas.length - ativasCount;
  const campanhasFiltradas = campanhas
    .filter((c) => filtroStatus === 'todas' || (filtroStatus === 'ativas' ? c.status === 'ACTIVE' : c.status !== 'ACTIVE'))
    .filter((c) => filtroProduto === 'todos' || (filtroProduto === 'sem_tag' ? !tags[c.id] : tags[c.id] === filtroProduto))
    .sort((a, b) => (a.status === b.status ? b.gasto - a.gasto : a.status === 'ACTIVE' ? -1 : 1));

  const moeda = conta?.moeda ?? 'BRL';
  const totais = campanhas.reduce(
    (acc, c) => ({
      gasto: acc.gasto + valorPrincipal(c.gasto, c.gasto_brl, moeda),
      cliques: acc.cliques + c.cliques,
      compras: acc.compras + c.compras,
      leads: acc.leads + c.leads,
    }),
    { gasto: 0, cliques: 0, compras: 0, leads: 0 },
  );

  return (
    <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-black text-gray-900">Campanhas Meta Ads</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Conta: {conta?.nome ?? '...'} · {periodo === 'hoje' ? 'hoje' : periodo === 'ontem' ? 'ontem' : periodo === 'personalizado' ? `${dataInicio} a ${dataFim}` : `últimos ${periodo} dias`}
            {cambio && (
              <span className="ml-1">
                · convertido de {cambio.moeda_origem} (cotação de hoje: 1 {cambio.moeda_origem} = {fmtBRL(cambio.taxa)})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {seletorConta && contas.length > 0 && (
            <select
              value={contaId ?? ''}
              onChange={(e) => setContaId(e.target.value || undefined)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border-none"
            >
              <option value="">Conta padrão</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome} ({c.moeda})</option>
              ))}
            </select>
          )}
          {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['3', '3d'], ['7', '7d'], ['14', '14d'], ['30', '30d'], ['personalizado', 'Intervalo']] as const).map(([valor, label]) => (
            <button
              key={valor}
              onClick={() => setPeriodo(valor)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                periodo === valor ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {periodo === 'personalizado' && <><input type="date" aria-label="Data inicial" value={dataInicio} max={dataFim} onChange={e => setDataInicio(e.target.value)} className="rounded border px-2 py-1 text-xs" /><input type="date" aria-label="Data final" value={dataFim} min={dataInicio} max={dataBrasil()} onChange={e => setDataFim(e.target.value)} className="rounded border px-2 py-1 text-xs" /></>}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => carregar()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        {([
          ['ativas', `Ativas (${ativasCount})`],
          ['pausadas', `Pausadas (${pausadasCount})`],
          ['todas', `Todas (${campanhas.length})`],
        ] as const).map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltroStatus(valor)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filtroStatus === valor ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <select
          value={filtroProduto}
          onChange={(e) => setFiltroProduto(e.target.value)}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border-none"
        >
          <option value="todos">Produto: todos</option>
          <option value="sem_tag">Produto: sem tag</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>

      {erro && (
        <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 mb-4">
          {erro}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : campanhas.length === 0 && !erro ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhuma campanha encontrada no período.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
            <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Gasto total</p>
              <p className="text-xl font-black mt-1 text-gray-700">
                {moeda === 'BRL' || cambio ? fmtBRL(totais.gasto) : totais.gasto.toLocaleString('pt-BR', { style: 'currency', currency: moeda })}
              </p>
            </div>
            <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Cliques</p>
              <p className="text-xl font-black mt-1 text-gray-700">{fmtNum(totais.cliques)}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Leads</p>
              <p className="text-xl font-black mt-1 text-gray-700">{fmtNum(totais.leads)}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100">
              <p className="text-[11px] font-medium text-amber-700">Custo/lead</p>
              <p className="text-xl font-black mt-1 text-amber-700">
                {totais.leads > 0
                  ? (moeda === 'BRL' || cambio
                      ? fmtBRL(totais.gasto / totais.leads)
                      : (totais.gasto / totais.leads).toLocaleString('pt-BR', { style: 'currency', currency: moeda }))
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100">
              <p className="text-[11px] font-medium text-green-700">Compras (pixel)</p>
              <p className="text-xl font-black mt-1 text-green-700">{totais.compras}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
              <p className="text-[11px] font-medium text-blue-700">Custo/compra</p>
              <p className="text-xl font-black mt-1 text-blue-700">
                {totais.compras > 0
                  ? (moeda === 'BRL' || cambio
                      ? fmtBRL(totais.gasto / totais.compras)
                      : (totais.gasto / totais.compras).toLocaleString('pt-BR', { style: 'currency', currency: moeda }))
                  : '—'}
              </p>
            </div>
          </div>

          {campanhasFiltradas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma campanha com esse filtro.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {campanhasFiltradas.map(c => (
                <CampanhaCard
                  key={c.id}
                  campanha={c}
                  moeda={moeda}
                  produtos={produtos}
                  produtoId={tags[c.id] ?? null}
                  onProdutoChange={(produtoId) => definirProduto(c.id, produtoId)}
                  onToggle={toggleCampanha}
                  toggling={togglingId === c.id}
                  expanded={expandedIds.has(c.id)}
                  onToggleExpanded={() => toggleExpanded(c.id)}
                  conjuntos={conjuntosPorCampanha[c.id]}
                  conjuntosLoading={conjuntosLoadingId === c.id}
                  onBudget={salvarOrcamento}
                  budgetSaving={budgetSavingId !== null}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
