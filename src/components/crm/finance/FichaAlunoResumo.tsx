import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { RefreshCw, ExternalLink, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { isPagamentoInadimplente } from '@/lib/financial-utils';

/**
 * Ficha do aluno SOMENTE LEITURA, pra abrir de dentro do Chat.
 *
 * A ficha completa e editavel (parcelas com baixa/estorno, contrato, upload,
 * PDF, edicao cadastral) continua sendo a de Financeiro.tsx e so existe la --
 * este componente nao duplica nem substitui aquela. Aqui nao ha nenhum
 * insert/update/delete: sao alunos pagantes reais e o codigo de parcela nao
 * tem cobertura de teste, entao a escrita fica concentrada em um lugar so.
 * Pra editar, o botao do rodape leva pra ficha completa no Financeiro.
 */

interface AlunoFicha {
  id: string;
  nome: string;
  turma_id: string | null;
  whatsapp: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  cidade_estado: string | null;
  origem_lead: string | null;
  status: string;
  forma_pagamento: string | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  data_matricula: string | null;
  mensalidades_pagas: number | null;
  total_mensalidades: number | null;
  forms_respondido: boolean | null;
  forms_respondido_em: string | null;
  contrato_enviado: boolean | null;
  contrato_enviado_em: string | null;
  contrato_assinado: boolean | null;
  contrato_assinado_em: string | null;
}

interface ParcelaFicha {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  data_prevista_pagamento: string | null;
}

const PARCELA_CFG: Record<string, { label: string; className: string }> = {
  pago:     { label: 'Pago',     className: 'bg-emerald-50 text-emerald-700' },
  atrasado: { label: 'Atrasado', className: 'bg-red-50 text-red-700' },
  pendente: { label: 'Pendente', className: 'bg-gray-100 text-gray-600' },
  isento:   { label: 'Isento',   className: 'bg-violet-50 text-violet-700' },
};

const METODO_LABEL: Record<string, string> = {
  boleto: 'Boleto',
  cartao: 'Cartão',
  avista: 'À vista',
};

function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try {
    const [y, m, dd] = d.split('T')[0].split('-');
    return `${dd}/${m}/${y}`;
  } catch {
    return d;
  }
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground/90 truncate" title={valor ?? undefined}>{valor || '—'}</p>
    </div>
  );
}

function Marco({ done, label, data }: { done: boolean; label: string; data?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {done
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-none" />
        : <Circle className="h-4 w-4 text-muted-foreground/40 flex-none" />}
      <span className={cn('text-sm', done ? 'text-foreground/90' : 'text-muted-foreground')}>{label}</span>
      {done && data && <span className="text-xs text-muted-foreground ml-auto">{fmtDate(data)}</span>}
    </div>
  );
}

