import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Plus, AlertTriangle } from 'lucide-react';

interface Conta {
  id: string;
  nome: string;
  moeda: string;
}

interface Campanha {
  id: string;
  nome: string;
}

interface Conjunto {
  id: string;
  nome: string;
}

interface Produto {
  id: string;
  nome: string;
}

type EscopoTipo = 'conjunto' | 'campanha' | 'produto' | 'conta';
type Acao = 'pausar' | 'reduzir_orcamento' | 'aumentar_orcamento' | 'duplicar';

interface Regra {
  id: string;
  conta_id: string;
  escopo_tipo: EscopoTipo;
  escopo_valor: string | null;
  escopo_label?: string;
  metrica: 'custo_por_lead';
  limite: number;
  acao: Acao;
  valor_acao: number | null;
  ativa: boolean;
}

const LABEL_ACAO: Record<Acao, string> = {
  pausar: 'Pausar',
  reduzir_orcamento: 'Reduzir orçamento',
  aumentar_orcamento: 'Aumentar orçamento',
  duplicar: 'Duplicar (conjunto/criativo)',
};

const LABEL_ESCOPO: Record<EscopoTipo, string> = {
  conjunto: 'Conjunto de anúncios',
  campanha: 'Campanha inteira',
  produto: 'Produto',
  conta: 'Conta inteira',
};

