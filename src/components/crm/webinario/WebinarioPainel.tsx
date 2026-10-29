import { useCallback, useEffect, useState } from 'react';
import { Video, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WebinarioVisaoGeral, WebinarioLeads, WebinarioKanban } from './WebinarioResumo';
import { WebinarioConfiguracao } from './WebinarioConfiguracao';
import { inicioPeriodo, listarTracking, listarWebinarios, type LeadNoFunil, type Webinario } from './webinario-data';

type Periodo = 'hoje' | '7' | '30';

export function WebinarioPainel() {
  const { user } = useAuth();
  const podeEditar = user?.permissionMatrix?.webinario?.editar === true ||
    (user?.tipo === 'admin' && user.permissionMatrix?.webinario?.editar === undefined);
  const [webinarios, setWebinarios] = useState<Webinario[]>([]);
  const [id, setId] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('7');
  const [leads, setLeads] = useState<LeadNoFunil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoFunil, setCarregandoFunil] = useState(false);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const webinario = webinarios.find((item) => item.id === id) ?? null;

  const carregarWebinarios = useCallback(async () => {
    try {
      const itens = await listarWebinarios();
      setWebinarios(itens);
      setId((atual) => itens.some((item) => item.id === atual) ? atual : itens[0]?.id ?? '');
      setErro('');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar os webinários.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregarWebinarios(); }, [carregarWebinarios]);
  useEffect(() => {
    if (!id) return;
    let ativo = true;
    setCarregandoFunil(true);
    void listarTracking(id, inicioPeriodo(periodo)).then((itens) => {
      if (ativo) { setLeads(itens); setErro(''); }
    }).catch((error: unknown) => {
      if (ativo) { setLeads([]); setErro(error instanceof Error ? error.message : 'Não foi possível carregar o funil.'); }
    }).finally(() => { if (ativo) setCarregandoFunil(false); });
    return () => { ativo = false; };
  }, [id, periodo, versao]);

  const atualizar = () => { void carregarWebinarios(); setVersao((n) => n + 1); };

  return <main className="mx-auto w-full max-w-7xl space-y-5 p-3 pb-24 sm:p-6 lg:p-8">
    <header className="space-y-3 sm:flex sm:items-start sm:justify-between sm:space-y-0">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Video className="h-6 w-6 text-primary" /> Webinário Evergreen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Canal de aquisição · cadastro, assistência, interesse e configuração.</p></div>
      <Button variant="outline" size="sm" onClick={atualizar} className="w-full sm:w-auto"><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </header>

    {erro && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}
    {carregando ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando webinários" /> : webinarios.length === 0 ?
      <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nenhum webinário disponível para seu acesso.</p> : <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
        <div className="space-y-1"><label htmlFor="webinario-selecao" className="text-sm font-medium">Webinário</label>
          <Select value={id} onValueChange={setId}><SelectTrigger id="webinario-selecao" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{webinarios.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
        {webinario && <a className="inline-flex min-h-10 items-center gap-2 break-all text-sm text-primary underline sm:justify-self-end" href={`/webinario/${webinario.slug}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4 shrink-0" /> Abrir página de cadastro</a>}
      </div>
      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="visao" className="min-h-11">Visão geral</TabsTrigger>
          <TabsTrigger value="leads" className="min-h-11">Leads</TabsTrigger>
          <TabsTrigger value="config" className="min-h-11">Configuração</TabsTrigger>
          <TabsTrigger value="kanban" className="min-h-11">Kanban</TabsTrigger>
        </TabsList>
        <TabsContent value="visao"><WebinarioVisaoGeral leads={leads} periodo={periodo} onPeriodoChange={setPeriodo} carregando={carregandoFunil} /></TabsContent>
        <TabsContent value="leads"><WebinarioLeads leads={leads} periodo={periodo} onPeriodoChange={setPeriodo} carregando={carregandoFunil} /></TabsContent>
        <TabsContent value="config">{webinario && <WebinarioConfiguracao key={webinario.id} webinario={webinario} podeEditar={podeEditar} onSaved={atualizar} />}</TabsContent>
        <TabsContent value="kanban"><WebinarioKanban leads={leads} periodo={periodo} onPeriodoChange={setPeriodo} carregando={carregandoFunil} /></TabsContent>
      </Tabs>
    </>}
  </main>;
}
