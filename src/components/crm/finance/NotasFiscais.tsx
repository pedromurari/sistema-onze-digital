import { useMemo, useState } from 'react';
import { ExternalLink, FileCheck2, Loader2, ReceiptText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAlunos, useBalancoConfig, useInvalidarDados, usePagamentos } from '@/lib/db';
import { getContaLabel } from '@/lib/contas';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface PagamentoNota {
  id: string;
  aluno_id: string | null;
  produto: string | null;
  mes_referencia: string;
  valor: number | null;
  conta_recebimento: string | null;
  data_pagamento: string | null;
  status: string | null;
  nf_status: string;
  nf_numero: string | null;
  nf_link: string | null;
  nf_emitida_em: string | null;
  observacoes: string | null;
}

interface AlunoNota {
  id: string;
  nome: string;
}

const COLUNAS_NOTA = [
  'id', 'aluno_id', 'produto', 'mes_referencia', 'valor', 'conta_recebimento',
  'data_pagamento', 'status', 'nf_status', 'nf_numero', 'nf_link', 'nf_emitida_em',
  'observacoes',
].join(', ');

const formatarMoeda = (valor: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor ?? 0);

const formatarData = (valor: string | null) => {
  if (!valor) return '—';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
};

const formatarCompetencia = (valor: string) => {
  const [ano, mes] = valor.slice(0, 7).split('-').map(Number);
  if (!ano || !mes) return valor;
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
    .format(new Date(ano, mes - 1, 1))
    .replace('.', '');
};

const labelProduto = (produto: string | null) => {
  if (produto === 'psicanalise') return 'Psicanálise';
  if (produto === 'numerologia') return 'Numerologia';
  return produto || 'Não informado';
};

/**
 * Links são informados manualmente depois da emissão na Agilize. Validar o protocolo
 * antes de renderizar evita transformar um dado digitado em um link executável inseguro.
 */
