import { useMemo, useState } from 'react';
import { Loader2, Users, Video, MousePointerClick, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bucketKanban, funilAcumulado, STAGE_LABEL, type LeadNoFunil } from './webinario-data';

type Periodo = 'hoje' | '7' | '30';
type Props = { leads: LeadNoFunil[]; periodo: Periodo; onPeriodoChange: (periodo: Periodo) => void; carregando: boolean };

function FiltroPeriodo({ periodo, onChange }: { periodo: Periodo; onChange: (periodo: Periodo) => void }) {
  return <div className="flex w-full gap-1 rounded-lg border bg-muted/40 p-1 sm:w-auto" aria-label="Período dos cadastros">
    {([['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']] as const).map(([valor, rotulo]) =>
      <Button key={valor} size="sm" variant={periodo === valor ? 'default' : 'ghost'} className="min-h-10 flex-1 px-3 sm:flex-none" onClick={() => onChange(valor)}>{rotulo}</Button>)}
  </div>;
}

function CabecalhoDados({ titulo, periodo, onPeriodoChange, carregando }: Props & { titulo: string }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{titulo}</h2>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}</div>
    <FiltroPeriodo periodo={periodo} onChange={onPeriodoChange} />
  </div>;
}

export function WebinarioVisaoGeral(props: Props) {
  const { leads } = props;
  const etapas = useMemo(() => funilAcumulado(leads), [leads]);
  const entrou = etapas[1]?.quantidade ?? 0;
  const pitch = etapas[6]?.quantidade ?? 0;
  const cliques = etapas[7]?.quantidade ?? 0;
  const percentual = (n: number) => leads.length ? `${Math.round(100 * n / leads.length)}%` : '0%';
  return <div className="space-y-4">
    <CabecalhoDados {...props} titulo="Visão geral" />
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {[
        { rotulo: 'Cadastros', valor: String(leads.length), icon: Users },
        { rotulo: 'Entraram', valor: `${entrou} · ${percentual(entrou)}`, icon: Video },
        { rotulo: 'Viram a oferta', valor: `${pitch} · ${percentual(pitch)}`, icon: TrendingUp },
        { rotulo: 'Clicaram na oferta', valor: `${cliques} · ${percentual(cliques)}`, icon: MousePointerClick },
      ].map(({ rotulo, valor, icon: Icon }) => <Card key={rotulo}><CardContent className="p-3 sm:p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 text-xs text-muted-foreground">{rotulo}</p><p className="text-lg font-bold sm:text-xl">{valor}</p></CardContent></Card>)}
    </div>
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Etapas da audiência</CardTitle></CardHeader>
      <CardContent className="space-y-3">{etapas.map((etapa) => <div key={etapa.stage} className="space-y-1">
        <div className="flex justify-between gap-2 text-sm"><span>{etapa.label}</span><span className="font-medium">{etapa.quantidade} · {percentual(etapa.quantidade)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${leads.length ? 100 * etapa.quantidade / leads.length : 0}%` }} /></div>
      </div>)}</CardContent></Card>
    <Card><CardContent className="space-y-1 p-4 text-sm"><p className="font-semibold">Vendas e receita atribuídas</p>
      <p className="text-muted-foreground">Ainda não verificáveis com segurança: a página de oferta abre a matrícula com nome e contato, mas não envia um identificador do lead. Não vamos atribuir outra venda ao webinário por coincidência de nome ou telefone.</p>
      <p className="text-xs text-muted-foreground">CPL e ROAS também aguardam integração com o Gestor de Tráfego.</p>
    </CardContent></Card>
  </div>;
}

const formatarData = (valor: string | null) => valor ? new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const PAGINA = 20;

export function WebinarioLeads(props: Props) {
  const { leads } = props;
  const [status, setStatus] = useState('todos');
  const [vendedor, setVendedor] = useState('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const statuses = useMemo(() => [...new Set(leads.map((item) => item.lead.status).filter((v): v is string => Boolean(v)))].sort(), [leads]);
  const vendedores = useMemo(() => [...new Set(leads.map((item) => item.lead.vendedor).filter((v): v is string => Boolean(v)))].sort(), [leads]);
  const filtrados = useMemo(() => leads.filter(({ lead }) =>
    (status === 'todos' || lead.status === status) &&
    (vendedor === 'todos' || lead.vendedor === vendedor) &&
    (!busca || `${lead.nome} ${lead.whatsapp ?? ''} ${lead.telefone ?? ''} ${lead.email ?? ''}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))),
  ), [leads, status, vendedor, busca]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  return <div className="space-y-4">
    <CabecalhoDados {...props} titulo={`Leads (${filtrados.length})`} />
    <div className="grid gap-2 sm:grid-cols-3">
      <Input aria-label="Buscar lead" placeholder="Nome, telefone ou e-mail" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} />
      <Select value={status} onValueChange={(valor) => { setStatus(valor); setPagina(0); }}><SelectTrigger aria-label="Filtrar por status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem>{statuses.map((valor) => <SelectItem key={valor} value={valor}>{valor}</SelectItem>)}</SelectContent></Select>
      <Select value={vendedor} onValueChange={(valor) => { setVendedor(valor); setPagina(0); }}><SelectTrigger aria-label="Filtrar por vendedor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os vendedores</SelectItem>{vendedores.map((valor) => <SelectItem key={valor} value={valor}>{valor}</SelectItem>)}</SelectContent></Select>
    </div>
    {filtrados.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum lead encontrado neste período/filtro.</p> :
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{filtrados.slice(paginaSegura * PAGINA, (paginaSegura + 1) * PAGINA).map(({ lead, stage }) =>
        <Card key={lead.id}><CardContent className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold">{lead.nome}</p><Badge variant="secondary">{STAGE_LABEL[stage]}</Badge></div>
          <p className="break-all text-muted-foreground">{lead.whatsapp || lead.telefone || lead.email || 'Sem contato'}</p>
          <p className="text-xs text-muted-foreground">Cadastro: {formatarData(lead.criado_em)}</p>
          <p className="text-xs">Status: {lead.status ?? '—'} · Vendedor: {lead.vendedor ?? 'Não atribuído'}</p>
        </CardContent></Card>)}</div>}
    {totalPaginas > 1 && <div className="flex items-center justify-between gap-2 text-sm"><Button variant="outline" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)}>Anterior</Button><span>Página {paginaSegura + 1} de {totalPaginas}</span><Button variant="outline" disabled={paginaSegura + 1 >= totalPaginas} onClick={() => setPagina(paginaSegura + 1)}>Próxima</Button></div>}
  </div>;
}

