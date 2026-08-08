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
  gateway: string;            // nome de public.canais_cobranca (ex: 'Voomp - Recorrência') | '*' (curinga = qualquer canal)
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
  canal_cobranca?: string | null;  // canal real escolhido na confirmação (vw_receita_por_fonte)
  taxa_valor?: number | null;      // taxa travada na confirmação, se houver (vw_receita_por_fonte)
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

// ─── Aluno ativo (canônico) ───────────────────────────────────────────────────
//
// FONTE: alunos.status + alunos.data_matricula
// REGRA: 'ativo' literal, OU 'pre_matricula' cuja data_matricula já chegou.
// Existe para não depender de um job/side-effect de escrita corrigir o status
// no banco antes de qualquer tela contar o aluno corretamente — é sempre
// derivado na leitura, a partir do dado bruto.
export interface AlunoStatusRow {
  status: string | null;
  data_matricula?: string | null;
}
export function isAlunoAtivo(aluno: AlunoStatusRow, hoje: Date = new Date()): boolean {
  if (aluno.status === 'ativo') return true;
  if (aluno.status !== 'pre_matricula' || !aluno.data_matricula) return false;
  const hojeStr = hoje.toISOString().slice(0, 10);
  return aluno.data_matricula <= hojeStr;
}

// ─── Pagamento realizado / filtro de período (canônico) ──────────────────────
//
// FONTE: pagamentos.status + pagamentos.data_pagamento
// Campo de data canônico da receita é data_pagamento (data real do caixa), não
// mes_referencia — um pagamento quitado com atraso deve contar no mês em que o
// dinheiro efetivamente entrou, não no mês da parcela original.
export interface PagamentoRealizadoRow {
  status: string | null;
  data_pagamento?: string | null;
}
export function isPagamentoRealizado(p: PagamentoRealizadoRow): boolean {
  return p.status === 'pago' && !!p.data_pagamento;
}

export function filtrarPagamentosPorPeriodo<T extends PagamentoRealizadoRow>(
  pagamentos: T[], inicio: string, fim: string
): T[] {
  return pagamentos.filter(p =>
    isPagamentoRealizado(p) && p.data_pagamento! >= inicio && p.data_pagamento! <= fim
  );
}

// ─── Inadimplência (canônica) ─────────────────────────────────────────────────
//
// FONTE: pagamentos.status + pagamentos.data_vencimento
// REGRA: 'atrasado' literal, OU 'pendente' com data_vencimento já passada — sem
// restrição de forma de pagamento (boleto/cartão/PIX contam igual). Filtros de
// elegibilidade do aluno (bolsa, cortesia, cancelado, etc.) são responsabilidade
// de quem chama — pré-filtre a lista de pagamentos antes de passar pra cá.
export interface PagamentoInadimplenteRow {
  aluno_id?: string | null;
  valor?: number | null;
  status: string | null;
  data_vencimento?: string | null;
}
export function isPagamentoInadimplente(p: PagamentoInadimplenteRow, hoje: Date = new Date()): boolean {
  if (p.status === 'atrasado') return true;
  if (p.status !== 'pendente' || !p.data_vencimento) return false;
  const hojeStr = hoje.toISOString().slice(0, 10);
  return p.data_vencimento < hojeStr;
}

export interface InadimplenciaResumo {
  count: number;
  valorTotal: number;
  porAluno: Record<string, { valor: number; parcelas: number }>;
}
export function calcInadimplencia(
  pagamentos: PagamentoInadimplenteRow[], hoje: Date = new Date()
): InadimplenciaResumo {
  const porAluno: Record<string, { valor: number; parcelas: number }> = {};
  let valorTotal = 0;
  for (const p of pagamentos) {
    if (!isPagamentoInadimplente(p, hoje)) continue;
    const val = p.valor || 0;
    valorTotal += val;
    if (p.aluno_id) {
      if (!porAluno[p.aluno_id]) porAluno[p.aluno_id] = { valor: 0, parcelas: 0 };
      porAluno[p.aluno_id].valor += val;
      porAluno[p.aluno_id].parcelas += 1;
    }
  }
  return { count: Object.keys(porAluno).length, valorTotal, porAluno };
}

