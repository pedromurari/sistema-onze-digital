// Utilitários financeiros — reutilizados por FinanceiroCFO e Balanco
// Cada função documenta sua FONTE (qual tabela/query alimenta o cálculo)

import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, addDays, addWeeks, addMonths,
  addQuarters, addYears, format,
} from 'date-fns';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Produto {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  ativo: boolean;
  ordem: number;
}

export interface TaxaDetalhe {
  id: string;
  produto_slug: string;       // 'psicanalise' | 'npa' | '*' (curinga = todos)
  forma_pagamento: string;    // 'boleto' | 'cartao' | 'pix' | 'avista' | '*'
  gateway: string;            // 'asaas' | 'vega' | 'stripe' | 'outros'
  percentual: number;         // ex: 2.99 = 2.99%
  fixo_por_transacao: number; // ex: 1.99 (Asaas cobra por boleto emitido)
  faixa_min: number;
  faixa_max: number;
  ativo: boolean;
  observacao?: string;
}

export interface PagamentoComFonte {
  id: string;
  aluno_id: string | null;
  turma_id: string | null;
  valor: number | null;
  status: string | null;
  data_pagamento: string | null;
  mes_referencia: string;
  numero_parcela: number | null;
  produto: string | null;
  forma_pagamento: string;    // vem do JOIN com alunos via vw_receita_por_fonte
  produto_label: string;      // 'PSI' | 'NPA' | nome do produto
}

