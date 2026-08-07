import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { isPagamentoInadimplente, calcInadimplencia } from '@/lib/financial-utils';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  MessageSquare, Send, Settings, FileText, History, Clock,
  Plus, Trash2, Pencil, Play, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Zap, Phone, Calendar, Info,
  AlertTriangle, TrendingDown,
} from 'lucide-react';
import { EvolutionTaskPanel } from './EvolutionTaskPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CobrancaConfig {
  id: string;
  ativo: boolean;
  horario_envio: string;
  horario_inicio_envio: string;
  horario_fim_envio: string;
  dias_pre_vencimento: number[];
  enviar_pre_vencimento: boolean;
  enviar_no_vencimento: boolean;
  dias_pos_vencimento: number[];
  enviar_pos_vencimento: boolean;
  enviar_apenas_dias_uteis: boolean;
  pausar_fins_semana: boolean;
  delay_min_s: number;
  delay_max_s: number;
  daily_limit: number;
  max_errors_seq: number;
  erros_seq: number;
  pausado_por_erro: boolean;
}

interface Turma { id: string; nome: string; }

interface Template {
  id: string;
  nome: string;
  tipo: 'pre_vencimento' | 'vencimento' | 'pos_vencimento' | 'quitacao' | 'aviso_cancelamento';
  dias_offset: number;
  dias_offset_fim: number | null;
  mensagem: string;
  ativo: boolean;
  ordem: number;
}

interface CobrancaLog {
  id: string;
  aluno_nome: string;
  telefone: string;
  mensagem: string;
  template_nome: string | null;
  template_tipo: string | null;
  status: 'pendente' | 'enviado' | 'erro' | 'cancelado';
  erro_msg: string | null;
  agendado_para: string | null;
  enviado_em: string | null;
  manual: boolean;
  created_at: string;
  aluno_id: string | null;
  pagamento_id: string | null;
  respondeu_em: string | null;
  ultima_resposta: string | null;
  grupo_envio_id: string | null;
}

// Uma mensagem consolidada gera N linhas em cobranca_logs (uma por parcela coberta,
// compartilhando grupo_envio_id) -- HistoricoEnvio junta essas linhas de volta em "1
// envio" pro Histórico não mostrar a mesma mensagem repetida N vezes. Envios antigos
// (sem grupo_envio_id, de antes dessa mudança, ou manuais avulsos) viram grupo de 1 linha
// só, usando o próprio id como chave.
interface HistoricoEnvio {
  chave: string;
  linhas: CobrancaLog[];
  representante: CobrancaLog;
  qtdParcelas: number;
}

interface AlunoHistorico {
  aluno_id: string | null;
  aluno_nome: string;
  telefone: string;
  envios: HistoricoEnvio[];
  ultimoEnvio: HistoricoEnvio;
  respondeuAlguma: boolean;
}

type EstadoDisparo =
  | 'pausado_manual' | 'pausado_erro' | 'fim_de_semana' | 'fora_horario'
  | 'limite_diario' | 'sem_templates' | 'sem_elegiveis' | 'aguardando_delay' | 'pronto' | 'sem_config';

interface StatusDisparo {
  estado: EstadoDisparo;
  proximo_em_s?: number;
  proximo_em_s_max?: number;
  proximo_lead?: string;
  fila_total?: number;
  erros_seq?: number;
}

function fmtCountdown(s: number): string {
  if (s <= 0) return 'agora';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${sec}s`;
  return `${sec}s`;
}

function fmtQuando(s: number): string {
  const alvo = new Date(Date.now() + s * 1000);
  return alvo.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// "Hoje" em UTC diverge de "hoje" em São Paulo por até 3h todo dia (das ~21h à meia-noite
// SP, o UTC já virou o dia seguinte) -- o backend (enviar-cobranca) já calcula tudo em
// horário de São Paulo, então a tela precisa fazer o mesmo, senão "cobrado hoje"/"enviados
// hoje" ficam errados bem no fim do dia.
function dataSaoPaulo(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const dia = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${dia}`;
}

function hojeSaoPaulo(): string {
  return dataSaoPaulo(new Date());
}

interface FilaItem {
  aluno_id: string;
  aluno_nome: string;
  telefone: string;
  pagamento_id: string;
  valor: number;
  parcela: number;
  data_vencimento: string;
  dias_offset: number;
  link_pagamento: string;
  pagamento_status: string;
}

// Um aluno com 2+ parcelas em aberto agora vira 1 card, não N linhas -- `parcelas` é
// TODO o débito em aberto dele (pra mostrar o total real), `elegiveis` é só quem ainda
// não recebeu a mensagem da fase atual (mesma regra do backend em
// proximoGrupoElegivel/enviar-cobranca) -- é o que decide se o aluno aparece "pendente de
// contato" hoje. `critica` é a parcela mais grave entre as elegíveis (ou, se não houver
// nenhuma elegível, entre todas -- pra ainda dar pra mostrar a severidade de quem já foi
// cobrado).
interface AlunoGrupo {
  aluno_id: string;
  aluno_nome: string;
  telefone: string;
  parcelas: FilaItem[];
  elegiveis: FilaItem[];
  critica: FilaItem;
  totalDevido: number;
  isInadimplente: boolean;
}

// Último contato de cobrança já feito com o aluno (independente da parcela) -- alimenta o
// badge "Cobrado ontem, HH:MM" / "Respondeu" no card da Fila, pra quem for mandar uma
// cobrança manual saber se já falou com essa pessoa antes de decidir o tom.
interface UltimoContato {
  ultimoEnvio: string;
  respondeu: boolean;
}

// Conversa de cobrança tocada pelo agente de IA (ver cobranca-ia-responder) --
// aciona quando um aluno já cadastrado responde a uma mensagem de cobrança.
// Escopo raso: rapport + entender o atraso + coletar uma data estimada, nunca
// negocia valor/desconto/cancelamento.
interface CobrancaIaConversa {
  id: string;
  aluno_id: string;
  pagamento_id: string | null;
  aluno_nome: string;
  telefone: string;
  evolution_instance: string;
  cobranca_log_id: string | null;
  status: 'ativo' | 'dado_coletado' | 'aguardando_humano' | 'encerrado';
  data_prometida: string | null;
  resumo_ia: string | null;
  motivo_handoff: string | null;
  turnos_ia: number;
  ultima_mensagem_em: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
}

interface CobrancaIaMensagem {
  id: string;
  conversa_id: string;
  papel: 'lead' | 'agente';
  conteudo: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  pre_vencimento:     'Pré-vencimento',
  vencimento:         'No vencimento',
  pos_vencimento:     'Pós-vencimento',
  quitacao:           'Quitação',
  aviso_cancelamento: 'Aviso cancelamento',
};

const TIPO_COLORS: Record<string, string> = {
  pre_vencimento:     'bg-blue-50 text-blue-700 border-blue-200',
  vencimento:         'bg-amber-50 text-amber-700 border-amber-200',
  pos_vencimento:     'bg-red-50 text-red-700 border-red-200',
  quitacao:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  aviso_cancelamento: 'bg-purple-50 text-purple-700 border-purple-200',
};

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// "Cobrado hoje/ontem, HH:MM" no card da Fila -- fuso São Paulo (mesmo padrão de
// hojeSaoPaulo/dataSaoPaulo), pra bater com o dia "de verdade" do operador, não o UTC.
function fmtContatoRelativo(iso: string): string {
  const d = new Date(iso);
  const dia = dataSaoPaulo(d);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  if (dia === hojeSaoPaulo()) return `Cobrado hoje, ${hora}`;
  if (dia === dataSaoPaulo(new Date(Date.now() - 86_400_000))) return `Cobrado ontem, ${hora}`;
  const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `Cobrado em ${dataFmt}, ${hora}`;
}

const VARIAVEIS = [
  '{{nome}}', '{{valor}}', '{{parcela}}', '{{vencimento}}', '{{dias_atraso}}', '{{link_pagamento}}',
  '{{qtd_parcelas}}', '{{total_devido}}', '{{lista_parcelas}}',
];

function addMinutesToTime(base: string, extraMin: number): string {
  const [h, m] = base.split(':').map(Number);
  const total = h * 60 + m + extraMin;
  const rh = Math.floor(total / 60);
  const rm = total % 60;
  return `${String(Math.min(rh, 23)).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'enviado')  return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1"><CheckCircle2 size={11}/>Enviado</Badge>;
  if (status === 'erro')     return <Badge className="bg-red-50 text-red-700 border border-red-200 gap-1"><XCircle size={11}/>Erro</Badge>;
  if (status === 'pendente') return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 gap-1"><Clock size={11}/>Pendente</Badge>;
  return <Badge variant="outline">Cancelado</Badge>;
}

function DaysChips({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  const options = [1, 2, 3, 5, 7, 10, 14, 15, 30];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(d => {
        const active = values.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(active ? values.filter(v => v !== d) : [...values, d].sort((a, b) => a - b))}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary'
            }`}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}

// Severidade calculada sobre a parcela mais crítica do grupo -- vira a cor da borda do
// card (vermelho: já vencida há vários dias; âmbar: vencida há pouco ou vence hoje; azul:
// ainda não venceu), independente do tipo de template configurado pra ela.
function severidadeGrupo(critica: FilaItem): 'severe' | 'medium' | 'low' {
  if (critica.dias_offset >= 8) return 'severe';
  if (critica.dias_offset >= 0) return 'medium';
  return 'low';
}

const SEVERIDADE_BORDA: Record<'severe' | 'medium' | 'low', string> = {
  severe: 'border-l-4 border-l-red-500',
  medium: 'border-l-4 border-l-amber-500',
  low:    'border-l-4 border-l-blue-500',
};

function SituacaoBadge({ critica, isInadimplente }: { critica: FilaItem; isInadimplente: boolean }) {
  const atraso = critica.dias_offset;
  if (isInadimplente || atraso > 0) {
    return <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs gap-1"><AlertTriangle size={10}/>{atraso}d em atraso</Badge>;
  }
  if (atraso === 0) {
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs">Vence hoje</Badge>;
  }
  return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Vence em {Math.abs(atraso)}d</Badge>;
}

