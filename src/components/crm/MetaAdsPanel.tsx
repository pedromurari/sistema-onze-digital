import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Pause, Play, RefreshCw, TrendingUp, MousePointerClick, Users, DollarSign, AlertTriangle } from 'lucide-react';

interface Campanha {
  id: string;
  nome: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';
  status_efetivo: string;
  objetivo: string;
  orcamento_diario: number | null;
  orcamento_total: number | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  alcance: number;
  leads: number;
  compras: number;
  custo_por_lead: number | null;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR');

// Detecta a qual turma/cidade a campanha pertence pelo nome (segue o padrão usado nos nomes das campanhas)
function cidadeDaCampanha(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes('curitiba')) return 'Curitiba';
  if (n.includes('sjc') || n.includes('são josé') || n.includes('sao jose')) return 'São José dos Campos';
  return 'Outras';
}

function CampanhaCard({ campanha, onToggle, toggling }: {
  campanha: Campanha;
  onToggle: (c: Campanha) => void;
  toggling: boolean;
}) {
  const ativa = campanha.status === 'ACTIVE';
  const cpaAlerta = campanha.custo_por_lead !== null && campanha.custo_por_lead > 30;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate" title={campanha.nome}>{campanha.nome}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{campanha.objetivo.replace('OUTCOME_', '')}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            ativa ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${ativa ? 'bg-green-500' : 'bg-gray-300'}`} />
          {ativa ? 'Ativa' : 'Pausada'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><DollarSign className="h-3 w-3" />Gasto</p>
          <p className="text-sm font-bold text-gray-800">{fmtBRL(campanha.gasto)}</p>
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
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Users className="h-3 w-3" />Compras</p>
          <p className="text-sm font-bold text-gray-800">{campanha.compras}</p>
        </div>
      </div>

      {cpaAlerta && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Custo por lead alto: {fmtBRL(campanha.custo_por_lead!)}
        </div>
      )}

      <Button
        size="sm"
        variant={ativa ? 'outline' : 'default'}
        className={`w-full gap-1.5 ${ativa ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'bg-green-600 hover:bg-green-700'}`}
        onClick={() => onToggle(campanha)}
        disabled={toggling}
      >
        {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ativa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {ativa ? 'Pausar' : 'Ativar'}
      </Button>
    </div>
  );
}

export function MetaAdsPanel() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState(7);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const carregar = useCallback(async (diasParam = dias) => {
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('meta-ads', {
      body: { action: 'listar', dias: diasParam },
    });
    if (error || !data?.ok) {
      setErro(data?.error || error?.message || 'Erro ao buscar campanhas da Meta');
      setCampanhas([]);
    } else {
      setCampanhas(data.campanhas);
    }
    setLoading(false);
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleCampanha = async (c: Campanha) => {
    const novoStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setTogglingId(c.id);
    const { data, error } = await supabase.functions.invoke('meta-ads', {
      body: { action: 'atualizar_status', campaign_id: c.id, status: novoStatus },
    });
    if (error || !data?.ok) {
      alert(`Erro ao ${novoStatus === 'PAUSED' ? 'pausar' : 'ativar'} campanha: ${data?.error || error?.message}`);
    } else {
      setCampanhas(prev => prev.map(x => x.id === c.id ? { ...x, status: novoStatus, status_efetivo: novoStatus } : x));
    }
    setTogglingId(null);
  };

  const grupos = new Map<string, Campanha[]>();
  for (const c of campanhas) {
    const cidade = cidadeDaCampanha(c.nome);
    grupos.set(cidade, [...(grupos.get(cidade) ?? []), c]);
  }

  const totais = campanhas.reduce(
    (acc, c) => ({
      gasto: acc.gasto + c.gasto,
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
          <p className="text-xs text-gray-400 mt-0.5">Conta: IDM Pelo Brasil · últimos {dias} dias</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                dias === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => carregar()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Gasto total</p>
              <p className="text-xl font-black mt-1 text-gray-700">{fmtBRL(totais.gasto)}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Cliques</p>
              <p className="text-xl font-black mt-1 text-gray-700">{fmtNum(totais.cliques)}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100">
              <p className="text-[11px] font-medium text-green-700">Compras (pixel)</p>
              <p className="text-xl font-black mt-1 text-green-700">{totais.compras}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
              <p className="text-[11px] font-medium text-blue-700">Custo/compra</p>
              <p className="text-xl font-black mt-1 text-blue-700">
                {totais.compras > 0 ? fmtBRL(totais.gasto / totais.compras) : '—'}
              </p>
            </div>
          </div>

          {[...grupos.entries()].map(([cidade, lista]) => (
            <div key={cidade} className="mb-5 last:mb-0">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">{cidade}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lista.map(c => (
                  <CampanhaCard key={c.id} campanha={c} onToggle={toggleCampanha} toggling={togglingId === c.id} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