export function RegrasAutomacao() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string>('');
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário de nova regra
  const [escopoTipo, setEscopoTipo] = useState<EscopoTipo>('conjunto');
  const [campanhaForm, setCampanhaForm] = useState('');
  const [conjuntos, setConjuntos] = useState<Conjunto[]>([]);
  const [carregandoConjuntos, setCarregandoConjuntos] = useState(false);
  const [escopoValor, setEscopoValor] = useState('');
  const [limite, setLimite] = useState('');
  const [acao, setAcao] = useState<Acao>('pausar');
  const [valorAcao, setValorAcao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.functions.invoke('meta-ads', { body: { action: 'contas' } }).then(({ data }) => {
      if (data?.ok) {
        setContas(data.contas);
        if (data.contas[0]) setContaId(data.contas[0].id);
      }
    });
    supabase.from('produtos').select('id, nome').order('nome').then(({ data }) => {
      if (data) setProdutos(data);
    });
  }, []);

  const carregarRegras = useCallback(async () => {
    if (!contaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('trafego_regras')
      .select('*')
      .eq('conta_id', contaId)
      .order('criado_em', { ascending: false });
    if (error) setErro(error.message);
    else setRegras(data as Regra[]);
    setLoading(false);
  }, [contaId]);

  useEffect(() => { carregarRegras(); }, [carregarRegras]);

  useEffect(() => {
    if (!contaId) return;
    supabase.functions.invoke('meta-ads', { body: { action: 'listar', dias: 7, ad_account_id: contaId } }).then(({ data }) => {
      if (data?.ok) setCampanhas(data.campanhas.map((c: any) => ({ id: c.id, nome: c.nome })));
    });
  }, [contaId]);

  useEffect(() => {
    setConjuntos([]);
    setEscopoValor('');
    if (escopoTipo !== 'conjunto' || !campanhaForm) return;
    setCarregandoConjuntos(true);
    supabase.functions.invoke('meta-ads', { body: { action: 'listar_conjuntos', campaign_id: campanhaForm, dias: 7, ad_account_id: contaId } })
      .then(({ data }) => {
        if (data?.ok) setConjuntos(data.conjuntos.map((c: any) => ({ id: c.id, nome: c.nome })));
        setCarregandoConjuntos(false);
      });
  }, [escopoTipo, campanhaForm, contaId]);

  const salvar = async () => {
    setErro(null);
    const limiteNum = Number(limite.replace(',', '.'));
    if (!limiteNum || limiteNum <= 0) { setErro('Informe um limite de custo por lead válido.'); return; }
    const precisaValor = acao === 'reduzir_orcamento' || acao === 'aumentar_orcamento';
    const valorAcaoNum = precisaValor ? Number(valorAcao.replace(',', '.')) : null;
    if (precisaValor && (!valorAcaoNum || valorAcaoNum <= 0)) { setErro('Informe o percentual de ajuste de orçamento.'); return; }
    if (escopoTipo !== 'conta' && !escopoValor) { setErro('Selecione o escopo da regra.'); return; }

    setSalvando(true);
    const { error } = await supabase.from('trafego_regras').insert({
      conta_id: contaId,
      escopo_tipo: escopoTipo,
      escopo_valor: escopoTipo === 'conta' ? null : escopoValor,
      metrica: 'custo_por_lead',
      limite: limiteNum,
      acao,
      valor_acao: valorAcaoNum,
      ativa: true,
    });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setLimite(''); setValorAcao(''); setEscopoValor(''); setCampanhaForm('');
    carregarRegras();
  };

  const alternarAtiva = async (r: Regra) => {
    await supabase.from('trafego_regras').update({ ativa: !r.ativa }).eq('id', r.id);
    setRegras((prev) => prev.map((x) => x.id === r.id ? { ...x, ativa: !x.ativa } : x));
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta regra?')) return;
    await supabase.from('trafego_regras').delete().eq('id', id);
    setRegras((prev) => prev.filter((x) => x.id !== id));
  };

  const nomeEscopo = (r: Regra) => {
    if (r.escopo_tipo === 'conta') return 'Conta inteira';
    if (r.escopo_tipo === 'produto') return produtos.find((p) => p.id === r.escopo_valor)?.nome ?? r.escopo_valor;
    if (r.escopo_tipo === 'campanha') return campanhas.find((c) => c.id === r.escopo_valor)?.nome ?? r.escopo_valor;
    return r.escopo_valor; // conjunto: não temos cache do nome fora do form de criação
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-gray-50/40">
      <div>
        <h1 className="text-xl font-black text-gray-900">Regras de Automação</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configuração do limite de custo por lead e da ação ao bater o limite. <strong>Isso só cadastra a
          regra</strong> — a execução automática (um robô rodando sozinho) é a próxima etapa, ainda não existe.
          Por enquanto as ações têm que ser feitas manualmente no Gestor de Tráfego quando uma regra disparar.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Orçamento e decisão de "deu certo" vivem no <strong>conjunto de anúncios</strong> (1 criativo por
          conjunto, orçamento no conjunto) — não na campanha. Prefira escopo "Conjunto de anúncios" pra regras
          de orçamento.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 shadow-sm bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-black text-gray-900 flex-1">Nova regra</h2>
          <select
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border-none"
          >
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Escopo</label>
            <select
              value={escopoTipo}
              onChange={(e) => { setEscopoTipo(e.target.value as EscopoTipo); setEscopoValor(''); setCampanhaForm(''); }}
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
            >
              {(Object.keys(LABEL_ESCOPO) as EscopoTipo[]).map((t) => (
                <option key={t} value={t}>{LABEL_ESCOPO[t]}</option>
              ))}
            </select>
          </div>

          {escopoTipo === 'produto' && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Produto</label>
              <select
                value={escopoValor}
                onChange={(e) => setEscopoValor(e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
              >
                <option value="">Selecione...</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}

          {(escopoTipo === 'campanha' || escopoTipo === 'conjunto') && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Campanha</label>
              <select
                value={campanhaForm}
                onChange={(e) => { setCampanhaForm(e.target.value); if (escopoTipo === 'campanha') setEscopoValor(e.target.value); }}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
              >
                <option value="">Selecione...</option>
                {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}

          {escopoTipo === 'conjunto' && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Conjunto de anúncios</label>
              <select
                value={escopoValor}
                onChange={(e) => setEscopoValor(e.target.value)}
                disabled={!campanhaForm || carregandoConjuntos}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100 disabled:opacity-50"
              >
                <option value="">{carregandoConjuntos ? 'Carregando...' : 'Selecione...'}</option>
                {conjuntos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500">Custo por lead limite (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              placeholder="Ex: 30"
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">Ação ao bater o limite</label>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value as Acao)}
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
            >
              {(Object.keys(LABEL_ACAO) as Acao[]).map((a) => (
                <option key={a} value={a}>{LABEL_ACAO[a]}</option>
              ))}
            </select>
          </div>

          {(acao === 'reduzir_orcamento' || acao === 'aumentar_orcamento') && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Percentual de ajuste (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={valorAcao}
                onChange={(e) => setValorAcao(e.target.value)}
                placeholder="Ex: 20"
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-100"
              />
            </div>
          )}
        </div>

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <Button size="sm" className="gap-1.5" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Salvar regra
        </Button>
      </div>

      <div className="rounded-2xl border border-gray-100 shadow-sm bg-white p-5">
        <h2 className="text-base font-black text-gray-900 mb-3">Regras cadastradas</h2>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
        ) : regras.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma regra cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {regras.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                <button
                  onClick={() => alternarAtiva(r)}
                  className={`shrink-0 w-2 h-2 rounded-full ${r.ativa ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={r.ativa ? 'Ativa — clique pra desativar' : 'Inativa — clique pra ativar'}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {LABEL_ESCOPO[r.escopo_tipo]}: {nomeEscopo(r) ?? '—'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Custo por lead &gt; R$ {r.limite.toFixed(2)} → {LABEL_ACAO[r.acao]}
                    {r.valor_acao ? ` (${r.valor_acao}%)` : ''}
                  </p>
                </div>
                <button onClick={() => excluir(r.id)} className="shrink-0 p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
