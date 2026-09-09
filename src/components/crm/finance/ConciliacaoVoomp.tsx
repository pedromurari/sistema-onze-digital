import { useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePagamentos, useAlunos, useTurmas, useInvalidarDados } from '@/lib/db';
import { fmtBRL } from '@/lib/financial-utils';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

/**
 * Conciliação Voomp × sistema (Fase 2.4 — ver docs/FINANCEIRO.md).
 *
 * A Voomp repassa o LÍQUIDO (já com a taxa dela) e não informa aluno/parcela,
 * só a turma e o valor. O sistema registra o BRUTO e não sabe que veio da Voomp.
 * Esta tela cola o extrato, casa cada venda com a parcela paga do sistema
 * (por turma + data), e ao confirmar grava `conta_recebimento='voomp'` e a
 * `taxa_valor` real (bruto − líquido) naquela parcela.
 *
 * Sem integração de API — o extrato é colado à mão a cada fechamento.
 */

interface VendaVoomp {
  data: string;        // ISO 'YYYY-MM-DD'
  id: string;
  turmaKey: string;    // '02326', '02526/2', ...
  liquido: number;
  dispEm: string | null;
}
interface SaqueVoomp { data: string; valor: number; }

interface ParcelaSis {
  id: string;
  aluno_id: string | null;
  turma_id: string | null;
  valor: number | null;
  data_pagamento: string | null;
  numero_parcela: number | null;
  conta_recebimento: string | null;
}

