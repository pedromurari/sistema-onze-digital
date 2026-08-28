import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { dbRowToLead } from '@/contexts/LeadsContext';
import { assignTurmaEAtualizarParcelas } from '@/lib/parcelasAluno';
import { ChatTimeComercial } from './chat/ChatTimeComercial';
import { PREMIUM_TABLE_HEADER_ROW, premiumZebraRow, StatTile, SectionBar } from '@/components/crm/ui/premium';
import { NomePessoa } from '@/components/crm/pessoa/NomePessoa';
import { useInvalidarDados } from '@/lib/db';
import { INITIAL_VENDORS, calcVendor, type VendorRow, BONUS_MOTIVO, BONUS_SUPERACAO } from '@/lib/vendedores';
import {
  MessageCircle, Target, Copy, ExternalLink, Users, TrendingUp, DollarSign, CalendarDays,
  Video, Rocket, Repeat, GraduationCap, Link2, Wallet, CreditCard, Crown, Kanban, ClipboardList,
  Search, X, History, Filter, CornerDownRight, Eye, Zap, BookOpen, Layers, Trash2, RotateCcw,
  Activity, Percent, BarChart3, Phone, Trophy, Timer, Info, StickyNote, AlarmClock,
} from 'lucide-react';

// -----------------------------------------------------------------------
// Funil — pool de leads independente de "Leads Diretos" (Pipeline.tsx).
// Mesma origem de dados (tabela `leads`), mas filtrado por
// origem='Time Comercial' em vez de origem='Direto'. Reaproveita as cores
// dos 4 primeiros estagios de PIPELINE_STAGES (types/crm.ts) por consistencia
// visual, mas mantem a propria lista de estagios — os dois funis nao
// compartilham estrutura, so paleta.
// -----------------------------------------------------------------------

type GenericStage =
  | 'retorno' | 'novo' | 'primeiro_contato' | 'aquecimento' | 'qualificado'
  | 'proposta_enviada' | 'negociacao' | 'followup' | 'aquecimento_conteudo' | 'matricula';
type SddStage = 'frio' | 'pre_aquecimento' | 'grupo_oferta' | 'primeiro_contato' | 'negociacao' | 'matricula';
type TimeComercialStage = GenericStage | SddStage;

interface StageInfo { key: TimeComercialStage; label: string; color: string; descricao: string; sql?: boolean; }

// Funil único (2026-08-27, redesenhado com Pedro depois do feedback do Miguel
// e da Helen) — vale pra todos os canais exceto SDD, que tem funil próprio
// definido pelo dono do negócio. "sql: true" marca a partir de onde o lead
// vira SQL (Sales Qualified Lead) — antes disso é MQL. A divisória visual
// MQL/SQL e o selo "SQL" no card usam essa flag.
const FUNIL_STAGES: StageInfo[] = [
  {
    key: 'novo', label: 'Novo', color: 'bg-pipeline-novo',
    descricao: 'Lead recém-chegado ao funil, ainda sem responsável. Fica aqui até alguém pegar e iniciar o atendimento.',
  },
  {
    key: 'primeiro_contato', label: 'Primeiro Contato', color: 'bg-pipeline-sdr',
    descricao: 'Etapa de abordagem inicial. O lead já tem um responsável e o próximo passo é iniciar a conversa — WhatsApp ou ligação — para começar o atendimento.',
  },
  {
    key: 'aquecimento', label: 'Aquecimento', color: 'bg-pipeline-aquecimento',
    descricao: 'O lead já respondeu e a conversa está em andamento. Etapa de entender o perfil, a necessidade e o momento da pessoa antes de seguir adiante.',
  },
  {
    key: 'qualificado', label: 'Qualificado', color: 'bg-pipeline-handoff',
    descricao: 'Marca o momento em que o lead é considerado qualificado: o perfil combina com o que é oferecido e vale a pena seguir negociando. A partir desta etapa o lead passa a ser tratado como SQL (Sales Qualified Lead) — veja a divisória MQL/SQL no funil.',
    sql: true,
  },
  {
    key: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-pipeline-followup1',
    descricao: 'A oferta e as condições de pagamento já foram apresentadas ao lead.',
    sql: true,
  },
  {
    key: 'negociacao', label: 'Negociação', color: 'bg-pipeline-followup2',
    descricao: 'Etapa de ajuste final: tratando dúvidas, objeções e condições comerciais antes do fechamento.',
    sql: true,
  },
  {
    key: 'followup', label: 'Follow-up', color: 'bg-pipeline-closer',
    descricao: 'Use esta etapa quando o lead pedir um prazo pra decidir (ex.: "só posso comprar depois que terminar meu curso em dezembro"). Ao mover o lead pra cá, o sistema pede a data combinada de retorno e conta automaticamente quantas vezes esse follow-up já foi feito com esse lead (tentativa #1, #2...). Um cronômetro aparece no card lembrando o prazo, e quando a data vence, o sistema avisa automaticamente por WhatsApp. Depois de algumas tentativas sem avanço, o sistema sugere mover o lead pra "Aquecimento de Conteúdo" em vez de continuar insistindo no contato direto.',
    sql: true,
  },
  {
    key: 'aquecimento_conteudo', label: 'Aquecimento de Conteúdo', color: 'bg-pipeline-aquecimento',
    descricao: 'Para leads que já passaram por várias tentativas de follow-up sem avançar. Em vez de continuar com abordagem direta, o lead entra numa esteira de conteúdo pra se manter aquecido até estar pronto pra retomar a conversa.',
    sql: true,
  },
  {
    key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula',
    descricao: 'O lead fechou e virou aluno.',
    sql: true,
  },
];

// "Retorno" substitui "Novo" como ponto de entrada — só pra campanhas marcadas como
// tipo "retorno" (lead que já existia no sistema antes, não é contato inédito). Não
// é uma etapa genérica fixa: só aparece na aba quando existe algum lead nela.
const RETORNO_STAGE: StageInfo = { key: 'retorno', label: 'Retorno', color: 'bg-pipeline-followup3', descricao: 'Lead voltou da base antiga (reimportada), ainda não trabalhado nesse ciclo.' };