// ─── MRR (canônico) ────────────────────────────────────────────────────────────
//
// FONTE: alunos (filtrados via isAlunoAtivo) + valor_mensalidade (aluno ou turma)
export interface AlunoMrrRow {
  id: string;
  turma_id?: string | null;
  status: string | null;
  data_matricula?: string | null;
  valor_mensalidade?: number | null;
}
export interface TurmaMrrRow {
  id: string;
  valor_mensalidade?: number | null;
}
export function calcMRR(
  alunos: AlunoMrrRow[],
  turmas: TurmaMrrRow[],
  getOwnerShare: (turmaId: string | null | undefined) => number,
  hoje: Date = new Date()
): number {
  return alunos.reduce((sum, a) => {
    if (!isAlunoAtivo(a, hoje)) return sum;
    const turma = turmas.find(t => t.id === a.turma_id);
    const val = a.valor_mensalidade ?? turma?.valor_mensalidade ?? 0;
    return sum + val * getOwnerShare(a.turma_id);
  }, 0);
}

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
// LÓGICA: Encontra a regra mais específica que case com produto + forma +
//   canal + valor. canal='' (ainda não escolhido, ex: estimativa antes da
//   confirmação) só casa com regras de canal curinga ('*') — regras de canal
//   específico exigem o canal exato.
//   Prioridade (score, do mais específico pro menos):
//     produto exato (+4) + forma exata (+2) + canal exato (+1)
// RETORNO: valor em R$ da taxa para aquela transação (percentual + fixo)
export function calcTaxaTransacao(
  valor: number,
  produto: string,
  forma: string,
  canal: string,
  taxas: TaxaDetalhe[]
): number {
  const candidatos = taxas.filter(t =>
    t.ativo &&
    (t.produto_slug === produto || t.produto_slug === '*') &&
    (t.forma_pagamento === forma   || t.forma_pagamento === '*') &&
    (t.gateway === canal || t.gateway === '*') &&
    valor >= t.faixa_min &&
    valor <= t.faixa_max
  );
  if (!candidatos.length) return 0;

  const match = candidatos.sort((a, b) => {
    const scoreA = (a.produto_slug !== '*' ? 4 : 0) + (a.forma_pagamento !== '*' ? 2 : 0) + (a.gateway !== '*' ? 1 : 0);
    const scoreB = (b.produto_slug !== '*' ? 4 : 0) + (b.forma_pagamento !== '*' ? 2 : 0) + (b.gateway !== '*' ? 1 : 0);
    return scoreB - scoreA;
  })[0];

  return (valor * match.percentual / 100) + match.fixo_por_transacao;
}