export function FichaAlunoResumo({ alunoId, onClose, onEditarNoFinanceiro }: {
  alunoId: string;
  onClose: () => void;
  onEditarNoFinanceiro?: (alunoId: string) => void;
}) {
  const [aluno, setAluno] = useState<AlunoFicha | null>(null);
  const [turmaNome, setTurmaNome] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaFicha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      setErro(null);
      const [alunoRes, parcelasRes] = await Promise.all([
        supabase
          .from('alunos')
          .select('id, nome, turma_id, whatsapp, email, cpf, data_nascimento, cidade_estado, origem_lead, status, forma_pagamento, valor_mensalidade, dia_vencimento, data_matricula, mensalidades_pagas, total_mensalidades, forms_respondido, forms_respondido_em, contrato_enviado, contrato_enviado_em, contrato_assinado, contrato_assinado_em')
          .eq('id', alunoId)
          .maybeSingle(),
        supabase
          .from('pagamentos')
          .select('id, numero_parcela, valor, data_vencimento, data_pagamento, status, data_prevista_pagamento')
          .eq('aluno_id', alunoId)
          .order('numero_parcela', { ascending: true }),
      ]);
      if (cancelado) return;

      if (alunoRes.error || !alunoRes.data) {
        setErro(alunoRes.error?.message ?? 'Aluno não encontrado');
        setLoading(false);
        return;
      }
      const a = alunoRes.data as AlunoFicha;
      setAluno(a);
      setParcelas((parcelasRes.data ?? []) as ParcelaFicha[]);

      if (a.turma_id) {
        const { data: t } = await supabase.from('turmas').select('nome').eq('id', a.turma_id).maybeSingle();
        if (!cancelado) setTurmaNome(t?.nome ?? null);
      } else {
        setTurmaNome(null);
      }
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [alunoId]);

  const emAtraso = parcelas.filter(p => isPagamentoInadimplente(p));
  const valorEmAtraso = emAtraso.reduce((s, p) => s + Number(p.valor ?? 0), 0);
  const encerrado = aluno?.status === 'cancelado' || aluno?.status === 'concluido';

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{loading ? 'Carregando…' : (aluno?.nome ?? 'Ficha do aluno')}</DialogTitle>
          <DialogDescription>
            {turmaNome ? `Turma: ${turmaNome}` : 'Sem turma atribuída'}
            {aluno && ` · status ${aluno.status}`}
            {' — '}somente leitura
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <p className="text-sm text-muted-foreground">{erro}</p>
          </div>
        ) : aluno && (
          <div className="space-y-5">
            {!encerrado && (
              <div className={cn('rounded-lg border p-3 text-sm',
                emAtraso.length
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
                {emAtraso.length
                  ? `${emAtraso.length} parcela(s) em atraso — ${fmtBRL(valorEmAtraso)}`
                  : 'Em dia — nenhuma parcela em atraso'}
              </div>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cadastro</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo label="WhatsApp" valor={aluno.whatsapp} />
                <Campo label="E-mail" valor={aluno.email} />
                <Campo label="CPF" valor={aluno.cpf} />
                <Campo label="Nascimento" valor={fmtDate(aluno.data_nascimento)} />
                <Campo label="Cidade / Estado" valor={aluno.cidade_estado} />
                <Campo label="Origem" valor={aluno.origem_lead} />
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Financeiro</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Campo label="Pagamento" valor={METODO_LABEL[aluno.forma_pagamento ?? ''] ?? aluno.forma_pagamento} />
                <Campo label="Mensalidade" valor={aluno.valor_mensalidade != null ? fmtBRL(aluno.valor_mensalidade) : null} />
                <Campo label="Vencimento" valor={aluno.dia_vencimento ? `Dia ${aluno.dia_vencimento}` : null} />
                <Campo label="Matrícula" valor={fmtDate(aluno.data_matricula)} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {parcelas.filter(p => p.status === 'pago').length} de {parcelas.length || (aluno.total_mensalidades ?? 0)} parcela(s) paga(s)
              </p>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parcelas</h4>
              {parcelas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma parcela cadastrada.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                        <th className="text-left px-3 py-2 font-medium">Valor</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Pago em</th>
                        <th className="text-left px-3 py-2 font-medium">Previsão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map(p => {
                        const atrasada = isPagamentoInadimplente(p);
                        const cfg = PARCELA_CFG[atrasada && p.status !== 'atrasado' ? 'atrasado' : p.status]
                          ?? PARCELA_CFG.pendente;
                        return (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">{p.numero_parcela}</td>
                            <td className="px-3 py-2">{fmtDate(p.data_vencimento)}</td>
                            <td className="px-3 py-2">{fmtBRL(p.valor)}</td>
                            <td className="px-3 py-2">
                              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>{cfg.label}</span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.data_pagamento)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.data_prevista_pagamento)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Contrato</h4>
              <div className="space-y-1.5">
                <Marco done={!!aluno.forms_respondido}  label="Formulário respondido" data={aluno.forms_respondido_em} />
                <Marco done={!!aluno.contrato_enviado}  label="Contrato enviado"      data={aluno.contrato_enviado_em} />
                <Marco done={!!aluno.contrato_assinado} label="Contrato assinado"     data={aluno.contrato_assinado_em} />
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          {aluno && onEditarNoFinanceiro && (
            <Button variant="outline" onClick={() => onEditarNoFinanceiro(aluno.id)} className="mr-auto gap-1.5">
              <ExternalLink className="h-4 w-4" /> Editar no Financeiro
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
