import { useState, type Dispatch, type SetStateAction } from 'react';
import { Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBalancoConfig, useInvalidarDados } from '@/lib/db';
import { CONTAS, getContaCor, getContaLabel, type Conta } from '@/lib/contas';
import {
  PARAMETROS_CFO_DEFAULT, type ParametrosCfo, type ProlaboreFrequencia,
} from '@/lib/financial-utils';
import {
  normalizarRegrasSocio,
  type RegrasSocio,
} from '@/lib/regras-socio';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

export interface SocioConfig {
  nome: string;
  /** Participação no lucro distribuível — a soma dos sócios tem que dar 100%. */
  percentual: number;
  /** Pró-labore mensal do sócio (o total que a contabilidade declara todo mês). */
  prolabore_mensal: number;
  /** Conta que recebe o pró-labore + a distribuição deste sócio. */
  conta: Conta | '';
}

export const PROLABORE_FREQ_LABELS: Record<ProlaboreFrequencia, string> = {
  semanal: 'Semanal (1/4 por semana)',
  quinzenal: 'Quinzenal (1/2 a cada 15 dias)',
  mensal: 'Mensal (parcela única)',
};

export interface TaxaBalancoConfig {
  conta: Conta;
  forma: string;
  percentual: number;
  fixo: number;
}

type ContaComSaldoInicial = Exclude<Conta, 'outro'>;

export type SaldoInicialContas = Record<ContaComSaldoInicial, number> & {
  data: string;
};

interface BalancoConfigRow {
  id: string;
  socios: unknown;
  taxas: unknown;
  parametros_cfo: unknown;
  saldo_inicial_contas: unknown;
  regras_socio: unknown;
  updated_at: string | null;
}

const FORMAS_PAGAMENTO = [
  { id: 'boleto', label: 'Boleto' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'pix', label: 'PIX' },
  { id: 'avista', label: 'À vista' },
  { id: 'outro', label: 'Outro' },
] as const;

const CONTAS_COM_SALDO = CONTAS.filter(
  (conta): conta is Extract<(typeof CONTAS)[number], { id: ContaComSaldoInicial }> => conta.id !== 'outro',
);

const SALDO_VAZIO: SaldoInicialContas = {
  data: '',
  inter: 0,
  c6: 0,
  mercado_pago: 0,
  asaas: 0,
  voomp: 0,
};

const objeto = (valor: unknown): Record<string, unknown> =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};

const numero = (valor: unknown) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

const normalizarSocios = (valor: unknown): SocioConfig[] =>
  Array.isArray(valor)
    ? valor.map((item) => objeto(item)).map((item) => ({
        nome: String(item.nome ?? ''),
        percentual: numero(item.percentual),
        prolabore_mensal: numero(item.prolabore_mensal),
        conta: CONTAS.some((conta) => conta.id === item.conta) ? (item.conta as Conta) : '',
      }))
    : [];

const normalizarTaxas = (valor: unknown): TaxaBalancoConfig[] =>
  Array.isArray(valor)
    ? valor.map((item) => objeto(item)).map((item) => ({
        conta: CONTAS.some((conta) => conta.id === item.conta) ? item.conta as Conta : 'outro',
        forma: String(item.forma ?? 'outro'),
        percentual: numero(item.percentual),
        fixo: numero(item.fixo),
      }))
    : [];

const FREQ_VALIDAS: ProlaboreFrequencia[] = ['semanal', 'quinzenal', 'mensal'];