const linkSeguro = (valor: string | null) => {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const filtrarEOrdenar = (lista: PagamentoNota[], competencia: string, produto: string) => lista
  .filter((pagamento) => competencia === 'todos' || pagamento.mes_referencia.startsWith(competencia))
  .filter((pagamento) => produto === 'todos' || pagamento.produto === produto)
  // Os dois `filter` acima já criam um array novo; ordenar aqui não muta o cache do
  // React Query e mantém compatibilidade com o alvo ES2020 usado pelo projeto.
  .sort((a, b) => a.mes_referencia.localeCompare(b.mes_referencia) ||
    (a.data_pagamento || '').localeCompare(b.data_pagamento || ''));

export function NotasFiscais() {
  const { data: pagamentos = [], isLoading, error } = usePagamentos<PagamentoNota>(COLUNAS_NOTA);
  const { data: alunos = [] } = useAlunos<AlunoNota>('id, nome');
  const { data: config } = useBalancoConfig<{ inicio_operacao_fiscal: string }>();
  const invalidar = useInvalidarDados();

  // Corte da operação fiscal: nada anterior a esta data entra na fila de NFS-e --
  // decisão explícita do dono do produto (nada retroativo, ver balanco_config).
  const corteFiscal = config?.inicio_operacao_fiscal ?? '2026-09-01';

  const [competencia, setCompetencia] = useState('todos');
  const [produto, setProduto] = useState('todos');
  const [emitindo, setEmitindo] = useState<PagamentoNota | null>(null);
  const [dispensando, setDispensando] = useState<PagamentoNota | null>(null);
  const [nfNumero, setNfNumero] = useState('');
  const [nfLink, setNfLink] = useState('');
  const [motivoDispensa, setMotivoDispensa] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const nomesPorAluno = useMemo(
    () => new Map(alunos.map((aluno) => [aluno.id, aluno.nome])),
    [alunos],
  );

  // A fila fiscal nasce exclusivamente de caixa realizado E a partir do corte:
  // parcela pendente não gera obrigação aqui, e parcela paga antes de
  // `corteFiscal` fica de fora (nada retroativo).
  const pagas = useMemo(
    () => pagamentos.filter((pagamento) =>
      pagamento.status === 'pago' &&
      !!pagamento.data_pagamento &&
      pagamento.data_pagamento.slice(0, 10) >= corteFiscal,
    ),
    [pagamentos, corteFiscal],
  );

  const competencias = useMemo(
    () => [...new Set(pagas.map((pagamento) => pagamento.mes_referencia.slice(0, 7)))].sort(),
    [pagas],
  );

  const produtos = useMemo(
    () => [...new Set(pagas.map((pagamento) => pagamento.produto).filter(Boolean) as string[])].sort(),
    [pagas],
  );

  const pendentes = useMemo(
    () => filtrarEOrdenar(
      pagas.filter((pagamento) => pagamento.nf_status === 'nao_emitida'),
      competencia,
      produto,
    ),
    [pagas, competencia, produto],
  );

  const emitidas = useMemo(
    () => filtrarEOrdenar(
      pagas.filter((pagamento) => pagamento.nf_status === 'emitida'),
      competencia,
      produto,
    ),
    [pagas, competencia, produto],
  );

  const totalPendente = useMemo(
    () => pendentes.reduce((total, pagamento) => total + (pagamento.valor ?? 0), 0),
    [pendentes],
  );

  const abrirEmissao = (pagamento: PagamentoNota) => {
    setEmitindo(pagamento);
    setNfNumero(pagamento.nf_numero || '');
    setNfLink(pagamento.nf_link || '');
  };

  const marcarEmitida = async () => {
    if (!emitindo || !nfNumero.trim()) return;
    if (nfLink.trim() && !linkSeguro(nfLink.trim())) {
      toast({ variant: 'destructive', title: 'Link inválido', description: 'Informe uma URL iniciada por http:// ou https://.' });
      return;
    }

    setSalvandoId(emitindo.id);
    const { error: updateError } = await supabase
      .from('pagamentos')
      .update({
        nf_status: 'emitida',
        nf_numero: nfNumero.trim(),
        nf_link: nfLink.trim() || null,
        nf_emitida_em: new Date().toISOString(),
      })
      .eq('id', emitindo.id);
    setSalvandoId(null);

    if (updateError) {
      toast({ variant: 'destructive', title: 'Não foi possível marcar a nota', description: updateError.message });
      return;
    }

    invalidar('pagamentos');
    setEmitindo(null);
    toast({ title: 'Nota fiscal marcada como emitida' });
  };

  const dispensar = async () => {
    if (!dispensando || !motivoDispensa.trim()) return;
    const registroDispensa = `Dispensa de NFS-e: ${motivoDispensa.trim()}`;
    const observacoes = [dispensando.observacoes?.trim(), registroDispensa].filter(Boolean).join('\n');

    setSalvandoId(dispensando.id);
    const { error: updateError } = await supabase
      .from('pagamentos')
      .update({ nf_status: 'dispensada', observacoes })
      .eq('id', dispensando.id);
    setSalvandoId(null);

    if (updateError) {
      toast({ variant: 'destructive', title: 'Não foi possível dispensar a nota', description: updateError.message });
      return;
    }

    invalidar('pagamentos');
    setDispensando(null);
    setMotivoDispensa('');
    toast({ title: 'Emissão dispensada', description: 'O motivo foi registrado na parcela.' });
  };

  const tabela = (lista: PagamentoNota[], somenteLeitura = false) => (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aluno</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Competência</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {somenteLeitura ? <TableHead>Nota fiscal</TableHead> : <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                Nenhuma parcela encontrada para os filtros selecionados.
              </TableCell>
            </TableRow>
          ) : lista.map((pagamento) => {
            const url = linkSeguro(pagamento.nf_link);
            return (
              <TableRow key={pagamento.id}>
                <TableCell className="font-medium">{nomesPorAluno.get(pagamento.aluno_id || '') || 'Aluno não encontrado'}</TableCell>
                <TableCell><Badge variant="outline">{labelProduto(pagamento.produto)}</Badge></TableCell>
                <TableCell className="capitalize">{formatarCompetencia(pagamento.mes_referencia)}</TableCell>
                <TableCell>{getContaLabel(pagamento.conta_recebimento)}</TableCell>
                <TableCell>{formatarData(pagamento.data_pagamento)}</TableCell>
                <TableCell className="text-right font-medium">{formatarMoeda(pagamento.valor)}</TableCell>
                {somenteLeitura ? (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{pagamento.nf_numero || 'Sem número'}</span>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline" aria-label={`Abrir nota ${pagamento.nf_numero || ''}`}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                ) : (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => abrirEmissao(pagamento)}>
                        <FileCheck2 className="mr-1.5 h-4 w-4" /> Marcar emitida
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDispensando(pagamento)}>
                        Dispensar
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Notas Fiscais</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Controle das NFS-e das parcelas recebidas <strong>a partir de {formatarData(corteFiscal)}</strong>{' '}
            (histórico anterior não entra na fila). A emissão é feita no painel da Agilize em
            <strong> Notas de serviço → Emitir nota</strong>; depois, registre o resultado aqui.
            CNAE 8599-6/04 · atividade 05762.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Fila atual</p>
              <p className="text-xl font-semibold">
                {pendentes.length} {pendentes.length === 1 ? 'nota a emitir' : 'notas a emitir'} · {formatarMoeda(totalPendente)}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={competencia} onValueChange={setCompetencia}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filtrar por competência">
                  <SelectValue placeholder="Competência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as competências</SelectItem>
                  {competencias.map((item) => <SelectItem key={item} value={item}>{formatarCompetencia(item)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={produto} onValueChange={setProduto}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filtrar por produto">
                  <SelectValue placeholder="Produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os produtos</SelectItem>
                  {produtos.map((item) => <SelectItem key={item} value={item}>{labelProduto(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex h-52 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando parcelas…
          </div>
        ) : error ? (
          <Card className="border-destructive/30"><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar as notas fiscais.</CardContent></Card>
        ) : (
          <Tabs defaultValue="pendentes">
            <TabsList>
              <TabsTrigger value="pendentes">A emitir ({pendentes.length})</TabsTrigger>
              <TabsTrigger value="emitidas">Emitidas ({emitidas.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pendentes" className="mt-4">{tabela(pendentes)}</TabsContent>
            <TabsContent value="emitidas" className="mt-4">{tabela(emitidas, true)}</TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={Boolean(emitindo)} onOpenChange={(aberto) => !aberto && setEmitindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar nota emitida</DialogTitle>
            <DialogDescription>
              Informe os dados da NFS-e emitida na Agilize. Esta ação apenas controla a fila; ela não emite a nota.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nf-numero">Número da nota *</Label>
              <Input id="nf-numero" value={nfNumero} onChange={(event) => setNfNumero(event.target.value)} placeholder="Ex.: 000123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nf-link">Link da nota</Label>
              <Input id="nf-link" type="url" value={nfLink} onChange={(event) => setNfLink(event.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitindo(null)}>Cancelar</Button>
            <Button onClick={marcarEmitida} disabled={!nfNumero.trim() || salvandoId === emitindo?.id}>
              {salvandoId === emitindo?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar emissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dispensando)} onOpenChange={(aberto) => { if (!aberto) { setDispensando(null); setMotivoDispensa(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispensar emissão</DialogTitle>
            <DialogDescription>
              Registre por que esta parcela não exige NFS-e. O motivo será preservado nas observações financeiras.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="motivo-dispensa">Motivo *</Label>
            <Textarea id="motivo-dispensa" value={motivoDispensa} onChange={(event) => setMotivoDispensa(event.target.value)} placeholder="Descreva o motivo da dispensa" rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDispensando(null); setMotivoDispensa(''); }}>Cancelar</Button>
            <Button onClick={dispensar} disabled={!motivoDispensa.trim() || salvandoId === dispensando?.id}>
              {salvandoId === dispensando?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar dispensa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
