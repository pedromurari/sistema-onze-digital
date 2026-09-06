/**
 * ComissoesFechamento.tsx
 * Painel de fechamento de comissão dos vendedores (Helen/Miguel) -- pedido
 * explícito do dono do produto (2026-09-06): visibilidade de cada venda,
 * com contexto completo, pra conferir e pagar a comissão certa no dia 30.
 * Cobre psicanálise (já tem fórmula fechada: R$147 à vista/cartão parcelado
 * no preço padrão, R$75 = 50% da 1ª parcela recorrente/boleto) e PNL
 * (preço negociado por venda -- confirmado que também é 10% do LÍQUIDO,
 * ex: venda de R$497 no cartão rendeu R$472,24 líquido = R$47,22).
 *
 * Acesso restrito ao Pedro (pdrmurari@gmail.com) -- pedido explícito
 * "somente eu posso conseguir ver". A trava real está na RLS da tabela
 * (auth.uid() = id fixo do profile do Pedro); a checagem de e-mail aqui é
 * só pra não renderizar a aba pra mais ninguém -- sem ela, qualquer outra
 * pessoa logada só veria uma tabela vazia (RLS bloqueia a leitura), mas
 * mostrar a aba já entregaria que esse painel existe.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ComissaoRow {
  id: string;
  vendedor: string;
  aluno_id: string | null;
  aluno_nome: string;
  produto: string | null;
  forma_pagamento: string | null;
  valor_venda: number;
  valor_comissao: number;
  origem: 'auto' | 'manual';
  status: 'pendente' | 'reservado' | 'pago';
  data_venda: string;
  data_pagamento: string | null;
  observacoes: string | null;
}

const PRODUTO_LABEL: Record<string, string> = {
  psicanalise: 'Psicanálise',
  'pnl-practitioner': 'PNL Practitioner',
  'pnl-master': 'PNL Master',
  numerologia: 'Numerologia',
};

const FORMA_LABEL: Record<string, string> = {
  avista: 'À vista',
  cartao: 'Cartão',
  cartao_parcelado: 'Cartão parcelado',
  cartao_recorrente: 'Cartão recorrente',
  boleto: 'Boleto',
};

const STATUS_LABEL: Record<ComissaoRow['status'], string> = {
  pendente: 'Pendente',
  reservado: 'Reservado (cofrinho)',
  pago: 'Pago',
};

const fmtBRL = (v: number) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ComissoesFechamento() {
  const [rows, setRows] = useState<ComissaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('comissoes_vendedores')
      .select('*')
      .order('data_venda', { ascending: false });
    if (error) {
      console.error('[ComissoesFechamento] erro ao carregar', error);
      toast.error('Erro ao carregar comissões.');
    } else {
      setRows((data ?? []) as ComissaoRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    const { data, error } = await (supabase as any).rpc('comissoes_sincronizar_vendas');
    if (error) {
      console.error('[ComissoesFechamento] erro ao sincronizar', error);
      toast.error('Erro ao buscar novas vendas.');
    } else {
      const inseridos = data?.[0]?.inseridos ?? 0;
      toast.success(inseridos > 0 ? `${inseridos} venda(s) nova(s) importada(s).` : 'Nenhuma venda nova encontrada.');
      await carregar();
    }
    setSincronizando(false);
  };

  const atualizarCampo = async (id: string, patch: Partial<ComissaoRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    setSalvandoId(id);
    const { error } = await (supabase as any).from('comissoes_vendedores').update(patch).eq('id', id);
    if (error) {
      console.error('[ComissoesFechamento] erro ao salvar', error);
      toast.error('Erro ao salvar alteração.');
      await carregar();
    }
    setSalvandoId(null);
  };

  const excluir = async (id: string) => {
    if (!confirm('Remover esta linha de comissão? (não afeta a matrícula do aluno)')) return;
    setRows(prev => prev.filter(r => r.id !== id));
    const { error } = await (supabase as any).from('comissoes_vendedores').delete().eq('id', id);
    if (error) {
      console.error('[ComissoesFechamento] erro ao excluir', error);
      toast.error('Erro ao remover linha.');
      await carregar();
    }
  };

  const adicionarManual = async () => {
    const vendedor = prompt('Nome do vendedor (exatamente "Helen Magna" ou "Miguel Fogaça", pra agrupar certinho):', 'Helen Magna');
    if (!vendedor?.trim()) return;
    const aluno_nome = prompt('Nome do aluno/cliente:');
    if (!aluno_nome?.trim()) return;
    const { error } = await (supabase as any).from('comissoes_vendedores').insert({
      vendedor: vendedor.trim(),
      aluno_nome: aluno_nome.trim(),
      origem: 'manual',
      valor_venda: 0,
      valor_comissao: 0,
    });
    if (error) {
      console.error('[ComissoesFechamento] erro ao adicionar', error);
      toast.error('Erro ao adicionar linha manual.');
    } else {
      await carregar();
    }
  };

  const porVendedor = rows.reduce<Record<string, ComissaoRow[]>>((acc, r) => {
    (acc[r.vendedor] ??= []).push(r);
    return acc;
  }, {});
  // Vendedores com pelo menos uma linha primeiro; ordem estável por nome.
  const vendedoresOrdenados = Object.keys(porVendedor).sort((a, b) => a.localeCompare(b));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando comissões...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-md">
          Cada venda de Helen/Miguel (psicanálise + PNL) com o contexto completo. Confira o valor da comissão (o líquido real
          da venda, quando aplicável) antes de marcar como paga.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={adicionarManual}>
            + Linha manual
          </Button>
          <Button size="sm" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Buscar novas vendas
          </Button>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8 border border-dashed border-border rounded-lg">
          Nenhuma comissão registrada ainda. Clique em "Buscar novas vendas" pra importar as matrículas já pagas.
        </p>
      )}

      {vendedoresOrdenados.map(vendedor => (
        <TabelaVendedor
          key={vendedor}
          vendedor={vendedor}
          rows={porVendedor[vendedor]}
          salvandoId={salvandoId}
          onAtualizar={atualizarCampo}
          onExcluir={excluir}
        />
      ))}
    </div>
  );
}

function TabelaVendedor({
  vendedor, rows, salvandoId, onAtualizar, onExcluir,
}: {
  vendedor: string;
  rows: ComissaoRow[];
  salvandoId: string | null;
  onAtualizar: (id: string, patch: Partial<ComissaoRow>) => void;
  onExcluir: (id: string) => void;
}) {
  const totais = rows.reduce((acc, r) => { acc[r.status] += Number(r.valor_comissao); return acc; }, { pendente: 0, reservado: 0, pago: 0 });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-border bg-card px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">{vendedor}</p>
        <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
          <span>Pendente: <strong className="text-foreground">R$ {fmtBRL(totais.pendente)}</strong></span>
          <span>Reservado: <strong className="text-foreground">R$ {fmtBRL(totais.reservado)}</strong></span>
          <span>Pago: <strong className="text-foreground">R$ {fmtBRL(totais.pago)}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Produto / Forma</TableHead>
              <TableHead className="text-right">Valor venda</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.data_venda + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-xs">{r.aluno_nome}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.produto ? (PRODUTO_LABEL[r.produto] ?? r.produto) : '—'}
                  {r.forma_pagamento ? ` · ${FORMA_LABEL[r.forma_pagamento] ?? r.forma_pagamento}` : ''}
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap">R$ {fmtBRL(r.valor_venda)}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number" step="0.01" defaultValue={r.valor_comissao}
                    className="h-7 w-24 text-xs text-right ml-auto"
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== r.valor_comissao) onAtualizar(r.id, { valor_comissao: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => onAtualizar(r.id, { status: v as ComissaoRow['status'], data_pagamento: v === 'pago' ? new Date().toISOString().slice(0, 10) : r.data_pagamento })}>
                    <SelectTrigger className="h-7 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as ComissaoRow['status'][]).map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <Textarea
                    defaultValue={r.observacoes ?? ''}
                    placeholder="Ex: reservado no cofrinho MP..."
                    className="text-xs min-h-7 h-7 resize-y"
                    onBlur={e => {
                      const v = e.target.value;
                      if (v !== (r.observacoes ?? '')) onAtualizar(r.id, { observacoes: v || null });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {salvandoId === r.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExcluir(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