export function WebinarioKanban(props: Props) {
  const [limites, setLimites] = useState<Record<string, number>>({ cadastro: 20, entrou: 20, interessado: 20 });
  const colunas = [
    { id: 'cadastro', titulo: 'Cadastro', detalhe: 'Cadastrou, ainda não entrou' },
    { id: 'entrou', titulo: 'Entrou na aula', detalhe: 'Entrou ou assistiu, antes da oferta' },
    { id: 'interessado', titulo: 'Interessado', detalhe: 'Viu ou clicou na oferta · enviado ao comercial' },
  ] as const;
  return <div className="space-y-4"><CabecalhoDados {...props} titulo="Kanban do webinário" />
    <p className="text-sm text-muted-foreground">Quadro automático, somente leitura. Os cartões seguem a etapa real de assistência; não alteram o status comercial.</p>
    <div className="grid gap-3 lg:grid-cols-3">{colunas.map((coluna) => {
      const itens = props.leads.filter((item) => bucketKanban(item.stage) === coluna.id);
      return <section key={coluna.id} className="min-w-0 rounded-xl border bg-muted/20 p-3" aria-label={coluna.titulo}>
        <div className="mb-3"><h3 className="font-semibold">{coluna.titulo} <Badge variant="outline">{itens.length}</Badge></h3><p className="text-xs text-muted-foreground">{coluna.detalhe}</p></div>
        <div className="space-y-2">{itens.slice(0, limites[coluna.id]).map(({ lead, stage }) => <Card key={lead.id}><CardContent className="space-y-1 p-3 text-sm"><p className="break-words font-medium">{lead.nome}</p><p className="break-all text-xs text-muted-foreground">{lead.whatsapp || lead.telefone || lead.email || 'Sem contato'}</p><p className="text-xs">{STAGE_LABEL[stage]}</p>{lead.vendedor && <p className="text-xs text-muted-foreground">{lead.vendedor}</p>}</CardContent></Card>)}</div>
        {itens.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Sem leads nesta etapa</p>}
        {itens.length > limites[coluna.id] && <Button variant="ghost" className="mt-2 w-full" onClick={() => setLimites((atual) => ({ ...atual, [coluna.id]: atual[coluna.id] + 20 }))}>Mostrar mais</Button>}
      </section>;
    })}</div>
  </div>;
}
