import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type LancamentoStatus = 'planejamento' | 'em_andamento' | 'finalizado';

interface Lancamento {
  id: string;
  nome: string;
  data_live?: string;
  status: LancamentoStatus;
  ativo: boolean;
  created_at: string;
}

interface Totais {
  totalLeads: number;
  noGrupo: number;
  grupoOferta: number;
  matriculados: number;
}

// ─── FunilConsolidado ───────────────────────────────────────────────────────
// "Semana do Despertar" — soma leads de todas as turmas. Só contagens agregadas
// (count-only, sem baixar linha nenhuma) porque cada turma sozinha já passa de
// mil leads.

function FunilConsolidado({ totais, loading }: { totais: Totais; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white">
      <div className="mb-4">
        <h1 className="text-xl font-black text-gray-900">Semana do Despertar</h1>
        <p className="text-xs text-gray-400 mt-0.5">Visão consolidada de todas as turmas</p>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-500">Leads únicos</p>
            <p className="text-2xl font-black mt-1 text-gray-700">{totais.totalLeads}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-medium text-blue-700">No grupo</p>
            <p className="text-2xl font-black mt-1 text-blue-700">{totais.noGrupo}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-pink-50 border border-pink-100">
            <p className="text-[11px] font-medium text-pink-700">Grupo de oferta</p>
            <p className="text-2xl font-black mt-1 text-pink-700">{totais.grupoOferta}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100">
            <p className="text-[11px] font-medium text-green-700">Matriculados</p>
            <p className="text-2xl font-black mt-1 text-green-700">{totais.matriculados}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LancamentoCard ─────────────────────────────────────────────────────────

function LancamentoCard({ lancamento, onOpen }: { lancamento: Lancamento; onOpen: () => void }) {
  const dataLabel = lancamento.data_live
    ? format(new Date(lancamento.data_live), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <button
      onClick={onOpen}
      className="group w-full text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-gray-900 truncate">{lancamento.nome}</p>
          {dataLabel && <p className="text-xs text-gray-400 mt-0.5">Live: {dataLabel}</p>}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            lancamento.ativo
              ? 'bg-green-50 text-green-700'
              : lancamento.status === 'finalizado'
              ? 'bg-gray-100 text-gray-500'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${lancamento.ativo ? 'bg-green-500' : 'bg-gray-300'}`} />
          {lancamento.ativo ? 'Ativo' : lancamento.status === 'finalizado' ? 'Finalizado' : 'Inativo'}
        </span>
      </div>
      <div className="flex items-center justify-end mt-3 text-xs font-medium text-gray-400 group-hover:text-gray-700 transition-colors">
        Ver turma
        <ArrowRight className="h-3.5 w-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}

// ─── LancamentosOverview (Visão Geral) ──────────────────────────────────────

export function LancamentosOverview({ onOpenLancamento }: { onOpenLancamento?: (id: string) => void }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [totais, setTotais] = useState<Totais>({ totalLeads: 0, noGrupo: 0, grupoOferta: 0, matriculados: 0 });
  const [loadingTotais, setLoadingTotais] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('lancamentos')
        .select('id, nome, data_live, status, ativo, created_at')
        .order('created_at', { ascending: false });
      if (data) setLancamentos(data as Lancamento[]);
      setLoading(false);
    };
    load();
  }, []);

  // Contagens agregadas — só count-only, nunca baixa a linha (turmas somam +1000 leads cada).
  useEffect(() => {
    const load = async () => {
      setLoadingTotais(true);
      const [total, noGrupo, grupoOferta, matriculados] = await Promise.all([
        supabase.from('lancamento_leads').select('id', { count: 'exact', head: true }),
        supabase.from('lancamento_leads').select('id', { count: 'exact', head: true }).eq('no_grupo', true),
        supabase.from('lancamento_leads').select('id', { count: 'exact', head: true }).eq('grupo_oferta', true),
        supabase.from('lancamento_leads').select('id', { count: 'exact', head: true }).eq('matriculado', true),
      ]);
      setTotais({
        totalLeads: total.count ?? 0,
        noGrupo: noGrupo.count ?? 0,
        grupoOferta: grupoOferta.count ?? 0,
        matriculados: matriculados.count ?? 0,
      });
      setLoadingTotais(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-gray-50/40">
      <FunilConsolidado totais={totais} loading={loadingTotais} />

      <div>
        <div className="mb-3">
          <h2 className="text-sm font-bold text-gray-800">Turmas</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {lancamentos.length} turma{lancamentos.length !== 1 ? 's' : ''} · {lancamentos.filter(l => l.ativo).length} ativa{lancamentos.filter(l => l.ativo).length !== 1 ? 's' : ''}
          </p>
        </div>

        {lancamentos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center bg-white">
            <p className="text-sm text-gray-400">Nenhuma turma ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {lancamentos.map(lancamento => (
              <LancamentoCard key={lancamento.id} lancamento={lancamento} onOpen={() => onOpenLancamento?.(lancamento.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
