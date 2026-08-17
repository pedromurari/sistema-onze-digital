import { useState, useEffect } from 'react';
import { Lead, PipelineStage } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { dbRowToLead } from '@/contexts/LeadsContext';
import { assignTurmaEAtualizarParcelas } from '@/lib/parcelasAluno';
import {
  MessageCircle, Target, Copy, ExternalLink, Users, TrendingUp, DollarSign, CalendarDays,
  Video, Rocket, Repeat, GraduationCap, Link2, Wallet, CreditCard, Crown, Kanban, ClipboardList,
  Search, X, History, Filter, CornerDownRight, Eye, Zap, BookOpen, Layers, Trash2, RotateCcw,
} from 'lucide-react';

// -----------------------------------------------------------------------
// Funil — pool de leads independente de "Leads Diretos" (Pipeline.tsx).
// Mesma origem de dados (tabela `leads`), mas filtrado por
// origem='Time Comercial' em vez de origem='Direto'. Reaproveita as cores
// dos 4 primeiros estagios de PIPELINE_STAGES (types/crm.ts) por consistencia
// visual, mas mantem a propria lista de estagios — os dois funis nao
// compartilham estrutura, so paleta.
// -----------------------------------------------------------------------

type GenericStage = 'retorno' | 'novo' | 'sdr' | 'closer' | 'matricula';
type SddStage = 'frio' | 'pre_aquecimento' | 'grupo_oferta' | 'primeiro_contato' | 'negociacao' | 'matricula';
type TimeComercialStage = GenericStage | SddStage;