const normalizarParametros = (valor: unknown): Required<ParametrosCfo> => {
  const atual = objeto(valor);
  return {
    impostos_pct: numero(atual.impostos_pct ?? PARAMETROS_CFO_DEFAULT.impostos_pct),
    cac_estimado: numero(atual.cac_estimado ?? PARAMETROS_CFO_DEFAULT.cac_estimado),
    gross_margin_pct: numero(atual.gross_margin_pct ?? PARAMETROS_CFO_DEFAULT.gross_margin_pct),
    saldo_caixa_manual: numero(atual.saldo_caixa_manual ?? PARAMETROS_CFO_DEFAULT.saldo_caixa_manual),
    saldo_caixa_atualizado_em: String(atual.saldo_caixa_atualizado_em ?? ''),
    reserva_emergencia_meta_meses: numero(
      atual.reserva_emergencia_meta_meses ?? PARAMETROS_CFO_DEFAULT.reserva_emergencia_meta_meses,
    ),
    reserva_minima_operacional: numero(
      atual.reserva_minima_operacional ?? PARAMETROS_CFO_DEFAULT.reserva_minima_operacional,
    ),
    prolabore_frequencia: FREQ_VALIDAS.includes(atual.prolabore_frequencia as ProlaboreFrequencia)
      ? (atual.prolabore_frequencia as ProlaboreFrequencia)
      : PARAMETROS_CFO_DEFAULT.prolabore_frequencia,
  };
};

const normalizarSaldos = (valor: unknown): SaldoInicialContas => {
  const atual = objeto(valor);
  return {
    data: String(atual.data ?? ''),
    inter: numero(atual.inter),
    c6: numero(atual.c6),
    mercado_pago: numero(atual.mercado_pago),
    asaas: numero(atual.asaas),
    voomp: numero(atual.voomp),
  };
};

/** Tolerância de centavos percentuais evita falso negativo por ponto flutuante. */
export const somaSociosValida = (socios: SocioConfig[]) =>
  socios.length > 0 && Math.abs(socios.reduce((total, socio) => total + socio.percentual, 0) - 100) < 0.01;

interface EditorProps {
  config: BalancoConfigRow;
  onSaved?: () => void;
}