// Funil próprio do canal SDD (Semana do Despertar) — definido pelo dono do negócio.
const SDD_STAGES: StageInfo[] = [
  { key: 'frio', label: 'Frio', color: 'bg-pipeline-sdr', descricao: 'Captado num lançamento, ainda não assistiu/avançou.' },
  { key: 'pre_aquecimento', label: 'Pré-aquecimento', color: 'bg-pipeline-followup1', descricao: 'Confirmado na turma, esquenta antes da semana ao vivo.' },
  { key: 'grupo_oferta', label: 'Grupo de Oferta', color: 'bg-pipeline-aquecimento', descricao: 'Entrou no grupo de oferta da turma.' },
  { key: 'primeiro_contato', label: 'Primeiro contato', color: 'bg-pipeline-followup2', descricao: 'Vendedor abordou pela primeira vez.' },
  { key: 'negociacao', label: 'Negociação', color: 'bg-pipeline-closer', descricao: 'Tratando objeção, perto de fechar.' },
  { key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula', descricao: 'Fechou, virou aluno.' },
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

const stagesForCanal = (canal?: string | null) =>
  canal === 'SDD' ? SDD_STAGES : FUNIL_STAGES;

type LeadComCanal = Lead & {
  canal?: string | null; vendedor?: string | null; lancamentoId?: string | null; cidade?: string | null;
  campanhaId?: string | null; ultimaAtividade?: string | null;
  followupManualPrazo?: string | null; followupManualTentativas?: number | null; observacoes?: string | null;
};

interface Campanha { id: string; canal: string; nome: string; condicoes: string | null; ativa: boolean; tipo: 'novo' | 'retorno'; }

const formatCurrency = (value?: number) => {
  if (!value) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const openWhatsApp = (phone: string) => window.open(`https://wa.me/55${phone.replace(/\D/g, '')}`, '_blank');

// Estilo "premium" reaproveitado nas tabelas de dados (Remuneração, Metas, Aquisição):


interface VendorScopeProps { viewAsName: string | null; }

function stageInfoFor(lead: LeadComCanal) {
  if ((lead.etapa as string) === 'retorno') return RETORNO_STAGE;
  const stages = stagesForCanal(lead.canal);
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

  // Status "de entrada" (lead ainda não trabalhado) -- só esses entram no corte
  // de LEADS_RENDER_LIMIT. Qualquer lead que já saiu daqui (aquecimento, sdr,
  // closer, matrícula, ou as etapas próprias do funil SDD) é trabalho ativo de
  // alguém e nunca pode desaparecer da tela por causa do volume da base fria.
  // Achado real 2026-08-27: 33 leads que a Helen já tinha movido pra "sdr" no
  // canal Retorno/Base sumiram da lista porque a base tem quase 12 mil leads
  // com criado_em parecido (importação em lote) e só os 150 mais recentes
  // eram buscados -- os 33 dela, mesmo que velhos, tinham status diferente
  // dos leads "frios" e deveriam sempre aparecer.
  const STATUS_ENTRADA = ['novo', 'frio', 'retorno'];

  const buildLeadsBaseQuery = () => {
    // count:'exact' aqui não é afetado por um .limit() aplicado depois --
    // o PostgREST sempre devolve a contagem total de linhas que batem com
    // os filtros, então dá pra somar emAndamento.count + deEntrada.count
    // sem precisar de uma 3ª query só pra contar.
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
    return query;
  };

  const fetchLeads = async () => {
    // Desempate por `id` é essencial pra bases grandes com muitos leads no
    // mesmo `criado_em` (ex: importação em lote da base antiga) -- sem isso o
    // Postgres não garante ordem estável entre eles, e um lead que só teve o
    // `vendedor` atualizado (ex: "Pegar lead") pode sair da janela dos
    // LEADS_RENDER_LIMIT mais recentes só por causa da reordenação, mesmo sem
    // nada relevante ter mudado. Achado real 2026-08-27.
    const [emAndamento, deEntrada] = await Promise.all([
      (buildLeadsBaseQuery() as any)
        .not('status', 'in', `(${STATUS_ENTRADA.join(',')})`)
        .order('criado_em', { ascending: false }),
      (buildLeadsBaseQuery() as any)
        .in('status', STATUS_ENTRADA)
        .order('criado_em', { ascending: false })
        .order('id', { ascending: true })
        .limit(LEADS_RENDER_LIMIT),
    ]);

    const error = emAndamento.error || deEntrada.error;
    if (error) {
      console.error('Erro ao carregar leads do Time Comercial:', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível carregar os leads',
        description: error.message,
      });
      return;
    }

    const data = [...(emAndamento.data ?? []), ...(deEntrada.data ?? [])];
    const count = (emAndamento.count ?? 0) + (deEntrada.count ?? 0);

    if (data) {
      // interesse_produto é o produto/curso de interesse de verdade (ex: "Psicanálise");
      // `produto` na tabela é categórico (direto/lancamento/npa/time_comercial), não serve
      // pra exibir — sobrescreve o fallback de dbRowToLead que cairia nele por engano.
      setLeads(data.map((row: any) => ({
        ...dbRowToLead(row), canal: row.canal, vendedor: row.vendedor, cursoInteresse: row.interesse_produto || '',
        lancamentoId: row.lancamento_id, cidade: row.cidade, campanhaId: row.campanha_id, ultimaAtividade: row.ultima_atividade,
        followupManualPrazo: row.followup_manual_prazo, followupManualTentativas: row.followup_manual_tentativas, observacoes: row.observacoes,
      })));
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

  // Lead recém pego ou movido de etapa aparece primeiro na coluna --
  // `ultima_atividade` é atualizada automaticamente por trigger no banco em
  // qualquer UPDATE do lead, então isso já reflete "pegar lead"/mudança de
  // etapa sem precisar de lógica extra. Pedido da Helen 2026-08-27: o lead
  // que ela acabou de pegar/mover precisa ficar visível no topo, não perdido
  // no meio da coluna ordenado por data de importação antiga.
  const getLeadsByStage = (stage: TimeComercialStage) =>
    leads
      .filter((lead) => lead.etapa === stage)
      .sort((a, b) => new Date(b.ultimaAtividade || b.criadoEm).getTime() - new Date(a.ultimaAtividade || a.criadoEm).getTime());

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

  // Bônus de matrícula rápida (canal Direto, página-ponte /obrigado do site) —
  // prazo corrido de 24h a partir do cadastro. Só mostra enquanto o prazo não
  // vence; não checa se já matriculou (isso o vendedor vê pela etapa do lead).
  const BONUS_MATRICULA_RAPIDA_HORAS = 24;
  const prazoBonusRestante = (lead: LeadComCanal): string | null => {
    if (lead.canal !== 'Direto') return null;
    const criado = new Date(lead.criadoEm).getTime();
    if (Number.isNaN(criado)) return null;
    const restanteMs = criado + BONUS_MATRICULA_RAPIDA_HORAS * 60 * 60 * 1000 - Date.now();
    if (restanteMs <= 0) return null;
    const horas = Math.floor(restanteMs / (60 * 60 * 1000));
    const minutos = Math.floor((restanteMs % (60 * 60 * 1000)) / (60 * 1000));
    return horas > 0 ? `${horas}h restantes` : `${minutos}min restantes`;
  };

  // Cronômetro do follow-up manual: "volta em Xd" / "vence hoje" / "atrasado Xd".
  const followupCountdown = (prazo: string): { texto: string; atrasado: boolean } => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dataPrazo = new Date(prazo + 'T00:00:00');
    const dias = Math.round((dataPrazo.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
    if (dias > 0) return { texto: `volta em ${dias}d`, atrasado: false };
    if (dias === 0) return { texto: 'vence hoje', atrasado: false };
    return { texto: `atrasado ${Math.abs(dias)}d`, atrasado: true };
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

  const handleStageChange = async (lead: LeadComCanal, newStage: TimeComercialStage) => {
    // "Follow-up" sempre pede a data de retorno primeiro -- não muda a etapa
    // direto, abre o dialog (ver abrirFollowup). Pedido do Pedro 2026-08-27.
    if (newStage === 'followup') { abrirFollowup(lead); return; }
    try {
      await supabase.from('leads').update({ status: newStage }).eq('id', lead.id);
      fetchLeads();
      fetchContagens();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a etapa', description: error?.message || 'Tente novamente.' });
    }
  };

  // ── Follow-up manual (etapa "Follow-up") ────────────────────────────────
  // Ao mover um lead pra essa etapa, pede a data de retorno -- cada vez que
  // isso acontece conta como uma tentativa nova (followup_manual_tentativas).
  // Depois de FOLLOWUP_SUGESTAO_APOS tentativas, o card sugere (sem forçar)
  // mover pra "Aquecimento de Conteúdo" em vez de continuar tentando. Pedido
  // do Pedro 2026-08-27, depois da conversa com o Miguel sobre follow-up.
  const FOLLOWUP_SUGESTAO_APOS = 3;
  const [leadParaFollowup, setLeadParaFollowup] = useState<LeadComCanal | null>(null);
  const [followupPrazo, setFollowupPrazo] = useState('');
  const [salvandoFollowup, setSalvandoFollowup] = useState(false);

  const abrirFollowup = (lead: LeadComCanal) => {
    setLeadParaFollowup(lead);
    const daquiATresDias = new Date();
    daquiATresDias.setDate(daquiATresDias.getDate() + 3);
    setFollowupPrazo(daquiATresDias.toISOString().slice(0, 10));
  };

  const salvarFollowup = async () => {
    if (!leadParaFollowup || !followupPrazo) return;
    setSalvandoFollowup(true);
    const tentativas = (leadParaFollowup.followupManualTentativas ?? 0) + 1;
    const { error } = await (supabase.from('leads') as any).update({
      status: 'followup',
      followup_manual_prazo: followupPrazo,
      followup_manual_tentativas: tentativas,
      followup_manual_ultima_em: new Date().toISOString(),
    }).eq('id', leadParaFollowup.id);
    setSalvandoFollowup(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível marcar o follow-up', description: error.message });
      return;
    }
    setLeadParaFollowup(null);
    fetchLeads();
    fetchContagens();
    toast({ title: `Follow-up #${tentativas} marcado!` });
  };

  const claimLead = async (lead: LeadComCanal) => {
    if (!viewAsName) return;
    try {
      // Pegar um lead ainda "frio" (retorno/novo) já avança ele pra "Primeiro
      // Contato" -- pedido explícito do Pedro/Helen (2026-08-27): antes o
      // lead ficava parado na coluna de entrada até alguém trocar a etapa
      // manualmente. Vale pra qualquer canal com o funil fragmentado (todos
      // exceto SDD, que tem funil próprio e não passa por aqui). Não mexe em
      // leads que já estão mais adiante no funil.
      const updates: Record<string, unknown> = { vendedor: viewAsName };
      if (lead.canal !== 'SDD' && ['retorno', 'novo'].includes(lead.etapa as string)) {
        updates.status = 'primeiro_contato';
      }
      await (supabase.from('leads') as any).update(updates).eq('id', lead.id);
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

  // Contato via WhatsApp — log simples de um clique (abrir o chat já é o
  // registro). Vira evento na trajetória do lead e alimenta "Produtividade".
  // Não bloqueia a ação principal (abrir WhatsApp) se o log falhar.
  const registrarContato = async (lead: Lead, tipo: 'contato_whatsapp' | 'contato_ligacao') => {
    if (!viewAsName) return;
    const { error } = await (supabase as any).rpc('time_comercial_registrar_contato', { p_lead_id: lead.id, p_vendedor: viewAsName, p_tipo: tipo });
    // Não bloqueia a ação principal (abrir WhatsApp) se o log falhar — só perde
    // o registro de produtividade, mas fica no console pra debugar se acontecer.
    if (error) console.error('Erro ao registrar contato:', error);
  };

  // Ligação é registrada com mais detalhe que WhatsApp (não é só um clique):
  // dia/hora da ligação (pode ser retroativo), se o lead atendeu e um resumo
  // do que foi dito — só marcar "ligou" sem contexto não ajuda ninguém depois.
  const toLocalDateTimeInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [leadParaLigacao, setLeadParaLigacao] = useState<LeadComCanal | null>(null);
  const [ligacaoDataHora, setLigacaoDataHora] = useState('');
  const [ligacaoAtendeu, setLigacaoAtendeu] = useState<'sim' | 'nao'>('sim');
  const [ligacaoResumo, setLigacaoResumo] = useState('');
  // Admin (viewAsName nulo, "Todos") não tem vendedor pré-selecionado — precisa
  // escolher quem fez a ligação dentro do próprio dialog, em vez do botão
  // simplesmente não fazer nada quando ninguém está selecionado em "Ver como".
  const [ligacaoVendedor, setLigacaoVendedor] = useState('');
  const [salvandoLigacao, setSalvandoLigacao] = useState(false);

  const abrirRegistrarLigacao = (lead: LeadComCanal) => {
    setLeadParaLigacao(lead);
    setLigacaoDataHora(toLocalDateTimeInputValue(new Date()));
    setLigacaoAtendeu('sim');
    setLigacaoResumo('');
    setLigacaoVendedor(viewAsName ?? '');
  };

  const salvarLigacao = async () => {
    if (!leadParaLigacao || !ligacaoVendedor || !ligacaoDataHora) return;
    setSalvandoLigacao(true);
    const { error } = await (supabase as any).rpc('time_comercial_registrar_contato', {
      p_lead_id: leadParaLigacao.id,
      p_vendedor: ligacaoVendedor,
      p_tipo: 'contato_ligacao',
      p_criado_em: new Date(ligacaoDataHora).toISOString(),
      p_atendeu: ligacaoAtendeu === 'sim',
      p_resumo: ligacaoResumo,
    });
    setSalvandoLigacao(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível registrar a ligação', description: error.message });
      return;
    }
    setLeadParaLigacao(null);
    toast({ title: 'Ligação registrada!' });
  };

  // Nota manual por lead ("Rodrygo me passou..." -> pedido do Miguel 2026-08-27:
  // deixar anotado que uma cliente só compra em dezembro, por exemplo). Usa a
  // coluna `observacoes` que já existia no banco, só faltava a telinha.
  const salvarNota = async (lead: LeadComCanal, texto: string) => {
    if (texto === (lead.observacoes ?? '')) return;
    const { error } = await supabase.from('leads').update({ observacoes: texto || null }).eq('id', lead.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar a nota', description: error.message });
      return;
    }
    fetchLeads();
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
      .select('fase_anterior, fase_nova, vendedor, origem_mudanca, criado_em, atendeu, resumo')
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
  let activeStages = stagesForCanal(canalAtivo);
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
        <StatTile
          label="Aguardando Follow-up"
          value={contagemFiltrada((c) => totalLeadsPred(c) && c.status === 'followup')}
          hint={(() => {
            const hojeIso = new Date().toISOString().slice(0, 10);
            const vencidos = leads.filter((l) => (l.etapa as string) === 'followup' && l.followupManualPrazo && l.followupManualPrazo <= hojeIso).length;
            return vencidos > 0 ? `${vencidos} já venceu o prazo` : 'Nenhum venceu o prazo ainda';
          })()}
          icon={AlarmClock}
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

      <SectionBar title="Leads" subtitle="A primeira coluna reúne todos os leads; as demais mostram apenas quem está naquela fase." />
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
        {displayColumns.map((stage, idx) => {
          const stageLeads = stage.key === LEADS_COLUMN_KEY ? leadsVisiveis : getLeadsByStage(stage.key as TimeComercialStage);
          const isLeadsColumn = stage.key === LEADS_COLUMN_KEY;
          // Divisória MQL/SQL: aparece bem à esquerda da primeira coluna marcada
          // "sql: true" no funil, desde que a coluna anterior não seja também SQL
          // (evita repetir a divisória entre duas colunas SQL seguidas).
          const anterior = displayColumns[idx - 1] as StageInfo | undefined;
          const mostraDivisoriaSql = (stage as StageInfo).sql && !anterior?.sql;
          return (
            <div key={stage.key} className="flex-shrink-0 flex items-stretch gap-3 lg:gap-4">
              {mostraDivisoriaSql && (
                <div className="flex-shrink-0 flex flex-col items-center self-stretch px-1" title="A partir daqui o lead vira SQL (Sales Qualified Lead)">
                  <span className="whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary shadow-sm mb-1.5">
                    MQL → SQL
                  </span>
                  <div className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-primary/50 via-primary/50 to-transparent" />
                </div>
              )}
            <div className={`w-[85vw] sm:w-72 lg:w-80 snap-center lg:snap-align-none ${isLeadsColumn ? 'rounded-lg border-2 border-dashed border-muted-foreground/30 p-1.5 -m-1.5 lg:mr-2' : ''}`}>
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
                    <span className="font-semibold text-primary-foreground text-sm lg:text-base inline-flex items-center gap-1">
                      {stage.label}
                      {(stage as StageInfo).descricao && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="text-primary-foreground/70 hover:text-primary-foreground" title="O que é essa etapa?">
                              <Info className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 text-xs leading-relaxed" side="top">
                            {(stage as StageInfo).descricao}
                          </PopoverContent>
                        </Popover>
                      )}
                    </span>
                    <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 text-xs">{stageLeads.length}</Badge>
                  </div>
                </div>
              )}
              <div className={`bg-muted/50 rounded-b-lg p-2 lg:p-3 space-y-2 lg:space-y-3 min-h-[50vh] lg:min-h-96 max-h-[calc(100vh-20rem)] overflow-y-auto ${isLeadsColumn ? 'rounded-t-none' : ''}`}>
                {stageLeads.map((lead) => {
                  return (
                    <Card key={lead.id} className="p-3 lg:p-4 bg-card border-border hover:shadow-md transition-shadow">
                      <div className="mb-2">
                        <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">
                          <NomePessoa nome={lead.nome} pessoaId={lead.pessoaId} telefone={lead.telefone} />
                        </h3>
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
                          {prazoBonusRestante(lead) && (
                            <Badge className="text-[10px] bg-warning/15 text-warning border border-warning/30">⏱ {prazoBonusRestante(lead)} · bônus matrícula</Badge>
                          )}
                          {stageInfoFor(lead).sql && (
                            <Badge className="text-[10px] bg-primary text-primary-foreground border-0">SQL</Badge>
                          )}
                          {(lead.etapa as string) === 'followup' && lead.followupManualPrazo && (() => {
                            const { texto, atrasado } = followupCountdown(lead.followupManualPrazo!);
                            return (
                              <Badge className={`text-[10px] border ${atrasado ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-primary/10 text-primary border-primary/30'}`}>
                                <AlarmClock className="h-2.5 w-2.5 mr-1 inline" />{texto} · #{lead.followupManualTentativas ?? 1}
                              </Badge>
                            );
                          })()}
                        </div>
                        {(lead.etapa as string) === 'followup' && (lead.followupManualTentativas ?? 0) >= FOLLOWUP_SUGESTAO_APOS && (
                          <p className="text-[10px] text-warning mt-1">
                            Já são {lead.followupManualTentativas} tentativas — considera mover pra "Aquecimento de Conteúdo".
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 mb-2 lg:mb-3">
                        <button
                          type="button"
                          onClick={() => { openWhatsApp(lead.telefone); registrarContato(lead, 'contato_whatsapp'); }}
                          className="flex-1 h-8 text-xs inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-success" /> WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirRegistrarLigacao(lead)}
                          title="Registrar ligação feita pra esse lead"
                          className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirHistorico(lead)}
                          title="Ver trajetória do lead"
                          className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <History className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title="Nota sobre esse lead"
                              className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors relative"
                            >
                              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                              {lead.observacoes && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72" side="top">
                            <p className="text-xs font-medium mb-1.5">Nota sobre esse lead</p>
                            <Textarea
                              defaultValue={lead.observacoes ?? ''}
                              placeholder='Ex: "só compra em dezembro, depois do curso dela"'
                              className="text-xs min-h-20"
                              onBlur={(e) => salvarNota(lead, e.target.value)}
                            />
                          </PopoverContent>
                        </Popover>
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
                            const base = stagesForCanal(lead.canal);
                            // "Retorno" sempre aparece como opção pra devolver o lead pra
                            // base geral no canal Retorno/Base, mesmo quando a etapa atual
                            // já não é mais 'retorno' -- antes só aparecia se a etapa atual
                            // já fosse 'retorno', então não dava pra voltar um lead que já
                            // tinha avançado pra Aquecimento/SDR/etc. Pedido da Helen 2026-08-27.
                            const mostrarRetorno = (lead.etapa as string) === 'retorno' || lead.canal === RETORNO_CANAL;
                            return mostrarRetorno ? [RETORNO_STAGE, ...base] : base;
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
              const isAtribuicao = item.origem_mudanca === 'atribuicao';
              const isDevolucao = item.origem_mudanca === 'devolucao';
              const isWhatsapp = item.origem_mudanca === 'contato_whatsapp';
              const isLigacao = item.origem_mudanca === 'contato_ligacao';
              const isContato = isWhatsapp || isLigacao;
              const stageInfo = stagesForCanal(historico.lead.canal).find((s) => s.key === item.fase_nova);
              const titulo = isAtribuicao
                ? `Lead atribuído a ${item.vendedor}`
                : isDevolucao
                ? `Lead devolvido${item.vendedor ? ` por ${item.vendedor}` : ''}`
                : isWhatsapp
                ? `WhatsApp aberto por ${item.vendedor}`
                : isLigacao
                ? `Ligação registrada por ${item.vendedor}${item.atendeu === true ? ' — atendeu' : item.atendeu === false ? ' — não atendeu' : ''}`
                : (stageInfo?.label ?? item.fase_nova);
              const corPonto = isAtribuicao ? 'bg-success' : isDevolucao ? 'bg-warning' : isLigacao ? (item.atendeu === false ? 'bg-destructive' : 'bg-primary') : isContato ? 'bg-primary' : (stageInfo?.color ?? 'bg-muted-foreground');
              return (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${corPonto}`} />
                    {idx < (historico?.itens.length ?? 0) - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-sm font-medium text-foreground">{titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {!isAtribuicao && !isDevolucao && !isContato && item.vendedor && ` · ${item.vendedor}`}
                    </p>
                    {isLigacao && item.resumo && (
                      <p className="text-xs text-foreground bg-muted rounded-md border border-dashed border-border px-2 py-1.5 mt-1 max-w-xs">{item.resumo}</p>
                    )}
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

      <Dialog open={!!leadParaLigacao} onOpenChange={(open) => !open && setLeadParaLigacao(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Phone size={16} /> Registrar ligação — {leadParaLigacao?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {!viewAsName && (
              <div>
                <Label className="text-xs">Quem ligou?</Label>
                <Select value={ligacaoVendedor} onValueChange={setLigacaoVendedor}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                  <SelectContent className="bg-card border-border z-[100]">
                    {INITIAL_VENDORS.map((v) => (
                      <SelectItem key={v.name} value={v.name} className="text-sm">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Dia e hora da ligação</Label>
              <Input type="datetime-local" value={ligacaoDataHora} onChange={(e) => setLigacaoDataHora(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">O lead atendeu?</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setLigacaoAtendeu('sim')}
                  className={`text-sm font-medium rounded-lg border p-2 transition-all ${ligacaoAtendeu === 'sim' ? 'border-success bg-success/10 text-success' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}
                >
                  Sim, atendeu
                </button>
                <button
                  type="button"
                  onClick={() => setLigacaoAtendeu('nao')}
                  className={`text-sm font-medium rounded-lg border p-2 transition-all ${ligacaoAtendeu === 'nao' ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}
                >
                  Não atendeu
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Resumo do que foi dito</Label>
              <Textarea
                value={ligacaoResumo}
                onChange={(e) => setLigacaoResumo(e.target.value)}
                placeholder={ligacaoAtendeu === 'sim' ? 'Ex: falou sobre objeção de preço, disse que vai decidir até sexta...' : 'Ex: caixa postal, pediu pra ligar mais tarde...'}
                className="text-sm mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLeadParaLigacao(null)}>Cancelar</Button>
            <Button size="sm" onClick={salvarLigacao} disabled={salvandoLigacao || !ligacaoDataHora || !ligacaoVendedor}>
              {salvandoLigacao ? 'Salvando...' : 'Salvar ligação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leadParaFollowup} onOpenChange={(open) => !open && setLeadParaFollowup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlarmClock size={16} /> Marcar follow-up — {leadParaFollowup?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs">Quando você vai voltar nesse lead?</Label>
              <Input type="date" value={followupPrazo} onChange={(e) => setFollowupPrazo(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <p className="text-xs text-muted-foreground">
              Essa será a tentativa <strong>#{(leadParaFollowup?.followupManualTentativas ?? 0) + 1}</strong> com esse lead.
              {(leadParaFollowup?.followupManualTentativas ?? 0) + 1 >= FOLLOWUP_SUGESTAO_APOS && (
                <> Depois dessa, considera mover pra "Aquecimento de Conteúdo" em vez de continuar tentando.</>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLeadParaFollowup(null)}>Cancelar</Button>
            <Button size="sm" onClick={salvarFollowup} disabled={salvandoFollowup || !followupPrazo}>
              {salvandoFollowup ? 'Salvando...' : 'Marcar follow-up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -----------------------------------------------------------------------
// Metas 2026 — equipe nova (Helen, Miguel). Sem historico do sistema,
// so a equipe comercial de agora em diante. Numeros e formula portados do
// protótipo (painel-despertamente.html) calibrado com o dono do negocio,
// recalibrados pra 2 vendedores após a saída da Aline.
// -----------------------------------------------------------------------

const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

const FAT_POR_VENDA_MIX = 0.3 * 1485 + 0.7 * 150; // 550,5 — mesmo mix da calculadora de remuneração

const METAS_MESES: { mes: string; vendas: number }[] = [
  { mes: 'Set/26', vendas: 60 },  // Meta Base da equipe completa (30 × 2 vendedores)
  { mes: 'Out/26', vendas: 66 },
  { mes: 'Nov/26', vendas: 76 },
  { mes: 'Dez/26', vendas: 86 },
];

function MetasTab({ viewAsName }: VendorScopeProps) {
  const maxVendas = Math.max(...METAS_MESES.map((x) => x.vendas));
  const vendasTotal = METAS_MESES.reduce((s, x) => s + x.vendas, 0);
  const faturamentoTotal = METAS_MESES.reduce((s, x) => s + x.vendas * FAT_POR_VENDA_MIX, 0);

  // Vendedor(a) comum ve so a fatia dela do plano (meta dividida por 2);
  // "Todos" continua vendo a meta agregada da equipe.
  if (viewAsName) {
    const mesesIndividual = METAS_MESES.map((x) => ({ mes: x.mes, vendas: Math.round(x.vendas / 2) }));
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
            Sua fatia é a meta da equipe dividida por 2. Setembro parte da Meta Base (30 vendas).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">Visão consolidada da equipe — quanto os 2 vendedores juntos precisam entregar.</p>
      <SectionBar title="Meta da equipe" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Meta Base da equipe" value={<>60 <span className="text-sm font-normal text-muted-foreground">vendas/mês</span></>} hint="30 × 2 vendedores" icon={Target} />
        <StatTile label="Faturamento na Meta Base" value={<>~R$ 33.030<span className="text-sm font-normal text-muted-foreground">/mês</span></>} hint="mix 30% à vista/cartão + 70% recorrente" icon={DollarSign} />
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
          Setembro parte da Meta Base (60 vendas), com um ramp-up gradual até dezembro.
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

const TURMA_44_AULA1 = new Date(2026, 8, 1); // 01/set/2026 — âncora do calendário quinzenal
const FIM_DO_ANO = new Date(2026, 11, 19); // corta antes da semana de Natal

const SDD_CICLO = [
  { fase: 'Captação', quando: `${fmtData(addDays(TURMA_44_AULA1, -18))} – ${fmtData(addDays(TURMA_44_AULA1, -8))}`, desc: 'Landing page no ar, inscrições abertas, anúncios/orgânico rodando para captar leads.' },
  { fase: 'Aquecimento', quando: `${fmtData(addDays(TURMA_44_AULA1, -7))} – ${fmtData(addDays(TURMA_44_AULA1, -1))}`, desc: 'Lembretes para quem já se inscreveu, contagem regressiva, sem captação de leads novos.' },
  { fase: 'Semana ao vivo', quando: `${fmtData(TURMA_44_AULA1)} – ${fmtData(addDays(TURMA_44_AULA1, 2))}`, desc: 'Aula 1 (ter) → Aula 2 (qua, pitch + carrinho abre) → Aula 3 (qui, carrinho fecha).' },
  { fase: 'Pós-lançamento', quando: `${fmtData(addDays(TURMA_44_AULA1, 3))} – ${fmtData(addDays(TURMA_44_AULA1, 6))}`, desc: 'Remarketing/contato com leads que assistiram mas não compraram.' },
];

// #44 a #47 têm data confirmada com o Pedro (01/09, 15/09, 29/09, 13/10 — todas
// batendo com o ritmo quinzenal). Da #48 em diante é projeção automática no
// mesmo ritmo, até dez/2026.
const SDD_TURMAS_CONFIRMADAS = 4;

function buildSddTurmas() {
  const turmas: { n: number; aula1: Date; real: boolean }[] = [];
  let n = 44;
  let aula1 = TURMA_44_AULA1;
  while (aula1 <= FIM_DO_ANO) {
    turmas.push({ n, aula1, real: n < 44 + SDD_TURMAS_CONFIRMADAS });
    n++;
    aula1 = addDays(aula1, 14);
  }
  return turmas;
}

const SDD_TURMAS = buildSddTurmas();

// Foco na próxima que ainda não aconteceu — evita que o card fique preso numa
// turma antiga conforme os dias passam.
function proximaSddTurma() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return SDD_TURMAS.find((t) => addDays(t.aula1, 2) >= hoje) ?? SDD_TURMAS[SDD_TURMAS.length - 1];
}

function AquisicaoTab() {
  const proxima = proximaSddTurma();
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">Como os leads chegam: a Semana do Despertar, o único canal de captação definido até agora.</p>
      <SectionBar title="Visão geral" icon={Rocket} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Formato" value="3 aulas" hint="ao vivo, YouTube, Ter/Qua/Qui às 20h" icon={Video} />
        <StatTile label="Próxima turma" value={`#${proxima.n}`} hint={`${fmtData(proxima.aula1)} – ${fmtData(addDays(proxima.aula1, 2))}`} icon={Rocket} />
        <StatTile label="Cadência" value="Quinzenal" hint="semana sim, semana não — até dez/2026" icon={Repeat} />
      </div>

      <SectionBar title="Como funciona cada turma" icon={Video} />
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

      <SectionBar title="Calendário de turmas" icon={CalendarDays} />
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
          #{proxima.n} ({fmtData(proxima.aula1)}–{fmtData(addDays(proxima.aula1, 2))}) é a próxima. #44 a #{44 + SDD_TURMAS_CONFIRMADAS - 1} têm data confirmada com o Pedro — dali em diante o calendário é projeção no mesmo ritmo quinzenal até a última turma de 2026.
        </p>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Operação — infos práticas do dia a dia da próxima turma: datas e os links
// de matrícula individuais (um por vendedor, gerados pelo Igor) pra trackear
// quem matriculou quem. Atribuição Helen/Miguel é a ordem em que os
// links chegaram — confirmar se é essa mesma ordem.
// -----------------------------------------------------------------------

interface OperacaoLink { label: string; url: string; vendedor: string; }

interface TurmaFormacao { turma: string; data: Date; dataLabel: string; mesAbrev: string; dia: number | null; confirmada: boolean; }

// Datas reais confirmadas com o Pedro; turmas sem data no cadastro do
// sistema (turmas table) entram aqui como "a definir" até serem fechadas.
const TURMAS_FORMACAO: TurmaFormacao[] = [
  { turma: '02726/OnzeDS', data: new Date(2026, 8, 15), dataLabel: '15/09/2026', mesAbrev: 'Set', dia: 15, confirmada: true },
  { turma: '02826/OnzeDS', data: new Date(2026, 8, 30), dataLabel: '30/09/2026', mesAbrev: 'Set', dia: 30, confirmada: true },
  { turma: '02926/OnzeDS', data: new Date(2026, 9, 15), dataLabel: '15/10/2026', mesAbrev: 'Out', dia: 15, confirmada: true },
  { turma: '03026/OnzeDS', data: new Date(2026, 9, 29), dataLabel: '29/10/2026', mesAbrev: 'Out', dia: 29, confirmada: true },
  { turma: '03126/OnzeDS', data: new Date(2026, 10, 16), dataLabel: '16/11/2026', mesAbrev: 'Nov', dia: 16, confirmada: true },
  { turma: '03226/OnzeDS', data: new Date(2026, 10, 30), dataLabel: '30/11/2026', mesAbrev: 'Nov', dia: 30, confirmada: true },
  { turma: '03326/OnzeDS', data: new Date(2026, 11, 14), dataLabel: '14/12/2026', mesAbrev: 'Dez', dia: 14, confirmada: true },
];

// Foco na próxima turma de formação que ainda não começou — o calendário completo
// fica disponível pra quem quiser olhar mais à frente, mas o destaque não se perde
// nele conforme as datas passam.
function proximaTurmaFormacao() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return TURMAS_FORMACAO.find((t) => t.data >= hoje) ?? TURMAS_FORMACAO[TURMAS_FORMACAO.length - 1];
}

const LINKS_MATRICULA: OperacaoLink[] = [
  { label: 'Ficha de Matrícula — Helen Magna', url: 'https://www.idmpsi.com.br/matricula.html?v=6be52633', vendedor: 'Helen Magna' },
  { label: 'Ficha de Matrícula — Miguel Fogaça', url: 'https://www.idmpsi.com.br/matricula.html?v=d95ebfdc', vendedor: 'Miguel Fogaça' },
];

function copyLink(url: string) {
  navigator.clipboard.writeText(url)
    .then(() => toast({ title: 'Link copiado', description: url }))
    .catch(() => toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'Copie manualmente o link.' }));
}

// Código de 5 dígitos que identifica a turma ("Turma #02726/OnzeDS" → "02726").
// É o que o nome do grupo no WhatsApp e o cadastro da turma têm em comum — o
// resto do nome varia ("/OnzeDS", "- PSICANÁLISE iDM").
function codigoDaTurma(nome: string): string | null {
  return nome.match(/\d{5}/)?.[0] ?? null;
}

// Link do grupo de WhatsApp de cada turma de formação, indexado pelo código.
// A fonte é a mesma que o disparo de boas-vindas usa (turma_disparo_config.link_grupo,
// editável no Financeiro → turma → Disparo): o vendedor vê exatamente o convite que o
// aluno recebe, e trocar o link num lugar só já vale pros dois.
function useLinksGrupoFormacao() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: turmas } = await supabase.from('turmas').select('id, nome');
      if (!turmas?.length) { if (!cancelado) setLoading(false); return; }

      const { data: configs } = await supabase
        .from('turma_disparo_config')
        .select('turma_id, link_grupo')
        .in('turma_id', turmas.map((t) => t.id));

      const linkPorTurmaId = new Map((configs ?? []).map((c) => [c.turma_id, c.link_grupo]));
      const porCodigo: Record<string, string> = {};
      for (const t of turmas) {
        const link = linkPorTurmaId.get(t.id);
        const codigo = codigoDaTurma(t.nome);
        if (!link || !codigo) continue;
        // Duas turmas podem repetir o código com sufixo diferente (ex: 02526/OnzeDS
        // e 02526/Keila). O calendário daqui é o das turmas /OnzeDS — na dúvida, é
        // ela que vale, venha em que ordem vier.
        if (porCodigo[codigo] && !/onzeds/i.test(t.nome)) continue;
        porCodigo[codigo] = link;
      }

      if (!cancelado) { setLinks(porCodigo); setLoading(false); }
    })();
    return () => { cancelado = true; };
  }, []);

  return { links, loading };
}

// Botõezinhos de copiar/abrir o grupo, na própria linha do calendário de turmas.
function GrupoTurmaAcoes({ url }: { url?: string }) {
  if (!url) return <span className="text-[11px] text-muted-foreground">sem grupo</span>;
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => copyLink(url)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Copiar link do grupo">
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Abrir grupo no WhatsApp">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
      </a>
    </div>
  );
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

// Vendedores (Helen, Miguel) começaram a atuar no Time Comercial nessa data — matrículas
// sem turma de antes disso são resíduo de outro fluxo/período, não faz sentido entrar
// na fila de "aguardando turma" que eles reivindicam.
const ALUNOS_AGUARDANDO_TURMA_DESDE = '2026-08-20';

function AlunosAguardandoTurmaCard({ viewAsName }: VendorScopeProps) {
  const invalidarDados = useInvalidarDados();
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
        .gte('data_matricula', ALUNOS_AGUARDANDO_TURMA_DESDE)
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
    // Assumir um aluno muda quem aparece como responsavel no Financeiro e no Dashboard.
    // Sem avisar, as duas telas seguem mostrando o dono antigo ate alguem dar F5.
    if (!error) invalidarDados('alunos');
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
      // Atribuir turma refaz as PARCELAS do aluno, não só o vínculo. Sem avisar, o
      // Financeiro segue mostrando as parcelas antigas e a Cobrança a fila velha.
      // `alunos` já arrasta `pagamentos` pela invalidação cruzada.
      invalidarDados('alunos');
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
  const proximaFormacao = proximaTurmaFormacao();
  const proximaSdd = proximaSddTurma();
  const { links: linksGrupo, loading: loadingGrupos } = useLinksGrupoFormacao();
  const linkGrupoProxima = linksGrupo[codigoDaTurma(proximaFormacao.turma) ?? ''];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">{viewAsName ? 'Seu link de matrícula e os alunos que você fechou, aguardando entrar numa turma.' : 'Links de matrícula por vendedor e alunos aguardando turma, de todo mundo.'}</p>

      <SectionBar title="Turma atual" icon={GraduationCap} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Próxima turma (formação)" value={proximaFormacao.turma.split('/')[0]} hint={`Turma #${proximaFormacao.turma} · PSI`} icon={GraduationCap} />
        <StatTile label="Data de início" value={proximaFormacao.dataLabel} hint={`Turma ${proximaFormacao.turma}`} icon={CalendarDays} />
        <StatTile label="Matrículas desta turma" value="Via links abaixo" hint="é pra onde as fichas de matrícula apontam" icon={Link2} />
      </div>
      <p className="text-xs text-muted-foreground">
        Essa é a turma de formação (a classe de verdade) — diferente da turma #{proximaSdd.n} da Semana do Despertar, que é só o lançamento/captação (ver aba Aquisição aqui do lado).
      </p>

      <SectionBar title="Grupo da turma" subtitle="Convite do grupo de WhatsApp onde o aluno matriculado entra." icon={MessageCircle} />
      <Card className="p-4">
        {loadingGrupos ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : linkGrupoProxima ? (
          <LinkRow label={`Grupo da Turma ${proximaFormacao.turma}`} url={linkGrupoProxima} />
        ) : (
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            A turma {proximaFormacao.turma} ainda não tem grupo cadastrado. O link entra no Financeiro → turma → Disparo, no campo "Link do grupo WhatsApp".
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          É o mesmo convite que vai no disparo de boas-vindas — manda depois da ficha de matrícula preenchida. Os grupos das turmas seguintes ficam no calendário abaixo, conforme forem criados.
        </p>
      </Card>

      <SectionBar title="Calendário de turmas" subtitle="Data de início e grupo de WhatsApp de cada turma nova, sem precisar perguntar." icon={CalendarDays} />
      <Card className="p-4">
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
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge className={`text-xs border-0 ${t.confirmada ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  {t.confirmada ? 'confirmada' : 'a definir'}
                </Badge>
                {!loadingGrupos && <GrupoTurmaAcoes url={linksGrupo[codigoDaTurma(t.turma) ?? '']} />}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionBar title="Matrículas" subtitle="Fichas por vendedor e quem já fechou, aguardando turma." icon={Link2} />
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Ficha de Matrícula — por vendedor</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Link trackeado individual — cada vendedor usa só o próprio, pra matrícula ficar atribuída certinho.
        </p>
        <div className="flex flex-col gap-2">
          {matriculaLinks.map((l) => (
            <LinkRow key={l.url} label={l.label} url={l.url} />
          ))}
        </div>
        {!viewAsName && (
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            Atribuição por ordem de chegada dos links: Helen → Miguel.
          </p>
        )}
      </Card>

      <AlunosAguardandoTurmaCard viewAsName={viewAsName} />

      <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 -mt-2">
        Outros links da turma (landing page da Semana do Despertar, pagamento/checkout) aparecem aqui assim que estiverem disponíveis.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------
// Remuneração — calculadora de comissão PJ. Puramente client-side por
// enquanto (numeros e formulas do protótipo) — decisao de produto: portar
// primeiro, conectar ao Supabase depois.
// -----------------------------------------------------------------------

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

  // Sem gerente no time por enquanto — todo mundo vendedor(a) comum ve so a propria linha.
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
                <TableCell className="font-semibold text-primary">Soma dos 2 (não é meta de equipe)</TableCell>
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
              : 'Base, Motivo e Superação são metas individuais — cada vendedor bate a sua. A linha de baixo na tabela é só a soma dos 2, não uma meta de equipe formal.'}
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
// Dados — números reais do time comercial, não simulação: faturamento
// realizado por vendedor (via alunos.vendedor_id, preenchido quando o
// vendedor reivindica a matrícula em "Alunos aguardando turma"), leads que
// entraram vs vendas fechadas, produtividade (leads movimentados por dia,
// via leads_historico_fase) e meta de reativação da base de retorno.
// Fica antes de "Metas e Comissão" — é o "onde estamos" antes do "pra onde
// vamos".
// -----------------------------------------------------------------------

interface AlunoVendedorStat { vendedor: string; vista_cartao: number; boleto: number; bolsa_cortesia: number; sem_forma: number; total: number; }
interface MovimentacaoDia { vendedor: string; dia: string; tipo: 'movimentacao' | 'contato_whatsapp' | 'contato_ligacao'; eventos: number; }
interface VendaDiaSemana { dia_semana: number; vendas: number; }
interface LeadsMes { mes: string; total: number; }
interface VendaMes { mes: string; vendedor: string; vista_cartao: number; boleto: number; total: number; }
interface CicloVendas { dias_medio: number | null; vendas_consideradas: number; }
interface VendaEpocaMes { dia_do_mes: number; vendas: number; }
interface AtividadeItem {
  vendedor: string;
  lead_id: string;
  lead_nome: string;
  fase_anterior: string | null;
  fase_nova: string | null;
  origem_mudanca: string;
  atendeu: boolean | null;
  resumo: string | null;
  criado_em: string;
}

// Meta de reativação da base Retorno/Base (hoje ~11.680 leads) — ainda não
// definida pelo dono do negócio. Quando ele passar o número, troca aqui.
const META_RETORNO_BASE_MES: number | null = null;

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function DadosTab({ viewAsName }: VendorScopeProps) {
  const [alunosPorVendedor, setAlunosPorVendedor] = useState<AlunoVendedorStat[]>([]);
  const [movimentacao, setMovimentacao] = useState<MovimentacaoDia[]>([]);
  const [contagens, setContagens] = useState<Contagem[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [vendasPorDia, setVendasPorDia] = useState<VendaDiaSemana[]>([]);
  const [leadsPorMes, setLeadsPorMes] = useState<LeadsMes[]>([]);
  const [vendasPorMes, setVendasPorMes] = useState<VendaMes[]>([]);
  const [cicloVendas, setCicloVendas] = useState<CicloVendas | null>(null);
  const [vendasPorEpocaMes, setVendasPorEpocaMes] = useState<VendaEpocaMes[]>([]);
  const [atividade, setAtividade] = useState<AtividadeItem[]>([]);
  const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const diasAtras = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };
  // Período exato (não só "últimos N dias") — os botões Dia/Semana/Mês só
  // preenchem os dois campos de data, que continuam editáveis pra escolher
  // qualquer intervalo específico (ex: uma semana de um mês passado).
  const [atividadeInicio, setAtividadeInicio] = useState(diasAtras(6));
  const [atividadeFim, setAtividadeFim] = useState(hojeIso);
  const [diasCarregados, setDiasCarregados] = useState(90);
  const [loading, setLoading] = useState(true);
  const [loadingAtividade, setLoadingAtividade] = useState(false);

  const fetchAtividade = async (dias: number) => {
    setLoadingAtividade(true);
    const { data: ativ } = await (supabase as any).rpc('time_comercial_atividade_vendedor', { p_dias: dias });
    if (ativ) setAtividade(ativ as AtividadeItem[]);
    setLoadingAtividade(false);
  };

  // Se o "De" escolhido for mais antigo que o já carregado, busca de novo
  // com uma janela maior — sem isso o período exato ficaria limitado aos
  // últimos 90 dias mesmo quando o vendedor escolhe uma data mais antiga.
  useEffect(() => {
    const diasNecessarios = Math.ceil((new Date(hojeIso).getTime() - new Date(atividadeInicio).getTime()) / 86400000) + 2;
    if (diasNecessarios > diasCarregados) {
      const novoTeto = Math.min(diasNecessarios, 730);
      setDiasCarregados(novoTeto);
      fetchAtividade(novoTeto);
    }
  }, [atividadeInicio]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPresetPeriodo = (tipo: 'dia' | 'semana' | 'mes') => {
    setAtividadeFim(hojeIso);
    setAtividadeInicio(tipo === 'dia' ? hojeIso : tipo === 'semana' ? diasAtras(6) : diasAtras(29));
  };

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: alunos }, { data: mov }, { data: cont }, { data: camps }, { data: diaSemana }, { data: lMes }, { data: vMes }, { data: ciclo }, { data: epocaMes }] = await Promise.all([
        (supabase as any).rpc('time_comercial_alunos_vendedor'),
        (supabase as any).rpc('time_comercial_movimentacao_dia', { dias: 7 }),
        (supabase as any).rpc('time_comercial_contagens'),
        (supabase as any).from('time_comercial_campanhas').select('*'),
        (supabase as any).rpc('time_comercial_vendas_por_dia_semana'),
        (supabase as any).rpc('time_comercial_leads_por_mes'),
        (supabase as any).rpc('time_comercial_vendas_por_mes'),
        (supabase as any).rpc('time_comercial_ciclo_vendas'),
        (supabase as any).rpc('time_comercial_vendas_por_epoca_mes'),
        fetchAtividade(diasCarregados),
      ]);
      if (alunos) setAlunosPorVendedor(alunos as AlunoVendedorStat[]);
      if (mov) setMovimentacao(mov as MovimentacaoDia[]);
      if (cont) setContagens(cont as Contagem[]);
      if (camps) setCampanhas(camps as Campanha[]);
      if (diaSemana) setVendasPorDia(diaSemana as VendaDiaSemana[]);
      if (lMes) setLeadsPorMes(lMes as LeadsMes[]);
      if (vMes) setVendasPorMes(vMes as VendaMes[]);
      if (epocaMes) setVendasPorEpocaMes(epocaMes as VendaEpocaMes[]);
      if (ciclo) setCicloVendas((ciclo as CicloVendas[])[0] ?? null);
      setLoading(false);
    };
    fetchData();
  }, []);

  const vendedoresVisiveis = viewAsName ? INITIAL_VENDORS.filter((v) => v.name === viewAsName) : INITIAL_VENDORS;
  const alunosDe = (nome: string) => alunosPorVendedor.find((a) => a.vendedor === nome);

  // Mesmo critério do Funil: campanha de retorno (base antiga) não conta como
  // "leads que entraram" — senão o número vem inflado com milhares de leads
  // frios de anos atrás, que não representam captação de verdade.
  const campanhaIdsRetorno = campanhas.filter((c) => c.tipo === 'retorno').map((c) => c.id);
  const leadsEntraram = contagens
    .filter((c) => !(c.campanha_id && campanhaIdsRetorno.includes(c.campanha_id)))
    .filter((c) => !viewAsName || !c.vendedor || c.vendedor === viewAsName)
    .reduce((soma, c) => soma + Number(c.total), 0);

  const vendasTotais = vendedoresVisiveis.reduce((soma, v) => soma + (alunosDe(v.name)?.total ?? 0), 0);
  const conversaoPct = leadsEntraram > 0 ? (vendasTotais / leadsEntraram) * 100 : 0;

  // Ticket médio — faturamento total / venda com valor real (exclui bolsa,
  // cortesia e as ainda sem forma de pagamento cadastrada).
  const faturamentoTotal = vendedoresVisiveis.reduce((soma, v) => soma + calcVendor(alunosDe(v.name)?.vista_cartao ?? 0, alunosDe(v.name)?.boleto ?? 0).faturamento, 0);
  const vendasComValor = vendedoresVisiveis.reduce((soma, v) => soma + (alunosDe(v.name)?.vista_cartao ?? 0) + (alunosDe(v.name)?.boleto ?? 0), 0);
  const ticketMedio = vendasComValor > 0 ? faturamentoTotal / vendasComValor : 0;

  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const movimentacaoDe = (nome: string, tipo: MovimentacaoDia['tipo']) => {
    const doVendedor = movimentacao.filter((m) => m.vendedor === nome && m.tipo === tipo);
    const hoje = doVendedor.find((m) => m.dia === hojeStr)?.eventos ?? 0;
    const total7dias = doVendedor.reduce((soma, m) => soma + Number(m.eventos), 0);
    return { hoje, media7dias: Math.round((total7dias / 7) * 10) / 10 };
  };

  // Ranking simples por vendas fechadas — métrica clássica de leaderboard de
  // time de vendas, só faz sentido na visão de admin (com todo mundo junto).
  const ranking = [...INITIAL_VENDORS]
    .map((v) => ({ v, vendas: alunosDe(v.name)?.total ?? 0 }))
    .sort((a, b) => b.vendas - a.vendas);

  const vendasPorDiaMap = new Map(vendasPorDia.map((d) => [d.dia_semana, d.vendas]));
  const maxVendasDia = Math.max(1, ...vendasPorDia.map((d) => d.vendas));

  // Época do mês (início/meio/fim) — visão mais grossa que dia exato, mais
  // fácil de virar rotina ("reforça contato na 1ª semana do mês").
  const EPOCAS_MES = [
    { label: 'Início (1–10)', min: 1, max: 10 },
    { label: 'Meio (11–20)', min: 11, max: 20 },
    { label: 'Fim (21–31)', min: 21, max: 31 },
  ];
  const vendasPorEpoca = EPOCAS_MES.map((ep) => ({
    ...ep,
    vendas: vendasPorEpocaMes.filter((d) => d.dia_do_mes >= ep.min && d.dia_do_mes <= ep.max).reduce((soma, d) => soma + Number(d.vendas), 0),
  }));
  const maxVendasEpoca = Math.max(1, ...vendasPorEpoca.map((e) => e.vendas));

  const mesesOrdenados = [...new Set([...leadsPorMes.map((l) => l.mes), ...vendasPorMes.map((v) => v.mes)])].sort().reverse();
  const fmtMes = (mes: string) => {
    const d = new Date(mes + 'T00:00:00');
    return `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  };

  // Linha do tempo "o que eu fiz hoje/ontem/etc" — fica tudo gravado (não
  // reseta), agrupado por dia pra dar pra revisar rapidinho a atividade
  // recente de cada vendedor.
  const STAGE_LABELS: Record<string, string> = Object.fromEntries([...FUNIL_STAGES, ...SDD_STAGES, RETORNO_STAGE].map((s) => [s.key, s.label]));
  const descreverAtividade = (item: AtividadeItem) => {
    switch (item.origem_mudanca) {
      case 'criacao': return `Lead entrou (${STAGE_LABELS[item.fase_nova ?? ''] ?? item.fase_nova})`;
      case 'atribuicao': return 'Pegou o lead';
      case 'devolucao': return 'Devolveu o lead';
      case 'contato_whatsapp': return 'Abriu WhatsApp';
      case 'contato_ligacao': return `Ligou${item.atendeu === true ? ' — atendeu' : item.atendeu === false ? ' — não atendeu' : ''}`;
      default: return `Mudou para ${STAGE_LABELS[item.fase_nova ?? ''] ?? item.fase_nova}`;
    }
  };
  const diaLabel = (isoDia: string) => {
    if (isoDia === hojeStr) return 'Hoje';
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    if (isoDia === ontem.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })) return 'Ontem';
    const d = new Date(isoDia + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });
  };
  // Período exato escolhido pelo vendedor (campos "De"/"Até") — os presets
  // Dia/Semana/Mês só preenchem os campos, o filtro real usa as datas.
  const atividadeNoPeriodoDe = (nome: string) =>
    atividade.filter((a) => {
      if (a.vendedor !== nome) return false;
      const dia = new Date(a.criado_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      return dia >= atividadeInicio && dia <= atividadeFim;
    });

  const resumoPeriodoDe = (nome: string) => {
    const itens = atividadeNoPeriodoDe(nome);
    return {
      movimentacoes: itens.filter((i) => !['contato_whatsapp', 'contato_ligacao'].includes(i.origem_mudanca)).length,
      mensagens: itens.filter((i) => i.origem_mudanca === 'contato_whatsapp').length,
      ligacoes: itens.filter((i) => i.origem_mudanca === 'contato_ligacao').length,
    };
  };

  const atividadeAgrupadaDe = (nome: string) => {
    const porDia = new Map<string, AtividadeItem[]>();
    for (const item of atividadeNoPeriodoDe(nome)) {
      const dia = new Date(item.criado_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia)!.push(item);
    }
    return [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando dados...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground -mt-1">{viewAsName ? 'Seus números reais até agora — não é simulação.' : 'Números reais do time até agora — não é simulação. Onde estamos antes de olhar a meta.'}</p>

      <SectionBar title="Visão geral" subtitle="Apenas leads captados no período. A base de retorno reimportada fica de fora." icon={Users} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Leads que entraram" value={leadsEntraram} icon={Users} />
        <StatTile label="Vendas fechadas" value={vendasTotais} icon={GraduationCap} />
        <StatTile label="Taxa de conversão" value={`${conversaoPct.toFixed(1)}%`} hint={leadsEntraram > 0 ? `${vendasTotais} de ${leadsEntraram} leads` : 'Sem leads ainda'} icon={Percent} />
      </div>

      <SectionBar title="Faturamento realizado por vendedor" subtitle="Baseado em matrículas efetivadas, creditadas ao vendedor que reivindicou o aluno." icon={DollarSign} />
      <Card className="p-4 overflow-x-auto">
        <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
          <TableHeader>
            <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">À vista/cartão</TableHead>
              <TableHead className="text-right">Recorrente</TableHead>
              <TableHead className="text-right">Bolsa/cortesia</TableHead>
              <TableHead className="text-right">Sem forma de pgto.</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendedoresVisiveis.map((v, idx) => {
              const stat = alunosDe(v.name);
              const calc = calcVendor(stat?.vista_cartao ?? 0, stat?.boleto ?? 0);
              return (
                <TableRow key={v.name} className={premiumZebraRow(idx)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                      <div className="text-sm font-medium text-foreground">{v.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{stat?.vista_cartao ?? 0}</TableCell>
                  <TableCell className="text-right">{stat?.boleto ?? 0}</TableCell>
                  <TableCell className="text-right">{stat?.bolsa_cortesia ?? 0}</TableCell>
                  <TableCell className="text-right">{stat?.sem_forma ?? 0}</TableCell>
                  <TableCell className="text-right">{fmt(calc.faturamento)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{fmt(calc.comissao)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
          "Sem forma de pgto." são matrículas reivindicadas mas sem à-vista/cartão/boleto informado ainda na ficha — não entram no faturamento até isso ser preenchido. "Bolsa/cortesia" não geram comissão.
        </p>
      </Card>

      {!viewAsName && (
        <>
          <SectionBar title="Ranking da equipe" subtitle="Vendas fechadas por vendedor — quem está na frente agora." icon={Trophy} />
          <Card className="p-4">
            <div className="flex flex-col divide-y divide-border">
              {ranking.map(({ v, vendas }, idx) => {
                const medalha = idx === 0 ? 'bg-warning/15 text-warning border-warning/30' : idx === 1 ? 'bg-muted text-muted-foreground border-border' : 'bg-transparent text-muted-foreground border-transparent';
                return (
                  <div key={v.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${medalha}`}>
                      {idx === 0 && vendas > 0 ? <Trophy className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">{idx + 1}º</span>}
                    </div>
                    <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                    <p className="text-sm font-medium text-foreground flex-1">{v.name}</p>
                    <Badge className="text-xs border-0 bg-primary/10 text-primary">{vendas} {vendas === 1 ? 'venda' : 'vendas'}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <SectionBar title="Indicadores de eficiência" subtitle="Velocidade de venda e valor médio por venda." icon={Timer} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          label="Ciclo de vendas médio"
          value={cicloVendas?.dias_medio != null ? `${cicloVendas.dias_medio}` : '—'}
          hint={cicloVendas && cicloVendas.vendas_consideradas > 0 ? `dias, de ${cicloVendas.vendas_consideradas} venda(s) pelo funil` : 'Nenhuma venda passou pelo funil (Kanban) ainda'}
          icon={Timer}
        />
        <StatTile
          label="Ticket médio"
          value={vendasComValor > 0 ? fmt(ticketMedio) : '—'}
          hint={vendasComValor > 0 ? `de ${vendasComValor} venda(s) com forma de pagamento` : 'Sem vendas com valor cadastrado ainda'}
          icon={DollarSign}
        />
      </div>

      <SectionBar title="Atividade do vendedor" subtitle="Ritmo diário e histórico completo. Escolha o período que quiser revisar." icon={Activity} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {vendedoresVisiveis.map((v) => {
          const movs = movimentacaoDe(v.name, 'movimentacao');
          const msgs = movimentacaoDe(v.name, 'contato_whatsapp');
          const ligacoes = movimentacaoDe(v.name, 'contato_ligacao');
          return (
            <Card key={v.name} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                <p className="text-sm font-semibold text-foreground">{v.name}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-muted/50 p-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm font-bold text-foreground">{movs.hoje}</p>
                  <p className="text-[10px] text-muted-foreground">leads hoje · {movs.media7dias}/dia méd.</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <MessageCircle className="h-3.5 w-3.5 text-success mx-auto mb-1" />
                  <p className="text-sm font-bold text-foreground">{msgs.hoje}</p>
                  <p className="text-[10px] text-muted-foreground">msgs hoje · {msgs.media7dias}/dia méd.</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <Phone className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
                  <p className="text-sm font-bold text-foreground">{ligacoes.hoje}</p>
                  <p className="text-[10px] text-muted-foreground">ligações hoje · {ligacoes.media7dias}/dia méd.</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Mensagens contam quando o vendedor abre o WhatsApp do lead pela tela; ligações são registradas manualmente no botão de telefone do card do lead.</p>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Histórico — o que cada um fez</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Escolha o período exato pra revisar.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1.5">
              {(['dia', 'semana', 'mes'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPresetPeriodo(p)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  {p === 'dia' ? 'Hoje' : p === 'semana' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">De</Label>
                <Input type="date" value={atividadeInicio} max={atividadeFim} onChange={(e) => setAtividadeInicio(e.target.value)} className="h-8 text-xs w-36" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Até</Label>
                <Input type="date" value={atividadeFim} min={atividadeInicio} max={hojeIso} onChange={(e) => setAtividadeFim(e.target.value)} className="h-8 text-xs w-36" />
              </div>
              {loadingAtividade && <span className="text-xs text-muted-foreground pb-1.5">Carregando...</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {vendedoresVisiveis.map((v) => {
            const grupos = atividadeAgrupadaDe(v.name);
            const resumo = resumoPeriodoDe(v.name);
            return (
              <div key={v.name} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-[11px] text-white flex-shrink-0" style={{ backgroundColor: v.cor }}>{v.initials}</div>
                  <p className="text-sm font-semibold text-foreground">{v.name}</p>
                </div>
                <div className="flex gap-2 mb-3">
                  <Badge className="text-[11px] border-0 bg-muted text-muted-foreground">{resumo.movimentacoes} leads movimentados</Badge>
                  <Badge className="text-[11px] border-0 bg-success/10 text-success">{resumo.mensagens} msgs</Badge>
                  <Badge className="text-[11px] border-0 bg-primary/10 text-primary">{resumo.ligacoes} ligações</Badge>
                </div>
                {grupos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma atividade registrada nesse período.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto flex flex-col gap-3 pr-1">
                    {grupos.map(([dia, itens]) => (
                      <div key={dia}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1.5">{diaLabel(dia)} <span className="text-muted-foreground font-normal normal-case">· {itens.length} {itens.length === 1 ? 'ação' : 'ações'}</span></p>
                        <div className="flex flex-col gap-1.5">
                          {itens.map((item, idx) => (
                            <div key={idx} className="text-xs border-l-2 border-border pl-2">
                              <p className="text-foreground">
                                <span className="text-muted-foreground">{new Date(item.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                                {' — '}{descreverAtividade(item)} <span className="text-muted-foreground">· {item.lead_nome}</span>
                              </p>
                              {item.resumo && <p className="text-muted-foreground bg-muted rounded px-1.5 py-1 mt-0.5">{item.resumo}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <SectionBar title="Quando os leads mais compram" subtitle="Matrículas reais por dia da semana e por época do mês — ajuda a saber quando concentrar esforço de fechamento." icon={CalendarDays} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Por dia da semana</h3>
          {vendasPorDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há matrículas suficientes pra mostrar um padrão — esse gráfico vai ficando mais confiável conforme o mês avança.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {DIAS_SEMANA.map((nome, idx) => {
                const vendas = vendasPorDiaMap.get(idx) ?? 0;
                const pct = (vendas / maxVendasDia) * 100;
                return (
                  <div key={nome} className="grid grid-cols-[80px_1fr_30px] items-center gap-2">
                    <span className="text-xs text-muted-foreground">{nome}</span>
                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-foreground text-right">{vendas}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Por época do mês</h3>
          {vendasPorEpocaMes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há matrículas suficientes pra mostrar um padrão.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {vendasPorEpoca.map((ep) => {
                const pct = (ep.vendas / maxVendasEpoca) * 100;
                return (
                  <div key={ep.label} className="grid grid-cols-[110px_1fr_30px] items-center gap-2">
                    <span className="text-xs text-muted-foreground">{ep.label}</span>
                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-foreground text-right">{ep.vendas}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <SectionBar title="Evolução mensal" subtitle="Como cada mês se comportou, da captação à matrícula." icon={TrendingUp} />
      <Card className="p-4 overflow-x-auto">
        {mesesOrdenados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem histórico — o primeiro mês fecha aqui assim que passar.</p>
        ) : (
          <Table className="[&_td]:px-2.5 [&_td]:py-2 sm:[&_td]:px-4 sm:[&_td]:py-3 [&_th]:px-2.5 sm:[&_th]:px-4">
            <TableHeader>
              <TableRow className={PREMIUM_TABLE_HEADER_ROW}>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Leads que entraram</TableHead>
                <TableHead className="text-right">Vendas fechadas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesesOrdenados.map((mes, idx) => {
                const leadsDoMes = leadsPorMes.find((l) => l.mes === mes)?.total ?? 0;
                const vendasDoMes = vendasPorMes.filter((v) => v.mes === mes && (!viewAsName || v.vendedor === viewAsName));
                const totalVendasMes = vendasDoMes.reduce((soma, v) => soma + Number(v.total), 0);
                const faturamentoMes = vendasDoMes.reduce((soma, v) => soma + calcVendor(Number(v.vista_cartao), Number(v.boleto)).faturamento, 0);
                return (
                  <TableRow key={mes} className={premiumZebraRow(idx)}>
                    <TableCell className="font-medium">{fmtMes(mes)}</TableCell>
                    <TableCell className="text-right">{leadsDoMes}</TableCell>
                    <TableCell className="text-right">{totalVendasMes}</TableCell>
                    <TableCell className="text-right">{fmt(faturamentoMes)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <SectionBar title="Meta de reativação — Retorno/Base" subtitle="Quantas matrículas por mês devem vir da base antiga (Base Fria, Grupo Oferta Não Matriculou etc.)." icon={Repeat} />
      <Card className="p-4">
        {META_RETORNO_BASE_MES === null ? (
          <p className="text-sm text-muted-foreground">Meta ainda não definida — assim que for confirmada, ela entra aqui e passa a comparar com as matrículas reais vindas do canal Retorno/Base.</p>
        ) : (
          <p className="text-sm text-foreground">Meta: <span className="font-semibold">{META_RETORNO_BASE_MES}</span> matrículas/mês vindas do Retorno/Base.</p>
        )}
      </Card>
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
// só o que é dela — pronto pra trocar por auth real quando Helen/Miguel
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
  const { user } = useAuth();
  // Vendedor(a) logado(a) de verdade: trava a própria visão, sem opção de trocar
  // pra ver os leads/dados de outra pessoa do time. Admin/gerente continuam com
  // o switcher "Ver como" pra alternar entre todos.
  const lockedVendor = user?.tipo === 'vendedor'
    ? INITIAL_VENDORS.find((v) => v.name === user.nome && !v.gerente)
    : undefined;

  const [viewAs, setViewAs] = useState(lockedVendor ? lockedVendor.name : 'todos');
  const activeVendor = lockedVendor ?? INITIAL_VENDORS.find((v) => v.name === viewAs);
  // null = sem filtro (admin ou gerente); string = so os dados desse vendedor.
  const viewAsName = activeVendor && !activeVendor.gerente ? activeVendor.name : null;

  return (
    <div className="h-full flex flex-col animate-fade-in p-4 lg:p-6 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Time Comercial</h1>
        {!lockedVendor && (
          <div className="flex flex-col items-end gap-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Eye className="h-2.5 w-2.5" /> Ver como
            </p>
            <VendorSwitch viewAs={viewAs} onChange={setViewAs} />
          </div>
        )}
      </div>

      <Tabs defaultValue="funil" className="flex-1 flex flex-col min-h-0">
        <div className="rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent p-4 mb-1 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">Meu trabalho</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Comece por aqui: trabalhar os leads, fechar matrícula e acompanhar metas.</p>
            </div>
          </div>
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
            <TabsTrigger
              value="dados"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Dados
            </TabsTrigger>
            <TabsTrigger
              value="metas_comissao"
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <BookOpen className="h-3.5 w-3.5" /> Metas e Comissão
            </TabsTrigger>

            {/* Barra separadora: o que vem depois nao e' rotina do vendedor, e'
                consulta de historico -- quem mais usa e' o admin. Fica no mesmo
                bloco, mas do outro lado da divisao e em tom neutro. */}
            <div className="w-px self-stretch bg-primary/20 mx-1.5" aria-hidden="true" />

            <TabsTrigger
              value="chat"
              className="rounded-lg px-4 py-2 text-sm font-medium bg-muted border border-border text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm gap-1.5"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Chat
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="funil" className="flex-1 min-h-0">
          <FunilTimeComercial viewAsName={viewAsName} />
        </TabsContent>

        <TabsContent value="chat" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {viewAsName
              ? 'Histórico das conversas que passaram pelo seu WhatsApp, com o nome do lead. Só leitura.'
              : 'Histórico das conversas dos WhatsApps do time, com o nome do lead. Cada vendedor enxerga só o próprio número.'}
          </p>
          <ChatTimeComercial
            viewAsName={viewAsName}
            vendedores={INITIAL_VENDORS.filter((v) => !v.gerente).map((v) => v.name)}
          />
        </TabsContent>

        <TabsContent value="dados">
          <DadosTab viewAsName={viewAsName} />
        </TabsContent>

        <TabsContent value="operacao">
          <Tabs defaultValue="op_turma" className="flex flex-col gap-4">
            <TabsList className="h-auto bg-transparent p-0 gap-1.5 justify-start flex-wrap">
              <TabsTrigger value="op_turma" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Turma atual</TabsTrigger>
              <TabsTrigger value="op_aquisicao" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Aquisição</TabsTrigger>
            </TabsList>
            <TabsContent value="op_turma">
              <OperacaoTab viewAsName={viewAsName} />
            </TabsContent>
            <TabsContent value="op_aquisicao">
              <AquisicaoTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="metas_comissao">
          <Tabs defaultValue="meta_pessoal" className="flex flex-col gap-4">
            <TabsList className="h-auto bg-transparent p-0 gap-1.5 justify-start flex-wrap">
              <TabsTrigger value="meta_pessoal" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Meta Pessoal</TabsTrigger>
              <TabsTrigger value="meta_equipe" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Meta de Equipe</TabsTrigger>
              <TabsTrigger value="remuneracao" className="rounded-lg px-3 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm">Remuneração</TabsTrigger>
            </TabsList>
            <TabsContent value="meta_pessoal">
              <MetasTab viewAsName={viewAsName} />
            </TabsContent>
            <TabsContent value="meta_equipe">
              <MetaEquipeTab />
            </TabsContent>
            <TabsContent value="remuneracao">
              <RemuneracaoTab viewAsName={viewAsName} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
