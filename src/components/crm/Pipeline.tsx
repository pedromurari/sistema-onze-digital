import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lead, PIPELINE_STAGES, PipelineStage } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { dbRowToLead } from '@/contexts/LeadsContext';
import { Clock, Edit, MessageCircle, MessagesSquare, ChevronDown, ChevronUp, ExternalLink, TrendingUp, Users, DollarSign, Target, Trash2, CalendarClock, Loader2 } from 'lucide-react';
import { useThread } from '@/hooks/useThread';
import { fmtHora, TIPO_LABEL } from '@/lib/chat-utils';
import { abrirChatWidget } from './chat/ChatWidget';

const CURSO_LEADS_DIRETOS = 'Formação em Psicanálise Clínica Integrativa';

// Ticket medio estimado do lead direto (LTV), ja liquido de taxa de gateway --
// valores confirmados por Pedro: PIX a vista R$ 997,00 / cartao R$ 1.021,46 /
// boleto 1+14x R$ 1.648,50. Boleto e o que mais fecha (~80-85% das vendas),
// PIX+cartao combinados ficam em ~15-20%. Pesos usados: boleto 82% / a vista
// 11% / cartao 7% (a vista > cartao dentro desse resto, seguindo a proporcao
// historica real de matriculas). Nao desconta inadimplencia do boleto -- e
// LTV de contrato, nao caixa efetivamente recebido.
const TICKET_MEDIO_ESTIMADO = 0.82 * 1648.5 + 0.11 * 997 + 0.07 * 1021.46;

const formatDateTime = (iso?: string) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface PipelineProps { onEditLead: (lead: Lead) => void; }

function EngajamentoBadge({ value }: { value?: string }) {
  if (!value) return null;
  const upper = value.toUpperCase();
  let colorClass = 'bg-muted text-muted-foreground';
  if (upper === 'ALTO') colorClass = 'bg-success/20 text-success';
  else if (upper === 'MÉDIO' || upper === 'MEDIO') colorClass = 'bg-warning/20 text-warning';
  else if (upper === 'BAIXO') colorClass = 'bg-destructive/20 text-destructive';
  return <Badge className={`text-xs border-0 ${colorClass}`}>{value}</Badge>;
}

