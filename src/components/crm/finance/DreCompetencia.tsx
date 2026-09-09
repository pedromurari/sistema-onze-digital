import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Loader2, Lock, LockOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePagamentos, useBalancoConfig } from '@/lib/db';
import { fmtBRL, fmtPct, PARAMETROS_CFO_DEFAULT, type ParametrosCfo } from '@/lib/financial-utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const EMPRESA = 'onze_digital';

interface DreFechamento {
  mes: string;
  receita_bruta: number;
  receita_por_produto: [string, number][];
  impostos: number;
  imposto_estimado: boolean;
  taxas_gateway: number;
  estornos: number;
  receita_liquida: number;
  custos_diretos: number;
  custos_diretos_linhas: { label: string; valor: number }[];
  margem_contribuicao: number;
  despesas_fixas: number;
  despesas_fixas_linhas: { label: string; valor: number }[];
  ebitda: number;
  nao_operacional: number;
  nao_op_linhas: { label: string; valor: number }[];
  resultado: number;
  fechado_em: string;
  fechado_por: string | null;
  reaberto_em: string | null;
}

/**
 * DRE por competência (Fase 2 da estruturação do financeiro -- ver docs/FINANCEIRO.md).
 *
 * Regime de COMPETÊNCIA: a receita entra no mês da parcela (`mes_referencia`),
 * não no dia em que o dinheiro caiu. Só conta parcela paga.
 *
 * Fontes:
 *   - Receita bruta ............ Σ pagamentos.valor (status=pago) por mes_referencia
 *   - (–) Taxas de gateway ..... Σ pagamentos.taxa_valor REAL (gravado pelo webhook
 *                                do Asaas quando o boleto é pago)
 *   - (–) Impostos ............. balanco_itens categoria 'imposto' do mês (o DAS real
 *                                lançado). Sem lançamento, cai no % de
 *                                balanco_config.parametros_cfo.impostos_pct
 *   - Demais linhas ........... balanco_itens agrupado pelas categorias do plano de
 *                                contas v1, por data_competencia (fallback mes_referencia)
 *
 * Ainda NÃO fecha o mês (snapshot) nem exporta pra contabilidade -- Fase 2.2/2.3.
 */

interface PagamentoDre {
  id: string;
  produto: string | null;
  valor: number | null;
  mes_referencia: string;
  status: string | null;
  taxa_valor: number | null;
}

interface BalancoItemDre {
  id: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  categoria: string;
  produto: string | null;
  mes_referencia: string | null;
  data_competencia: string | null;
  descricao: string;
}

const LABEL_PRODUTO: Record<string, string> = {
  psicanalise: 'Psicanálise', numerologia: 'Numerologia', npa: 'NPA', nps: 'NPS',
  workshop: 'Workshop', 'pnl-practitioner': 'PNL Practitioner', 'pnl-master': 'PNL Master',
  'idm-pelo-brasil': 'IDM pelo Brasil', 'mapa-numerologico': 'Mapa Numerológico',
};
const nomeProduto = (slug?: string | null) => LABEL_PRODUTO[slug ?? ''] ?? (slug || 'Outro');

const LABEL_CATEGORIA: Record<string, string> = {
  receita_curso: 'Receita de curso', matricula: 'Matrícula', receita_outra: 'Outra receita',
  imposto: 'Impostos (DAS/Simples)', taxa_gateway: 'Taxas de gateway', estorno: 'Estornos / reembolsos',
  comissao: 'Comissão de vendedores', repasse_investidor: 'Repasse a investidores', custo_produto: 'Custo de produto',
  pro_labore: 'Pró-labore', folha: 'Folha / prestadores', software: 'Software / infra',
  contabilidade: 'Contabilidade', ads: 'Marketing / Ads', adm: 'Administrativas',
  financeiro: 'Resultado financeiro', investimento: 'Investimentos', distribuicao_lucro: 'Distribuição de lucro',
  custo_fixo: 'Custo fixo (legado)', custo_variavel: 'Custo variável (legado)', alocacao: 'Alocação (legado)',
  outro_entrada: 'Outra entrada (legado)', outro_saida: 'Outra saída (legado)',
};

// Quais categorias de balanco_itens entram em cada bloco do DRE.
const CAT_CUSTO_DIRETO = ['comissao', 'repasse_investidor', 'custo_produto', 'custo_variavel'] as const;
const CAT_DESPESA_FIXA = ['pro_labore', 'folha', 'software', 'contabilidade', 'ads', 'adm', 'custo_fixo'] as const;
const CAT_NAO_OP_SAIDA = ['financeiro', 'investimento', 'distribuicao_lucro', 'alocacao', 'outro_saida'] as const;
const CAT_OUTRA_RECEITA = ['receita_outra', 'matricula', 'outro_entrada'] as const;