export interface LiquidoProduto {
  bruto: number;
  taxas: number;
  liquido: number;
  count: number;
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

export const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const fmtBRLCompact = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmtBRL(v);

export const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// Converte 'YYYY-MM' → 'Jun/2026'
// Fonte: campo mes_referencia nos pagamentos e balanco_itens
export function mesLabel(mes: string): string {
  const [y, m] = mes.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomes[parseInt(m) - 1]}/${y}`;
}

// ─── Cálculo de taxa por transação ───────────────────────────────────────────
//
// FONTE: tabela payment_method_rates (banco de dados)
// LÓGICA: Encontra a regra mais específica que case com produto + forma + valor.
//   Prioridade: produto exato + forma exata (score 3)
//            > produto exato + forma '*'  (score 2)
//            > produto '*' + forma exata  (score 1)
//            > produto '*' + forma '*'    (score 0)
// RETORNO: valor em R$ da taxa para aquela transação (percentual + fixo)
export function calcTaxaTransacao(
  valor: number,
  produto: string,
  forma: string,
  taxas: TaxaDetalhe[]
): number {
  const candidatos = taxas.filter(t =>
    t.ativo &&
    (t.produto_slug === produto || t.produto_slug === '*') &&
    (t.forma_pagamento === forma   || t.forma_pagamento === '*') &&
    valor >= t.faixa_min &&
    valor <= t.faixa_max
  );
  if (!candidatos.length) return 0;

  const match = candidatos.sort((a, b) => {
    const scoreA = (a.produto_slug !== '*' ? 2 : 0) + (a.forma_pagamento !== '*' ? 1 : 0);
    const scoreB = (b.produto_slug !== '*' ? 2 : 0) + (b.forma_pagamento !== '*' ? 1 : 0);
    return scoreB - scoreA;
  })[0];

  return (valor * match.percentual / 100) + match.fixo_por_transacao;
}

// ─── Breakdown de líquido por produto ────────────────────────────────────────
//
// FONTE: vw_receita_por_fonte (JOIN pagamentos + alunos) × payment_method_rates
// RETORNO: mapa slug → { bruto, taxas, liquido, count } para um mês específico
export function calcLiquidoPorProduto(
  pagamentos: PagamentoComFonte[],
  taxas: TaxaDetalhe[],
  mesRef: string,
  getOwnerShare: (turmaId: string | null) => number
): Record<string, LiquidoProduto> {
  const resultado: Record<string, LiquidoProduto> = {};

  for (const p of pagamentos) {
    if (!p.mes_referencia?.startsWith(mesRef)) continue;
    const share = getOwnerShare(p.turma_id);
    if (share === 0) continue;

    const val  = (p.valor || 0) * share;
    const taxa = calcTaxaTransacao(
      p.valor || 0,
      p.produto || '',
      p.forma_pagamento,
      taxas
    ) * share;

    const slug = p.produto || 'outros';
    if (!resultado[slug]) resultado[slug] = { bruto: 0, taxas: 0, liquido: 0, count: 0 };
    resultado[slug].bruto   += val;
    resultado[slug].taxas   += taxa;
    resultado[slug].liquido += val - taxa;
    resultado[slug].count   += 1;
  }

  return resultado;
}

// ─── Totais consolidados ──────────────────────────────────────────────────────
//
// FONTE: derivado de calcLiquidoPorProduto
export function calcTotaisLiquido(liquido: Record<string, LiquidoProduto>) {
  const vals = Object.values(liquido);
  return {
    bruto:   vals.reduce((s, v) => s + v.bruto,   0),
    taxas:   vals.reduce((s, v) => s + v.taxas,   0),
    liquido: vals.reduce((s, v) => s + v.liquido, 0),
    count:   vals.reduce((s, v) => s + v.count,   0),
  };
}

// ─── Churn Rate mensal ────────────────────────────────────────────────────────
//
// FONTE: alunos com status='cancelado' no período
// FÓRMULA: cancelados_no_mês / total_início_mês × 100
// BENCHMARK: edtech saudável < 3%/mês; > 5% = ação urgente
export function calcChurnRate(canceladosNoMes: number, totalInicioMes: number): number {
  if (!totalInicioMes) return 0;
  return (canceladosNoMes / totalInicioMes) * 100;
}

// ─── Payback Period ───────────────────────────────────────────────────────────
//
// FONTE: CAC (input manual em metas) + MRR médio por aluno + gross margin estimada
// FÓRMULA: cac / (mrr_medio_por_aluno × gross_margin_pct / 100)
// BENCHMARK: edtech saudável ≤ 6 meses; < 3 meses = ótimo (Facebook Ads eficiente)
export function calcPaybackPeriod(cac: number, mrrMedio: number, grossMarginPct: number): number {
  const marginMensal = mrrMedio * (grossMarginPct / 100);
  if (!marginMensal) return 0;
  return cac / marginMensal;
}

// ─── LTV:CAC ratio ────────────────────────────────────────────────────────────
//
// FONTE: ltvMedio (calculado de alunos ativos) + cac (input manual)
// BENCHMARK: ≥ 3:1 = saudável; ≥ 5:1 = excelente (David Skok SaaS Metrics 2.0)
export function calcLtvCacRatio(ltvMedio: number, cac: number): number {
  if (!cac) return 0;
  return ltvMedio / cac;
}

// ─── Agrupamento semanal de receita ──────────────────────────────────────────
//
// FONTE: receitaDiaria (calculado de pagamentos.data_pagamento no CFO)
// RETORNO: array de { semana: 'dd/MM', [produto_slug]: number, total: number }
export function agruparReceitaSemanal(
  receitaDiaria: { data: string; valor: number }[],
  pagamentosComFonte: PagamentoComFonte[],
  slugsProdutos: string[]
): Array<Record<string, string | number>> {
  const map: Record<string, Record<string, number> & { semana: string; total: number }> = {};

  for (const { data, valor } of receitaDiaria) {
    const d   = new Date(data + 'T00:00:00');
    // Início da semana (segunda-feira)
    const dow = d.getDay();
    const diff = (dow === 0 ? -6 : 1 - dow);
    const ini = new Date(d);
    ini.setDate(d.getDate() + diff);
    const key = ini.toISOString().slice(0, 10);
    const semLabel = ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    if (!map[key]) {
      map[key] = { semana: semLabel, total: 0 };
      for (const s of slugsProdutos) map[key][s] = 0;
    }
    map[key].total += valor;
  }

  // Adicionar breakdown por produto
  for (const p of pagamentosComFonte) {
    if (!p.data_pagamento) continue;
    const d   = new Date(p.data_pagamento + 'T00:00:00');
    const dow = d.getDay();
    const diff = (dow === 0 ? -6 : 1 - dow);
    const ini = new Date(d);
    ini.setDate(d.getDate() + diff);
    const key = ini.toISOString().slice(0, 10);
    if (!map[key]) continue;
    const slug = p.produto || 'outros';
    if (slug in map[key]) (map[key][slug] as number) += p.valor || 0;
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([, v]) => v);
}

// ─── Agrupamento mensal de receita ────────────────────────────────────────────
//
// FONTE: vw_receita_por_fonte agrupado por mes_referencia
// RETORNO: array de { mes: 'Jun/2026', [produto_slug]: number, total: number }
export function agruparReceitaMensal(
  pagamentosComFonte: PagamentoComFonte[],
  slugsProdutos: string[],
  getOwnerShare: (turmaId: string | null) => number
): Array<Record<string, string | number>> {
  const map: Record<string, Record<string, number> & { mes: string; total: number }> = {};

  for (const p of pagamentosComFonte) {
    const ref = p.mes_referencia?.slice(0, 7);
    if (!ref) continue;
    if (!map[ref]) {
      map[ref] = { mes: mesLabel(ref), total: 0 };
      for (const s of slugsProdutos) map[ref][s] = 0;
    }
    const val  = (p.valor || 0) * getOwnerShare(p.turma_id);
    const slug = p.produto || 'outros';
    if (slug in map[ref]) (map[ref][slug] as number) += val;
    map[ref].total += val;
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => v);
}

// ─── Períodos de fechamento (Balanço) ─────────────────────────────────────────
//
// FONTE: usado por Balanco.tsx para filtrar pagamentos/vw_receita_por_fonte
// por qualquer período (dia/semana/mês/trimestre/semestre/ano), e como chave
// única do snapshot travado em `fechamentos.periodo_key`.

export type PeriodoTipo = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'ano';

const PERIODO_TIPO_LABELS: Record<PeriodoTipo, string> = {
  dia: 'Dia', semana: 'Semana', mes: 'Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Ano',
};

export function periodoTipoLabel(tipo: PeriodoTipo): string {
  return PERIODO_TIPO_LABELS[tipo];
}

function semestreDeAno(d: Date): { inicio: Date; fim: Date; numero: 1 | 2 } {
  const ano = d.getFullYear();
  return d.getMonth() < 6
    ? { inicio: new Date(ano, 0, 1), fim: new Date(ano, 5, 30), numero: 1 }
    : { inicio: new Date(ano, 6, 1), fim: new Date(ano, 11, 31), numero: 2 };
}

export interface PeriodoRange {
  start: string;  // 'yyyy-MM-dd' — início do período (inclusive)
  end: string;    // 'yyyy-MM-dd' — fim do período (inclusive)
  label: string;  // rótulo amigável pra exibir na UI
  key: string;    // identificador único — vira fechamentos.periodo_key
}

export function getPeriodRange(tipo: PeriodoTipo, ref: Date = new Date()): PeriodoRange {
  switch (tipo) {
    case 'dia': {
      const d = startOfDay(ref);
      const iso = format(d, 'yyyy-MM-dd');
      return { start: iso, end: iso, label: format(d, 'dd/MM/yyyy'), key: iso };
    }
    case 'semana': {
      const s = startOfWeek(ref, { weekStartsOn: 1 });
      const e = endOfWeek(ref, { weekStartsOn: 1 });
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: `${format(s, 'dd/MM')} a ${format(e, 'dd/MM/yyyy')}`, key: format(s, 'yyyy-MM-dd') };
    }
    case 'mes': {
      const s = startOfMonth(ref);
      const e = endOfMonth(ref);
      const chave = format(s, 'yyyy-MM');
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: mesLabel(chave), key: chave };
    }
    case 'trimestre': {
      const s = startOfQuarter(ref);
      const e = endOfQuarter(ref);
      const q = Math.floor(s.getMonth() / 3) + 1;
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: `${q}º trimestre/${s.getFullYear()}`, key: `${s.getFullYear()}-Q${q}` };
    }
    case 'semestre': {
      const { inicio, fim, numero } = semestreDeAno(ref);
      return { start: format(inicio, 'yyyy-MM-dd'), end: format(fim, 'yyyy-MM-dd'), label: `${numero}º semestre/${inicio.getFullYear()}`, key: `${inicio.getFullYear()}-S${numero}` };
    }
    case 'ano': {
      const s = startOfYear(ref);
      const e = endOfYear(ref);
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), label: `${s.getFullYear()}`, key: `${s.getFullYear()}` };
    }
  }
}

// Navega pro período anterior/seguinte do mesmo tipo a partir de uma data
// de referência dentro do período atual (usado pelas setas ‹ › da Balanço).
export function shiftPeriodo(tipo: PeriodoTipo, ref: Date, direcao: 1 | -1): Date {
  switch (tipo) {
    case 'dia':       return addDays(ref, direcao);
    case 'semana':    return addWeeks(ref, direcao);
    case 'mes':       return addMonths(ref, direcao);
    case 'trimestre': return addQuarters(ref, direcao);
    case 'semestre':  return addMonths(ref, direcao * 6);
    case 'ano':       return addYears(ref, direcao);
  }
}

// ─── Repasse por turma ────────────────────────────────────────────────────────
//
// FONTE: turma_responsaveis (turma_id, user_id → responsaveis.id, percentual)
// LÓGICA: cada turma pode ter N responsáveis com % somando até 100; o que
// sobra até 100% fica retido pelo IDM. RETORNO: quanto cada responsável
// recebe sobre o líquido gerado no período, e quanto fica com o IDM.

export interface ResponsavelRow { id: string; nome: string; ativo?: boolean; email?: string | null; }
export interface TurmaResponsavelRow { id: string; turma_id: string; user_id: string | null; nome_ref: string | null; percentual: number; }

export interface RepasseCalculado {
  responsavel_id: string | null;
  nome: string;
  percentual: number; // participação desse responsável no líquido total do período
  valor: number;
}

export interface RepasseResultado {
  repasses: RepasseCalculado[];
  percentualIdm: number;
  valorIdm: number;
}

// `liquidoPorTurma`: mapa turma_id → líquido gerado por essa turma no período
export function calcRepasses(
  liquidoPorTurma: Record<string, number>,
  turmaResponsaveis: TurmaResponsavelRow[],
  responsaveisList: ResponsavelRow[],
): RepasseResultado {
  const porResponsavel: Record<string, RepasseCalculado> = {};
  let totalLiquido = 0;
  let totalRepassado = 0;

  for (const [turmaId, liquido] of Object.entries(liquidoPorTurma)) {
    totalLiquido += liquido;
    for (const linha of turmaResponsaveis.filter(r => r.turma_id === turmaId)) {
      const nome = linha.nome_ref
        || responsaveisList.find(r => r.id === linha.user_id)?.nome
        || 'Sem nome';
      const key = linha.user_id || nome;
      const valor = liquido * (linha.percentual / 100);
      totalRepassado += valor;
      if (!porResponsavel[key]) porResponsavel[key] = { responsavel_id: linha.user_id, nome, percentual: 0, valor: 0 };
      porResponsavel[key].valor += valor;
    }
  }

  const valorIdm = totalLiquido - totalRepassado;
  for (const r of Object.values(porResponsavel)) {
    r.percentual = totalLiquido > 0 ? (r.valor / totalLiquido) * 100 : 0;
  }

  return {
    repasses: Object.values(porResponsavel).sort((a, b) => b.valor - a.valor),
    percentualIdm: totalLiquido > 0 ? (valorIdm / totalLiquido) * 100 : 100,
    valorIdm,
  };
}

// ─── Breakdown por forma de pagamento ────────────────────────────────────────
//
// FONTE: vw_receita_por_fonte agrupado por forma_pagamento
// RETORNO: array ordenado por valor decrescente
export function agruparReceitaPorMetodo(
  pagamentos: PagamentoComFonte[],
  mesRef: string,
  getOwnerShare: (turmaId: string | null) => number
): Array<{ forma: string; label: string; valor: number; pct: number }> {
  const LABELS: Record<string, string> = {
    boleto: 'Boleto', cartao: 'Cartão', pix: 'PIX', avista: 'À Vista / PIX',
  };
  const map: Record<string, number> = {};
  for (const p of pagamentos.filter(x => x.mes_referencia?.startsWith(mesRef))) {
    const forma = p.forma_pagamento || 'outros';
    map[forma] = (map[forma] || 0) + (p.valor || 0) * getOwnerShare(p.turma_id);
  }
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([forma, valor]) => ({
      forma,
      label: LABELS[forma] || forma,
      valor,
      pct: total > 0 ? (valor / total) * 100 : 0,
    }));
}