// dd/mm/aaaa -> aaaa-mm-dd
const brToIso = (d: string) => {
  const m = d.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const parseValor = (s: string) => Number(s.replace(/[^\d,-]/g, '').replace('.', '').replace(',', '.')) || 0;
// '#02326', '#02526/2', '#02226 #11ds' -> '02326' / '02526/2' / '02226'
const turmaKeyFrom = (s: string) => {
  const m = s.match(/#(\d{3,6}(?:\/\d+)?)/);
  return m ? m[1] : '';
};
const diffDias = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

function parseExtrato(txt: string): { vendas: VendaVoomp[]; saques: SaqueVoomp[] } {
  const linhas = txt.split('\n').map((l) => l.replace(/\r/g, ''));
  const vendas: VendaVoomp[] = [];
  const saques: SaqueVoomp[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const cols = linhas[i].split('\t').map((c) => c.trim());
    const data = brToIso(cols[0] || '');
    if (!data) continue;
    const tipo = (cols[1] || '').toLowerCase();
    if (tipo === 'venda') {
      const id = cols[2] || '';
      const produto = cols[3] || '';
      const liquido = parseValor(cols[4] || '');
      // a data "Disponível em" costuma vir na linha seguinte, após "Boleto"
      const prox = (linhas[i + 1] || '').split('\t').map((c) => c.trim());
      const dispEm = brToIso(prox.find((c) => /\d{2}\/\d{2}\/\d{4}/.test(c)) || '');
      if (liquido > 0) vendas.push({ data, id, turmaKey: turmaKeyFrom(produto), liquido, dispEm: dispEm || null });
    } else if (tipo === 'saque') {
      const v = Math.abs(parseValor(cols.find((c) => /R\$/.test(c)) || cols[4] || ''));
      if (v > 0) saques.push({ data, valor: v });
    }
  }
  return { vendas, saques };
}

export function ConciliacaoVoomp() {
  const [texto, setTexto] = useState('');
  const [parsed, setParsed] = useState<{ vendas: VendaVoomp[]; saques: SaqueVoomp[] } | null>(null);
  const [confirmadas, setConfirmadas] = useState<Set<number>>(new Set()); // índices de vendas
  const [aplicando, setAplicando] = useState(false);

  const { data: pagamentos = [] } = usePagamentos<ParcelaSis>(
    'id, aluno_id, turma_id, valor, data_pagamento, numero_parcela, conta_recebimento',
  );
  const { data: alunos = [] } = useAlunos<{ id: string; nome: string }>('id, nome');
  const { data: turmas = [] } = useTurmas();
  const invalidar = useInvalidarDados();

  const nomeAluno = useMemo(() => new Map(alunos.map((a) => [a.id, a.nome])), [alunos]);
  const turmaKeyById = useMemo(
    () => new Map(turmas.map((t) => [t.id, turmaKeyFrom(t.nome || '')])),
    [turmas],
  );

  // Sugestão de par: parcela paga da mesma turma, data mais próxima (±3 dias),
  // ainda sem conta_voomp e não usada por outra venda.
  const sugestoes = useMemo(() => {
    if (!parsed) return [];
    const usados = new Set<string>();
    return parsed.vendas.map((venda) => {
      const cand = pagamentos
        .filter((p) => p.data_pagamento && p.conta_recebimento !== 'voomp' && !usados.has(p.id))
        .filter((p) => turmaKeyById.get(p.turma_id || '') === venda.turmaKey)
        .map((p) => ({ p, dist: diffDias(p.data_pagamento!, venda.data) }))
        .filter((x) => x.dist <= 3)
        .sort((a, b) => a.dist - b.dist);
      const par = cand[0]?.p ?? null;
      if (par) usados.add(par.id);
      const taxa = par ? Math.max(0, Number(par.valor || 0) - venda.liquido) : 0;
      return { venda, par, taxa };
    });
  }, [parsed, pagamentos, turmaKeyById]);

  const parcelasVoompNoSistema = useMemo(
    () => pagamentos.filter((p) => p.conta_recebimento === 'voomp'),
    [pagamentos],
  );

  const totalSacado = parsed?.saques.reduce((s, x) => s + x.valor, 0) ?? 0;
  const totalConfirmadoTaxa = sugestoes.reduce((s, x, i) => (confirmadas.has(i) && x.par ? s + x.taxa : s), 0);
  const qtdComPar = sugestoes.filter((x) => x.par).length;

  function toggle(i: number) {
    setConfirmadas((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }
  function marcarTodas() {
    setConfirmadas(new Set(sugestoes.map((x, i) => (x.par ? i : -1)).filter((i) => i >= 0)));
  }

  async function aplicar() {
    const alvos = sugestoes.filter((x, i) => confirmadas.has(i) && x.par);
    if (alvos.length === 0) return;
    setAplicando(true);
    let ok = 0;
    for (const { par, taxa } of alvos) {
      const { error } = await supabase
        .from('pagamentos')
        .update({ conta_recebimento: 'voomp', taxa_valor: Math.round(taxa * 100) / 100 })
        .eq('id', par!.id);
      if (!error) ok++;
    }
    setAplicando(false);
    invalidar('pagamentos');
    setConfirmadas(new Set());
    toast({ title: `${ok} parcela(s) conciliada(s)`, description: 'conta = Voomp + taxa real gravadas' });
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto pb-20 lg:pb-6">
      <div>
        <h1 className="text-xl font-bold">Conciliação Voomp</h1>
        <p className="text-xs text-muted-foreground">
          Cole o extrato da Voomp. O sistema casa cada venda com a parcela paga (por turma + data) e grava a taxa real.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Cole aqui as linhas do Extrato Financeiro da Voomp (Ctrl+A na tabela, Ctrl+C, Ctrl+V)…'}
          rows={6}
          className="text-xs font-mono"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setParsed(parseExtrato(texto)); setConfirmadas(new Set()); }} disabled={!texto.trim()}>
            Ler extrato
          </Button>
          {parsed && (
            <span className="text-xs text-muted-foreground">
              {parsed.vendas.length} vendas · {parsed.saques.length} saques · {qtdComPar} com par no sistema
            </span>
          )}
        </div>
      </Card>

      {parsed && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4" /> Caixa
              </div>
              <span className="text-xs text-muted-foreground">
                Sacado no período (caiu no banco): <strong className="text-foreground">{fmtBRL(totalSacado)}</strong> em {parsed.saques.length} saque(s)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parsed.saques.map((s, i) => (
                <Badge key={i} variant="outline" className="text-[11px]">
                  {s.data.split('-').reverse().slice(0, 2).join('/')} · {fmtBRL(s.valor)}
                </Badge>
              ))}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border/60">
              <div className="text-sm font-medium">Vendas Voomp × parcelas do sistema</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={marcarTodas}>Marcar todas c/ par</Button>
                <Button size="sm" className="text-xs h-7 gap-1.5" onClick={aplicar} disabled={aplicando || confirmadas.size === 0}>
                  {aplicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Aplicar {confirmadas.size ? `(${confirmadas.size})` : ''}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Voomp — pgto</th>
                    <th className="text-left p-2">Turma</th>
                    <th className="text-right p-2">Líquido</th>
                    <th className="text-center p-2"></th>
                    <th className="text-left p-2">Parcela no sistema</th>
                    <th className="text-right p-2">Bruto</th>
                    <th className="text-right p-2">Taxa</th>
                    <th className="text-center p-2">Conciliar</th>
                  </tr>
                </thead>
                <tbody>
                  {sugestoes.map(({ venda, par, taxa }, i) => (
                    <tr key={venda.id} className={`border-t border-border/40 ${!par ? 'bg-amber-50/50' : ''}`}>
                      <td className="p-2 whitespace-nowrap">{venda.data.split('-').reverse().slice(0, 2).join('/')}</td>
                      <td className="p-2">#{venda.turmaKey || '—'}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBRL(venda.liquido)}</td>
                      <td className="p-2 text-center text-muted-foreground"><ArrowRight className="h-3 w-3 inline" /></td>
                      <td className="p-2">
                        {par
                          ? <span>{nomeAluno.get(par.aluno_id || '') || 'Aluno'} · p{par.numero_parcela} · {par.data_pagamento?.split('-').reverse().slice(0, 2).join('/')}</span>
                          : <span className="text-amber-700">sem par — venda sem baixa correspondente</span>}
                      </td>
                      <td className="p-2 text-right tabular-nums">{par ? fmtBRL(Number(par.valor || 0)) : '—'}</td>
                      <td className="p-2 text-right tabular-nums text-red-600">{par ? `−${fmtBRL(taxa)}` : '—'}</td>
                      <td className="p-2 text-center">
                        {par && (
                          <input type="checkbox" checked={confirmadas.has(i)} onChange={() => toggle(i)} className="h-3.5 w-3.5 align-middle" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
              <span>{parcelasVoompNoSistema.length} parcela(s) já marcada(s) como Voomp no sistema</span>
              <span>Taxa a gravar nos confirmados: <strong className="text-foreground">{fmtBRL(totalConfirmadoTaxa)}</strong></span>
            </div>
          </Card>

          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <span>Linha em amarelo = venda na Voomp sem baixa no sistema (parcela não deu baixa, ou a data está fora de ±3 dias). Confira essas antes de fechar o mês.</span>
          </p>
        </>
      )}
    </div>
  );
}
