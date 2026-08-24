import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus, Search, Users, DollarSign, Loader2, Power, Trash2,
  Flame, MessageCircle, Pencil, ShoppingBag, Trophy,
  TrendingUp, BarChart3, Target, ArrowLeft, Award, Percent,
  CheckCircle2, XCircle, Send, Play, Square, Pause, X as XIcon,
  ChevronUp, ChevronDown, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useKanbanColunas } from './kanban/useKanbanColunas';
import type { KanbanColuna } from './kanban/useKanbanColunas';
import { NomePessoa } from '@/components/crm/pessoa/NomePessoa';
import {
  KanbanColunaHeader, AddColunaButton,
  RenameColunaModal, ColunaSettingsModal, DeleteColunaModal,
} from './kanban/KanbanColunasUI';

// ─── Types ────────────────────────────────────────────────────────────────────

type NPAPhase =
  | 'novo' | 'ingresso_pago' | 'no_grupo' | 'confirmado' | 'evento'
  | 'closer' | 'follow_up_01' | 'follow_up_02' | 'follow_up_03' | 'matricula';

type Turma = 'manha' | 'tarde' | 'unica';
type TurmaView = 'todas' | 'manha' | 'tarde' | 'lado_a_lado';
type ActiveView = 'kanban' | 'metas' | 'relatorio';

interface NPAEvento {
  id: string;
  nome: string;
  status: 'em_andamento' | 'finalizado' | 'planejamento';
  ativo: boolean;
  created_at: string;
  valor_ingresso?: number;
  valor_material_padrao?: number;
  meta_matriculas?: number;
  meta_faturamento?: number;
  meta_presentes?: number;
  meta_ingressos?: number;
}

interface NPALead {
  id: string;
  npa_evento_id: string;
  nome: string;
  whatsapp: string;
  email?: string;
  fase: NPAPhase;
  turma: Turma;
  ingresso_pago: boolean;
  bv_enviado: boolean;
  bv_enviado_em?: string;
  no_grupo: boolean;
  presente_evento: boolean;
  esteve_no_evento: boolean;
  closer: boolean;
  follow_up_01: boolean;
  follow_up_02: boolean;
  follow_up_03: boolean;
  matriculado: boolean;
  comprou_material: boolean;
  acesso_membros_url?: string | null;
  acesso_membros_liberado_em?: string | null;
  valor_ingresso: number;
  valor_matricula: number;
  valor_material: number;
  erro?: string;
  observacoes?: string;
  responsavel_id?: string;
  created_at: string;
}

