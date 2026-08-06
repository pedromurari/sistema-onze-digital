import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, RefreshCw, MessageSquare, GraduationCap, Flame, Snowflake, Thermometer,
  Wallet, FileText, Image as ImageIcon, Music, Video, Sticker,
  ChevronDown, ChevronRight, ChevronLeft, Megaphone, CalendarDays, Sparkles, Radio, Layers,
} from 'lucide-react';
import { isPagamentoInadimplente } from '@/lib/financial-utils';
import { FichaAlunoResumo } from '../finance/FichaAlunoResumo';

/**
 * Chat: historico de conversa de WhatsApp por lead/aluno, estilo caixa de
 * entrada. Somente leitura -- o envio continua sendo feito pelas campanhas,
 * funis, boas-vindas e cobranca.
 *
 * A conversa e identificada pelo telefone normalizado (11 digitos, sem DDI),
 * gravado por evo-resposta (inbound) e pelas 3 funcoes de envio. Quem e o dono
 * do telefone e resolvido aqui na leitura, casando pelo sufixo de 8 digitos --
 * mesmo criterio que evo-resposta ja usa -- porque o mesmo numero pode ser lead
 * hoje e aluno amanha.
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

type Categoria = 'lancamento' | 'npa' | 'turma' | 'disparo' | 'numerologo';
type Modo = 'todos' | 'cobranca' | 'grupos' | { categoria: Categoria; grupo: string };

interface MensagemRow {
  id: string;
  telefone: string;
  direcao: 'recebida' | 'enviada';
  conteudo: string;
  tipo: string;
  origem: string;
  created_at: string;
}

interface Conversa {
  telefone: string;
  nome: string;
  categoria: Categoria;
  grupoNome: string;           // turma / lançamento / evento NPA / campanha de disparo / "Numerólogo"
  temperatura: 'quente' | 'morno' | 'frio';
  alunoId: string | null;
  ultimaMensagem: string;
  ultimaEm: string;
}

interface AlunoCarteira {
  id: string;
  nome: string;
  telefone: string | null;     // normalizado
  turmaNome: string | null;
  status: string;
  inadimplente: boolean;
  valorEmAtraso: number;
}

const CATEGORIA_CFG: Record<Categoria, { label: string; icon: React.ElementType }> = {
  lancamento: { label: 'Lançamentos (Semana do Despertar)', icon: Megaphone },
  npa:        { label: 'NPA',                                icon: CalendarDays },
  turma:      { label: 'Turmas',                             icon: GraduationCap },
  disparo:    { label: 'Disparos',                            icon: Radio },
  numerologo: { label: 'Numerólogo',                          icon: Sparkles },
};
const CATEGORIA_ORDEM: Categoria[] = ['lancamento', 'npa', 'turma', 'disparo', 'numerologo'];

const TEMP_CFG: Record<'quente' | 'morno' | 'frio', { icon: React.ElementType; className: string }> = {
  quente: { icon: Flame,       className: 'text-red-500' },
  morno:  { icon: Thermometer, className: 'text-amber-500' },
  frio:   { icon: Snowflake,   className: 'text-sky-500' },
};

const TIPO_ICON: Record<string, React.ElementType> = {
  image: ImageIcon, video: Video, audio: Music, document: FileText, sticker: Sticker,
};

const TIPO_LABEL: Record<string, string> = {
  image: 'Imagem', video: 'Vídeo', audio: 'Áudio',
  document: 'Documento', sticker: 'Figurinha', unknown: 'Mensagem',
};

/** Mesmo formato de normalizePhone() em evo-resposta: sem DDI 55, 11 digitos. */
function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

function sufixo(tel: string): string {
  return tel.slice(-8);
}

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}–${d.slice(7)}`;
  return phone;
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDiaSeparador(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `${dias}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function ConversaItem({ c, ativo, onClick }: { c: Conversa; ativo: boolean; onClick: () => void }) {
  const temp = TEMP_CFG[c.temperatura];
  return (
    <button onClick={onClick}
      className={cn('w-full text-left px-3 py-2.5 border-b hover:bg-gray-50/60 transition-colors', ativo && 'bg-primary/5')}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm truncate flex items-center gap-1.5 min-w-0">
          <temp.icon className={cn('h-3 w-3 flex-none', temp.className)} />
          <span className="truncate">{c.nome}</span>
        </p>
        <span className="text-[10px] text-muted-foreground flex-none">{fmtRelativo(c.ultimaEm)}</span>
      </div>
      {c.grupoNome && <p className="text-[10px] text-muted-foreground truncate">{c.grupoNome}</p>}
      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultimaMensagem}</p>
    </button>
  );
}

