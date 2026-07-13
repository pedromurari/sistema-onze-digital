import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, Loader2, Download, Send, ArrowUpRight, AlertTriangle, RefreshCw, Repeat, X, MessageCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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

type DadosFinanceiro = {
  pagosHoje: ItemFinanceiro[];
  inadimplentes: ItemFinanceiro[];
  vencendo7: ItemFinanceiro[];
  vencendo1: ItemFinanceiro[];
  matriculasHoje: MatriculaItem[];
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

function ListaMatriculas({ itens, onNavigateToAluno }: { itens: MatriculaItem[]; onNavigateToAluno?: (alunoId: string) => void }) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">🎓 Novas matrículas ({itens.length})</p>
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
      {dados && (
        <div className="space-y-3 pt-1">
          <ListaMatriculas itens={dados.matriculasHoje ?? []} onNavigateToAluno={onNavigateToAluno} />
          <ListaFinanceira titulo="💰 Pagamentos de hoje — confira se bateu" itens={dados.pagosHoje} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="⚠️ Inadimplentes" itens={dados.inadimplentes} comAtraso={true} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="🔔 Vencendo em 7 dias" itens={dados.vencendo7} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
          <ListaFinanceira titulo="🔴 Vencendo amanhã" itens={dados.vencendo1} comAtraso={false} onNavigateToAluno={onNavigateToAluno} onMarcarContatado={marcarContatado} />
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
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rodandoDiaria, setRodandoDiaria] = useState(false);

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

  useEffect(() => {
    loadTarefas();
    loadRecorrentes();
    supabase.from('conteudo_clientes' as any).select('id, nome').order('nome')
      .then(({ data }) => setClientes((data as any) || []));
  }, [loadTarefas, loadRecorrentes]);

  useEffect(() => {
    const channel = supabase
      .channel(`equipe_11ds_tarefas_${agente.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe_11ds_tarefas', filter: `agente_id=eq.${agente.id}` }, () => {
        loadTarefas();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agente.id, loadTarefas]);

  const enviarOrdem = async () => {
    if (!ordemTexto.trim()) return;
    if (tipo === 'post_cliente' && !clienteId) { toast.error('Selecione o cliente'); return; }
    setEnviando(true);

    if (repetirDiariamente) {
      const { error: recError } = await (supabase.from('equipe_11ds_recorrentes' as any) as any)
        .insert({
          agente_id: agente.id,
          criado_por: user?.id ?? null,
          tipo,
          cliente_id: tipo === 'post_cliente' ? clienteId : null,
          ordem_texto: ordemTexto.trim(),
          ativo: true,
        });
      if (recError) toast.error(`Erro ao salvar como recorrente: ${recError.message}`);
      else { toast.success('Vai repetir todo dia a partir de amanhã!'); loadRecorrentes(); }
    }

    const { data, error } = await (supabase.from('equipe_11ds_tarefas' as any) as any)
      .insert({
        agente_id: agente.id,
        criado_por: user?.id ?? null,
        tipo,
        cliente_id: tipo === 'post_cliente' ? clienteId : null,
        ordem_texto: ordemTexto.trim(),
        status: 'pendente',
      })
      .select('id')
      .single();

    if (error || !data) {
      toast.error(`Erro ao criar tarefa: ${error?.message}`);
      setEnviando(false);
      return;
    }

    setOrdemTexto('');
    setRepetirDiariamente(false);
    loadTarefas();

    const { error: fnError } = await supabase.functions.invoke(agente.executor_function, { body: { tarefa_id: data.id } });
    setEnviando(false);
    if (fnError) toast.error(`Erro ao executar tarefa: ${fnError.message}`);
    loadTarefas();
  };

  const removerRecorrente = async (id: string) => {
    const { error } = await (supabase.from('equipe_11ds_recorrentes' as any) as any).update({ ativo: false }).eq('id', id);
    if (error) { toast.error(`Erro ao remover recorrente: ${error.message}`); return; }
    setRecorrentes(prev => prev.filter(r => r.id !== id));
    toast.success('Tarefa recorrente removida.');
  };

  const rodarRotinaDiaria = async () => {
    setRodandoDiaria(true);
    const { data, error } = await supabase.functions.invoke('equipe-11ds-diario', { body: {} });
    setRodandoDiaria(false);
    if (error) { toast.error(`Erro ao rodar rotina diária: ${error.message}`); return; }
    const criadas = (data as any)?.criadas ?? 0;
    toast.success(criadas > 0 ? `${criadas} tarefa(s) diária(s) iniciada(s)!` : 'Nada novo pra rodar agora — tudo já foi feito hoje.');
    loadTarefas();
  };

  const grupos: { status: TarefaStatus; label: string }[] = [
    { status: 'em_andamento', label: 'Em andamento' },
    { status: 'pendente', label: 'A fazer' },
    { status: 'concluido', label: 'Concluído' },
    { status: 'erro', label: 'Erro' },
  ];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 mr-6" disabled={rodandoDiaria}>
                  {rodandoDiaria ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Rodar rotina diária
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rodar a rotina diária agora?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso roda de uma vez a rotina diária de todos os agentes: posts de hoje pros clientes ativos e todas
                    as tarefas recorrentes cadastradas. Normalmente isso roda sozinho às 08h — use isso só se quiser
                    testar ou não quiser esperar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={rodarRotinaDiaria}>Rodar agora</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="mt-2">
            <BalaoDeFala agente={agente} />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
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
        </ScrollArea>

        <div className="border-t border-border p-4 space-y-2">
          <div className="flex gap-2">
            <Select value={tipo} onValueChange={(v) => setTipo(v as TarefaTipo)}>
              <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="avulso">Avulso</SelectItem>
                <SelectItem value="post_cliente">Post pro cliente</SelectItem>
              </SelectContent>
            </Select>
            {tipo === 'post_cliente' && (
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={ordemTexto}
              onChange={(e) => setOrdemTexto(e.target.value)}
              placeholder="Dê uma ordem pro agente..."
              className="min-h-[60px] text-sm resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarOrdem(); } }}
            />
            <Button size="icon" className="h-auto" disabled={enviando || !ordemTexto.trim()} onClick={enviarOrdem}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer w-fit">
            <Checkbox checked={repetirDiariamente} onCheckedChange={(v) => setRepetirDiariamente(Boolean(v))} />
            <Repeat className="h-3 w-3" /> Repetir todo dia
          </label>
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
      .select('id, nome, emoji, equipe_11ds_agentes(id, nome, cargo, avatar_url, status, status_texto, executor_function)')
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
