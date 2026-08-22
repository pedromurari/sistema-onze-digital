import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lead, PIPELINE_STAGES, PipelineStage } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { NomePessoa } from '@/components/crm/pessoa/NomePessoa';
import { supabase } from '@/integrations/supabase/client';
import { dbRowToLead } from '@/contexts/LeadsContext';
import { Clock, Edit, MessageCircle, MessagesSquare, ChevronDown, ChevronUp, ExternalLink, Trash2, CalendarClock, Loader2, Plus, X, RefreshCw, Info, Handshake, Package, Users, Percent, Wallet, AlertTriangle, Target, Pencil } from 'lucide-react';
import { useThread } from '@/hooks/useThread';
import { fmtHora, TIPO_LABEL } from '@/lib/chat-utils';
import { abrirChatWidget } from './chat/ChatWidget';

const CURSO_LEADS_DIRETOS = 'Formação em Psicanálise Clínica Integrativa';

// O site grava "Campanha: X" como primeira linha das observacoes quando o
// lead vem de uma pagina de oferta especifica (/condicao-especial,
// /pague-em-30-dias) -- extrai pra mostrar um selo visivel no card, senao
// a equipe so descobre a condicao prometida abrindo e lendo o texto todo.
function extrairCampanha(observacoes?: string | null): string | null {
  if (!observacoes) return null;
  const linha = observacoes.split('\n').find((l) => l.startsWith('Campanha:'));
  return linha ? linha.replace('Campanha:', '').trim() : null;
}

// Ticket medio estimado do lead direto (LTV = valor de contrato assumido no
// fechamento, NAO caixa recebido). Valores por forma de pagamento confirmados
// por Pedro: PIX a vista R$ 997,00 / cartao R$ 1.021,46 / boleto 1+14x
// R$ 1.648,50. Pesos = distribuicao real dos 121 alunos "direto/psicanalise"
// (consultada no banco: boleto 84,3% / a vista 14,0% / cartao 1,7%). Unica
// fonte de verdade da estimativa -- o gatilho set_valor_potencial() no banco
// NAO grava mais um valor fixo pra origem='Direto' (gravava e ficava
// dessincronizado toda vez que essa formula mudava aqui).
const TICKET_MEDIO_ESTIMADO = 0.843 * 1648.5 + 0.140 * 997 + 0.017 * 1021.46;

// Classifica o texto livre de produto (vem de leads_unificados/lancamento_leads,
// vocabulário inconsistente entre origens) num dos 3 produtos que a empresa
// vende hoje + "outro" como fallback -- usado só pra exibição/valor de ticket,
// não substitui o campo produto original gravado no lead.
type ProdutoSlug = 'psicanalise' | 'pnl' | 'numerologia' | 'outro';

function classificarProduto(raw?: string | null): ProdutoSlug {
  const t = (raw || '').toLowerCase();
  // 'direto' é o marcador histórico do funil do anúncio de WhatsApp Ads --
  // sempre foi só de Psicanálise (ver CURSO_LEADS_DIRETOS), nunca um produto real.
  if (t === 'direto') return 'psicanalise';
  if (t.includes('psican')) return 'psicanalise';
  if (t.includes('pnl')) return 'pnl';
  if (t.includes('numerolog')) return 'numerologia';
  return 'outro';
}

const formatDateTime = (iso?: string) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface PipelineProps { onEditLead: (lead: Lead) => void; }

