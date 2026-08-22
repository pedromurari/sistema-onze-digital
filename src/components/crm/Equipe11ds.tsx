import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, Loader2, Download, Send, ArrowUpRight, AlertTriangle, RefreshCw, Repeat, X, MessageCircle, CheckCircle2, ExternalLink, CalendarDays, ListChecks, ShieldCheck, Clock3, Paperclip, SlidersHorizontal, Brain, ChevronDown, DollarSign, Gift, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type AgenteStatus = 'livre' | 'trabalhando' | 'erro';
type TarefaStatus = 'pendente' | 'em_andamento' | 'aguardando_aprovacao' | 'concluido' | 'erro';
type TarefaTipo = 'post_cliente' | 'avulso' | 'video_roteiro';

type Agente = {
  id: string;
  nome: string;
  cargo: string | null;
  avatar_url: string | null;
  status: AgenteStatus;
  status_texto: string | null;
  executor_function: string;
  slug: string | null;
  responsabilidade: string | null;
  regras: string[] | null;
  aplica: string[] | null;
};

type Time = {
  id: string;
  nome: string;
  emoji: string | null;
  equipe_11ds_agentes: Agente[];
};

type ItemFinanceiro = {
  pagamento_id: string;
  aluno_id: string | null;
  nome: string;
  valor: number;
  telefone: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  numero_parcela: number | null;
  dias_atraso: number | null;
  cobranca_contatado_em: string | null;
};

type MatriculaItem = {
  aluno_id: string;
  nome: string;
  produto: string | null;
  valor: number;
  telefone: string | null;
};

type LeadQuenteItem = MatriculaItem & { contatado_em: string | null };

type DadosFinanceiro = {
  pagosHoje: ItemFinanceiro[];
  inadimplentes: ItemFinanceiro[];
  vencendo7: ItemFinanceiro[];
  vencendo1: ItemFinanceiro[];
  matriculasHoje: MatriculaItem[];
  leadsQuentes: LeadQuenteItem[];
  periodo?: string;
};

type BlocoRoteiro = { order: number; text: string; image_prompt: string; movement_type: string };

type DadosRoteiroVideo = {
  tema: string;
  gancho: string;
  angulo: string;
  justificativa?: string;
  blocos: BlocoRoteiro[];
  video_script_id: string;
  feedback_anterior?: string;
};

type Tarefa = {
  id: string;
  agente_id: string;
  tipo: TarefaTipo;
  cliente_id: string | null;
  ordem_texto: string;
  status: TarefaStatus;
  resposta_texto: string | null;
  anexos: { tipo: string; url: string }[];
  conteudo_post_id: string | null;
  erro_mensagem: string | null;
  created_at: string;
  dados: DadosFinanceiro | DadosRoteiroVideo | null;
};

type Cliente = { id: string; nome: string };

type Recorrente = {
  id: string;
  tipo: TarefaTipo;
  cliente_id: string | null;
  ordem_texto: string;
};

type ChatMensagem = {
  id: string;
  papel: 'usuario' | 'agente' | 'sistema';
  conteudo: string;
  acao_id: string | null;
  plano_id: string | null;
  created_at: string;
};

type PlanoStatus = 'planejada' | 'aguardando_confirmacao' | 'executando' | 'concluida' | 'erro' | 'cancelada';

type Plano = {
  id: string;
  objetivo: string;
  resumo: string;
  status: PlanoStatus;
  alteracoes_previstas: string[];
  efeitos_externos: string[];
  versao_hash: string;
  resultado_resumo: string | null;
  erro_mensagem: string | null;
  created_at: string;
};

type PlanoEtapa = {
  id: string;
  chave: string;
  ordem: number;
  agente_slug: string;
  titulo: string;
  descricao: string;
  ferramenta: string;
  status: 'planejada' | 'aguardando' | 'executando' | 'corrigindo' | 'concluida' | 'erro' | 'cancelada';
  evidencia: string | null;
  erro_mensagem: string | null;
};

const STATUS_LABEL: Record<TarefaStatus, string> = {
  pendente: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando_aprovacao: 'Aguardando aprovação',
  concluido: 'Concluído',
  erro: 'Erro',
};

const STATUS_DOT: Record<TarefaStatus, string> = {
  pendente: 'bg-gray-300',
  em_andamento: 'bg-blue-500 animate-pulse',
  aguardando_aprovacao: 'bg-amber-500',
  concluido: 'bg-emerald-500',
  erro: 'bg-red-500',
};

const STATUS_CHIP: Record<TarefaStatus, string> = {
  pendente: 'bg-gray-100 border-gray-200 text-gray-600',
  em_andamento: 'bg-blue-50 border-blue-200 text-blue-700',
  aguardando_aprovacao: 'bg-amber-50 border-amber-200 text-amber-700',
  concluido: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  erro: 'bg-red-50 border-red-200 text-red-700',
};

function initials(nome: string) {
  return nome.slice(0, 2).toUpperCase();
}

// ── Balão de fala ────────────────────────────────────────────────────────────

function BalaoDeFala({ agente }: { agente: Agente }) {
  const texto = agente.status === 'trabalhando'
    ? (agente.status_texto || 'Trabalhando...')
    : agente.status === 'erro'
      ? 'Deu erro na última tarefa'
      : 'Livre 💤';

  return (
    <div className="relative bg-white border border-border rounded-xl px-3 py-2 text-xs text-foreground shadow-sm max-w-[220px]">
      <span className={cn('inline-block w-2 h-2 rounded-full mr-1.5 align-middle', STATUS_DOT[agente.status === 'trabalhando' ? 'em_andamento' : agente.status === 'erro' ? 'erro' : 'concluido'])} />
      {texto}
      <div className="absolute -bottom-1.5 left-5 w-3 h-3 bg-white border-b border-r border-border rotate-45" />
    </div>
  );
}

// ── Card do agente ───────────────────────────────────────────────────────────

function AgenteCard({ agente, onClick }: { agente: Agente; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-border bg-white hover:shadow-md transition-shadow text-center w-[200px]"
    >
      <BalaoDeFala agente={agente} />
      <div className="relative">
        <Avatar className={cn('h-16 w-16 border-2', agente.status === 'trabalhando' ? 'border-blue-400' : agente.status === 'erro' ? 'border-red-400' : 'border-emerald-300')}>
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold">
            {initials(agente.nome)}
          </AvatarFallback>
        </Avatar>
        <span className={cn('absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white', STATUS_DOT[agente.status === 'trabalhando' ? 'em_andamento' : agente.status === 'erro' ? 'erro' : 'concluido'])} />
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">{agente.nome}</p>
        <p className="text-xs text-muted-foreground">{agente.cargo}</p>
      </div>
    </button>
  );
}

// ── Quadradinho de tarefa ────────────────────────────────────────────────────

function TarefaChip({ tarefa, onClick }: { tarefa: Tarefa; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs font-medium hover:opacity-80 transition-opacity', STATUS_CHIP[tarefa.status])}
      title={tarefa.ordem_texto}
    >
      <span>{tarefa.tipo === 'post_cliente' ? '📝' : '🎨'}</span>
      <span className="max-w-[140px] truncate">{tarefa.ordem_texto}</span>
    </button>
  );
}

// ── Lista financeira interativa ─────────────────────────────────────────────