interface NPAKanbanProps {
  npaEventoId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES: { id: NPAPhase; label: string; color: string }[] = [
  { id: 'novo',          label: 'Novo',          color: 'bg-white' },
  { id: 'ingresso_pago', label: 'Ingresso Pago', color: 'bg-[#f0fdf4]' },
  { id: 'no_grupo',      label: 'No Grupo',      color: 'bg-[#eff6ff]' },
  { id: 'confirmado',    label: 'Confirmado',    color: 'bg-[#fefce8]' },
  { id: 'evento',        label: 'Evento',        color: 'bg-[#faf5ff]' },
  { id: 'closer',        label: 'Closer',        color: 'bg-[#fff7ed]' },
  { id: 'follow_up_01',  label: 'Follow Up 01',  color: 'bg-[#fef2f2]' },
  { id: 'follow_up_02',  label: 'Follow Up 02',  color: 'bg-[#fef2f2]' },
  { id: 'follow_up_03',  label: 'Follow Up 03',  color: 'bg-[#fef2f2]' },
  { id: 'matricula',     label: 'Matrícula ✅',  color: 'bg-[#ecfdf5]' },
];

const TURMA_VIEWS: { id: TurmaView; label: string }[] = [
  { id: 'todas',       label: 'Todas' },
  { id: 'manha',       label: '☀️ Manhã' },
  { id: 'tarde',       label: '🌆 Tarde' },
  { id: 'lado_a_lado', label: '⬛⬛ Lado a Lado' },
];

const VALOR_MATRICULA_PADRAO = 397;
const VALOR_MATERIAL_PADRAO  = 97;

// ─── Phase → boolean flags (trigger sync_fase_npa_lead recalcula fase a partir desses campos) ──
// Para mover um lead para uma fase, setamos o flag correspondente como true
// e limpamos todos os flags de fases com MAIOR prioridade no trigger.

function getPhasePayload(newPhase: NPAPhase): Record<string, boolean> {
  switch (newPhase) {
    case 'novo':
      return { ingresso_pago: false, no_grupo: false, presente_evento: false, esteve_no_evento: false, closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'ingresso_pago':
      return { ingresso_pago: true, no_grupo: false, presente_evento: false, esteve_no_evento: false, closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'no_grupo':
      return { no_grupo: true, presente_evento: false, esteve_no_evento: false, closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'confirmado':
      return { presente_evento: true, esteve_no_evento: false, closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'evento':
      return { esteve_no_evento: true, closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'closer':
      return { closer: true, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'follow_up_01':
      return { follow_up_01: true, follow_up_02: false, follow_up_03: false, matriculado: false };
    case 'follow_up_02':
      return { follow_up_02: true, follow_up_03: false, matriculado: false };
    case 'follow_up_03':
      return { follow_up_03: true, matriculado: false };
    case 'matricula':
      return { matriculado: true };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOAS_VINDAS_FALLBACK = `🌟 Bem-vindo(a) ao {{evento_nome}}!\nSua inscrição está confirmada! 🙌\n\nAguarde as próximas mensagens com informações do evento.\n\nQualquer dúvida, estamos por aqui!`;

async function sendWppDirect(numero: string, mensagem: string): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    body: JSON.stringify({ numero, mensagem, typing_delay_ms: 2000 }),
  });
  // wpp-enviar sempre responde HTTP 200 (mesmo em erro da Evolution) e sinaliza
  // sucesso/falha real no corpo -- checar só res.ok marcava envios falhos como enviados.
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return data?.ok === true;
}

async function sendBoasVindasLead(
  lead: { id: string; nome: string; whatsapp: string; turma: string },
  nomeEvento: string,
  onSent: (patch: { bv_enviado: boolean; bv_enviado_em: string }) => Promise<void>,
): Promise<boolean> {
  try {
    const { data: fConfig } = await supabase
      .from('funnel_configs')
      .select('variaveis')
      .eq('funnel_name', nomeEvento)
      .maybeSingle();

    const variaveis: Record<string, string> = (fConfig as any)?.variaveis ?? {};
    const tpl = lead.turma === 'tarde'
      ? (variaveis['bv_wpp_tarde'] || variaveis['bv_wpp_manha'])
      : variaveis['bv_wpp_manha'];

    const linkGrupo = lead.turma === 'tarde'
      ? (variaveis['link_grupo_tarde'] || variaveis['link_grupo_2'] || variaveis['link_grupo_manha'] || '')
      : (variaveis['link_grupo_manha'] || variaveis['link_grupo_1'] || '');

    const mensagem = (tpl || BOAS_VINDAS_FALLBACK)
      .replace(/\{\{nome\}\}/g, lead.nome || 'você')
      .replace(/\{\{evento_nome\}\}/g, nomeEvento)
      .replace(/\{\{turma\}\}/g, lead.turma === 'manha' ? 'Manhã' : 'Tarde')
      .replace(/\{\{link_grupo_manha\}\}/g, variaveis['link_grupo_manha'] || variaveis['link_grupo_1'] || '')
      .replace(/\{\{link_grupo_tarde\}\}/g, variaveis['link_grupo_tarde'] || variaveis['link_grupo_2'] || '')
      .replace(/\{\{link_grupo\}\}/g, linkGrupo);

    const ok = await sendWppDirect(lead.whatsapp, mensagem);
    if (!ok) {
      toast.error(`Erro ao enviar para ${lead.nome} — verifique o WhatsApp`);
      return false;
    }

    // Envia link do grupo separado se o template não incluiu {{link_grupo}}
    if (linkGrupo && !mensagem.includes(linkGrupo)) {
      await new Promise(r => setTimeout(r, 2000));
      await sendWppDirect(
        lead.whatsapp,
        `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento serão enviadas pelo grupo dos alunos.\n\n👉 Entre agora:\n${linkGrupo}`,
      );
    }

    await onSent({ bv_enviado: true, bv_enviado_em: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error('sendBoasVindasLead error:', (e as Error).message);
    toast.error(`Erro ao enviar para ${lead.nome}: ${(e as Error).message}`);
    return false;
  }
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pct = (value: number, total: number) =>
  total === 0 ? 0 : Math.round((value / total) * 100);

// ─── MetaBar ──────────────────────────────────────────────────────────────────

function MetaBar({ label, value, meta, color = '#be123c' }: {
  label: string; value: number; meta: number; color?: string;
}) {
  const progress = meta === 0 ? 0 : Math.min(100, Math.round((value / meta) * 100));
  const achieved = value >= meta && meta > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className={`font-bold ${achieved ? 'text-green-600' : 'text-gray-700'}`}>
          {value} / {meta === 0 ? '—' : meta}
          {achieved && ' ✅'}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, backgroundColor: achieved ? '#16a34a' : color }}
        />
      </div>
      <p className="text-right text-[10px] text-gray-400">{progress}% da meta</p>
    </div>
  );
}

// ─── FunilComprasPosEvento ──────────────────────────────────────────────────
// Segmenta os leads em baldes mutuamente exclusivos de resultado de venda —
// é a pergunta "quem comprou o quê" que antes exigia filtrar o Kanban na mão.

type FunilBucketId = 'nao_foi' | 'foi_sem_comprar' | 'comprou_material' | 'comprou_mentoria';

interface FunilBucket {
  id: FunilBucketId;
  label: string;
  bg: string;
  fg: string;
  leads: NPALead[];
}

function FunilComprasPosEvento({ leads }: { leads: NPALead[] }) {
  const [bucketAberto, setBucketAberto] = useState<FunilBucketId | null>(null);

  const compraramIngressoNaoForam = leads.filter((l) => l.ingresso_pago && !l.esteve_no_evento);
  const foiSemComprar             = leads.filter((l) => l.esteve_no_evento && !l.comprou_material && !l.matriculado);
  const foiComprouMaterial        = leads.filter((l) => l.esteve_no_evento && l.comprou_material && !l.matriculado);
  const foiComprouMentoria        = leads.filter((l) => l.esteve_no_evento && l.matriculado);

  const buckets: FunilBucket[] = [
    { id: 'nao_foi',            label: 'Comprou ingresso, não foi', bg: 'bg-gray-50 border-gray-200',   fg: 'text-gray-500',   leads: compraramIngressoNaoForam },
    { id: 'foi_sem_comprar',    label: 'Foi, não comprou nada',     bg: 'bg-gray-50 border-gray-200',   fg: 'text-gray-500',   leads: foiSemComprar },
    { id: 'comprou_material',   label: 'Foi, comprou material 🛍️', bg: 'bg-pink-50 border-pink-200',   fg: 'text-pink-700',   leads: foiComprouMaterial },
    { id: 'comprou_mentoria',   label: 'Foi, comprou mentoria 🎓',  bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700',  leads: foiComprouMentoria },
  ];

  const bucketSelecionado = buckets.find((b) => b.id === bucketAberto) ?? null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Depois do evento — funil de compras
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {buckets.map((b) => (
          <button
            key={b.id}
            onClick={() => setBucketAberto(b.id)}
            className={`rounded-xl border p-3 text-center transition-all hover:shadow-sm ${b.bg}`}
          >
            <p className={`text-[11px] leading-tight font-medium ${b.fg}`}>{b.label}</p>
            <p className={`text-2xl font-bold mt-1 ${b.fg}`}>{b.leads.length}</p>
          </button>
        ))}
        <div className="rounded-xl border border-dashed border-gray-200 p-3 text-center bg-white">
          <p className="text-[11px] leading-tight font-medium text-gray-400">Está no NPS 🚀</p>
          <p className="text-[10px] text-gray-300 mt-2">em breve</p>
        </div>
      </div>

      <Dialog open={!!bucketSelecionado} onOpenChange={(o) => !o && setBucketAberto(null)}>
        <DialogContent className="rounded-2xl max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{bucketSelecionado?.label}</DialogTitle>
            <DialogDescription>{bucketSelecionado?.leads.length ?? 0} lead(s)</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
            {bucketSelecionado?.leads.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum lead neste grupo ainda.</p>
            )}
            {bucketSelecionado?.leads.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{l.nome}</p>
                  <p className="text-xs text-gray-400">{l.whatsapp}</p>
                  {(l.comprou_material || l.matriculado) && (
                    <p className={`text-[10px] font-medium mt-0.5 ${l.acesso_membros_url ? 'text-green-600' : 'text-amber-600'}`}>
                      {l.acesso_membros_url ? '✅ Acesso liberado' : '⏳ Liberação pendente'}
                    </p>
                  )}
                </div>
                {l.whatsapp && (
                  <button
                    onClick={() => window.open(`https://wa.me/${l.whatsapp}`, '_blank')}
                    className="p-1.5 rounded-md text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors flex-shrink-0"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: NPALead;
  eventoFinalizado: boolean;
  onMove: (leadId: string, phase: NPAPhase) => void;
  onDelete: (lead: NPALead) => void;
  onToggleMaterial: (leadId: string, current: boolean) => void;
  onToggleMentoria: (leadId: string, current: boolean) => void;
}

const LeadCard = memo(({
  lead, eventoFinalizado, onMove, onDelete, onToggleMaterial, onToggleMentoria,
}: LeadCardProps) => {
  return (
    <div className={`p-3 rounded-xl border ${lead.erro ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-semibold text-sm text-gray-800 leading-tight">
          <NomePessoa nome={lead.nome} telefone={lead.whatsapp} />
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="p-1 rounded-md text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
            onClick={() => window.open(`https://wa.me/${lead.whatsapp}`, '_blank')}
            title="Abrir WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          {lead.ingresso_pago && (
            <span className="p-1 rounded-md text-orange-400" title="Ingresso pago">
              <Flame className="h-3.5 w-3.5" />
            </span>
          )}
          <button
            onClick={() => onDelete(lead)}
            className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Apagar lead"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2">{lead.whatsapp}</p>

      {lead.turma !== 'unica' && (
        <div className="mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${lead.turma === 'manha' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
            {lead.turma === 'manha' ? '☀️ Manhã' : '🌆 Tarde'}
          </span>
        </div>
      )}

      {/* Toggle comprou material — aparece em qualquer fase mas destaque no evento */}
      <button
        onClick={() => onToggleMaterial(lead.id, lead.comprou_material)}
        disabled={eventoFinalizado}
        title="Comprou material no evento"
        className={`mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
          lead.comprou_material
            ? 'bg-purple-50 border-purple-200 text-purple-700'
            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-purple-200 hover:text-purple-500'
        }`}
      >
        <ShoppingBag className="h-3 w-3 flex-shrink-0" />
        {lead.comprou_material ? 'Material comprado 🛍️' : 'Comprou material?'}
      </button>

      {/* Toggle comprou mentoria — independente da fase, dispara liberação de acesso */}
      <button
        onClick={() => onToggleMentoria(lead.id, lead.matriculado)}
        disabled={eventoFinalizado}
        title="Comprou a mentoria NPA"
        className={`mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
          lead.matriculado
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-amber-200 hover:text-amber-600'
        }`}
      >
        <Award className="h-3 w-3 flex-shrink-0" />
        {lead.matriculado ? 'Mentoria comprada 🎓' : 'Comprou mentoria?'}
      </button>

      <Select
        key={`${lead.id}-${lead.fase}`}
        value={lead.fase}
        onValueChange={(value) => onMove(lead.id, value as NPAPhase)}
        disabled={eventoFinalizado}
      >
        <SelectTrigger className="h-8 text-xs border-gray-200 rounded-lg bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PHASES.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});
LeadCard.displayName = 'LeadCard';

// ─── MatriculaColumnHeader ─────────────────────────────────────────────────────

function MatriculaColumnHeader({ leads, valorIngressoEvento }: {
  leads: NPALead[];
  valorIngressoEvento: number;
}) {
  const matriculados = leads.filter((l) => l.fase === 'matricula');
  const totalFat = matriculados.reduce(
    (acc, l) => acc + (Number(l.valor_matricula) > 0 ? Number(l.valor_matricula) : VALOR_MATRICULA_PADRAO),
    0,
  );
  const totalMat = matriculados.reduce(
    (acc, l) => acc + (l.comprou_material ? (Number(l.valor_material) > 0 ? Number(l.valor_material) : VALOR_MATERIAL_PADRAO) : 0),
    0,
  );

  if (matriculados.length === 0) return null;

  return (
    <div className="mb-3 p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md">
      <div className="flex items-center gap-1.5 mb-2">
        <Trophy className="h-3.5 w-3.5 text-yellow-300" />
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Faturamento</span>
      </div>
      <p className="text-xl font-black leading-none mb-0.5">{fmt(totalFat + totalMat)}</p>
      <div className="flex flex-col gap-0.5 mt-2 text-[11px] text-emerald-100">
        <span>💰 Matrículas: {fmt(totalFat)}</span>
        <span>🛍️ Materiais: {fmt(totalMat)}</span>
      </div>
    </div>
  );
}

// ─── Relatorio ────────────────────────────────────────────────────────────────

function Relatorio({
  evento,
  leads,
  onClose,
  onSaveMetas,
}: {
  evento: NPAEvento;
  leads: NPALead[];
  onClose: () => void;
  onSaveMetas: (metas: {
    meta_matriculas: number;
    meta_faturamento: number;
    meta_presentes: number;
    meta_ingressos: number;
  }) => Promise<void>;
}) {
  const [editandoMetas, setEditandoMetas] = useState(false);
  const [savingMetas, setSavingMetas] = useState(false);
  const [metaForm, setMetaForm] = useState({
    meta_matriculas: String(evento.meta_matriculas ?? 0),
    meta_faturamento: String(evento.meta_faturamento ?? 0),
    meta_presentes:   String(evento.meta_presentes ?? 0),
    meta_ingressos:   String(evento.meta_ingressos ?? 0),
  });

  // ── métricas reais ──
  const valorIngressoEvento = Number(evento.valor_ingresso)        || 10;
  const valorMaterialRelatorio = Number(evento.valor_material_padrao) || VALOR_MATERIAL_PADRAO;
  const totalLeads      = leads.length;
  const ingressosPagos  = leads.filter((l) => l.ingresso_pago).length;
  // esteve_no_evento = fase "Evento" (e acima); presente_evento = fase "Confirmado"
  const presentesEvento = leads.filter((l) => l.esteve_no_evento).length;
  const matriculados    = leads.filter((l) => l.matriculado);
  const totalMatriculas = matriculados.length;
  const comprouMaterial = leads.filter((l) => l.comprou_material).length;
  const materialNoDia   = leads.filter((l) => l.esteve_no_evento && l.comprou_material).length;

  // Receitas: sempre usam o valor do evento como base (multiplicação direta)
  const receitaIngressos  = ingressosPagos  * valorIngressoEvento;
  const receitaMatriculas = matriculados.reduce(
    (acc, l) => acc + (Number(l.valor_matricula) > 0 ? Number(l.valor_matricula) : VALOR_MATRICULA_PADRAO), 0,
  );
  const receitaMateriais  = comprouMaterial * valorMaterialRelatorio;
  const receitaTotal = receitaIngressos + receitaMatriculas + receitaMateriais;

  // conversões
  const convIngresso  = pct(ingressosPagos, totalLeads);
  const convPresente  = pct(presentesEvento, ingressosPagos);
  const convMatricula = pct(totalMatriculas, presentesEvento);

  // metas
  const mMat  = evento.meta_matriculas  ?? 0;
  const mFat  = evento.meta_faturamento ?? 0;
  const mPres = evento.meta_presentes   ?? 0;
  const mIng  = evento.meta_ingressos   ?? 0;

  const handleSave = async () => {
    setSavingMetas(true);
    await onSaveMetas({
      meta_matriculas:  Number(metaForm.meta_matriculas)  || 0,
      meta_faturamento: Number(metaForm.meta_faturamento) || 0,
      meta_presentes:   Number(metaForm.meta_presentes)   || 0,
      meta_ingressos:   Number(metaForm.meta_ingressos)   || 0,
    });
    setSavingMetas(false);
    setEditandoMetas(false);
  };

  const StatCard = ({ icon, label, value, sub, color = '#be123c' }: {
    icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
  }) => (
    <Card className="p-4 border border-gray-100 shadow-sm rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}18` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </Card>
  );

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-900">📊 Relatório — {evento.nome}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{evento.status === 'finalizado' ? '✅ Finalizado' : '🚀 Em Andamento'}</p>
          </div>
        </div>
        <button
          onClick={() => setEditandoMetas(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Definir Metas
        </button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />}     label="Total de Leads"    value={String(totalLeads)}    color="#6366f1" />
        <StatCard icon={<Flame className="h-4 w-4" />}     label="Ingressos Pagos"   value={String(ingressosPagos)} sub={fmt(receitaIngressos)} color="#f97316" />
        <StatCard icon={<Target className="h-4 w-4" />}    label="Presentes"         value={String(presentesEvento)} color="#8b5cf6" />
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="Compraram Material" value={String(comprouMaterial)} sub={fmt(receitaMateriais)} color="#ec4899" />
        <StatCard icon={<Trophy className="h-4 w-4" />}    label="Matrículas"        value={String(totalMatriculas)} sub={fmt(receitaMatriculas)} color="#16a34a" />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Faturamento Estimado" value={fmt(receitaTotal)} sub="preço configurado × contagem, não é soma de pagamentos reais" color="#be123c" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Ticket Médio Mat." value={totalMatriculas > 0 ? fmt(receitaMatriculas / totalMatriculas) : 'R$ 0'} color="#0ea5e9" />
        <StatCard icon={<Percent className="h-4 w-4" />}   label="Conv. → Matrícula" value={`${convMatricula}%`} sub="dos presentes" color="#f59e0b" />
      </div>

      {/* Funil de conversão */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-[#be123c]" />
          <h2 className="font-black text-sm text-gray-800">Funil de Conversão</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Leads → Ingresso Pago', value: ingressosPagos, total: totalLeads,       color: '#f97316' },
            { label: 'Ingresso → Presente',   value: presentesEvento, total: ingressosPagos,  color: '#8b5cf6' },
            { label: 'Presente → Matrícula',  value: totalMatriculas, total: presentesEvento, color: '#16a34a' },
            { label: 'Evento → Material',      value: materialNoDia,   total: presentesEvento, color: '#ec4899' },
          ].map(({ label, value, total, color }) => {
            const p = pct(value, total);
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600 font-medium">{label}</span>
                  <span className="font-bold text-gray-800">{value}/{total} <span className="text-gray-400">({p}%)</span></span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${p}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Metas vs Realizado */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#be123c]" />
            <h2 className="font-black text-sm text-gray-800">Metas vs Realizado</h2>
          </div>
          {(mMat === 0 && mFat === 0 && mPres === 0 && mIng === 0) && (
            <button
              onClick={() => setEditandoMetas(true)}
              className="text-xs text-[#be123c] font-semibold hover:underline"
            >
              + Definir metas
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MetaBar label="Ingressos Pagos"   value={ingressosPagos}  meta={mIng}  color="#f97316" />
          <MetaBar label="Presentes"         value={presentesEvento} meta={mPres} color="#8b5cf6" />
          <MetaBar label="Matrículas"        value={totalMatriculas} meta={mMat}  color="#16a34a" />
          <MetaBar
            label="Faturamento Estimado"
            value={Math.round(receitaTotal)}
            meta={mFat}
            color="#be123c"
          />
        </div>
      </Card>

      {/* Lista de matriculados */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-green-600" />
          <h2 className="font-black text-sm text-gray-800">Matriculados ({totalMatriculas})</h2>
        </div>
        {matriculados.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma matrícula ainda.</p>
        ) : (
          <div className="space-y-2">
            {matriculados.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-xl bg-green-50 border border-green-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{l.nome}</p>
                  <p className="text-xs text-gray-400">{l.whatsapp}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">
                    {fmt(Number(l.valor_matricula) > 0 ? Number(l.valor_matricula) : VALOR_MATRICULA_PADRAO)}
                  </p>
                  {l.comprou_material && (
                    <span className="text-[10px] text-purple-600 font-medium">+ material 🛍️</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de metas */}
      {editandoMetas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-black text-gray-900 mb-1">🎯 Definir Metas</h2>
            <p className="text-sm text-gray-500 mb-4">Configure as metas para este NPA.</p>
            <div className="space-y-3">
              {[
                { label: 'Meta de Ingressos',     key: 'meta_ingressos',   placeholder: 'Ex: 50' },
                { label: 'Meta de Presentes',     key: 'meta_presentes',   placeholder: 'Ex: 40' },
                { label: 'Meta de Matrículas',    key: 'meta_matriculas',  placeholder: 'Ex: 10' },
                { label: 'Meta de Faturamento (R$)', key: 'meta_faturamento', placeholder: 'Ex: 5000' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
                  <Input
                    type="number"
                    placeholder={placeholder}
                    value={metaForm[key as keyof typeof metaForm]}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="outline" onClick={() => setEditandoMetas(false)} className="rounded-xl">Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={savingMetas}
                className="bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl font-semibold"
              >
                {savingMetas && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MetaTab ──────────────────────────────────────────────────────────────────

function MetaTab({
  evento,
  leads,
  onClose,
  onSaveMetas,
}: {
  evento: NPAEvento;
  leads: NPALead[];
  onClose: () => void;
  onSaveMetas: (metas: {
    meta_matriculas: number;
    meta_faturamento: number;
    meta_presentes: number;
    meta_ingressos: number;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [metaForm, setMetaForm] = useState({
    meta_matriculas:  String(evento.meta_matriculas  ?? 0),
    meta_faturamento: String(evento.meta_faturamento ?? 0),
    meta_presentes:   String(evento.meta_presentes   ?? 0),
    meta_ingressos:   String(evento.meta_ingressos   ?? 0),
  });

  // métricas reais
  const valorIngressoEvento  = Number(evento.valor_ingresso)        || 10;
  const valorMaterialEvento  = Number(evento.valor_material_padrao) || VALOR_MATERIAL_PADRAO;
  const ingressosPagos  = leads.filter((l) => l.ingresso_pago).length;
  const presentesEvento = leads.filter((l) => l.esteve_no_evento).length;
  const matriculados    = leads.filter((l) => l.matriculado);
  const totalMatriculas = matriculados.length;
  const comprouMaterial = leads.filter((l) => l.comprou_material).length;
  const materialNoDia   = leads.filter((l) => l.esteve_no_evento && l.comprou_material).length;

  const receitaIngressos  = ingressosPagos  * valorIngressoEvento;
  const receitaMatriculas = matriculados.reduce((acc, l) =>
    acc + (Number(l.valor_matricula) > 0 ? Number(l.valor_matricula) : VALOR_MATRICULA_PADRAO), 0);
  const receitaMateriais  = comprouMaterial * valorMaterialEvento;
  const receitaTotal = receitaIngressos + receitaMatriculas + receitaMateriais;

  const mMat  = evento.meta_matriculas  ?? 0;
  const mFat  = evento.meta_faturamento ?? 0;
  const mPres = evento.meta_presentes   ?? 0;
  const mIng  = evento.meta_ingressos   ?? 0;

  const handleSave = async () => {
    setSaving(true);
    await onSaveMetas({
      meta_matriculas:  Number(metaForm.meta_matriculas)  || 0,
      meta_faturamento: Number(metaForm.meta_faturamento) || 0,
      meta_presentes:   Number(metaForm.meta_presentes)   || 0,
      meta_ingressos:   Number(metaForm.meta_ingressos)   || 0,
    });
    setSaving(false);
  };

  const metaFields = [
    { label: 'Meta de Ingressos',        key: 'meta_ingressos',   placeholder: 'Ex: 50',    icon: <Flame className="h-4 w-4" />,    color: '#f97316' },
    { label: 'Meta de Presentes',        key: 'meta_presentes',   placeholder: 'Ex: 40',    icon: <Target className="h-4 w-4" />,   color: '#8b5cf6' },
    { label: 'Meta de Matrículas',       key: 'meta_matriculas',  placeholder: 'Ex: 10',    icon: <Trophy className="h-4 w-4" />,   color: '#16a34a' },
    { label: 'Meta de Faturamento (R$)', key: 'meta_faturamento', placeholder: 'Ex: 5000',  icon: <DollarSign className="h-4 w-4" />, color: '#be123c' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-black text-gray-900">🎯 Metas — {evento.nome}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Defina e acompanhe as metas do lançamento</p>
        </div>
      </div>

      {/* Formulário de metas */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-[#be123c]" />
          <h2 className="font-black text-sm text-gray-800">Definir Metas</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {metaFields.map(({ label, key, placeholder, icon, color }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <span style={{ color }}>{icon}</span>
                {label}
              </label>
              <Input
                type="number"
                placeholder={placeholder}
                value={metaForm[key as keyof typeof metaForm]}
                onChange={(e) => setMetaForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="rounded-xl"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl font-semibold px-6"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar Metas
          </Button>
        </div>
      </Card>

      {/* Meta vs Realidade */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-4 w-4 text-[#be123c]" />
          <h2 className="font-black text-sm text-gray-800">Meta vs Realidade</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MetaBar label="Ingressos Pagos"   value={ingressosPagos}  meta={mIng}  color="#f97316" />
          <MetaBar label="Presentes"         value={presentesEvento} meta={mPres} color="#8b5cf6" />
          <MetaBar label="Matrículas"        value={totalMatriculas} meta={mMat}  color="#16a34a" />
          <MetaBar label="Faturamento Estimado" value={Math.round(receitaTotal)} meta={mFat} color="#be123c" />
        </div>
      </Card>

      {/* Resumo rápido */}
      <Card className="p-5 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-[#be123c]" />
          <h2 className="font-black text-sm text-gray-800">Resumo do Lançamento</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Ingressos',        value: String(ingressosPagos),    sub: fmt(receitaIngressos),   color: '#f97316' },
            { label: 'Presentes',        value: String(presentesEvento),   sub: `${pct(presentesEvento, ingressosPagos)}% dos ingressos`, color: '#8b5cf6' },
            { label: 'Material Evento',  value: String(materialNoDia),     sub: `${pct(materialNoDia, presentesEvento)}% dos presentes`,  color: '#ec4899' },
            { label: 'Matrículas',       value: String(totalMatriculas),   sub: fmt(receitaMatriculas),  color: '#16a34a' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
              <p className="text-xl font-black" style={{ color }}>{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-rose-50 to-red-50 border border-rose-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#be123c]" />
              <span className="text-sm font-bold text-gray-800">Faturamento Estimado</span>
            </div>
            <span className="text-xl font-black text-[#be123c]">{fmt(receitaTotal)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Preço configurado × contagem — não é soma de pagamentos reais</p>
          {mFat > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {pct(Math.round(receitaTotal), mFat)}% da meta de {fmt(mFat)}
            </p>
          )}
        </div>
      </Card>

    </div>
  );
}

// ─── Disparo Types ────────────────────────────────────────────────────────────

interface NPADisparoLeadStatus {
  leadId: string;
  nome: string;
  whatsapp: string;
  status: 'pending' | 'sending' | 'done' | 'error';
  error?: string;
}

interface NPADisparoItem {
  id: string;
  nome: string;
  faseIds: string[];
  faseNomes: string[];
  template: string;
  typingDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  instanceName: string | null;
  leads: NPADisparoLeadStatus[];
  currentIdx: number;
  status: 'running' | 'paused' | 'done' | 'stopped';
  startedAt: number;
  countdownMs: number;
}

// ─── NPADisparoModal ──────────────────────────────────────────────────────────

function NPADisparoModal({
  open, onClose, leads, evoInstances, initialFases, onStart,
}: {
  open: boolean;
  onClose: () => void;
  leads: NPALead[];
  evoInstances: Array<{ instance_name: string }>;
  initialFases?: NPAPhase[];
  onStart: (config: {
    faseIds: NPAPhase[];
    template: string;
    typingDelayMs: number;
    minDelayMs: number;
    maxDelayMs: number;
    instanceName: string | null;
  }) => void;
}) {
  const [selectedFases, setSelectedFases] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState('Olá {{nome}}! 👋\n\nTemos uma novidade importante para você. Que tal a gente conversar?');
  const [typingDelaySecs, setTypingDelaySecs] = useState(3);
  const [minDelaySecs, setMinDelaySecs] = useState(10);
  const [maxDelaySecs, setMaxDelaySecs] = useState(25);
  const [instanceName, setInstanceName] = useState('__priority__');
  const [activeTab, setActiveTab] = useState<'fases' | 'mensagem' | 'antibano'>('fases');

  useEffect(() => {
    if (!open) return;
    if (initialFases && initialFases.length > 0) {
      setSelectedFases(new Set(initialFases));
      setActiveTab('mensagem');
    } else {
      setSelectedFases(new Set());
      setActiveTab('fases');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFase = (id: string) =>
    setSelectedFases(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selectedLeads = leads.filter(l => selectedFases.has(l.fase) && l.whatsapp);
  const avgSecs = (minDelaySecs + maxDelaySecs) / 2 + typingDelaySecs;
  const previewMessage = template
    .replace(/\{\{nome\}\}/g, 'Maria Silva')
    .replace(/\{\{whatsapp\}\}/g, '5511999999999');

  const handleStart = () => {
    if (selectedFases.size === 0) { toast.error('Selecione ao menos uma fase'); return; }
    if (!template.trim()) { toast.error('Digite a mensagem'); return; }
    if (minDelaySecs > maxDelaySecs) { toast.error('Delay mínimo não pode ser maior que o máximo'); return; }
    onStart({
      faseIds: [...selectedFases] as NPAPhase[],
      template,
      typingDelayMs: typingDelaySecs * 1000,
      minDelayMs: minDelaySecs * 1000,
      maxDelayMs: maxDelaySecs * 1000,
      instanceName: instanceName === '__priority__' ? null : instanceName,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" /> Disparo por Fase — NPA
          </DialogTitle>
          <DialogDescription>Selecione as fases, configure o template e dispare com anti-ban.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border flex-shrink-0">
          {(['fases', 'mensagem', 'antibano'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {tab === 'fases' ? '📋 Fases' : tab === 'mensagem' ? '💬 Mensagem' : '🛡️ Anti-Ban'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-4">
          {activeTab === 'fases' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">Selecione as fases cujos leads receberão a mensagem. Apenas leads <strong>com WhatsApp</strong> serão disparados.</p>
              {PHASES.map(phase => {
                const total = leads.filter(l => l.fase === phase.id).length;
                const withWpp = leads.filter(l => l.fase === phase.id && l.whatsapp).length;
                const checked = selectedFases.has(phase.id);
                return (
                  <label key={phase.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleFase(phase.id)} className="w-4 h-4 rounded accent-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{phase.label}</p>
                      <p className="text-xs text-gray-400">{withWpp} com WhatsApp de {total} lead(s)</p>
                    </div>
                    {withWpp === 0 && <span className="text-xs text-amber-500 shrink-0">sem WPP</span>}
                  </label>
                );
              })}
              {selectedFases.size > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-medium text-green-800">✅ {selectedLeads.length} lead(s) com WhatsApp serão disparados</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mensagem' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Template da mensagem</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['{{nome}}', '{{whatsapp}}'].map(v => (
                    <button key={v} onClick={() => setTemplate(t => t + v)} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-mono transition-colors">{v}</button>
                  ))}
                </div>
                <textarea className="w-full h-40 text-sm font-mono border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" value={template} onChange={e => setTemplate(e.target.value)} placeholder="Digite a mensagem..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Prévia (WhatsApp)</label>
                <div className="bg-[#e5ddd5] rounded-lg p-4 max-h-52 overflow-y-auto">
                  <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-xs ml-auto">
                    <p className="text-sm whitespace-pre-wrap text-gray-800">{previewMessage}</p>
                    <p className="text-[10px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'antibano' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">🛡️ Anti-ban simula comportamento humano com delays aleatórios entre envios.</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 font-medium">Delay mínimo (segundos)</label>
                  <input type="number" min={3} max={300} value={minDelaySecs} onChange={e => setMinDelaySecs(Number(e.target.value))} className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 font-medium">Delay máximo (segundos)</label>
                  <input type="number" min={3} max={300} value={maxDelaySecs} onChange={e => setMaxDelaySecs(Number(e.target.value))} className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Digitação (segundos de "digitando…")</label>
                <input type="number" min={0} max={15} value={typingDelaySecs} onChange={e => setTypingDelaySecs(Number(e.target.value))} className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400">0 para desativar o indicador de digitação</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Instância Evolution</label>
                <select value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="__priority__">Automático (por prioridade)</option>
                  {evoInstances.map(inst => <option key={inst.instance_name} value={inst.instance_name}>{inst.instance_name}</option>)}
                </select>
              </div>
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500"><strong>Estimativa:</strong> {selectedLeads.length} lead(s) × {Math.round(avgSecs)}s médio ≈ <strong>{Math.round((selectedLeads.length * avgSecs) / 60)} minutos</strong></p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t flex-shrink-0">
          <p className="text-sm text-gray-500">{selectedLeads.length > 0 ? `${selectedLeads.length} lead(s) selecionados` : 'Nenhuma fase selecionada'}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleStart} disabled={selectedFases.size === 0 || selectedLeads.length === 0} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <Send className="h-4 w-4" /> Iniciar Disparo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NPADisparoPanel ──────────────────────────────────────────────────────────

function NPADisparoPanel({
  disparos, onPause, onResume, onStop, onDismiss,
}: {
  disparos: NPADisparoItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (disparos.length === 0) return null;
  const active = disparos.filter(d => d.status === 'running' || d.status === 'paused').length;

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50 shadow-2xl rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 transition-colors" onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          <span className="text-sm font-semibold">Disparos NPA{active > 0 ? ` (${active} ativo${active > 1 ? 's' : ''})` : ' (concluídos)'}</span>
        </div>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
          {disparos.map(disp => {
            const done  = disp.leads.filter(l => l.status === 'done' || l.status === 'error').length;
            const total = disp.leads.length;
            const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
            const errors = disp.leads.filter(l => l.status === 'error').length;
            const sending = disp.leads[disp.currentIdx];
            return (
              <div key={disp.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{disp.nome}</p>
                    <p className="text-xs text-gray-400 truncate">{disp.faseNomes.join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {disp.status === 'running' && <button onClick={() => onPause(disp.id)} title="Pausar" className="p-1.5 rounded hover:bg-amber-50 text-amber-600"><Pause className="h-3.5 w-3.5" /></button>}
                    {disp.status === 'paused' && <button onClick={() => onResume(disp.id)} title="Retomar" className="p-1.5 rounded hover:bg-green-50 text-green-600"><Play className="h-3.5 w-3.5" /></button>}
                    {(disp.status === 'running' || disp.status === 'paused') && <button onClick={() => onStop(disp.id)} title="Parar" className="p-1.5 rounded hover:bg-red-50 text-red-500"><Square className="h-3.5 w-3.5" /></button>}
                    {(disp.status === 'done' || disp.status === 'stopped') && <button onClick={() => onDismiss(disp.id)} title="Fechar" className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><XIcon className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{done}/{total} enviados</span>
                    <span>
                      {disp.status === 'running' && disp.countdownMs > 0 ? `⏱ ${Math.ceil(disp.countdownMs / 1000)}s` :
                       disp.status === 'paused' ? '⏸ Pausado' :
                       disp.status === 'done' ? '✅ Concluído' :
                       disp.status === 'stopped' ? '🛑 Parado' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${disp.status === 'done' ? 'bg-green-500' : disp.status === 'stopped' ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {disp.status === 'running' && sending?.status === 'sending' && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 truncate"><Loader2 className="h-3 w-3 animate-spin shrink-0" />Enviando para {sending.nome}…</p>
                )}
                {errors > 0 && <p className="text-xs text-red-500">{errors} erro{errors > 1 ? 's' : ''} de envio</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── BoasVindasPendentesPanel ─────────────────────────────────────────────────

function BoasVindasPendentesPanel({
  leads, npaEventoId, nomeEvento,
}: {
  leads: NPALead[];
  npaEventoId: string;
  nomeEvento: string;
}) {
  const pendentes = leads.filter(l => l.ingresso_pago && !l.bv_enviado && l.whatsapp);
  const [sending, setSending] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  if (pendentes.length === 0) return null;

  const handleEnviarTodos = async () => {
    setSending(true);

    for (const lead of pendentes) {
      if (sentIds.has(lead.id)) continue;
      await sendBoasVindasLead(lead, nomeEvento, async (patch) => {
        await supabase.from('npa_evento_leads').update(patch).eq('id', lead.id);
        setSentIds(prev => new Set([...prev, lead.id]));
      });
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
    }

    setSending(false);
    toast.success('Boas-vindas enviadas!');
  };

  const restantes = pendentes.filter(l => !sentIds.has(l.id));

  if (restantes.length === 0 && sentIds.size > 0) return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
      Boas-vindas enviadas para todos os {sentIds.size} lead(s) com ingresso pago! ✅
    </div>
  );

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-lg">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">
            {restantes.length} lead{restantes.length > 1 ? 's' : ''} com ingresso pago nunca recebeu a mensagem de boas-vindas
          </p>
          <p className="text-xs text-amber-700">Clique para ver e enviar agora</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4 text-amber-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200">
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {restantes.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{lead.nome}</p>
                  <p className="text-xs text-gray-500">{lead.whatsapp} · {lead.turma === 'manha' ? '☀️ Manhã' : '🌆 Tarde'}</p>
                </div>
                <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">nunca enviado</span>
              </div>
            ))}
          </div>
          <Button
            onClick={handleEnviarTodos}
            disabled={sending}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
              : <><Send className="h-4 w-4" /> Enviar boas-vindas para todos ({restantes.length})</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── NPAVerificarGruposModal ──────────────────────────────────────────────────

function NPAVerificarGruposModal({
  open, onClose, nomeEvento,
}: {
  open: boolean;
  onClose: () => void;
  nomeEvento: string;
}) {
  const [jidManha, setJidManha]       = useState('');
  const [jidTarde, setJidTarde]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [verifying, setVerifying]     = useState(false);
  const [result, setResult]           = useState<{ npa_updated: number; lanc_updated: number; _debug?: unknown[] } | null>(null);

  // Carrega os JIDs atuais do funnel_configs quando abre
  useEffect(() => {
    if (!open || !nomeEvento) return;
    setResult(null);
    setLoading(true);
    supabase
      .from('funnel_configs')
      .select('grupo_1_id, grupo_2_id')
      .eq('funnel_name', nomeEvento)
      .maybeSingle()
      .then(({ data }) => {
        setJidManha((data as any)?.grupo_1_id || '');
        setJidTarde((data as any)?.grupo_2_id || '');
        setLoading(false);
      });
  }, [open, nomeEvento]);

  const handleSaveJids = async () => {
    setSaving(true);
    await supabase
      .from('funnel_configs')
      .upsert({ funnel_name: nomeEvento, grupo_1_id: jidManha, grupo_2_id: jidTarde }, { onConflict: 'funnel_name' });
    setSaving(false);
    toast.success('IDs dos grupos salvos!');
  };

  const handleVerificar = async () => {
    // Salva antes de verificar
    await supabase
      .from('funnel_configs')
      .upsert({ funnel_name: nomeEvento, grupo_1_id: jidManha, grupo_2_id: jidTarde }, { onConflict: 'funnel_name' });

    setVerifying(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/verificar-grupos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ nomeNpa: nomeEvento }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { toast.error(data.error || 'Erro na verificação'); return; }
      setResult(data);
      toast.success(`Verificação concluída — ${data.npa_updated} lead(s) atualizados`);
    } catch (e: unknown) {
      toast.error('Erro: ' + (e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const isValidJid = (v: string) => !v || v.endsWith('@g.us');

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" /> Verificar Grupos — {nomeEvento}
          </DialogTitle>
          <DialogDescription>
            Configure os IDs dos grupos WhatsApp e sincronize automaticamente quem está em cada grupo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Info box */}
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
              🤖 O sistema verifica automaticamente às <strong>7h e 19h</strong> quem entrou em cada grupo e atualiza o campo <strong>"No Grupo"</strong> dos leads.
              <br />Use o botão abaixo para sincronizar agora mesmo.
            </div>

            {/* Grupo Manhã */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                ☀️ Grupo Manhã — ID WhatsApp
                {jidManha && !isValidJid(jidManha) && (
                  <span className="text-xs text-amber-600 font-normal">⚠ precisa terminar com @g.us</span>
                )}
                {jidManha && isValidJid(jidManha) && jidManha && (
                  <span className="text-xs text-green-600 font-normal">✓ válido</span>
                )}
              </label>
              <Input
                value={jidManha}
                onChange={e => setJidManha(e.target.value.trim())}
                placeholder="120363xxxxxxxx@g.us"
                className="rounded-xl font-mono text-xs"
              />
              <p className="text-[10px] text-gray-400">Obtenha o ID via "Buscar grupos" no wizard de configuração</p>
            </div>

            {/* Grupo Tarde */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                🌆 Grupo Tarde — ID WhatsApp
                {jidTarde && !isValidJid(jidTarde) && (
                  <span className="text-xs text-amber-600 font-normal">⚠ precisa terminar com @g.us</span>
                )}
                {jidTarde && isValidJid(jidTarde) && jidTarde && (
                  <span className="text-xs text-green-600 font-normal">✓ válido</span>
                )}
              </label>
              <Input
                value={jidTarde}
                onChange={e => setJidTarde(e.target.value.trim())}
                placeholder="120363xxxxxxxx@g.us"
                className="rounded-xl font-mono text-xs"
              />
            </div>

            {/* Resultado + Debug */}
            {result && (
              <div className="space-y-2">
                <div className={`p-3 rounded-xl border ${result.npa_updated > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className={`text-sm font-semibold ${result.npa_updated > 0 ? 'text-green-800' : 'text-amber-800'}`}>
                    {result.npa_updated > 0 ? '✅' : '⚠️'} Verificação concluída — {result.npa_updated} lead(s) atualizados
                  </p>
                </div>
                {result._debug && (result._debug as any[]).map((d: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] space-y-1.5 overflow-x-auto">
                    {d.erro ? (
                      <p className="text-red-600 font-medium">❌ {d.erro}</p>
                    ) : (
                      <>
                        {/* Participantes */}
                        <div className={`flex items-center gap-2 p-2 rounded-lg ${d.participantes_manha_phones > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                          <span className="font-semibold">☀️ Manhã:</span>
                          <span>{d.participantes_manha_phones} telefones encontrados no grupo</span>
                          {d.participantes_manha_amostra?.length > 0 && <span className="font-mono opacity-70">[{d.participantes_manha_amostra.join(', ')}]</span>}
                        </div>
                        <div className={`flex items-center gap-2 p-2 rounded-lg ${d.participantes_tarde_phones > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                          <span className="font-semibold">🌆 Tarde:</span>
                          <span>{d.participantes_tarde_phones} telefones encontrados no grupo</span>
                          {d.participantes_tarde_amostra?.length > 0 && <span className="font-mono opacity-70">[{d.participantes_tarde_amostra.join(', ')}]</span>}
                        </div>
                        {/* Leads */}
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-700">
                          <span className="font-semibold">Leads no DB:</span> {d.leads_total}
                          {d.leads_amostra?.length > 0 && (
                            <div className="mt-1 font-mono text-[10px] text-gray-500 space-y-0.5">
                              {d.leads_amostra.map((l: any, i: number) => (
                                <div key={i}>{l.wpp} → suffix8: <b>{l.s8}</b> ({l.turma})</div>
                              ))}
                            </div>
                          )}
                        </div>
                        {(d.participantes_manha_phones === 0 && d.participantes_tarde_phones === 0) && (
                          <p className="text-amber-700 text-[11px] p-2 bg-amber-50 rounded-lg">
                            ⚠️ Nenhum telefone retornado da Evolution API. Verifique se os JIDs estão corretos e se a instância está conectada.
                          </p>
                        )}
                        {(d.participantes_manha_phones > 0 || d.participantes_tarde_phones > 0) && d.leads_total > 0 && d.atualizados === 0 && (
                          <p className="text-amber-700 text-[11px] p-2 bg-amber-50 rounded-lg">
                            ⚠️ Participantes encontrados mas nenhum telefone bate com os leads. Compare os suffix8 acima.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleSaveJids} disabled={saving} className="flex-1 rounded-xl">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar IDs
              </Button>
              <Button
                onClick={handleVerificar}
                disabled={verifying || (!jidManha && !jidTarde)}
                className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {verifying
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</>
                  : <><CheckCircle2 className="h-4 w-4" /> Verificar Agora</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NPAKanban({ npaEventoId }: NPAKanbanProps) {
  const [evento, setEvento]                     = useState<NPAEvento | null>(null);
  const [leads, setLeads]                       = useState<NPALead[]>([]);
  const [searchWhatsapp, setSearchWhatsapp]     = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading]                   = useState(true);
  const [isAddingLead, setIsAddingLead]         = useState(false);
  const [turmaView, setTurmaView]               = useState<TurmaView>('todas');
  const [activeView, setActiveView]             = useState<ActiveView>('kanban');
  const [newLeadForm, setNewLeadForm]           = useState({ nome: '', whatsapp: '', email: '', turma: 'unica' as Turma });
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [leadToDelete, setLeadToDelete]         = useState<NPALead | null>(null);
  const [editingLead, setEditingLead]           = useState<NPALead | null>(null);
  const [editLeadForm, setEditLeadForm]         = useState({ nome: '', whatsapp: '', email: '', observacoes: '', turma: 'unica' as Turma });
  const [showEditIngressoModal, setShowEditIngressoModal] = useState(false);
  const [novoValorIngresso, setNovoValorIngresso]         = useState('');
  const [savingIngresso, setSavingIngresso]               = useState(false);
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [novoValorMaterial, setNovoValorMaterial]         = useState('');
  const [savingMaterial, setSavingMaterial]               = useState(false);

  // Column management
  const [renamingColuna, setRenamingColuna]   = useState<KanbanColuna | null>(null);
  const [deletingColuna, setDeletingColuna]   = useState<KanbanColuna | null>(null);
  const [settingsColuna, setSettingsColuna]   = useState<KanbanColuna | null>(null);

  // Verificar grupos
  const [showVerificarGrupos, setShowVerificarGrupos] = useState(false);

  // Disparo por fase
  const [disparos, setDisparos]               = useState<NPADisparoItem[]>([]);
  const [showDisparoModal, setShowDisparoModal] = useState(false);
  const [preselectFase, setPreselectFase]     = useState<NPAPhase | null>(null);
  const [evoInstances, setEvoInstances]       = useState<Array<{ instance_name: string }>>([]);
  const disparosStopMap  = useRef<Map<string, boolean>>(new Map());
  const disparosPauseMap = useRef<Map<string, boolean>>(new Map());

  // Shared column hook
  const {
    colunas, colunasRef,
    addColuna, renameColuna, deleteColuna, moveColuna, updateRegraColuna,
  } = useKanbanColunas('npa', npaEventoId);

  // ── pendingUpdates guard ──────────────────────────────────────────────────
  const pendingUpdates = useRef<Map<string, NPAPhase>>(new Map());
  const leadsRef       = useRef<NPALead[]>([]);
  const eventoRef      = useRef<NPAEvento | null>(null);
  useEffect(() => { leadsRef.current = leads; }, [leads]);
  useEffect(() => { eventoRef.current = evento; }, [evento]);

  // ── Load evento ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!npaEventoId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('npa_eventos')
        .select('*')
        .eq('id', npaEventoId)
        .single();
      if (error) { toast.error('Erro ao carregar NPA'); setLoading(false); return; }
      setEvento(data as NPAEvento);
      setLoading(false);
    })();
  }, [npaEventoId]);

  // ── Load leads ────────────────────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    const { data } = await supabase
      .from('npa_evento_leads')
      .select('*')
      .eq('npa_evento_id', npaEventoId)
      .order('created_at', { ascending: false });
    if (!data) return;
    setLeads(
      (data as NPALead[]).map((lead) => {
        const pending = pendingUpdates.current.get(lead.id);
        return pending ? { ...lead, fase: pending } : lead;
      }),
    );
  }, [npaEventoId]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!npaEventoId) return;
    loadLeads();

    const channel = supabase
      .channel(`npa-leads-${npaEventoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'npa_evento_leads', filter: `npa_evento_id=eq.${npaEventoId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as NPALead)?.id;
            if (deletedId) setLeads((prev) => prev.filter((l) => l.id !== deletedId));
            return;
          }

          const updatedLead = payload.new as NPALead;
          if (!updatedLead?.id) return;

          if (payload.eventType === 'INSERT') {
            setLeads((prev) => {
              if (prev.some((l) => l.id === updatedLead.id)) return prev; // evita duplicata
              return [updatedLead, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setLeads((prev) => prev.map((l) => {
              if (l.id !== updatedLead.id) return l;
              // Se há fase pendente, ignora a fase do evento Realtime
              // (o estado correto já foi aplicado pelo handleMoveLead via .select())
              const expectedPhase = pendingUpdates.current.get(updatedLead.id);
              if (expectedPhase !== undefined) {
                return { ...updatedLead, fase: expectedPhase };
              }
              return updatedLead;
            }));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [npaEventoId, loadLeads]);

  // ── Toggle ativo ──────────────────────────────────────────────────────────
  const handleToggleActive = async () => {
    if (!evento) return;
    const novoAtivo  = !evento.ativo;
    const novoStatus = novoAtivo ? 'em_andamento' : 'finalizado';
    const eventoAnt  = evento;
    setEvento({ ...evento, ativo: novoAtivo, status: novoStatus });
    try {
      if (novoAtivo) await supabase.from('npa_eventos').update({ ativo: false }).neq('id', npaEventoId);
      const { error } = await supabase.from('npa_eventos').update({ ativo: novoAtivo, status: novoStatus }).eq('id', npaEventoId);
      if (error) { setEvento(eventoAnt); toast.error(`Erro: ${error.message}`); return; }
      toast.success(`NPA ${novoAtivo ? 'ativado' : 'desativado'}!`);
    } catch { setEvento(eventoAnt); toast.error('Erro inesperado.'); }
  };

  // ── Delete evento ─────────────────────────────────────────────────────────
  const handleDeleteEvento = async () => {
    const { error } = await supabase.from('npa_eventos').delete().eq('id', npaEventoId);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success('NPA apagado!');
    setShowDeleteModal(false);
    window.location.reload();
  };

  // ── Delete lead ───────────────────────────────────────────────────────────
  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    const { error } = await supabase.from('npa_evento_leads').delete().eq('id', leadToDelete.id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    setLeads((prev) => prev.filter((l) => l.id !== leadToDelete.id));
    toast.success('Lead apagado!');
    setLeadToDelete(null);
  };

  // ── Move lead ─────────────────────────────────────────────────────────────
  // O banco tem trigger BEFORE UPDATE (sync_fase_npa_lead) que recalcula
  // `fase` a partir dos campos booleanos. Não adianta setar `fase` direto —
  // precisamos atualizar os flags booleanos corretos.
  const handleMoveLead = useCallback(async (leadId: string, newPhase: NPAPhase) => {
    const previousLeads = leadsRef.current;

    // 1. Guard: bloqueia Realtime para esse lead durante a transição
    pendingUpdates.current.set(leadId, newPhase);

    // 2. Optimistic update local imediato
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, fase: newPhase } : l)));

    // 3. Monta payload com os flags booleanos corretos para a fase desejada
    const flagPayload = getPhasePayload(newPhase);

    // 4. Salva no banco (trigger recalcula fase automaticamente) e retorna confirmado
    const { data: updated, error } = await supabase
      .from('npa_evento_leads')
      .update({ ...flagPayload, ultima_atividade: new Date().toISOString() })
      .eq('id', leadId)
      .select('*')
      .single();

    if (error || !updated) {
      pendingUpdates.current.delete(leadId);
      toast.error('Erro ao mover lead' + (error ? ': ' + error.message : ''));
      setLeads(previousLeads);
      return;
    }

    // 5. Aplica o estado real retornado pelo banco
    setLeads((prev) => prev.map((l) => l.id === leadId ? (updated as NPALead) : l));

    // 6. Guard por 5s para descartar eventos Realtime atrasados
    setTimeout(() => {
      pendingUpdates.current.delete(leadId);
    }, 5000);

    // 7. Auto-envio de boas-vindas ao mover para ingresso_pago
    if (newPhase === 'ingresso_pago' && !(updated as NPALead).bv_enviado) {
      const nomeEvento = eventoRef.current?.nome ?? '';
      if (nomeEvento && (updated as NPALead).whatsapp) {
        void sendBoasVindasLead(
          updated as NPALead,
          nomeEvento,
          async (patch) => {
            await supabase.from('npa_evento_leads').update(patch).eq('id', leadId);
            setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, ...patch } : l));
          },
        );
      }
    }
  }, []);

  // ── Liberar acesso na Área de Membros IDM ─────────────────────────────────
  // Parte 2 do spec: dispara ao marcar material/mentoria como comprado, e
  // também é chamável de novo pelo botão "Tentar liberar de novo" no card
  // se a chamada falhar (repo separado, deploy independente).
  const [liberandoAcesso, setLiberandoAcesso] = useState<string | null>(null);
  const handleLiberarAcesso = useCallback(async (leadId: string, produtoSlug: 'ebook-telas-npa' | 'mentoria-npa') => {
    setLiberandoAcesso(leadId);
    try {
      const { data, error } = await supabase.functions.invoke('npa-liberar-acesso-membros', {
        body: { leadId, produtoSlug },
      });
      const loginUrl = (data as { loginUrl?: string } | null)?.loginUrl;
      const invokeError = error?.message ?? (data as { error?: string } | null)?.error;
      if (invokeError || !loginUrl) {
        toast.error(`Liberação pendente: ${invokeError ?? 'a Área de Membros não respondeu'}`);
        return;
      }
      setLeads((prev) => prev.map((l) => l.id === leadId
        ? { ...l, acesso_membros_url: loginUrl, acesso_membros_liberado_em: new Date().toISOString() }
        : l));
      toast.success('Acesso liberado na Área de Membros!');
    } catch (e) {
      toast.error(`Erro ao liberar acesso: ${e instanceof Error ? e.message : 'desconhecido'}`);
    } finally {
      setLiberandoAcesso(null);
    }
  }, []);

  // ── Toggle material ───────────────────────────────────────────────────────
  const handleToggleMaterial = useCallback(async (leadId: string, current: boolean) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, comprou_material: !current } : l));
    const { error } = await supabase
      .from('npa_evento_leads')
      .update({ comprou_material: !current, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) {
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, comprou_material: current } : l));
      toast.error('Erro ao atualizar material');
      return;
    }
    if (!current) void handleLiberarAcesso(leadId, 'ebook-telas-npa');
  }, [handleLiberarAcesso]);

  // ── Toggle mentoria (matriculado) ─────────────────────────────────────────
  // Direto no campo, sem passar pelo dropdown de fase — o trigger
  // sync_fase_npa_lead recalcula `fase` sozinho a partir de `matriculado`.
  const handleToggleMentoria = useCallback(async (leadId: string, current: boolean) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, matriculado: !current } : l));
    const { error } = await supabase
      .from('npa_evento_leads')
      .update({ matriculado: !current, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) {
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, matriculado: current } : l));
      toast.error('Erro ao atualizar mentoria');
      return;
    }
    if (!current) void handleLiberarAcesso(leadId, 'mentoria-npa');
  }, [handleLiberarAcesso]);

  // ── Add lead ──────────────────────────────────────────────────────────────
  const handleAddLead = async () => {
    if (!newLeadForm.nome.trim() || !newLeadForm.whatsapp.trim()) return;
    setIsAddingLead(true);
    try {
      const { error } = await supabase.from('npa_evento_leads').insert({
        npa_evento_id: npaEventoId,
        nome: newLeadForm.nome,
        whatsapp: newLeadForm.whatsapp,
        email: newLeadForm.email || null,
        fase: 'novo',
        turma: newLeadForm.turma,
        ingresso_pago: false,
        presente_evento: false,
        closer: false,
        follow_up_01: false,
        follow_up_02: false,
        follow_up_03: false,
        matriculado: false,
        comprou_material: false,
      });
      if (error) { toast.error(`Erro: ${error.message}`); return; }
      toast.success('Lead adicionado!');
      setNewLeadForm({ nome: '', whatsapp: '', email: '', turma: 'unica' });
      setShowAddLeadModal(false);
      // NÃO chama loadLeads() — o Realtime INSERT cuida disso sem duplicar
    } catch { toast.error('Erro inesperado.'); }
    finally { setIsAddingLead(false); }
  };

  // ── Salvar valor ingresso ─────────────────────────────────────────────────
  const handleSaveValorIngresso = async () => {
    const valor = parseFloat(novoValorIngresso.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    setSavingIngresso(true);
    const { error } = await supabase.from('npa_eventos').update({ valor_ingresso: valor }).eq('id', npaEventoId);
    if (error) { toast.error('Erro: ' + error.message); }
    else {
      toast.success('Valor do ingresso atualizado!');
      setShowEditIngressoModal(false);
      setEvento((prev) => prev ? { ...prev, valor_ingresso: valor } : prev);
    }
    setSavingIngresso(false);
  };

  // ── Salvar valor material ─────────────────────────────────────────────────
  const handleSaveValorMaterial = async () => {
    const valor = parseFloat(novoValorMaterial.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    setSavingMaterial(true);
    const { error } = await supabase.from('npa_eventos').update({ valor_material_padrao: valor }).eq('id', npaEventoId);
    if (error) { toast.error('Erro: ' + error.message); }
    else {
      toast.success('Valor do material atualizado!');
      setShowEditMaterialModal(false);
      setEvento((prev) => prev ? { ...prev, valor_material_padrao: valor } : prev);
    }
    setSavingMaterial(false);
  };

  // ── Edit lead ─────────────────────────────────────────────────────────────
  const handleOpenEditLead = (lead: NPALead) => {
    setEditingLead(lead);
    setEditLeadForm({
      nome: lead.nome,
      whatsapp: lead.whatsapp,
      email: lead.email ?? '',
      observacoes: lead.observacoes ?? '',
      turma: lead.turma,
    });
  };

  const handleChangeTurma = async (leadId: string, nova: Turma) => {
    const { error } = await supabase.from('npa_evento_leads').update({ turma: nova }).eq('id', leadId);
    if (error) { toast.error('Erro ao trocar turma'); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, turma: nova } : l));
  };

  const handleSaveEditLead = async () => {
    if (!editingLead) return;
    const { error } = await supabase
      .from('npa_evento_leads')
      .update({
        nome: editLeadForm.nome,
        whatsapp: editLeadForm.whatsapp,
        email: editLeadForm.email || null,
        observacoes: editLeadForm.observacoes || null,
        turma: editLeadForm.turma,
      })
      .eq('id', editingLead.id);
    if (error) { toast.error('Erro ao salvar lead'); return; }
    setLeads(prev => prev.map(l => l.id === editingLead.id ? { ...l, ...editLeadForm } : l));
    setEditingLead(null);
    toast.success('Lead atualizado!');
  };

  // ── Delete column ─────────────────────────────────────────────────────────
  const handleDeleteColWithLeads = async (id: string) => {
    // NPA: can only delete custom columns (standard ones have fase_key)
    const col = colunasRef.current.find(c => c.id === id);
    if (col?.fase_key) { toast.error('Não é possível apagar colunas padrão do NPA'); return; }
    await deleteColuna(id);
    setDeletingColuna(null);
  };

  // ── Evo instances ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('evolution_config').select('instance_name').eq('ativo', true)
      .order('prioridade', { ascending: true })
      .then(({ data }) => setEvoInstances(data ?? []));
  }, []);

  // ── Disparo funcs ─────────────────────────────────────────────────────────
  const countdownDelay = async (disparoId: string, ms: number) => {
    const step = 300;
    let elapsed = 0;
    while (elapsed < ms) {
      if (disparosStopMap.current.get(disparoId)) return;
      if (disparosPauseMap.current.get(disparoId)) {
        await new Promise(r => setTimeout(r, step));
        continue;
      }
      setDisparos(prev => prev.map(d => d.id === disparoId ? { ...d, countdownMs: ms - elapsed } : d));
      await new Promise(r => setTimeout(r, step));
      elapsed += step;
    }
    setDisparos(prev => prev.map(d => d.id === disparoId ? { ...d, countdownMs: 0 } : d));
  };

  const runDisparo = async (id: string, disp: NPADisparoItem) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    for (let i = 0; i < disp.leads.length; i++) {
      if (disparosStopMap.current.get(id)) break;
      while (disparosPauseMap.current.get(id)) {
        if (disparosStopMap.current.get(id)) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (disparosStopMap.current.get(id)) break;

      const lead = disp.leads[i];
      setDisparos(prev => prev.map(d => d.id === id ? {
        ...d, currentIdx: i,
        leads: d.leads.map((l, idx) => idx === i ? { ...l, status: 'sending' } : l),
      } : d));

      const mensagem = disp.template
        .replace(/\{\{nome\}\}/g, lead.nome)
        .replace(/\{\{whatsapp\}\}/g, lead.whatsapp);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ numero: lead.whatsapp, mensagem, instance_name: disp.instanceName ?? undefined, typing_delay_ms: disp.typingDelayMs }),
        });
        const result = await res.json();
        setDisparos(prev => prev.map(d => d.id === id ? {
          ...d, currentIdx: i + 1,
          leads: d.leads.map((l, idx) => idx === i ? { ...l, status: result.ok ? 'done' : 'error', error: result.ok ? undefined : (result.error ?? 'Erro') } : l),
        } : d));
      } catch (e: unknown) {
        setDisparos(prev => prev.map(d => d.id === id ? {
          ...d, currentIdx: i + 1,
          leads: d.leads.map((l, idx) => idx === i ? { ...l, status: 'error', error: (e as Error).message } : l),
        } : d));
      }

      if (i < disp.leads.length - 1 && !disparosStopMap.current.get(id)) {
        const delay = Math.round(disp.minDelayMs + Math.random() * (disp.maxDelayMs - disp.minDelayMs));
        await countdownDelay(id, delay);
      }
    }

    setDisparos(prev => prev.map(d => d.id === id ? {
      ...d, status: disparosStopMap.current.get(id) ? 'stopped' : 'done', countdownMs: 0,
    } : d));
  };

  const handleStartDisparo = async (config: {
    faseIds: NPAPhase[];
    template: string;
    typingDelayMs: number;
    minDelayMs: number;
    maxDelayMs: number;
    instanceName: string | null;
  }) => {
    const campaignLeads = leads
      .filter(l => config.faseIds.includes(l.fase) && l.whatsapp)
      .map((l, i) => ({ nome: l.nome, phone: l.whatsapp, status: 'pendente', temperatura: 'morno', ordem: i }));

    if (campaignLeads.length === 0) { toast.error('Nenhum lead com WhatsApp nas fases selecionadas'); return; }

    const faseNomes = PHASES.filter(p => config.faseIds.includes(p.id)).map(p => p.label);
    const nomeEvento = evento?.nome ?? 'NPA';
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nomeCampanha = `${nomeEvento} — ${faseNomes.join(', ')} ${hora}`;

    // Descobre o evolution_config_id se o usuário escolheu uma instância específica
    let evolutionConfigId: string | null = null;
    if (config.instanceName) {
      const { data: evRow } = await supabase
        .from('evolution_config')
        .select('id')
        .eq('instance_name', config.instanceName)
        .maybeSingle();
      evolutionConfigId = evRow?.id ?? null;
    }

    const { data: camp, error: campErr } = await supabase
      .from('disparo_campanhas')
      .insert({
        nome: nomeCampanha,
        template: config.template,
        status: 'ativo',
        delay_min_s: Math.round(config.minDelayMs / 1000),
        delay_max_s: Math.round(config.maxDelayMs / 1000),
        safe_hour_start: 8,
        safe_hour_end: 21,
        daily_limit: 200,
        message_type: 'text',
        ...(evolutionConfigId ? { evolution_config_id: evolutionConfigId } : {}),
      })
      .select('id')
      .single();

    if (campErr || !camp) { toast.error('Erro ao criar campanha: ' + campErr?.message); return; }

    const leadsToInsert = campaignLeads.map(l => ({ ...l, campanha_id: camp.id }));
    const { error: leadsErr } = await supabase.from('disparo_leads').insert(leadsToInsert);
    if (leadsErr) { toast.error('Erro ao inserir leads: ' + leadsErr.message); return; }

    toast.success(`✅ Campanha criada com ${campaignLeads.length} lead(s) — acompanhe na Central de Disparos`);
  };

  // ── Salvar metas ──────────────────────────────────────────────────────────
  const handleSaveMetas = async (metas: {
    meta_matriculas: number; meta_faturamento: number;
    meta_presentes: number;  meta_ingressos: number;
  }) => {
    const { error } = await supabase.from('npa_eventos').update(metas).eq('id', npaEventoId);
    if (error) { toast.error('Erro ao salvar metas'); return; }
    toast.success('Metas salvas!');
    setEvento((prev) => prev ? { ...prev, ...metas } : prev);
  };

  // ── Filtro de leads ───────────────────────────────────────────────────────
  const getFilteredLeads = useCallback((turmaFilter?: 'manha' | 'tarde') => {
    let result = leads;
    if (turmaFilter) {
      result = result.filter((l) => l.turma === turmaFilter);
    } else if (turmaView === 'manha') {
      result = result.filter((l) => l.turma === 'manha');
    } else if (turmaView === 'tarde') {
      result = result.filter((l) => l.turma === 'tarde');
    }
    if (searchWhatsapp) {
      const q = searchWhatsapp.toLowerCase();
      result = result.filter((l) =>
        l.nome.toLowerCase().includes(q) || l.whatsapp.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, turmaView, searchWhatsapp]);

  // ── Métricas do header ────────────────────────────────────────────────────
  const valorIngressoEvento  = Number(evento?.valor_ingresso)        || 10;
  const valorMaterialEvento  = Number(evento?.valor_material_padrao) || VALOR_MATERIAL_PADRAO;
  const totalLeads           = leads.length;
  const ingressosPagos       = leads.filter((l) => l.ingresso_pago).length;
  const presentesEvento      = leads.filter((l) => l.esteve_no_evento).length;  // fase "Evento" ou acima
  const matriculas           = leads.filter((l) => l.matriculado).length;
  const comprouMaterial      = leads.filter((l) => l.comprou_material).length;
  const materialNoDia        = leads.filter((l) => l.esteve_no_evento && l.comprou_material).length;
  // Receitas: sempre multiplicam pelo valor do evento (atualiza quando o valor muda)
  const receitaIngressos     = ingressosPagos * valorIngressoEvento;
  const receitaMatriculas    = leads
    .filter((l) => l.matriculado)
    .reduce((acc, l) => acc + (Number(l.valor_matricula) > 0 ? Number(l.valor_matricula) : VALOR_MATRICULA_PADRAO), 0);
  const receitaMateriais     = comprouMaterial * valorMaterialEvento;

  // ── Render kanban ─────────────────────────────────────────────────────────
  const renderKanban = (turmaFilter?: 'manha' | 'tarde', showTitle?: boolean) => {
    const filteredLeads = getFilteredLeads(turmaFilter);

    // Use dynamic colunas; fall back to PHASES if hook hasn't loaded yet
    const displayCols = colunas.length > 0
      ? colunas
      : PHASES.map((p, i) => ({
          id: p.id, nome: p.label, ordem: i,
          fase_key: p.id, cor: null, meta_leads: null, tipo_regra: 'normal',
        } as KanbanColuna));

    return (
      <div className="space-y-3">
        {showTitle && (
          <h3 className="font-semibold text-base text-gray-700 flex items-center gap-2">
            {turmaFilter === 'manha' ? '☀️ Turma Manhã' : '🌆 Turma Tarde'}
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredLeads.length} leads
            </span>
          </h3>
        )}
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max items-start">
            {displayCols.map((coluna) => {
              const faseKey = coluna.fase_key as NPAPhase | undefined;
              const phaseLeads = filteredLeads.filter((l) =>
                faseKey ? l.fase === faseKey : false
              );
              const bgColor = faseKey
                ? (PHASES.find(p => p.id === faseKey)?.color ?? 'bg-white')
                : 'bg-white';
              return (
                <div key={coluna.id} className={`group/col flex-shrink-0 w-[260px]`}>
                  <div className={`${bgColor} rounded-2xl border border-gray-100 p-3 h-full min-h-[120px]`}>
                    <KanbanColunaHeader
                      coluna={coluna}
                      count={phaseLeads.length}
                      disabled={evento?.status === 'finalizado'}
                      onRename={() => setRenamingColuna(coluna)}
                      onDelete={() => setDeletingColuna(coluna)}
                      onMoveLeft={() => moveColuna(coluna.id, 'left')}
                      onMoveRight={() => moveColuna(coluna.id, 'right')}
                      onOpenSettings={() => setSettingsColuna(coluna)}
                    />

                    {faseKey && phaseLeads.filter(l => l.whatsapp).length > 0 && (
                      <button
                        onClick={() => { setPreselectFase(faseKey); setShowDisparoModal(true); }}
                        className="mt-1 mb-1 w-full flex items-center justify-center gap-1.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover/col:opacity-100"
                        title={`Disparar para ${phaseLeads.filter(l => l.whatsapp).length} lead(s) desta fase`}
                      >
                        <Send className="h-3 w-3" />
                        Disparar ({phaseLeads.filter(l => l.whatsapp).length})
                      </button>
                    )}

                    {/* Faturamento card — só na coluna matrícula */}
                    {faseKey === 'matricula' && (
                      <MatriculaColumnHeader leads={leads} valorIngressoEvento={valorIngressoEvento} />
                    )}

                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
                      {phaseLeads.map((lead) => (
                        <div key={lead.id} className={`p-3 rounded-xl border ${lead.erro ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} shadow-sm hover:shadow-md transition-all`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-800 leading-tight">{lead.nome}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                className="p-1 rounded-md text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
                                onClick={() => window.open(`https://wa.me/${lead.whatsapp}`, '_blank')}
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </button>
                              {lead.ingresso_pago && (
                                <span className="p-1 rounded-md text-orange-400" title="Ingresso pago">
                                  <Flame className="h-3.5 w-3.5" />
                                </span>
                              )}
                              <button
                                onClick={() => handleOpenEditLead(lead)}
                                className="p-1 rounded-md text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                title="Editar lead"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setLeadToDelete(lead)}
                                className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Apagar lead"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 mb-2">{lead.whatsapp}</p>
                          <div className="mb-2">
                            <Select
                              value={lead.turma}
                              onValueChange={(v) => handleChangeTurma(lead.id, v as Turma)}
                              disabled={evento?.status === 'finalizado'}
                            >
                              <SelectTrigger className={`h-6 text-xs px-2 rounded-full border-0 font-medium w-auto ${
                                lead.turma === 'manha' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                                lead.turma === 'tarde' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unica">Turma Única</SelectItem>
                                <SelectItem value="manha">☀️ Manhã</SelectItem>
                                <SelectItem value="tarde">🌆 Tarde</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <button
                            onClick={() => handleToggleMaterial(lead.id, lead.comprou_material)}
                            disabled={evento?.status === 'finalizado'}
                            title="Comprou material no evento"
                            className={`mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                              lead.comprou_material
                                ? 'bg-purple-50 border-purple-200 text-purple-700'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-purple-200 hover:text-purple-500'
                            }`}
                          >
                            <ShoppingBag className="h-3 w-3 flex-shrink-0" />
                            {lead.comprou_material ? 'Material comprado 🛍️' : 'Comprou material?'}
                          </button>
                          <button
                            onClick={() => handleToggleMentoria(lead.id, lead.matriculado)}
                            disabled={evento?.status === 'finalizado'}
                            title="Comprou a mentoria NPA"
                            className={`mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                              lead.matriculado
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-amber-200 hover:text-amber-600'
                            }`}
                          >
                            <Award className="h-3 w-3 flex-shrink-0" />
                            {lead.matriculado ? 'Mentoria comprada 🎓' : 'Comprou mentoria?'}
                          </button>
                          {(lead.comprou_material || lead.matriculado) && (
                            lead.acesso_membros_url ? (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(lead.acesso_membros_url!);
                                  toast.success('Link de acesso copiado!');
                                }}
                                className="mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-all"
                                title="Copiar link de acesso à Área de Membros"
                              >
                                <Copy className="h-3 w-3 flex-shrink-0" />
                                Copiar acesso ✅
                              </button>
                            ) : (
                              <button
                                onClick={() => handleLiberarAcesso(lead.id, lead.matriculado ? 'mentoria-npa' : 'ebook-telas-npa')}
                                disabled={liberandoAcesso === lead.id}
                                className="mb-2 w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-50"
                                title="Tentar liberar de novo o acesso à Área de Membros"
                              >
                                <Copy className="h-3 w-3 flex-shrink-0" />
                                {liberandoAcesso === lead.id ? 'Liberando...' : 'Liberação pendente — tentar de novo'}
                              </button>
                            )
                          )}
                          <Select
                            key={`${lead.id}-${lead.fase}`}
                            value={lead.fase}
                            onValueChange={(value) => handleMoveLead(lead.id, value as NPAPhase)}
                            disabled={evento?.status === 'finalizado'}
                          >
                            <SelectTrigger className="h-8 text-xs border-gray-200 rounded-lg bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PHASES.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            <AddColunaButton
              onAdd={addColuna}
              disabled={evento?.status === 'finalizado'}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading || !evento) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Metas view ────────────────────────────────────────────────────────────
  if (activeView === 'metas') {
    return (
      <MetaTab
        evento={evento}
        leads={leads}
        onClose={() => setActiveView('kanban')}
        onSaveMetas={handleSaveMetas}
      />
    );
  }

  // ── Relatório view ────────────────────────────────────────────────────────
  if (activeView === 'relatorio') {
    return (
      <Relatorio
        evento={evento}
        leads={leads}
        onClose={() => setActiveView('kanban')}
        onSaveMetas={handleSaveMetas}
      />
    );
  }

  // ── Kanban view ───────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{evento.nome}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {evento.status === 'finalizado' ? '✅ Finalizado' : '🚀 Em Andamento'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Metas */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveView('metas')}
            className="gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
          >
            <Target className="h-3.5 w-3.5" />
            Metas
          </Button>
          {/* Botão Relatório */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveView('relatorio')}
            className="gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Relatório
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVerificarGrupos(true)}
            className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50 font-medium"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Grupos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPreselectFase(null); setShowDisparoModal(true); }}
            className="gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50 font-medium"
          >
            <Send className="h-3.5 w-3.5" />
            Disparar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-medium"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apagar
          </Button>
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all text-white shadow-sm ${
              evento.ativo ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400 hover:bg-gray-500'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            {evento.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Total de Leads</p>
            <Users className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
        </Card>

        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Ingressos Pagos</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setNovoValorIngresso((evento?.valor_ingresso ?? 10).toString()); setShowEditIngressoModal(true); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Editar valor"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <DollarSign className="h-4 w-4 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{ingressosPagos}</p>
          <p className="text-xs text-gray-400">{fmt(receitaIngressos)}</p>
        </Card>

        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Presentes no Evento</p>
            <Target className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{presentesEvento}</p>
        </Card>

        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Compraram Material</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setNovoValorMaterial((evento?.valor_material_padrao ?? VALOR_MATERIAL_PADRAO).toString()); setShowEditMaterialModal(true); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Editar valor do material"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <ShoppingBag className="h-4 w-4 text-pink-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{comprouMaterial}</p>
          <p className="text-xs text-gray-400">{fmt(receitaMateriais)}</p>
          <p className="text-[10px] text-gray-300">{fmt(valorMaterialEvento)} / un</p>
        </Card>

        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl bg-purple-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-purple-600 font-medium">Material no Evento</p>
            <ShoppingBag className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-purple-700">{materialNoDia}</p>
          <p className="text-xs text-purple-400">presentes que compraram</p>
        </Card>

        <Card className="p-4 border border-gray-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Matrículas</p>
            <Trophy className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{matriculas}</p>
          <p className="text-xs text-gray-400">{fmt(receitaMatriculas)}</p>
        </Card>
      </div>

      {/* Modal editar ingresso */}
      {showEditIngressoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Valor do Ingresso</h2>
            <p className="text-sm text-gray-500 mb-4">Novo valor do ingresso para este evento.</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500 font-medium">R$</span>
              <Input
                type="number" step="0.01" min="0"
                value={novoValorIngresso}
                onChange={(e) => setNovoValorIngresso(e.target.value)}
                placeholder="10,00" className="flex-1" autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditIngressoModal(false)}>Cancelar</Button>
              <Button onClick={handleSaveValorIngresso} disabled={savingIngresso}>
                {savingIngresso && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar material */}
      {showEditMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Valor do Material</h2>
            <p className="text-sm text-gray-500 mb-4">Valor padrão do material para este evento.</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500 font-medium">R$</span>
              <Input
                type="number" step="0.01" min="0"
                value={novoValorMaterial}
                onChange={(e) => setNovoValorMaterial(e.target.value)}
                placeholder="97,00" className="flex-1" autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditMaterialModal(false)}>Cancelar</Button>
              <Button onClick={handleSaveValorMaterial} disabled={savingMaterial}>
                {savingMaterial && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Boas-Vindas Pendentes — leads com ingresso pago que nunca receberam */}
      <BoasVindasPendentesPanel leads={leads} npaEventoId={npaEventoId} nomeEvento={evento.nome} />

      {/* Barra de busca + filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Buscar por nome ou WhatsApp..."
            value={searchWhatsapp}
            onChange={(e) => { setSearchWhatsapp(e.target.value); requestAnimationFrame(() => searchRef.current?.focus()); }}
            className="pl-9 rounded-xl border-gray-200 bg-white text-sm"
          />
        </div>

        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          {TURMA_VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setTurmaView(view.id)}
              className={`px-3 py-2 text-xs font-medium transition-all border-r border-gray-200 last:border-r-0 ${
                turmaView === view.id ? 'bg-[#be123c] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>

        <Dialog open={showAddLeadModal} onOpenChange={setShowAddLeadModal}>
          <DialogTrigger asChild>
            <Button
              disabled={evento.status === 'finalizado'}
              className="gap-1.5 bg-[#be123c] hover:bg-[#9f1239] text-white font-semibold rounded-xl shadow-sm px-4"
            >
              <Plus className="h-4 w-4" />
              Adicionar Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar Lead</DialogTitle>
              <DialogDescription>Adicione um novo lead ao NPA</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <Input placeholder="Nome" value={newLeadForm.nome} onChange={(e) => setNewLeadForm({ ...newLeadForm, nome: e.target.value })} className="rounded-xl" />
              <Input placeholder="WhatsApp" value={newLeadForm.whatsapp} onChange={(e) => setNewLeadForm({ ...newLeadForm, whatsapp: e.target.value })} className="rounded-xl" />
              <Input placeholder="Email (opcional)" value={newLeadForm.email} onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })} className="rounded-xl" />
              <Select value={newLeadForm.turma} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, turma: v as Turma })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Turma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">Turma Única</SelectItem>
                  <SelectItem value="manha">☀️ Manhã</SelectItem>
                  <SelectItem value="tarde">🌆 Tarde</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAddLead} disabled={isAddingLead} className="w-full bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl font-semibold">
                {isAddingLead ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Funil de compras pós-evento — responde "quem comprou o quê" de cara,
          sem precisar filtrar leads no Kanban. Buckets mutuamente exclusivos:
          quem comprou mentoria conta só no bucket de mentoria, mesmo que
          também tenha comprado material. */}
      <FunilComprasPosEvento leads={leads} />

      {/* Kanban */}
      {turmaView === 'lado_a_lado' ? (
        <div className="space-y-8">
          {renderKanban('manha', true)}
          <div className="border-t border-gray-100 pt-6">
            {renderKanban('tarde', true)}
          </div>
        </div>
      ) : renderKanban()}

      {/* Modal delete NPA */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Apagar NPA</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteEvento} className="rounded-xl">Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal delete lead */}
      <Dialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Apagar Lead</DialogTitle>
            <DialogDescription>Deseja apagar o lead "{leadToDelete?.nome}"?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLeadToDelete(null)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLead} className="rounded-xl">Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Column Management Modals */}
      <RenameColunaModal
        coluna={renamingColuna}
        onSave={(id, nome) => { renameColuna(id, nome); setRenamingColuna(null); }}
        onClose={() => setRenamingColuna(null)}
      />
      <ColunaSettingsModal
        coluna={settingsColuna}
        onSave={(id, updates) => { updateRegraColuna(id, updates); setSettingsColuna(null); }}
        onClose={() => setSettingsColuna(null)}
      />
      <DeleteColunaModal
        coluna={deletingColuna}
        leadCount={0}
        onConfirm={handleDeleteColWithLeads}
        onClose={() => setDeletingColuna(null)}
      />

      {/* Edit Lead Modal */}
      <Dialog open={!!editingLead} onOpenChange={() => setEditingLead(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Nome</label>
              <Input value={editLeadForm.nome} onChange={e => setEditLeadForm(f => ({ ...f, nome: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">WhatsApp</label>
              <Input value={editLeadForm.whatsapp} onChange={e => setEditLeadForm(f => ({ ...f, whatsapp: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Email</label>
              <Input value={editLeadForm.email} onChange={e => setEditLeadForm(f => ({ ...f, email: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Observações</label>
              <Input value={editLeadForm.observacoes} onChange={e => setEditLeadForm(f => ({ ...f, observacoes: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Turma</label>
              <Select value={editLeadForm.turma} onValueChange={(v) => setEditLeadForm(f => ({ ...f, turma: v as Turma }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">Turma Única</SelectItem>
                  <SelectItem value="manha">☀️ Manhã</SelectItem>
                  <SelectItem value="tarde">🌆 Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setEditingLead(null)} className="rounded-xl">Cancelar</Button>
              <Button onClick={handleSaveEditLead} className="rounded-xl">Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verificar Grupos Modal */}
      <NPAVerificarGruposModal
        open={showVerificarGrupos}
        onClose={() => setShowVerificarGrupos(false)}
        nomeEvento={evento.nome}
      />

      {/* Disparo por Fase Modal */}
      <NPADisparoModal
        open={showDisparoModal}
        onClose={() => { setShowDisparoModal(false); setPreselectFase(null); }}
        leads={leads}
        evoInstances={evoInstances}
        initialFases={preselectFase ? [preselectFase] : undefined}
        onStart={handleStartDisparo}
      />

      {/* Campanhas de Disparo Panel */}
      <NPADisparoPanel
        disparos={disparos}
        onPause={id => { disparosPauseMap.current.set(id, true); setDisparos(prev => prev.map(d => d.id === id ? { ...d, status: 'paused' } : d)); }}
        onResume={id => { disparosPauseMap.current.set(id, false); setDisparos(prev => prev.map(d => d.id === id ? { ...d, status: 'running' } : d)); }}
        onStop={id => { disparosStopMap.current.set(id, true); }}
        onDismiss={id => setDisparos(prev => prev.filter(d => d.id !== id))}
      />
    </div>
  );
}
