import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

// Tabelas novas ainda não constam dos tipos Supabase gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;
type Edicao = { id: string; slug: string; titulo: string; headline: string; subheadline: string; descricao: string | null; bonus_descricao: string | null; modalidade: 'gratuito' | 'pago'; valor_centavos: number | null; inicio_em: string | null; ativo: boolean };
type Inscricao = { id: string; status: string; created_at: string; leads: { nome: string; whatsapp: string | null; email: string | null; vendedor: string | null } };
type Form = Omit<Edicao, 'id'>;
const vazio: Form = { slug: '', titulo: '', headline: '', subheadline: '', descricao: '', bonus_descricao: '', modalidade: 'gratuito', valor_centavos: null, inicio_em: null, ativo: false };
const rotulos: Record<string, string> = { inscrito: 'Inscrito', pendente_pagamento: 'Aguardando pagamento', pago: 'Ingresso pago', interessado: 'Interessado', cancelado: 'Cancelado' };

export function Workshops() {
  const [edicoes, setEdicoes] = useState<Edicao[]>([]);
  const [id, setId] = useState('');
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [form, setForm] = useState<Form>(vazio);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<'7' | '30' | 'todos'>('30');
  const edicao = edicoes.find((item) => item.id === id);

  const carregar = useCallback(async () => {
    const { data, error } = await db.from('workshop_edicoes').select('id,slug,titulo,headline,subheadline,descricao,bonus_descricao,modalidade,valor_centavos,inicio_em,ativo').order('created_at');
    if (error) { setErro(error.message); return; }
    const itens = (data ?? []) as Edicao[];
    setEdicoes(itens); setId((atual) => itens.some((item) => item.id === atual) ? atual : itens[0]?.id ?? ''); setErro('');
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if (!criando && edicao) {
      const { id: _id, ...campos } = edicao;
      setForm(campos);
    }
  }, [edicao, criando]);
  useEffect(() => {
    if (!id) return;
    let ativo = true;
    void db.from('workshop_inscricoes').select('id,status,created_at,leads(nome,whatsapp,email,vendedor)')
      .eq('workshop_id', id).order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error }: { data: unknown; error: Error | null }) => {
        if (!ativo) return;
        if (error) setErro(error.message); else setInscricoes((data ?? []) as Inscricao[]);
      });
    return () => { ativo = false; };
  }, [id]);
  const filtradas = useMemo(() => {
    const desde = periodo === 'todos' ? 0 : Date.now() - Number(periodo) * 86400000;
    const q = busca.toLocaleLowerCase('pt-BR').trim();
    return inscricoes.filter((item) => new Date(item.created_at).getTime() >= desde &&
      (!q || `${item.leads?.nome ?? ''} ${item.leads?.whatsapp ?? ''} ${item.leads?.email ?? ''}`.toLocaleLowerCase('pt-BR').includes(q)));
  }, [inscricoes, busca, periodo]);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) return setErro('Slug inválido: use letras minúsculas, números e hífen.');
    if (form.modalidade === 'pago' && form.ativo && !form.valor_centavos) return setErro('Defina o valor antes de abrir inscrições pagas.');
    setSalvando(true); setErro('');
    try {
      const payload = { ...form, valor_centavos: form.modalidade === 'gratuito' ? null : form.valor_centavos };
      const { error } = criando ? await db.from('workshop_edicoes').insert(payload) : await db.from('workshop_edicoes').update(payload).eq('id', id);
      if (error) throw error;
      toast.success('Edição salva.'); setCriando(false); await carregar();
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  const colunas = [
    { nome: 'Inscrito', statuses: ['inscrito'] },
    { nome: 'Aguardando ingresso', statuses: ['pendente_pagamento'] },
    { nome: 'Pago / interessado', statuses: ['pago', 'interessado'] },
  ];
  return <main className="mx-auto w-full max-w-7xl space-y-5 p-3 pb-24 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><h1 className="text-2xl font-bold">Workshop</h1><p className="text-sm text-muted-foreground">Edições, inscrições e funil para a Formação em Psicanálise Integrativa.</p></div><Button variant="outline" onClick={() => void carregar()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></header>
    {erro && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{erro}</p>}
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-1"><Label>Edição</Label><Select value={id} onValueChange={(value) => { setId(value); setCriando(false); }}><SelectTrigger><SelectValue placeholder="Escolha uma edição" /></SelectTrigger><SelectContent>{edicoes.map((item) => <SelectItem key={item.id} value={item.id}>{item.titulo} · {item.modalidade}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" onClick={() => { setCriando(true); setForm(vazio); }}><Plus className="mr-2 h-4 w-4" />Nova edição</Button></div>
    {edicao && <a className="inline-flex items-center gap-2 text-sm text-primary underline" href={`/workshop/${edicao.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Página pública {edicao.ativo ? '' : '(desativada)'}</a>}
    <Tabs defaultValue="visao" className="space-y-4"><TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"><TabsTrigger value="visao" className="min-h-11">Visão geral</TabsTrigger><TabsTrigger value="leads" className="min-h-11">Leads</TabsTrigger><TabsTrigger value="kanban" className="min-h-11">Kanban</TabsTrigger><TabsTrigger value="config" className="min-h-11">Configuração</TabsTrigger></TabsList>
      <TabsContent value="visao" className="space-y-3"><FiltroPeriodo value={periodo} onChange={setPeriodo} /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['Inscrições', filtradas.length], ['Gratuitos confirmados', filtradas.filter((i) => i.status === 'inscrito').length], ['Pagamento pendente', filtradas.filter((i) => i.status === 'pendente_pagamento').length], ['Ingressos pagos', filtradas.filter((i) => i.status === 'pago').length],
      ].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div><p className="text-sm text-muted-foreground">Ingresso só conta como pago após confirmação do gateway. A edição paga permanece desativada até você definir valor.</p></TabsContent>
      <TabsContent value="leads" className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Buscar inscrição" placeholder="Nome, telefone ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} /><FiltroPeriodo value={periodo} onChange={setPeriodo} /></div><p className="text-sm text-muted-foreground">{filtradas.length} inscrição(ões)</p><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{filtradas.map((item) => <Card key={item.id}><CardContent className="space-y-1 p-4 text-sm"><p className="font-semibold">{item.leads?.nome ?? 'Lead'}</p><p className="break-all text-muted-foreground">{item.leads?.whatsapp || item.leads?.email || 'Sem contato'}</p><p>{rotulos[item.status] ?? item.status} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</p><p className="text-xs text-muted-foreground">Comercial: {item.leads?.vendedor || 'Não atribuído'}</p></CardContent></Card>)}</div>{filtradas.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum lead neste período.</p>}</TabsContent>
      <TabsContent value="kanban" className="space-y-3"><FiltroPeriodo value={periodo} onChange={setPeriodo} /><p className="text-sm text-muted-foreground">Quadro automático, somente leitura; não altera pagamentos nem o funil comercial.</p><div className="grid gap-3 lg:grid-cols-3">{colunas.map((coluna) => { const itens = filtradas.filter((i) => coluna.statuses.includes(i.status)); return <section key={coluna.nome} className="min-w-0 rounded-xl border p-3"><h3 className="mb-3 font-semibold">{coluna.nome} · {itens.length}</h3><div className="space-y-2">{itens.map((item) => <Card key={item.id}><CardContent className="p-3 text-sm"><p className="font-medium">{item.leads?.nome}</p><p className="break-all text-xs text-muted-foreground">{item.leads?.whatsapp}</p><p className="text-xs">{rotulos[item.status]}</p></CardContent></Card>)}</div></section>; })}</div></TabsContent>
      <TabsContent value="config"><Card><CardHeader><CardTitle>{criando ? 'Nova edição' : 'Configurar edição'}</CardTitle></CardHeader><CardContent><form onSubmit={(event) => void salvar(event)} className="grid gap-3 sm:grid-cols-2"><Campo label="Título" value={form.titulo} onChange={(v) => setForm({ ...form, titulo: v })} /><Campo label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} /><div className="sm:col-span-2"><Campo label="Headline" value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} /></div><div className="sm:col-span-2"><Campo label="Subheadline" value={form.subheadline} onChange={(v) => setForm({ ...form, subheadline: v })} /></div><div className="sm:col-span-2 space-y-1"><Label>Descrição</Label><Textarea value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div><div className="sm:col-span-2 space-y-1"><Label>Bônus</Label><Textarea value={form.bonus_descricao ?? ''} onChange={(e) => setForm({ ...form, bonus_descricao: e.target.value })} /></div><div className="space-y-1"><Label>Modalidade</Label><Select value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v as Edicao['modalidade'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gratuito">Gratuito</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Valor do ingresso (R$)</Label><Input type="number" min="0.01" step="0.01" disabled={form.modalidade === 'gratuito'} value={form.valor_centavos ? (form.valor_centavos / 100).toFixed(2) : ''} onChange={(e) => setForm({ ...form, valor_centavos: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} /></div><div className="space-y-1"><Label>Data e hora (Brasília)</Label><Input type="datetime-local" value={form.inicio_em ? new Date(form.inicio_em).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16) : ''} onChange={(e) => setForm({ ...form, inicio_em: e.target.value ? new Date(`${e.target.value}:00-03:00`).toISOString() : null })} /></div><label className="flex items-center gap-2"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Inscrições abertas</label><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar edição'}</Button></form></CardContent></Card></TabsContent>
    </Tabs>
  </main>;
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label>{label}</Label><Input required minLength={2} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
function FiltroPeriodo({ value, onChange }: { value: '7' | '30' | 'todos'; onChange: (value: '7' | '30' | 'todos') => void }) {
  return <Select value={value} onValueChange={(v) => onChange(v as '7' | '30' | 'todos')}><SelectTrigger aria-label="Filtrar por período"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="todos">Todo o período</SelectItem></SelectContent></Select>;
}