function whatsappLink(telefone: string) {
  const digitos = telefone.replace(/\D/g, '');
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDdi}`;
}

function ItemFinanceiroRow({ item, comAtraso, onNavigateToAluno, onMarcarContatado }: {
  item: ItemFinanceiro;
  comAtraso: boolean;
  onNavigateToAluno?: (alunoId: string) => void;
  onMarcarContatado: (pagamentoId: string, contatar: boolean) => void;
}) {
  const contatado = Boolean(item.cobranca_contatado_em);
  return (
    <div className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2 text-xs bg-white">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{item.nome}</p>
        <p className="text-muted-foreground">
          {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          {item.numero_parcela ? ` · parcela ${item.numero_parcela}` : ''}
          {comAtraso && item.dias_atraso != null ? ` · ${item.dias_atraso}d atraso` : ''}
          {!comAtraso && item.data_vencimento ? ` · vence ${format(new Date(`${item.data_vencimento}T00:00:00`), 'dd/MM')}` : ''}
        </p>
      </div>
      {item.telefone && (
        <a href={whatsappLink(item.telefone)} target="_blank" rel="noreferrer" title="Chamar no WhatsApp" className="text-emerald-600 hover:opacity-70 flex-shrink-0">
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
      {item.aluno_id && onNavigateToAluno && (
        <button onClick={() => onNavigateToAluno(item.aluno_id!)} title="Ver aluno no Financeiro" className="text-primary hover:opacity-70 flex-shrink-0">
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => onMarcarContatado(item.pagamento_id, !contatado)}
        title={contatado ? 'Já cobrado — clique para desmarcar' : 'Marcar como já cobrado'}
        className={cn('flex-shrink-0', contatado ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-400')}
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ListaMatriculas({ itens, periodo, onNavigateToAluno }: { itens: MatriculaItem[]; periodo?: string; onNavigateToAluno?: (alunoId: string) => void }) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">🎓 Novas matrículas{periodo ? ` — ${periodo}` : ''} ({itens.length})</p>
      <div className="space-y-1.5">
        {itens.map(item => (
          <div key={item.aluno_id} className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2 text-xs bg-white">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{item.nome}</p>
              <p className="text-muted-foreground">
                {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                {item.produto ? ` · ${item.produto}` : ''}
              </p>
            </div>
            {item.telefone && (
              <a href={whatsappLink(item.telefone)} target="_blank" rel="noreferrer" title="Chamar no WhatsApp" className="text-emerald-600 hover:opacity-70 flex-shrink-0">
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
            {onNavigateToAluno && (
              <button onClick={() => onNavigateToAluno(item.aluno_id)} title="Ver aluno no Financeiro" className="text-primary hover:opacity-70 flex-shrink-0">
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListaLeadsQuentes({ itens, periodo, onNavigateToAluno, onMarcarContatado }: {
  itens: LeadQuenteItem[];
  periodo?: string;
  onNavigateToAluno?: (alunoId: string) => void;
  onMarcarContatado: (alunoId: string, contatar: boolean) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">🔥 Leads quentes — cadastraram, não pagaram a 1ª parcela{periodo ? ` (${periodo})` : ''} ({itens.length})</p>
      <div className="space-y-1.5">
        {itens.map(item => {
          const contatado = Boolean(item.contatado_em);
          return (
            <div key={item.aluno_id} className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2 text-xs bg-white">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{item.nome}</p>
                <p className="text-muted-foreground">
                  {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  {item.produto ? ` · ${item.produto}` : ''}
                </p>
              </div>
              {item.telefone && (
                <a href={whatsappLink(item.telefone)} target="_blank" rel="noreferrer" title="Chamar no WhatsApp" className="text-emerald-600 hover:opacity-70 flex-shrink-0">
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              {onNavigateToAluno && (
                <button onClick={() => onNavigateToAluno(item.aluno_id)} title="Ver aluno no Financeiro" className="text-primary hover:opacity-70 flex-shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onMarcarContatado(item.aluno_id, !contatado)}
                title={contatado ? 'Já contatado — clique para desmarcar' : 'Marcar como já contatado'}
                className={cn('flex-shrink-0', contatado ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-400')}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListaFinanceira({ titulo, itens, comAtraso, onNavigateToAluno, onMarcarContatado }: {
  titulo: string;
  itens: ItemFinanceiro[];
  comAtraso: boolean;
  onNavigateToAluno?: (alunoId: string) => void;
  onMarcarContatado: (pagamentoId: string, contatar: boolean) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{titulo} ({itens.length})</p>
      <div className="space-y-1.5">
        {itens.map(item => (
          <ItemFinanceiroRow key={item.pagamento_id} item={item} comAtraso={comAtraso} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={onMarcarContatado} />
        ))}
      </div>
    </div>
  );
}

// ── Linha de producao + conversa do time ────────────────────────────────────
// A ordem dos cargos e' fixa (mesma cadeia do backend em equipe-11ds-executar);
// so vale pra tarefas post_cliente -- tarefas avulsas tem um unico agente, sem
// cadeia pra mostrar como esteira.

const ESTAGIOS_PRODUCAO: { slug: string; label: string; emoji: string }[] = [
  { slug: 'gestor-midia', label: 'Gestor', emoji: '🧭' },
  { slug: 'estrategista-conteudo', label: 'Estrategista', emoji: '🎯' },
  { slug: 'redator-chefe', label: 'Redator', emoji: '✍️' },
  { slug: 'diretor-arte', label: 'Diretor de Arte', emoji: '🎨' },
  { slug: 'nina-producao', label: 'Nina', emoji: '🖼️' },
  { slug: 'curador-conhecimento', label: 'Curador', emoji: '🧠' },
];

type Mensagem = {
  id: string;
  tipo: 'mensagem' | 'alerta' | 'aprovacao';
  conteudo: string;
  created_at: string;
  equipe_11ds_agentes: { nome: string; slug: string | null } | null;
};

const MENSAGEM_ESTILO: Record<Mensagem['tipo'], string> = {
  mensagem: 'bg-white border-border',
  alerta: 'bg-amber-50 border-amber-200',
  aprovacao: 'bg-emerald-50 border-emerald-200',
};

function LinhaDeProducao({ tarefaStatus, mensagens }: { tarefaStatus: TarefaStatus; mensagens: Mensagem[] }) {
  const slugsQueFalaram = new Set(mensagens.map(m => m.equipe_11ds_agentes?.slug).filter(Boolean));
  const ultimoSlug = mensagens.length ? mensagens[mensagens.length - 1].equipe_11ds_agentes?.slug : null;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
      {ESTAGIOS_PRODUCAO.map((estagio, i) => {
        const concluido = slugsQueFalaram.has(estagio.slug);
        const atual = tarefaStatus === 'em_andamento' && estagio.slug === ultimoSlug;
        return (
          <div key={estagio.slug} className="flex items-center flex-shrink-0">
            {i > 0 && <div className={cn('h-px w-3', concluido ? 'bg-emerald-400' : 'bg-border')} />}
            <div className={cn(
              'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg',
              atual ? 'bg-blue-50 ring-1 ring-blue-300' : !concluido ? 'opacity-40' : '',
            )}>
              <span className="text-base leading-none">{estagio.emoji}</span>
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">{estagio.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MensagemThread({ tarefa }: { tarefa: Tarefa }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);

  const loadMensagens = useCallback(async () => {
    const { data, error } = await (supabase.from('equipe_11ds_mensagens' as any) as any)
      .select('id, tipo, conteudo, created_at, equipe_11ds_agentes(nome, slug)')
      .eq('tarefa_id', tarefa.id)
      .order('created_at');
    if (!error) setMensagens((data as any) || []);
  }, [tarefa.id]);

  useEffect(() => {
    loadMensagens();
    const channel = supabase
      .channel(`equipe-11ds-mensagens-${tarefa.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'equipe_11ds_mensagens', filter: `tarefa_id=eq.${tarefa.id}` }, () => loadMensagens())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tarefa.id, loadMensagens]);

  if (mensagens.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {tarefa.tipo === 'post_cliente' && <LinhaDeProducao tarefaStatus={tarefa.status} mensagens={mensagens} />}
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <MessageCircle className="h-3 w-3" /> Conversa do time
      </p>
      <div className="space-y-1.5">
        {mensagens.map(m => (
          <div key={m.id} className={cn('flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs border', MENSAGEM_ESTILO[m.tipo])}>
            <Avatar className="h-6 w-6 flex-shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-[10px] font-semibold">
                {initials(m.equipe_11ds_agentes?.nome ?? '?')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{m.equipe_11ds_agentes?.nome ?? 'Agente'}</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{m.conteudo}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ficha de cargo (responsabilidade fixa + regras + o que aplica) ─────────
// Texto autoral, nao gerado por IA a cada abertura -- estavel e barato de
// renderizar. Padrao pra qualquer agente/time, nao so midia.

function FichaDeCargo({ agente }: { agente: Agente }) {
  if (!agente.responsabilidade && !agente.regras?.length && !agente.aplica?.length) return null;
  return (
    <div className="border border-border rounded-xl p-3 bg-white space-y-2">
      {agente.responsabilidade && <p className="text-sm text-foreground">{agente.responsabilidade}</p>}
      {agente.regras?.length ? (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Nunca quebra</p>
          <ul className="space-y-1">
            {agente.regras.map((r, i) => (
              <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                <span className="text-emerald-600 mt-0.5 flex-shrink-0">✓</span>{r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {agente.aplica?.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {agente.aplica.map((a, i) => (
            <span key={i} className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">📚 {a}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Historico de decisoes do cargo (cross-tarefa, nao so a que esta aberta) ─

type MensagemHistorico = { id: string; tipo: Mensagem['tipo']; conteudo: string; created_at: string };

function HistoricoDecisoes({ agenteId }: { agenteId: string }) {
  const [itens, setItens] = useState<MensagemHistorico[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from('equipe_11ds_mensagens' as any) as any)
      .select('id, tipo, conteudo, created_at')
      .eq('agente_id', agenteId)
      .order('created_at', { ascending: false })
      .limit(8);
    if (!error) setItens((data as any) || []);
  }, [agenteId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`equipe-11ds-historico-${agenteId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'equipe_11ds_mensagens', filter: `agente_id=eq.${agenteId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agenteId, load]);

  if (itens.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Últimas decisões</p>
      <div className="space-y-1.5">
        {itens.map(m => (
          <div key={m.id} className={cn('rounded-lg px-2.5 py-1.5 text-xs border', MENSAGEM_ESTILO[m.tipo])}>
            <p className="text-foreground line-clamp-2">{m.conteudo}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(m.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sugestões de conhecimento (loop de aprendizado do SDR de leads) ─────────
// Quando o SDR de IA não sabe responder algo, ele faz handoff e evo-resposta
// captura a 1a resposta manual de um humano no mesmo WhatsApp como sugestão
// pendente. Aqui um admin revisa (pode editar a redação) e aprova antes dela
// virar conhecimento ativo que leads-ia-responder consulta. Só aparece na
// ficha do agente slug='sdr-leads-idm'.

type SugestaoConhecimento = { id: string; pergunta: string; resposta_humano: string; created_at: string };

function SugestoesConhecimento() {
  const { user } = useAuth();
  const [itens, setItens] = useState<SugestaoConhecimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from('leads_ia_conhecimento_sugestoes' as any) as any)
      .select('id, pergunta, resposta_humano, created_at')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });
    if (!error) setItens((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('leads-ia-conhecimento-sugestoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_ia_conhecimento_sugestoes' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const respostaAtual = (item: SugestaoConhecimento) => edicoes[item.id] ?? item.resposta_humano;

  const aprovar = async (item: SugestaoConhecimento) => {
    const resposta = respostaAtual(item).trim();
    if (!resposta) { toast.error('A resposta não pode ficar vazia.'); return; }
    setSalvandoId(item.id);
    const { error: insertErr } = await (supabase.from('leads_ia_conhecimento' as any) as any).insert({
      pergunta_exemplo: item.pergunta, resposta, origem_sugestao_id: item.id,
    });
    if (insertErr) { toast.error(`Erro ao aprovar: ${insertErr.message}`); setSalvandoId(null); return; }
    await (supabase.from('leads_ia_conhecimento_sugestoes' as any) as any)
      .update({ status: 'aprovado', revisado_por: user?.id ?? null, revisado_em: new Date().toISOString() })
      .eq('id', item.id);
    toast.success('Conhecimento aprovado -- o SDR já vai usar isso nas próximas conversas.');
    setSalvandoId(null);
    setItens(prev => prev.filter(i => i.id !== item.id));
  };

  const rejeitar = async (item: SugestaoConhecimento) => {
    setSalvandoId(item.id);
    await (supabase.from('leads_ia_conhecimento_sugestoes' as any) as any)
      .update({ status: 'rejeitado', revisado_por: user?.id ?? null, revisado_em: new Date().toISOString() })
      .eq('id', item.id);
    setSalvandoId(null);
    setItens(prev => prev.filter(i => i.id !== item.id));
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (itens.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Nenhuma sugestão pendente. Quando o SDR não souber responder algo e um humano resolver pelo WhatsApp, a sugestão aparece aqui.</p>;
  }

  return (
    <div className="space-y-3">
      {itens.map(item => (
        <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pergunta do lead</p>
            <p className="text-sm text-foreground">{item.pergunta}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Como o time respondeu (edite se quiser antes de aprovar)</p>
            <Textarea
              value={respostaAtual(item)}
              onChange={(event) => setEdicoes(prev => ({ ...prev, [item.id]: event.target.value }))}
              className="mt-1 min-h-[64px] text-sm bg-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={salvandoId === item.id} onClick={() => rejeitar(item)}>Rejeitar</Button>
            <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" disabled={salvandoId === item.id} onClick={() => aprovar(item)}>
              {salvandoId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aprovar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Oferta ativa do SDR de leads (preço/parcelas/bônus) ──────────────────────
// leads-ia-responder lê essa tabela a cada resposta pra montar o preço e o
// stack de bônus que a IA apresenta -- nada fica hardcoded no prompt, então
// quando a promoção mudar (ela muda com frequência) basta editar aqui, sem
// precisar de deploy. Só aparece na ficha do agente slug='sdr-leads-idm'.

// Flag de ativo/inativo do SDR de IA (leads_ia_config, singleton) -- desligado
// vira early-return em evo-resposta (não cria lead Direto/aciona o SDR) e em
// leads-ia-followup (não processa cutucada nem lembrete). Código intacto,
// só para de agir -- religa a qualquer momento voltando a marcar ativo.
function SdrAtivoToggle() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads_ia_config' as any).select('ativo').eq('id', 'default').maybeSingle();
    setAtivo(((data as any)?.ativo) ?? true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(v: boolean) {
    setSalvando(true);
    const { error } = await supabase.from('leads_ia_config' as any).update({ ativo: v } as any).eq('id', 'default');
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setAtivo(v);
    toast.success(v ? 'SDR de IA reativado' : 'SDR de IA desativado -- atendimento passa a ser 100% manual');
  }

  if (ativo === null) return null;

  return (
    <div className={cn('flex items-center justify-between rounded-xl border p-3', ativo ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-white')}>
      <div>
        <p className="text-sm font-medium">{ativo ? 'SDR de IA ativo' : 'SDR de IA desativado'}</p>
        <p className="text-xs text-muted-foreground">
          {ativo
            ? 'Responde leads novos do anúncio automaticamente.'
            : 'Não responde mais nenhum lead -- atendimento é 100% humano (vendedores).'}
        </p>
      </div>
      <Switch checked={ativo} disabled={salvando} onCheckedChange={toggle} />
    </div>
  );
}

type OfertaBonusItem = { nome: string; valor: string; limitado: string };
type OfertaAtivaRow = {
  id: string;
  preco_avista: number;
  cartao_parcelas: number;
  cartao_valor_parcela: number;
  boleto_entrada: number;
  boleto_parcelas: number;
  boleto_valor_parcela: number;
  valor_total_bonus: number | null;
  bonus: { nome: string; valor: number; limitado: string | null }[];
};

function OfertaAtivaEditor() {
  const [row, setRow] = useState<OfertaAtivaRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [precoAvista, setPrecoAvista] = useState('');
  const [cartaoParcelas, setCartaoParcelas] = useState('');
  const [cartaoValorParcela, setCartaoValorParcela] = useState('');
  const [boletoEntrada, setBoletoEntrada] = useState('');
  const [boletoParcelas, setBoletoParcelas] = useState('');
  const [boletoValorParcela, setBoletoValorParcela] = useState('');
  const [valorTotalBonus, setValorTotalBonus] = useState('');
  const [bonusItens, setBonusItens] = useState<OfertaBonusItem[]>([]);

  const carregarNoForm = (data: OfertaAtivaRow) => {
    setPrecoAvista(String(data.preco_avista ?? ''));
    setCartaoParcelas(String(data.cartao_parcelas ?? ''));
    setCartaoValorParcela(String(data.cartao_valor_parcela ?? ''));
    setBoletoEntrada(String(data.boleto_entrada ?? ''));
    setBoletoParcelas(String(data.boleto_parcelas ?? ''));
    setBoletoValorParcela(String(data.boleto_valor_parcela ?? ''));
    setValorTotalBonus(data.valor_total_bonus != null ? String(data.valor_total_bonus) : '');
    setBonusItens((data.bonus ?? []).map(b => ({ nome: b.nome, valor: String(b.valor), limitado: b.limitado ?? '' })));
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from('leads_ia_oferta_ativa' as any) as any)
      .select('id, preco_avista, cartao_parcelas, cartao_valor_parcela, boleto_entrada, boleto_parcelas, boleto_valor_parcela, valor_total_bonus, bonus')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      setRow(data as any);
      carregarNoForm(data as any);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBonus = () => setBonusItens(prev => [...prev, { nome: '', valor: '', limitado: '' }]);
  const removeBonus = (idx: number) => setBonusItens(prev => prev.filter((_, i) => i !== idx));
  const updateBonus = (idx: number, patch: Partial<OfertaBonusItem>) =>
    setBonusItens(prev => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));

  const salvar = async () => {
    const numPrecoAvista = Number(precoAvista.replace(',', '.'));
    const numCartaoParcelas = parseInt(cartaoParcelas, 10);
    const numCartaoValorParcela = Number(cartaoValorParcela.replace(',', '.'));
    const numBoletoEntrada = Number(boletoEntrada.replace(',', '.'));
    const numBoletoParcelas = parseInt(boletoParcelas, 10);
    const numBoletoValorParcela = Number(boletoValorParcela.replace(',', '.'));
    if ([numPrecoAvista, numCartaoParcelas, numCartaoValorParcela, numBoletoEntrada, numBoletoParcelas, numBoletoValorParcela].some(n => Number.isNaN(n))) {
      toast.error('Confira os valores de preço e parcelas -- tem algum campo numérico inválido.');
      return;
    }
    const bonusValidos = bonusItens
      .filter(b => b.nome.trim())
      .map(b => ({ nome: b.nome.trim(), valor: Number(b.valor.replace(',', '.')) || 0, limitado: b.limitado.trim() || null }));

    const payload = {
      preco_avista: numPrecoAvista,
      cartao_parcelas: numCartaoParcelas,
      cartao_valor_parcela: numCartaoValorParcela,
      boleto_entrada: numBoletoEntrada,
      boleto_parcelas: numBoletoParcelas,
      boleto_valor_parcela: numBoletoValorParcela,
      valor_total_bonus: valorTotalBonus.trim() ? Number(valorTotalBonus.replace(',', '.')) : null,
      bonus: bonusValidos,
      updated_at: new Date().toISOString(),
    };

    setSalvando(true);
    const { error } = row
      ? await (supabase.from('leads_ia_oferta_ativa' as any) as any).update(payload).eq('id', row.id)
      : await (supabase.from('leads_ia_oferta_ativa' as any) as any).insert({ ...payload, ativo: true });
    setSalvando(false);
    if (error) { toast.error(`Erro ao salvar oferta: ${error.message}`); return; }
    toast.success('Oferta atualizada -- o SDR já usa esses valores na próxima resposta.');
    load();
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Preço, parcelas e bônus que o SDR de IA apresenta pro lead. Atualize aqui sempre que a promoção mudar -- não precisa de deploy, a próxima resposta da IA já usa os valores novos.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Preço à vista (R$)</label>
          <Input value={precoAvista} onChange={e => setPrecoAvista(e.target.value)} placeholder="997,00" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Parcelas cartão</label>
          <Input value={cartaoParcelas} onChange={e => setCartaoParcelas(e.target.value)} placeholder="12" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valor da parcela (cartão)</label>
          <Input value={cartaoValorParcela} onChange={e => setCartaoValorParcela(e.target.value)} placeholder="109,40" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Entrada boleto (R$)</label>
          <Input value={boletoEntrada} onChange={e => setBoletoEntrada(e.target.value)} placeholder="110,00" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Parcelas boleto</label>
          <Input value={boletoParcelas} onChange={e => setBoletoParcelas(e.target.value)} placeholder="14" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valor da parcela (boleto)</label>
          <Input value={boletoValorParcela} onChange={e => setBoletoValorParcela(e.target.value)} placeholder="110,00" className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valor total em bônus (R$, opcional)</label>
          <Input value={valorTotalBonus} onChange={e => setValorTotalBonus(e.target.value)} placeholder="2247,00" className="mt-1 h-8 text-sm" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Gift className="h-3.5 w-3.5 text-emerald-600" /> Bônus da matrícula
          </label>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={addBonus}>
            <Plus className="h-3.5 w-3.5" /> Adicionar bônus
          </Button>
        </div>
        <div className="space-y-2">
          {bonusItens.length === 0 && <p className="text-xs text-muted-foreground">Nenhum bônus cadastrado.</p>}
          {bonusItens.map((b, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input value={b.nome} onChange={e => updateBonus(idx, { nome: e.target.value })} placeholder="Nome do bônus" className="h-8 flex-1 text-sm" />
              <Input value={b.valor} onChange={e => updateBonus(idx, { valor: e.target.value })} placeholder="Valor R$" className="h-8 w-24 text-sm" />
              <Input value={b.limitado} onChange={e => updateBonus(idx, { limitado: e.target.value })} placeholder="Limite (opcional)" className="h-8 w-40 text-sm" />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => removeBonus(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" disabled={salvando} onClick={salvar}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
          Salvar oferta
        </Button>
      </div>
    </div>
  );
}

// ── Detalhe da tarefa ────────────────────────────────────────────────────────

function TarefaDetalhe({ tarefa, onNavigateToPosts, onNavigateToAluno }: { tarefa: Tarefa; onNavigateToPosts?: () => void; onNavigateToAluno?: (alunoId: string) => void }) {
  const [dados, setDados] = useState(tarefa.dados);
  useEffect(() => { setDados(tarefa.dados); }, [tarefa.dados]);

  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajusteTexto, setAjusteTexto] = useState('');
  const [processandoRoteiro, setProcessandoRoteiro] = useState(false);

  const aprovarVideo = async () => {
    setProcessandoRoteiro(true);
    const { data, error } = await supabase.functions.invoke('equipe-11ds-roteiro-executar', { body: { tarefa_id: tarefa.id, acao: 'aprovar' } });
    setProcessandoRoteiro(false);
    if (error || !(data as any)?.ok) { toast.error(`Erro ao aprovar: ${error?.message ?? (data as any)?.error ?? 'sem resposta'}`); return; }
    toast.success('Roteiro aprovado -- o vídeo entrou na fila de produção.');
  };

  const pedirAjusteVideo = async () => {
    if (!ajusteTexto.trim()) { toast.error('Descreva o ajuste pedido.'); return; }
    setProcessandoRoteiro(true);
    const { data, error } = await supabase.functions.invoke('equipe-11ds-roteiro-executar', { body: { tarefa_id: tarefa.id, acao: 'ajustar', feedback: ajusteTexto.trim() } });
    setProcessandoRoteiro(false);
    if (error || !(data as any)?.ok) { toast.error(`Erro ao pedir ajuste: ${error?.message ?? (data as any)?.error ?? 'sem resposta'}`); return; }
    setAjusteTexto('');
    setAjusteAberto(false);
    toast.success('Ajuste pedido -- o Roteirista está reescrevendo.');
  };

  const marcarContatado = async (pagamentoId: string, contatar: boolean) => {
    const valor = contatar ? new Date().toISOString() : null;
    const { error } = await supabase.from('pagamentos').update({ cobranca_contatado_em: valor }).eq('id', pagamentoId);
    if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
    setDados(prev => {
      if (!prev || !('matriculasHoje' in prev)) return prev;
      const atualizarLista = (lista: ItemFinanceiro[]) => lista.map(i => i.pagamento_id === pagamentoId ? { ...i, cobranca_contatado_em: valor } : i);
      return {
        ...prev,
        pagosHoje: atualizarLista(prev.pagosHoje),
        inadimplentes: atualizarLista(prev.inadimplentes),
        vencendo7: atualizarLista(prev.vencendo7),
        vencendo1: atualizarLista(prev.vencendo1),
      };
    });
  };

  const marcarLeadContatado = async (alunoId: string, contatar: boolean) => {
    const valor = contatar ? new Date().toISOString() : null;
    const { error } = await supabase.from('alunos').update({ lead_quente_contatado_em: valor }).eq('id', alunoId);
    if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
    setDados(prev => {
      if (!prev || !('matriculasHoje' in prev)) return prev;
      return {
        ...prev,
        leadsQuentes: (prev.leadsQuentes ?? []).map(i => i.aluno_id === alunoId ? { ...i, contatado_em: valor } : i),
      };
    });
  };
  return (
    <div className="border border-border rounded-xl p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={STATUS_CHIP[tarefa.status]}>{STATUS_LABEL[tarefa.status]}</Badge>
        <span className="text-[11px] text-muted-foreground">{format(new Date(tarefa.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
      </div>
      <p className="text-sm text-foreground"><span className="font-medium">Ordem:</span> {tarefa.ordem_texto}</p>
      {tarefa.status === 'em_andamento' && (
        <p className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Trabalhando nisso...</p>
      )}
      {tarefa.status === 'erro' && (
        <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {tarefa.erro_mensagem}</p>
      )}
      {tarefa.resposta_texto && (
        <p className="text-sm text-foreground bg-white border border-border rounded-lg p-2 whitespace-pre-wrap">{tarefa.resposta_texto}</p>
      )}
      <MensagemThread tarefa={tarefa} />
      {dados && 'matriculasHoje' in dados && (
        <div className="space-y-3 pt-1">
          <ListaMatriculas itens={dados.matriculasHoje ?? []} periodo={dados.periodo} onNavigateToAluno={onNavigateToAluno} />
          <ListaLeadsQuentes itens={dados.leadsQuentes ?? []} periodo={dados.periodo} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarLeadContatado} />
          <ListaFinanceira titulo={`💰 Pagamentos recebidos${dados.periodo ? ` — ${dados.periodo}` : ' de hoje'}`} itens={dados.pagosHoje ?? []} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="⚠️ Inadimplentes" itens={dados.inadimplentes ?? []} comAtraso={true} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="🔔 Vencendo em 7 dias" itens={dados.vencendo7 ?? []} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="🔴 Vencendo amanhã" itens={dados.vencendo1 ?? []} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
        </div>
      )}
      {dados && 'video_script_id' in dados && (
        <div className="space-y-2.5 pt-1">
          <div className="text-xs text-foreground bg-white border border-border rounded-lg p-2.5 space-y-1.5">
            <p><span className="font-medium">Gancho:</span> {dados.gancho}</p>
            <p><span className="font-medium">Ângulo:</span> {dados.angulo}</p>
            {dados.feedback_anterior && <p className="text-muted-foreground"><span className="font-medium">Último ajuste pedido:</span> {dados.feedback_anterior}</p>}
          </div>
          <div className="space-y-1.5">
            {dados.blocos.map((b, i) => (
              <div key={i} className="text-xs bg-white border border-border rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Cena {i + 1} · {b.movement_type}</p>
                <p className="text-foreground">{b.text}</p>
              </div>
            ))}
          </div>
          {tarefa.status === 'aguardando_aprovacao' && (
            <div className="space-y-2 pt-1">
              {ajusteAberto ? (
                <div className="space-y-2">
                  <Textarea value={ajusteTexto} onChange={e => setAjusteTexto(e.target.value)} placeholder="O que precisa mudar no roteiro?" rows={2} className="text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={processandoRoteiro} onClick={pedirAjusteVideo} className="gap-1.5">
                      {processandoRoteiro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Enviar ajuste
                    </Button>
                    <Button size="sm" variant="outline" disabled={processandoRoteiro} onClick={() => { setAjusteAberto(false); setAjusteTexto(''); }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" disabled={processandoRoteiro} onClick={aprovarVideo} className="gap-1.5">
                    {processandoRoteiro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar e gerar vídeo
                  </Button>
                  <Button size="sm" variant="outline" disabled={processandoRoteiro} onClick={() => setAjusteAberto(true)}>Pedir ajuste</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {tarefa.anexos?.filter(a => a.tipo === 'imagem').map((a, i) => (
        <div key={i} className="relative">
          <img src={a.url} alt="Gerado pelo agente" className="rounded-lg border border-border max-h-64 w-full object-cover" />
          <a href={a.url} download target="_blank" rel="noreferrer" className="absolute top-2 right-2 bg-white/90 rounded-md p-1.5 hover:bg-white">
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      ))}
      {tarefa.conteudo_post_id && onNavigateToPosts && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onNavigateToPosts}>
          Ver na aba Post <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── Painel do agente ─────────────────────────────────────────────────────────

function AgentePanel({ agente, onClose, onNavigateToPosts, onNavigateToAluno }: { agente: Agente; onClose: () => void; onNavigateToPosts?: () => void; onNavigateToAluno?: (alunoId: string) => void }) {
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [tipo, setTipo] = useState<TarefaTipo>('avulso');
  const [clienteId, setClienteId] = useState<string>('');
  const [ordemTexto, setOrdemTexto] = useState('');
  const [repetirDiariamente, setRepetirDiariamente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [chatMensagens, setChatMensagens] = useState<ChatMensagem[]>([]);
  const [planoAtivo, setPlanoAtivo] = useState<Plano | null>(null);
  const [etapasPlano, setEtapasPlano] = useState<PlanoEtapa[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(false);
  const [confirmandoPlano, setConfirmandoPlano] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [referencias, setReferencias] = useState<{ nome: string; url: string }[]>([]);
  const [enviandoReferencia, setEnviandoReferencia] = useState(false);

  const loadTarefas = useCallback(async () => {
    const { data, error } = await (supabase.from('equipe_11ds_tarefas' as any) as any)
      .select('id, agente_id, tipo, cliente_id, ordem_texto, status, resposta_texto, anexos, conteudo_post_id, erro_mensagem, created_at, dados')
      .eq('agente_id', agente.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { toast.error(`Erro ao carregar tarefas: ${error.message}`); return; }
    setTarefas((data as any) || []);
  }, [agente.id]);

  const loadRecorrentes = useCallback(async () => {
    const { data, error } = await (supabase.from('equipe_11ds_recorrentes' as any) as any)
      .select('id, tipo, cliente_id, ordem_texto')
      .eq('agente_id', agente.id)
      .eq('ativo', true)
      .order('created_at');
    if (error) { toast.error(`Erro ao carregar tarefas recorrentes: ${error.message}`); return; }
    setRecorrentes((data as any) || []);
  }, [agente.id]);

  const loadChat = useCallback(async () => {
    if (!user?.id) return;
    setCarregandoChat(true);
    const [mensagensResult, planosResult] = await Promise.all([
      (supabase.from('equipe_11ds_chat_mensagens' as any) as any)
        .select('id, papel, conteudo, acao_id, plano_id, created_at')
        .eq('agente_id', agente.id)
        .eq('solicitante_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50),
      (supabase.from('equipe_11ds_planos' as any) as any)
        .select('id, objetivo, resumo, status, alteracoes_previstas, efeitos_externos, versao_hash, resultado_resumo, erro_mensagem, created_at')
        .eq('agente_responsavel_id', agente.id)
        .eq('solicitante_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (mensagensResult.error) toast.error(`Erro ao carregar conversa: ${mensagensResult.error.message}`);
    else setChatMensagens((mensagensResult.data as ChatMensagem[]) || []);
    if (planosResult.error) {
      toast.error(`Erro ao carregar plano: ${planosResult.error.message}`);
      setPlanoAtivo(null);
      setEtapasPlano([]);
    } else {
      const plano = ((planosResult.data as Plano[]) || [])[0] ?? null;
      setPlanoAtivo(plano);
      if (plano) {
        const { data: etapas, error: etapasError } = await (supabase.from('equipe_11ds_plano_etapas' as any) as any)
          .select('id, chave, ordem, agente_slug, titulo, descricao, ferramenta, status, evidencia, erro_mensagem')
          .eq('plano_id', plano.id)
          .order('ordem');
        if (etapasError) toast.error(`Erro ao carregar etapas: ${etapasError.message}`);
        else setEtapasPlano((etapas as PlanoEtapa[]) || []);
      } else setEtapasPlano([]);
    }
    setCarregandoChat(false);
  }, [agente.id, user?.id]);

  useEffect(() => {
    loadTarefas();
    loadRecorrentes();
    supabase.from('conteudo_clientes' as any).select('id, nome').order('nome')
      .then(({ data }) => setClientes((data as any) || []));
  }, [loadTarefas, loadRecorrentes]);

  useEffect(() => { loadChat(); }, [loadChat]);

  useEffect(() => {
    if (planoAtivo?.status !== 'executando') return;
    const timer = window.setInterval(() => {
      loadChat();
      loadTarefas();
    }, 2200);
    return () => window.clearInterval(timer);
  }, [planoAtivo?.status, loadChat, loadTarefas]);

  useEffect(() => {
    const channel = supabase
      .channel(`equipe_11ds_tarefas_${agente.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe_11ds_tarefas', filter: `agente_id=eq.${agente.id}` }, () => {
        loadTarefas();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agente.id, loadTarefas]);

  const solicitarPlano = async (mensagemRecebida?: string, contextoForcado?: Partial<{ tipo: TarefaTipo; cliente_id: string | null; repetir_diariamente: boolean }>) => {
    const mensagem = (mensagemRecebida ?? ordemTexto).trim();
    if (!mensagem) return;
    const tipoDoPlano = contextoForcado?.tipo ?? tipo;
    const clienteDoPlano = contextoForcado?.cliente_id ?? (tipoDoPlano === 'post_cliente' ? clienteId : null);
    if (tipoDoPlano === 'post_cliente' && !clienteDoPlano) { toast.error('Selecione o cliente'); return; }
    if (planoAtivo && ['aguardando_confirmacao', 'executando'].includes(planoAtivo.status)) {
      toast.error('Este agente já tem um plano aguardando confirmação ou em execução.');
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('equipe-11ds-orquestrador', {
      body: {
        operacao: 'planejar',
        agente_id: agente.id,
        mensagem,
        contexto: {
          tipo: tipoDoPlano,
          cliente_id: clienteDoPlano,
          repetir_diariamente: contextoForcado?.repetir_diariamente ?? repetirDiariamente,
          referencias,
          memoria_explicita: referencias.length > 0,
        },
      },
    });
    setEnviando(false);
    if (error || !(data as any)?.ok) {
      toast.error(`Erro ao montar o plano: ${error?.message ?? (data as any)?.error ?? 'sem resposta'}`);
      return;
    }
    setOrdemTexto('');
    setReferencias([]);
    setPlanoAtivo((data as any)?.plano as Plano);
    setEtapasPlano(((data as any)?.etapas as PlanoEtapa[]) ?? []);
    toast.info('Plano pronto. Revise tudo e confirme uma vez para executar.');
    await loadChat();
  };

  const enviarOrdem = () => solicitarPlano();

  const anexarReferencia = async (arquivo: File) => {
    if (!user?.id) return;
    if (!arquivo.type.startsWith('image/')) {
      toast.error('A referência precisa ser uma imagem.');
      return;
    }
    setEnviandoReferencia(true);
    const nomeSeguro = arquivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const caminho = `${user.id}/${Date.now()}-${nomeSeguro}`;
    const { error } = await supabase.storage.from('equipe-11ds-referencias').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    setEnviandoReferencia(false);
    if (error) {
      toast.error(`Erro ao anexar referência: ${error.message}`);
      return;
    }
    const url = supabase.storage.from('equipe-11ds-referencias').getPublicUrl(caminho).data.publicUrl;
    setReferencias(prev => [...prev, { nome: arquivo.name, url }].slice(0, 5));
    toast.success('Referência anexada. Ela será guardada com a orientação após sua confirmação.');
  };

  const tratarPlano = async (operacao: 'confirmar' | 'cancelar') => {
    if (!planoAtivo || planoAtivo.status !== 'aguardando_confirmacao') return;
    setConfirmandoPlano(true);
    const { data, error } = await supabase.functions.invoke('equipe-11ds-orquestrador', {
      body: { operacao, agente_id: agente.id, plano_id: planoAtivo.id, versao_hash: planoAtivo.versao_hash },
    });
    setConfirmandoPlano(false);
    if (error || !(data as any)?.ok) {
      toast.error(`Não foi possível ${operacao === 'confirmar' ? 'executar' : 'cancelar'}: ${error?.message ?? (data as any)?.error ?? 'sem resposta'}`);
      await loadChat();
      return;
    }
    if (operacao === 'confirmar') {
      setRepetirDiariamente(false);
      toast.success((data as any)?.resposta ?? 'Plano confirmado. A equipe iniciou a execução.');
    } else toast.success('Plano cancelado. Nada foi executado.');
    await Promise.all([loadChat(), loadTarefas(), loadRecorrentes()]);
  };

  const removerRecorrente = async (id: string) => {
    const { error } = await (supabase.from('equipe_11ds_recorrentes' as any) as any).update({ ativo: false }).eq('id', id);
    if (error) { toast.error(`Erro ao remover recorrente: ${error.message}`); return; }
    setRecorrentes(prev => prev.filter(r => r.id !== id));
    toast.success('Tarefa recorrente removida.');
  };

  const grupos: { status: TarefaStatus; label: string }[] = [
    { status: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
    { status: 'em_andamento', label: 'Em andamento' },
    { status: 'pendente', label: 'A fazer' },
    { status: 'concluido', label: 'Concluído' },
    { status: 'erro', label: 'Erro' },
  ];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold">
                {initials(agente.nome)}
              </AvatarFallback>
            </Avatar>
            <div className="text-left flex-1">
              <SheetTitle>{agente.nome}</SheetTitle>
              <p className="text-xs text-muted-foreground">{agente.cargo}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
              {agente.slug === 'gestor-midia' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={enviando || Boolean(planoAtivo && ['aguardando_confirmacao', 'executando'].includes(planoAtivo.status))}
                  onClick={() => solicitarPlano('Gere o calendário editorial dos próximos 7 dias para todos os clientes ativos, sem sobrescrever dias já produzidos.', { tipo: 'avulso', cliente_id: null, repetir_diariamente: false })}
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Gerar calendário
                </Button>
              )}
              {['gestor-midia', 'nina-producao'].includes(agente.slug ?? '') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={enviando || Boolean(planoAtivo && ['aguardando_confirmacao', 'executando'].includes(planoAtivo.status))}
                  onClick={() => solicitarPlano('Gere o próximo post premium para os clientes ativos, mantendo a alternância entre cartão tipográfico e fotografia cinematográfica em 1350x1050.', { tipo: 'avulso', cliente_id: null, repetir_diariamente: false })}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Gerar próximo post
                </Button>
              )}
          </div>
          <div className="mt-2">
            <BalaoDeFala agente={agente} />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold">Conversa com {agente.nome}</p>
                  <p className="text-[11px] text-muted-foreground">Você pede em linguagem natural. A equipe monta o plano e só age depois da sua confirmação.</p>
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {carregandoChat && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                {!carregandoChat && chatMensagens.length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">Peça algo do seu jeito. Ex.: “gere o próximo post”.</p>
                )}
                {chatMensagens.map(mensagem => (
                  <div
                    key={mensagem.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-line',
                      mensagem.papel === 'usuario'
                        ? 'ml-8 bg-slate-900 text-white'
                        : mensagem.papel === 'sistema'
                          ? 'border border-amber-200 bg-amber-50 text-amber-900'
                          : 'mr-8 border bg-background text-foreground',
                    )}
                  >
                    {mensagem.conteudo}
                  </div>
                ))}
              </div>
              {planoAtivo && (
                <div className={cn(
                  'overflow-hidden rounded-xl border bg-white shadow-sm',
                  planoAtivo.status === 'erro' ? 'border-red-200' :
                    planoAtivo.status === 'concluida' ? 'border-emerald-200' :
                      planoAtivo.status === 'executando' ? 'border-blue-200' :
                        planoAtivo.status === 'aguardando_confirmacao' ? 'border-amber-300' : 'border-slate-200',
                )}>
                  <div className="border-b border-slate-100 bg-slate-950 px-3 py-3 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Plano de execução</p>
                          <p className="mt-0.5 text-sm font-semibold leading-snug">{planoAtivo.resumo}</p>
                        </div>
                      </div>
                      <Badge className={cn(
                        'shrink-0 border-0 text-[10px]',
                        planoAtivo.status === 'aguardando_confirmacao' && 'bg-amber-400 text-slate-950',
                        planoAtivo.status === 'executando' && 'bg-blue-500 text-white',
                        planoAtivo.status === 'concluida' && 'bg-emerald-500 text-white',
                        planoAtivo.status === 'erro' && 'bg-red-500 text-white',
                        planoAtivo.status === 'cancelada' && 'bg-slate-600 text-white',
                      )}>
                        {planoAtivo.status === 'aguardando_confirmacao' ? 'Aguardando confirmação' :
                          planoAtivo.status === 'executando' ? 'Em execução' :
                            planoAtivo.status === 'concluida' ? 'Concluído' :
                              planoAtivo.status === 'erro' ? 'Interrompido' :
                                planoAtivo.status === 'cancelada' ? 'Cancelado' : 'Planejado'}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    <div className="space-y-2">
                      {etapasPlano.map(etapa => (
                        <div key={etapa.id} className="grid grid-cols-[22px_1fr] gap-2">
                          <div className={cn(
                            'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold',
                            etapa.status === 'concluida' ? 'border-emerald-500 bg-emerald-500 text-white' :
                              etapa.status === 'executando' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                                etapa.status === 'erro' ? 'border-red-500 bg-red-50 text-red-700' :
                                  'border-slate-300 bg-white text-slate-500',
                          )}>
                            {etapa.status === 'concluida' ? '✓' : etapa.status === 'executando' ? <Loader2 className="h-3 w-3 animate-spin" /> : etapa.ordem}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-800">{etapa.titulo}</p>
                              <span className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{etapa.agente_slug.replace(/-/g, ' ')}</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-500">{etapa.descricao}</p>
                            {etapa.evidencia && <p className="mt-1 text-[11px] text-emerald-700">Evidência: {etapa.evidencia}</p>}
                            {etapa.erro_mensagem && <p className="mt-1 text-[11px] text-red-600">{etapa.erro_mensagem}</p>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {planoAtivo.status === 'aguardando_confirmacao' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                          <ShieldCheck className="h-3.5 w-3.5" /> Uma confirmação libera o plano inteiro
                        </div>
                        {planoAtivo.efeitos_externos.length > 0 && (
                          <ul className="mt-1.5 space-y-1 pl-4 text-[11px] text-amber-900 list-disc">
                            {planoAtivo.efeitos_externos.map((efeito, index) => <li key={index}>{efeito}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                    {planoAtivo.status === 'executando' && (
                      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-medium text-blue-800">
                        <Clock3 className="h-3.5 w-3.5 animate-pulse" /> A equipe está trabalhando. O progresso atualiza automaticamente.
                      </div>
                    )}
                    {planoAtivo.resultado_resumo && <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">{planoAtivo.resultado_resumo}</p>}
                    {planoAtivo.erro_mensagem && <p className="rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{planoAtivo.erro_mensagem}</p>}

                    {planoAtivo.status === 'aguardando_confirmacao' && (
                      <div className="flex justify-end gap-2 pt-1">
                        <Button size="sm" variant="ghost" disabled={confirmandoPlano} onClick={() => tratarPlano('cancelar')}>Cancelar</Button>
                        <Button size="sm" className="gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={confirmandoPlano} onClick={() => tratarPlano('confirmar')}>
                          {confirmandoPlano ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirmar plano inteiro
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <details className="group rounded-xl border border-border bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700">
                <Brain className="h-3.5 w-3.5 text-amber-600" />
                Como este agente trabalha e o que já decidiu
                <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-border p-3">
                <FichaDeCargo agente={agente} />
                <HistoricoDecisoes agenteId={agente.id} />
              </div>
            </details>
            {agente.slug === 'sdr-leads-idm' && (
              <>
                <SdrAtivoToggle />
                <details className="group rounded-xl border border-border bg-white" open>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    Oferta ativa (preço e bônus)
                    <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border p-3">
                    <OfertaAtivaEditor />
                  </div>
                </details>
                <details className="group rounded-xl border border-border bg-white" open>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Sugestões de conhecimento pra aprovar
                    <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border p-3">
                    <SugestoesConhecimento />
                  </div>
                </details>
              </>
            )}
            <details className="group rounded-xl border border-border bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700">
                <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                Atividade e entregas anteriores
                <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-border p-3">
            {recorrentes.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> Tarefas recorrentes ({recorrentes.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {recorrentes.map(r => (
                    <div key={r.id} className="flex items-center gap-1.5 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg pl-2.5 pr-1 py-1.5 text-xs font-medium">
                      <span>{r.tipo === 'post_cliente' ? '📝' : '🎨'}</span>
                      <span className="max-w-[140px] truncate" title={r.ordem_texto}>{r.ordem_texto}</span>
                      <button onClick={() => removerRecorrente(r.id)} className="hover:opacity-70" title="Remover">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {grupos.map(g => {
              const items = tarefas.filter(t => t.status === g.status);
              if (items.length === 0) return null;
              return (
                <div key={g.status}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{g.label} ({items.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map(t => (
                      <TarefaChip key={t.id} tarefa={t} onClick={() => setSelecionada(selecionada === t.id ? null : t.id)} />
                    ))}
                  </div>
                  {items.filter(t => t.id === selecionada).map(t => (
                    <div key={t.id} className="mt-2">
                      <TarefaDetalhe tarefa={t} onNavigateToPosts={onNavigateToPosts} onNavigateToAluno={onNavigateToAluno} />
                    </div>
                  ))}
                </div>
              );
            })}
            {tarefas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa ainda. Dê uma ordem abaixo.</p>
            )}
              </div>
            </details>
          </div>
        </ScrollArea>

        <div className="space-y-2 border-t border-border bg-white p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.06)]">
          {referencias.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {referencias.map(referencia => (
                <span key={referencia.url} className="flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="max-w-[230px] truncate">{referencia.nome}</span>
                  <button type="button" aria-label={`Remover ${referencia.nome}`} onClick={() => setReferencias(prev => prev.filter(item => item.url !== referencia.url))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <input
              id={`referencia-${agente.id}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const arquivo = event.target.files?.[0];
                if (arquivo) void anexarReferencia(arquivo);
                event.currentTarget.value = '';
              }}
            />
            <label
              htmlFor={`referencia-${agente.id}`}
              className={cn(
                'flex w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-white text-slate-600 transition-colors hover:bg-slate-50',
                enviandoReferencia && 'pointer-events-none opacity-50',
              )}
              title="Anexar referência visual"
            >
              {enviandoReferencia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </label>
            <Textarea
              value={ordemTexto}
              onChange={(event) => setOrdemTexto(event.target.value)}
              placeholder={`Peça algo para ${agente.nome}. Ex.: “use esta referência e gere o próximo post”.`}
              className="min-h-[64px] resize-none rounded-xl text-sm"
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviarOrdem(); } }}
            />
            <Button
              size="icon"
              className="h-auto w-11 shrink-0 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              aria-label="Enviar pedido"
              disabled={enviando || Boolean(planoAtivo && ['aguardando_confirmacao', 'executando'].includes(planoAtivo.status)) || !ordemTexto.trim()}
              onClick={enviarOrdem}
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <details className="group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              <SlidersHorizontal className="h-3 w-3" /> Opções do pedido
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <Select value={tipo} onValueChange={(value) => setTipo(value as TarefaTipo)}>
                <SelectTrigger className="h-8 w-[150px] bg-white text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avulso">Pedido geral</SelectItem>
                  <SelectItem value="post_cliente">Para um cliente</SelectItem>
                </SelectContent>
              </Select>
              {tipo === 'post_cliente' && (
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger className="h-8 min-w-[180px] flex-1 bg-white text-xs"><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientes.map(cliente => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={repetirDiariamente} onCheckedChange={(value) => setRepetirDiariamente(Boolean(value))} />
                <Repeat className="h-3 w-3" /> Repetir todo dia
              </label>
            </div>
          </details>
          <p className="text-[10px] text-muted-foreground">Referências e regras só viram memória depois que você confirmar o plano.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Módulo principal ─────────────────────────────────────────────────────────

export function Equipe11ds({ onNavigateToPosts, onNavigateToAluno }: { onNavigateToPosts?: () => void; onNavigateToAluno?: (alunoId: string) => void }) {
  const [times, setTimes] = useState<Time[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenteAbertoId, setAgenteAbertoId] = useState<string | null>(null);
  const agenteAberto = agenteAbertoId
    ? times.flatMap(t => t.equipe_11ds_agentes).find(a => a.id === agenteAbertoId) ?? null
    : null;

  const loadTimes = useCallback(async () => {
    const { data, error } = await (supabase.from('equipe_11ds_times' as any) as any)
      .select('id, nome, emoji, equipe_11ds_agentes(id, nome, cargo, avatar_url, status, status_texto, executor_function, slug, responsabilidade, regras, aplica)')
      .order('ordem');
    if (error) { toast.error(`Erro ao carregar equipe: ${error.message}`); setLoading(false); return; }
    setTimes((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTimes(); }, [loadTimes]);

  useEffect(() => {
    const channel = supabase
      .channel('equipe_11ds_agentes_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe_11ds_agentes' }, () => {
        loadTimes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadTimes]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Bot className="h-5 w-5" /> Equipe 11DS</h1>
        <p className="text-sm text-muted-foreground">Seus agentes de IA, organizados por time. Clique em um agente pra dar uma ordem.</p>
      </div>

      {times.map(time => (
        <div key={time.id}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{time.emoji} {time.nome}</h2>
          <div className="flex flex-wrap gap-4">
            {time.equipe_11ds_agentes.map(agente => (
              <AgenteCard key={agente.id} agente={agente} onClick={() => setAgenteAbertoId(agente.id)} />
            ))}
          </div>
        </div>
      ))}

      {agenteAberto && (
        <AgentePanel
          agente={agenteAberto}
          onClose={() => setAgenteAbertoId(null)}
          onNavigateToPosts={onNavigateToPosts}
          onNavigateToAluno={onNavigateToAluno}
        />
      )}
    </div>
  );
}
