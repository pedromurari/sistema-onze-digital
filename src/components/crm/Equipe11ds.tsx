import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, Loader2, Download, Send, ArrowUpRight, AlertTriangle, RefreshCw, Repeat, X, MessageCircle, CheckCircle2, ExternalLink, CalendarDays, ListChecks, ShieldCheck, Clock3, Paperclip, SlidersHorizontal, Brain, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type AgenteStatus = 'livre' | 'trabalhando' | 'erro';
type TarefaStatus = 'pendente' | 'em_andamento' | 'concluido' | 'erro';
type TarefaTipo = 'post_cliente' | 'avulso';

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
  dados: DadosFinanceiro | null;
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
  concluido: 'Concluído',
  erro: 'Erro',
};

const STATUS_DOT: Record<TarefaStatus, string> = {
  pendente: 'bg-gray-300',
  em_andamento: 'bg-blue-500 animate-pulse',
  concluido: 'bg-emerald-500',
  erro: 'bg-red-500',
};

const STATUS_CHIP: Record<TarefaStatus, string> = {
  pendente: 'bg-gray-100 border-gray-200 text-gray-600',
  em_andamento: 'bg-blue-50 border-blue-200 text-blue-700',
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

// ── Detalhe da tarefa ────────────────────────────────────────────────────────

function TarefaDetalhe({ tarefa, onNavigateToPosts, onNavigateToAluno }: { tarefa: Tarefa; onNavigateToPosts?: () => void; onNavigateToAluno?: (alunoId: string) => void }) {
  const [dados, setDados] = useState(tarefa.dados);
  useEffect(() => { setDados(tarefa.dados); }, [tarefa.dados]);

  const marcarContatado = async (pagamentoId: string, contatar: boolean) => {
    const valor = contatar ? new Date().toISOString() : null;
    const { error } = await supabase.from('pagamentos').update({ cobranca_contatado_em: valor }).eq('id', pagamentoId);
    if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
    setDados(prev => {
      if (!prev) return prev;
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
      if (!prev) return prev;
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