// ─── Taxa efetiva de um pagamento (canônica) ─────────────────────────────────
//
// Prefere a taxa travada em pagamentos.taxa_valor (gravada na confirmação —
// ver Balanco.tsx/Financeiro.tsx); só recalcula ao vivo via calcTaxaTransacao
// quando o pagamento ainda não tem taxa travada (não confirmado, ou
// confirmado antes desta trava existir).
export function taxaDoPagamento(
  p: { valor: number | null; produto: string | null; forma_pagamento: string; canal_cobranca?: string | null; taxa_valor?: number | null },
  taxas: TaxaDetalhe[]
): number {
  if (p.taxa_valor != null) return p.taxa_valor;
  return calcTaxaTransacao(p.valor || 0, p.produto || '', p.forma_pagamento, p.canal_cobranca || '', taxas);
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
    const taxa = taxaDoPagamento(p, taxas) * share;

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

// ─── Repasse por pagamento ─────────────────────────────────────────────────────
//
// REGRA DE NEGÓCIO (definida pelo usuário):
//   • Comercial (1ª parcela) de Psicanálise (PSI):
//       - Turma da Onze (sem investidor cadastrado em turma_responsaveis):
//         divide 50% Onze Digital / 50% IDM, sobre o valor cheio do pagamento
//         (não importa se foi pago em boleto, à vista, ou o curso inteiro de
//         uma vez no cartão).
//       - Turma de investidor (com investidor cadastrado): só o valor de UMA
//         mensalidade da turma (turmas.valor_mensalidade, ex: R$109,90) vai
//         100% para Onze Digital — o restante do pagamento (o que sobra
//         quando o aluno paga o curso inteiro de uma vez, ex: cartão/à vista)
//         divide 50% IDM / 50% investidor(es) da turma.
//   • Recorrência (parcela 2+, qualquer produto) → 50% IDM + 50% rateado entre
//     o(s) investidor(es) da turma (turma_responsaveis). Turma sem investidor
//     cadastrado: os 50% "do investidor" ficam com o IDM também (100% IDM).
//   • Comercial de outros produtos (ex: numerologia) → mesma regra da
//     recorrência: 50% IDM + 50% investidor(es); sem investidor, 100% IDM.
// FONTE: turma_responsaveis (turma_id, user_id → responsaveis.id, percentual)
//        + responsaveis (para resolver nome "Onze Digital" / "IDM")

export interface ResponsavelRow { id: string; nome: string; ativo?: boolean; email?: string | null; }
export interface TurmaResponsavelRow { id: string; turma_id: string; user_id: string | null; nome_ref: string | null; percentual: number; }

// ─── getOwnerShare compartilhado ───────────────────────────────────────────────
//
// FONTE: turmas.responsavel_id (prioritário, 1-para-1) + turma_responsaveis
//        (fallback proporcional, split % entre investidores da turma)
// Isto decide "quanto dessa turma pertence ao responsável filtrado" para fins de
// VISIBILIDADE/filtro de tela (ex: dono de turma vendo só o que é seu) — é uma
// pergunta diferente de calcRepasses (que decide o repasse de receita a
// investidores como regra de negócio); não devem ser unificadas.
export interface TurmaOwnerRow { id: string; responsavel_id?: string | null; }
export function makeGetOwnerShare(
  ownerFilter: string,
  turmas: TurmaOwnerRow[],
  turmaResponsaveis: TurmaResponsavelRow[],
  responsaveisList: ResponsavelRow[],
): (turmaId: string | null | undefined) => number {
  return (turmaId: string | null | undefined) => {
    if (!ownerFilter || !turmaId) return 1;
    const turma = turmas.find(t => t.id === turmaId);
    if (turma?.responsavel_id) {
      const resp = responsaveisList.find(r => r.id === turma.responsavel_id);
      if (resp) return resp.nome === ownerFilter ? 1 : 0;
    }
    const turmaResps = turmaResponsaveis.filter(r => r.turma_id === turmaId && r.nome_ref);
    if (!turmaResps.length) return 0;
    const ownerPct = turmaResps.filter(r => r.nome_ref === ownerFilter).reduce((s, r) => s + r.percentual, 0);
    return ownerPct / 100;
  };
}

export interface RepasseCalculado {
  responsavel_id: string | null;
  nome: string;
  percentual: number; // participação desse responsável no líquido do pagamento (ou do período, no agregado)
  valor: number;
}

export interface RepasseResultado {
  repasses: RepasseCalculado[];
  percentualIdm: number;
  valorIdm: number;
}

export interface PagamentoParaRepasse {
  turma_id: string | null;
  produto: string | null;
  numero_parcela: number | null;
  liquido: number; // valor - taxa
  valorMensalidadeTurma?: number | null; // turmas.valor_mensalidade — referência de 1 mensalidade, só usada no comercial de PSI em turma com investidor
}

const NOME_ONZE_DIGITAL = 'Onze Digital';
const NOME_IDM = 'IDM';

function resolveNomeInvestidor(tr: TurmaResponsavelRow, responsaveisList: ResponsavelRow[]): string {
  return tr.nome_ref || responsaveisList.find(r => r.id === tr.user_id)?.nome || 'Sem nome';
}

// Mescla linhas do mesmo responsável (ex: quando o próprio "IDM" também está
// cadastrado como investidor da turma, o 50% base + o 50% do investidor devem
// virar uma única linha de 100%, não duas linhas separadas de 50%).
function mesclarLinhas(linhas: RepasseCalculado[]): RepasseCalculado[] {
  const porChave: Record<string, RepasseCalculado> = {};
  for (const linha of linhas) {
    const key = linha.responsavel_id || linha.nome;
    if (!porChave[key]) porChave[key] = { ...linha };
    else {
      porChave[key].valor += linha.valor;
      porChave[key].percentual += linha.percentual;
    }
  }
  return Object.values(porChave);
}

// 50% pra um responsável "base" (IDM ou Onze Digital, dependendo da regra) +
// 50% rateado entre o(s) investidor(es) da turma. Sem investidor cadastrado,
// os 50% que seriam dele ficam com o próprio "base" (vira 100% base).
function metadeComInvestidor(
  liquido: number,
  nomeBase: string,
  investidores: TurmaResponsavelRow[],
  responsaveisList: ResponsavelRow[],
  findId: (nome: string) => string | null,
): RepasseCalculado[] {
  if (investidores.length === 0) {
    return [{ responsavel_id: findId(nomeBase), nome: nomeBase, percentual: 100, valor: liquido }];
  }
  const totalPct = investidores.reduce((s, tr) => s + tr.percentual, 0) || 100;
  const linhas: RepasseCalculado[] = [
    { responsavel_id: findId(nomeBase), nome: nomeBase, percentual: 50, valor: liquido * 0.5 },
  ];
  for (const inv of investidores) {
    const pct = (inv.percentual / totalPct) * 50;
    linhas.push({ responsavel_id: inv.user_id, nome: resolveNomeInvestidor(inv, responsaveisList), percentual: pct, valor: liquido * (pct / 100) });
  }
  return mesclarLinhas(linhas);
}

// Calcula o repasse de UM pagamento — reutilizado tanto no agregado do
// período quanto na exibição linha-a-linha de cada entrada no Fechamento.
export function calcRepassePagamento(
  liquido: number,
  produto: string | null,
  numeroParcela: number | null,
  turmaId: string | null,
  turmaResponsaveis: TurmaResponsavelRow[],
  responsaveisList: ResponsavelRow[],
  valorMensalidadeTurma: number | null = null,
): RepasseCalculado[] {
  const comercial = (numeroParcela ?? 1) <= 1;
  const isPsi = produto === 'psicanalise';
  const investidores = turmaResponsaveis.filter(tr => tr.turma_id === turmaId);
  const findId = (nome: string) => responsaveisList.find(r => r.nome === nome)?.id ?? null;

  if (comercial && isPsi) {
    // Se o único "investidor" cadastrado da turma é a própria Onze Digital, não
    // conta como investidor de verdade pra essa regra (senão ela ganharia duas
    // vezes: a parte comercial + a metade do investidor, que é ela mesma) —
    // trata como turma da Onze (50/50 direto).
    const investidoresReais = investidores.filter(tr => resolveNomeInvestidor(tr, responsaveisList) !== NOME_ONZE_DIGITAL);
    let linhas: RepasseCalculado[];
    if (investidoresReais.length === 0) {
      // Turma da Onze (sem investidor cadastrado): 50/50 Onze Digital / IDM,
      // sobre o valor cheio — não tem investidor pra separar uma "parte comercial".
      linhas = [
        { responsavel_id: findId(NOME_ONZE_DIGITAL), nome: NOME_ONZE_DIGITAL, percentual: 0, valor: liquido * 0.5 },
        { responsavel_id: findId(NOME_IDM), nome: NOME_IDM, percentual: 0, valor: liquido * 0.5 },
      ];
    } else {
      // Turma de investidor: só 1 mensalidade vai pra Onze Digital; o resto
      // (ex: aluno pagou o curso inteiro de uma vez no cartão/à vista) divide
      // 50/50 entre IDM e o(s) investidor(es).
      const parteComercial = Math.min(liquido, Math.max(0, valorMensalidadeTurma ?? 0));
      const parteRestante = liquido - parteComercial;
      linhas = [];
      if (parteComercial > 0) {
        linhas.push({ responsavel_id: findId(NOME_ONZE_DIGITAL), nome: NOME_ONZE_DIGITAL, percentual: 0, valor: parteComercial });
      }
      if (parteRestante > 0) {
        linhas.push(...metadeComInvestidor(parteRestante, NOME_IDM, investidoresReais, responsaveisList, findId));
      }
    }
    const merged = mesclarLinhas(linhas);
    for (const l of merged) l.percentual = liquido > 0 ? (l.valor / liquido) * 100 : 0;
    return merged;
  }

  // Recorrência (qualquer produto) e comercial de produtos que não sejam PSI
  // (ex: numerologia): 50% IDM + 50% investidor(es); sem investidor, 100% IDM.
  return metadeComInvestidor(liquido, NOME_IDM, investidores, responsaveisList, findId);
}

// Agrega o repasse de vários pagamentos do período — soma por responsável e
// separa o que fica retido no IDM (valorIdm) do que é de fato repassado a
// terceiros (repasses).
export function calcRepasses(
  pagamentos: PagamentoParaRepasse[],
  turmaResponsaveis: TurmaResponsavelRow[],
  responsaveisList: ResponsavelRow[],
): RepasseResultado {
  const porResponsavel: Record<string, RepasseCalculado> = {};
  let totalLiquido = 0;

  for (const p of pagamentos) {
    totalLiquido += p.liquido;
    const linhas = calcRepassePagamento(p.liquido, p.produto, p.numero_parcela, p.turma_id, turmaResponsaveis, responsaveisList, p.valorMensalidadeTurma);
    for (const linha of linhas) {
      const key = linha.responsavel_id || linha.nome;
      if (!porResponsavel[key]) porResponsavel[key] = { responsavel_id: linha.responsavel_id, nome: linha.nome, percentual: 0, valor: 0 };
      porResponsavel[key].valor += linha.valor;
    }
  }

  const valorIdm = Object.values(porResponsavel).find(r => r.nome === NOME_IDM)?.valor || 0;
  const repasses = Object.values(porResponsavel).filter(r => r.nome !== NOME_IDM);
  for (const r of repasses) {
    r.percentual = totalLiquido > 0 ? (r.valor / totalLiquido) * 100 : 0;
  }

  return {
    repasses: repasses.sort((a, b) => b.valor - a.valor),
    percentualIdm: totalLiquido > 0 ? (valorIdm / totalLiquido) * 100 : 100,
    valorIdm,
  };
}

// ─── Parâmetros da Análise CFO (DRE, Ponto de Equilíbrio, CAC/LTV/Payback, Caixa) ──
//
// FONTE: balanco_config.parametros_cfo (jsonb, 1 linha por empresa — hoje só
// 'onze_digital' é usado pela UI). Não existe integração bancária nem fonte
// automática de impostos/CAC real — todo campo aqui é input manual.
export interface ParametrosCfo {
  impostos_pct?: number;
  cac_estimado?: number;
  gross_margin_pct?: number;
  saldo_caixa_manual?: number;
  saldo_caixa_atualizado_em?: string;
  reserva_emergencia_meta_meses?: number;
}

export const PARAMETROS_CFO_DEFAULT: Required<ParametrosCfo> = {
  impostos_pct: 6,
  cac_estimado: 150,
  gross_margin_pct: 70,
  saldo_caixa_manual: 0,
  saldo_caixa_atualizado_em: '',
  reserva_emergencia_meta_meses: 3,
};

export const EMPRESA_CFO_PADRAO = 'onze_digital';

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