function EngajamentoBadge({ value }: { value?: string }) {
  if (!value) return null;
  const upper = value.toUpperCase();
  let colorClass = 'bg-muted text-muted-foreground';
  let emoji = '';
  // Duas escalas convivem no mesmo campo: engajamento (alto/médio/baixo, verde=bom)
  // e temperatura do lead (quente/morno/frio, metáfora térmica -- quente=vermelho,
  // frio=azul). Emoji só nessa temperatura, a pedido explícito do usuário.
  if (upper === 'ALTO') colorClass = 'bg-success/20 text-success';
  else if (upper === 'MÉDIO' || upper === 'MEDIO') colorClass = 'bg-warning/20 text-warning';
  else if (upper === 'BAIXO') colorClass = 'bg-destructive/20 text-destructive';
  else if (upper === 'QUENTE') { colorClass = 'bg-red-500/15 text-red-600'; emoji = '🔥'; }
  else if (upper === 'MORNO') { colorClass = 'bg-amber-500/15 text-amber-600'; emoji = '🌡️'; }
  else if (upper === 'FRIO') { colorClass = 'bg-sky-500/15 text-sky-600'; emoji = '❄️'; }
  return (
    <Badge className={`text-[11px] px-2 py-0.5 rounded-md border-0 font-medium gap-1 ${colorClass}`}>
      {emoji && <span aria-hidden="true">{emoji}</span>}{value}
    </Badge>
  );
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

// ── Cartas de negociação: uso por lead ──────────────────────────────────────

type TipoCarta = 'desconto' | 'parcelamento' | 'bonus' | 'outro';

interface CartaNegociacao {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoCarta;
  ativo: boolean;
  ordem: number;
}

const TIPO_CARTA_LABEL: Record<TipoCarta, string> = {
  desconto: 'Desconto', parcelamento: 'Parcelamento', bonus: 'Bônus', outro: 'Outro',
};

function CartasUsadasNoLead({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const [cartas, setCartas] = useState<CartaNegociacao[]>([]);
  const [usadas, setUsadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: cartasData }, { data: usoData }] = await Promise.all([
      supabase.from('leads_cartas_negociacao' as any).select('id, titulo, descricao, tipo, ativo, ordem').eq('ativo', true).order('ordem'),
      supabase.from('lead_cartas_usadas' as any).select('carta_id').eq('lead_id', leadId),
    ]);
    setCartas((cartasData ?? []) as unknown as CartaNegociacao[]);
    setUsadas(new Set((usoData ?? []).map((u: any) => u.carta_id as string)));
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(cartaId: string) {
    if (usadas.has(cartaId)) {
      await supabase.from('lead_cartas_usadas' as any).delete().eq('lead_id', leadId).eq('carta_id', cartaId);
    } else {
      await supabase.from('lead_cartas_usadas' as any).insert({ lead_id: leadId, carta_id: cartaId, usado_por: user?.id } as any);
    }
    load();
  }

  if (loading) return null;
  if (!cartas.length) return null;

  return (
    <div className="pt-1">
      <span className="font-medium text-foreground block mb-1">Cartas de negociação usadas:</span>
      <div className="space-y-1">
        {cartas.map(c => (
          <label key={c.id} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={usadas.has(c.id)} onChange={() => toggle(c.id)} className="h-3.5 w-3.5" />
            <span className={usadas.has(c.id) ? 'text-foreground font-medium' : 'text-muted-foreground'}>{c.titulo}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{TIPO_CARTA_LABEL[c.tipo]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function LeadExpandedInfo({ lead, produtoLabel }: { lead: Lead; produtoLabel?: string | null }) {
  return (
    <div className="border-t border-border pt-2 mt-2 space-y-1.5 text-xs">
      {lead.objetivoPrincipal && <div><span className="font-medium text-foreground">Objetivo:</span> <span className="text-muted-foreground">{lead.objetivoPrincipal}</span></div>}
      {lead.engajamento && <div className="flex items-center gap-1.5"><span className="font-medium text-foreground">Engajamento:</span><EngajamentoBadge value={lead.engajamento} /></div>}
      {lead.tempoInteresse && <div><span className="font-medium text-foreground">Tempo de interesse:</span> <span className="text-muted-foreground">{lead.tempoInteresse}</span></div>}
      {lead.comoConheceu && <div><span className="font-medium text-foreground">Como conheceu:</span> <span className="text-muted-foreground">{lead.comoConheceu}</span></div>}
      <div><span className="font-medium text-foreground">Produto:</span> <span className="text-muted-foreground">{produtoLabel ?? CURSO_LEADS_DIRETOS}</span></div>
      {lead.ultimaMensagem && <div><span className="font-medium text-foreground">Última mensagem:</span> <span className="text-muted-foreground">{lead.ultimaMensagem}</span></div>}
      {lead.linkDePagamentoEnviado && (
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">Link pagamento:</span>
          <a href={lead.linkDePagamentoEnviado} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[150px] inline-flex items-center gap-0.5">Abrir <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}
      <CartasUsadasNoLead leadId={lead.id} />
      <div className="pt-1"><span className="font-medium text-foreground block mb-1">Conversa:</span><LeadChatBubbles lead={lead} /></div>
    </div>
  );
}

// ── Cartas de negociação: painel + editor (admin) ───────────────────────────

function CartasNegociacaoPanel({ isAdmin }: { isAdmin: boolean }) {
  const [cartas, setCartas] = useState<CartaNegociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads_cartas_negociacao' as any).select('id, titulo, descricao, tipo, ativo, ordem').order('ordem');
    setCartas((data ?? []) as unknown as CartaNegociacao[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const ativas = cartas.filter(c => c.ativo);

  return (
    <div className="flex items-start gap-3.5 p-3.5">
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Handshake className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">Cartas de negociação</span>
          <span
            className="text-muted-foreground/50 hover:text-muted-foreground cursor-help flex-shrink-0"
            title="O que você pode oferecer no fechamento — desconto, parcelamento ou bônus. Marque no card do lead qual carta usou."
          >
            <Info className="h-3.5 w-3.5" />
          </span>
          {isAdmin && (
            <button onClick={() => setEditando(true)} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary flex-shrink-0">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {loading ? (
            <span className="text-xs text-muted-foreground/70">carregando…</span>
          ) : ativas.length === 0 ? (
            isAdmin ? (
              <button
                onClick={() => setEditando(true)}
                className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-2.5 py-1 hover:border-primary/40 hover:text-primary transition-colors"
              >
                Nenhuma cadastrada — clique pra criar a primeira
              </button>
            ) : (
              <span className="text-xs text-muted-foreground/70 italic">Seu gestor ainda não cadastrou nenhuma.</span>
            )
          ) : (
            ativas.map(c => (
              <span key={c.id} title={c.descricao || undefined} className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                {c.titulo}
              </span>
            ))
          )}
        </div>
      </div>
      {editando && (
        <CartasEditorModal onClose={() => setEditando(false)} onSaved={() => { setEditando(false); load(); }} />
      )}
    </div>
  );
}

function CartasEditorModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cartas, setCartas] = useState<CartaNegociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('leads_cartas_negociacao' as any).select('id, titulo, descricao, tipo, ativo, ordem').order('ordem');
    if (error) { toast({ variant: 'destructive', title: 'Erro ao carregar cartas', description: error.message }); setLoading(false); return; }
    setCartas((data ?? []) as unknown as CartaNegociacao[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateLocal(id: string, patch: Partial<CartaNegociacao>) {
    setCartas(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function salvar(carta: CartaNegociacao) {
    setSavingId(carta.id);
    const { error } = await supabase.from('leads_cartas_negociacao' as any).update({
      titulo: carta.titulo, descricao: carta.descricao, tipo: carta.tipo, ativo: carta.ativo, ordem: carta.ordem,
    } as any).eq('id', carta.id);
    setSavingId(null);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message }); return; }
    toast({ title: 'Carta salva' });
  }

  async function adicionar() {
    const { data, error } = await supabase.from('leads_cartas_negociacao' as any).insert({
      titulo: 'Nova carta', descricao: '', tipo: 'outro', ativo: true, ordem: cartas.length,
    } as any).select('id, titulo, descricao, tipo, ativo, ordem').single();
    if (error) { toast({ variant: 'destructive', title: 'Erro ao criar carta', description: error.message }); return; }
    setCartas(prev => [...prev, data as unknown as CartaNegociacao]);
  }

  async function remover(id: string) {
    const { error } = await supabase.from('leads_cartas_negociacao' as any).delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao remover', description: error.message }); return; }
    setCartas(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Editar cartas de negociação</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="p-5 space-y-3 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-24"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            cartas.map(carta => (
              <div key={carta.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={carta.titulo} onChange={e => updateLocal(carta.id, { titulo: e.target.value })} className="h-8 text-sm flex-1" placeholder="Título" />
                  <Select value={carta.tipo} onValueChange={v => updateLocal(carta.id, { tipo: v as TipoCarta })}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desconto">Desconto</SelectItem>
                      <SelectItem value="parcelamento">Parcelamento</SelectItem>
                      <SelectItem value="bonus">Bônus</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Ativa</span>
                    <Switch checked={carta.ativo} onCheckedChange={v => updateLocal(carta.id, { ativo: v })} />
                  </div>
                </div>
                <Textarea value={carta.descricao} onChange={e => updateLocal(carta.id, { descricao: e.target.value })}
                  placeholder="Descrição (ex.: até 10% de desconto à vista)" rows={2} className="text-sm" />
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => remover(carta.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => salvar(carta)} disabled={savingId === carta.id}>
                    {savingId === carta.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                  </Button>
                </div>
              </div>
            ))
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={adicionar}>
            <Plus className="h-3.5 w-3.5" /> Nova carta
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button onClick={() => { onSaved(); }}>Concluído</Button>
        </div>
      </div>
    </div>
  );
}

// ── Valores por produto: painel + editor (admin) ────────────────────────────

interface ProdutoMaterial { titulo: string; url: string; }
interface ProdutoData { titulo: string; data: string; descricao: string; }

interface ProdutoValor {
  slug: ProdutoSlug;
  nome: string;
  valor_ticket: number | null;
  materiais: ProdutoMaterial[];
  datas_importantes: ProdutoData[];
}

function ProdutosValoresPanel({ isAdmin, onLoaded }: { isAdmin: boolean; onLoaded: (mapa: Record<string, ProdutoValor>) => void }) {
  const [produtos, setProdutos] = useState<ProdutoValor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [detalheSlug, setDetalheSlug] = useState<ProdutoSlug | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads_produtos_valores' as any).select('slug, nome, valor_ticket, materiais, datas_importantes').order('slug');
    const lista = (data ?? []) as unknown as ProdutoValor[];
    setProdutos(lista);
    onLoaded(Object.fromEntries(lista.map(p => [p.slug, p])));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex items-start gap-3.5 p-3.5">
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Package className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">Produtos</span>
          <span
            className="text-muted-foreground/50 hover:text-muted-foreground cursor-help flex-shrink-0"
            title="Clique num produto pra ver o ticket esperado, materiais de apoio e datas importantes."
          >
            <Info className="h-3.5 w-3.5" />
          </span>
          {isAdmin && (
            <button onClick={() => setEditando(true)} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary flex-shrink-0">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {loading ? (
            <span className="text-xs text-muted-foreground/70">carregando…</span>
          ) : (
            produtos.map(p => (
              <button
                key={p.slug}
                onClick={() => setDetalheSlug(p.slug)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted text-foreground hover:bg-muted/70 whitespace-nowrap transition-colors"
              >
                <span className="font-medium">{p.nome}</span>
                {p.valor_ticket ? (
                  <span className="font-semibold text-primary">{formatCurrencyValue(p.valor_ticket)}</span>
                ) : (
                  <span className="text-muted-foreground/60 italic">sem valor definido</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
      {editando && (
        <ProdutosEditorModal produtos={produtos} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); load(); }} />
      )}
      {detalheSlug && (
        <ProdutoDetalheModal
          slug={detalheSlug}
          isAdmin={isAdmin}
          onClose={() => setDetalheSlug(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function formatCurrencyValue(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function ProdutosEditorModal({ produtos, onClose, onSaved }: { produtos: ProdutoValor[]; onClose: () => void; onSaved: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(produtos.map(p => [p.slug, p.valor_ticket != null ? String(p.valor_ticket) : ''])),
  );
  const [nomes, setNomes] = useState<Record<string, string>>(
    () => Object.fromEntries(produtos.map(p => [p.slug, p.nome])),
  );
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    for (const p of produtos) {
      const valorTexto = valores[p.slug]?.trim() ?? '';
      const valor = valorTexto ? Number(valorTexto.replace(',', '.')) : null;
      const { error } = await supabase.from('leads_produtos_valores' as any).update({
        nome: nomes[p.slug]?.trim() || p.nome,
        valor_ticket: valor,
      } as any).eq('slug', p.slug);
      if (error) { toast({ variant: 'destructive', title: `Erro ao salvar ${p.nome}`, description: error.message }); setSaving(false); return; }
    }
    setSaving(false);
    toast({ title: 'Valores salvos' });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md flex flex-col border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Editar ticket por produto</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-3">
          {produtos.map(p => (
            <div key={p.slug} className="flex items-center gap-2">
              <Input value={nomes[p.slug] ?? ''} onChange={e => setNomes(prev => ({ ...prev, [p.slug]: e.target.value }))} className="h-8 text-sm flex-1" />
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input
                  value={valores[p.slug] ?? ''}
                  onChange={e => setValores(prev => ({ ...prev, [p.slug]: e.target.value }))}
                  placeholder="sem valor"
                  className="h-8 text-sm pl-7"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Detalhe do produto: ticket + materiais + datas importantes ─────────────
// Aberto ao clicar no badge do produto (no card do lead ou na faixa do
// topo). Vendedor só consulta; admin tem um modo de edição pra manter
// materiais de apoio e datas importantes atualizados sem depender de dev.

function ProdutoDetalheModal({ slug, isAdmin, onClose, onChanged }: {
  slug: ProdutoSlug; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [produto, setProduto] = useState<ProdutoValor | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('leads_produtos_valores' as any)
      .select('slug, nome, valor_ticket, materiais, datas_importantes').eq('slug', slug).maybeSingle();
    if (error) { toast({ variant: 'destructive', title: 'Erro ao carregar produto', description: error.message }); setLoading(false); return; }
    setProduto(data as unknown as ProdutoValor);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  function fmtData(d: string) {
    if (!d) return '';
    try { return new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR'); } catch { return d; }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{produto?.nome ?? '…'}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        {loading || !produto ? (
          <div className="flex items-center justify-center h-32"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : editando ? (
          <ProdutoEditForm
            produto={produto}
            onCancel={() => setEditando(false)}
            onSaved={() => { setEditando(false); load(); onChanged(); }}
          />
        ) : (
          <>
            <div className="p-5 space-y-4 overflow-auto">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Ticket estimado</span>
                <p className="text-lg font-semibold text-foreground">
                  {produto.valor_ticket ? formatCurrencyValue(produto.valor_ticket) : 'Ainda não definido'}
                </p>
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">Datas importantes</span>
                {produto.datas_importantes?.length ? (
                  <div className="mt-1.5 space-y-1.5">
                    {produto.datas_importantes.map((d, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium text-foreground">{fmtData(d.data)}</span>
                        {d.titulo && <span className="text-foreground"> — {d.titulo}</span>}
                        {d.descricao && <p className="text-xs text-muted-foreground">{d.descricao}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Nenhuma data cadastrada.</p>
                )}
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">Materiais</span>
                {produto.materiais?.length ? (
                  <div className="mt-1.5 space-y-1">
                    {produto.materiais.map((m, i) => (
                      <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline">
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{m.titulo || m.url}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Nenhum material cadastrado.</p>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setEditando(true)}>Editar</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProdutoEditForm({ produto, onCancel, onSaved }: {
  produto: ProdutoValor; onCancel: () => void; onSaved: () => void;
}) {
  const [valorTicket, setValorTicket] = useState(produto.valor_ticket != null ? String(produto.valor_ticket) : '');
  const [datas, setDatas] = useState<ProdutoData[]>(produto.datas_importantes ?? []);
  const [materiais, setMateriais] = useState<ProdutoMaterial[]>(produto.materiais ?? []);
  const [saving, setSaving] = useState(false);

  function updateData(i: number, patch: Partial<ProdutoData>) {
    setDatas(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  }
  function updateMaterial(i: number, patch: Partial<ProdutoMaterial>) {
    setMateriais(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }

  async function salvar() {
    setSaving(true);
    const valorTexto = valorTicket.trim();
    const valor = valorTexto ? Number(valorTexto.replace(',', '.')) : null;
    const { error } = await supabase.from('leads_produtos_valores' as any).update({
      valor_ticket: valor,
      datas_importantes: datas.filter(d => d.titulo || d.data),
      materiais: materiais.filter(m => m.titulo || m.url),
    } as any).eq('slug', produto.slug);
    setSaving(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message }); return; }
    toast({ title: 'Produto atualizado' });
    onSaved();
  }

  return (
    <>
      <div className="p-5 space-y-5 overflow-auto">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Ticket estimado</label>
          <div className="relative w-40 mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
            <Input value={valorTicket} onChange={e => setValorTicket(e.target.value)} placeholder="sem valor" className="h-8 text-sm pl-7" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">Datas importantes</label>
            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => setDatas(prev => [...prev, { titulo: '', data: '', descricao: '' }])}>
              <Plus className="h-3 w-3" /> Nova data
            </Button>
          </div>
          <div className="space-y-2">
            {datas.map((d, i) => (
              <div key={i} className="flex items-start gap-1.5 border border-border rounded-md p-2">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={d.data} onChange={e => updateData(i, { data: e.target.value })} className="h-7 text-xs w-36" />
                    <Input value={d.titulo} onChange={e => updateData(i, { titulo: e.target.value })} placeholder="Título" className="h-7 text-xs flex-1" />
                  </div>
                  <Textarea value={d.descricao} onChange={e => updateData(i, { descricao: e.target.value })} placeholder="Descrição (opcional)" rows={1} className="text-xs" />
                </div>
                <button onClick={() => setDatas(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">Materiais</label>
            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => setMateriais(prev => [...prev, { titulo: '', url: '' }])}>
              <Plus className="h-3 w-3" /> Novo material
            </Button>
          </div>
          <div className="space-y-1.5">
            {materiais.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input value={m.titulo} onChange={e => updateMaterial(i, { titulo: e.target.value })} placeholder="Título" className="h-7 text-xs w-32" />
                <Input value={m.url} onChange={e => updateMaterial(i, { url: e.target.value })} placeholder="URL" className="h-7 text-xs flex-1" />
                <button onClick={() => setMateriais(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}</Button>
      </div>
    </>
  );
}

// ── Editor da meta mensal de matrículas (admin) ─────────────────────────────

function MetaEditModal({ metaAtual, onClose, onSaved }: {
  metaAtual: number; onClose: () => void; onSaved: (novaMeta: number) => void;
}) {
  const [valor, setValor] = useState(String(metaAtual));
  const [saving, setSaving] = useState(false);

  async function salvar() {
    const numero = parseInt(valor, 10);
    if (!Number.isFinite(numero) || numero <= 0) {
      toast({ variant: 'destructive', title: 'Meta inválida', description: 'Informe um número de matrículas maior que zero.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('leads_diretos_config' as any).update({ meta_matriculas_mes: numero } as any).eq('id', 'default');
    setSaving(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message }); return; }
    toast({ title: 'Meta atualizada' });
    onSaved(numero);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xs flex flex-col border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Editar meta do mês</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5">
          <label className="text-xs font-medium text-muted-foreground">Matrículas por mês</label>
          <Input
            type="number" min={1} value={valor} onChange={e => setValor(e.target.value)}
            className="h-9 text-sm mt-1" autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}</Button>
        </div>
      </div>
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

/** Dia 1 do mes corrente em America/Sao_Paulo, meia-noite. */
function inicioDoMesSaoPaulo(): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find(p => p.type === 'year')!.value;
  const mes = partes.find(p => p.type === 'month')!.value;
  return new Date(`${ano}-${mes}-01T03:00:00.000Z`).getTime();
}

// Meta comercial mensal -- default usado só até a config carregar (ou se a
// linha de leads_diretos_config sumir por algum motivo). O valor de verdade
// é editável por admin e vem de leads_diretos_config.meta_matriculas_mes.
const META_MATRICULAS_MES_DEFAULT = 40;

function dentroDoPeriodo(criadoEm: string | undefined, periodo: FiltroPeriodo): boolean {
  if (periodo === 'todos' || !criadoEm) return true;
  const quando = new Date(criadoEm).getTime();
  // "Hoje" e' dia civil (desde a meia-noite de SP), nao "ultimas 24h" --
  // senao um lead das 23h de ontem aparece em "Hoje" ate a mesma hora hoje.
  if (periodo === 'hoje') return quando >= inicioDoDiaSaoPaulo();
  const dias = periodo === '7d' ? 7 : 30;
  return quando >= Date.now() - dias * 24 * 60 * 60 * 1000;
}

// Descrição curta de cada etapa -- some no title (tooltip) do cabeçalho da
// coluna, pra um vendedor novo entender o funil sem precisar de treinamento.
// Classe de borda esquerda por etapa -- precisa ser literal (não montada por
// string concatenation) pra o scanner do Tailwind conseguir gerar a classe.
const STAGE_BORDA_CLASS: Record<PipelineStage, string> = {
  novo: 'border-l-pipeline-novo',
  sdr: 'border-l-pipeline-sdr',
  closer: 'border-l-pipeline-closer',
  matricula: 'border-l-pipeline-matricula',
  handoff_rodrygo: 'border-l-pipeline-handoff',
  follow_up_01: 'border-l-pipeline-followup1',
  follow_up_02: 'border-l-pipeline-followup2',
  follow_up_03: 'border-l-pipeline-followup3',
  aquecimento: 'border-l-pipeline-aquecimento',
};

const STAGE_DESCRICOES: Record<PipelineStage, string> = {
  novo: 'Lead acabou de chegar, ainda sem primeiro contato feito.',
  sdr: 'Qualificação inicial: entendendo o momento e a dor do lead.',
  closer: 'Em negociação: apresentando a oferta e conduzindo pro fechamento.',
  matricula: 'Matrícula confirmada — falta formalizar pagamento/contrato.',
  handoff_rodrygo: 'Repassado pro time de sucesso do aluno (pós-matrícula).',
  follow_up_01: '1ª cutucada: lead esfriou, retomando contato.',
  follow_up_02: '2ª cutucada: ainda sem resposta, nova tentativa.',
  follow_up_03: '3ª tentativa, por ligação — último follow-up antes de esfriar de vez.',
  aquecimento: 'Sem timing agora — mantendo relacionamento pra retomar depois.',
};

// Painel de ajuda dispensável (fica escondido depois que o usuário fecha uma
// vez) -- explica o funcionamento da tela sem precisar de onboarding humano.
const AJUDA_DISMISSED_KEY = 'leads_diretos_ajuda_dismissed_v1';

function AjudaTelaPanel() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(AJUDA_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  function fechar() {
    try { localStorage.setItem(AJUDA_DISMISSED_KEY, '1'); } catch { /* ignora */ }
    setDismissed(true);
  }

  return (
    <div className="mx-4 lg:mx-6 mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3.5 flex items-start gap-3">
      <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-foreground/90 leading-relaxed space-y-1">
        <p><span className="font-semibold">Como usar:</span> cada coluna é uma etapa do funil — mude a etapa do lead pelo campo embaixo do card conforme a conversa evolui. Passe o mouse no nome da coluna pra ver o que ela significa.</p>
        <p><span className="font-semibold">Cartas de negociação</span> mostram o que você pode oferecer (desconto, parcelamento, bônus); marque no card do lead qual usou. Em <span className="font-semibold">Produtos</span>, clique num produto pra ver o ticket esperado, materiais de apoio e datas importantes.</p>
      </div>
      <button onClick={fechar} className="text-muted-foreground hover:text-foreground flex-shrink-0 -mt-0.5 -mr-0.5 p-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
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
  const [faturadoRealMes, setFaturadoRealMes] = useState<{ valor: number; parcelas: number } | null>(null);
  const [produtosValoresMap, setProdutosValoresMap] = useState<Record<string, ProdutoValor>>({});
  const [produtoDetalheSlug, setProdutoDetalheSlug] = useState<ProdutoSlug | null>(null);
  const [metaMatriculas, setMetaMatriculas] = useState(META_MATRICULAS_MES_DEFAULT);
  const [editandoMeta, setEditandoMeta] = useState(false);

  const carregarMeta = useCallback(async () => {
    const { data } = await supabase.from('leads_diretos_config' as any).select('meta_matriculas_mes').eq('id', 'default').maybeSingle();
    if (data) setMetaMatriculas((data as any).meta_matriculas_mes ?? META_MATRICULAS_MES_DEFAULT);
  }, []);

  useEffect(() => { carregarMeta(); }, [carregarMeta]);

  const isAdmin = user?.tipo === 'admin';
  const isVendedor = user?.tipo === 'vendedor';

  // Vendedor só trabalha os leads dele -- trava o filtro no próprio id, sem
  // opção de ver a fila de outro vendedor (admin continua vendo todos).
  useEffect(() => {
    if (isVendedor && user) setFiltroResponsavel(user.id);
  }, [isVendedor, user]);

  // Fetch leads directly from supabase
  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('pipeline-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `origem=in.(Direto,Aquecimento)` }, () => {
        fetchLeads();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Faturado comercial real (caixa efetivamente recebido) -- diferente do LTV
  // usado no resto da tela, que e' o valor de contrato assumido no fechamento,
  // nao o que ja entrou de fato. Vem de alunos/pagamentos (tabelas financeiras
  // reais), nao da estimativa por lead. Cobre TODO aluno "direto" ativo, nao so
  // quem matriculou neste mes -- pagamento de parcela de aluno antigo tambem e'
  // caixa deste mes.
  useEffect(() => {
    const fetchFaturadoReal = async () => {
      const inicioMes = new Date(inicioDoMesSaoPaulo()).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('pagamentos')
        .select('valor, taxa_valor, aluno_id, status, data_pagamento, alunos!inner(origem_lead, produto)')
        .eq('status', 'pago')
        .eq('alunos.origem_lead', 'direto')
        .eq('alunos.produto', 'psicanalise')
        .gte('data_pagamento', inicioMes);

      if (error) {
        console.error('Erro ao carregar faturado real do mes:', error.message);
        return;
      }
      const linhas = (data ?? []) as any[];
      const valor = linhas.reduce((soma, p) => soma + (Number(p.valor) - Number(p.taxa_valor ?? 0)), 0);
      setFaturadoRealMes({ valor, parcelas: linhas.length });
    };
    fetchFaturadoReal();
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .in('origem', ['Direto', 'Aquecimento'])
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
        matriculadoEm: row.matriculado_em,
        origem: row.origem,
        produto: row.produto,
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
    <div className="flex flex-col animate-fade-in">
      <div className="flex items-center justify-between p-4 lg:p-6 pb-0 flex-shrink-0">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">
          CRM Instituto Despertamente{user?.nome ? ` — ${user.nome}` : ''}
        </h1>
      </div>

      <AjudaTelaPanel />

      {/* Filtros */}
      <div className="mx-4 lg:mx-6 mt-3 p-2 rounded-lg bg-muted/40 flex flex-col sm:flex-row gap-2 flex-shrink-0">
        <div className="flex gap-1 bg-card border border-border rounded-md p-1 w-fit">
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
        {!isVendedor && (
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
        )}
        <Input
          placeholder="Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-8 text-xs w-full sm:w-56 bg-card"
        />
      </div>

      <div className="mx-4 lg:mx-6 mt-3 rounded-lg border border-border divide-y divide-border overflow-hidden flex-shrink-0 shadow-sm">
        <CartasNegociacaoPanel isAdmin={isAdmin} />
        <ProdutosValoresPanel isAdmin={isAdmin} onLoaded={setProdutosValoresMap} />
      </div>

      {/* Overview Section */}
      <div className="mx-4 lg:mx-6 mt-3 flex-shrink-0">
        {(() => {
          const allLeads = PIPELINE_STAGES.flatMap(s => getLeadsByStage(s.key));
          // Usa o valor real quando o lead ja tem um fechado; senao, o ticket medio estimado.
          const totalValue = allLeads.reduce((soma, l) => soma + (l.valorInvestimento || TICKET_MEDIO_ESTIMADO), 0);
          const leadsEmMatricula = getLeadsByStage('matricula').length;
          const conversionRate = allLeads.length > 0 ? ((leadsEmMatricula / allLeads.length) * 100).toFixed(1) : 0;
          const acoesAtrasadas = allLeads.filter(l => l.dataProximaAcao && new Date(l.dataProximaAcao) <= new Date()).length;

          // Meta comercial do mes -- usa `leads` (sem os filtros de periodo/responsavel/busca
          // da tela), porque e' um KPI de calendario fixo, nao deve sumir se alguem filtrar "Hoje".
          const inicioMes = inicioDoMesSaoPaulo();
          const matriculasMes = leads.filter((l) => {
            const m = (l as any).matriculadoEm;
            return m && new Date(m).getTime() >= inicioMes;
          });
          const valorMatriculasMes = matriculasMes.reduce((soma, l) => soma + (l.valorInvestimento || TICKET_MEDIO_ESTIMADO), 0);
          const progressoMeta = Math.min(100, (matriculasMes.length / metaMatriculas) * 100);
          const bateuMeta = matriculasMes.length >= metaMatriculas;

          const metricas = [
            { icon: Users, valor: String(allLeads.length), label: `leads em ${PIPELINE_STAGES.length} estágios`, alerta: false },
            { icon: Percent, valor: `${conversionRate}%`, label: `conversão · ${leadsEmMatricula} em matrícula`, alerta: false },
            { icon: Wallet, valor: formatCurrency(totalValue), label: 'em pipeline (LTV estimado)', alerta: false },
            { icon: AlertTriangle, valor: String(acoesAtrasadas), label: 'ações atrasadas ou hoje', alerta: acoesAtrasadas > 0 },
          ];

          return (
            <div className="rounded-lg border-2 border-primary/15 overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Desempenho do mês</span>
                <span className="text-[11px] text-muted-foreground">— o que esperamos do time comercial</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
                {metricas.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3.5">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${m.alerta ? 'bg-warning/15' : 'bg-primary/10'}`}>
                      <m.icon className={`h-4.5 w-4.5 ${m.alerta ? 'text-warning' : 'text-primary'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-2xl font-bold leading-tight tabular-nums ${m.alerta ? 'text-warning' : 'text-foreground'}`}>{m.valor}</p>
                      <p className="text-xs text-muted-foreground leading-tight truncate">{m.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 px-3.5 py-3 border-t border-border bg-primary/[0.04]">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${bateuMeta ? 'bg-success/15' : 'bg-primary/10'}`}>
                  <Target className={`h-4.5 w-4.5 ${bateuMeta ? 'text-success' : 'text-primary'}`} />
                </div>
                <div className="min-w-0 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-2xl font-bold leading-tight tabular-nums ${bateuMeta ? 'text-success' : 'text-foreground'}`}>
                      {matriculasMes.length}<span className="text-sm font-medium text-muted-foreground">/{metaMatriculas}</span>
                    </p>
                    {isAdmin && (
                      <button onClick={() => setEditandoMeta(true)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Editar meta">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight">matrículas — meta do mês</p>
                </div>
                <div className="flex-1 min-w-[80px]">
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div className={`h-full transition-all ${bateuMeta ? 'bg-success' : 'bg-primary'}`} style={{ width: `${progressoMeta}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    {formatCurrency(valorMatriculasMes)} LTV gerado
                    {faturadoRealMes ? ` · ${formatCurrency(faturadoRealMes.valor)} faturado real (${faturadoRealMes.parcelas} parcelas)` : ''}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {editandoMeta && (
        <MetaEditModal
          metaAtual={metaMatriculas}
          onClose={() => setEditandoMeta(false)}
          onSaved={(novaMeta) => { setMetaMatriculas(novaMeta); setEditandoMeta(false); }}
        />
      )}

      <div className="flex gap-3 lg:gap-4 overflow-x-auto p-3 lg:p-6 pb-8 snap-x snap-mandatory lg:snap-none items-start">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage.key);
          return (
            <div key={stage.key} className="flex-shrink-0 w-[85vw] sm:w-72 lg:w-80 snap-center lg:snap-align-none">
              <div className="flex items-center gap-2 px-0.5 pb-2.5" title={STAGE_DESCRICOES[stage.key]}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stage.color}`} />
                <span className="font-medium text-foreground text-sm cursor-help decoration-dotted underline-offset-4 hover:underline">{stage.label}</span>
                <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
              </div>
              <div className="space-y-2 min-h-[12rem]">
                {stageLeads.map((lead) => {
                  const responsavel = getUserById((lead as any).responsavel_id);
                  const hasProximaAcao = (lead as any).prazo && new Date((lead as any).prazo) <= new Date();
                  const isExpanded = expandedLeadId === lead.id;
                  const campanha = extrairCampanha(lead.observacoes);
                  const iniciais = responsavel ? responsavel.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() : '';
                  const leadIniciais = lead.nome ? lead.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() : '?';
                  const produtoSlug = classificarProduto((lead as any).produto);
                  const produtoInfo = produtosValoresMap[produtoSlug];
                  const produtoLabel = produtoInfo?.nome ?? (produtoSlug === 'outro' ? null : produtoSlug);
                  const ticketConfigurado = produtoSlug === 'psicanalise' && !produtoInfo?.valor_ticket
                    ? TICKET_MEDIO_ESTIMADO
                    : produtoInfo?.valor_ticket ?? null;
                  return (
                    <Card
                      key={lead.id}
                      className={`p-3 bg-card border border-border/70 border-l-[3px] ${STAGE_BORDA_CLASS[stage.key]} rounded-xl shadow-sm hover:shadow-md hover:-translate-y-px hover:border-border transition-all`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
                            {leadIniciais}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground text-sm truncate leading-tight">
                              <NomePessoa nome={lead.nome} pessoaId={lead.pessoaId} telefone={lead.telefone} />
                            </h3>
                            <p className="text-xs text-muted-foreground/80 leading-tight mt-0.5">
                              {formatDateTime((lead as any).criadoEm) ?? '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasProximaAcao && <Clock className="h-3.5 w-3.5 text-warning" />}
                          <button
                            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                            onClick={() => setExpandedLeadId(prev => prev === lead.id ? null : lead.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {produtoLabel && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setProdutoDetalheSlug(produtoSlug); }}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium hover:bg-primary/20"
                          >
                            {produtoLabel}
                          </button>
                        )}
                        {lead.engajamento && <EngajamentoBadge value={lead.engajamento} />}
                        {campanha && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {campanha}
                          </span>
                        )}
                        {stage.key === 'handoff_rodrygo' && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                            Aguardando Rodrygo
                          </span>
                        )}
                      </div>

                      <p className="text-lg font-semibold text-foreground mt-2.5">
                        {lead.valorInvestimento
                          ? formatCurrency(lead.valorInvestimento)
                          : ticketConfigurado
                            ? formatCurrency(ticketConfigurado)
                            : <span className="text-xs font-normal text-muted-foreground">Ticket ainda não definido pra {produtoLabel ?? 'este produto'}</span>}
                      </p>
                      {(lead.valorInvestimento || ticketConfigurado) && (
                        <p className="text-[11px] text-muted-foreground/80 -mt-0.5">
                          {lead.valorInvestimento ? 'valor fechado' : 'ticket estimado'}
                        </p>
                      )}

                      <div className="h-px bg-border/60 my-2.5" />

                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs font-normal rounded-md" onClick={(e) => { e.stopPropagation(); abrirChatWidget(lead.telefone); }}>
                          <MessagesSquare className="h-3.5 w-3.5 mr-1.5" />Chat
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="flex-1 h-8 text-xs font-normal rounded-md border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          onClick={(e) => { e.stopPropagation(); openWhatsApp(lead.telefone); }}
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />WhatsApp
                        </Button>
                      </div>

                      {isExpanded && <LeadExpandedInfo lead={lead} produtoLabel={produtoLabel} />}

                      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/60">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 flex-shrink-0">
                            {(lead as any).origem === 'Aquecimento' ? 'Aquecimento' : 'Anúncio'}
                          </span>
                        </div>
                        {responsavel && !isVendedor && (
                          <div
                            title={responsavel.nome}
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
                            style={{ backgroundColor: responsavel.cor }}
                          >
                            {iniciais}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <Select value={(lead as any).status} onValueChange={(value) => handleStageChange(lead, value as PipelineStage)}>
                          <SelectTrigger className="flex-1 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border z-[100]" position="popper" sideOffset={4}>
                            {PIPELINE_STAGES.map((s) => (
                              <SelectItem key={s.key} value={s.key} className="text-xs cursor-pointer">
                                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-muted" onClick={(e) => { e.stopPropagation(); onEditLead(lead); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
                {stageLeads.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground/70 text-xs border border-dashed border-border rounded-xl">
                    Nenhum lead nesta etapa
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {produtoDetalheSlug && (
        <ProdutoDetalheModal
          slug={produtoDetalheSlug}
          isAdmin={isAdmin}
          onClose={() => setProdutoDetalheSlug(null)}
          onChanged={() => {}}
        />
      )}

      {/* Handoff Confirmation Modal */}
      <Dialog open={!!handoffModal} onOpenChange={() => { setHandoffModal(null); setHandoffWarning(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {handoffWarning ? 'Atenção — Lead sem matrícula' : 'Confirmar Handoff para Rodrygo'}
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
