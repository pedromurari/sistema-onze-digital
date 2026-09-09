import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Loader2, Lock, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBalancoConfig } from '@/lib/db';
import {
  fmtBRL, PARAMETROS_CFO_DEFAULT, calcDreResumoMes,
  type ParametrosCfo, type ProlaboreFrequencia, type DreItemRow, type DrePagamentoRow,
} from '@/lib/financial-utils';
import { getContaLabel, type Conta, CONTAS } from '@/lib/contas';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

/**
 * Sócios — pró-labore e distribuição de lucro (Fase C da estruturação do financeiro).
 *
 * "Conta virtual" por sócio: mostra, no mês, quanto de pró-labore é devido, quanto
 * já foi repassado, a cota de lucro do fechamento e o que falta — pra ninguém sacar
 * a mais e o gasto pessoal só sair depois de repassado.
 *
 * Fontes:
 *   - Regras ........... balanco_config.socios (nome, %, pró-labore mensal, conta)
 *                        + balanco_config.parametros_cfo (reserva mínima, frequência)
 *   - Repasses ......... balanco_itens categoria 'pro_labore' / 'distribuicao_lucro',
 *                        do mês (data_competencia/mes_referencia), com fornecedor = nome
 *   - Resultado ........ dre_fechamentos.resultado do mês (distribuição só libera
 *                        depois do mês fechado no DRE)
 */

const EMPRESA = 'onze_digital';

interface SocioRow {
  nome: string;
  percentual: number;
  prolabore_mensal: number;
  conta: Conta | '';
}

interface RepasseRow {
  id: string;
  valor: number;
  categoria: string;
  fornecedor: string | null;
  data_caixa: string | null;
  descricao: string;
}

const DIVISOR_FREQ: Record<ProlaboreFrequencia, number> = { semanal: 4, quinzenal: 2, mensal: 1 };
const LABEL_FREQ: Record<ProlaboreFrequencia, string> = {
  semanal: 'semanal', quinzenal: 'quinzenal', mensal: 'mensal',
};

const mesAtual = () => new Date().toISOString().slice(0, 7);
const hojeISO = () => new Date().toISOString().slice(0, 10);
const rotuloMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const shiftMes = (ym: string, delta: number) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normalizarSocios(valor: unknown): SocioRow[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const conta = CONTAS.some((c) => c.id === o.conta) ? (o.conta as Conta) : '';
    return {
      nome: String(o.nome ?? ''),
      percentual: num(o.percentual),
      prolabore_mensal: num(o.prolabore_mensal),
      conta,
    };
  });
}