// Card por aluno na Fila: agrupa todas as parcelas em aberto dele (não só a que está
// elegível pra cobrança hoje), pra deixar claro o tamanho real da dívida de uma vez.
function AlunoFilaCard({
  grupo, horaEstimada, jaCobradoHoje, isSending, onEnviar, ultimoContato,
}: {
  grupo: AlunoGrupo;
  horaEstimada?: string;
  jaCobradoHoje: boolean;
  isSending: boolean;
  onEnviar: () => void;
  ultimoContato?: UltimoContato;
}) {
  const severidade = severidadeGrupo(grupo.critica);
  return (
    <Card className={`transition-colors ${SEVERIDADE_BORDA[severidade]}`}>
      <CardContent className="py-4 px-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
              {grupo.aluno_nome[0]}
            </div>
            <div>
              <p className="font-semibold text-sm">{grupo.aluno_nome}</p>
              <p className="text-xs text-muted-foreground font-mono">{grupo.telefone}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <SituacaoBadge critica={grupo.critica} isInadimplente={grupo.isInadimplente} />
                {jaCobradoHoje && (
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs gap-1">
                    <CheckCircle2 size={10}/>Já cobrado hoje
                  </Badge>
                )}
                {horaEstimada && (
                  <span className="text-xs text-muted-foreground font-mono">~{horaEstimada}</span>
                )}
                {ultimoContato && (
                  <Badge variant="outline" className="text-xs">{fmtContatoRelativo(ultimoContato.ultimoEnvio)}</Badge>
                )}
                {ultimoContato?.respondeu && (
                  <Badge className="bg-violet-50 text-violet-700 border border-violet-200 text-xs gap-1"><MessageSquare size={10}/>Respondeu</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-lg font-bold">R$ {fmt(grupo.totalDevido)}</p>
            <p className="text-xs text-muted-foreground">
              {grupo.parcelas.length > 1 ? `${grupo.parcelas.length} parcelas em aberto` : '1 parcela em aberto'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {grupo.parcelas.map(p => {
            const venceu = p.dias_offset > 0;
            const data = new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
            return (
              <span key={p.pagamento_id} className="text-xs px-2 py-1 rounded-md bg-muted/60 border text-muted-foreground">
                #{p.parcela} · R$ {fmt(p.valor)} · {venceu ? `venceu ${data}` : p.dias_offset === 0 ? `vence hoje` : `vence ${data}`}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" disabled={isSending} onClick={onEnviar}>
            {isSending ? <RefreshCw size={12} className="animate-spin"/> : <Send size={12}/>}
            {grupo.elegiveis.length ? 'Ver mensagem' : 'Reenviar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Card por aluno no Histórico: agrupa os envios dele, colapsado por padrão (nome,
// telefone, total de envios, se respondeu alguma vez, quando foi o último). Expande pra
// ver a timeline -- envios com o mesmo grupo_envio_id já chegam colapsados em 1 entrada
// (agrupamento feito em historicoPorAluno), então uma mensagem consolidada de 3 parcelas
// aparece como 1 linha na timeline, não 3.
function AlunoHistoricoCard({
  aluno, expandido, onToggle, onClickEnvio, onReenviar, enviandoIds,
}: {
  aluno: AlunoHistorico;
  expandido: boolean;
  onToggle: () => void;
  onClickEnvio: (log: CobrancaLog) => void;
  onReenviar: (log: CobrancaLog) => void;
  enviandoIds: Set<string>;
}) {
  const totalErros = aluno.envios.filter(e => e.representante.status === 'erro').length;
  return (
    <Card className="border overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
            {aluno.aluno_nome[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{aluno.aluno_nome}</p>
            <p className="text-xs text-muted-foreground font-mono">{aluno.telefone}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className="text-xs">{aluno.envios.length} envio{aluno.envios.length > 1 ? 's' : ''}</Badge>
            {totalErros > 0 && <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs">{totalErros} erro{totalErros > 1 ? 's' : ''}</Badge>}
            {aluno.respondeuAlguma && (
              <Badge className="bg-violet-50 text-violet-700 border border-violet-200 text-xs gap-1"><MessageSquare size={10}/>Respondeu</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {fmtDate(aluno.ultimoEnvio.representante.enviado_em ?? aluno.ultimoEnvio.representante.created_at)}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{expandido ? '▾' : '▸'}</span>
        </CardContent>
      </button>
      {expandido && (
        <div className="border-t divide-y">
          {aluno.envios.map(envio => (
            <div
              key={envio.chave}
              className="px-4 py-2.5 pl-14 flex flex-wrap items-center gap-2 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onClickEnvio(envio.representante)}
            >
              <StatusBadge status={envio.representante.status} />
              <span className="text-xs text-muted-foreground flex-1 min-w-[120px] truncate">
                {envio.representante.template_nome ?? 'Manual'}
                {envio.qtdParcelas > 1 && ` · ${envio.qtdParcelas} parcelas`}
              </span>
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {fmtDate(envio.representante.enviado_em ?? envio.representante.created_at)}
              </span>
              {envio.representante.manual
                ? <Badge variant="outline" className="text-xs shrink-0">Manual</Badge>
                : <Badge className="bg-primary/10 text-primary border-primary/20 text-xs shrink-0">Auto</Badge>}
              {envio.representante.respondeu_em && (
                <span className="text-xs text-violet-600 flex items-center gap-1 shrink-0"><MessageSquare size={10}/>respondeu</span>
              )}
              {envio.representante.status === 'erro' && (
                <Button
                  size="sm" variant="outline" className="gap-1 text-xs h-6 shrink-0"
                  disabled={enviandoIds.has(envio.representante.id)}
                  onClick={e => { e.stopPropagation(); onReenviar(envio.representante); }}
                >
                  <RefreshCw size={10}/> Reenviar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const STATUS_IA_LABELS: Record<CobrancaIaConversa['status'], string> = {
  ativo: 'Conversando',
  dado_coletado: 'Data coletada',
  aguardando_humano: 'Aguardando humano',
  encerrado: 'Encerrado',
};

const STATUS_IA_CLASSES: Record<CobrancaIaConversa['status'], string> = {
  ativo: 'bg-blue-50 text-blue-700 border-blue-200',
  dado_coletado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  aguardando_humano: 'bg-amber-50 text-amber-700 border-amber-200',
  encerrado: 'bg-muted text-muted-foreground border-border',
};

function StatusIaBadge({ status }: { status: CobrancaIaConversa['status'] }) {
  return <Badge className={`text-xs border ${STATUS_IA_CLASSES[status]}`}>{STATUS_IA_LABELS[status]}</Badge>;
}

function MensagemBubble({ mensagem }: { mensagem: CobrancaIaMensagem }) {
  const isAgente = mensagem.papel === 'agente';
  return (
    <div className={`flex ${isAgente ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
        isAgente ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground'
      }`}>
        <p className="whitespace-pre-wrap">{mensagem.conteudo}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(mensagem.created_at)}</p>
      </div>
    </div>
  );
}

// Card por conversa na aba "Conversas IA": nome/telefone/status/data prometida
// colapsado por padrão, expande pra ver a transcript completa (carregada sob
// demanda, não pré-carregada com o resto da tela).
function ConversaIaCard({
  conversa, expandido, onToggle, mensagens, carregandoTranscript, onResolver, resolvendo,
}: {
  conversa: CobrancaIaConversa;
  expandido: boolean;
  onToggle: () => void;
  mensagens: CobrancaIaMensagem[];
  carregandoTranscript: boolean;
  onResolver: () => void;
  resolvendo: boolean;
}) {
  return (
    <Card className="border overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
            {conversa.aluno_nome?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-[160px]">
            <p className="font-medium text-sm truncate">{conversa.aluno_nome || 'Aluno'}</p>
            <p className="text-xs text-muted-foreground font-mono">{conversa.telefone}</p>
            {conversa.resumo_ia && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{conversa.resumo_ia}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {conversa.data_prometida && (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs gap-1">
                <Calendar size={10}/> Prometeu {new Date(conversa.data_prometida + 'T00:00:00').toLocaleDateString('pt-BR')}
              </Badge>
            )}
            <StatusIaBadge status={conversa.status} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {fmtDate(conversa.ultima_mensagem_em ?? conversa.created_at)}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{expandido ? '▾' : '▸'}</span>
        </CardContent>
      </button>
      {expandido && (
        <div className="border-t px-4 py-3 space-y-3">
          {carregandoTranscript ? (
            <p className="text-xs text-muted-foreground">Carregando conversa...</p>
          ) : mensagens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma mensagem registrada.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {mensagens.map(m => <MensagemBubble key={m.id} mensagem={m} />)}
            </div>
          )}
          {conversa.status !== 'encerrado' && (
            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" disabled={resolvendo} onClick={onResolver}>
                {resolvendo ? <RefreshCw size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
                Marcar como resolvido
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Cobranca() {
  const { user } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'fila' | 'historico' | 'templates' | 'config' | 'conversas_ia'>('fila');

  const [cobrancaCfg, setCobrancaCfg] = useState<CobrancaConfig | null>(null);
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [logs, setLogs]               = useState<CobrancaLog[]>([]);
  const [fila, setFila]               = useState<FilaItem[]>([]);
  // Contagem canônica de inadimplentes (compartilhada com Dashboard/Financeiro/
  // FinanceiroCFO) — independente da fila de disparo, que só cobre boleto +
  // turma com cobrança ativa + telefone cadastrado. O KPI do topo precisa
  // refletir o total real do negócio, não só quem é elegível pra automação.
  const [inadimplenciaGlobal, setInadimplenciaGlobal] = useState({ count: 0, valorTotal: 0 });
  // Chaves "pagamento_id:template_id" já enviadas com sucesso -- usado pra tirar da fila
  // quem já foi cobrado na janela/fase atual (mesma regra do backend, ver
  // proximoEnvioElegivel em enviar-cobranca), em vez de reaparecer todo dia até bater
  // o próximo dia exato.
  const [envioPorFase, setEnvioPorFase] = useState<Set<string>>(new Set());

  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [enviandoIds, setEnviandoIds] = useState<Set<string>>(new Set());

  // Template modal
  const [templateModal, setTemplateModal] = useState<Partial<Template> | null>(null);

  // Send manual modal -- guarda o grupo (aluno) inteiro, não 1 parcela, pra poder
  // recalcular a mensagem consolidada quando o operador troca o template no dropdown.
  const [sendModal, setSendModal] = useState<AlunoGrupo | null>(null);
  const [sendMensagem, setSendMensagem] = useState('');
  const [sendTemplate, setSendTemplate] = useState('');

  // Log detail
  const [logDetail, setLogDetail] = useState<CobrancaLog | null>(null);

  // Confirm bulk modal
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // Resumo diário (dormant feature — stored in localStorage)
  const [resumoAtivo, setResumoAtivo] = useState(() => localStorage.getItem('resumo_diario_ativo') === 'true');
  const [resumoNumero, setResumoNumero] = useState(() => localStorage.getItem('resumo_diario_numero') ?? '');
  const [enviandoResumo, setEnviandoResumo] = useState(false);

  // Search
  const [searchLog, setSearchLog] = useState('');
  const [historicoExpandido, setHistoricoExpandido] = useState<Set<string>>(new Set());
  const toggleHistoricoExpandido = (chave: string) => setHistoricoExpandido(prev => {
    const next = new Set(prev);
    if (next.has(chave)) next.delete(chave); else next.add(chave);
    return next;
  });

  // Conversas IA (aba "Conversas IA") -- transcript carregado sob demanda, não
  // pré-carregado com o resto da tela.
  const [conversasIA, setConversasIA] = useState<CobrancaIaConversa[]>([]);
  const [conversaIaExpandida, setConversaIaExpandida] = useState<Set<string>>(new Set());
  const [mensagensPorConversa, setMensagensPorConversa] = useState<Record<string, CobrancaIaMensagem[]>>({});
  const [carregandoTranscriptIds, setCarregandoTranscriptIds] = useState<Set<string>>(new Set());
  const [resolvendoConversaIds, setResolvendoConversaIds] = useState<Set<string>>(new Set());

  // Turmas administradas
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmasAtivas, setTurmasAtivas] = useState<Set<string>>(new Set());

  // Card da Bia (Operações -- domínio financeiro)
  const [biaAgenteId, setBiaAgenteId] = useState<string | null>(null);
  const [biaResumo, setBiaResumo] = useState<string | null>(null);
  const [biaAtualizando, setBiaAtualizando] = useState(false);

  // Status do próximo disparo automático (tique)
  const [statusDisparo, setStatusDisparo] = useState<StatusDisparo | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [cfgRes, tplRes, logRes, turmasRes, turmasAtivasRes, biaRes, conversasIaRes] = await Promise.all([
      supabase.from('cobranca_config'  as any).select('*').eq('id', 'default').single(),
      supabase.from('cobranca_templates' as any).select('*').order('ordem'),
      supabase.from('cobranca_logs' as any).select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('turmas').select('id, nome').order('nome'),
      supabase.from('cobranca_turmas_ativas' as any).select('turma_id'),
      supabase.from('equipe_11ds_agentes' as any).select('id').eq('slug', 'bia-comunicacao').maybeSingle(),
      supabase.from('cobranca_ia_conversas' as any).select('*').order('ultima_mensagem_em', { ascending: false, nullsFirst: false }),
    ]);

    if (cfgRes.data) setCobrancaCfg(cfgRes.data as CobrancaConfig);
    if (tplRes.data) setTemplates(tplRes.data as Template[]);
    if (logRes.data) setLogs(logRes.data as CobrancaLog[]);
    if (turmasRes.data) setTurmas(turmasRes.data as Turma[]);
    if (conversasIaRes.data) setConversasIA(conversasIaRes.data as unknown as CobrancaIaConversa[]);
    if (turmasAtivasRes.data) setTurmasAtivas(new Set((turmasAtivasRes.data as any[]).map(r => r.turma_id)));

    const biaId = (biaRes.data as any)?.id ?? null;
    setBiaAgenteId(biaId);
    if (biaId) {
      const { data: tarefaBia } = await supabase
        .from('equipe_11ds_tarefas' as any)
        .select('resposta_texto')
        .eq('agente_id', biaId)
        .eq('status', 'concluido')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBiaResumo((tarefaBia as any)?.resposta_texto ?? null);
    }

    const filaRes = await supabase.rpc('get_alunos_para_cobranca' as any, { p_data: hojeSaoPaulo() });
    const filaData = (filaRes.data as FilaItem[]) ?? [];
    if (filaRes.data) setFila(filaData);

    // Inadimplência canônica (todos os métodos de pagamento, todas as turmas) —
    // mesma fonte e regra do Dashboard/Financeiro, pra o KPI do topo bater.
    // Busca pagamentos em lotes de 1000 (mesmo padrão de Financeiro.tsx) -- o
    // servidor corta cada resposta em ~1000 linhas independente do que se pede,
    // e são 2400+ pagamentos no total; sem paginar, a contagem vinha bem menor
    // que a real.
    const fetchAllPagamentosInad = async () => {
      const PAGE = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from('pagamentos')
          .select('aluno_id, valor, status, data_vencimento')
          .range(from, from + PAGE - 1);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < PAGE) break;
      }
      return all;
    };
    const [pagInad, { data: alunosInad }] = await Promise.all([
      fetchAllPagamentosInad(),
      supabase.from('alunos').select('id, status, tipo_pagamento'),
    ]);
    if (pagInad && alunosInad) {
      const alunoElegivelIds = new Set(
        (alunosInad as any[])
          .filter(a => a.status !== 'cancelado' && a.status !== 'concluido'
            && a.tipo_pagamento !== 'bolsa' && a.tipo_pagamento !== 'cortesia')
          .map(a => a.id)
      );
      const elegiveis = (pagInad as any[]).filter(p => alunoElegivelIds.has(p.aluno_id));
      const resumo = calcInadimplencia(elegiveis);
      setInadimplenciaGlobal({ count: resumo.count, valorTotal: resumo.valorTotal });
    }

    const pagamentoIds = filaData.map(f => f.pagamento_id);
    if (pagamentoIds.length) {
      const { data: enviosData } = await supabase
        .from('cobranca_logs' as any)
        .select('pagamento_id, template_id')
        .eq('status', 'enviado')
        .not('template_id', 'is', null)
        .in('pagamento_id', pagamentoIds);
      setEnvioPorFase(new Set(
        ((enviosData as any[]) ?? []).map(r => `${r.pagamento_id}:${r.template_id}`)
      ));
    } else {
      setEnvioPorFase(new Set());
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleTurmaAtiva = async (turmaId: string) => {
    const ativa = turmasAtivas.has(turmaId);
    if (ativa) {
      await supabase.from('cobranca_turmas_ativas' as any).delete().eq('turma_id', turmaId);
      setTurmasAtivas(prev => { const next = new Set(prev); next.delete(turmaId); return next; });
    } else {
      await supabase.from('cobranca_turmas_ativas' as any).insert({ turma_id: turmaId });
      setTurmasAtivas(prev => new Set([...prev, turmaId]));
    }
    await loadAll();
  };

  const reativarAposErro = async () => {
    if (!cobrancaCfg) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('cobranca_config')
      .update({ pausado_por_erro: false, erros_seq: 0, ativo: true })
      .eq('id', 'default');
    setSaving(false);
    if (error) { toast.error('Erro ao reativar: ' + error.message); return; }
    toast.success('Cobrança reativada!');
    await loadAll();
  };

  const pedirAtualizacaoBia = async () => {
    if (!biaAgenteId) { toast.error('Agente Bia não encontrada'); return; }
    setBiaAtualizando(true);
    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas' as any)
      .insert({ agente_id: biaAgenteId, tipo: 'avulso', ordem_texto: 'Atualização de cobrança sob demanda' })
      .select('id')
      .single();
    if (tarefaErr || !tarefa) {
      toast.error('Erro ao criar tarefa: ' + (tarefaErr?.message ?? 'desconhecido'));
      setBiaAtualizando(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke('equipe-11ds-comunicacao-executar', {
      body: { tarefa_id: (tarefa as any).id },
    });
    setBiaAtualizando(false);
    if (error || !(data as any)?.ok) {
      toast.error('Erro ao atualizar: ' + (error?.message ?? (data as any)?.error ?? 'sem resposta'));
      return;
    }
    toast.success('Bia atualizou o relatório!');
    await loadAll();
  };

  // ── Status do próximo disparo (tique) ─────────────────────────────────────
  const carregarStatusDisparo = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enviar-cobranca`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: true }),
      });
      const json = await res.json();
      setStatusDisparo(json as StatusDisparo);
      setCountdown(typeof json.proximo_em_s === 'number' ? Math.round(json.proximo_em_s) : null);
    } catch {
      // silencioso -- é só um indicador informativo, não impede o resto da tela
    }
  }, []);

  useEffect(() => {
    carregarStatusDisparo();
    const refreshId = setInterval(carregarStatusDisparo, 30_000);
    return () => clearInterval(refreshId);
  }, [carregarStatusDisparo]);

  useEffect(() => {
    const tickId = setInterval(() => {
      setCountdown(c => (c !== null && c > 0 ? c - 1 : c));
    }, 1000);
    return () => clearInterval(tickId);
  }, []);

  // pos_vencimento casa por faixa de dias (fase), não dia exato -- mesma regra do backend
  // (enviar-cobranca/proximoEnvioElegivel), pra pré-preencher certo mesmo quem está em
  // atraso "de limbo" sem bater um dia fixo.
  const templateParaOffset = (offset: number): Template | undefined => {
    if (offset < 0) return templates.find(t => t.tipo === 'pre_vencimento' && t.dias_offset === offset && t.ativo);
    if (offset === 0) return templates.find(t => t.tipo === 'vencimento' && t.dias_offset === 0 && t.ativo);
    return templates.find(t =>
      t.tipo === 'pos_vencimento' && t.ativo &&
      offset >= t.dias_offset && (t.dias_offset_fim == null || offset <= t.dias_offset_fim),
    );
  };

  // Agrupa a fila por aluno (mesma regra do backend em proximoGrupoElegivel) -- um aluno
  // com 2+ parcelas em aberto vira 1 card com o débito todo, em vez de N itens separados.
  // `elegiveis` tira quem já recebeu a mensagem da fase/janela atual (mesma regra de
  // dedupe do backend); sem isso, quem está numa janela de vários dias (ex: 8-15 dias após
  // vencimento) aparecia repetido todo dia até bater o próximo dia exato configurado.
  const alunoGrupos = useMemo<AlunoGrupo[]>(() => {
    const porAluno = new Map<string, FilaItem[]>();
    for (const item of fila) {
      if (!porAluno.has(item.aluno_id)) porAluno.set(item.aluno_id, []);
      porAluno.get(item.aluno_id)!.push(item);
    }
    // Canônico (compartilhado com Dashboard/FinanceiroCFO/Financeiro): 'atrasado'
    // OU 'pendente' com vencimento já passado -- antes só considerava 'atrasado'
    // literal, deixando de fora quem está com parcela pendente vencida mas
    // ainda não teve o status atualizado no banco.
    const hojeSP = new Date(hojeSaoPaulo() + 'T00:00:00.000Z');
    const grupos: AlunoGrupo[] = [];
    for (const [alunoId, parcelas] of porAluno) {
      const elegiveis = parcelas.filter(item => {
        const tpl = templateParaOffset(item.dias_offset);
        if (!tpl) return true;
        return !envioPorFase.has(`${item.pagamento_id}:${tpl.id}`);
      });
      // Severidade calculada sobre TODAS as parcelas em aberto (não só as elegíveis) --
      // um aluno já cobrado hoje mas ainda com dívida grave não pode "sumir" da leitura
      // de gravidade só porque não tem uma nova mensagem pendente agora.
      const critica = [...parcelas].sort((a, b) => b.dias_offset - a.dias_offset)[0];
      grupos.push({
        aluno_id: alunoId,
        aluno_nome: critica.aluno_nome,
        telefone: critica.telefone,
        parcelas,
        elegiveis,
        critica,
        totalDevido: parcelas.reduce((s, p) => s + Number(p.valor), 0),
        isInadimplente: parcelas.some(p =>
          isPagamentoInadimplente({ status: p.pagamento_status, data_vencimento: p.data_vencimento }, hojeSP)
        ),
      });
    }
    return grupos.sort((a, b) => b.critica.dias_offset - a.critica.dias_offset);
  }, [fila, templates, envioPorFase]);

  // "Fila de hoje" de verdade: só quem tem pelo menos 1 parcela cuja fase ainda não foi
  // cobrada -- mesmo conceito de antes, agora por aluno em vez de por parcela.
  const alunoGruposElegiveis = useMemo(
    () => alunoGrupos.filter(g => g.elegiveis.length > 0),
    [alunoGrupos],
  );

  // ── Schedule calculation ──────────────────────────────────────────────────
  // Antes dividia a janela (09:00-20:00) igualmente pelo tamanho da fila, o que dava a
  // entender que tudo sairia espalhado ao longo do dia -- mas o ritmo real de quem manda
  // (o tique automático) é o delay anti-ban configurado (delay_min_s/delay_max_s) entre
  // cada envio, não uma divisão artificial da janela. Com uma fila grande e um delay de
  // dezenas de minutos, isso não cabe num dia só -- o cálculo agora reflete isso (spilla
  // pros dias seguintes, mesma janela horária), em vez de prometer um horário do mesmo dia
  // que nunca vai bater.
  const schedule = useMemo(() => {
    if (!cobrancaCfg || alunoGruposElegiveis.length === 0) return null;
    const inicio = cobrancaCfg.horario_inicio_envio || cobrancaCfg.horario_envio || '09:00';
    const fim = cobrancaCfg.horario_fim_envio || '18:00';
    const totalMin = timeToMin(fim) - timeToMin(inicio);
    if (totalMin <= 0) return null;
    const intervalMin = Math.max(1, Math.round((cobrancaCfg.delay_min_s + cobrancaCfg.delay_max_s) / 2 / 60));
    const porDia = Math.max(1, Math.floor(totalMin / intervalMin) + 1);
    const slots = alunoGruposElegiveis.map((_, i) => {
      const dia = Math.floor(i / porDia);
      const hhmm = addMinutesToTime(inicio, (i % porDia) * intervalMin);
      return dia === 0 ? hhmm : `dia +${dia} ${hhmm}`;
    });
    const diasNecessarios = Math.ceil(alunoGruposElegiveis.length / porDia);
    return { intervalMin, inicio, fim, slots, totalMin, diasNecessarios };
  }, [alunoGruposElegiveis, cobrancaCfg]);

  // ── Fila breakdown ────────────────────────────────────────────────────────
  // `inadimplentes` é o recorte da FILA (só boleto + turma com cobrança ativa +
  // telefone cadastrado) — usado nos breakdowns "de X na fila, Y são
  // inadimplentes". `inadimplentesTotal` é a contagem canônica do negócio
  // inteiro (todas as turmas/formas de pagamento, mesma fonte do
  // Dashboard/Financeiro/CFO) — usada só no KPI do topo, que precisa bater
  // com as outras telas em vez de refletir só quem é elegível pra automação.
  const filaStats = useMemo(() => ({
    inadimplentes: alunoGruposElegiveis.filter(g => g.isInadimplente).length,
    inadimplentesTotal: inadimplenciaGlobal.count,
    mesMes: alunoGruposElegiveis.filter(g => !g.isInadimplente).length,
    totalEmAberto: alunoGrupos.reduce((s, g) => s + g.totalDevido, 0),
  }), [alunoGruposElegiveis, alunoGrupos, inadimplenciaGlobal]);

  // Parcelas já cobradas hoje -- pra marcar na tabela da fila em vez de deixar parecer
  // que ninguém foi tocado ainda
  const enviadosHojeSet = useMemo(() => {
    const hoje = hojeSaoPaulo();
    return new Set(
      logs
        .filter(l => {
          const quando = l.enviado_em ?? l.created_at;
          return l.status === 'enviado' && l.pagamento_id && quando && dataSaoPaulo(new Date(quando)) === hoje;
        })
        .map(l => l.pagamento_id as string),
    );
  }, [logs]);

  // ── Salvar configs ────────────────────────────────────────────────────────
  const salvarCobrancaCfg = async () => {
    if (!cobrancaCfg) return;
    setSaving(true);
    // Só os campos que este formulário realmente edita -- enviados_hoje, dia_contagem,
    // erros_seq, ultimo_envio_em e pausado_por_erro são estado de execução gerenciado
    // pelo enviar-cobranca (tick/bulk); sobrescrever com o valor carregado na tela
    // apagava o progresso de um envio que já tinha acontecido no meio tempo.
    const {
      id, ativo, horario_envio, horario_inicio_envio, horario_fim_envio,
      dias_pre_vencimento, enviar_pre_vencimento, enviar_no_vencimento,
      dias_pos_vencimento, enviar_pos_vencimento, enviar_apenas_dias_uteis,
      pausar_fins_semana, delay_min_s, delay_max_s, daily_limit, max_errors_seq,
    } = cobrancaCfg;
    const { error } = await (supabase as any)
      .from('cobranca_config')
      .upsert({
        id, ativo, horario_envio, horario_inicio_envio, horario_fim_envio,
        dias_pre_vencimento, enviar_pre_vencimento, enviar_no_vencimento,
        dias_pos_vencimento, enviar_pos_vencimento, enviar_apenas_dias_uteis,
        pausar_fins_semana, delay_min_s, delay_max_s, daily_limit, max_errors_seq,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Regras de cobrança salvas!');
    setSaving(false);
    await loadAll();
  };

  // ── Templates CRUD ────────────────────────────────────────────────────────
  const salvarTemplate = async () => {
    if (!templateModal) return;
    setSaving(true);
    if (templateModal.id) {
      const { error } = await (supabase as any)
        .from('cobranca_templates')
        .update({ ...templateModal, updated_at: new Date().toISOString() })
        .eq('id', templateModal.id);
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return; }
    } else {
      const { error } = await (supabase as any)
        .from('cobranca_templates')
        .insert({ ...templateModal, ordem: templates.length });
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return; }
    }
    toast.success('Template salvo!');
    setTemplateModal(null);
    await loadAll();
    setSaving(false);
  };

  const toggleTemplate = async (tpl: Template) => {
    const { error } = await (supabase as any)
      .from('cobranca_templates')
      .update({ ativo: !tpl.ativo })
      .eq('id', tpl.id);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, ativo: !t.ativo } : t));
    }
  };

  const deletarTemplate = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    await (supabase as any).from('cobranca_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template removido');
  };

  // ── Envio manual ──────────────────────────────────────────────────────────
  // Monta as variáveis da mensagem consolidada pro grupo inteiro (mesma lógica do
  // backend em proximoGrupoElegivel): tom da parcela mais crítica (a mais antiga, mesma
  // que decide a gravidade do card -- grupo.critica), qtd_parcelas/total_devido/
  // lista_parcelas sempre refletindo TODA a dívida em aberto do aluno.
  // Usa SEMPRE a parcela mais antiga entre TODAS (não só as "elegíveis") -- elegível
  // aqui só quer dizer "essa fase ainda não foi cobrada automaticamente", e quando as
  // parcelas mais antigas (e mais graves) já foram cobradas, sobrava só a mais nova
  // (ainda nem vencida, sem template configurado) como "elegível", fazendo a cobrança
  // manual falar da parcela errada -- a mais nova em vez da mais antiga/urgente.
  // "Outras parcelas" só entra se tiver a MESMA urgência da crítica (as duas vencidas, ou
  // as duas ainda por vencer) -- nunca mistura, senão uma mensagem de "50 dias em atraso"
  // cita junto uma parcela do mês corrente que nem venceu ainda, parecendo dívida vencida
  // que não é (mesma regra espelhada em proximoGrupoElegivel no enviar-cobranca).
  const varsParaGrupo = (grupo: AlunoGrupo): { critica: FilaItem; vars: Record<string, string | number | boolean | null> } => {
    const critica = grupo.critica;
    const criticaVencida = critica.dias_offset > 0;
    const outras = grupo.parcelas.filter(p => p.pagamento_id !== critica.pagamento_id && (p.dias_offset > 0) === criticaVencida);
    const consideradas = [critica, ...outras];
    const listaParcelas = outras
      .map(p => {
        const data = new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
        return `• Parcela ${p.parcela}: R$ ${fmt(p.valor)}, ${p.dias_offset > 0 ? `venceu em ${data}` : `vence em ${data}`}`;
      })
      .join('\n');
    const vencimento = new Date(critica.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
    return {
      critica,
      vars: {
        nome: critica.aluno_nome,
        valor: fmt(critica.valor),
        parcela: critica.parcela,
        vencimento,
        dias_atraso: critica.dias_offset > 0 ? critica.dias_offset : null,
        link_pagamento: critica.link_pagamento || null,
        qtd_parcelas: consideradas.length,
        total_devido: fmt(consideradas.reduce((s, p) => s + Number(p.valor), 0)),
        lista_parcelas: listaParcelas || null,
        multiplas: consideradas.length > 1,
      },
    };
  };

  const abrirSendModal = (grupo: AlunoGrupo) => {
    const { critica, vars } = varsParaGrupo(grupo);
    const tpl = templateParaOffset(critica.dias_offset);
    if (tpl) {
      setSendTemplate(tpl.id);
      setSendMensagem(renderMensagem(tpl.mensagem, vars));
    } else {
      setSendTemplate('');
      setSendMensagem('');
    }
    setSendModal(grupo);
  };

  const enviarManual = async () => {
    if (!sendModal || !sendMensagem.trim()) return;
    const tpl = templates.find(t => t.id === sendTemplate);
    // Cobre todas as parcelas elegíveis (ou todas, se nenhuma elegível -- reenvio manual
    // de quem já foi cobrado) -- cada uma com o template que casa com a fase DELA, pra
    // marcar a fase certa como enviada no índice único, independente de qual template o
    // operador escolheu pro texto final.
    const base = sendModal.elegiveis.length ? sendModal.elegiveis : sendModal.parcelas;
    const cobertura = base.map(p => ({ pagamento_id: p.pagamento_id, template_id: templateParaOffset(p.dias_offset)?.id ?? null }));
    setEnviandoIds(p => new Set([...p, ...cobertura.map(c => c.pagamento_id)]));

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enviar-cobranca`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aluno_id:      sendModal.aluno_id,
          cobertura,
          mensagem:      sendMensagem,
          template_nome: tpl?.nome ?? 'Manual',
          template_tipo: tpl?.tipo ?? null,
          aluno_nome:    sendModal.aluno_nome,
          telefone:      sendModal.telefone,
        }),
      }
    );
    const json = await res.json();
    if (json.success) toast.success(`Mensagem enviada para ${sendModal.aluno_nome}!`);
    else toast.error('Erro ao enviar: ' + (json.error ?? 'desconhecido'));

    setEnviandoIds(p => { const next = new Set(p); cobertura.forEach(c => next.delete(c.pagamento_id)); return next; });
    setSendModal(null);
    setSendMensagem('');
    await loadAll();
  };

  const reenviarLog = async (log: CobrancaLog) => {
    setEnviandoIds(p => new Set([...p, log.id]));
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enviar-cobranca`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ log_id: log.id }),
      }
    );
    const json = await res.json();
    if (json.success) toast.success('Reenviado com sucesso!');
    else toast.error('Erro: ' + (json.error ?? 'desconhecido'));
    setEnviandoIds(p => { const next = new Set(p); next.delete(log.id); return next; });
    await loadAll();
  };

  const toggleConversaIaExpandida = (conversaId: string) => {
    const abrindo = !conversaIaExpandida.has(conversaId);
    setConversaIaExpandida(prev => {
      const next = new Set(prev);
      if (next.has(conversaId)) next.delete(conversaId); else next.add(conversaId);
      return next;
    });
    if (abrindo && !mensagensPorConversa[conversaId]) {
      void loadTranscriptIa(conversaId);
    }
  };

  const loadTranscriptIa = async (conversaId: string) => {
    setCarregandoTranscriptIds(p => new Set([...p, conversaId]));
    const { data, error } = await supabase
      .from('cobranca_ia_mensagens' as any)
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true });
    if (error) toast.error('Erro ao carregar conversa: ' + error.message);
    else setMensagensPorConversa(prev => ({ ...prev, [conversaId]: (data ?? []) as unknown as CobrancaIaMensagem[] }));
    setCarregandoTranscriptIds(p => { const next = new Set(p); next.delete(conversaId); return next; });
  };

  const marcarConversaIaResolvida = async (conversaId: string) => {
    setResolvendoConversaIds(p => new Set([...p, conversaId]));
    const { error } = await supabase
      .from('cobranca_ia_conversas' as any)
      .update({ status: 'encerrado', resolvido_por: user?.id ?? null, resolvido_em: new Date().toISOString() })
      .eq('id', conversaId);
    if (error) toast.error('Erro ao resolver: ' + error.message);
    else toast.success('Conversa marcada como resolvida!');
    setResolvendoConversaIds(p => { const next = new Set(p); next.delete(conversaId); return next; });
    await loadAll();
  };

  // "Disparar agora" processava a fila inteira numa invocação só, com só ~5s entre
  // envios (a função não consegue dar sleep de minutos parada no meio de uma requisição
  // HTTP) -- na prática mandava dezenas de mensagens em rajada de segundos, ignorando o
  // delay anti-ban configurado (2000-2350s) e o texto do próprio modal ("janela 09:00 às
  // 20:00"). Em vez de tentar reimplementar um sleep de minutos dentro de 1 requisição
  // (que a plataforma mata por timeout bem antes de terminar uma fila grande), só liga a
  // automação -- o tique automático (pg_cron, a cada minuto, já testado e no ar) drena a
  // fila no ritmo real e seguro, um envio por vez.
  const dispararBulk = async () => {
    setBulkConfirmOpen(false);
    setSaving(true);
    const { error } = await (supabase as any)
      .from('cobranca_config')
      .update({ ativo: true, pausado_por_erro: false, erros_seq: 0 })
      .eq('id', 'default');
    setSaving(false);
    if (error) { toast.error('Erro ao ativar: ' + error.message); return; }
    toast.success('Automação ativada — a fila será processada aos poucos pelo tique automático, respeitando o intervalo anti-ban.');
    await loadAll();
    await carregarStatusDisparo();
  };

  // ── Resumo diário ─────────────────────────────────────────────────────────
  const salvarResumoConfig = (ativo: boolean, numero: string) => {
    localStorage.setItem('resumo_diario_ativo', String(ativo));
    localStorage.setItem('resumo_diario_numero', numero);
  };

  const enviarResumoDiario = async (dryRun = false) => {
    setEnviandoResumo(true);
    try {
      const { data, error } = await supabase.functions.invoke('resumo-diario', {
        body: { dry_run: dryRun, numero: resumoNumero },
      });
      if (error) throw new Error(error.message);
      if (dryRun) {
        const r = data as any;
        toast.info(
          `Simulação: ${r.novos_leads} leads, ${r.matriculas} matrículas, R$ ${Number(r.total_recebido ?? 0).toFixed(2)} recebidos, ${r.inadimplentes} inadimplentes`,
          { duration: 6000 },
        );
      } else {
        toast.success('Resumo diário enviado!');
      }
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setEnviandoResumo(false);
    }
  };

  // Último contato de cobrança por aluno (pra badge "Cobrado ontem, HH:MM"/"Respondeu" no
  // card da Fila) -- deriva de `logs` inteiro, não de `filteredLogs`, que é filtrado pela
  // busca da aba Histórico e não deve afetar a Fila. Só conta envio que realmente saiu
  // (status 'enviado'); uma tentativa que deu erro não é "contato feito".
  const ultimoContatoPorAluno = useMemo<Map<string, UltimoContato>>(() => {
    const porAluno = new Map<string, CobrancaLog[]>();
    for (const log of logs) {
      if (log.status !== 'enviado' || !log.enviado_em) continue;
      const chave = log.aluno_id ?? log.telefone;
      if (!porAluno.has(chave)) porAluno.set(chave, []);
      porAluno.get(chave)!.push(log);
    }
    const resultado = new Map<string, UltimoContato>();
    for (const [chave, envios] of porAluno) {
      const ordenados = [...envios].sort((a, b) => new Date(b.enviado_em!).getTime() - new Date(a.enviado_em!).getTime());
      resultado.set(chave, {
        ultimoEnvio: ordenados[0].enviado_em!,
        respondeu: envios.some(l => !!l.respondeu_em),
      });
    }
    return resultado;
  }, [logs]);

  // ── Filtered logs ─────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() =>
    logs.filter(l =>
      !searchLog ||
      l.aluno_nome.toLowerCase().includes(searchLog.toLowerCase()) ||
      l.telefone.includes(searchLog) ||
      (l.template_nome ?? '').toLowerCase().includes(searchLog.toLowerCase())
    ),
  [logs, searchLog]);

  // Agrupa o histórico por aluno, colapsando linhas do mesmo grupo_envio_id (uma
  // mensagem consolidada gera N linhas em cobranca_logs, uma por parcela coberta) numa
  // única entrada de timeline -- senão o Histórico mostra a mesma mensagem repetida N
  // vezes pra quem tinha várias parcelas em aberto.
  const historicoPorAluno = useMemo<AlunoHistorico[]>(() => {
    const porGrupo = new Map<string, CobrancaLog[]>();
    for (const log of filteredLogs) {
      const chave = log.grupo_envio_id ?? log.id;
      if (!porGrupo.has(chave)) porGrupo.set(chave, []);
      porGrupo.get(chave)!.push(log);
    }
    const envios: HistoricoEnvio[] = Array.from(porGrupo.entries()).map(([chave, linhas]) => ({
      chave, linhas, representante: linhas[0], qtdParcelas: linhas.length,
    }));

    const porAluno = new Map<string, HistoricoEnvio[]>();
    for (const envio of envios) {
      const chaveAluno = envio.representante.aluno_id ?? envio.representante.telefone;
      if (!porAluno.has(chaveAluno)) porAluno.set(chaveAluno, []);
      porAluno.get(chaveAluno)!.push(envio);
    }

    const quando = (e: HistoricoEnvio) => new Date(e.representante.enviado_em ?? e.representante.created_at).getTime();
    const resultado: AlunoHistorico[] = [];
    for (const [, envios] of porAluno) {
      const ordenados = [...envios].sort((a, b) => quando(b) - quando(a));
      resultado.push({
        aluno_id: ordenados[0].representante.aluno_id,
        aluno_nome: ordenados[0].representante.aluno_nome,
        telefone: ordenados[0].representante.telefone,
        envios: ordenados,
        ultimoEnvio: ordenados[0],
        respondeuAlguma: envios.some(e => e.linhas.some(l => !!l.respondeu_em)),
      });
    }
    return resultado.sort((a, b) => quando(b.ultimoEnvio) - quando(a.ultimoEnvio));
  }, [filteredLogs]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Uma mensagem consolidada grava N linhas em cobranca_logs (1 por parcela coberta,
  // compartilhando grupo_envio_id) -- conta mensagens de verdade, não linhas de log,
  // senão "Total enviados"/"Enviados hoje" infla artificialmente pra quem tem várias
  // parcelas em aberto.
  const contarMensagens = (rows: CobrancaLog[]): number => {
    const grupos = new Set<string>();
    let avulsas = 0;
    for (const r of rows) {
      if (r.grupo_envio_id) grupos.add(r.grupo_envio_id);
      else avulsas++;
    }
    return grupos.size + avulsas;
  };

  const stats = useMemo(() => ({
    enviados: contarMensagens(logs.filter(l => l.status === 'enviado')),
    erros:    contarMensagens(logs.filter(l => l.status === 'erro')),
    hoje:     contarMensagens(logs.filter(l => l.status === 'enviado' && l.enviado_em && dataSaoPaulo(new Date(l.enviado_em)) === hojeSaoPaulo())),
    filaHoje: alunoGruposElegiveis.length,
    respondidos: contarMensagens(logs.filter(l => !!l.respondeu_em)),
  }), [logs, alunoGruposElegiveis]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="animate-spin mr-2" size={18} /> Carregando sistema de cobrança...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="text-primary" size={24} />
            Cobrança Automatizada
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envio de mensagens WhatsApp via Evolution API
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${
            cobrancaCfg?.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground border-border'
          }`}>
            {cobrancaCfg?.ativo ? <><Zap size={12}/> Automação ativa</> : <><Clock size={12}/> Automação pausada</>}
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5">
            <RefreshCw size={14}/> Atualizar
          </Button>
          {!cobrancaCfg?.ativo && alunoGruposElegiveis.length > 0 && (
            <Button size="sm" onClick={() => setBulkConfirmOpen(true)} className="gap-1.5">
              <Zap size={14}/> Ativar automação
            </Button>
          )}
        </div>
      </div>

      {/* Banner: pausado por erro sequencial */}
      {cobrancaCfg?.pausado_por_erro && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
          <AlertTriangle className="text-red-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Automação pausada automaticamente</p>
            <p className="text-xs text-red-600">
              {cobrancaCfg.erros_seq} erro(s) seguido(s) ao enviar — a cobrança foi desligada sozinha por segurança.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100" onClick={reativarAposErro} disabled={saving}>
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Reativar
          </Button>
        </div>
      )}

      {/* Card: resumo da Bia (Operações) sobre cobrança */}
      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold shrink-0">B</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-900">Bia — Operações</p>
              <p className="text-sm text-violet-800/90 whitespace-pre-wrap mt-1">
                {biaResumo ?? 'Ainda sem relatório com dados de cobrança. Peça uma atualização.'}
              </p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-100 shrink-0" onClick={pedirAtualizacaoBia} disabled={biaAtualizando}>
              {biaAtualizando ? <RefreshCw size={13} className="animate-spin"/> : null} Pedir atualização da Bia agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card: status do próximo disparo automático (tique) */}
      {statusDisparo && !cobrancaCfg?.pausado_por_erro && (
        <Card className="border-border/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-muted-foreground shrink-0" />
              <div className="flex-1 text-sm">
                {statusDisparo.estado === 'pausado_manual' && (
                  <span className="text-muted-foreground">Automação desligada — ligue o toggle em Configuração para retomar os envios.</span>
                )}
                {statusDisparo.estado === 'fim_de_semana' && (
                  <span className="text-muted-foreground">Pausado no fim de semana — retoma {typeof statusDisparo.proximo_em_s === 'number' && <>em <strong className="text-foreground">{fmtCountdown(statusDisparo.proximo_em_s)}</strong> ({fmtQuando(statusDisparo.proximo_em_s)})</>}</span>
                )}
                {statusDisparo.estado === 'fora_horario' && (
                  <span className="text-muted-foreground">Fora do horário de envio — retoma {typeof statusDisparo.proximo_em_s === 'number' && <>em <strong className="text-foreground">{fmtCountdown(statusDisparo.proximo_em_s)}</strong> ({fmtQuando(statusDisparo.proximo_em_s)})</>}</span>
                )}
                {statusDisparo.estado === 'limite_diario' && (
                  <span className="text-muted-foreground">Limite diário atingido — retoma amanhã {typeof statusDisparo.proximo_em_s === 'number' && <>em <strong className="text-foreground">{fmtCountdown(statusDisparo.proximo_em_s)}</strong> ({fmtQuando(statusDisparo.proximo_em_s)})</>}</span>
                )}
                {statusDisparo.estado === 'sem_templates' && (
                  <span className="text-muted-foreground">Nenhum template ativo — nada será enviado até ativar um em Templates.</span>
                )}
                {statusDisparo.estado === 'sem_elegiveis' && (
                  <span className="text-muted-foreground">Nenhum lead elegível na fila agora.</span>
                )}
                {statusDisparo.estado === 'aguardando_delay' && countdown !== null && (
                  <span>
                    Próximo envio em <strong>{fmtCountdown(countdown)}</strong>
                    {typeof statusDisparo.proximo_em_s_max === 'number' && countdown < statusDisparo.proximo_em_s_max && (
                      <span className="text-muted-foreground"> (janela até {fmtCountdown(statusDisparo.proximo_em_s_max)})</span>
                    )}
                    {statusDisparo.proximo_lead && <span className="text-muted-foreground"> — próximo: {statusDisparo.proximo_lead}</span>}
                  </span>
                )}
                {statusDisparo.estado === 'pronto' && (
                  <span>
                    <span className="text-emerald-600 font-medium">Pronto pra enviar</span>
                    {statusDisparo.proximo_lead && <span className="text-muted-foreground"> — próximo: {statusDisparo.proximo_lead}</span>}
                    <span className="text-muted-foreground"> (aguardando o próximo tique do cron)</span>
                  </span>
                )}
              </div>
              {typeof statusDisparo.fila_total === 'number' && (
                <span className="text-xs text-muted-foreground shrink-0">{statusDisparo.fila_total} na fila</span>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={carregarStatusDisparo} title="Atualizar status">
                <RefreshCw size={13}/>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Na fila hoje', value: stats.filaHoje, icon: Calendar, color: 'text-blue-600' },
          { label: 'Inadimplentes', value: filaStats.inadimplentesTotal, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Total em aberto', value: `R$ ${fmt(filaStats.totalEmAberto)}`, icon: TrendingDown, color: 'text-red-500' },
          { label: 'Enviados hoje', value: stats.hoje,    icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Total enviados', value: stats.enviados, icon: Send, color: 'text-primary' },
          { label: 'Erros',          value: stats.erros,   icon: XCircle, color: 'text-red-500' },
          { label: 'Respondidos',   value: stats.respondidos, icon: MessageSquare, color: 'text-violet-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                <Icon size={16} className={color} />
              </div>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as any)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="fila"      className="gap-1.5 flex-1 sm:flex-none"><Calendar size={14}/> Fila ({alunoGruposElegiveis.length})</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5 flex-1 sm:flex-none"><History size={14}/> Histórico</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 flex-1 sm:flex-none"><FileText size={14}/> Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="config"    className="gap-1.5 flex-1 sm:flex-none"><Settings size={14}/> Configuração</TabsTrigger>
          <TabsTrigger value="conversas_ia" className="gap-1.5 flex-1 sm:flex-none">
            <MessageSquare size={14}/> Conversas IA
            {conversasIA.filter(c => c.status !== 'encerrado').length > 0 && ` (${conversasIA.filter(c => c.status !== 'encerrado').length})`}
          </TabsTrigger>
        </TabsList>

        {/* ─── FILA ───────────────────────────────────────────────────────── */}
        <TabsContent value="fila" className="mt-4 space-y-4">

          {/* Schedule info banner */}
          {alunoGruposElegiveis.length > 0 && schedule && (
            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <span className="font-semibold">{alunoGruposElegiveis.length} contatos na fila</span>
                      {' — '}intervalo de <span className="font-semibold">{schedule.intervalMin} min</span> entre envios,
                      de <span className="font-semibold">{schedule.inicio}</span> às <span className="font-semibold">{schedule.fim}</span>
                      {schedule.diasNecessarios > 1 && <> · leva <span className="font-semibold">~{schedule.diasNecessarios} dias</span> pra esvaziar a fila toda nesse ritmo</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-7 sm:ml-0">
                    {filaStats.inadimplentes > 0 && (
                      <Badge className="bg-red-50 text-red-700 border border-red-200 gap-1 text-xs">
                        <TrendingDown size={10}/> {filaStats.inadimplentes} inadimplentes
                      </Badge>
                    )}
                    {filaStats.mesMes > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 border border-blue-200 gap-1 text-xs">
                        <Calendar size={10}/> {filaStats.mesMes} este mês
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar size={16}/> Fila de hoje
              </CardTitle>
              <CardDescription>
                Um card por aluno, com todo o débito em aberto — cobranças deste mês e inadimplentes de meses
                anteriores que ainda não receberam a mensagem da janela/fase atual
              </CardDescription>
            </CardHeader>
            <CardContent className={alunoGruposElegiveis.length === 0 ? 'p-0' : 'space-y-3'}>
              {alunoGrupos.length - alunoGruposElegiveis.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {alunoGrupos.length - alunoGruposElegiveis.length} aluno(s) já cobrado(s) nesta janela — aparecem de novo só na próxima janela configurada
                </p>
              )}
              {alunoGruposElegiveis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <CheckCircle2 size={40} className="text-emerald-400"/>
                  <p className="font-medium">Nenhum envio pendente para hoje</p>
                  <p className="text-xs">A fila mostra apenas cobranças do mês atual e inadimplentes</p>
                </div>
              ) : (
                alunoGruposElegiveis.map((grupo, idx) => (
                  <AlunoFilaCard
                    key={grupo.aluno_id}
                    grupo={grupo}
                    horaEstimada={schedule?.slots[idx]}
                    jaCobradoHoje={grupo.parcelas.some(p => enviadosHojeSet.has(p.pagamento_id))}
                    isSending={grupo.elegiveis.some(p => enviandoIds.has(p.pagamento_id))}
                    onEnviar={() => abrirSendModal(grupo)}
                    ultimoContato={ultimoContatoPorAluno.get(grupo.aluno_id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── HISTÓRICO ──────────────────────────────────────────────────── */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History size={16}/> Histórico de envios
                  </CardTitle>
                  <CardDescription>Um card por aluno, agrupando envios da mesma mensagem consolidada</CardDescription>
                </div>
                <Input
                  placeholder="Buscar aluno, telefone..."
                  value={searchLog}
                  onChange={e => setSearchLog(e.target.value)}
                  className="w-56 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className={historicoPorAluno.length === 0 ? 'p-0' : 'space-y-2'}>
              {historicoPorAluno.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <History size={40} className="opacity-30"/>
                  <p>Nenhum envio registrado ainda</p>
                </div>
              ) : (
                historicoPorAluno.map(aluno => (
                  <AlunoHistoricoCard
                    key={aluno.aluno_id ?? aluno.telefone}
                    aluno={aluno}
                    expandido={historicoExpandido.has(aluno.aluno_id ?? aluno.telefone)}
                    onToggle={() => toggleHistoricoExpandido(aluno.aluno_id ?? aluno.telefone)}
                    onClickEnvio={setLogDetail}
                    onReenviar={reenviarLog}
                    enviandoIds={enviandoIds}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TEMPLATES ──────────────────────────────────────────────────── */}
        <TabsContent value="templates" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Templates de Mensagem</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use: {VARIAVEIS.join(' ')}
              </p>
            </div>
            <Button size="sm" onClick={() => setTemplateModal({ tipo: 'pos_vencimento', dias_offset: 0, ativo: true })} className="gap-1.5">
              <Plus size={14}/> Novo template
            </Button>
          </div>

          <div className="grid gap-3">
            {Object.entries(TIPO_LABELS).map(([tipo, label]) => {
              const grupo = templates.filter(t => t.tipo === tipo);
              if (grupo.length === 0) return null;
              return (
                <div key={tipo}>
                  <Badge className={`mb-2 border text-xs ${TIPO_COLORS[tipo]}`}>{label}</Badge>
                  <div className="grid gap-2">
                    {grupo.map(tpl => (
                      <Card key={tpl.id} className={`border transition-all ${!tpl.ativo ? 'opacity-50' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{tpl.nome}</span>
                                {tpl.dias_offset !== 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {tpl.tipo === 'pos_vencimento'
                                      ? (tpl.dias_offset_fim == null
                                          ? `${tpl.dias_offset}d+`
                                          : tpl.dias_offset_fim === tpl.dias_offset
                                            ? `+${tpl.dias_offset}d`
                                            : `${tpl.dias_offset}-${tpl.dias_offset_fim}d`)
                                      : (tpl.dias_offset > 0 ? `+${tpl.dias_offset}d` : `${tpl.dias_offset}d`)}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{tpl.mensagem}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch checked={tpl.ativo} onCheckedChange={() => toggleTemplate(tpl)} />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setTemplateModal({ ...tpl })}>
                                <Pencil size={13}/>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => deletarTemplate(tpl.id)}>
                                <Trash2 size={13}/>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── CONFIGURAÇÃO ───────────────────────────────────────────────── */}
        <TabsContent value="config" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Evolution API */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone size={16}/> WhatsApp — Cobrança
                </CardTitle>
                <CardDescription>
                  Selecione qual número envia as cobranças e adicione backups opcionais.
                  Gerencie as instâncias em <strong>Configurações → WhatsApp</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EvolutionTaskPanel task="cobranca" label="Cobrança" />
              </CardContent>
            </Card>

            {/* Turmas administradas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar size={16}/> Turmas administradas
                </CardTitle>
                <CardDescription>
                  Só alunos das turmas marcadas aqui entram na fila de cobrança — escolha manual, turma a turma.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {turmas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma turma cadastrada.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {turmas.map(t => {
                      const ativa = turmasAtivas.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTurmaAtiva(t.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            ativa ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary'
                          }`}
                        >
                          {t.nome}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">{turmasAtivas.size} turma(s) administrada(s)</p>
              </CardContent>
            </Card>

            {/* Regras de cobrança */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings size={16}/> Regras de envio
                </CardTitle>
                <CardDescription>Configure quando e como os lembretes são disparados</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">Automação ativa</p>
                    <p className="text-xs text-muted-foreground">Liga/desliga todos os envios automáticos</p>
                  </div>
                  <Switch
                    checked={cobrancaCfg?.ativo ?? false}
                    onCheckedChange={v => setCobrancaCfg(p => p ? { ...p, ativo: v } : p)}
                  />
                </div>

                {/* Janela de envio */}
                <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                  <p className="text-sm font-medium">Janela de envio (horário comercial)</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                      <Input
                        type="time"
                        value={cobrancaCfg?.horario_inicio_envio ?? cobrancaCfg?.horario_envio ?? '09:00'}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, horario_inicio_envio: e.target.value, horario_envio: e.target.value } : p)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                      <Input
                        type="time"
                        value={cobrancaCfg?.horario_fim_envio ?? '18:00'}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, horario_fim_envio: e.target.value } : p)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Os envios serão distribuídos uniformemente nesta janela
                  </p>
                </div>

                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Pré-vencimento</p>
                      <p className="text-xs text-muted-foreground">Dias antes do vencimento</p>
                    </div>
                    <Switch
                      checked={cobrancaCfg?.enviar_pre_vencimento ?? true}
                      onCheckedChange={v => setCobrancaCfg(p => p ? { ...p, enviar_pre_vencimento: v } : p)}
                    />
                  </div>
                  {cobrancaCfg?.enviar_pre_vencimento && (
                    <DaysChips
                      values={cobrancaCfg?.dias_pre_vencimento ?? []}
                      onChange={v => setCobrancaCfg(p => p ? { ...p, dias_pre_vencimento: v } : p)}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">No dia do vencimento</p>
                    <p className="text-xs text-muted-foreground">Enviar no próprio dia</p>
                  </div>
                  <Switch
                    checked={cobrancaCfg?.enviar_no_vencimento ?? true}
                    onCheckedChange={v => setCobrancaCfg(p => p ? { ...p, enviar_no_vencimento: v } : p)}
                  />
                </div>

                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Pós-vencimento</p>
                      <p className="text-xs text-muted-foreground">Dias após o vencimento</p>
                    </div>
                    <Switch
                      checked={cobrancaCfg?.enviar_pos_vencimento ?? true}
                      onCheckedChange={v => setCobrancaCfg(p => p ? { ...p, enviar_pos_vencimento: v } : p)}
                    />
                  </div>
                  {cobrancaCfg?.enviar_pos_vencimento && (
                    <DaysChips
                      values={cobrancaCfg?.dias_pos_vencimento ?? []}
                      onChange={v => setCobrancaCfg(p => p ? { ...p, dias_pos_vencimento: v } : p)}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">Pausar fins de semana</p>
                    <p className="text-xs text-muted-foreground">Não enviar sábado e domingo</p>
                  </div>
                  <Switch
                    checked={cobrancaCfg?.pausar_fins_semana ?? true}
                    onCheckedChange={v => setCobrancaCfg(p => p ? { ...p, pausar_fins_semana: v } : p)}
                  />
                </div>

                {/* Anti-ban */}
                <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                  <p className="text-sm font-medium">Anti-ban</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Delay mín. (seg)</label>
                      <Input type="number" min={5} value={cobrancaCfg?.delay_min_s ?? 20}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, delay_min_s: Number(e.target.value) } : p)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Delay máx. (seg)</label>
                      <Input type="number" min={5} value={cobrancaCfg?.delay_max_s ?? 60}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, delay_max_s: Number(e.target.value) } : p)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Limite diário</label>
                      <Input type="number" min={1} value={cobrancaCfg?.daily_limit ?? 150}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, daily_limit: Number(e.target.value) } : p)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Pausar após N erros seguidos</label>
                      <Input type="number" min={1} value={cobrancaCfg?.max_errors_seq ?? 3}
                        onChange={e => setCobrancaCfg(p => p ? { ...p, max_errors_seq: Number(e.target.value) } : p)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O tique automático espera um intervalo aleatório entre esse mínimo e máximo antes de cada envio, e se desliga sozinho se passar do limite de erros seguidos. O botão "Ativar automação" na Fila usa exatamente esse mesmo ritmo — ele só liga a automação, não manda nada de uma vez.
                  </p>
                </div>

                <Button size="sm" className="w-full gap-1.5" onClick={salvarCobrancaCfg} disabled={saving}>
                  {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
                  Salvar regras
                </Button>
              </CardContent>
            </Card>

            {/* ── Ativação via Cron ── */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap size={16}/>Disparo automático (tique)
                </CardTitle>
                <CardDescription>
                  Roda sozinho a cada minuto direto no banco (pg_cron), sem precisar de serviço externo — cada chamada só manda 1 mensagem, e só se as regras de horário/limite/delay permitirem.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border w-fit ${
                  cobrancaCfg?.ativo
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {cobrancaCfg?.ativo
                    ? <><CheckCircle2 size={14}/> Automação ativa — o job "enviar-cobranca-tick" verifica a cada minuto</>
                    : <><Clock size={14}/> Aguardando ativação — ative o toggle "Automação ativa" acima</>}
                </div>

                <p className="text-xs text-muted-foreground">
                  O card de status no topo da página mostra em tempo real quando o próximo envio deve sair. Não precisa configurar nada em serviço externo — se quiser conferir o job por baixo, ele se chama <code className="bg-muted px-1 rounded">enviar-cobranca-tick</code> no pg_cron do Supabase.
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5"
                    onClick={() => setTab('fila')}
                  >
                    <Info size={13}/> Ver fila atual ({alunoGruposElegiveis.length})
                  </Button>
                  {!cobrancaCfg?.ativo && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setBulkConfirmOpen(true)}
                      disabled={alunoGruposElegiveis.length === 0}
                    >
                      <Zap size={13}/> Ativar automação
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Resumo Diário WhatsApp (dormant) ── */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare size={16}/> Resumo Diário via WhatsApp
                </CardTitle>
                <CardDescription>
                  Receba um resumo das métricas do dia (leads, matrículas, pagamentos, inadimplentes) por WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">Resumo diário ativo</p>
                    <p className="text-xs text-muted-foreground">Recebe mensagem todo dia às 8h (via cron)</p>
                  </div>
                  <Switch
                    checked={resumoAtivo}
                    onCheckedChange={v => { setResumoAtivo(v); salvarResumoConfig(v, resumoNumero); }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Número de destino (WhatsApp com DDI)</label>
                  <Input
                    placeholder="Ex: 5511999999999"
                    value={resumoNumero}
                    onChange={e => { setResumoNumero(e.target.value); salvarResumoConfig(resumoAtivo, e.target.value); }}
                    className="h-9 max-w-xs font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1.5"
                    onClick={() => enviarResumoDiario(true)}
                    disabled={enviandoResumo}
                  >
                    {enviandoResumo ? <RefreshCw size={13} className="animate-spin"/> : <Info size={13}/>}
                    Simular (dry run)
                  </Button>
                  <Button
                    size="sm" className="gap-1.5"
                    onClick={() => enviarResumoDiario(false)}
                    disabled={enviandoResumo || !resumoNumero}
                  >
                    {enviandoResumo ? <RefreshCw size={13} className="animate-spin"/> : <Send size={13}/>}
                    Enviar agora
                  </Button>
                </div>

                {resumoAtivo && (
                  <div className="text-xs bg-muted/30 rounded p-3 space-y-1 border">
                    <p className="font-medium text-muted-foreground">Configure também no cron-job.org para envio automático:</p>
                    <div className="font-mono text-muted-foreground">
                      POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/resumo-diario
                    </div>
                    <div className="font-mono text-muted-foreground">
                      Body: {`{"numero":"${resumoNumero || 'SEU_NUMERO'}"}`}
                    </div>
                    <div className="font-mono text-muted-foreground">Cron: 0 8 * * *</div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ─── CONVERSAS IA ───────────────────────────────────────────────── */}
        <TabsContent value="conversas_ia" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare size={16}/> Conversas IA
              </CardTitle>
              <CardDescription>
                Quando um aluno cadastrado responde a uma cobrança, a IA assume a conversa — cria rapport,
                entende o atraso e coleta uma data estimada de pagamento. Aqui fica a fila do que ela já
                resolveu ou precisou encaminhar pro time.
              </CardDescription>
            </CardHeader>
            <CardContent className={conversasIA.length === 0 ? 'p-0' : 'space-y-2'}>
              {conversasIA.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <MessageSquare size={40} className="opacity-30"/>
                  <p>Nenhuma conversa de IA ainda</p>
                </div>
              ) : (
                conversasIA.map(conversa => (
                  <ConversaIaCard
                    key={conversa.id}
                    conversa={conversa}
                    expandido={conversaIaExpandida.has(conversa.id)}
                    onToggle={() => toggleConversaIaExpandida(conversa.id)}
                    mensagens={mensagensPorConversa[conversa.id] ?? []}
                    carregandoTranscript={carregandoTranscriptIds.has(conversa.id)}
                    onResolver={() => marcarConversaIaResolvida(conversa.id)}
                    resolvendo={resolvendoConversaIds.has(conversa.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Modal: Confirmar ativação da automação ────────────────────────── */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={16}/> Ativar automação de cobrança
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
                <p className="text-2xl font-bold text-blue-700">{alunoGruposElegiveis.length}</p>
                <p className="text-xs text-blue-600">alunos na fila</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-center">
                <p className="text-2xl font-bold text-red-700">{filaStats.inadimplentes}</p>
                <p className="text-xs text-red-600">inadimplentes</p>
              </div>
            </div>
            {schedule && (
              <div className="p-3 rounded-lg bg-muted border text-sm space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={13}/>
                  <span>Janela: <strong className="text-foreground">{schedule.inicio} → {schedule.fim}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info size={13}/>
                  <span>1 envio a cada <strong className="text-foreground">{schedule.intervalMin} min</strong> (anti-ban)</span>
                </div>
                {schedule.diasNecessarios > 1 && (
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle size={13}/>
                    <span>Nesse ritmo, leva <strong>~{schedule.diasNecessarios} dias</strong> pra esvaziar a fila toda</span>
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Isto <strong>não manda tudo agora</strong> — só liga a automação. Um envio por vez sai sozinho a cada
              tique do cron (a cada minuto, respeitando o delay acima), não uma rajada. Você pode desligar a qualquer
              momento no toggle "Automação ativa" em Configuração.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={dispararBulk} className="gap-1.5" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin"/> : <Zap size={14}/>} Ativar automação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Envio manual ──────────────────────────────────────────── */}
      <Dialog open={!!sendModal} onOpenChange={v => !v && setSendModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16}/> Enviar mensagem
            </DialogTitle>
          </DialogHeader>
          {sendModal && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {sendModal.aluno_nome[0]}
                </div>
                <div>
                  <p className="font-semibold">{sendModal.aluno_nome}</p>
                  <p className="text-xs text-muted-foreground font-mono">{sendModal.telefone}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">
                    {sendModal.parcelas.length > 1 ? `${sendModal.parcelas.length} parcelas em aberto` : `Parcela ${sendModal.parcelas[0].parcela}`}
                  </p>
                  <p className="font-bold text-sm">R$ {fmt(sendModal.totalDevido)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Template</label>
                <Select value={sendTemplate} onValueChange={tid => {
                  setSendTemplate(tid);
                  const tpl = templates.find(t => t.id === tid);
                  if (tpl) {
                    const { vars } = varsParaGrupo(sendModal);
                    setSendMensagem(renderMensagem(tpl.mensagem, vars));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um template ou escreva abaixo"/></SelectTrigger>
                  <SelectContent>
                    {templates.filter(t => t.ativo).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mensagem</label>
                  <span className="text-xs text-muted-foreground">{sendMensagem.length} chars</span>
                </div>
                <Textarea
                  rows={10}
                  value={sendMensagem}
                  onChange={e => setSendMensagem(e.target.value)}
                  placeholder="Digite a mensagem ou selecione um template acima..."
                  className="font-mono text-sm resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {VARIAVEIS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSendMensagem(p => p + v)}
                    className="px-2 py-0.5 rounded bg-muted text-xs font-mono hover:bg-primary/10 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModal(null)}>Cancelar</Button>
            <Button
              onClick={enviarManual}
              disabled={!sendMensagem.trim() || (sendModal ? (sendModal.elegiveis.length ? sendModal.elegiveis : sendModal.parcelas) : []).some(p => enviandoIds.has(p.pagamento_id))}
              className="gap-1.5"
            >
              <Send size={14}/> Enviar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Template editor ───────────────────────────────────────── */}
      <Dialog open={!!templateModal} onOpenChange={v => !v && setTemplateModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{templateModal?.id ? 'Editar template' : 'Novo template'}</DialogTitle>
          </DialogHeader>
          {templateModal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome</label>
                  <Input
                    value={templateModal.nome ?? ''}
                    onChange={e => setTemplateModal(p => p ? { ...p, nome: e.target.value } : p)}
                    placeholder="Ex: Lembrete 3 dias antes"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo</label>
                  <Select
                    value={templateModal.tipo ?? 'pos_vencimento'}
                    onValueChange={v => setTemplateModal(p => p ? { ...p, tipo: v as any } : p)}
                  >
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {templateModal.tipo === 'pos_vencimento'
                      ? 'A partir de (dias após vencer)'
                      : `Offset de dias (${templateModal.tipo === 'pre_vencimento' ? 'negativo = antes' : 'positivo = depois'})`}
                  </label>
                  <Input
                    type="number"
                    value={templateModal.dias_offset ?? 0}
                    onChange={e => setTemplateModal(p => p ? { ...p, dias_offset: Number(e.target.value) } : p)}
                    className="w-28"
                  />
                </div>
                {templateModal.tipo === 'pos_vencimento' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Até (dias)</label>
                      <Input
                        type="number"
                        value={templateModal.dias_offset_fim ?? ''}
                        placeholder="sem limite"
                        disabled={templateModal.dias_offset_fim == null}
                        onChange={e => setTemplateModal(p => p ? { ...p, dias_offset_fim: e.target.value === '' ? null : Number(e.target.value) } : p)}
                        className="w-28"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateModal.dias_offset_fim == null}
                        onChange={e => setTemplateModal(p => p ? { ...p, dias_offset_fim: e.target.checked ? null : (p.dias_offset ?? 0) } : p)}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      Sem limite (fase aberta)
                    </label>
                  </>
                )}
              </div>
              {templateModal.tipo === 'pos_vencimento' && (
                <p className="text-xs text-muted-foreground -mt-3">
                  Essa mensagem é enviada uma vez pra quem estiver com atraso nessa faixa de dias — não repete todo dia.
                </p>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mensagem</label>
                </div>
                <Textarea
                  rows={10}
                  value={templateModal.mensagem ?? ''}
                  onChange={e => setTemplateModal(p => p ? { ...p, mensagem: e.target.value } : p)}
                  placeholder="Olá {{nome}}..."
                  className="font-mono text-sm resize-none"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {VARIAVEIS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTemplateModal(p => p ? { ...p, mensagem: (p.mensagem ?? '') + v } : p)}
                      className="px-2 py-0.5 rounded bg-muted text-xs font-mono hover:bg-primary/10 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={templateModal.ativo ?? true}
                  onCheckedChange={v => setTemplateModal(p => p ? { ...p, ativo: v } : p)}
                />
                <span className="text-sm">Template ativo</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModal(null)}>Cancelar</Button>
            <Button onClick={salvarTemplate} disabled={saving || !templateModal?.nome || !templateModal?.mensagem}>
              Salvar template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Detalhe do log ────────────────────────────────────────── */}
      <Dialog open={!!logDetail} onOpenChange={v => !v && setLogDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={16}/> Detalhe do envio
            </DialogTitle>
          </DialogHeader>
          {logDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground font-medium">Aluno</p><p className="font-semibold">{logDetail.aluno_nome}</p></div>
                <div><p className="text-xs text-muted-foreground font-medium">Telefone</p><p className="font-mono">{logDetail.telefone}</p></div>
                <div><p className="text-xs text-muted-foreground font-medium">Status</p><StatusBadge status={logDetail.status}/></div>
                <div><p className="text-xs text-muted-foreground font-medium">Enviado em</p><p>{fmtDate(logDetail.enviado_em)}</p></div>
                <div><p className="text-xs text-muted-foreground font-medium">Template</p><p>{logDetail.template_nome ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground font-medium">Tipo</p><p>{TIPO_LABELS[logDetail.template_tipo ?? ''] ?? '—'}</p></div>
              </div>
              {logDetail.erro_msg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                  {logDetail.erro_msg}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mensagem enviada</p>
                <div className="p-3 rounded-lg bg-muted/40 border text-sm whitespace-pre-line font-mono">
                  {logDetail.mensagem}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {logDetail?.status === 'erro' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={enviandoIds.has(logDetail.id)}
                onClick={() => { reenviarLog(logDetail!); setLogDetail(null); }}
              >
                <RefreshCw size={13}/> Reenviar
              </Button>
            )}
            <Button onClick={() => setLogDetail(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Utilitário de render de template (client-side, para preview)
function renderMensagem(template: string, vars: Record<string, string | number | boolean | null>): string {
  let result = template;
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return vars[key] ? content : '';
  });
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v !== null && v !== undefined ? String(v) : '';
  });
  return result.trim();
}