function EditorBalancoConfig({ config, onSaved }: EditorProps) {
  const invalidar = useInvalidarDados();
  const [socios, setSocios] = useState(() => normalizarSocios(config.socios));
  const [taxas, setTaxas] = useState(() => normalizarTaxas(config.taxas));
  const [parametros, setParametros] = useState(() => normalizarParametros(config.parametros_cfo));
  const [saldos, setSaldos] = useState(() => normalizarSaldos(config.saldo_inicial_contas));
  const [regrasSocio, setRegrasSocio] = useState(() => normalizarRegrasSocio(config.regras_socio));
  const [salvando, setSalvando] = useState(false);

  const somaSocios = socios.reduce((total, socio) => total + socio.percentual, 0);

  const salvar = async () => {
    if (!somaSociosValida(socios)) {
      toast({
        variant: 'destructive',
        title: 'Percentuais dos sócios inválidos',
        description: `A soma precisa ser 100%. Soma atual: ${somaSocios.toLocaleString('pt-BR')}%.`,
      });
      return;
    }
    if (socios.some((socio) => !socio.nome.trim())) {
      toast({ variant: 'destructive', title: 'Informe o nome de todos os sócios' });
      return;
    }
    if (taxas.some((taxa) => taxa.percentual < 0 || taxa.fixo < 0)) {
      toast({ variant: 'destructive', title: 'Taxas não podem ter valores negativos' });
      return;
    }
    if (!saldos.data) {
      toast({ variant: 'destructive', title: 'Informe a data-base dos saldos iniciais' });
      return;
    }
    const percentuaisRegras = [
      regrasSocio.eventos_npa_pct_pedro,
      regrasSocio.custo_fixo_pct_pedro,
      regrasSocio.custo_evento_pct_pedro,
      regrasSocio.receita_outra_default_pct_pedro,
      ...regrasSocio.receita_outra_por_fornecedor.map((regra) => regra.pct_pedro),
    ];
    if (percentuaisRegras.some((valor) => valor < 0 || valor > 100)) {
      toast({ variant: 'destructive', title: 'Percentuais da divisão devem ficar entre 0% e 100%' });
      return;
    }
    if (
      regrasSocio.receita_outra_por_fornecedor.some((regra) => !regra.match.trim())
      || regrasSocio.custo_dedicado_por_fornecedor.some((regra) => !regra.match.trim())
    ) {
      toast({ variant: 'destructive', title: 'Preencha o texto de correspondência das regras por fornecedor' });
      return;
    }

    setSalvando(true);
    const payload = {
      socios: socios.map((socio) => ({ ...socio, nome: socio.nome.trim() })),
      taxas,
      parametros_cfo: parametros,
      saldo_inicial_contas: saldos,
      regras_socio: {
        ...regrasSocio,
        receita_outra_por_fornecedor: regrasSocio.receita_outra_por_fornecedor.map((regra) => ({
          ...regra,
          match: regra.match.trim(),
        })),
        custo_dedicado_por_fornecedor: regrasSocio.custo_dedicado_por_fornecedor.map((regra) => ({
          ...regra,
          match: regra.match.trim(),
        })),
      },
      updated_at: new Date().toISOString(),
    };
    // O tipo gerado só deve ganhar os JSONBs novos quando os tipos forem regenerados;
    // o cast fica localizado nesta fronteira de escrita para não contaminar o form.
    const { error } = await supabase
      .from('balanco_config')
      .update(payload as never)
      .eq('id', config.id);
    setSalvando(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar a configuração', description: error.message });
      return;
    }

    invalidar('balancoConfig');
    onSaved?.();
    toast({ title: 'Configuração do Balanço salva' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Configuração financeira</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Parâmetros compartilhados pelo Balanço, Análise CFO e futura conciliação bancária.
          </p>
        </div>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar configuração
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sócios, pró-labore e participação</CardTitle>
          <CardDescription>
            A participação no lucro precisa totalizar exatamente 100%. O pró-labore é o valor mensal
            declarado; a conta é para onde vão o pró-labore e a distribuição desse sócio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {socios.map((socio, indice) => (
            <div key={indice} className="grid gap-2 md:grid-cols-[1fr_120px_150px_150px_40px]">
              <Input
                aria-label={`Nome do sócio ${indice + 1}`}
                value={socio.nome}
                onChange={(event) => setSocios((atuais) => atuais.map((item, i) =>
                  i === indice ? { ...item, nome: event.target.value } : item))}
                placeholder="Nome do sócio"
              />
              <div className="relative">
                <Input
                  aria-label={`Participação no lucro do sócio ${indice + 1}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="pr-8"
                  value={socio.percentual}
                  onChange={(event) => setSocios((atuais) => atuais.map((item, i) =>
                    i === indice ? { ...item, percentual: numero(event.target.value) } : item))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  aria-label={`Pró-labore mensal do sócio ${indice + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-10"
                  placeholder="pró-labore"
                  value={socio.prolabore_mensal}
                  onChange={(event) => setSocios((atuais) => atuais.map((item, i) =>
                    i === indice ? { ...item, prolabore_mensal: numero(event.target.value) } : item))}
                />
              </div>
              <Select
                value={socio.conta || undefined}
                onValueChange={(valor: Conta) => setSocios((atuais) => atuais.map((item, i) =>
                  i === indice ? { ...item, conta: valor } : item))}
              >
                <SelectTrigger aria-label={`Conta do sócio ${indice + 1}`}>
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  {CONTAS.filter((conta) => conta.id !== 'outro').map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>{conta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setSocios((atuais) => atuais.filter((_, i) => i !== indice))} aria-label={`Remover sócio ${indice + 1}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSocios((atuais) => [...atuais, { nome: '', percentual: 0, prolabore_mensal: 0, conta: '' }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar sócio
            </Button>
            <BadgeSomaSocios soma={somaSocios} valida={somaSociosValida(socios)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Divisão entre sócios</CardTitle>
          <CardDescription>
            Define a parte do Pedro; o restante fica com o Rodrygo. Mensalidades continuam seguindo a turma e
            o motor de repasse — estas regras cobrem eventos, receitas avulsas e custos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CampoParametro
              label="Eventos NPA — Pedro"
              suffix="%"
              value={regrasSocio.eventos_npa_pct_pedro}
              onChange={(valor) => setRegrasSocio((atual) => ({ ...atual, eventos_npa_pct_pedro: valor }))}
            />
            <CampoParametro
              label="Custos compartilhados — Pedro"
              suffix="%"
              value={regrasSocio.custo_fixo_pct_pedro}
              onChange={(valor) => setRegrasSocio((atual) => ({ ...atual, custo_fixo_pct_pedro: valor }))}
            />
            <CampoParametro
              label="Custos de evento — Pedro"
              suffix="%"
              value={regrasSocio.custo_evento_pct_pedro}
              onChange={(valor) => setRegrasSocio((atual) => ({ ...atual, custo_evento_pct_pedro: valor }))}
            />
            <CampoParametro
              label="Outras receitas (padrão) — Pedro"
              suffix="%"
              value={regrasSocio.receita_outra_default_pct_pedro}
              onChange={(valor) => setRegrasSocio((atual) => ({ ...atual, receita_outra_default_pct_pedro: valor }))}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="professoras-proporcao">Professoras pela proporção das mensalidades</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Ligado: cada sócio absorve o custo conforme sua receita de mensalidades no mês. Desligado: usa
                o percentual de custos compartilhados acima.
              </p>
            </div>
            <Switch
              id="professoras-proporcao"
              checked={regrasSocio.professoras_por_proporcao_mensalidade}
              onCheckedChange={(checked) => setRegrasSocio((atual) => ({
                ...atual,
                professoras_por_proporcao_mensalidade: checked,
              }))}
            />
          </div>

          <EditorReceitasPorFornecedor regras={regrasSocio} onChange={setRegrasSocio} />
          <EditorCustosDedicados regras={regrasSocio} onChange={setRegrasSocio} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taxas por conta e forma de pagamento</CardTitle>
          <CardDescription>Editor consolidado das taxas percentuais e fixas usadas nos cálculos gerenciais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {taxas.map((taxa, indice) => (
            <div key={indice} className="grid gap-2 md:grid-cols-[1fr_1fr_130px_130px_40px]">
              <Select value={taxa.conta} onValueChange={(valor: Conta) => setTaxas((atuais) => atuais.map((item, i) => i === indice ? { ...item, conta: valor } : item))}>
                <SelectTrigger aria-label={`Conta da taxa ${indice + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent>{CONTAS.map((conta) => <SelectItem key={conta.id} value={conta.id}>{conta.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={taxa.forma} onValueChange={(valor) => setTaxas((atuais) => atuais.map((item, i) => i === indice ? { ...item, forma: valor } : item))}>
                <SelectTrigger aria-label={`Forma de pagamento da taxa ${indice + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS_PAGAMENTO.map((forma) => <SelectItem key={forma.id} value={forma.id}>{forma.label}</SelectItem>)}</SelectContent>
              </Select>
              <CampoMonetarioOuPercentual label={`Percentual da taxa ${indice + 1}`} suffix="%" value={taxa.percentual} onChange={(valor) => setTaxas((atuais) => atuais.map((item, i) => i === indice ? { ...item, percentual: valor } : item))} />
              <CampoMonetarioOuPercentual label={`Valor fixo da taxa ${indice + 1}`} prefix="R$" value={taxa.fixo} onChange={(valor) => setTaxas((atuais) => atuais.map((item, i) => i === indice ? { ...item, fixo: valor } : item))} />
              <Button variant="ghost" size="icon" onClick={() => setTaxas((atuais) => atuais.filter((_, i) => i !== indice))} aria-label={`Remover taxa ${indice + 1}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setTaxas((atuais) => [...atuais, { conta: 'asaas', forma: 'boleto', percentual: 0, fixo: 0 }])}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar taxa
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros da Análise CFO</CardTitle>
          <CardDescription>Valores manuais usados em DRE, CAC, margem, runway e reserva.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CampoParametro label="Alíquota efetiva de impostos" suffix="%" value={parametros.impostos_pct} onChange={(valor) => setParametros((atual) => ({ ...atual, impostos_pct: valor }))} />
          <CampoParametro label="CAC estimado" prefix="R$" value={parametros.cac_estimado} onChange={(valor) => setParametros((atual) => ({ ...atual, cac_estimado: valor }))} />
          <CampoParametro label="Margem bruta" suffix="%" value={parametros.gross_margin_pct} onChange={(valor) => setParametros((atual) => ({ ...atual, gross_margin_pct: valor }))} />
          <CampoParametro label="Saldo de caixa manual" prefix="R$" value={parametros.saldo_caixa_manual} onChange={(valor) => setParametros((atual) => ({ ...atual, saldo_caixa_manual: valor }))} />
          <CampoParametro label="Meta de reserva" suffix="meses" value={parametros.reserva_emergencia_meta_meses} onChange={(valor) => setParametros((atual) => ({ ...atual, reserva_emergencia_meta_meses: valor }))} />
          <CampoParametro label="Reserva mínima da conta operacional" prefix="R$" value={parametros.reserva_minima_operacional} onChange={(valor) => setParametros((atual) => ({ ...atual, reserva_minima_operacional: valor }))} />
          <div className="space-y-2">
            <Label>Frequência do pró-labore</Label>
            <Select
              value={parametros.prolabore_frequencia}
              onValueChange={(valor: ProlaboreFrequencia) => setParametros((atual) => ({ ...atual, prolabore_frequencia: valor }))}
            >
              <SelectTrigger aria-label="Frequência do pró-labore"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROLABORE_FREQ_LABELS) as ProlaboreFrequencia[]).map((freq) => (
                  <SelectItem key={freq} value={freq}>{PROLABORE_FREQ_LABELS[freq]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="saldo-atualizado-em">Saldo manual atualizado em</Label>
            <Input id="saldo-atualizado-em" type="date" value={parametros.saldo_caixa_atualizado_em} onChange={(event) => setParametros((atual) => ({ ...atual, saldo_caixa_atualizado_em: event.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo inicial por conta</CardTitle>
          <CardDescription>Fotografia de partida para a conciliação de caixa; não inclui a conta genérica “Outro”.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="data-saldo-inicial">Data-base *</Label>
            <Input id="data-saldo-inicial" type="date" value={saldos.data} onChange={(event) => setSaldos((atual) => ({ ...atual, data: event.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONTAS_COM_SALDO.map((conta) => (
              <div key={conta.id} className="space-y-2">
                <Label htmlFor={`saldo-${conta.id}`} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getContaCor(conta.id) }} />
                  {getContaLabel(conta.id)}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input id={`saldo-${conta.id}`} type="number" step="0.01" className="pl-10" value={saldos[conta.id]} onChange={(event) => setSaldos((atual) => ({ ...atual, [conta.id]: numero(event.target.value) }))} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EditorReceitasPorFornecedor({ regras, onChange }: {
  regras: RegrasSocio;
  onChange: Dispatch<SetStateAction<RegrasSocio>>;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">Receitas avulsas por fornecedor</h3>
        <p className="text-xs text-muted-foreground">
          O primeiro texto encontrado no nome do fornecedor vence; sem correspondência, vale o percentual padrão.
        </p>
      </div>
      {regras.receita_outra_por_fornecedor.map((regra, indice) => (
        <div key={indice} className="grid gap-2 sm:grid-cols-[1fr_160px_40px]">
          <Input
            aria-label={`Texto do fornecedor de receita ${indice + 1}`}
            value={regra.match}
            placeholder="Ex.: zaffalon"
            onChange={(event) => onChange((atual) => ({
              ...atual,
              receita_outra_por_fornecedor: atual.receita_outra_por_fornecedor.map((item, i) =>
                i === indice ? { ...item, match: event.target.value } : item),
            }))}
          />
          <CampoMonetarioOuPercentual
            label={`Percentual do Pedro na receita ${indice + 1}`}
            suffix="%"
            value={regra.pct_pedro}
            onChange={(valor) => onChange((atual) => ({
              ...atual,
              receita_outra_por_fornecedor: atual.receita_outra_por_fornecedor.map((item, i) =>
                i === indice ? { ...item, pct_pedro: valor } : item),
            }))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover regra de receita ${indice + 1}`}
            onClick={() => onChange((atual) => ({
              ...atual,
              receita_outra_por_fornecedor: atual.receita_outra_por_fornecedor.filter((_, i) => i !== indice),
            }))}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange((atual) => ({
          ...atual,
          receita_outra_por_fornecedor: [
            ...atual.receita_outra_por_fornecedor,
            { match: '', pct_pedro: atual.receita_outra_default_pct_pedro },
          ],
        }))}
      >
        <Plus className="mr-2 h-4 w-4" /> Adicionar regra de receita
      </Button>
    </div>
  );
}

function EditorCustosDedicados({ regras, onChange }: {
  regras: RegrasSocio;
  onChange: Dispatch<SetStateAction<RegrasSocio>>;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">Custos dedicados por fornecedor</h3>
        <p className="text-xs text-muted-foreground">
          Se o fornecedor de uma saída contiver o texto abaixo, 100% do custo vai para o sócio escolhido.
        </p>
      </div>
      {regras.custo_dedicado_por_fornecedor.map((regra, indice) => (
        <div key={indice} className="grid gap-2 sm:grid-cols-[1fr_180px_40px]">
          <Input
            aria-label={`Texto do fornecedor de custo ${indice + 1}`}
            value={regra.match}
            placeholder="Ex.: voomp"
            onChange={(event) => onChange((atual) => ({
              ...atual,
              custo_dedicado_por_fornecedor: atual.custo_dedicado_por_fornecedor.map((item, i) =>
                i === indice ? { ...item, match: event.target.value } : item),
            }))}
          />
          <Select
            value={regra.socio}
            onValueChange={(socio: 'pedro' | 'rodrygo') => onChange((atual) => ({
              ...atual,
              custo_dedicado_por_fornecedor: atual.custo_dedicado_por_fornecedor.map((item, i) =>
                i === indice ? { ...item, socio } : item),
            }))}
          >
            <SelectTrigger aria-label={`Sócio do custo dedicado ${indice + 1}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pedro">Pedro</SelectItem>
              <SelectItem value="rodrygo">Rodrygo</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover regra de custo ${indice + 1}`}
            onClick={() => onChange((atual) => ({
              ...atual,
              custo_dedicado_por_fornecedor: atual.custo_dedicado_por_fornecedor.filter((_, i) => i !== indice),
            }))}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange((atual) => ({
          ...atual,
          custo_dedicado_por_fornecedor: [
            ...atual.custo_dedicado_por_fornecedor,
            { match: '', socio: 'rodrygo' },
          ],
        }))}
      >
        <Plus className="mr-2 h-4 w-4" /> Adicionar custo dedicado
      </Button>
    </div>
  );
}

function BadgeSomaSocios({ soma, valida }: { soma: number; valida: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${valida ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
      Total: {soma.toLocaleString('pt-BR')}%
    </span>
  );
}

function CampoMonetarioOuPercentual({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (valor: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
      <Input aria-label={label} type="number" min="0" step="0.01" className={`${prefix ? 'pl-10' : ''} ${suffix ? 'pr-8' : ''}`} value={value} onChange={(event) => onChange(numero(event.target.value))} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function CampoParametro(props: { label: string; value: number; onChange: (valor: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <CampoMonetarioOuPercentual {...props} />
    </div>
  );
}

interface Props {
  empresaId?: string;
  onSaved?: () => void;
}

export function BalancoConfigForm({ empresaId = 'onze_digital', onSaved }: Props) {
  const { data: config, isLoading, error } = useBalancoConfig<BalancoConfigRow>(empresaId);

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando configuração…</div>;
  }
  if (error) {
    return <Card className="border-destructive/30"><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar a configuração do Balanço. Confirme se a migration de saldo inicial já foi aplicada.</CardContent></Card>;
  }
  if (!config) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">A configuração “{empresaId}” ainda não existe em balanco_config.</CardContent></Card>;
  }

  // `updated_at` na chave reinicializa os drafts depois de uma invalidação bem-sucedida,
  // sem um efeito que sobrescreveria campos enquanto o usuário estivesse digitando.
  return <EditorBalancoConfig key={`${config.id}-${config.updated_at || ''}`} config={config} onSaved={onSaved} />;
}