export function ChatConversas({ onNavigateToAluno }: { onNavigateToAluno?: (alunoId: string) => void }) {
  const [modo, setModo] = useState<Modo>('todos');
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<Categoria>>(new Set());
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carteira, setCarteira] = useState<AlunoCarteira[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selecionado, setSelecionado] = useState<{ telefone: string; nome: string; rotulo: string | null; alunoId: string | null } | null>(null);
  const [thread, setThread] = useState<MensagemRow[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [fichaAlunoId, setFichaAlunoId] = useState<string | null>(null);
  const [filtroCarteira, setFiltroCarteira] = useState<'todos' | 'em_dia' | 'inadimplentes'>('todos');

  // ── Carrega conversas (agrupadas por telefone) + identidade de cada uma ────
  const carregarConversas = useCallback(async () => {
    setLoading(true);

    // Ultimas mensagens; agrupa por telefone no cliente (a lista lateral e um
    // "quem falou por ultimo", nao precisa varrer o historico inteiro).
    const { data: msgs, error } = await supabase
      .from('whatsapp_mensagens' as any)
      .select('telefone, conteudo, tipo, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) { setLoading(false); return; }

    const ultimaPorTelefone = new Map<string, { conteudo: string; tipo: string; created_at: string }>();
    for (const m of (msgs ?? []) as any[]) {
      if (!ultimaPorTelefone.has(m.telefone)) {
        ultimaPorTelefone.set(m.telefone, { conteudo: m.conteudo, tipo: m.tipo, created_at: m.created_at });
      }
    }
    const telefones = [...ultimaPorTelefone.keys()];
    if (!telefones.length) { setConversas([]); setLoading(false); return; }

    // Identidade: leads_unificados primeiro (ja traz a origem legivel: qual
    // lancamento, evento NPA ou turma), disparo_leads como fallback (leads de
    // CSV/grupo de WhatsApp so existem la, sem linha em leads_unificados) --
    // usa o nome da campanha de disparo como grupo nesse caso. Casamento por
    // sufixo de 8 digitos, igual ao evo-resposta -- o formato gravado varia
    // entre as fontes.
    const [unificadosRes, disparoRes, campanhasRes] = await Promise.all([
      supabase.from('leads_unificados' as any).select('origem_tabela, origem_id, origem, nome, telefone, temperatura, criado_em'),
      supabase.from('disparo_leads').select('nome, phone, temperatura, campanha_id'),
      supabase.from('disparo_campanhas').select('id, nome'),
    ]);

    const campanhaNome = new Map<string, string>();
    for (const c of (campanhasRes.data ?? []) as any[]) campanhaNome.set(c.id, c.nome);

    const porSufixoUnificado = new Map<string, any>();
    for (const r of (unificadosRes.data ?? []) as any[]) {
      const s = sufixo(normalizePhone(r.telefone));
      if (!s) continue;
      const atual = porSufixoUnificado.get(s);
      // aluno ganha de lead; empate resolve pelo mais recente
      const ganha = !atual
        || (r.origem_tabela === 'alunos' && atual.origem_tabela !== 'alunos')
        || (r.origem_tabela === 'alunos' === (atual.origem_tabela === 'alunos')
            && String(r.criado_em ?? '') > String(atual.criado_em ?? ''));
      if (ganha) porSufixoUnificado.set(s, r);
    }

    const porSufixoDisparo = new Map<string, any>();
    for (const r of (disparoRes.data ?? []) as any[]) {
      const s = sufixo(normalizePhone(r.phone));
      if (s && !porSufixoDisparo.has(s)) porSufixoDisparo.set(s, r);
    }

    const lista: Conversa[] = [];
    for (const tel of telefones) {
      const ultima = ultimaPorTelefone.get(tel)!;
      const s = sufixo(tel);
      const u = porSufixoUnificado.get(s);
      const d = porSufixoDisparo.get(s);

      let nome: string;
      let categoria: Categoria;
      let grupoNome: string;
      let temperatura: 'quente' | 'morno' | 'frio';
      let alunoId: string | null = null;

      if (u) {
        nome = u.nome || maskPhone(tel);
        temperatura = u.temperatura;
        const origem = String(u.origem ?? '');
        if (u.origem_tabela === 'alunos') {
          categoria = 'turma'; alunoId = u.origem_id;
          grupoNome = origem.replace(/^Aluno:\s*/, '') || 'Sem turma';
        } else if (u.origem_tabela === 'lancamento_leads') {
          categoria = 'lancamento';
          grupoNome = origem.replace(/^Lançamento:\s*/, '') || '(sem lançamento)';
        } else if (u.origem_tabela === 'npa_evento_leads') {
          categoria = 'npa';
          grupoNome = origem.replace(/^Evento NPA:\s*/, '') || '(sem evento)';
        } else {
          categoria = 'numerologo';
          grupoNome = 'Numerólogo';
        }
      } else if (d) {
        nome = d.nome || maskPhone(tel);
        temperatura = d.temperatura;
        categoria = 'disparo';
        grupoNome = campanhaNome.get(d.campanha_id) ?? '(campanha removida)';
      } else {
        // Telefone sem match em lugar nenhum: nunca foi lead nem aluno.
        continue;
      }

      lista.push({
        telefone: tel, nome, categoria, grupoNome, temperatura, alunoId,
        ultimaMensagem: ultima.tipo !== 'text' ? `[${TIPO_LABEL[ultima.tipo] ?? 'Mensagem'}]` : ultima.conteudo,
        ultimaEm: ultima.created_at,
      });
    }

    lista.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm));
    setConversas(lista);
    setLoading(false);
  }, []);

  // ── Carteira de alunos (Cobrança) ──────────────────────────────────────────
  const carregarCarteira = useCallback(async () => {
    const [alunosRes, turmasRes, pagsRes] = await Promise.all([
      supabase.from('alunos').select('id, nome, whatsapp, turma_id, status'),
      supabase.from('turmas').select('id, nome'),
      supabase.from('pagamentos').select('aluno_id, valor, status, data_vencimento'),
    ]);

    const turmaNome = new Map<string, string>();
    for (const t of (turmasRes.data ?? []) as any[]) turmaNome.set(t.id, t.nome);

    const atrasoPorAluno = new Map<string, { qtd: number; valor: number }>();
    for (const p of (pagsRes.data ?? []) as any[]) {
      if (!p.aluno_id || !isPagamentoInadimplente(p)) continue;
      const cur = atrasoPorAluno.get(p.aluno_id) ?? { qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += Number(p.valor ?? 0);
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
      };
    });

    lista.sort((a, b) => (Number(b.inadimplente) - Number(a.inadimplente)) || a.nome.localeCompare(b.nome));
    setCarteira(lista);
  }, []);

  useEffect(() => { carregarConversas(); carregarCarteira(); }, [carregarConversas, carregarCarteira]);

  // Mensagem nova em qualquer conversa reordena a lista lateral.
  useEffect(() => {
    const ch = supabase.channel('whatsapp_mensagens_lista')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens' }, () => carregarConversas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregarConversas]);

  // ── Thread da conversa aberta ─────────────────────────────────────────────
  const carregarThread = useCallback(async (telefone: string) => {
    setLoadingThread(true);
    const { data } = await supabase
      .from('whatsapp_mensagens' as any)
      .select('id, telefone, direcao, conteudo, tipo, origem, created_at')
      .eq('telefone', telefone)
      .order('created_at', { ascending: true });
    setThread((data ?? []) as any as MensagemRow[]);
    setLoadingThread(false);
  }, []);

  useEffect(() => {
    if (!selecionado) { setThread([]); return; }
    carregarThread(selecionado.telefone);
    const ch = supabase.channel(`whatsapp_mensagens_thread_${selecionado.telefone}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens',
        filter: `telefone=eq.${selecionado.telefone}`,
      }, () => carregarThread(selecionado.telefone))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selecionado, carregarThread]);

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

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();

  const conversasVisiveis = useMemo(() => {
    if (modo === 'cobranca' || modo === 'grupos') return [];
    let list = conversas;
    if (typeof modo === 'object') list = list.filter(c => c.categoria === modo.categoria && c.grupoNome === modo.grupo);
    return list.filter(c => !q || c.nome.toLowerCase().includes(q) || c.telefone.includes(q));
  }, [conversas, modo, q]);

  const carteiraVisivel = useMemo(() => {
    if (modo !== 'cobranca') return [];
    return carteira
      .filter(a => filtroCarteira === 'todos'
        || (filtroCarteira === 'inadimplentes' ? a.inadimplente : !a.inadimplente))
      .filter(a => !q || a.nome.toLowerCase().includes(q) || (a.telefone ?? '').includes(q));
  }, [carteira, modo, filtroCarteira, q]);

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
    <div className="flex-1 flex overflow-hidden border rounded-xl bg-white">
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
              Todos <span className="opacity-60 text-[10px]">({conversas.length})</span>
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
                <p className="text-xs text-muted-foreground truncate">{a.turmaNome ?? 'Sem turma'}</p>
                {a.inadimplente && (
                  <p className="text-[10px] text-red-600 mt-0.5">{fmtBRL(a.valorEmAtraso)} em atraso</p>
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
                            <p className="text-[10px] opacity-50 text-right mt-0.5">{fmtHora(m.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
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
