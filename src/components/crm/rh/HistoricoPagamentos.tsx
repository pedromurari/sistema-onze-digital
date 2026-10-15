import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, FileText, Loader2, Paperclip, Plus, ReceiptText, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Profissional = Database['public']['Tables']['profissionais']['Row'];
type Pagamento = Database['public']['Tables']['profissionais_pagamentos']['Row'] & {
  turmas?: { nome: string } | null;
};
type Turma = { id: string; nome: string };

const BUCKET = 'profissionais-pagamentos';

function formatReal(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(data: string) {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function abrirArquivo(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) return toast.error('Não foi possível abrir o arquivo.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

function usePagamentos(profissionalId: string) {
  const [itens, setItens] = useState<Pagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from('profissionais_pagamentos')
      .select('*, turmas(nome)')
      .eq('profissional_id', profissionalId)
      .order('data_pagamento', { ascending: false });
    if (error) setErro(error.message);
    else { setItens((data as Pagamento[]) ?? []); setErro(''); }
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, [profissionalId]);

  return { itens, carregando, erro, recarregar: carregar };
}

function AnexoUpload({
  label, path, nome, caminhoBase, onChange,
}: {
  label: string;
  path: string | null;
  nome: string | null;
  caminhoBase: string;
  onChange: (path: string | null, nome: string | null) => void;
}) {
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File) {
    setEnviando(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const destino = `${caminhoBase}/${label === 'Comprovante' ? 'comprovante' : 'nota-fiscal'}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(destino, file, { upsert: true });
    setEnviando(false);
    if (error) return toast.error(`Erro no upload: ${error.message}`);
    onChange(destino, file.name);
  }

  async function remover() {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    onChange(null, null);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {path ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="flex-1 truncate text-sm text-emerald-800" title={nome ?? ''}>{nome || label}</span>
          <button type="button" onClick={() => void abrirArquivo(path)} className="shrink-0 text-emerald-700 hover:text-emerald-900" aria-label={`Ver ${label}`}>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => void remover()} className="shrink-0 text-destructive/70 hover:text-destructive" aria-label={`Remover ${label}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {enviando ? 'Enviando...' : `Anexar ${label.toLowerCase()}`}
          <input type="file" className="hidden" disabled={enviando} accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

function PagamentoDialog({
  profissional, pagamento, fechar,
}: { profissional: Profissional; pagamento: Pagamento | null; fechar: (salvou: boolean) => void }) {
  const [id] = useState(() => pagamento?.id ?? crypto.randomUUID());
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [form, setForm] = useState(() => ({
    data_pagamento: pagamento?.data_pagamento ?? new Date().toISOString().slice(0, 10),
    valor: pagamento?.valor?.toString() ?? '',
    descricao: pagamento?.descricao ?? '',
    turma_id: pagamento?.turma_id ?? '',
    comprovante_arquivo_url: pagamento?.comprovante_arquivo_url ?? null as string | null,
    comprovante_arquivo_nome: pagamento?.comprovante_arquivo_nome ?? null as string | null,
    nota_fiscal_arquivo_url: pagamento?.nota_fiscal_arquivo_url ?? null as string | null,
    nota_fiscal_arquivo_nome: pagamento?.nota_fiscal_arquivo_nome ?? null as string | null,
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    void supabase.from('turmas').select('id, nome').order('nome').then(({ data }) => setTurmas((data as Turma[]) ?? []));
  }, []);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    const valorNum = Number(form.valor);
    if (!form.data_pagamento || !form.valor || Number.isNaN(valorNum) || valorNum < 0) return setErro('Informe data e valor válidos.');
    setSalvando(true);
    setErro('');
    const valores = {
      id,
      profissional_id: profissional.id,
      data_pagamento: form.data_pagamento,
      valor: valorNum,
      descricao: form.descricao.trim() || null,
      turma_id: form.turma_id || null,
      comprovante_arquivo_url: form.comprovante_arquivo_url,
      comprovante_arquivo_nome: form.comprovante_arquivo_nome,
      nota_fiscal_arquivo_url: form.nota_fiscal_arquivo_url,
      nota_fiscal_arquivo_nome: form.nota_fiscal_arquivo_nome,
    };
    const resultado = pagamento
      ? await supabase.from('profissionais_pagamentos').update(valores).eq('id', id)
      : await supabase.from('profissionais_pagamentos').insert(valores);
    setSalvando(false);
    if (resultado.error) return setErro(resultado.error.message);
    toast.success(pagamento ? 'Pagamento atualizado.' : 'Pagamento lançado.');
    fechar(true);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pagamento ? 'Editar pagamento' : 'Lançar pagamento'} — {profissional.nome}</DialogTitle>
          <DialogDescription>Comprovante e nota fiscal ficam anexados neste lançamento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void salvar(e)} className="space-y-3">
          <fieldset disabled={salvando} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pgto-data">Data do pagamento *</Label>
                <Input id="pgto-data" type="date" value={form.data_pagamento} onChange={(e) => setForm((f) => ({ ...f, data_pagamento: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pgto-valor">Valor (R$) *</Label>
                <Input id="pgto-valor" inputMode="decimal" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pgto-turma">Turma (opcional)</Label>
                <Select value={form.turma_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, turma_id: v }))}>
                  <SelectTrigger id="pgto-turma"><SelectValue placeholder="Selecione, se aplicável" /></SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pgto-descricao">Descrição</Label>
              <Textarea id="pgto-descricao" value={form.descricao} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex: 50% da ajuda de custo, referente a quais aulas/módulos..." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AnexoUpload label="Comprovante" path={form.comprovante_arquivo_url} nome={form.comprovante_arquivo_nome} caminhoBase={`${profissional.id}/${id}`}
                onChange={(path, nome) => setForm((f) => ({ ...f, comprovante_arquivo_url: path, comprovante_arquivo_nome: nome }))} />
              <AnexoUpload label="Nota fiscal" path={form.nota_fiscal_arquivo_url} nome={form.nota_fiscal_arquivo_nome} caminhoBase={`${profissional.id}/${id}`}
                onChange={(path, nome) => setForm((f) => ({ ...f, nota_fiscal_arquivo_url: path, nota_fiscal_arquivo_nome: nome }))} />
            </div>
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
              <Button type="submit">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HistoricoPagamentosDialog({ profissional, fechar }: { profissional: Profissional; fechar: () => void }) {
  const { itens, carregando, erro, recarregar } = usePagamentos(profissional.id);
  const [mesFiltro, setMesFiltro] = useState('');
  const [editando, setEditando] = useState<Pagamento | null | undefined>(undefined);

  const meses = Array.from(new Set(itens.map((p) => p.data_pagamento.slice(0, 7)))).sort().reverse();
  const filtrados = mesFiltro ? itens.filter((p) => p.data_pagamento.startsWith(mesFiltro)) : itens;
  const total = filtrados.reduce((soma, p) => soma + Number(p.valor), 0);

  async function excluir(p: Pagamento) {
    if (!window.confirm('Excluir este pagamento e os anexos dele?')) return;
    const paths = [p.comprovante_arquivo_url, p.nota_fiscal_arquivo_url].filter((v): v is string => !!v);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from('profissionais_pagamentos').delete().eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success('Pagamento excluído.');
    void recarregar();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) fechar(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-primary" /> Histórico de pagamentos — {profissional.nome}</DialogTitle>
          <DialogDescription>Comprovante e nota fiscal de cada pagamento, do mais recente pro mais antigo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={mesFiltro || 'todos'} onValueChange={(v) => setMesFiltro(v === 'todos' ? '' : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Todos os meses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {meses.map((m) => <SelectItem key={m} value={m}>{m.split('-').reverse().join('/')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-2" onClick={() => setEditando(null)}>
            <Plus className="h-4 w-4" /> Lançar pagamento
          </Button>
        </div>

        {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!carregando && filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento lançado{mesFiltro ? ' neste mês' : ''}.</p>}

        {filtrados.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">Data</th>
                  <th className="p-2">Valor</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2">Turma</th>
                  <th className="p-2">Anexos</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-2">{formatData(p.data_pagamento)}</td>
                    <td className="whitespace-nowrap p-2 font-medium">{formatReal(Number(p.valor))}</td>
                    <td className="p-2 text-muted-foreground">{p.descricao || '—'}</td>
                    <td className="p-2 text-muted-foreground">{p.turmas?.nome || '—'}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {p.comprovante_arquivo_url && (
                          <button type="button" onClick={() => void abrirArquivo(p.comprovante_arquivo_url!)} className="flex items-center gap-1 text-xs text-emerald-700 hover:underline" title={p.comprovante_arquivo_nome ?? ''}>
                            <Paperclip className="h-3 w-3" /> Comprovante
                          </button>
                        )}
                        {p.nota_fiscal_arquivo_url && (
                          <button type="button" onClick={() => void abrirArquivo(p.nota_fiscal_arquivo_url!)} className="flex items-center gap-1 text-xs text-blue-700 hover:underline" title={p.nota_fiscal_arquivo_nome ?? ''}>
                            <FileText className="h-3 w-3" /> Nota fiscal
                          </button>
                        )}
                        {!p.comprovante_arquivo_url && !p.nota_fiscal_arquivo_url && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditando(p)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void excluir(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="p-2" colSpan={1}>Total{mesFiltro ? ` (${mesFiltro.split('-').reverse().join('/')})` : ''}</td>
                  <td className="p-2">{formatReal(total)}</td>
                  <td className="p-2" colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>Fechar</Button>
        </DialogFooter>

        {editando !== undefined && (
          <PagamentoDialog
            profissional={profissional}
            pagamento={editando}
            fechar={(salvou) => { setEditando(undefined); if (salvou) void recarregar(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
