import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePagamentos, useBalancoConfig } from '@/lib/db';
import { fmtBRL, fmtPct, PARAMETROS_CFO_DEFAULT, type ParametrosCfo } from '@/lib/financial-utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  const [mes, setMes] = useState(mesAtual);
  const { data: pagamentos = [], isLoading: loadingPag } = usePagamentos<PagamentoDre>(
    'id, produto, valor, mes_referencia, status, taxa_valor',
  );
  const { data: config } = useBalancoConfig<{ parametros_cfo: ParametrosCfo | null }>();
  const [itens, setItens] = useState<BalancoItemDre[]>([]);
  const [loadingItens, setLoadingItens] = useState(true);

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
    const margemPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;

    const despesasFixas = somaCat(CAT_DESPESA_FIXA, 'saida');
    const ebitda = margemContribuicao - despesasFixas;

    const naoOpSaida = somaCat(CAT_NAO_OP_SAIDA, 'saida');
    const outrasReceitas = somaCat(CAT_OUTRA_RECEITA, 'entrada');
    const resultado = ebitda - naoOpSaida + outrasReceitas;

    return {
      receitaBruta, receitaPorProduto: [...receitaPorProduto.entries()].sort((a, b) => b[1] - a[1]),
      impostos, impostoEstimado, taxasGateway, estornos, receitaLiquida,
      custosDiretos, custosDiretosLinhas: linhasCat(CAT_CUSTO_DIRETO, 'saida'),
      margemContribuicao, margemPct,
      despesasFixas, despesasFixasLinhas: linhasCat(CAT_DESPESA_FIXA, 'saida'),
      ebitda,
      naoOpSaida, naoOpLinhas: linhasCat(CAT_NAO_OP_SAIDA, 'saida'),
      outrasReceitas, outrasReceitasLinhas: linhasCat(CAT_OUTRA_RECEITA, 'entrada'),
      resultado,
      semDados: pagosDoMes.length === 0 && doMes.length === 0,
    };
  }, [pagamentos, itens, mes, parametrosCfo.impostos_pct]);

  const carregando = loadingPag || loadingItens;

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
      ) : dre.semDados ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          Sem receita paga nem lançamentos nesta competência.
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="text-sm divide-y divide-border/60">
            <Bloco titulo="Receita bruta" valor={dre.receitaBruta} tom="bom" total
              sub={dre.receitaPorProduto.map(([slug, v]) => ({ label: nomeProduto(slug), valor: v }))} />

            <Linha label="(–) Impostos" valor={-dre.impostos}
              nota={dre.impostoEstimado ? `estimado ${fmtPct(parametrosCfo.impostos_pct ?? 0)} — lance o DAS real em Balanço` : 'lançamento real (Balanço)'} />
            <Linha label="(–) Taxas de gateway" valor={-dre.taxasGateway}
              nota={dre.taxasGateway === 0 ? 'nenhuma taxa capturada ainda' : 'taxa real do Asaas'} />
            {dre.estornos > 0 && <Linha label="(–) Estornos / reembolsos" valor={-dre.estornos} />}

            <Linha label="= Receita líquida" valor={dre.receitaLiquida} total />

            <Bloco titulo="(–) Custos diretos" valor={-dre.custosDiretos}
              sub={dre.custosDiretosLinhas.map(([c, v]) => ({ label: LABEL_CATEGORIA[c] ?? c, valor: -v }))} />

            <Linha label="= Margem de contribuição" valor={dre.margemContribuicao} total
              nota={`${fmtPct(dre.margemPct)} da receita líquida`} />

            <Bloco titulo="(–) Despesas fixas" valor={-dre.despesasFixas}
              sub={dre.despesasFixasLinhas.map(([c, v]) => ({ label: LABEL_CATEGORIA[c] ?? c, valor: -v }))} />

            <Linha label="= EBITDA" valor={dre.ebitda} total forte />

            {(dre.naoOpSaida > 0 || dre.outrasReceitas > 0) && (
              <Bloco titulo="(±) Não operacional" valor={dre.outrasReceitas - dre.naoOpSaida}
                sub={[
                  ...dre.outrasReceitasLinhas.map(([c, v]) => ({ label: LABEL_CATEGORIA[c] ?? c, valor: v })),
                  ...dre.naoOpLinhas.map(([c, v]) => ({ label: LABEL_CATEGORIA[c] ?? c, valor: -v })),
                ]} />
            )}

            <Linha label="= Resultado líquido" valor={dre.resultado} total forte
              tom={dre.resultado >= 0 ? 'bom' : 'ruim'} />
          </div>

          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border/40 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Custos e despesas vêm dos lançamentos em <strong>Balanço → registrar gasto</strong> (por categoria e competência). Linha zerada = sem lançamento no mês.
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
