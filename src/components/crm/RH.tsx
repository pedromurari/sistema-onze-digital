import { useEffect, useState, type FormEvent } from 'react';
import {
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileText,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { HistoricoPagamentosDialog } from './rh/HistoricoPagamentos';
import { PreviaFolha } from './rh/PreviaFolha';

type Profissional = Database['public']['Tables']['profissionais']['Row'];

const MODELO_PAGAMENTO_LABEL: Record<Profissional['modelo_pagamento'], string> = {
  fixo: 'Fixo',
  por_aula: 'Por aula',
  comissao: 'Comissão',
  ajuda_custo: 'Ajuda de custo',
  hibrido: 'Híbrido',
};

const VINCULO_LABEL: Record<string, string> = {
  clt: 'CLT',
  pj: 'PJ',
  autonomo: 'Autônomo',
  voluntario: 'Voluntário',
  outro: 'Outro',
};

const ESCOPO = [
  {
    title: 'Aulas e serviços realizados',
    description: 'Link individual para o professor lançar a aula; o gestor aprova antes de gerar a pendência.',
    icon: Link2,
  },
  {
    title: 'Comissões automáticas',
    description: 'Vendas confirmadas alimentam a competência da vendedora sem lançamento manual duplicado.',
    icon: CheckCircle2,
  },
  {
    title: 'Contas a pagar',
    description: 'Valores previstos, aprovados, vencidos e pagos, separados por profissional e competência.',
    icon: CalendarClock,
  },
  {
    title: 'Notas fiscais e comprovantes',
    description: 'Anexo da nota enviada pelo profissional e comprovante do pagamento no mesmo histórico.',
    icon: FileText,
  },
] as const;

const EMPTY_FORM = {
  nome: '',
  funcao: '',
  contato: '',
  pix: '',
  documento: '',
  vinculo: '',
  modelo_pagamento: 'por_aula' as Profissional['modelo_pagamento'],
  valor_fixo: '',
  valor_por_aula: '',
  comissao_percentual_avista: '',
  comissao_percentual_boleto: '',
  comissao_meta1_faturamento: '',
  comissao_meta1_bonus: '',
  comissao_meta2_faturamento: '',
  comissao_meta2_bonus: '',
  observacoes: '',
};

function useProfissionais() {
  const [itens, setItens] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('profissionais').select('*').order('nome');
    if (error) setErro(error.message);
    else { setItens(data ?? []); setErro(''); }
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  return { itens, carregando, erro, recarregar: carregar };
}

function ProfissionalDialog({ profissional, fechar }: { profissional: Profissional | null; fechar: (salvou: boolean) => void }) {
  const [form, setForm] = useState(() => profissional ? {
    nome: profissional.nome,
    funcao: profissional.funcao ?? '',
    contato: profissional.contato ?? '',
    pix: profissional.pix ?? '',
    documento: profissional.documento ?? '',
    vinculo: profissional.vinculo ?? '',
    modelo_pagamento: profissional.modelo_pagamento,
    valor_fixo: profissional.valor_fixo?.toString() ?? '',
    valor_por_aula: profissional.valor_por_aula?.toString() ?? '',
    comissao_percentual_avista: profissional.comissao_percentual_avista?.toString() ?? '',
    comissao_percentual_boleto: profissional.comissao_percentual_boleto?.toString() ?? '',
    comissao_meta1_faturamento: profissional.comissao_meta1_faturamento?.toString() ?? '',
    comissao_meta1_bonus: profissional.comissao_meta1_bonus?.toString() ?? '',
    comissao_meta2_faturamento: profissional.comissao_meta2_faturamento?.toString() ?? '',
    comissao_meta2_bonus: profissional.comissao_meta2_bonus?.toString() ?? '',
    observacoes: profissional.observacoes ?? '',
  } : EMPTY_FORM);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (form.nome.trim().length < 2) return setErro('Informe o nome.');
    setSalvando(true);
    setErro('');
    const valores = {
      nome: form.nome.trim(),
      funcao: form.funcao.trim() || null,
      contato: form.contato.trim() || null,
      pix: form.pix.trim() || null,
      documento: form.documento.trim() || null,
      vinculo: form.vinculo || null,
      modelo_pagamento: form.modelo_pagamento,
      valor_fixo: form.valor_fixo ? Number(form.valor_fixo) : null,
      valor_por_aula: form.valor_por_aula ? Number(form.valor_por_aula) : null,
      comissao_percentual_avista: form.comissao_percentual_avista ? Number(form.comissao_percentual_avista) : null,
      comissao_percentual_boleto: form.comissao_percentual_boleto ? Number(form.comissao_percentual_boleto) : null,
      comissao_meta1_faturamento: form.comissao_meta1_faturamento ? Number(form.comissao_meta1_faturamento) : null,
      comissao_meta1_bonus: form.comissao_meta1_bonus ? Number(form.comissao_meta1_bonus) : null,
      comissao_meta2_faturamento: form.comissao_meta2_faturamento ? Number(form.comissao_meta2_faturamento) : null,
      comissao_meta2_bonus: form.comissao_meta2_bonus ? Number(form.comissao_meta2_bonus) : null,
      observacoes: form.observacoes.trim() || null,
    };
    const resultado = profissional
      ? await supabase.from('profissionais').update(valores).eq('id', profissional.id)
      : await supabase.from('profissionais').insert(valores);
    setSalvando(false);
    if (resultado.error) return setErro(resultado.error.message);
    toast.success(profissional ? 'Profissional atualizado.' : 'Profissional cadastrado.');
    fechar(true);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(false); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profissional ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
          <DialogDescription>Cadastro usado pela Agenda de aulas e pelo futuro Fechamento de Folha.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void salvar(e)} className="space-y-3">
          <fieldset disabled={salvando} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prof-nome">Nome *</Label>
                <Input id="prof-nome" value={form.nome} maxLength={160} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-funcao">Função</Label>
                <Input id="prof-funcao" value={form.funcao} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, funcao: e.target.value }))} placeholder="Professor, coordenador..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-contato">Contato</Label>
                <Input id="prof-contato" value={form.contato} onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} placeholder="WhatsApp ou e-mail" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-pix">Chave Pix</Label>
                <Input id="prof-pix" value={form.pix} onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-documento">CPF/CNPJ</Label>
                <Input id="prof-documento" value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-vinculo">Vínculo</Label>
                <Select value={form.vinculo || undefined} onValueChange={(v) => setForm((f) => ({ ...f, vinculo: v }))}>
                  <SelectTrigger id="prof-vinculo"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VINCULO_LABEL).map(([valor, rotulo]) => <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-modelo">Modelo de pagamento</Label>
                <Select value={form.modelo_pagamento} onValueChange={(v) => setForm((f) => ({ ...f, modelo_pagamento: v as Profissional['modelo_pagamento'] }))}>
                  <SelectTrigger id="prof-modelo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODELO_PAGAMENTO_LABEL).map(([valor, rotulo]) => <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(form.modelo_pagamento === 'fixo' || form.modelo_pagamento === 'hibrido') && (
                <div className="space-y-1.5">
                  <Label htmlFor="prof-valor-fixo">Valor fixo (R$)</Label>
                  <Input id="prof-valor-fixo" inputMode="decimal" value={form.valor_fixo} onChange={(e) => setForm((f) => ({ ...f, valor_fixo: e.target.value }))} />
                </div>
              )}
              {(form.modelo_pagamento === 'por_aula' || form.modelo_pagamento === 'hibrido') && (
                <div className="space-y-1.5">
                  <Label htmlFor="prof-valor-aula">Valor por aula (R$)</Label>
                  <Input id="prof-valor-aula" inputMode="decimal" value={form.valor_por_aula} onChange={(e) => setForm((f) => ({ ...f, valor_por_aula: e.target.value }))} />
                </div>
              )}
            </div>
            {(form.modelo_pagamento === 'comissao' || form.modelo_pagamento === 'hibrido') && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comissão (% do líquido, depois da taxa do gateway)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-com-avista">À vista / cartão (%)</Label>
                    <Input id="prof-com-avista" inputMode="decimal" value={form.comissao_percentual_avista} onChange={(e) => setForm((f) => ({ ...f, comissao_percentual_avista: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-com-boleto">Boleto, 1ª parcela (%)</Label>
                    <Input id="prof-com-boleto" inputMode="decimal" value={form.comissao_percentual_boleto} onChange={(e) => setForm((f) => ({ ...f, comissao_percentual_boleto: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-meta1-fat">Meta 1 — faturamento (R$)</Label>
                    <Input id="prof-meta1-fat" inputMode="decimal" value={form.comissao_meta1_faturamento} onChange={(e) => setForm((f) => ({ ...f, comissao_meta1_faturamento: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-meta1-bonus">Meta 1 — bônus (R$)</Label>
                    <Input id="prof-meta1-bonus" inputMode="decimal" value={form.comissao_meta1_bonus} onChange={(e) => setForm((f) => ({ ...f, comissao_meta1_bonus: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-meta2-fat">Meta 2 — faturamento (R$)</Label>
                    <Input id="prof-meta2-fat" inputMode="decimal" value={form.comissao_meta2_faturamento} onChange={(e) => setForm((f) => ({ ...f, comissao_meta2_faturamento: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-meta2-bonus">Meta 2 — bônus (R$)</Label>
                    <Input id="prof-meta2-bonus" inputMode="decimal" value={form.comissao_meta2_bonus} onChange={(e) => setForm((f) => ({ ...f, comissao_meta2_bonus: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="prof-observacoes">Observações de pagamento</Label>
              <Textarea id="prof-observacoes" value={form.observacoes} maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Regras de remuneração e pendências a conferir" />
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

export function RH() {
  const { itens, carregando, erro, recarregar } = useProfissionais();
  const [editando, setEditando] = useState<Profissional | null | undefined>(undefined);
  const [verPagamentos, setVerPagamentos] = useState<Profissional | null>(null);
  const ativos = itens.filter((p) => p.ativo);

  async function alternarAtivo(p: Profissional) {
    const { error } = await supabase.from('profissionais').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) return toast.error('Não foi possível atualizar.');
    await recarregar();
  }

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">RH e pagamentos</h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Cadastro e pagamentos dos profissionais. Aulas e presença ficam em Gestão → Agenda de aulas.
            </p>
          </div>
          <Button className="gap-2 self-start" onClick={() => setEditando(null)}>
            <Plus className="h-4 w-4" /> Adicionar profissional
          </Button>
        </header>

        <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Profissionais ativos', value: String(ativos.length), detail: `${itens.length} cadastrados no total`, icon: Users, tone: 'text-blue-600 bg-blue-500/10' },
            { label: 'A pagar', value: 'R$ 0,00', detail: 'fechamento de folha ainda não construído', icon: Banknote, tone: 'text-amber-600 bg-amber-500/10' },
            { label: 'Notas pendentes', value: '0', detail: 'nenhum documento anexado', icon: ReceiptText, tone: 'text-emerald-600 bg-emerald-500/10' },
          ].map(({ label, value, detail, icon: Icon, tone }) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <PreviaFolha profissionais={itens} />

        <div className="mt-4">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserRoundPlus className="h-4 w-4 text-primary" /> Profissionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                {erro && <p className="text-sm text-destructive">{erro}</p>}
                {!carregando && itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado ainda.</p>}
                {itens.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="p-2">Nome</th>
                          <th className="p-2">Função</th>
                          <th className="p-2">Vínculo</th>
                          <th className="p-2">Modelo</th>
                          <th className="p-2">Ativo</th>
                          <th className="p-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((p) => (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setEditando(p)}>
                            <td className="p-2 font-medium">{p.nome}</td>
                            <td className="p-2 text-muted-foreground">{p.funcao || '—'}</td>
                            <td className="p-2 text-muted-foreground">{p.vinculo ? VINCULO_LABEL[p.vinculo] : '—'}</td>
                            <td className="p-2 text-muted-foreground">{MODELO_PAGAMENTO_LABEL[p.modelo_pagamento]}</td>
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              <Switch checked={p.ativo} onCheckedChange={() => void alternarAtivo(p)} aria-label={`${p.ativo ? 'Desativar' : 'Ativar'} ${p.nome}`} />
                            </td>
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setVerPagamentos(p)}>
                                <ReceiptText className="h-3.5 w-3.5" /> Pagamentos
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
              O que mais este módulo vai controlar (ainda planejamento)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {ESCOPO.map(({ title, description, icon: Icon }) => (
              <div key={title} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Aulas e assinaturas ficam em Gestão → Agenda de aulas. A conexão com o Fechamento de Folha
            automático ainda está pendente — ver `ROADMAP.md` e o cofre do Obsidian em <code>RH/</code>.
          </p>
        </div>
        {editando !== undefined && (
          <ProfissionalDialog
            profissional={editando}
            fechar={(salvou) => {
              setEditando(undefined);
              if (salvou) void recarregar();
            }}
          />
        )}
        {verPagamentos && (
          <HistoricoPagamentosDialog profissional={verPagamentos} fechar={() => setVerPagamentos(null)} />
        )}
      </div>
    </div>
  );
}