function LeadChatBubbles({ lead }: { lead: Lead }) {
  // Puxa a thread real e sincronizada do WhatsApp (mesmo dado do Chat/ChatWidget),
  // em vez dos campos estaticos mensagemLead/mensagemIa que nunca eram atualizados.
  const { thread, loading } = useThread(lead.telefone || null);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando conversa...
      </div>
    );
  }
  if (thread.length === 0) return <p className="text-xs text-muted-foreground py-2">Nenhuma mensagem ainda</p>;

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto py-2">
      {thread.map((msg) => (
        <div key={msg.id} className={`flex ${msg.direcao === 'enviada' ? 'justify-end' : 'justify-start'}`}>
          <div className={`rounded-lg px-3 py-1.5 max-w-[80%] text-xs ${msg.direcao === 'enviada' ? 'bg-success/20 text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
            <p>{msg.tipo !== 'text' ? `[${TIPO_LABEL[msg.tipo] ?? 'Mensagem'}]` : msg.conteudo}</p>
            <p className="text-[10px] opacity-60 mt-0.5">{fmtHora(msg.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadExpandedInfo({ lead }: { lead: Lead }) {
  return (
    <div className="border-t border-border pt-2 mt-2 space-y-1.5 text-xs">
      {lead.objetivoPrincipal && <div><span className="font-medium text-foreground">Objetivo:</span> <span className="text-muted-foreground">{lead.objetivoPrincipal}</span></div>}
      {lead.engajamento && <div className="flex items-center gap-1.5"><span className="font-medium text-foreground">Engajamento:</span><EngajamentoBadge value={lead.engajamento} /></div>}
      {lead.tempoInteresse && <div><span className="font-medium text-foreground">Tempo de interesse:</span> <span className="text-muted-foreground">{lead.tempoInteresse}</span></div>}
      {lead.comoConheceu && <div><span className="font-medium text-foreground">Como conheceu:</span> <span className="text-muted-foreground">{lead.comoConheceu}</span></div>}
      <div><span className="font-medium text-foreground">Curso:</span> <span className="text-muted-foreground">{CURSO_LEADS_DIRETOS}</span></div>
      {lead.ultimaMensagem && <div><span className="font-medium text-foreground">Última mensagem:</span> <span className="text-muted-foreground">{lead.ultimaMensagem}</span></div>}
      {lead.linkDePagamentoEnviado && (
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">Link pagamento:</span>
          <a href={lead.linkDePagamentoEnviado} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[150px] inline-flex items-center gap-0.5">Abrir <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}
      <div className="pt-1"><span className="font-medium text-foreground block mb-1">Conversa:</span><LeadChatBubbles lead={lead} /></div>
    </div>
  );
}

type FiltroPeriodo = 'hoje' | '7d' | '30d' | 'todos';

const PERIODO_OPCOES: { key: FiltroPeriodo; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'todos', label: 'Tudo' },
];

/** Meia-noite de hoje em America/Sao_Paulo (UTC-3 fixo, sem horario de verao desde 2019). */
function inicioDoDiaSaoPaulo(): number {
  const dataSp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // "YYYY-MM-DD" no fuso de SP
  return new Date(`${dataSp}T03:00:00.000Z`).getTime();
}

function dentroDoPeriodo(criadoEm: string | undefined, periodo: FiltroPeriodo): boolean {
  if (periodo === 'todos' || !criadoEm) return true;
  const quando = new Date(criadoEm).getTime();
  // "Hoje" e' dia civil (desde a meia-noite de SP), nao "ultimas 24h" --
  // senao um lead das 23h de ontem aparece em "Hoje" ate a mesma hora hoje.
  if (periodo === 'hoje') return quando >= inicioDoDiaSaoPaulo();
  const dias = periodo === '7d' ? 7 : 30;
  return quando >= Date.now() - dias * 24 * 60 * 60 * 1000;
}

export function Pipeline({ onEditLead }: PipelineProps) {
  const { user, users, getUserById } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('todos');
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [handoffModal, setHandoffModal] = useState<{ lead: Lead; targetStage: PipelineStage } | null>(null);
  const [handoffObs, setHandoffObs] = useState('');
  const [handoffWarning, setHandoffWarning] = useState(false);

  // Fetch leads directly from supabase
  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('pipeline-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `origem=eq.Direto` }, () => {
        fetchLeads();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('origem', 'Direto')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('Erro ao carregar Leads Diretos:', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível carregar os leads',
        description: error.message,
      });
      return;
    }

    if (data) {
      setLeads(data.map((row) => ({
        ...dbRowToLead(row),
        status: row.status || row.etapa || 'novo',
        responsavel_id: row.responsavel_id,
        prazo: row.prazo,
      })) as any);
    }
  };

  const buscaNormalizada = busca.trim().toLowerCase();

  const leadsFiltrados = leads.filter((lead) => {
    if (!dentroDoPeriodo((lead as any).criadoEm, filtroPeriodo)) return false;
    if (filtroResponsavel === 'sem_responsavel' && (lead as any).responsavel_id) return false;
    if (filtroResponsavel !== 'todos' && filtroResponsavel !== 'sem_responsavel' && (lead as any).responsavel_id !== filtroResponsavel) return false;
    if (buscaNormalizada) {
      const alvo = `${lead.nome ?? ''} ${lead.telefone ?? ''}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  const getLeadsByStage = (stage: string) => {
    return leadsFiltrados.filter((lead) => ((lead as any).status || lead.etapa) === stage);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const openWhatsApp = (phone: string) => window.open(`https://wa.me/55${phone.replace(/\D/g, '')}`, '_blank');

  const handleDeleteLead = async (lead: Lead) => {
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível excluir o lead', description: error.message });
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    toast({ title: 'Lead excluído', description: `${lead.nome} foi removido dos Leads Diretos.` });
  };

  const handleStageChange = async (lead: Lead, newStage: PipelineStage) => {
    if (newStage === 'handoff_rodrygo') {
      if (lead.status !== 'matricula') {
        setHandoffWarning(true);
      }
      setHandoffModal({ lead, targetStage: newStage });
      setHandoffObs('');
      return;
    }
    try {
      await supabase.from('leads').update({ status: newStage }).eq('id', lead.id);
      fetchLeads();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a etapa', description: error?.message || 'Tente novamente.' });
    }
  };

  const confirmHandoff = async () => {
    if (!handoffModal) return;
    try {
      await supabase.from('leads').update({ status: handoffModal.targetStage }).eq('id', handoffModal.lead.id);
      // Notifica o Rodrygo de verdade (antes gravava o user_id de quem estava logado --
      // ou seja, quem fazia o handoff notificava a si mesmo, nunca o Rodrygo).
      if (user) {
        const { data: rodrygo } = await supabase
          .from('profiles')
          .select('id')
          .ilike('nome', '%rodrygo%')
          .limit(1)
          .maybeSingle();
        if (rodrygo) {
          await supabase.rpc('notificar' as any, {
            p_user_id: rodrygo.id,
            p_tipo: 'handoff_rodrygo',
            p_titulo: `Handoff: ${handoffModal.lead.nome}`,
            p_descricao: handoffObs || `Lead transferido por ${user.nome}`,
          });
        }
      }
      fetchLeads();
      toast({ title: 'Handoff confirmado', description: `${handoffModal.lead.nome} foi transferido para Rodrygo.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message });
    }
    setHandoffModal(null);
    setHandoffWarning(false);
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="flex items-center justify-between p-4 lg:p-6 pb-0 flex-shrink-0">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Leads PSI</h1>
      </div>

      {/* Filtros */}
      <div className="px-4 lg:px-6 pt-3 flex flex-col sm:flex-row gap-2 flex-shrink-0">
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          {PERIODO_OPCOES.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFiltroPeriodo(opt.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filtroPeriodo === opt.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border z-[100]">
            <SelectItem value="todos" className="text-xs">Todos os responsáveis</SelectItem>
            <SelectItem value="sem_responsavel" className="text-xs">Sem responsável</SelectItem>
            {users.filter(u => u.ativo).map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-8 text-xs w-full sm:w-56 bg-card"
        />
      </div>

      {/* Overview Section */}
      <div className="px-4 lg:px-6 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {(() => {
          const allLeads = PIPELINE_STAGES.flatMap(s => getLeadsByStage(s.key));
          // Usa o valor real quando o lead ja tem um fechado; senao, o ticket medio estimado.
          const totalValue = allLeads.reduce((soma, l) => soma + (l.valorInvestimento || TICKET_MEDIO_ESTIMADO), 0);
          const leadsEmMatricula = getLeadsByStage('matricula').length;
          const leadsEmNegociacao = getLeadsByStage('negociacao').length;
          const conversionRate = allLeads.length > 0 ? ((leadsEmMatricula / allLeads.length) * 100).toFixed(1) : 0;

          return (
            <>
              <Card className="overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 hover:border-primary/40 transition-all duration-300">
                <div className="p-3 lg:p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs lg:text-sm text-muted-foreground font-medium">Total de Leads</span>
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">{allLeads.length}</p>
                  <p className="text-xs text-muted-foreground">Em {PIPELINE_STAGES.length} estágios</p>
                </div>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-success/10 to-success/5 border-success/20 hover:border-success/40 transition-all duration-300">
                <div className="p-3 lg:p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs lg:text-sm text-muted-foreground font-medium">Taxa de Conversão</span>
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">{conversionRate}%</p>
                  <p className="text-xs text-muted-foreground">{leadsEmMatricula} em matrícula</p>
                </div>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-info/10 to-info/5 border-info/20 hover:border-info/40 transition-all duration-300">
                <div className="p-3 lg:p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs lg:text-sm text-muted-foreground font-medium">Valor em Pipeline</span>
                    <DollarSign className="h-4 w-4 text-info" />
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalValue)}</p>
                  <p className="text-xs text-muted-foreground">{leadsEmNegociacao} em negociação</p>
                </div>
              </Card>
              <Card className="overflow-hidden bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20 hover:border-warning/40 transition-all duration-300">
                <div className="p-3 lg:p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs lg:text-sm text-muted-foreground font-medium">Próximas Ações</span>
                    <Target className="h-4 w-4 text-warning" />
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">{allLeads.filter(l => l.dataProximaAcao && new Date(l.dataProximaAcao) <= new Date()).length}</p>
                  <p className="text-xs text-muted-foreground">Atrasadas ou hoje</p>
                </div>
              </Card>
            </>
          );
        })()}
      </div>

      <div className="flex-1 flex gap-3 lg:gap-4 overflow-x-auto p-3 lg:p-6 pb-4 lg:pb-4 snap-x snap-mandatory lg:snap-none min-h-0">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage.key);
          return (
            <div key={stage.key} className="flex-shrink-0 w-[85vw] sm:w-72 lg:w-80 snap-center lg:snap-align-none">
              <div className={`rounded-t-lg p-2.5 lg:p-3 ${stage.color}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary-foreground text-sm lg:text-base">{stage.label}</span>
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 text-xs">{stageLeads.length}</Badge>
                </div>
              </div>
              <div className="bg-muted/50 rounded-b-lg p-2 lg:p-3 space-y-2 lg:space-y-3 min-h-[50vh] lg:min-h-96 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {stageLeads.map((lead) => {
                  const responsavel = getUserById((lead as any).responsavel_id);
                  const hasProximaAcao = (lead as any).prazo && new Date((lead as any).prazo) <= new Date();
                  const isExpanded = expandedLeadId === lead.id;
                  return (
                    <Card
                      key={lead.id}
                      className={`p-3 lg:p-4 bg-card border-border hover:shadow-md transition-shadow animate-scale-in ${stage.key === 'handoff_rodrygo' ? 'border-l-[3px] border-l-pipeline-handoff' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-2 lg:mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">{lead.nome}</h3>
                          <p className="text-xs lg:text-sm text-muted-foreground truncate">{CURSO_LEADS_DIRETOS}</p>
                          {formatDateTime((lead as any).criadoEm) && (
                            <p className="flex items-center gap-1 text-[10px] lg:text-xs text-muted-foreground/80 mt-0.5">
                              <CalendarClock className="h-3 w-3 flex-shrink-0" />
                              {formatDateTime((lead as any).criadoEm)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {hasProximaAcao && <Clock className="h-4 w-4 text-warning" />}
                          {stage.key === 'handoff_rodrygo' && <Badge className="text-[10px] bg-pipeline-handoff text-primary-foreground border-0">Aguardando Rodrygo</Badge>}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setExpandedLeadId(prev => prev === lead.id ? null : lead.id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="mb-2 lg:mb-3 space-y-1">
                        {lead.valorInvestimento
                          ? <p className="text-base lg:text-lg font-bold text-primary">{formatCurrency(lead.valorInvestimento)}</p>
                          : <p className="text-xs text-muted-foreground">Ticket estimado {formatCurrency(TICKET_MEDIO_ESTIMADO)} <span className="opacity-70">(PIX / cartão / boleto)</span></p>}
                      </div>
                      <div className="flex gap-2 mb-2 lg:mb-3">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={(e) => { e.stopPropagation(); abrirChatWidget(lead.telefone); }}>
                          <MessagesSquare className="h-3 w-3 mr-1 text-primary" />Chat
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={(e) => { e.stopPropagation(); openWhatsApp(lead.telefone); }}>
                          <MessageCircle className="h-3 w-3 mr-1 text-success" />WhatsApp
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 lg:gap-2 mb-2 lg:mb-3">
                        <Badge variant="secondary" className="text-xs">{lead.comoConheceu}</Badge>
                        {lead.engajamento && <EngajamentoBadge value={lead.engajamento} />}
                        {responsavel && <Badge className="text-xs text-primary-foreground" style={{ backgroundColor: responsavel.cor }}>{responsavel.nome.split(' ')[0]}</Badge>}
                      </div>
                      {isExpanded && <LeadExpandedInfo lead={lead} />}
                      <div className="flex items-center gap-2">
                        <Select value={(lead as any).status} onValueChange={(value) => handleStageChange(lead, value as PipelineStage)}>
                          <SelectTrigger className="flex-1 h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border z-[100]" position="popper" sideOffset={4}>
                            {PIPELINE_STAGES.map((s) => (
                              <SelectItem key={s.key} value={s.key} className="text-xs cursor-pointer">
                                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onEditLead(lead); }}><Edit className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border" onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir "{lead.nome}"? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteLead(lead)}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </Card>
                  );
                })}
                {stageLeads.length === 0 && <div className="text-center py-6 lg:py-8 text-muted-foreground text-xs lg:text-sm">Nenhum lead nesta etapa</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Handoff Confirmation Modal */}
      <Dialog open={!!handoffModal} onOpenChange={() => { setHandoffModal(null); setHandoffWarning(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {handoffWarning ? '⚠️ Atenção — Lead sem matrícula' : '🟣 Confirmar Handoff para Rodrygo'}
            </DialogTitle>
          </DialogHeader>
          {handoffWarning && (
            <p className="text-sm text-warning">
              Este lead ainda não está na fase Matrícula. Confirma mover direto para Handoff?
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Lead: <strong>{handoffModal?.lead.nome}</strong>
          </p>
          <Textarea
            placeholder="Observações para o Rodrygo (opcional)"
            value={handoffObs}
            onChange={e => setHandoffObs(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHandoffModal(null); setHandoffWarning(false); }}>Cancelar</Button>
            <Button onClick={confirmHandoff} className="bg-pipeline-handoff hover:bg-pipeline-handoff/90 text-primary-foreground">Confirmar Handoff</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