const mesAtual = () => new Date().toISOString().slice(0, 7);
const rotuloMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const shiftMes = (ym: string, delta: number) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function DreCompetencia() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesAtual);
  const { data: pagamentos = [], isLoading: loadingPag } = usePagamentos<PagamentoDre>(
    'id, produto, valor, mes_referencia, status, taxa_valor',
  );
  const { data: config } = useBalancoConfig<{ parametros_cfo: ParametrosCfo | null }>();
  const [itens, setItens] = useState<BalancoItemDre[]>([]);
  const [loadingItens, setLoadingItens] = useState(true);
  const [fechamento, setFechamento] = useState<DreFechamento | null>(null);
  const [salvandoFechamento, setSalvandoFechamento] = useState(false);

  useEffect(() => {
    setLoadingItens(true);
    supabase
      .from('balanco_itens')
      .select('id, valor, tipo, categoria, produto, mes_referencia, data_competencia, descricao')
      .then(({ data }) => {
        setItens((data ?? []) as BalancoItemDre[]);
        setLoadingItens(false);
      });
  }, []);

  const carregarFechamento = useCallback(async () => {
    const { data } = await supabase
      .from('dre_fechamentos')
      .select('*')
      .eq('empresa', EMPRESA)
      .eq('mes', mes)
      .maybeSingle();
    setFechamento((data as unknown as DreFechamento) ?? null);
  }, [mes]);

  useEffect(() => { carregarFechamento(); }, [carregarFechamento]);

  const parametrosCfo = { ...PARAMETROS_CFO_DEFAULT, ...(config?.parametros_cfo ?? {}) };

  const dre = useMemo(() => {
    // ── Receita bruta por produto (competência = mes_referencia da parcela paga) ──
    const pagosDoMes = pagamentos.filter(
      (p) => p.status === 'pago' && (p.mes_referencia ?? '').slice(0, 7) === mes,
    );
    const receitaPorProduto = new Map<string, number>();
    let receitaBruta = 0;
    let taxasGateway = 0;
    for (const p of pagosDoMes) {
      const v = Number(p.valor) || 0;
      receitaBruta += v;
      receitaPorProduto.set(p.produto ?? 'outro', (receitaPorProduto.get(p.produto ?? 'outro') ?? 0) + v);
      taxasGateway += Number(p.taxa_valor) || 0;
    }

    // ── balanco_itens do mês (competência) ──────────────────────────────────────
    const doMes = itens.filter((i) => {
      const comp = (i.data_competencia ?? i.mes_referencia ?? '').slice(0, 7);
      return comp === mes;
    });
    const somaCat = (cats: readonly string[], tipo: 'entrada' | 'saida') =>
      doMes.filter((i) => i.tipo === tipo && cats.includes(i.categoria)).reduce((s, i) => s + (Number(i.valor) || 0), 0);
    const linhasCat = (cats: readonly string[], tipo: 'entrada' | 'saida') => {
      const m = new Map<string, number>();
      for (const i of doMes) {
        if (i.tipo !== tipo || !cats.includes(i.categoria)) continue;
        m.set(i.categoria, (m.get(i.categoria) ?? 0) + (Number(i.valor) || 0));
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    // Impostos: lançamento real 'imposto' do mês; se não houver, aplica o % de config.
    const impostoLancado = somaCat(['imposto'], 'saida');
    const impostoPct = (parametrosCfo.impostos_pct ?? 0) / 100;
    const impostos = impostoLancado > 0 ? impostoLancado : receitaBruta * impostoPct;
    const impostoEstimado = impostoLancado === 0 && receitaBruta > 0;

    const estornos = somaCat(['estorno'], 'saida');
    const receitaLiquida = receitaBruta - impostos - taxasGateway - estornos;

    const custosDiretos = somaCat(CAT_CUSTO_DIRETO, 'saida');
    const margemContribuicao = receitaLiquida - custosDiretos;

    const despesasFixas = somaCat(CAT_DESPESA_FIXA, 'saida');
    const ebitda = margemContribuicao - despesasFixas;

    const naoOpSaida = somaCat(CAT_NAO_OP_SAIDA, 'saida');
    const outrasReceitas = somaCat(CAT_OUTRA_RECEITA, 'entrada');
    const resultado = ebitda - naoOpSaida + outrasReceitas;

    const rotular = (linhas: [string, number][], sinal: 1 | -1) =>
      linhas.map(([c, val]) => ({ label: LABEL_CATEGORIA[c] ?? c, valor: sinal * val }));

    return {
      receita_bruta: receitaBruta,
      receita_por_produto: [...receitaPorProduto.entries()].sort((a, b) => b[1] - a[1]) as [string, number][],
      impostos, imposto_estimado: impostoEstimado, taxas_gateway: taxasGateway, estornos,
      receita_liquida: receitaLiquida,
      custos_diretos: custosDiretos,
      custos_diretos_linhas: rotular(linhasCat(CAT_CUSTO_DIRETO, 'saida'), -1),
      margem_contribuicao: margemContribuicao,
      despesas_fixas: despesasFixas,
      despesas_fixas_linhas: rotular(linhasCat(CAT_DESPESA_FIXA, 'saida'), -1),
      ebitda,
      nao_operacional: outrasReceitas - naoOpSaida,
      nao_op_linhas: [
        ...rotular(linhasCat(CAT_OUTRA_RECEITA, 'entrada'), 1),
        ...rotular(linhasCat(CAT_NAO_OP_SAIDA, 'saida'), -1),
      ],
      resultado,
      semDados: pagosDoMes.length === 0 && doMes.length === 0,
    };
  }, [pagamentos, itens, mes, parametrosCfo.impostos_pct]);

  const carregando = loadingPag || loadingItens;
  const fechado = !!fechamento && !fechamento.reaberto_em;
  // O que a tela mostra: o snapshot fechado, ou o cálculo ao vivo.
  const v = fechado ? fechamento! : dre;
  const margemPct = v.receita_liquida > 0 ? (v.margem_contribuicao / v.receita_liquida) * 100 : 0;

  async function fecharMes() {
    setSalvandoFechamento(true);
    const payload = {
      empresa: EMPRESA, mes,
      receita_bruta: dre.receita_bruta, receita_por_produto: dre.receita_por_produto,
      impostos: dre.impostos, imposto_estimado: dre.imposto_estimado,
      taxas_gateway: dre.taxas_gateway, estornos: dre.estornos, receita_liquida: dre.receita_liquida,
      custos_diretos: dre.custos_diretos, custos_diretos_linhas: dre.custos_diretos_linhas,
      margem_contribuicao: dre.margem_contribuicao,
      despesas_fixas: dre.despesas_fixas, despesas_fixas_linhas: dre.despesas_fixas_linhas,
      ebitda: dre.ebitda, nao_operacional: dre.nao_operacional, nao_op_linhas: dre.nao_op_linhas,
      resultado: dre.resultado,
      fechado_em: new Date().toISOString(), fechado_por: user?.nome ?? null, reaberto_em: null,
    };
    const { error } = await supabase.from('dre_fechamentos').upsert(payload, { onConflict: 'empresa,mes' });
    setSalvandoFechamento(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao fechar', description: error.message }); return; }
    toast({ title: `${rotuloMes(mes)} fechado` });
    carregarFechamento();
  }

  async function reabrirMes() {
    if (!fechamento) return;
    setSalvandoFechamento(true);
    const { error } = await supabase.from('dre_fechamentos').update({ reaberto_em: new Date().toISOString() }).eq('empresa', EMPRESA).eq('mes', mes);
    setSalvandoFechamento(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao reabrir', description: error.message }); return; }
    toast({ title: `${rotuloMes(mes)} reaberto` });
    carregarFechamento();
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto pb-20 lg:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">DRE por competência</h1>
          <p className="text-xs text-muted-foreground">Receita reconhecida no mês da parcela, não no caixa. Só parcela paga.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setMes((m) => shiftMes(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium capitalize min-w-[9rem] text-center">{rotuloMes(mes)}</span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={mes >= mesAtual()} onClick={() => setMes((m) => shiftMes(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {carregando ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : (!fechado && dre.semDados) ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          Sem receita paga nem lançamentos nesta competência.
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-border/60">
            {fechado ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge className="bg-emerald-100 text-emerald-800 gap-1"><Lock className="h-3 w-3" /> Fechado</Badge>
                  {fechamento?.fechado_em && <span>em {new Date(fechamento.fechado_em).toLocaleDateString('pt-BR')}{fechamento.fechado_por ? ` por ${fechamento.fechado_por}` : ''}</span>}
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={reabrirMes} disabled={salvandoFechamento}>
                  <LockOpen className="h-3.5 w-3.5" /> Reabrir
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  {fechamento?.reaberto_em ? `Reaberto em ${new Date(fechamento.reaberto_em).toLocaleDateString('pt-BR')} — cálculo ao vivo` : 'Cálculo ao vivo'}
                </span>
                <Button size="sm" className="gap-1.5 text-xs" onClick={fecharMes} disabled={salvandoFechamento || dre.semDados}>
                  <Lock className="h-3.5 w-3.5" /> {salvandoFechamento ? 'Fechando…' : 'Fechar mês'}
                </Button>
              </>
            )}
          </div>

          <div className="text-sm divide-y divide-border/60">
            <Bloco titulo="Receita bruta" valor={v.receita_bruta} tom="bom" total
              sub={v.receita_por_produto.map(([slug, val]) => ({ label: nomeProduto(slug), valor: val }))} />

            <Linha label="(–) Impostos" valor={-v.impostos}
              nota={v.imposto_estimado ? `estimado ${fmtPct(parametrosCfo.impostos_pct ?? 0)} — lance o DAS real em Balanço` : 'lançamento real (Balanço)'} />
            <Linha label="(–) Taxas de gateway" valor={-v.taxas_gateway}
              nota={v.taxas_gateway === 0 ? 'nenhuma taxa capturada ainda' : 'taxa real do Asaas'} />
            {v.estornos > 0 && <Linha label="(–) Estornos / reembolsos" valor={-v.estornos} />}

            <Linha label="= Receita líquida" valor={v.receita_liquida} total />

            <Bloco titulo="(–) Custos diretos" valor={-v.custos_diretos} sub={v.custos_diretos_linhas} />

            <Linha label="= Margem de contribuição" valor={v.margem_contribuicao} total
              nota={`${fmtPct(margemPct)} da receita líquida`} />

            <Bloco titulo="(–) Despesas fixas" valor={-v.despesas_fixas} sub={v.despesas_fixas_linhas} />

            <Linha label="= EBITDA" valor={v.ebitda} total forte />

            {v.nao_op_linhas.length > 0 && (
              <Bloco titulo="(±) Não operacional" valor={v.nao_operacional} sub={v.nao_op_linhas} />
            )}

            <Linha label="= Resultado líquido" valor={v.resultado} total forte
              tom={v.resultado >= 0 ? 'bom' : 'ruim'} />
          </div>

          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border/40 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            {fechado
              ? 'Snapshot congelado — lançamentos posteriores não alteram este mês. Reabra para recalcular.'
              : <>Custos e despesas vêm dos lançamentos em <strong>Balanço → registrar gasto</strong> (por categoria e competência). Linha zerada = sem lançamento no mês.</>}
          </p>
        </Card>
      )}
    </div>
  );
}

// ── Linhas ────────────────────────────────────────────────────────────────────
function tomClasse(tom?: 'bom' | 'ruim' | 'padrao') {
  if (tom === 'bom') return 'text-emerald-700';
  if (tom === 'ruim') return 'text-red-600';
  return '';
}

function Linha({ label, valor, total, forte, nota, tom }: {
  label: string; valor: number; total?: boolean; forte?: boolean; nota?: string; tom?: 'bom' | 'ruim' | 'padrao';
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${total ? 'font-semibold' : ''} ${forte ? 'text-base' : ''}`}>
      <span className={total ? '' : 'text-muted-foreground'}>
        {label}
        {nota && <span className="ml-2 text-[11px] font-normal text-muted-foreground">· {nota}</span>}
      </span>
      <span className={`tabular-nums whitespace-nowrap ${tomClasse(tom)}`}>{fmtBRL(valor)}</span>
    </div>
  );
}

function Bloco({ titulo, valor, sub, tom, total }: {
  titulo: string; valor: number; sub: { label: string; valor: number }[]; tom?: 'bom' | 'ruim' | 'padrao'; total?: boolean;
}) {
  return (
    <div className="py-2">
      <div className={`flex items-baseline justify-between gap-3 ${total ? 'font-semibold' : 'text-muted-foreground'}`}>
        <span>{titulo}</span>
        <span className={`tabular-nums whitespace-nowrap ${tomClasse(tom)}`}>{fmtBRL(valor)}</span>
      </div>
      {sub.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-3">
          {sub.map((s, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span>{s.label}</span>
              <span className="tabular-nums">{fmtBRL(s.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