export function Socios() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesAtual);
  const { data: config, isLoading: loadingConfig } = useBalancoConfig<{
    socios: unknown;
    parametros_cfo: ParametrosCfo | null;
  }>();

  const [repasses, setRepasses] = useState<RepasseRow[]>([]);
  const [resultadoFechado, setResultadoFechado] = useState<number | null>(null);
  const [mesFechado, setMesFechado] = useState(false);
  const [pagamentos, setPagamentos] = useState<DrePagamentoRow[]>([]);
  const [itensDre, setItensDre] = useState<DreItemRow[]>([]);
  const [eventosReceita, setEventosReceita] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogSocio, setDialogSocio] = useState<SocioRow | null>(null);

  const socios = useMemo(() => normalizarSocios(config?.socios), [config?.socios]);
  const params = { ...PARAMETROS_CFO_DEFAULT, ...(config?.parametros_cfo ?? {}) };
  const freq = params.prolabore_frequencia;
  const reservaMin = params.reserva_minima_operacional;
  const caixaAtual = params.saldo_caixa_manual;
  const caixaAcimaReserva = caixaAtual - reservaMin;

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: itens }, { data: fech }, { data: pags }, { data: eventos }] = await Promise.all([
      supabase
        .from('balanco_itens')
        .select('id, valor, tipo, categoria, fornecedor, data_caixa, data_competencia, mes_referencia, descricao'),
      supabase
        .from('dre_fechamentos')
        .select('resultado, reaberto_em')
        .eq('empresa', EMPRESA)
        .eq('mes', mes)
        .maybeSingle(),
      supabase
        .from('pagamentos')
        .select('status, valor, mes_referencia, taxa_valor')
        .eq('status', 'pago'),
      supabase
        .from('vw_receita_eventos_mes')
        .select('mes, receita_total'),
    ]);
    const evAcc: Record<string, number> = {};
    for (const r of (eventos ?? []) as { mes: string; receita_total: number }[]) {
      evAcc[r.mes] = (evAcc[r.mes] ?? 0) + (Number(r.receita_total) || 0);
    }
    setEventosReceita(evAcc);
    const todos = (itens ?? []) as (RepasseRow & DreItemRow & { data_competencia: string | null; mes_referencia: string | null })[];
    setItensDre(todos.map((i) => ({
      tipo: i.tipo, valor: i.valor, categoria: i.categoria,
      data_competencia: i.data_competencia, mes_referencia: i.mes_referencia,
    })));
    setRepasses(
      todos
        .filter((i) => ((i.data_competencia ?? i.mes_referencia ?? '') as string).slice(0, 7) === mes
          && (i.categoria === 'pro_labore' || i.categoria === 'distribuicao_lucro'))
        .map(({ id, valor, categoria, fornecedor, data_caixa, descricao }) => ({ id, valor, categoria, fornecedor, data_caixa, descricao })),
    );
    setPagamentos((pags ?? []) as DrePagamentoRow[]);
    const fechado = !!fech && !(fech as { reaberto_em: string | null }).reaberto_em;
    setMesFechado(fechado);
    setResultadoFechado(fechado ? num((fech as { resultado: number }).resultado) : null);
    setLoading(false);
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const somaPct = socios.reduce((s, x) => s + x.percentual, 0);

  // Resultado do mês: o snapshot fechado manda; senão, a prévia ao vivo (mesmas
  // regras do DRE) — pra o sócio ver a cota antes de o mês ser fechado.
  const dreLive = useMemo(
    () => calcDreResumoMes(pagamentos, itensDre, mes, params.impostos_pct ?? 0, eventosReceita[mes] ?? 0),
    [pagamentos, itensDre, eventosReceita, mes, params.impostos_pct],
  );
  const resultadoMes = mesFechado ? resultadoFechado : (dreLive.temDados ? dreLive.resultado : null);
  const resultadoEhPrevia = !mesFechado && resultadoMes != null;

  const linhas = socios.map((socio) => {
    const meus = repasses.filter((r) => (r.fornecedor ?? '').trim().toLowerCase() === socio.nome.trim().toLowerCase());
    const proLaboreRepassado = meus.filter((r) => r.categoria === 'pro_labore').reduce((s, r) => s + num(r.valor), 0);
    const distribuido = meus.filter((r) => r.categoria === 'distribuicao_lucro').reduce((s, r) => s + num(r.valor), 0);
    const proLaboreFalta = Math.max(0, socio.prolabore_mensal - proLaboreRepassado);
    const parcela = socio.prolabore_mensal / DIVISOR_FREQ[freq];
    const cotaLucro = resultadoMes != null && resultadoMes > 0 ? (resultadoMes * socio.percentual) / 100 : 0;
    const distribuirFalta = Math.max(0, cotaLucro - distribuido);
    return { socio, proLaboreRepassado, distribuido, proLaboreFalta, parcela, cotaLucro, distribuirFalta };
  });

  const carregando = loadingConfig || loading;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto pb-20 lg:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Sócios — pró-labore e distribuição</h1>
          <p className="text-xs text-muted-foreground">
            Conta virtual de cada sócio no mês. Pró-labore {LABEL_FREQ[freq]}; distribuição só depois de fechar o DRE.
          </p>
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
      ) : socios.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          Nenhum sócio configurado. Cadastre em <strong>Balanço → Configuração financeira</strong>.
        </Card>
      ) : (
        <>
          <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">
                Resultado do mês {resultadoEhPrevia && <em className="not-italic text-amber-700">· prévia ao vivo</em>}
              </span>
              {resultadoMes != null ? (
                <span className={`font-semibold tabular-nums ${resultadoMes >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtBRL(resultadoMes)}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">sem dados no mês</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Caixa × reserva mínima</span>
              <span className={`font-semibold tabular-nums ${caixaAcimaReserva >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmtBRL(caixaAcimaReserva)}
              </span>
              <span className="text-[11px] text-muted-foreground ml-1">
                ({fmtBRL(caixaAtual)} − {fmtBRL(reservaMin)})
              </span>
            </div>
            {Math.abs(somaPct - 100) > 0.01 && (
              <Badge className="bg-amber-100 text-amber-800">participação soma {somaPct}% — ajuste na config</Badge>
            )}
          </Card>

          {caixaAcimaReserva < 0 && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Caixa abaixo da reserva mínima. Segura os repasses até recompor — atualize o saldo de caixa na
              Configuração financeira.
            </div>
          )}

          {linhas.map(({ socio, proLaboreRepassado, distribuido, proLaboreFalta, parcela, cotaLucro, distribuirFalta }) => (
            <Card key={socio.nome} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{socio.nome || '(sem nome)'}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {socio.percentual}% do lucro · conta {getContaLabel(socio.conta || null)}
                  </p>
                </div>
                <Button size="sm" className="gap-1.5 text-xs" disabled={caixaAcimaReserva < 0}
                  onClick={() => setDialogSocio(socio)}>
                  <Wallet className="h-3.5 w-3.5" /> Registrar repasse
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Metric label="Pró-labore/mês" valor={socio.prolabore_mensal} />
                <Metric label={`Parcela ${LABEL_FREQ[freq]}`} valor={parcela} />
                <Metric label="Repassado no mês" valor={proLaboreRepassado} tom="bom" />
                <Metric label="Falta de pró-labore" valor={proLaboreFalta} tom={proLaboreFalta > 0 ? 'ruim' : undefined} />
              </div>

              <div className="border-t border-border/60 pt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Metric label="Cota de lucro" valor={cotaLucro}
                  nota={resultadoMes == null ? 'sem dados' : resultadoMes <= 0 ? 'sem lucro no mês'
                    : resultadoEhPrevia ? 'prévia — feche o DRE p/ distribuir' : undefined} />
                <Metric label="Distribuído no mês" valor={distribuido} tom="bom" />
                <Metric label="Falta distribuir" valor={distribuirFalta} tom={distribuirFalta > 0 ? 'ruim' : undefined} />
              </div>
            </Card>
          ))}

          <p className="text-[11px] text-muted-foreground pt-1 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Cada repasse vira um lançamento em <strong>Balanço</strong> (categoria pró-labore ou distribuição de lucro),
            então entra no DRE do mês automaticamente. Gasto pessoal do sócio só depois de repassado, na conta dele.
          </p>
        </>
      )}

      <RepasseDialog
        socio={dialogSocio}
        mes={mes}
        parcelaSugerida={dialogSocio ? dialogSocio.prolabore_mensal / DIVISOR_FREQ[freq] : 0}
        podeDistribuir={mesFechado}
        onClose={() => setDialogSocio(null)}
        onSaved={() => { setDialogSocio(null); carregar(); }}
        autorPor={user?.nome ?? null}
      />
    </div>
  );
}