// Etapas provisórias — ainda valem pra canais sem funil próprio definido.
const GENERIC_STAGES: { key: TimeComercialStage; label: string; color: string }[] = [
  { key: 'novo', label: 'Novo', color: 'bg-pipeline-novo' },
  { key: 'sdr', label: 'SDR', color: 'bg-pipeline-sdr' },
  { key: 'closer', label: 'Closer', color: 'bg-pipeline-closer' },
  { key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula' },
];

// "Retorno" substitui "Novo" como ponto de entrada — só pra campanhas marcadas como
// tipo "retorno" (lead que já existia no sistema antes, não é contato inédito). Não
// é uma etapa genérica fixa: só aparece na aba quando existe algum lead nela.
const RETORNO_STAGE: { key: TimeComercialStage; label: string; color: string } = { key: 'retorno', label: 'Retorno', color: 'bg-pipeline-followup3' };

// Funil próprio do canal SDD (Semana do Despertar) — definido pelo dono do negócio.
const SDD_STAGES: { key: TimeComercialStage; label: string; color: string }[] = [
  { key: 'frio', label: 'Frio', color: 'bg-pipeline-sdr' },
  { key: 'pre_aquecimento', label: 'Pré-aquecimento', color: 'bg-pipeline-followup1' },
  { key: 'grupo_oferta', label: 'Grupo de Oferta', color: 'bg-pipeline-aquecimento' },
  { key: 'primeiro_contato', label: 'Primeiro contato', color: 'bg-pipeline-followup2' },
  { key: 'negociacao', label: 'Negociação', color: 'bg-pipeline-closer' },
  { key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula' },
];

// Canal de aquisição — campo próprio (`leads.canal`), separado de `origem`
// pra não colidir com origem='Direto' do Leads Diretos (Pipeline.tsx).
const CANAIS_AQUISICAO = ['SDD', 'Direto', 'Webinário', 'Workshop', 'Retorno/Base', 'Orgânico'] as const;
type CanalAquisicao = typeof CANAIS_AQUISICAO[number];

// Canal dedicado às campanhas de retorno (base antiga) — todas moradas aqui, separadas
// por campanha, em vez de ficarem misturadas dentro do canal de origem (SDD, Direto
// etc.). A exclusão de "campanha de retorno" nos totais/pills dos OUTROS canais não
// se aplica aqui: esse canal existe justamente pra mostrar essa base.
const RETORNO_CANAL: CanalAquisicao = 'Retorno/Base';

type LeadComCanal = Lead & { canal?: string | null; vendedor?: string | null; lancamentoId?: string | null; cidade?: string | null; campanhaId?: string | null };

interface Campanha { id: string; canal: string; nome: string; condicoes: string | null; ativa: boolean; tipo: 'novo' | 'retorno'; }

const formatCurrency = (value?: number) => {
  if (!value) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const openWhatsApp = (phone: string) => window.open(`https://wa.me/55${phone.replace(/\D/g, '')}`, '_blank');

// Estilo "premium" reaproveitado nas tabelas de dados (Remuneração, Metas, Aquisição):
// cabeçalho em degradê vinho e linhas zebradas num tom de vinho bem claro, em vez do
// cabeçalho/zebra cinza padrão do componente Table.
const PREMIUM_TABLE_HEADER_ROW = 'border-0 [&_th]:text-primary-foreground [&_th]:font-semibold [&_th]:first:rounded-tl-lg [&_th]:last:rounded-tr-lg bg-gradient-to-r from-primary to-primary/80';
const premiumZebraRow = (idx: number) => (idx % 2 === 0 ? 'bg-card' : 'bg-primary/5');

// Card de estatística reaproveitado em todas as abas (Funil, Operação, Metas, Aquisição,
// Remuneração) — label em vinho, ícone lucide (mesma linguagem visual do resto do sistema,
// em vez de emoji) em badge, leve brilho no canto pra não parecer bloco branco genérico.
function StatTile({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ElementType }) {
  return (
    <Card className="p-3 lg:p-4 rounded-xl border-primary/15 shadow-[0_4px_14px_-4px_rgba(169,51,86,0.15)] relative overflow-hidden">
      <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-primary/10 pointer-events-none" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{label}</p>
        {Icon && (
          <div className="w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className="text-xl lg:text-2xl font-bold text-foreground mt-1 relative">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 relative">{hint}</p>}
    </Card>
  );
}

// Barra + título usados pra separar visualmente os blocos de cada aba (ex: "Visão geral"
// dos cards de estatística vs. a tabela principal logo abaixo).
function SectionBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-5 rounded-full bg-primary flex-shrink-0" />
      <div>
        <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground leading-tight mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

interface VendorScopeProps { viewAsName: string | null; }

function stageInfoFor(lead: LeadComCanal) {
  if ((lead.etapa as string) === 'retorno') return RETORNO_STAGE;
  const stages = lead.canal === 'SDD' ? SDD_STAGES : GENERIC_STAGES;
  return stages.find((s) => s.key === lead.etapa) ?? stages[0];
}

// Coluna fixa antes de "Frio" — mostra TODOS os leads visíveis, sem filtrar por
// etapa, cada um com o badge da própria fase. É o "não perde nenhum lead de vista"
// pedido pelo dono do negócio: continua lá mesmo depois que o lead avança de fase.
const LEADS_COLUMN_KEY = '__todos__';
const LEADS_COLUMN = { key: LEADS_COLUMN_KEY, label: 'Leads', color: 'bg-slate-500' };

// Teto de cards renderizados por vez — a base já passou de 11 mil leads (base fria
// de lançamentos antigos importada), então buscar/renderizar tudo de uma vez
// travaria o navegador. Números de contagem (badges, "Total de Leads") continuam
// exatos mesmo além desse teto — vêm de time_comercial_contagens() (agregado no
// banco), não da lista renderizada. O teto só limita quantos CARDS aparecem;
// busca/campanha estreitam o que é buscado pra achar leads fora da 1ª leva.
const LEADS_RENDER_LIMIT = 150;

interface Contagem { canal: string; status: string; campanha_id: string | null; vendedor: string | null; total: number; }
interface MetricaTurma { lancamento_id: string; turma_nome: string | null; leads_total: number; chegou_grupo_oferta: number; matriculados: number; }

// Sentinela pra "campanha_id IS NULL" — o funil ao vivo da turma atual (ex: Turma
// #44), sem estar preso a nenhuma campanha de reativação de base antiga. É o que
// o vendedor deve focar por padrão; "Todas as campanhas" e as campanhas de retorno
// (Base Fria etc.) ficam disponíveis como opção, não como visão inicial.
const CAMPANHA_PRINCIPAL = '__principal__';

function FunilTimeComercial({ viewAsName }: VendorScopeProps) {
  const [leads, setLeads] = useState<LeadComCanal[]>([]);
  const [totalCarregavel, setTotalCarregavel] = useState(0);
  const [canalAtivo, setCanalAtivo] = useState<CanalAquisicao | 'todos'>('todos');
  const [campanhaAtiva, setCampanhaAtiva] = useState<string | 'todas'>('todas');
  const [metricasTurma, setMetricasTurma] = useState<MetricaTurma[]>([]);
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [turmasPorId, setTurmasPorId] = useState<Record<string, string>>({});
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [contagens, setContagens] = useState<Contagem[]>([]);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [novaCampanhaNome, setNovaCampanhaNome] = useState('');
  const [novaCampanhaCondicoes, setNovaCampanhaCondicoes] = useState('');
  const [novaCampanhaTipo, setNovaCampanhaTipo] = useState<'novo' | 'retorno'>('novo');
  const [salvandoCampanha, setSalvandoCampanha] = useState(false);

  // Campanha de retorno = base antiga reimportada (Base Fria, Grupo Oferta Não
  // Matriculou, NPA Não Matriculou etc.) — conta pro "Total de Leads" só quando
  // o vendedor abre essa campanha especificamente, não entra no total geral/canal
  // pra não inflar o número com milhares de leads frios de anos atrás.
  const campanhaIdsRetorno = campanhas.filter((c) => c.tipo === 'retorno').map((c) => c.id);
  const isContagemRetorno = (c: Contagem) => c.campanha_id != null && campanhaIdsRetorno.includes(c.campanha_id);

  // Debounce da busca — evita disparar uma query a cada tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const fetchLeads = async () => {
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('origem', 'Time Comercial');

    if (canalAtivo !== 'todos') query = query.eq('canal', canalAtivo);
    if (campanhaAtiva === CAMPANHA_PRINCIPAL) query = (query as any).is('campanha_id', null);
    else if (campanhaAtiva !== 'todas') query = (query as any).eq('campanha_id', campanhaAtiva);
    else if (canalAtivo !== RETORNO_CANAL) {
      // "Todas as campanhas" exclui campanha de retorno (base antiga) — usa lista
      // positiva (funil principal + campanhas de contato novo) em vez de "not in",
      // que no Postgres descarta campanha_id NULL junto (lógica de 3 valores do SQL).
      // Não se aplica dentro do próprio canal Retorno/Base — lá é 100% campanha de
      // retorno por definição, excluir deixaria a lista vazia.
      const campanhaIdsNaoRetorno = campanhas.filter((c) => c.tipo !== 'retorno').map((c) => c.id);
      query = campanhaIdsNaoRetorno.length > 0
        ? (query as any).or(`campanha_id.is.null,campanha_id.in.(${campanhaIdsNaoRetorno.join(',')})`)
        : (query as any).is('campanha_id', null);
    }
    if (viewAsName) query = (query as any).or(`vendedor.is.null,vendedor.eq.${viewAsName}`);
    if (buscaDebounced) {
      const digitos = buscaDebounced.replace(/\D/g, '');
      query = digitos.length >= 4
        ? (query as any).or(`nome.ilike.%${buscaDebounced}%,telefone.ilike.%${digitos}%`)
        : (query as any).ilike('nome', `%${buscaDebounced}%`);
    }

    const { data, error, count } = await query.order('criado_em', { ascending: false }).limit(LEADS_RENDER_LIMIT);

    if (error) {
      console.error('Erro ao carregar leads do Time Comercial:', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível carregar os leads',
        description: error.message,
      });
      return;
    }

    if (data) {
      // interesse_produto é o produto/curso de interesse de verdade (ex: "Psicanálise");
      // `produto` na tabela é categórico (direto/lancamento/npa/time_comercial), não serve
      // pra exibir — sobrescreve o fallback de dbRowToLead que cairia nele por engano.
      setLeads(data.map((row: any) => ({ ...dbRowToLead(row), canal: row.canal, vendedor: row.vendedor, cursoInteresse: row.interesse_produto || '', lancamentoId: row.lancamento_id, cidade: row.cidade, campanhaId: row.campanha_id })));
      setTotalCarregavel(count ?? data.length);
    }
  };

  // Contagens exatas (badges, "Total de Leads", decisão de mostrar coluna Retorno)
  // vêm de uma função agregada no banco — não dá pra confiar em `leads.length`
  // pra isso, já que `leads` é só a 1ª leva (ver LEADS_RENDER_LIMIT).
  const fetchContagens = async () => {
    const { data, error } = await (supabase as any).rpc('time_comercial_contagens');
    if (error) {
      console.error('Erro ao carregar contagens do Time Comercial:', error);
      return;
    }
    if (data) setContagens(data as Contagem[]);
  };

  const contagemFiltrada = (pred: (c: Contagem) => boolean) =>
    contagens
      .filter((c) => pred(c) && (!viewAsName || !c.vendedor || c.vendedor === viewAsName))
      .reduce((soma, c) => soma + Number(c.total), 0);

  const fetchCampanhas = async () => {
    const { data } = await (supabase as any).from('time_comercial_campanhas').select('*').order('criado_em', { ascending: false });
    if (data) setCampanhas(data as Campanha[]);
  };

  // "Leads por turma" + taxa de conversão Grupo de Oferta → Matrícula (por turma SDD)
  // — métrica extra pra comparar o desempenho de cada turma.
  const fetchMetricasExtras = async () => {
    const { data: turmas, error } = await (supabase as any).rpc('time_comercial_metricas_turma');
    if (error) console.error('Erro ao carregar métricas por turma:', error);
    if (turmas) setMetricasTurma(turmas as MetricaTurma[]);
  };

  useEffect(() => {
    fetchCampanhas();
    fetchContagens();
    fetchMetricasExtras();
    // Nome da turma (ex: "Turma #44") pra exibir no card — buscado uma vez só,
    // não muda com frequência.
    supabase.from('lancamentos').select('id, nome').then(({ data }) => {
      if (data) setTurmasPorId(Object.fromEntries(data.map((l: any) => [l.id, l.nome])));
    });
    const channel = supabase
      .channel('time-comercial-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `origem=eq.Time Comercial` }, () => {
        fetchLeads();
        fetchContagens();
        fetchMetricasExtras();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Refaz a busca sempre que canal/campanha/busca (debounced) ou o vendedor
  // simulado mudam — filtro acontece no banco, não em memória.
  useEffect(() => {
    fetchLeads();
  }, [canalAtivo, campanhaAtiva, buscaDebounced, viewAsName, campanhas]);

  const getLeadsByStage = (stage: TimeComercialStage) => leads.filter((lead) => lead.etapa === stage);

  // "Novo" só faz sentido como aviso na visão "Todos os canais" — dentro de um canal
  // específico o vendedor já sabe que está olhando pra base daquele canal; o alerta é
  // pra quem está no panorama geral não perder um lead recém-chegado no meio da lista.
  const isLeadRecente = (lead: LeadComCanal) => {
    // Lead de campanha de retorno (base antiga reimportada) nunca é "novo", mesmo
    // que tenha acabado de ser inserido no banco — criado_em aqui é a data da
    // importação, não a data em que o lead surgiu de verdade.
    if ((lead.etapa as string) === 'retorno') return false;
    const criado = new Date(lead.criadoEm).getTime();
    return !Number.isNaN(criado) && Date.now() - criado < 24 * 60 * 60 * 1000;
  };

  // Pill do canal não conta leads de campanha de retorno — só o que está "em jogo"
  // agora (funil principal + campanhas de contato novo). A base antiga continua
  // visível e contada normalmente dentro do seletor de campanha, só não infla esse número.
  // Não se aplica ao próprio canal Retorno/Base, que é 100% campanha de retorno.
  const contagemPorCanal = (canal: CanalAquisicao) => contagemFiltrada((c) => c.canal === canal && (canal === RETORNO_CANAL || !isContagemRetorno(c)));

  const campanhasDoCanal = canalAtivo !== 'todos' ? campanhas.filter((c) => c.canal === canalAtivo && c.ativa) : [];
  const contagemPorCampanha = (campanhaId: string) => contagemFiltrada((c) => c.canal === canalAtivo && c.campanha_id === campanhaId);
  const contagemPrincipal = canalAtivo !== 'todos' ? contagemFiltrada((c) => c.canal === canalAtivo && c.campanha_id === null) : 0;
  const canalTemPrincipal = (canal: CanalAquisicao) => contagemFiltrada((c) => c.canal === canal && c.campanha_id === null) > 0;
  // Quando o canal não tem funil principal (ex: Direto, Workshop — só existem como
  // campanha de retorno), abrir o canal já cai direto na única campanha existente em
  // vez de ficar preso em "Todas as campanhas" excluindo retorno (o que mostraria 0).
  const defaultCampanhaFor = (canal: CanalAquisicao) => {
    if (canalTemPrincipal(canal)) return CAMPANHA_PRINCIPAL;
    const campsDoCanal = campanhas.filter((c) => c.canal === canal && c.ativa);
    return campsDoCanal.length === 1 ? campsDoCanal[0].id : 'todas';
  };

  // Respeita a campanha selecionada (inclusive o sentinela "funil principal") nos
  // cálculos de estatística abaixo — sem isso os cards (Total de Leads etc.)
  // continuavam somando o canal inteiro mesmo com uma campanha específica escolhida.
  const campanhaPred = (c: Contagem) => {
    // "Todas as campanhas" não inclui campanha de retorno (base antiga) — só quando
    // o vendedor abre aquela campanha especificamente ela entra na conta (ver o
    // 3º ramo abaixo, que bate certinho com o campanha_id escolhido). Exceto dentro
    // do próprio canal Retorno/Base, onde isso é 100% do conteúdo por definição.
    if (campanhaAtiva === 'todas') return canalAtivo === RETORNO_CANAL || !isContagemRetorno(c);
    if (campanhaAtiva === CAMPANHA_PRINCIPAL) return c.campanha_id === null;
    return c.campanha_id === campanhaAtiva;
  };

  // Lista consolidada — mesmo lead que já mudou de etapa continua aparecendo aqui,
  // sempre no mesmo lugar, só troca o badge de fase. Não some do sistema ao avançar.
  // Já vem filtrada do banco (canal/campanha/busca/visibilidade, ver fetchLeads).
  const leadsVisiveis = leads;

  const criarCampanha = async () => {
    if (!novaCampanhaNome.trim() || canalAtivo === 'todos') return;
    setSalvandoCampanha(true);
    const { error } = await (supabase as any).from('time_comercial_campanhas').insert({
      canal: canalAtivo,
      nome: novaCampanhaNome.trim(),
      condicoes: novaCampanhaCondicoes.trim() || null,
      tipo: novaCampanhaTipo,
    });
    setSalvandoCampanha(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível criar a campanha', description: error.message });
      return;
    }
    toast({ title: 'Campanha criada!' });
    setNovaCampanhaNome('');
    setNovaCampanhaCondicoes('');
    setNovaCampanhaTipo('novo');
    setNovaCampanhaOpen(false);
    fetchCampanhas();
  };

  const handleStageChange = async (lead: Lead, newStage: TimeComercialStage) => {
    try {
      await supabase.from('leads').update({ status: newStage }).eq('id', lead.id);
      fetchLeads();
      fetchContagens();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a etapa', description: error?.message || 'Tente novamente.' });
    }
  };

  const claimLead = async (lead: Lead) => {
    if (!viewAsName) return;
    try {
      await (supabase.from('leads') as any).update({ vendedor: viewAsName }).eq('id', lead.id);
      fetchLeads();
      fetchContagens();
      toast({ title: 'Lead marcado como seu!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível marcar o lead', description: error?.message || 'Tente novamente.' });
    }
  };

  // Devolve o lead pra fila (vendedor = null) — pra quando alguém pegou o lead
  // errado sem querer. Some da lista de quem devolveu (se estiver "vendo como"
  // alguém) e volta a aparecer como "Sem vendedor" pros outros.
  const unclaimLead = async (lead: Lead) => {
    try {
      await (supabase.from('leads') as any).update({ vendedor: null }).eq('id', lead.id);
      fetchLeads();
      fetchContagens();
      toast({ title: 'Lead devolvido — sem vendedor de novo.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível devolver o lead', description: error?.message || 'Tente novamente.' });
    }
  };

  const [leadParaExcluir, setLeadParaExcluir] = useState<LeadComCanal | null>(null);
  const excluirLead = async () => {
    if (!leadParaExcluir) return;
    try {
      await supabase.from('leads').delete().eq('id', leadParaExcluir.id);
      setLeadParaExcluir(null);
      fetchLeads();
      fetchContagens();
      fetchMetricasExtras();
      toast({ title: 'Lead excluído.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível excluir o lead', description: error?.message || 'Tente novamente.' });
    }
  };

  // Trajetória completa do lead (toda troca de fase, com data/hora e quem era o
  // vendedor na hora) — gravada automaticamente por trigger no banco.
  const [historico, setHistorico] = useState<{ lead: LeadComCanal; itens: any[] } | null>(null);
  const abrirHistorico = async (lead: LeadComCanal) => {
    const { data, error } = await (supabase as any).from('leads_historico_fase')
      .select('fase_anterior, fase_nova, vendedor, criado_em')
      .eq('lead_id', lead.id)
      .order('criado_em', { ascending: true });
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar o histórico', description: error.message });
      return;
    }
    setHistorico({ lead, itens: data ?? [] });
  };

  // SDD (Semana do Despertar) tem funil próprio; os demais canais usam as etapas
  // genéricas até terem o funil deles definido. "Retorno" só aparece quando tem
  // lead nela (campanha de reativação) — substitui "Novo" quando é só retorno
  // (campanha 100% de reativação), ou aparece ao lado quando os dois se misturam
  // (ex: "Todas as campanhas" dentro de um canal com campanha nova + de retorno).
  let activeStages = canalAtivo === 'SDD' ? SDD_STAGES : GENERIC_STAGES;
  {
    // Etapa de entrada "genérica" que "Retorno" substitui/acompanha: "Frio" no
    // funil SDD, "Novo" nos demais canais.
    const entradaKey = canalAtivo === 'SDD' ? 'frio' : 'novo';
    const temRetorno = contagemFiltrada((c) => c.canal === canalAtivo && c.status === 'retorno' && campanhaPred(c)) > 0;
    const temEntrada = contagemFiltrada((c) => c.canal === canalAtivo && c.status === entradaKey && campanhaPred(c)) > 0;
    if (temRetorno) {
      activeStages = temEntrada
        ? [RETORNO_STAGE, ...activeStages]
        : [RETORNO_STAGE, ...activeStages.filter((s) => s.key !== entradaKey)];
    }
  }
  const displayColumns = [LEADS_COLUMN, ...activeStages];
  const totalLeadsPred = (c: Contagem) => (canalAtivo === 'todos' ? !isContagemRetorno(c) : c.canal === canalAtivo && campanhaPred(c));
  const totalLeads = contagemFiltrada(totalLeadsPred);
  const leadsEmMatricula = contagemFiltrada((c) => totalLeadsPred(c) && c.status === 'matricula');
  // Denominador da % de matrícula: só os leads que já têm vendedor (foram "pegos" e
  // estão em gestão ativa) — um lead ainda sem vendedor, seja novo ou de campanha de
  // retorno, nunca teve chance real de converter, então não deve diluir a taxa.
  const leadsAtribuidos = contagemFiltrada((c) => totalLeadsPred(c) && c.vendedor !== null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{viewAsName ? 'Seus leads em andamento, do primeiro contato até a matrícula.' : 'Todos os leads do Time Comercial, de todo mundo, em andamento.'}</p>

      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Canal de aquisição</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setCanalAtivo('todos'); setCampanhaAtiva('todas'); }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${canalAtivo === 'todos' ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
          >
            Todos os canais
          </button>
          {CANAIS_AQUISICAO.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCanalAtivo(c); setCampanhaAtiva(defaultCampanhaFor(c)); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${canalAtivo === c ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
            >
              {c} <span className={canalAtivo === c ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}>({contagemPorCanal(c)})</span>
            </button>
          ))}
        </div>

        {canalAtivo !== 'todos' && (campanhasDoCanal.length > 0 || !viewAsName) && (
          <div className="flex items-start gap-2 mt-3 pt-3 border-t border-dashed border-border">
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-1.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/70">Campanha dentro de "{canalAtivo}"</p>
                {!viewAsName && (
                  <button
                    type="button"
                    onClick={() => setNovaCampanhaOpen(true)}
                    className="text-[10px] font-semibold text-success hover:underline flex-shrink-0"
                  >
                    + Nova campanha
                  </button>
                )}
              </div>
              {campanhasDoCanal.length > 0 ? (
                <>
                  <Select value={campanhaAtiva} onValueChange={setCampanhaAtiva}>
                    <SelectTrigger className="h-8 text-xs bg-card w-full sm:w-72 border-success/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-[100]">
                      {canalTemPrincipal(canalAtivo as CanalAquisicao) && (
                        <SelectItem value={CAMPANHA_PRINCIPAL} className="text-xs font-semibold">
                          ★ Turma atual — funil principal ({contagemPrincipal})
                        </SelectItem>
                      )}
                      <SelectItem value="todas" className="text-xs">Todas as campanhas ({contagemFiltrada((c) => c.canal === canalAtivo && (canalAtivo === RETORNO_CANAL || !isContagemRetorno(c)))})</SelectItem>
                      {campanhasDoCanal.map((camp) => (
                        <SelectItem key={camp.id} value={camp.id} className="text-xs" title={camp.condicoes ?? undefined}>
                          {camp.nome} ({contagemPorCampanha(camp.id)}) {camp.tipo === 'retorno' ? '· Retorno (base antiga)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {campanhaAtiva === CAMPANHA_PRINCIPAL && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Funil principal — a turma que está rodando agora. É aqui que o vendedor deve focar; as campanhas de retorno (base antiga) ficam disponíveis como opção neste seletor, mas não são a visão padrão.
                    </p>
                  )}
                  {campanhaAtiva === 'todas' && canalAtivo !== RETORNO_CANAL && campanhasDoCanal.some((c) => c.tipo === 'retorno') && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Não inclui as campanhas de retorno (base antiga) — elas só entram na conta quando você abre uma delas especificamente no seletor acima.
                    </p>
                  )}
                  {campanhaAtiva !== 'todas' && campanhaAtiva !== CAMPANHA_PRINCIPAL && (() => {
                    const camp = campanhasDoCanal.find((c) => c.id === campanhaAtiva);
                    if (!camp) return null;
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {camp.tipo === 'retorno'
                          ? 'Campanha de retorno — esses leads já estavam no sistema antes, por isso entram na etapa "Retorno" em vez de "Novo".'
                          : 'Campanha de contato inédito — leads entram na etapa "Novo".'}
                        {camp.condicoes && <> <span className="font-medium text-foreground">Condição:</span> {camp.condicoes}</>}
                      </p>
                    );
                  })()}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma campanha criada ainda pra esse canal.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <SectionBar title="Visão geral" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          label="Total de Leads"
          value={totalLeads}
          hint={`Em ${activeStages.length} estágios`}
          icon={Users}
        />
        <StatTile
          label="Em Matrícula"
          value={leadsEmMatricula}
          hint={leadsAtribuidos > 0 ? `${((leadsEmMatricula / leadsAtribuidos) * 100).toFixed(1)}% dos leads em gestão (com vendedor)` : 'Nenhum lead com vendedor ainda'}
          icon={TrendingUp}
        />
      </div>

      {metricasTurma.length > 0 && canalAtivo === 'SDD' && (
        <>
          <SectionBar title="Leads por turma" subtitle="Quantos leads cada turma da Semana do Despertar recebeu, quantos chegaram no grupo de oferta e a taxa de conversão até a matrícula." />
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                  <TableHead>Turma</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Chegou no grupo de oferta</TableHead>
                  <TableHead className="text-right">Matriculados</TableHead>
                  <TableHead className="text-right">Conversão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricasTurma.map((m, idx) => (
                  <TableRow key={m.lancamento_id} className={premiumZebraRow(idx)}>
                    <TableCell className="font-medium flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-primary" />{m.turma_nome ?? 'Sem nome'}</TableCell>
                    <TableCell className="text-right">{m.leads_total}</TableCell>
                    <TableCell className="text-right">{m.chegou_grupo_oferta}</TableCell>
                    <TableCell className="text-right">{m.matriculados}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {m.chegou_grupo_oferta > 0 ? `${((m.matriculados / m.chegou_grupo_oferta) * 100).toFixed(1)}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SectionBar title="Leads" subtitle="A coluna Leads (à esquerda, contorno tracejado) mostra todo mundo, de qualquer fase — as outras colunas mostram só quem está naquela fase." />
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar lead por nome ou telefone..."
          className="pl-9 h-9 text-sm"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Limpar busca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {totalCarregavel > leads.length && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          Mostrando os {leads.length} mais recentes de {totalCarregavel.toLocaleString('pt-BR')} — use a busca ou uma campanha pra encontrar leads mais antigos.
        </p>
      )}
      <div className="flex-1 flex gap-3 lg:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory lg:snap-none min-h-0">
        {displayColumns.map((stage) => {
          const stageLeads = stage.key === LEADS_COLUMN_KEY ? leadsVisiveis : getLeadsByStage(stage.key as TimeComercialStage);
          const isLeadsColumn = stage.key === LEADS_COLUMN_KEY;
          return (
            <div key={stage.key} className={`flex-shrink-0 w-[85vw] sm:w-72 lg:w-80 snap-center lg:snap-align-none ${isLeadsColumn ? 'rounded-lg border-2 border-dashed border-muted-foreground/30 p-1.5 -m-1.5 lg:mr-2' : ''}`}>
              {isLeadsColumn ? (
                <div className="rounded-t-md p-2.5 lg:p-3 bg-muted border-b-2 border-dashed border-muted-foreground/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-foreground text-sm lg:text-base">{stage.label}</span>
                      <p className="text-[10px] text-muted-foreground leading-tight">todas as fases juntas</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{stageLeads.length}</Badge>
                  </div>
                </div>
              ) : (
                <div className={`rounded-t-lg p-2.5 lg:p-3 ${stage.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary-foreground text-sm lg:text-base">{stage.label}</span>
                    <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 text-xs">{stageLeads.length}</Badge>
                  </div>
                </div>
              )}
              <div className={`bg-muted/50 rounded-b-lg p-2 lg:p-3 space-y-2 lg:space-y-3 min-h-[50vh] lg:min-h-96 max-h-[calc(100vh-20rem)] overflow-y-auto ${isLeadsColumn ? 'rounded-t-none' : ''}`}>
                {stageLeads.map((lead) => {
                  return (
                    <Card key={lead.id} className="p-3 lg:p-4 bg-card border-border hover:shadow-md transition-shadow">
                      <div className="mb-2">
                        <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">{lead.nome}</h3>
                        {lead.telefone && <p className="text-xs text-muted-foreground truncate">{lead.telefone}{lead.cidade ? ` · ${lead.cidade}` : ''}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {canalAtivo === 'todos' && isLeadRecente(lead) && (
                            <Badge className="text-[10px] bg-success text-success-foreground border-0">● Novo</Badge>
                          )}
                          {lead.canal && <Badge variant="secondary" className="text-[10px]">{lead.canal}</Badge>}
                          {lead.cursoInteresse && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{lead.cursoInteresse}</Badge>}
                          {lead.lancamentoId && turmasPorId[lead.lancamentoId] && (
                            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">{turmasPorId[lead.lancamentoId]}</Badge>
                          )}
                          {lead.campanhaId && campanhas.find((c) => c.id === lead.campanhaId) && (
                            <Badge variant="outline" className="text-[10px] border-success/40 text-success">{campanhas.find((c) => c.id === lead.campanhaId)?.nome}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mb-2 lg:mb-3">
                        <button
                          type="button"
                          onClick={() => openWhatsApp(lead.telefone)}
                          className="flex-1 h-8 text-xs inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-success" /> WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirHistorico(lead)}
                          title="Ver trajetória do lead"
                          className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <History className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeadParaExcluir(lead)}
                          title="Excluir lead"
                          className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-destructive/10 hover:border-destructive/40 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                      <div className="mb-2 lg:mb-3">
                        {lead.vendedor ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className="text-xs text-white"
                              style={{ backgroundColor: INITIAL_VENDORS.find((v) => v.name === lead.vendedor)?.cor }}
                            >
                              {lead.vendedor.split(' ')[0]}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => unclaimLead(lead)}
                              title="Devolver lead (tirar vendedor, caso tenha pegado errado)"
                              className="h-6 w-6 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                            >
                              <RotateCcw className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        ) : viewAsName ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => claimLead(lead)}>
                            Pegar lead
                          </Button>
                        ) : (
                          <Badge className="text-xs border-0 bg-warning/10 text-warning">Sem vendedor</Badge>
                        )}
                      </div>
                      {stage.key === LEADS_COLUMN_KEY && (
                        <div className="mb-2 lg:mb-3">
                          <Badge className={`text-xs text-primary-foreground border-0 ${stageInfoFor(lead).color}`}>{stageInfoFor(lead).label}</Badge>
                        </div>
                      )}
                      <Select value={lead.etapa} onValueChange={(value) => handleStageChange(lead, value as TimeComercialStage)}>
                        <SelectTrigger className="w-full h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card border-border z-[100]" position="popper" sideOffset={4}>
                          {(() => {
                            const base = lead.canal === 'SDD' ? SDD_STAGES : GENERIC_STAGES;
                            return (lead.etapa as string) === 'retorno' ? [RETORNO_STAGE, ...base] : base;
                          })().map((s) => (
                            <SelectItem key={s.key} value={s.key} className="text-xs cursor-pointer">
                              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  );
                })}
                {stageLeads.length === 0 && <div className="text-center py-6 lg:py-8 text-muted-foreground text-xs lg:text-sm">Nenhum lead nesta etapa</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={novaCampanhaOpen} onOpenChange={setNovaCampanhaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Nova campanha — {canalAtivo}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="campanha-nome">Nome da campanha</Label>
              <Input id="campanha-nome" value={novaCampanhaNome} onChange={(e) => setNovaCampanhaNome(e.target.value)} placeholder="Ex: Instagram Out/26" disabled={salvandoCampanha} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de lead nessa campanha</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNovaCampanhaTipo('novo')}
                  disabled={salvandoCampanha}
                  className={`text-left rounded-lg border p-2.5 transition-all ${novaCampanhaTipo === 'novo' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
                >
                  <p className="text-xs font-semibold text-foreground">Novo</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Contato inédito — entra na etapa Novo.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNovaCampanhaTipo('retorno')}
                  disabled={salvandoCampanha}
                  className={`text-left rounded-lg border p-2.5 transition-all ${novaCampanhaTipo === 'retorno' ? 'border-warning bg-warning/10' : 'border-border bg-card hover:bg-muted/50'}`}
                >
                  <p className="text-xs font-semibold text-foreground">Retorno</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Já estava no sistema — entra na etapa Retorno, não Novo.</p>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campanha-condicoes">Condição / oferta (opcional)</Label>
              <Textarea id="campanha-condicoes" value={novaCampanhaCondicoes} onChange={(e) => setNovaCampanhaCondicoes(e.target.value)} placeholder="Ex: 20% off, parcela em 12x, bônus X..." disabled={salvandoCampanha} rows={3} />
              <p className="text-xs text-muted-foreground">Vendedor vê isso ao passar o mouse no filtro da campanha.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaCampanhaOpen(false)} disabled={salvandoCampanha}>Cancelar</Button>
            <Button onClick={criarCampanha} disabled={salvandoCampanha || !novaCampanhaNome.trim()}>
              {salvandoCampanha ? 'Salvando...' : 'Criar campanha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historico} onOpenChange={(open) => !open && setHistorico(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History size={16} /> Trajetória — {historico?.lead.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 max-h-96 overflow-y-auto py-1">
            {historico?.itens.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem histórico registrado ainda.</p>
            )}
            {historico?.itens.map((item, idx) => {
              const stageInfo = (historico.lead.canal === 'SDD' ? SDD_STAGES : GENERIC_STAGES).find((s) => s.key === item.fase_nova);
              return (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${stageInfo?.color ?? 'bg-muted-foreground'}`} />
                    {idx < (historico?.itens.length ?? 0) - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-sm font-medium text-foreground">{stageInfo?.label ?? item.fase_nova}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {item.vendedor && ` · ${item.vendedor}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leadParaExcluir} onOpenChange={(open) => !open && setLeadParaExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 size={16} /> Excluir lead
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que quer excluir <span className="font-semibold text-foreground">{leadParaExcluir?.nome}</span>? Essa ação não pode ser desfeita — o lead some do sistema, junto com o histórico dele.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLeadParaExcluir(null)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={excluirLead}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -----------------------------------------------------------------------
// Metas 2026 — equipe nova (Helen, Miguel, Aline). Sem historico do sistema,
// so a equipe comercial de agora em diante. Numeros e formula portados do
// protótipo (painel-despertamente.html) calibrado com o dono do negocio.
// -----------------------------------------------------------------------

const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

const FAT_POR_VENDA_MIX = 0.3 * 1485 + 0.7 * 150; // 550,5 — mesmo mix da calculadora de remuneração

const METAS_MESES: { mes: string; vendas: number }[] = [
  { mes: 'Set/26', vendas: 90 },  // Meta Base da equipe completa
  { mes: 'Out/26', vendas: 100 },
  { mes: 'Nov/26', vendas: 115 },
  { mes: 'Dez/26', vendas: 130 },
];

function MetasTab({ viewAsName }: VendorScopeProps) {
  const maxVendas = Math.max(...METAS_MESES.map((x) => x.vendas));
  const vendasTotal = METAS_MESES.reduce((s, x) => s + x.vendas, 0);
  const faturamentoTotal = METAS_MESES.reduce((s, x) => s + x.vendas * FAT_POR_VENDA_MIX, 0);

  // Vendedor(a) comum ve so a fatia dela do plano (meta dividida por 3);
  // "Todos"/gerente continuam vendo a meta agregada da equipe.
  if (viewAsName) {
    const mesesIndividual = METAS_MESES.map((x) => ({ mes: x.mes, vendas: Math.round(x.vendas / 3) }));
    const maxIndividual = Math.max(...mesesIndividual.map((x) => x.vendas));
    const vendasTotalIndividual = mesesIndividual.reduce((s, x) => s + x.vendas, 0);
    const faturamentoTotalIndividual = mesesIndividual.reduce((s, x) => s + x.vendas * FAT_POR_VENDA_MIX, 0);

    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground -mt-1">Sua meta do mês e como o seu faturamento cresce até dezembro.</p>
        <SectionBar title="Sua meta" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Sua Meta Base" value={<>30 <span className="text-sm font-normal text-muted-foreground">vendas/mês</span></>} hint={viewAsName ?? undefined} icon={Target} />
          <StatTile label="Seu faturamento na Meta Base" value={<>~R$ 16.515<span className="text-sm font-normal text-muted-foreground">/mês</span></>} hint="mix 30% à vista/cartão + 70% recorrente" icon={DollarSign} />
          <StatTile label="Meses restantes em 2026" value="Set–Dez" hint="4 meses de ramp-up" icon={CalendarDays} />
        </div>

        <SectionBar title="Evolução mês a mês" />
        <Card className="p-4 overflow-x-auto">
          <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
            <TableHeader>
              <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Suas vendas</TableHead>
                <TableHead className="text-right">Seu faturamento estimado</TableHead>
                <TableHead className="w-[35%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesesIndividual.map((x, idx) => {
                const faturamento = x.vendas * FAT_POR_VENDA_MIX;
                const pct = (x.vendas / maxIndividual) * 100;
                return (
                  <TableRow key={x.mes} className={premiumZebraRow(idx)}>
                    <TableCell>{x.mes}</TableCell>
                    <TableCell className="text-right">{x.vendas}</TableCell>
                    <TableCell className="text-right">{fmt(faturamento)}</TableCell>
                    <TableCell>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter className="bg-primary/10">
              <TableRow>
                <TableCell className="font-semibold text-primary">Total Set–Dez/2026</TableCell>
                <TableCell className="text-right font-semibold">{vendasTotalIndividual}</TableCell>
                <TableCell className="text-right font-semibold text-primary">{fmt(faturamentoTotalIndividual)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            Sua fatia é a meta da equipe dividida por 3 — não é uma meta individual formal ainda. Setembro parte da Meta Base (30 vendas).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">Visão consolidada da equipe — quanto os 3 vendedores juntos precisam entregar.</p>
      <SectionBar title="Meta da equipe" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Meta Base da equipe" value={<>90 <span className="text-sm font-normal text-muted-foreground">vendas/mês</span></>} hint="30 × 3 vendedores" icon={Target} />
        <StatTile label="Faturamento na Meta Base" value={<>~R$ 49.545<span className="text-sm font-normal text-muted-foreground">/mês</span></>} hint="mix 30% à vista/cartão + 70% recorrente" icon={DollarSign} />
        <StatTile label="Meses restantes em 2026" value="Set–Dez" hint="4 meses de ramp-up com a equipe nova" icon={CalendarDays} />
      </div>

      <SectionBar title="Evolução mês a mês" />
      <Card className="p-4 overflow-x-auto">
        <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
          <TableHeader>
            <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Vendas (equipe)</TableHead>
              <TableHead className="text-right">Faturamento estimado</TableHead>
              <TableHead className="w-[35%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METAS_MESES.map((x, idx) => {
              const faturamento = x.vendas * FAT_POR_VENDA_MIX;
              const pct = (x.vendas / maxVendas) * 100;
              return (
                <TableRow key={x.mes} className={premiumZebraRow(idx)}>
                  <TableCell>{x.mes}</TableCell>
                  <TableCell className="text-right">{x.vendas}</TableCell>
                  <TableCell className="text-right">{fmt(faturamento)}</TableCell>
                  <TableCell>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="bg-primary/10">
            <TableRow>
              <TableCell className="font-semibold text-primary">Total Set–Dez/2026</TableCell>
              <TableCell className="text-right font-semibold">{vendasTotal}</TableCell>
              <TableCell className="text-right font-semibold text-primary">{fmt(faturamentoTotal)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
          Setembro parte da Meta Base (90 vendas). Depois disso é um ramp-up ilustrativo — ajuste assim que tiver o primeiro mês fechado com a equipe nova.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Mix de pagamento alvo</h3>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>À vista / Cartão até 12x</TableCell>
                <TableCell className="text-right">30%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Recorrente (cartão/boleto 15x)</TableCell>
                <TableCell className="text-right">70%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Como a meta cresce</h3>
          <p className="text-sm text-muted-foreground">
            Setembro é o primeiro mês com a equipe completa, por isso começa na Meta Base. Outubro a dezembro sobem gradualmente conforme a curva de aprendizado avança.
          </p>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Aquisição — Semana do Despertar (unico canal definido ate agora). Conteudo
// e datas portados do protótipo; notas internas/premissas marcadas como
// "admin-only" no HTML de origem foram deliberadamente omitidas aqui.
// -----------------------------------------------------------------------

const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const TURMA_45_AULA1 = new Date(2026, 8, 1); // 01/set/2026
const FIM_DO_ANO = new Date(2026, 11, 19); // corta antes da semana de Natal

const SDD_CICLO = [
  { fase: 'Captação', quando: `${fmtData(addDays(TURMA_45_AULA1, -18))} – ${fmtData(addDays(TURMA_45_AULA1, -8))}`, desc: 'Landing page no ar, inscrições abertas, anúncios/orgânico rodando para captar leads.' },
  { fase: 'Aquecimento', quando: `${fmtData(addDays(TURMA_45_AULA1, -7))} – ${fmtData(addDays(TURMA_45_AULA1, -1))}`, desc: 'Lembretes para quem já se inscreveu, contagem regressiva, sem captação de leads novos.' },
  { fase: 'Semana ao vivo', quando: `${fmtData(TURMA_45_AULA1)} – ${fmtData(addDays(TURMA_45_AULA1, 2))}`, desc: 'Aula 1 (ter) → Aula 2 (qua, pitch + carrinho abre) → Aula 3 (qui, carrinho fecha).' },
  { fase: 'Pós-lançamento', quando: `${fmtData(addDays(TURMA_45_AULA1, 3))} – ${fmtData(addDays(TURMA_45_AULA1, 6))}`, desc: 'Remarketing/contato com leads que assistiram mas não compraram.' },
];

function buildSddTurmas() {
  const turmas: { n: number; aula1: Date; real: boolean }[] = [{ n: 45, aula1: TURMA_45_AULA1, real: true }];
  let n = 46;
  let next = addDays(TURMA_45_AULA1, 14);
  while (next <= FIM_DO_ANO) {
    turmas.push({ n, aula1: next, real: false });
    n++;
    next = addDays(next, 14);
  }
  return turmas;
}

const SDD_TURMAS = buildSddTurmas();

function AquisicaoTab() {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">Como os leads chegam: a Semana do Despertar, o único canal de captação definido até agora.</p>
      <SectionBar title="Visão geral" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Formato" value="3 aulas" hint="ao vivo, YouTube, Ter/Qua/Qui às 20h" icon={Video} />
        <StatTile label="Próxima turma" value="#45" hint="01–03/set/2026" icon={Rocket} />
        <StatTile label="Cadência" value="Quinzenal" hint="semana sim, semana não — até dez/2026" icon={Repeat} />
      </div>

      <SectionBar title="Como funciona cada turma" />
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">As 3 aulas</h3>
        <div className="flex flex-col gap-2">
          {[
            { idx: 1, titulo: 'Aula 01 — "O Despertar" · terça, 20h', desc: 'Teoria do Aparelho, Teoria Estrutural, Portas para o Inconsciente. Só conteúdo — sem oferta.', pill: 'Captação', color: 'bg-primary/10 text-primary' },
            { idx: 2, titulo: 'Aula 02 — "A Cura" · quarta, 20h', desc: 'Heranças traumáticas, narcisismo, autoestima. Pitch da formação PSI acontece aqui — carrinho abre ao final da aula.', pill: 'Pitch + carrinho abre', color: 'bg-warning/10 text-warning' },
            { idx: 3, titulo: 'Aula 03 — "A Revelação" · quinta, 20h', desc: 'Pulsão de morte, estresse, atos suicidas. Reforço da oferta e última chamada — carrinho fecha na sequência.', pill: 'Fechamento de carrinho', color: 'bg-destructive/10 text-destructive' },
          ].map((step) => (
            <div key={step.idx} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{step.idx}</div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{step.titulo}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
              </div>
              <Badge className={`text-xs border-0 ${step.color}`}>{step.pill}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Ciclo operacional de cada turma</h3>
        <div className="flex flex-col divide-y divide-border">
          {SDD_CICLO.map((row) => (
            <div key={row.fase} className="grid grid-cols-[110px_1fr] gap-3 py-3 first:pt-0">
              <div className="text-sm font-semibold text-primary">{row.fase}</div>
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">{row.quando}</p>
                <p className="text-muted-foreground mt-0.5">{row.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionBar title="Calendário de turmas" />
      <Card className="p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-foreground mb-3">Calendário 2026 — quinzenal (semana sim, semana não)</h3>
        <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
          <TableHeader>
            <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
              <TableHead>Turma</TableHead>
              <TableHead>Aula 1 (ter)</TableHead>
              <TableHead>Aula 2 (qua) — pitch</TableHead>
              <TableHead>Aula 3 (qui) — fecha</TableHead>
              <TableHead>Captação abre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SDD_TURMAS.map((t, idx) => {
              const aula2 = addDays(t.aula1, 1);
              const aula3 = addDays(t.aula1, 2);
              const captacao = addDays(t.aula1, -18);
              return (
                <TableRow key={t.n} className={premiumZebraRow(idx)}>
                  <TableCell>
                    <Badge className={`text-xs border-0 ${t.real ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                      #{t.n} {t.real ? 'confirmada' : 'projetada'}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtData(t.aula1)}</TableCell>
                  <TableCell>{fmtData(aula2)}</TableCell>
                  <TableCell>{fmtData(aula3)}</TableCell>
                  <TableCell>{fmtData(captacao)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
          #45 (01–03/set) é a próxima confirmada. A partir dela, o calendário segue à risca o ritmo quinzenal (semana sim, semana não) até a última turma de 2026.
        </p>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Operação — infos práticas do dia a dia da próxima turma: datas e os links
// de matrícula individuais (um por vendedor, gerados pelo Igor) pra trackear
// quem matriculou quem. Atribuição Helen/Miguel/Aline é a ordem em que os
// links chegaram — confirmar se é essa mesma ordem.
// -----------------------------------------------------------------------

interface OperacaoLink { label: string; url: string; vendedor: string; }

interface TurmaFormacao { turma: string; dataLabel: string; mesAbrev: string; dia: number | null; confirmada: boolean; }

// Datas reais confirmadas com o Pedro; turmas sem data no cadastro do
// sistema (turmas table) entram aqui como "a definir" até serem fechadas.
const TURMAS_FORMACAO: TurmaFormacao[] = [
  { turma: '02726/OnzeDS', dataLabel: '01/09/2026', mesAbrev: 'Set', dia: 1, confirmada: true },
];

const LINKS_MATRICULA: OperacaoLink[] = [
  { label: 'Ficha de Matrícula — Helen Magna', url: 'https://www.idmpsi.com.br/matricula.html?v=6be52633', vendedor: 'Helen Magna' },
  { label: 'Ficha de Matrícula — Miguel Fogaça', url: 'https://www.idmpsi.com.br/matricula.html?v=d95ebfdc', vendedor: 'Miguel Fogaça' },
  { label: 'Ficha de Matrícula — Aline Horta', url: 'https://www.idmpsi.com.br/matricula.html?v=1b8a0e29', vendedor: 'Aline Horta' },
];

function copyLink(url: string) {
  navigator.clipboard.writeText(url)
    .then(() => toast({ title: 'Link copiado', description: url }))
    .catch(() => toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'Copie manualmente o link.' }));
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{url}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={() => copyLink(url)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Copiar link">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Abrir link">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// "Alunos aguardando turma" — alunos que entraram (ex: ficha de matrícula
// externa em idmpsi.com.br) com turma_id nulo. Como a ficha externa ainda
// nao manda o vendedor junto, o vendedor "reivindica" o aluno aqui (grava
// alunos.vendedor_id) e, dono agora, atribui a turma direto nesta tela —
// sem precisar de acesso a Financeiro.tsx. vendedor_id ainda nao esta nos
// tipos gerados do Supabase (migration aplicada localmente, pendente no
// banco) — por isso os `as any` ao ler/gravar essa coluna.
// -----------------------------------------------------------------------

interface AlunoAguardandoTurma {
  id: string;
  nome: string;
  whatsapp?: string | null;
  produto: string;
  forma_pagamento?: string | null;
  valor_mensalidade?: number | null;
  dia_vencimento?: number | null;
  dia_vencimento_contrato?: string | null;
  tipo_pagamento?: string | null;
  total_mensalidades?: number | null;
  data_matricula?: string | null;
  vendedor_id?: string | null;
}

interface TurmaOption {
  id: string;
  nome: string;
}

function AlunosAguardandoTurmaCard({ viewAsName }: VendorScopeProps) {
  const [alunosSemTurma, setAlunosSemTurma] = useState<AlunoAguardandoTurma[]>([]);
  const [turmasOptions, setTurmasOptions] = useState<TurmaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    const [alunosRes, turmasRes] = await Promise.all([
      (supabase.from('alunos') as any)
        .select('id, nome, whatsapp, produto, forma_pagamento, valor_mensalidade, dia_vencimento, dia_vencimento_contrato, tipo_pagamento, total_mensalidades, data_matricula, vendedor_id')
        .is('turma_id', null)
        .eq('produto', 'psicanalise')
        .order('data_matricula', { ascending: false }),
      supabase
        .from('turmas')
        .select('id, nome')
        .or('produto.eq.psicanalise,tipo.eq.psicanalise')
        .order('created_at', { ascending: false }),
    ]);

    if (alunosRes.error) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar alunos sem turma', description: alunosRes.error.message });
    } else {
      setAlunosSemTurma((alunosRes.data || []) as AlunoAguardandoTurma[]);
    }
    if (turmasRes.data) setTurmasOptions(turmasRes.data as TurmaOption[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Vendedor comum: so os proprios (ja reivindicados) + os ainda sem dono.
  // Admin/gerente (viewAsName null): todos, de qualquer vendedor.
  const visibleAlunos = viewAsName
    ? alunosSemTurma.filter((a) => a.vendedor_id === viewAsName || !a.vendedor_id)
    : alunosSemTurma;

  const claimAluno = async (alunoId: string) => {
    if (!viewAsName) return;
    setClaiming((prev) => ({ ...prev, [alunoId]: true }));
    const { error } = await (supabase.from('alunos') as any).update({ vendedor_id: viewAsName }).eq('id', alunoId);
    setClaiming((prev) => ({ ...prev, [alunoId]: false }));
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao marcar aluno', description: error.message });
      return;
    }
    setAlunosSemTurma((prev) => prev.map((a) => (a.id === alunoId ? { ...a, vendedor_id: viewAsName } : a)));
    toast({ title: 'Aluno marcado como seu!' });
  };

  const assignTurma = async (aluno: AlunoAguardandoTurma, turmaId: string) => {
    setAssigning((prev) => ({ ...prev, [aluno.id]: true }));
    try {
      await assignTurmaEAtualizarParcelas(aluno.id, turmaId, aluno);
      setAlunosSemTurma((prev) => prev.filter((a) => a.id !== aluno.id));
      toast({ title: 'Turma atribuída!' });
    } catch (error: any) {
      setAssigning((prev) => ({ ...prev, [aluno.id]: false }));
      toast({ variant: 'destructive', title: 'Erro ao atribuir turma', description: error?.message });
      return;
    }
    setAssigning((prev) => ({ ...prev, [aluno.id]: false }));
  };

  const TurmaSelect = ({ aluno }: { aluno: AlunoAguardandoTurma }) => (
    <Select value="" onValueChange={(v) => assignTurma(aluno, v)} disabled={!!assigning[aluno.id]}>
      <SelectTrigger className="h-7 text-xs w-40 border-amber-300 text-amber-700 bg-amber-50">
        <SelectValue placeholder={assigning[aluno.id] ? 'Salvando...' : 'Atribuir turma'} />
      </SelectTrigger>
      <SelectContent>
        {turmasOptions.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-foreground">Alunos aguardando turma</h3>
        <Badge className="text-xs border-0 bg-muted text-muted-foreground">
          {visibleAlunos.length} {visibleAlunos.length === 1 ? 'aluno' : 'alunos'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Matrículas que caíram sem turma (ex: ficha externa do site){' '}
        {viewAsName
          ? '— reivindique as suas e atribua a turma direto aqui, sem precisar do Financeiro.'
          : '— visão de admin: todos os alunos aguardando, de qualquer vendedor.'}
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : visibleAlunos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum aluno aguardando turma.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {visibleAlunos.map((aluno) => {
            const isUnclaimed = !aluno.vendedor_id;
            return (
              <div key={aluno.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{aluno.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground">{aluno.whatsapp || 'sem whatsapp'}</p>
                    {(!viewAsName || isUnclaimed) && (
                      <Badge className={`text-xs border-0 ${aluno.vendedor_id ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                        {aluno.vendedor_id || 'Sem vendedor'}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {viewAsName && isUnclaimed ? (
                    <Button size="sm" className="h-7 text-xs" disabled={!!claiming[aluno.id]} onClick={() => claimAluno(aluno.id)}>
                      {claiming[aluno.id] ? 'Salvando...' : 'Marcar como meu'}
                    </Button>
                  ) : (
                    <TurmaSelect aluno={aluno} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function OperacaoTab({ viewAsName }: VendorScopeProps) {
  const matriculaLinks = viewAsName ? LINKS_MATRICULA.filter((l) => l.vendedor === viewAsName) : LINKS_MATRICULA;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">{viewAsName ? 'Seu link de matrícula e os alunos que você fechou, aguardando entrar numa turma.' : 'Links de matrícula por vendedor e alunos aguardando turma, de todo mundo.'}</p>
      <SectionBar title="Turma atual" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Próxima turma (formação)" value="02726" hint="Turma #02726/OnzeDS · PSI" icon={GraduationCap} />
        <StatTile label="Data de início" value="01/09/2026" hint="ainda não refletido no cadastro do sistema" icon={CalendarDays} />
        <StatTile label="Matrículas desta turma" value="Via links abaixo" hint="é pra onde as fichas de matrícula apontam" icon={Link2} />
      </div>
      <p className="text-xs text-muted-foreground">
        Essa é a turma de formação (a classe de verdade) — diferente da turma #45 da Semana do Despertar, que é só o lançamento/captação (ver aba Aquisição).
      </p>

      <SectionBar title="Matrículas" />
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Ficha de Matrícula — por vendedor</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Link trackeado individual (gerado pelo Igor) — cada vendedor usa só o próprio, pra matrícula ficar atribuída certinho.
        </p>
        <div className="flex flex-col gap-2">
          {matriculaLinks.map((l) => (
            <LinkRow key={l.url} label={l.label} url={l.url} />
          ))}
        </div>
        {!viewAsName && (
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            Atribuição por ordem de chegada dos links (Helen → Miguel → Aline) — confirma com o Igor se é essa mesma ordem antes de divulgar.
          </p>
        )}
      </Card>

      <AlunosAguardandoTurmaCard viewAsName={viewAsName} />

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Outros links da turma</h3>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
          Landing page da Semana do Despertar, link de pagamento/checkout, grupo de WhatsApp — ainda não informados. Entram aqui assim que chegarem.
        </p>
      </Card>

      <SectionBar title="Calendário de turmas" />
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Calendário de início das turmas — Formação PSI</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Pra vocês saberem a data de início de cada turma nova, sem precisar perguntar.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {TURMAS_FORMACAO.map((t) => (
            <div key={t.turma} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-md border border-border bg-muted flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground leading-none">{t.mesAbrev}</span>
                  <span className="text-sm font-bold text-foreground leading-tight">{t.dia ?? '—'}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Turma {t.turma}</p>
                  <p className="text-xs text-muted-foreground">{t.dataLabel}</p>
                </div>
              </div>
              <Badge className={`text-xs border-0 ${t.confirmada ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                {t.confirmada ? 'confirmada' : 'a definir'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Remuneração — calculadora de comissão PJ. Puramente client-side por
// enquanto (numeros e formulas do protótipo) — decisao de produto: portar
// primeiro, conectar ao Supabase depois.
// -----------------------------------------------------------------------

const COM_VISTA_CARTAO = 147;
const COM_RECORRENTE = 75;
const FAT_VISTA_CARTAO = 1485;
const FAT_RECORRENTE = 150;
const AJUDA_CUSTO = 1500;
const META_MOTIVO_FAT = 25000;
const BONUS_MOTIVO = 1000;
const META_SUPERACAO_FAT = 35000;
const BONUS_SUPERACAO = 2000;

interface VendorRow {
  name: string;
  role: string;
  gerente: boolean;
  initials: string;
  cor: string;
  meta: number;
  vistaCartao: number;
  boleto: number;
}

// Cores fixas por enquanto (Helen/Miguel/Aline ainda nao sao usuarios reais do sistema,
// so tem `cor` os cadastrados em profiles/AppUser). Quando virarem contas de verdade,
// trocar por AppUser.cor pra manter a mesma identidade visual usada no Pipeline.
const INITIAL_VENDORS: VendorRow[] = [
  { name: 'Helen Magna', role: 'Vendedora', gerente: false, initials: 'HM', cor: '#A93356', meta: 30, vistaCartao: 9, boleto: 21 },
  { name: 'Miguel Fogaça', role: 'Vendedor', gerente: false, initials: 'MF', cor: '#4A90E2', meta: 30, vistaCartao: 15, boleto: 35 },
  { name: 'Aline Horta', role: 'Vendedora/Gerente de Vendas', gerente: true, initials: 'AH', cor: '#28A745', meta: 30, vistaCartao: 21, boleto: 49 },
];

function calcVendor(vistaCartao: number, boleto: number) {
  const total = vistaCartao + boleto;
  const faturamento = vistaCartao * FAT_VISTA_CARTAO + boleto * FAT_RECORRENTE;
  const comissao = vistaCartao * COM_VISTA_CARTAO + boleto * COM_RECORRENTE;
  const bonus = faturamento >= META_SUPERACAO_FAT ? BONUS_SUPERACAO : faturamento >= META_MOTIVO_FAT ? BONUS_MOTIVO : 0;
  const receber = AJUDA_CUSTO + comissao + bonus;
  return { total, faturamento, comissao, bonus, receber };
}

function BonusPill({ bonus }: { bonus: number }) {
  if (bonus >= BONUS_SUPERACAO) return <Badge className="text-xs border-0 bg-success/15 text-success">Superação</Badge>;
  if (bonus >= BONUS_MOTIVO) return <Badge className="text-xs border-0 bg-warning/15 text-warning">Motivo</Badge>;
  return <Badge className="text-xs border-0 bg-muted text-muted-foreground">Base</Badge>;
}

const TIERS: { label: string; badgeClass: string; vistaCartao: number; boleto: number }[] = [
  { label: 'Meta Base', badgeClass: 'bg-primary/10 text-primary', vistaCartao: 9, boleto: 21 },
  { label: 'Meta Motivo', badgeClass: 'bg-warning/10 text-warning', vistaCartao: 15, boleto: 35 },
  { label: 'Meta Superação', badgeClass: 'bg-success/10 text-success', vistaCartao: 21, boleto: 49 },
];

function RemuneracaoTab({ viewAsName }: VendorScopeProps) {
  const [vendors, setVendors] = useState<VendorRow[]>(INITIAL_VENDORS);

  const updateVendor = (idx: number, field: 'meta' | 'vistaCartao' | 'boleto', value: number) => {
    setVendors((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: Math.max(0, value || 0) } : v)));
  };

  // Gerente (Aline) sempre ve todo mundo; vendedor(a) comum ve so a propria linha.
  const activeVendor = vendors.find((v) => v.name === viewAsName);
  const scoped = viewAsName && activeVendor && !activeVendor.gerente
    ? vendors.filter((v) => v.name === viewAsName)
    : vendors;

  const rows = scoped.map((v) => ({ v, calc: calcVendor(v.vistaCartao, v.boleto) }));
  const showTeamFooter = scoped.length > 1;
  const totals = rows.reduce(
    (acc, r) => ({
      meta: acc.meta + r.v.meta,
      vistaCartao: acc.vistaCartao + r.v.vistaCartao,
      boleto: acc.boleto + r.v.boleto,
      total: acc.total + r.calc.total,
      fat: acc.fat + r.calc.faturamento,
      comissao: acc.comissao + r.calc.comissao,
      bonus: acc.bonus + r.calc.bonus,
      receber: acc.receber + r.calc.receber,
    }),
    { meta: 0, vistaCartao: 0, boleto: 0, total: 0, fat: 0, comissao: 0, bonus: 0, receber: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">{viewAsName ? 'Quanto você ganha por venda e como bater os níveis de bônus.' : 'Como funciona a comissão de cada vendedor e a calculadora de simulação.'}</p>
      <SectionBar title="Como funciona a comissão" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Ajuda de custo" value={<>R$ 1.500<span className="text-sm font-normal text-muted-foreground">/mês</span></>} icon={Wallet} />
        <StatTile label="À vista / Cartão até 12x" value="R$ 147" hint="10% de comissão (à vista R$1.500 ou cartão 12x, caixa R$1.470)" icon={CreditCard} />
        <StatTile label="Recorrente (cartão/boleto 15x R$150)" value="R$ 75" hint="50% da 1ª parcela apenas" icon={Repeat} />
      </div>

      <SectionBar title={viewAsName ? 'Sua comissão do mês' : 'Comissão do mês — edite com as vendas reais'} />
      <Card className="p-4 overflow-x-auto">
        <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
          <TableHeader>
            <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Meta Base (vendas)</TableHead>
              <TableHead className="text-right">Vendas à vista/cartão</TableHead>
              <TableHead className="text-right">Vendas recorrentes</TableHead>
              <TableHead className="text-right">Total vendido</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Bonificação</TableHead>
              <TableHead className="text-right">A receber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ v, calc }, idx) => (
              <TableRow key={v.name} className={premiumZebraRow(idx)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.role}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.meta} onChange={(e) => updateVendor(idx, 'meta', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.vistaCartao} onChange={(e) => updateVendor(idx, 'vistaCartao', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.boleto} onChange={(e) => updateVendor(idx, 'boleto', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">{calc.total}</TableCell>
                <TableCell className="text-right">{fmt(calc.faturamento)}</TableCell>
                <TableCell className="text-right">{fmt(calc.comissao)}</TableCell>
                <TableCell>{calc.bonus ? <span className="inline-flex items-center gap-1"><BonusPill bonus={calc.bonus} /> {fmt(calc.bonus)}</span> : <BonusPill bonus={calc.bonus} />}</TableCell>
                <TableCell className="text-right font-semibold text-primary">{fmt(calc.receber)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {showTeamFooter && (
            <TableFooter className="bg-primary/10">
              <TableRow>
                <TableCell className="font-semibold text-primary">Soma dos 3 (não é meta de equipe)</TableCell>
                <TableCell className="text-right font-semibold">{totals.meta}</TableCell>
                <TableCell className="text-right font-semibold">{totals.vistaCartao}</TableCell>
                <TableCell className="text-right font-semibold">{totals.boleto}</TableCell>
                <TableCell className="text-right font-semibold">{totals.total}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.fat)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.comissao)}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.bonus)}</TableCell>
                <TableCell className="text-right font-semibold text-primary">{fmt(totals.receber)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        <div className="flex flex-col gap-2 mt-3">
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? `Sua Meta Base = 30 vendas/mês, sem bonificação — só a comissão por venda. Faturamento estimado como: à vista/cartão R$1.485 (médio) + recorrente R$150 (1ª parcela) por venda. Exemplo batendo sua Meta Base: 9 à vista/cartão (R$147×9=R$1.323) + 21 recorrentes (R$75×21=R$1.575) = R$2.898 de comissão, sem bônus.`
              : 'Meta Base = 30 vendas/mês por vendedor, sem bonificação — só a comissão por venda. Faturamento estimado como: à vista/cartão R$1.485 (médio) + recorrente R$150 (1ª parcela) por venda. Exemplo batendo a Meta Base: 9 à vista/cartão (R$147×9=R$1.323) + 21 recorrentes (R$75×21=R$1.575) = R$2.898 de comissão, sem bônus.'}
          </p>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? 'Base, Motivo e Superação são metas individuais — essa é a sua.'
              : 'Base, Motivo e Superação são metas individuais — cada vendedor bate a sua. A linha de baixo na tabela é só a soma dos 3, não uma meta de equipe: isso ainda não foi definido e entra depois, à parte.'}
          </p>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? 'A tabela acima é editável — entre com o que você vendeu de verdade no mês. As 3 tabelas abaixo são só referência: mostram quanto você ganharia em cada nível, mantendo o mix de 30% à vista/cartão + 70% recorrente. Vendas por nível: Base 30 (9+21) · Motivo 50 (15+35) · Superação 70 (21+49) — números fechados para dar exatamente 30%/70%.'
              : 'A tabela acima é editável — cada vendedor entra com o que vendeu de verdade no mês. As 3 tabelas abaixo são só referência: mostram, pra cada nível, quanto UM vendedor ganharia sozinho SE batesse exatamente aquele nível — não é um cenário de todo mundo batendo junto. Mantém o mix de 30% à vista/cartão + 70% recorrente. Vendas por nível: Base 30 (9+21) · Motivo 50 (15+35) · Superação 70 (21+49) — números fechados para dar exatamente 30%/70%.'}
          </p>
        </div>
      </Card>

      <SectionBar title="Simulação por nível de meta" subtitle="Quanto dá pra ganhar em cada nível, mantendo o mix de 30% à vista/cartão + 70% recorrente." />
      {TIERS.map((tier) => {
        const calc = calcVendor(tier.vistaCartao, tier.boleto);
        return (
          <Card key={tier.label} className="p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Badge className={`text-xs border-0 ${tier.badgeClass}`}>{tier.label}</Badge>
              {viewAsName
                ? `quanto você ganha ao bater ${tier.vistaCartao + tier.boleto} vendas/mês`
                : `quanto cada vendedor ganha, sozinho, ao bater ${tier.vistaCartao + tier.boleto} vendas/mês`}
            </h3>
            <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
              <TableHeader>
                <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Vendas à vista/cartão</TableHead>
                  <TableHead className="text-right">Vendas recorrentes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Bonificação</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoped.map((v, idx) => (
                  <TableRow key={v.name} className={premiumZebraRow(idx)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{v.name}</div>
                          <div className="text-xs text-muted-foreground">{v.role}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{tier.vistaCartao}</TableCell>
                    <TableCell className="text-right">{tier.boleto}</TableCell>
                    <TableCell className="text-right">{calc.total}</TableCell>
                    <TableCell className="text-right">{fmt(calc.faturamento)}</TableCell>
                    <TableCell className="text-right">{fmt(calc.comissao)}</TableCell>
                    <TableCell>{calc.bonus ? <span className="inline-flex items-center gap-1"><BonusPill bonus={calc.bonus} /> {fmt(calc.bonus)}</span> : <BonusPill bonus={calc.bonus} />}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{fmt(calc.receber)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}

      <SectionBar title="Referência rápida" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-foreground mb-3">{viewAsName ? 'Seus 3 níveis de meta' : '3 níveis de meta — por vendedor'}</h3>
          <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
            <TableHeader>
              <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                <TableHead>Nível</TableHead>
                <TableHead className="text-right">Vendas/mês</TableHead>
                <TableHead className="text-right">À vista/cartão (30%)</TableHead>
                <TableHead className="text-right">Recorrente (70%)</TableHead>
                <TableHead className="text-right">Faturamento bruto</TableHead>
                <TableHead className="text-right">Bonificação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className={premiumZebraRow(0)}>
                <TableCell><Badge className="text-xs border-0 bg-primary/10 text-primary">Meta Base</Badge></TableCell>
                <TableCell className="text-right">30</TableCell>
                <TableCell className="text-right">9</TableCell>
                <TableCell className="text-right">21</TableCell>
                <TableCell className="text-right">R$ 16.515</TableCell>
                <TableCell className="text-right">sem bonificação</TableCell>
              </TableRow>
              <TableRow className={premiumZebraRow(1)}>
                <TableCell><Badge className="text-xs border-0 bg-warning/10 text-warning">Meta Motivo</Badge></TableCell>
                <TableCell className="text-right">50</TableCell>
                <TableCell className="text-right">15</TableCell>
                <TableCell className="text-right">35</TableCell>
                <TableCell className="text-right">R$ 27.525</TableCell>
                <TableCell className="text-right">R$ 1.000</TableCell>
              </TableRow>
              <TableRow className={premiumZebraRow(2)}>
                <TableCell><Badge className="text-xs border-0 bg-success/10 text-success">Meta Superação</Badge></TableCell>
                <TableCell className="text-right">70</TableCell>
                <TableCell className="text-right">21</TableCell>
                <TableCell className="text-right">49</TableCell>
                <TableCell className="text-right">R$ 38.535</TableCell>
                <TableCell className="text-right">R$ 2.000</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            A bonificação é calculada em cima do faturamento bruto do mês (à vista/cartão + recorrente), não da comissão. Threshold: Motivo a partir de R$25.000, Superação a partir de R$35.000. Não é cumulativa — vale o nível mais alto batido no mês (bater Superação substitui a de Motivo, não soma).
          </p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Como fica na prática</h3>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Faturou até R$24.999</TableCell>
                <TableCell className="text-right">só comissão por venda</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Faturou R$25.000 – R$34.999</TableCell>
                <TableCell className="text-right">comissão + R$1.000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Faturou R$35.000 ou mais</TableCell>
                <TableCell className="text-right">comissão + R$2.000</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-warning inline-block" /> Bateu Meta Motivo (R$25k+)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-success inline-block" /> Bateu Meta Superação (R$35k+)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-muted-foreground inline-block" /> Só Meta Base, sem bonificação</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Meta de Equipe — ainda não definida pelo dono do negócio. Aba reservada
// pra quando ele trouxer os números (é diferente da soma das metas
// individuais, que já existe na Remuneração).
// -----------------------------------------------------------------------

function MetaEquipeTab() {
  return (
    <Card className="p-8 flex flex-col items-center justify-center text-center gap-2 border-dashed">
      <Target className="h-8 w-8 text-muted-foreground/50" />
      <h3 className="text-sm font-semibold text-foreground">Meta de equipe ainda não definida</h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        Isso é diferente da soma das metas individuais (aba Remuneração) — assim que a meta de equipe for fechada, ela entra aqui.
      </p>
    </Card>
  );
}

// -----------------------------------------------------------------------

// "Login" local (sem Supabase Auth ainda) pra simular cada vendedor(a) vendo
// só o que é dela — pronto pra trocar por auth real quando Helen/Miguel/Aline
// virarem usuarios de verdade no sistema.

// Chips de avatar coloridos pra trocar "Ver como" — clique direto em vez de dropdown,
// mesma cor de identificação usada nos avatares da tabela de Remuneração.
function VendorSwitch({ viewAs, onChange }: { viewAs: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto px-1 py-2 -mx-1 -my-2">
      <button
        type="button"
        onClick={() => onChange('todos')}
        className="flex flex-col items-center gap-1 flex-shrink-0"
        title="Todos (visão admin)"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[9px] font-bold bg-muted text-muted-foreground transition-shadow"
          style={viewAs === 'todos' ? { boxShadow: '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary))' } : undefined}
        >
          Todos
        </div>
      </button>
      {INITIAL_VENDORS.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onChange(v.name)}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          title={v.gerente ? `${v.name} (gerente — vê todos)` : v.name}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white transition-shadow"
            style={{ backgroundColor: v.cor, ...(viewAs === v.name ? { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${v.cor}` } : {}) }}
          >
            {v.initials}
          </div>
          <span className="text-[9px] text-muted-foreground max-w-[46px] truncate inline-flex items-center gap-0.5">{v.name.split(' ')[0]}{v.gerente && <Crown className="h-2.5 w-2.5 text-warning flex-shrink-0" />}</span>
        </button>
      ))}
    </div>
  );
}

export function TimeComercial() {
  const [viewAs, setViewAs] = useState('todos');
  const activeVendor = INITIAL_VENDORS.find((v) => v.name === viewAs);
  // null = sem filtro (admin ou gerente); string = so os dados desse vendedor.
  const viewAsName = activeVendor && !activeVendor.gerente ? activeVendor.name : null;

  return (
    <div className="h-full flex flex-col animate-fade-in p-4 lg:p-6 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Time Comercial</h1>
        <div className="flex flex-col items-end gap-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Eye className="h-2.5 w-2.5" /> Ver como
          </p>
          <VendorSwitch viewAs={viewAs} onChange={setViewAs} />
        </div>
      </div>

      <Tabs defaultValue="funil" className="flex-1 flex flex-col min-h-0">
        <div className="rounded-xl border border-border bg-muted/30 p-3 mb-1">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap className="h-3 w-3 text-primary" />
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Meu trabalho</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Trabalhar os leads e fechar matrícula.</p>
            <TabsList className="h-auto bg-transparent p-0 gap-2 justify-start flex-wrap">
              <TabsTrigger
                value="funil"
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
              >
                <Kanban className="h-3.5 w-3.5" /> Funil
              </TabsTrigger>
              <TabsTrigger
                value="operacao"
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
              >
                <ClipboardList className="h-3.5 w-3.5" /> Operação
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-start gap-2 mt-3 pt-3 border-t border-dashed border-border">
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Metas e comissão</p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Metas, comissão e como funciona a captação.</p>
              <TabsList className="h-auto bg-transparent p-0 gap-1.5 justify-start flex-wrap">
                <TabsTrigger value="metas" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Meta Pessoal</TabsTrigger>
                <TabsTrigger value="meta_equipe" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Meta de Equipe</TabsTrigger>
                <TabsTrigger value="aquisicao" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Aquisição</TabsTrigger>
                <TabsTrigger value="remuneracao" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Remuneração</TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>
        <TabsContent value="funil" className="flex-1 min-h-0">
          <FunilTimeComercial viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="operacao">
          <OperacaoTab viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="metas">
          <MetasTab viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="meta_equipe">
          <MetaEquipeTab />
        </TabsContent>
        <TabsContent value="aquisicao">
          <AquisicaoTab />
        </TabsContent>
        <TabsContent value="remuneracao">
          <RemuneracaoTab viewAsName={viewAsName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
