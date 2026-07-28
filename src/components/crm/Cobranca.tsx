import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  AlertTriangle, TrendingDown, Copy, ExternalLink,
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

const VARIAVEIS = ['{{nome}}', '{{valor}}', '{{parcela}}', '{{vencimento}}', '{{dias_atraso}}', '{{link_pagamento}}'];

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

// ─── Main Component ───────────────────────────────────────────────────────────

export function Cobranca() {
  const { user } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'fila' | 'historico' | 'templates' | 'config'>('fila');

  const [cobrancaCfg, setCobrancaCfg] = useState<CobrancaConfig | null>(null);
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [logs, setLogs]               = useState<CobrancaLog[]>([]);
  const [fila, setFila]               = useState<FilaItem[]>([]);

  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [enviandoIds, setEnviandoIds] = useState<Set<string>>(new Set());

  // Template modal
  const [templateModal, setTemplateModal] = useState<Partial<Template> | null>(null);

  // Send manual modal
  const [sendModal, setSendModal] = useState<FilaItem | null>(null);
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
    const [cfgRes, tplRes, logRes, turmasRes, turmasAtivasRes, biaRes] = await Promise.all([
      supabase.from('cobranca_config'  as any).select('*').eq('id', 'default').single(),
      supabase.from('cobranca_templates' as any).select('*').order('ordem'),
      supabase.from('cobranca_logs' as any).select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('turmas').select('id, nome').order('nome'),
      supabase.from('cobranca_turmas_ativas' as any).select('turma_id'),
      supabase.from('equipe_11ds_agentes' as any).select('id').eq('slug', 'bia-comunicacao').maybeSingle(),
    ]);

    if (cfgRes.data) setCobrancaCfg(cfgRes.data as CobrancaConfig);
    if (tplRes.data) setTemplates(tplRes.data as Template[]);
    if (logRes.data) setLogs(logRes.data as CobrancaLog[]);
    if (turmasRes.data) setTurmas(turmasRes.data as Turma[]);
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

    const hoje = new Date().toISOString().split('T')[0];
    const filaRes = await supabase.rpc('get_alunos_para_cobranca' as any, { p_data: hoje });
    if (filaRes.data) setFila(filaRes.data as FilaItem[]);

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

  // ── Schedule calculation ──────────────────────────────────────────────────
  const schedule = useMemo(() => {
    if (!cobrancaCfg || fila.length === 0) return null;
    const inicio = cobrancaCfg.horario_inicio_envio || cobrancaCfg.horario_envio || '09:00';
    const fim = cobrancaCfg.horario_fim_envio || '18:00';
    const totalMin = timeToMin(fim) - timeToMin(inicio);
    if (totalMin <= 0) return null;
    const intervalMin = fila.length > 1 ? Math.floor(totalMin / (fila.length - 1)) : totalMin;
    const slots = fila.map((_, i) => addMinutesToTime(inicio, i * intervalMin));
    return { intervalMin, inicio, fim, slots, totalMin };
  }, [fila, cobrancaCfg]);

  // ── Fila breakdown ────────────────────────────────────────────────────────
  const filaStats = useMemo(() => ({
    inadimplentes: fila.filter(f => f.pagamento_status === 'atrasado').length,
    mesMes: fila.filter(f => f.pagamento_status === 'pendente').length,
  }), [fila]);

  // Parcelas já cobradas hoje -- pra marcar na tabela da fila em vez de deixar parecer
  // que ninguém foi tocado ainda
  const enviadosHojeSet = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0];
    return new Set(
      logs
        .filter(l => l.status === 'enviado' && l.pagamento_id && (l.enviado_em ?? l.created_at)?.startsWith(hoje))
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
  const abrirSendModal = (item: FilaItem) => {
    let tipo = item.dias_offset < 0 ? 'pre_vencimento' : item.dias_offset === 0 ? 'vencimento' : 'pos_vencimento';
    const tpl = templates.find(t => t.tipo === tipo && t.dias_offset === item.dias_offset && t.ativo);
    if (tpl) {
      setSendTemplate(tpl.id);
      const vencimento = new Date(item.data_vencimento).toLocaleDateString('pt-BR');
      const vars: Record<string, string | number | null> = {
        nome: item.aluno_nome,
        valor: fmt(item.valor),
        parcela: item.parcela,
        vencimento,
        dias_atraso: item.dias_offset > 0 ? item.dias_offset : null,
        link_pagamento: item.link_pagamento || null,
      };
      setSendMensagem(renderMensagem(tpl.mensagem, vars));
    } else {
      setSendTemplate('');
      setSendMensagem('');
    }
    setSendModal(item);
  };

  const enviarManual = async () => {
    if (!sendModal || !sendMensagem.trim()) return;
    const tpl = templates.find(t => t.id === sendTemplate);
    setEnviandoIds(p => new Set([...p, sendModal.pagamento_id]));

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
          pagamento_id:  sendModal.pagamento_id,
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

    setSendModal(null);
    setSendMensagem('');
    setEnviandoIds(p => { const next = new Set(p); next.delete(sendModal.pagamento_id); return next; });
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

  const dispararBulk = async () => {
    setBulkConfirmOpen(false);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    toast.info('Processando fila de cobrança...');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enviar-cobranca`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bulk: true }),
      }
    );
    const json = await res.json();
    if (json.enviados !== undefined) {
      toast.success(`${json.enviados} mensagens enviadas${json.erros ? `, ${json.erros} erros` : ''}`);
    } else {
      toast.error(json.error ?? 'Erro ao processar fila');
    }
    await loadAll();
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

  // ── Filtered logs ─────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() =>
    logs.filter(l =>
      !searchLog ||
      l.aluno_nome.toLowerCase().includes(searchLog.toLowerCase()) ||
      l.telefone.includes(searchLog) ||
      (l.template_nome ?? '').toLowerCase().includes(searchLog.toLowerCase())
    ),
  [logs, searchLog]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    enviados: logs.filter(l => l.status === 'enviado').length,
    erros:    logs.filter(l => l.status === 'erro').length,
    hoje:     logs.filter(l => l.status === 'enviado' && l.enviado_em?.startsWith(new Date().toISOString().split('T')[0])).length,
    filaHoje: fila.length,
  }), [logs, fila]);

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
          {cobrancaCfg?.ativo && fila.length > 0 && (
            <Button size="sm" onClick={() => setBulkConfirmOpen(true)} className="gap-1.5">
              <Play size={14}/> Disparar agora
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Na fila hoje', value: stats.filaHoje, icon: Calendar, color: 'text-blue-600' },
          { label: 'Enviados hoje', value: stats.hoje,    icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Total enviados', value: stats.enviados, icon: Send, color: 'text-primary' },
          { label: 'Erros',          value: stats.erros,   icon: XCircle, color: 'text-red-500' },
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
          <TabsTrigger value="fila"      className="gap-1.5 flex-1 sm:flex-none"><Calendar size={14}/> Fila ({fila.length})</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5 flex-1 sm:flex-none"><History size={14}/> Histórico</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 flex-1 sm:flex-none"><FileText size={14}/> Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="config"    className="gap-1.5 flex-1 sm:flex-none"><Settings size={14}/> Configuração</TabsTrigger>
        </TabsList>

        {/* ─── FILA ───────────────────────────────────────────────────────── */}
        <TabsContent value="fila" className="mt-4 space-y-4">

          {/* Schedule info banner */}
          {fila.length > 0 && schedule && (
            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <span className="font-semibold">{fila.length} contatos na fila</span>
                      {' — '}intervalo de <span className="font-semibold">{schedule.intervalMin} min</span> entre envios,
                      de <span className="font-semibold">{schedule.inicio}</span> às <span className="font-semibold">{schedule.fim}</span>
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
                Apenas cobranças deste mês (pendente) e inadimplentes de meses anteriores
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {fila.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <CheckCircle2 size={40} className="text-emerald-400"/>
                  <p className="font-medium">Nenhum envio pendente para hoje</p>
                  <p className="text-xs">A fila mostra apenas cobranças do mês atual e inadimplentes</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Aluno</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Telefone</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Parcela</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Valor</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Vencimento</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Situação</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Cobrado hoje</th>
                        {schedule && <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Hora estimada</th>}
                        <th className="px-4 py-3"/>
                      </tr>
                    </thead>
                    <tbody>
                      {fila.map((item, idx) => {
                        const atraso = item.dias_offset;
                        const isSending = enviandoIds.has(item.pagamento_id);
                        const isInadimplente = item.pagamento_status === 'atrasado';
                        const jaCobrado = enviadosHojeSet.has(item.pagamento_id);
                        return (
                          <tr key={item.pagamento_id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                  {item.aluno_nome[0]}
                                </div>
                                <span className="font-medium">{item.aluno_nome}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.telefone}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs">#{item.parcela}</Badge>
                            </td>
                            <td className="px-4 py-3 font-semibold">R$ {fmt(item.valor)}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(item.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3">
                              {isInadimplente
                                ? <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs gap-1"><AlertTriangle size={10}/>{atraso}d em atraso</Badge>
                                : atraso < 0
                                  ? <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">{Math.abs(atraso)}d antes</Badge>
                                  : atraso === 0
                                    ? <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs">Vence hoje</Badge>
                                    : <Badge className="bg-orange-50 text-orange-700 border border-orange-200 text-xs">{atraso}d após</Badge>
                              }
                            </td>
                            <td className="px-4 py-3">
                              {jaCobrado
                                ? <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs gap-1"><CheckCircle2 size={10}/>Já cobrado</Badge>
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            {schedule && (
                              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                {schedule.slots[idx]}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs h-7"
                                disabled={isSending}
                                onClick={() => abrirSendModal(item)}
                              >
                                {isSending ? <RefreshCw size={12} className="animate-spin"/> : <Send size={12}/>}
                                {jaCobrado ? 'Reenviar' : 'Enviar'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
                  <CardDescription>Últimas 200 mensagens enviadas ou com erro</CardDescription>
                </div>
                <Input
                  placeholder="Buscar aluno, telefone..."
                  value={searchLog}
                  onChange={e => setSearchLog(e.target.value)}
                  className="w-56 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <History size={40} className="opacity-30"/>
                  <p>Nenhum envio registrado ainda</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Aluno</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Template</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Enviado em</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Tipo</th>
                        <th className="px-4 py-3"/>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setLogDetail(log)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                {log.aluno_nome[0]}
                              </div>
                              <div>
                                <p className="font-medium leading-none">{log.aluno_nome}</p>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{log.telefone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{log.template_nome ?? '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={log.status}/></td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(log.enviado_em ?? log.created_at)}</td>
                          <td className="px-4 py-3">
                            {log.manual
                              ? <Badge variant="outline" className="text-xs">Manual</Badge>
                              : <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Auto</Badge>
                            }
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {log.status === 'erro' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs h-7"
                                disabled={enviandoIds.has(log.id)}
                                onClick={() => reenviarLog(log)}
                              >
                                <RefreshCw size={11}/> Reenviar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                                    {tpl.dias_offset > 0 ? `+${tpl.dias_offset}d` : `${tpl.dias_offset}d`}
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
                    O tique automático (via cron externo) espera um intervalo aleatório entre esse mínimo e máximo antes de cada envio, e se desliga sozinho se passar do limite de erros seguidos. Delays de minutos só funcionam de verdade nesse modo — o botão "Disparar agora" processa a fila num único disparo, com um respiro curto entre cada envio (não consegue esperar minutos parado no meio da requisição).
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
                  <Zap size={16}/>Ativação via Cron (cron-job.org)
                </CardTitle>
                <CardDescription>
                  Configure um cron externo pra chamar a cada poucos minutos — os lembretes ficam espalhados ao longo da janela de horário, com anti-ban de verdade (não é mais um disparo único em rajada).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border w-fit ${
                  cobrancaCfg?.ativo
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {cobrancaCfg?.ativo
                    ? <><CheckCircle2 size={14}/> Automação ativa — processa a fila a cada chamada do cron</>
                    : <><Clock size={14}/> Aguardando ativação — ative o toggle "Automação ativa" acima</>}
                </div>

                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground font-medium">Configure no cron-job.org:</p>
                  {[
                    { label: 'URL', value: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enviar-cobranca` },
                    { label: 'Method', value: 'POST' },
                    { label: 'Body', value: '{"tick": true}' },
                    { label: 'Header 1', value: 'Content-Type: application/json' },
                    { label: 'Header 2', value: 'x-cron-key: enviar-cobranca-internal-2026' },
                    { label: 'Cron', value: '*/3 * * * *' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2 bg-muted/40 rounded px-3 py-1.5 font-mono">
                      <span className="text-muted-foreground w-16 flex-shrink-0">{label}</span>
                      <span className="flex-1 truncate text-foreground">{value}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(value); toast.success('Copiado!'); }}
                        className="p-1 hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                      >
                        <Copy size={12} className="text-primary"/>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sem esse header o cron recebe erro 401 (a função exige autenticação, exceto pra chamadas de cron). Se houver uma variável <code className="bg-muted px-1 rounded">CRON_SECRET</code> configurada nas Edge Functions, use o valor dela em vez do texto padrão acima.
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5"
                    onClick={() => setTab('fila')}
                  >
                    <Info size={13}/> Ver fila atual ({fila.length})
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setBulkConfirmOpen(true)}
                    disabled={fila.length === 0}
                  >
                    <Play size={13}/> Enviar agora
                  </Button>
                  <a
                    href="https://cron-job.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto"
                  >
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                      <ExternalLink size={12}/> cron-job.org
                    </Button>
                  </a>
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
      </Tabs>

      {/* ─── Modal: Confirmar disparo em lote ────────────────────────────── */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play size={16}/> Confirmar disparo em lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
                <p className="text-2xl font-bold text-blue-700">{fila.length}</p>
                <p className="text-xs text-blue-600">total na fila</p>
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
                  <span>1 envio a cada <strong className="text-foreground">{schedule.intervalMin} min</strong></span>
                </div>
                <div className="text-xs text-muted-foreground pt-1">
                  {fila.length > 0 && `Primeiro: ${schedule.slots[0]} • Último: ${schedule.slots[schedule.slots.length - 1]}`}
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Os envios serão realizados sequencialmente. Apenas cobranças do mês atual e inadimplentes de meses anteriores serão incluídos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={dispararBulk} className="gap-1.5">
              <Play size={14}/> Disparar {fila.length} envios
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
                  <p className="text-xs text-muted-foreground">Parcela {sendModal.parcela}</p>
                  <p className="font-bold text-sm">R$ {fmt(sendModal.valor)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Template</label>
                <Select value={sendTemplate} onValueChange={tid => {
                  setSendTemplate(tid);
                  const tpl = templates.find(t => t.id === tid);
                  if (tpl) {
                    const venc = new Date(sendModal.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
                    const vars: Record<string, string | number | null> = {
                      nome: sendModal.aluno_nome, valor: fmt(sendModal.valor),
                      parcela: sendModal.parcela, vencimento: venc,
                      dias_atraso: sendModal.dias_offset > 0 ? sendModal.dias_offset : null,
                      link_pagamento: sendModal.link_pagamento || null,
                    };
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
              disabled={!sendMensagem.trim() || enviandoIds.has(sendModal?.pagamento_id ?? '')}
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
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Offset de dias ({templateModal.tipo === 'pre_vencimento' ? 'negativo = antes' : 'positivo = depois'})
                </label>
                <Input
                  type="number"
                  value={templateModal.dias_offset ?? 0}
                  onChange={e => setTemplateModal(p => p ? { ...p, dias_offset: Number(e.target.value) } : p)}
                  className="w-28"
                />
              </div>
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
function renderMensagem(template: string, vars: Record<string, string | number | null>): string {
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