function Metric({ label, valor, tom, nota }: {
  label: string; valor: number; tom?: 'bom' | 'ruim'; nota?: string;
}) {
  const cor = tom === 'bom' ? 'text-emerald-700' : tom === 'ruim' ? 'text-red-600' : '';
  return (
    <div>
      <span className="text-[11px] text-muted-foreground block">{label}</span>
      <span className={`font-semibold tabular-nums ${cor}`}>{fmtBRL(valor)}</span>
      {nota && <span className="text-[11px] text-muted-foreground block">{nota}</span>}
    </div>
  );
}

function RepasseDialog({ socio, mes, parcelaSugerida, podeDistribuir, onClose, onSaved, autorPor }: {
  socio: SocioRow | null;
  mes: string;
  parcelaSugerida: number;
  podeDistribuir: boolean;
  onClose: () => void;
  onSaved: () => void;
  autorPor: string | null;
}) {
  const [tipo, setTipo] = useState<'pro_labore' | 'distribuicao_lucro'>('pro_labore');
  const [valor, setValor] = useState('');
  const [conta, setConta] = useState<Conta | ''>('');
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (socio) {
      setTipo('pro_labore');
      setValor(parcelaSugerida ? parcelaSugerida.toFixed(2) : '');
      setConta(socio.conta || '');
      setData(hojeISO());
    }
  }, [socio, parcelaSugerida]);

  if (!socio) return null;

  async function salvar() {
    const v = Number(valor);
    if (!v || v <= 0) { toast({ variant: 'destructive', title: 'Informe um valor válido' }); return; }
    if (!conta) { toast({ variant: 'destructive', title: 'Escolha a conta que pagou' }); return; }
    setSalvando(true);
    const rotuloTipo = tipo === 'pro_labore' ? 'Pró-labore' : 'Distribuição de lucro';
    const autor = autorPor ? ` · por ${autorPor}` : '';
    const { error } = await supabase.from('balanco_itens').insert({
      tipo: 'saida',
      categoria: tipo,
      produto: 'geral',
      descricao: `${rotuloTipo} — ${socio!.nome} (${new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')})${autor}`,
      valor: v,
      mes_referencia: mes,
      data_competencia: `${mes}-01`,
      data_caixa: data,
      conta_pagamento: conta,
      fornecedor: socio!.nome,
      recorrente: false,
    } as never);
    setSalvando(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao registrar', description: error.message }); return; }
    toast({ title: `${rotuloTipo} de ${socio!.nome} registrado` });
    onSaved();
  }

  return (
    <Dialog open={!!socio} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar repasse — {socio.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(x: 'pro_labore' | 'distribuicao_lucro') => setTipo(x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pro_labore">Pró-labore</SelectItem>
                <SelectItem value="distribuicao_lucro" disabled={!podeDistribuir}>
                  Distribuição de lucro{!podeDistribuir ? ' (feche o DRE do mês)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input type="number" step="0.01" min="0" className="pl-10" value={valor}
                onChange={(e) => setValor(e.target.value)} />
            </div>
            {tipo === 'pro_labore' && parcelaSugerida > 0 && (
              <button type="button" className="text-[11px] text-primary underline"
                onClick={() => setValor(parcelaSugerida.toFixed(2))}>
                usar a parcela sugerida ({fmtBRL(parcelaSugerida)})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta que pagou</Label>
              <Select value={conta || undefined} onValueChange={(x: Conta) => setConta(x)}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  {CONTAS.filter((c) => c.id !== 'outro').map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-1.5">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
