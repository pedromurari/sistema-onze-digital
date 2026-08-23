import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, RefreshCw, MessageSquare, GraduationCap,
  Wallet, FileText,
  ChevronDown, ChevronRight, ChevronLeft, Megaphone, CalendarDays, Sparkles, Radio, Layers,
} from 'lucide-react';
import { isPagamentoInadimplente } from '@/lib/financial-utils';
import { FichaAlunoResumo } from '../finance/FichaAlunoResumo';
import { useConversas, type Categoria } from '@/hooks/useConversas';
import { useThread } from '@/hooks/useThread';
import { useEvolutionStatus } from '@/hooks/useEvolutionStatus';
import { ConnStateBadge } from '../ConnStateBadge';
import {
  normalizePhone, maskPhone, fmtHora, fmtDiaSeparador, fmtRelativo,
  TEMP_CFG, TIPO_ICON, TIPO_LABEL, instanciaOcultaNoChat,
} from '@/lib/chat-utils';
import type { Conversa } from '@/hooks/useConversas';
import { NomePessoa } from '@/components/crm/pessoa/NomePessoa';

/**
 * Chat: historico de conversa de WhatsApp por lead/aluno, estilo caixa de
 * entrada. Somente leitura -- o envio continua sendo feito pelas campanhas,
 * funis, boas-vindas e cobranca.
 *
 * A busca de dados (identidade por sufixo de telefone, thread de uma
 * conversa) mora em useConversas()/useThread() -- compartilhados com o
 * ChatWidget.tsx (bolha flutuante). Este arquivo cuida só da UI completa:
 * categorias por origem, grupos, aba Cobrança.
 *
 * Navegacao: em vez de abas fixas por temperatura, a lista lateral separa por
 * ORIGEM real do lead (categoria fechada por padrao -> instancia especifica
 * dentro dela: qual lancamento, qual evento NPA, qual turma, qual campanha de
 * disparo). "Todos" mistura tudo por ordem de mensagem, como o WhatsApp normal.
 * "Cobranca" fica fora dessa arvore -- e' carteira de alunos por situacao
 * financeira, nao por origem, e nao precisa do badge de temperatura (todo
 * aluno e' "quente" no calculo de leads_unificados, o dado que importa ali e'
 * inadimplencia).
 */

type Modo = 'todos' | 'cobranca' | 'grupos' | { categoria: Categoria; grupo: string };

interface AlunoCarteira {
  id: string;
  nome: string;
  telefone: string | null;     // normalizado
  turmaNome: string | null;
  status: string;
  inadimplente: boolean;
  valorEmAtraso: number;
  diasAtrasoMax: number;
}

interface AlunoCarteiraComConversa extends AlunoCarteira {
  ultimaMensagem: string | null;
  ultimaEm: string | null;
  ultimaInstancia: string | null;
}

