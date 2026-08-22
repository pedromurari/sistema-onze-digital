import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { SectionBar, PREMIUM_TABLE_HEADER_ROW, premiumZebraRow } from '@/components/crm/ui/premium';
import {
  useIntegridadeFinanceira, useTurmas,
  useDefinirTurmaDoAluno, useDefinirFormaDePagamento, useMarcarParcelasComoIsentas,
  type GravidadeIntegridade, type PontoDeIntegridade,
} from '@/lib/db';

/**
 * A correção de cada linha, feita no lugar.
 *
 * Só três dos sete problemas têm conserto óbvio o bastante para virar controle. Os outros
 * pedem julgamento (conferir se a parcela já foi paga por fora, por exemplo) e continuam
 * sendo diagnóstico — botão que finge resolver é pior do que nenhum botão.
 */
function AcaoDaLinha({ ponto }: { ponto: PontoDeIntegridade }) {
  const { data: turmas = [] } = useTurmas();
  const definirTurma = useDefinirTurmaDoAluno();
  const definirForma = useDefinirFormaDePagamento();
  const marcarIsentas = useMarcarParcelasComoIsentas();

  if (ponto.problema === 'aluno sem turma') {
    return (
      <Select
        disabled={definirTurma.isPending}
        onValueChange={(turmaId) =>
          definirTurma.mutate(
            { alunoId: ponto.referencia, turmaId },
            {
              onSuccess: () => toast.success(`${ponto.entidade} entrou na turma`),
              onError: (e) => toast.error(`Não deu: ${(e as Error).message}`),
            },
          )
        }
      >
        <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Definir turma" /></SelectTrigger>
        <SelectContent>
          {turmas.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  if (ponto.problema === 'devendo e sem forma de pagamento') {
    return (
      <Select
        disabled={definirForma.isPending}
        onValueChange={(forma) =>
          definirForma.mutate(
            { alunoId: ponto.referencia, forma },
            {
              onSuccess: () => toast.success(
                forma === 'boleto'
                  ? `${ponto.entidade} passa a entrar na fila de cobrança`
                  : `Forma de ${ponto.entidade} definida`,
              ),
              onError: (e) => toast.error(`Não deu: ${(e as Error).message}`),
            },
          )
        }
      >
        <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Definir forma" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="boleto" className="text-xs">Boleto — entra na cobrança</SelectItem>
          <SelectItem value="cartao" className="text-xs">Cartão</SelectItem>
          <SelectItem value="avista" className="text-xs">À vista</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (ponto.problema === 'pago com valor zero') {
    return (
      <Button
        size="sm" variant="outline" className="h-8 text-xs"
        disabled={marcarIsentas.isPending}
        onClick={() =>
          marcarIsentas.mutate(
            { alunoId: ponto.referencia },
            {
              onSuccess: () => toast.success(`Parcelas de ${ponto.entidade} marcadas como isentas`),
              onError: (e) => toast.error(`Não deu: ${(e as Error).message}`),
            },
          )
        }
      >
        Marcar como isento
      </Button>
    );
  }

  return <span className="text-xs text-muted-foreground">confira na tela</span>;
}

/**
 * O que o financeiro está calculando errado sem avisar.
 *
 * Isto existe porque três bugs desta sprint tinham a mesma forma: um campo vazio que o
 * código lê como valor válido. Turma de investidor sem linha em `turma_responsaveis`
 * mandava 100% da recorrência ao IDM; aluno sem turma nunca entra na fila da cobrança,
 * mesmo com a cobrança aparecendo ligada na ficha dele. Nada disso dá erro na tela — por
 * isso ficou meses invisível.
 *
 * O painel fica fechado quando não há nada. Lista de alerta que grita à toa é lista que
 * ninguém lê.
 */

const ESTILO: Record<GravidadeIntegridade, { rotulo: string; classe: string }> = {
  alto:  { rotulo: 'Alto',  classe: 'bg-red-100 text-red-700 border-red-200' },
  medio: { rotulo: 'Médio', classe: 'bg-amber-100 text-amber-700 border-amber-200' },
  baixo: { rotulo: 'Baixo', classe: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function IntegridadeFinanceira() {
  const [aberto, setAberto] = useState(false);
  const { data: pontos = [], isLoading, isError, refetch, isFetching } = useIntegridadeFinanceira();

  // Sem permissão de financeiro a view devolve vazio, não erro — e aí não há o que mostrar.
  if (isLoading || (!pontos.length && !isError)) return null;

  if (isError) {
    return (
      <Card className="p-3 rounded-xl border-amber-200 bg-amber-50/60 mb-4">
        <p className="text-xs text-amber-800">
          Não foi possível conferir a integridade dos dados agora.{' '}
          <button className="underline font-medium" onClick={() => refetch()}>Tentar de novo</button>
        </p>
      </Card>
    );
  }

  const altos = pontos.filter(p => p.gravidade === 'alto').length;
  const emRisco = pontos.reduce((s, p) => s + Number(p.valor_em_risco || 0), 0);

  return (
    <Card className="rounded-xl border-primary/15 shadow-[0_4px_14px_-4px_rgba(169,51,86,0.15)] mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full p-3 lg:p-4 flex items-center justify-between gap-3 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
            altos ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
          }`}>
            {altos ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">
              {pontos.length} {pontos.length === 1 ? 'ponto precisa' : 'pontos precisam'} de conferência
            </h2>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
              {altos > 0 && <>{altos} de gravidade alta. </>}
              {emRisco > 0
                ? <>{brl(emRisco)} dependem de uma decisão para entrar na conta certa.</>
                : <>Nada em risco de dinheiro — são ajustes de cadastro.</>}
            </p>
          </div>
        </div>
        {aberto
          ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {aberto && (
        <div className="px-3 lg:px-4 pb-3 lg:pb-4 space-y-3 border-t border-border pt-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionBar
              title="Dados que o sistema aceita e calcula errado"
              subtitle="Campo em branco que vira um valor válido no cálculo: aluno sem turma some da cobrança, turma sem split manda a recorrência inteira ao IDM."
            />
            <Button
              size="sm" variant="outline" onClick={() => refetch()}
              disabled={isFetching} className="gap-1.5 flex-shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Reconferir
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                  <TableHead className="w-20">Gravidade</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>O que está errado</TableHead>
                  <TableHead className="text-right w-32">Em jogo</TableHead>
                  <TableHead className="w-48">Resolver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pontos.map((p, i) => (
                  <TableRow key={`${p.problema}-${p.referencia}`} className={premiumZebraRow(i)}>
                    <TableCell>
                      <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${ESTILO[p.gravidade].classe}`}>
                        {ESTILO[p.gravidade].rotulo}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{p.entidade}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{p.problema}</span>
                      <span className="block leading-tight">{p.efeito}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {Number(p.valor_em_risco) > 0 ? brl(Number(p.valor_em_risco)) : '—'}
                    </TableCell>
                    <TableCell><AcaoDaLinha ponto={p} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug">
            Turma, forma de pagamento e bolsa dá para resolver aqui mesmo — a lista some
            sozinha conforme cada uma é preenchida. O resto pede conferência humana: uma
            parcela vencida no cartão pode ter sido paga por fora e só faltar dar baixa.
          </p>
        </div>
      )}
    </Card>
  );
}