const CATEGORIA_CFG: Record<Categoria, { label: string; icon: React.ElementType }> = {
  lancamento: { label: 'Lançamentos (Semana do Despertar)', icon: Megaphone },
  npa:        { label: 'NPA',                                icon: CalendarDays },
  turma:      { label: 'Turmas',                             icon: GraduationCap },
  disparo:    { label: 'Disparos',                            icon: Radio },
  numerologo: { label: 'Numerólogo',                          icon: Sparkles },
  direto:     { label: 'Contato direto (sem cadastro)',       icon: MessageSquare },
};
const CATEGORIA_ORDEM: Categoria[] = ['direto', 'lancamento', 'npa', 'turma', 'disparo', 'numerologo'];

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function ConversaItem({ c, ativo, onClick }: { c: Conversa; ativo: boolean; onClick: () => void }) {
  const temp = TEMP_CFG[c.temperatura];
  const mostraNaoLida = c.naoLida && !ativo;
  return (
    <button onClick={onClick}
      className={cn('w-full text-left px-3 py-2.5 border-b hover:bg-gray-50/60 transition-colors', ativo && 'bg-primary/5')}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm truncate flex items-center gap-1.5 min-w-0">
          {mostraNaoLida && <span className="h-2 w-2 rounded-full bg-primary flex-none" />}
          <temp.icon className={cn('h-3 w-3 flex-none', temp.className)} />
          <span className={cn('truncate', mostraNaoLida && 'font-semibold')}>
            <NomePessoa nome={c.nome} telefone={c.telefone} />
          </span>
        </p>
        <span className="text-[10px] text-muted-foreground flex-none">{fmtRelativo(c.ultimaEm)}</span>
      </div>
      {(c.grupoNome || c.ultimaInstancia) && (
        <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
          {c.grupoNome && <span className="truncate">{c.grupoNome}</span>}
          {c.ultimaInstancia && (
            <span className="inline-flex items-center gap-0.5 px-1 rounded bg-gray-100 text-gray-500 flex-none">
              <Radio className="h-2.5 w-2.5" /> {c.ultimaInstancia}
            </span>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultimaMensagem}</p>
    </button>
  );
}

function StatusBarWhatsApp({ filtroInstancia, onToggle }: { filtroInstancia: string | null; onToggle: (nome: string) => void }) {
  const { instances: todasInstancias, states, loading } = useEvolutionStatus();
  const instances = useMemo(
    () => todasInstancias.filter(i => !instanciaOcultaNoChat(i.instance_name)),
    [todasInstancias],
  );
  if (!loading && instances.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50/50 overflow-x-auto flex-none">
      {instances.map(inst => (
        <button key={inst.id} onClick={() => onToggle(inst.instance_name)}
          title={filtroInstancia === inst.instance_name ? 'Clique para remover o filtro' : `Ver só conversas de ${inst.instance_name}`}
          className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs flex-none transition-colors',
            filtroInstancia === inst.instance_name ? 'bg-primary/10 border-primary/40' : 'bg-white hover:bg-gray-50')}>
          <span className="font-medium">{inst.instance_name}</span>
          <ConnStateBadge state={states[inst.id] ?? 'loading'} />
        </button>
      ))}
    </div>
  );
}

export function ChatConversas({ onNavigateToAluno }: { onNavigateToAluno?: (alunoId: string) => void }) {
  const [modo, setModo] = useState<Modo>('todos');
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<Categoria>>(new Set());
  const { conversas, loading } = useConversas();
  const [carteira, setCarteira] = useState<AlunoCarteira[]>([]);
  const [search, setSearch] = useState('');
  const [selecionado, setSelecionado] = useState<{ telefone: string; nome: string; rotulo: string | null; alunoId: string | null } | null>(null);
  const { thread, loading: loadingThread } = useThread(selecionado?.telefone ?? null);
  const [fichaAlunoId, setFichaAlunoId] = useState<string | null>(null);
  const [filtroCarteira, setFiltroCarteira] = useState<'todos' | 'em_dia' | 'inadimplentes'>('todos');
  const [filtroInstancia, setFiltroInstancia] = useState<string | null>(null);
  const fimDaThreadRef = useRef<HTMLDivElement>(null);

  // ── Carteira de alunos (Cobrança) ──────────────────────────────────────────
  const carregarCarteira = useCallback(async () => {
    const [alunosRes, turmasRes, pagsRes] = await Promise.all([
      supabase.from('alunos').select('id, nome, whatsapp, turma_id, status'),
      supabase.from('turmas').select('id, nome'),
      supabase.from('pagamentos').select('aluno_id, valor, status, data_vencimento'),
    ]);

    const turmaNome = new Map<string, string>();
    for (const t of (turmasRes.data ?? []) as any[]) turmaNome.set(t.id, t.nome);

    // diasMax = maior atraso entre as parcelas em aberto do aluno -- mesmo
    // criterio de severidade que a tela de Cobranca usa pra ordenar a fila
    // (dias_offset desc, ver Cobranca.tsx). Sem isso a lista aqui ordenava só
    // por nome, sem refletir quem está mais atrasado / é mais urgente cobrar.
    const hoje = Date.now();
    const atrasoPorAluno = new Map<string, { qtd: number; valor: number; diasMax: number }>();
    for (const p of (pagsRes.data ?? []) as any[]) {
      if (!p.aluno_id || !isPagamentoInadimplente(p)) continue;
      const cur = atrasoPorAluno.get(p.aluno_id) ?? { qtd: 0, valor: 0, diasMax: 0 };
      cur.qtd += 1;
      cur.valor += Number(p.valor ?? 0);
      if (p.data_vencimento) {
        const dias = Math.floor((hoje - new Date(p.data_vencimento).getTime()) / 86_400_000);
        if (dias > cur.diasMax) cur.diasMax = dias;
      }
      atrasoPorAluno.set(p.aluno_id, cur);
    }

    const lista: AlunoCarteira[] = ((alunosRes.data ?? []) as any[]).map(a => {
      const atraso = atrasoPorAluno.get(a.id);
      const encerrado = a.status === 'cancelado' || a.status === 'concluido';
      return {
        id: a.id,
        nome: a.nome,
        telefone: a.whatsapp ? normalizePhone(a.whatsapp) : null,
        turmaNome: a.turma_id ? (turmaNome.get(a.turma_id) ?? null) : null,
        status: a.status,
        inadimplente: !encerrado && !!atraso,
        valorEmAtraso: atraso?.valor ?? 0,
        diasAtrasoMax: atraso?.diasMax ?? 0,
      };
    });

    lista.sort((a, b) => (Number(b.inadimplente) - Number(a.inadimplente)) || (b.diasAtrasoMax - a.diasAtrasoMax) || a.nome.localeCompare(b.nome));
    setCarteira(lista);
  }, []);

  useEffect(() => { carregarCarteira(); }, [carregarCarteira]);

  // Rola pro fim da thread ao abrir uma conversa e a cada mensagem nova --
  // igual WhatsApp, sempre mostra a mais recente em vez de deixar a rolagem
  // parada no topo (mensagens antigas).
  useEffect(() => {
    fimDaThreadRef.current?.scrollIntoView({ block: 'end' });
  }, [selecionado?.telefone, thread]);

  function toggleCategoria(cat: Categoria) {
    setCategoriasAbertas(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  function selecionarGrupo(categoria: Categoria, grupo: string) {
    setModo({ categoria, grupo });
  }

  function toggleFiltroInstancia(nome: string) {
    setFiltroInstancia(prev => prev === nome ? null : nome);
  }

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();

  const conversasVisiveis = useMemo(() => {
    if (modo === 'cobranca' || modo === 'grupos') return [];
    let list = conversas;
    // Disparo frio (nunca respondeu) so aparece dentro do proprio grupo da campanha, nao em "Todos".
    if (modo === 'todos') list = list.filter(c => c.categoria !== 'disparo' || c.disparoRespondeu);
    if (typeof modo === 'object') list = list.filter(c => c.categoria === modo.categoria && c.grupoNome === modo.grupo);
    if (filtroInstancia) list = list.filter(c => c.ultimaInstancia === filtroInstancia);
    return list.filter(c => !q || c.nome.toLowerCase().includes(q) || c.telefone.includes(q));
  }, [conversas, modo, q, filtroInstancia]);

  const todosCount = useMemo(
    () => conversas.filter(c => c.categoria !== 'disparo' || c.disparoRespondeu).length,
    [conversas],
  );

  // Conversa mais recente de cada telefone (qualquer instancia, ja normalizado
  // do mesmo jeito que AlunoCarteira.telefone) -- usada pra trazer a conversa
  // real (preview + hora) pra dentro da carteira de Cobranca, em vez de deixar
  // ela como só uma lista de contatos sem contexto de atendimento.
  const conversaPorTelefone = useMemo(() => {
    const m = new Map<string, Conversa>();
    for (const c of conversas) m.set(c.telefone, c);
    return m;
  }, [conversas]);

  const carteiraVisivel = useMemo((): AlunoCarteiraComConversa[] => {
    if (modo !== 'cobranca') return [];
    return carteira
      .filter(a => filtroCarteira === 'todos'
        || (filtroCarteira === 'inadimplentes' ? a.inadimplente : !a.inadimplente))
      .filter(a => !q || a.nome.toLowerCase().includes(q) || (a.telefone ?? '').includes(q))
      .map(a => {
        const conversa = a.telefone ? conversaPorTelefone.get(a.telefone) : undefined;
        return {
          ...a,
          ultimaMensagem: conversa?.ultimaMensagem ?? null,
          ultimaEm: conversa?.ultimaEm ?? null,
          ultimaInstancia: conversa?.ultimaInstancia ?? null,
        };
      })
      .sort((a, b) => {
        // Quem tem conversa recente sobe pro topo (mais recente primeiro);
        // sem nenhuma mensagem ainda, cai pro criterio antigo de urgencia de cobranca.
        if (a.ultimaEm && b.ultimaEm) return b.ultimaEm.localeCompare(a.ultimaEm);
        if (a.ultimaEm) return -1;
        if (b.ultimaEm) return 1;
        return (Number(b.inadimplente) - Number(a.inadimplente)) || (b.diasAtrasoMax - a.diasAtrasoMax) || a.nome.localeCompare(b.nome);
      });
  }, [carteira, modo, filtroCarteira, q, conversaPorTelefone]);

  const gruposPorCategoria = useMemo(() => {
    const map = new Map<Categoria, Map<string, number>>();
    for (const c of conversas) {
      if (!map.has(c.categoria)) map.set(c.categoria, new Map());
      const porGrupo = map.get(c.categoria)!;
      porGrupo.set(c.grupoNome, (porGrupo.get(c.grupoNome) ?? 0) + 1);
    }
    return map;
  }, [conversas]);

  const emGrupos = modo === 'grupos' || typeof modo === 'object';
  const mostrandoLista = modo === 'todos' || typeof modo === 'object';

  return (
    <div className="flex-1 flex flex-col overflow-hidden border rounded-xl bg-white">
      <StatusBarWhatsApp filtroInstancia={filtroInstancia} onToggle={toggleFiltroInstancia} />
      <div className="flex-1 flex overflow-hidden">
      {/* ── Lista lateral ── */}
      <div className="w-[320px] flex-none border-r flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar nome ou telefone…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => setModo('todos')}
              className={cn('flex items-center justify-center gap-1 px-1 py-1.5 rounded-md text-xs font-medium transition-all',
                modo === 'todos' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              Todos <span className="opacity-60 text-[10px]">({todosCount})</span>
            </button>
            <button onClick={() => setModo('cobranca')}
              className={cn('flex items-center justify-center gap-1 px-1 py-1.5 rounded-md text-xs font-medium transition-all',
                modo === 'cobranca' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              <Wallet className="h-3 w-3" /> Cobrança
            </button>
            <button onClick={() => setModo('grupos')}
              className={cn('flex items-center justify-center gap-1 px-1 py-1.5 rounded-md text-xs font-medium transition-all',
                emGrupos ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              <Layers className="h-3 w-3" /> Grupos
            </button>
          </div>
          {modo === 'cobranca' && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {([
                { key: 'todos' as const, label: 'Todos' },
                { key: 'em_dia' as const, label: 'Em dia' },
                { key: 'inadimplentes' as const, label: 'Inadimplentes' },
              ]).map(f => (
                <button key={f.key} onClick={() => setFiltroCarteira(f.key)}
                  className={cn('flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                    filtroCarteira === f.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {typeof modo === 'object' && (
            <button onClick={() => setModo('grupos')}
              className="w-full flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="truncate">{CATEGORIA_CFG[modo.categoria].label} · {modo.grupo}</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : modo === 'cobranca' ? (
            carteiraVisivel.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-8">Nenhum aluno encontrado</p>
            ) : carteiraVisivel.map(a => (
              <button key={a.id}
                onClick={() => setSelecionado({ telefone: a.telefone ?? '', nome: a.nome, rotulo: a.turmaNome, alunoId: a.id })}
                className={cn('w-full text-left px-3 py-2.5 border-b hover:bg-gray-50/60 transition-colors',
                  selecionado?.alunoId === a.id && 'bg-primary/5')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{a.nome}</p>
                  <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-none',
                    a.status === 'cancelado' || a.status === 'concluido' ? 'bg-gray-100 text-gray-500'
                      : a.inadimplente ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                    {a.status === 'cancelado' || a.status === 'concluido' ? a.status
                      : a.inadimplente ? 'Inadimplente' : 'Em dia'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                  <span className="truncate">{a.turmaNome ?? 'Sem turma'}</span>
                  {a.ultimaInstancia && (
                    <span className="inline-flex items-center gap-0.5 px-1 rounded bg-gray-100 text-gray-500 flex-none">
                      <Radio className="h-2.5 w-2.5" /> {a.ultimaInstancia}
                    </span>
                  )}
                  {a.ultimaEm && <span className="flex-none">· {fmtRelativo(a.ultimaEm)}</span>}
                </p>
                <p className={cn('text-xs truncate mt-0.5', a.ultimaMensagem ? 'text-muted-foreground' : 'text-muted-foreground/60 italic')}>
                  {a.ultimaMensagem ?? 'Sem conversa ainda'}
                </p>
                {a.inadimplente && (
                  <p className="text-[10px] text-red-600 mt-0.5">
                    {fmtBRL(a.valorEmAtraso)} em atraso · {a.diasAtrasoMax}d
                  </p>
                )}
              </button>
            ))
          ) : modo === 'grupos' ? (
            CATEGORIA_ORDEM.filter(cat => (gruposPorCategoria.get(cat)?.size ?? 0) > 0).length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-8">Nenhum grupo com conversa ainda</p>
            ) : CATEGORIA_ORDEM
                .filter(cat => (gruposPorCategoria.get(cat)?.size ?? 0) > 0)
                .map(cat => {
                  const cfg = CATEGORIA_CFG[cat];
                  const grupos = [...(gruposPorCategoria.get(cat)?.entries() ?? [])].sort((a, b) => a[0].localeCompare(b[0]));
                  const total = grupos.reduce((s, [, n]) => s + n, 0);
                  const aberta = categoriasAbertas.has(cat);
                  return (
                    <div key={cat} className="border-b last:border-0">
                      <button onClick={() => toggleCategoria(cat)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/60 text-sm font-medium">
                        {aberta ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-none" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-none" />}
                        <cfg.icon className="h-4 w-4 text-muted-foreground flex-none" />
                        <span className="flex-1 text-left truncate">{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">{total}</span>
                      </button>
                      {aberta && (
                        <div className="pb-1">
                          {grupos.map(([grupo, count]) => (
                            <button key={grupo} onClick={() => selecionarGrupo(cat, grupo)}
                              className="w-full text-left pl-9 pr-3 py-1.5 text-xs text-muted-foreground hover:bg-gray-50/60 hover:text-foreground flex items-center justify-between gap-2">
                              <span className="truncate">{grupo}</span>
                              <span className="flex-none">{count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
          ) : !mostrandoLista ? null : conversasVisiveis.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-8">Nenhuma conversa encontrada</p>
          ) : conversasVisiveis.map(c => (
            <ConversaItem key={c.telefone} c={c} ativo={selecionado?.telefone === c.telefone}
              onClick={() => setSelecionado({ telefone: c.telefone, nome: c.nome, rotulo: c.grupoNome, alunoId: c.alunoId })} />
          ))}
        </div>
      </div>

      {/* ── Thread ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selecionado ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-none">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selecionado.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selecionado.rotulo ? `${selecionado.rotulo} · ` : ''}
                  {selecionado.telefone ? maskPhone(selecionado.telefone) : 'sem telefone'}
                  {thread.length > 0 && thread[thread.length - 1].evolution_instance
                    ? ` · via ${thread[thread.length - 1].evolution_instance}` : ''}
                </p>
              </div>
              {selecionado.alunoId && (
                <Button variant="outline" size="sm" onClick={() => setFichaAlunoId(selecionado.alunoId)} className="gap-1.5 flex-none">
                  <FileText className="h-3.5 w-3.5" /> Ficha de matrícula
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/40">
              {loadingThread ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : thread.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-8">Nenhuma mensagem ainda</p>
              ) : (
                <div className="space-y-2">
                  {thread.map((m, i) => {
                    const diaAnterior = i > 0 ? new Date(thread[i - 1].created_at).toDateString() : null;
                    const mostraSeparador = diaAnterior !== new Date(m.created_at).toDateString();
                    const enviada = m.direcao === 'enviada';
                    const Icone = TIPO_ICON[m.tipo];
                    return (
                      <div key={m.id}>
                        {mostraSeparador && (
                          <div className="flex justify-center my-3">
                            <span className="px-2 py-0.5 rounded-full bg-white border text-[10px] text-muted-foreground">
                              {fmtDiaSeparador(m.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={cn('flex', enviada ? 'justify-end' : 'justify-start')}>
                          <div className={cn('max-w-[75%] rounded-lg px-3 py-2 shadow-sm',
                            enviada ? 'bg-emerald-100 text-emerald-950' : 'bg-white border')}>
                            {Icone && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium opacity-70 mb-0.5">
                                <Icone className="h-3 w-3" /> {TIPO_LABEL[m.tipo] ?? m.tipo}
                              </span>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                            <p className="text-[10px] opacity-50 text-right mt-0.5">
                              {m.evolution_instance ? `${m.evolution_instance} · ` : ''}{fmtHora(m.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={fimDaThreadRef} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>

      {fichaAlunoId && (
        <FichaAlunoResumo
          alunoId={fichaAlunoId}
          onClose={() => setFichaAlunoId(null)}
          onEditarNoFinanceiro={onNavigateToAluno
            ? (id) => { setFichaAlunoId(null); onNavigateToAluno(id); }
            : undefined}
        />
      )}
    </div>
  );
}
