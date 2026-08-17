import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessFinanceiroTurma } from '@/lib/access-control';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { AlunoObservacoes } from './finance/AlunoObservacoes';
import { AlunoGruposBonus } from './finance/AlunoGruposBonus';
import { PrevisaoPagamentoPopover } from './finance/PrevisaoPagamentoPopover';
import {
  Plus, DollarSign, Users, AlertCircle, Eye, Trash2,
  TrendingUp, Target, Phone, Pencil, Building2, CheckCircle2,
  Copy, Download, ExternalLink, Upload, FileText,
  Send, MessageSquare, Shield, ChevronDown, ChevronRight,
  Play, Square, CheckCircle, XCircle, Clock, RefreshCw, History, UserPlus,
} from 'lucide-react';
import { format, isSameMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isPagamentoInadimplente, calcTaxaTransacao, taxaDoPagamento, type TaxaDetalhe } from '@/lib/financial-utils';
import {
  type PaymentMethod,
  todayDateInput,
  normalizePaymentMethod,
  paymentMethodTotal,
  extractDueDay,
  buildInstallments,
  sincronizarParcelasAluno,
  assignTurmaEAtualizarParcelas,
} from '@/lib/parcelasAluno';

interface Turma {
  id: string;
  nome: string;
  produto?: string;
  tipo?: string;
  data_inicio?: string;
  data_fim?: string;
  valor_mensalidade?: number;
  total_mensalidades?: number;
  responsavel_id?: string;
  created_at: string;
}

interface Responsavel {
  id: string;
  nome: string;
  created_at: string;
}

interface CobrancaLogAluno {
  id: string;
  pagamento_id?: string | null;
  mensagem: string;
  template_nome: string;
  template_tipo?: string | null;
  status: string;
  erro_msg?: string | null;
  enviado_em?: string | null;
  manual?: boolean;
  created_at: string;
  respondeu_em?: string | null;
  ultima_resposta?: string | null;
}

interface IndicadoLead {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  status: string | null;
  criado_em: string;
}

interface Lancamento {
  id: string;
  nome: string;
  status?: string;
  data_live?: string;
  ativo?: boolean;
}

interface Aluno {
  id: string;
  turma_id: string;
  produto: string;
  nome: string;
  whatsapp?: string;
  email?: string;
  cpf?: string;
  rg?: string;
  sexo?: string;
  data_nascimento?: string;
  endereco?: string;
  cep?: string;
  cidade_estado?: string;
  pais?: string;
  dia_vencimento?: number;
  dia_vencimento_contrato?: string;
  status: 'ativo' | 'inadimplente' | 'cancelado' | 'concluido' | 'pre_matricula';
  tipo_pagamento?: 'mensalidade' | 'bolsa' | 'cortesia';
  mensalidades_pagas?: number;
  total_mensalidades?: number;
  data_inicio?: string;
  data_fim?: string;
  data_matricula?: string;
  origem_lead?: string;
  valor_mensalidade?: number;
  forma_pagamento?: string;
  observacoes?: string;
  grupo_turma_confirmado_em?: string | null;
  forms_respondido?: boolean;
  forms_respondido_em?: string;
  contrato_enviado?: boolean;
  contrato_enviado_em?: string;
  contrato_assinado?: boolean;
  contrato_assinado_em?: string;
  autentique_documento_id?: string;
  autentique_link_assinatura?: string;
  contrato_baixado?: boolean;
  contrato_arquivo_url?: string;
  contrato_arquivo_nome?: string;
  asaas_integrado?: boolean;
  asaas_link?: string;
  voomp_integrado?: boolean;
  voomp_link?: string;
  contrato_token?: string;
  token_acesso?: string;
  link_grupo_whatsapp?: string;
  lancamento_id?: string;
  created_at: string;
}

interface Pagamento {
  id: string;
  aluno_id: string;
  turma_id: string;
  produto: string;
  valor: number;
  mes_referencia: string;
  data_vencimento: string;
  data_pagamento?: string;
  numero_parcela: number;
  status: 'pago' | 'pendente' | 'atrasado' | 'isento';
  canal_cobranca?: string | null;
  taxa_valor?: number | null;
  data_prevista_pagamento?: string | null;
  created_at: string;
}

interface ParcelaLocal {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  data_pagamento?: string | null;
  status: 'pago' | 'pendente' | 'atrasado' | 'isento';
  isNew?: boolean;
  deleted?: boolean;
}

type ProdutoTab = 'psicanalise' | 'numerologia';
type SubView = 'alunos' | 'turmas' | 'responsaveis';
type PaymentFilter = 'todos' | PaymentMethod;
type DueFilter = 'todos' | 'vencidos' | 'hoje' | 'proximos_7' | 'proximos_30' | 'quitados';
type DueDayFilter = 'todos' | `dia_${number}`;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const safeDate = (s?: string) => {
  if (!s) return '';
  try { return format(parseISO(s), 'dd/MM/yyyy', { locale: ptBR }); } catch { return s; }
};

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  return value.split('T')[0];
};

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDateOnly = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const readDueDay = (value?: string | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

const extractDateDay = (value?: string | null) => {
  const date = parseDateOnly(value);
  return date ? date.getDate() : null;
};

const getAlunoDueDay = (
  aluno: Pick<Aluno, 'dia_vencimento' | 'dia_vencimento_contrato'>,
  parcelas: Pick<Pagamento, 'data_vencimento' | 'numero_parcela'>[] = [],
) => {
  const alunoDay = readDueDay(aluno.dia_vencimento);
  if (alunoDay) return alunoDay;

  const contratoDay = readDueDay(aluno.dia_vencimento_contrato);
  if (contratoDay) return contratoDay;

  const parcelaBase = parcelas.find(p => p.numero_parcela > 1 && p.data_vencimento) || parcelas.find(p => p.data_vencimento);
  return extractDateDay(parcelaBase?.data_vencimento) || 10;
};

const statusColors: Record<string, string> = {
  ativo: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  inadimplente: 'bg-red-50 text-red-700 border border-red-200',
  cancelado: 'bg-zinc-200 text-zinc-600 border border-zinc-300',
  concluido: 'bg-sky-50 text-sky-700 border border-sky-200',
  pre_matricula: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const statusLabels: Record<string, string> = {
  ativo: 'ativo',
  inadimplente: 'inadimplente',
  cancelado: 'cancelado',
  concluido: 'concluido',
  pre_matricula: 'pré-matrícula',
};

// Aluno cuja "Ato de matricula / 1a parcela" ainda nao chegou fica automaticamente
// em pré-matrícula (amarrado ao contrato assinado); quando a data chega, volta sozinho
// para o status anterior (ou 'ativo'). Estados finais (cancelado/concluido) nunca sao sobrepostos.
const isFutureDate = (value?: string | null) => {
  const d = parseDateOnly(value);
  const today = parseDateOnly(todayDateInput());
  return !!(d && today && d > today);
};

const deriveAlunoStatus = (dataMatricula: string | null | undefined, previousStatus?: Aluno['status']): Aluno['status'] => {
  if (previousStatus === 'cancelado' || previousStatus === 'concluido') return previousStatus;
  if (isFutureDate(dataMatricula)) return 'pre_matricula';
  if (previousStatus === 'pre_matricula') return 'ativo';
  return previousStatus || 'ativo';
};

// Recalcula o status de cada aluno com base na data de matricula ao carregar a lista,
// e persiste em segundo plano qualquer transicao (ex: pre_matricula -> ativo assim que a data chega).
const applyAutoStatus = <T extends Pick<Aluno, 'id' | 'status' | 'data_matricula'>>(rows: T[]): T[] => {
  const toFix: { id: string; status: Aluno['status'] }[] = [];
  const corrected = rows.map(row => {
    const nextStatus = deriveAlunoStatus(row.data_matricula, row.status);
    if (nextStatus !== row.status) toFix.push({ id: row.id, status: nextStatus });
    return nextStatus !== row.status ? { ...row, status: nextStatus } : row;
  });
  if (toFix.length) {
    Promise.all(toFix.map(f => supabase.from('alunos').update({ status: f.status }).eq('id', f.id))).catch(() => {});
  }
  return corrected;
};

const paymentLabels: Record<PaymentMethod, string> = {
  boleto: 'Boleto',
  cartao: 'Cartao',
  avista: 'A vista',
};

const getEmptyAlunoForm = () => ({
  nome: '',
  whatsapp: '',
  email: '',
  cpf: '',
  data_nascimento: '',
  pais: 'Brasil',
  endereco: '',
  cep: '',
  cidade_estado: '',
  turma_id: '',
  data_inicio: '',
  data_fim: '',
  data_matricula: todayDateInput(),
  dia_vencimento: '10',
  origem: 'direto',
  lancamento_id: '',
  tipo_pagamento: 'mensalidade' as 'mensalidade' | 'bolsa' | 'cortesia',
  forma_pagamento: 'boleto' as PaymentMethod,
  valor_mensalidade: '',
  total_parcelas: '',
  observacoes: '',
});

// ── TurmaDisparoModal ─────────────────────────────────────────────────────────

interface DisparoConfig {
  template: string;
  link_grupo: string;
  link_aula_1: string;
  link_aula_2: string;
  link_aula_3: string;
  delay_min_s: number;
  delay_max_s: number;
  typing_delay_s: number;
  instance_name: string | null;
}

interface SendResult {
  alunoId: string;
  nome: string;
  numero: string;
  status: 'pending' | 'sending' | 'sent' | 'error' | 'skipped';
  error?: string;
}

const DEFAULT_TEMPLATE = `Olá {{nome}}! 👋

Seja muito bem-vindo(a) à nossa turma! 🎉

Aqui estão os links importantes para você:

📱 *Grupo WhatsApp:* {{link_grupo}}

📚 *Links das aulas:*
▶️ Aula 1: {{link_aula_1}}
▶️ Aula 2: {{link_aula_2}}
▶️ Aula 3: {{link_aula_3}}

Qualquer dúvida, é só chamar. Estamos juntos! 💪`;

const DISPARO_VARS = ['nome', 'link_grupo', 'link_aula_1', 'link_aula_2', 'link_aula_3'];

function applyDisparoVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function TurmaDisparoModal({
  open, onClose, turma, alunos: todosAlunos,
}: {
  open: boolean;
  onClose: () => void;
  turma: { id: string; nome: string };
  alunos: Array<{ id: string; nome: string; whatsapp?: string; status: string }>;
}) {
  const alunosComWpp = todosAlunos.filter(a => a.whatsapp?.trim() && a.status !== 'cancelado');

  const [tab,        setTab]        = useState<'mensagem' | 'antiban' | 'alunos'>('mensagem');
  const [cfg,        setCfg]        = useState<DisparoConfig>({
    template:       DEFAULT_TEMPLATE,
    link_grupo:     '',
    link_aula_1:    '',
    link_aula_2:    '',
    link_aula_3:    '',
    delay_min_s:    8,
    delay_max_s:    20,
    typing_delay_s: 3,
    instance_name:  null,
  });
  const [instances,  setInstances]  = useState<string[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set(alunosComWpp.map(a => a.id)));
  const [results,    setResults]    = useState<SendResult[]>([]);
  const [running,    setRunning]    = useState(false);
  const [stopped,    setStopped]    = useState(false);
  const [cfgLoaded,  setCfgLoaded]  = useState(false);
  const stopRef = { current: false };

  // Carrega config salva + instâncias ao abrir
  useEffect(() => {
    if (!open) return;
    setResults([]);
    setRunning(false);
    setStopped(false);
    setSelected(new Set(alunosComWpp.map(a => a.id)));

    Promise.all([
      supabase.from('turma_disparo_config').select('*').eq('turma_id', turma.id).maybeSingle(),
      supabase.from('evolution_config').select('instance_name').eq('ativo', true).order('prioridade', { ascending: true }),
    ]).then(([{ data: saved }, { data: evo }]) => {
      if (saved) {
        setCfg({
          template:       saved.template       || DEFAULT_TEMPLATE,
          link_grupo:     saved.link_grupo      || '',
          link_aula_1:    saved.link_aula_1     || '',
          link_aula_2:    saved.link_aula_2     || '',
          link_aula_3:    saved.link_aula_3     || '',
          delay_min_s:    saved.delay_min_s     ?? 8,
          delay_max_s:    saved.delay_max_s     ?? 20,
          typing_delay_s: saved.typing_delay_s  ?? 3,
          instance_name:  saved.instance_name   ?? null,
        });
      }
      setInstances((evo || []).map((r: { instance_name: string }) => r.instance_name));
      setCfgLoaded(true);
    });
  }, [open, turma.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCfg() {
    await supabase.from('turma_disparo_config').upsert(
      { turma_id: turma.id, ...cfg },
      { onConflict: 'turma_id' },
    );
  }

  function buildMensagem(nome: string) {
    return applyDisparoVars(cfg.template, {
      nome,
      link_grupo:  cfg.link_grupo,
      link_aula_1: cfg.link_aula_1,
      link_aula_2: cfg.link_aula_2,
      link_aula_3: cfg.link_aula_3,
    });
  }

  function randomDelay() {
    const min = Math.max(1, cfg.delay_min_s) * 1000;
    const max = Math.max(min + 1000, cfg.delay_max_s * 1000);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function startDisparo() {
    await saveCfg();
    const toSend = alunosComWpp.filter(a => selected.has(a.id));
    if (!toSend.length) { return; }

    stopRef.current = false;
    setStopped(false);
    setRunning(true);
    setTab('alunos');

    const initial: SendResult[] = toSend.map(a => ({
      alunoId: a.id,
      nome: a.nome,
      numero: a.whatsapp!.trim(),
      status: 'pending',
    }));
    setResults(initial);

    for (let i = 0; i < toSend.length; i++) {
      if (stopRef.current) {
        setStopped(true);
        break;
      }

      const aluno = toSend[i];
      setResults(prev => prev.map(r => r.alunoId === aluno.id ? { ...r, status: 'sending' } : r));

      try {
        const mensagem = buildMensagem(aluno.nome);
        const { data, error } = await supabase.functions.invoke('wpp-enviar', {
          body: {
            numero:          aluno.whatsapp!.trim(),
            mensagem,
            instance_name:   cfg.instance_name ?? undefined,
            typing_delay_ms: cfg.typing_delay_s * 1000,
          },
        });
        const err = error?.message ?? (data as any)?.error;
        if (err) throw new Error(err);
        setResults(prev => prev.map(r => r.alunoId === aluno.id ? { ...r, status: 'sent' } : r));
      } catch (e: unknown) {
        setResults(prev => prev.map(r =>
          r.alunoId === aluno.id ? { ...r, status: 'error', error: (e as Error).message } : r));
      }

      // Delay aleatório anti-ban (exceto após o último)
      if (i < toSend.length - 1 && !stopRef.current) {
        const delay = randomDelay();
        const countdownEnd = Date.now() + delay;
        // Countdown no item "next"
        const nextAluno = toSend[i + 1];
        const tick = setInterval(() => {
          const rem = Math.ceil((countdownEnd - Date.now()) / 1000);
          if (rem <= 0 || stopRef.current) { clearInterval(tick); return; }
          setResults(prev => prev.map(r =>
            r.alunoId === nextAluno.id ? { ...r, status: 'pending', error: `Aguardando ${rem}s…` } : r));
        }, 500);
        await new Promise(r => setTimeout(r, delay));
        clearInterval(tick);
        setResults(prev => prev.map(r =>
          r.alunoId === nextAluno.id ? { ...r, error: undefined } : r));
      }
    }

    setRunning(false);
  }

  function stopDisparo() { stopRef.current = true; }

  const selectedList = alunosComWpp.filter(a => selected.has(a.id));
  const sent  = results.filter(r => r.status === 'sent').length;
  const errs  = results.filter(r => r.status === 'error').length;
  const total = results.length;

  const templateRef = { current: null as HTMLTextAreaElement | null };

  function insertVar(v: string) {
    const tag = `{{${v}}}`;
    const el = templateRef.current;
    if (el) {
      const s = el.selectionStart ?? cfg.template.length;
      const e = el.selectionEnd   ?? s;
      const next = cfg.template.slice(0, s) + tag + cfg.template.slice(e);
      setCfg(c => ({ ...c, template: next }));
      setTimeout(() => { el.selectionStart = el.selectionEnd = s + tag.length; el.focus(); }, 0);
    } else {
      setCfg(c => ({ ...c, template: c.template + tag }));
    }
  }

  if (!cfgLoaded && open) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !running) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Disparar mensagem — {turma.nome}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 flex-shrink-0 border-b border-border pb-2">
          {(['mensagem', 'antiban', 'alunos'] as const).map(t => (
            <button
              key={t} type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t === 'mensagem' ? '✏️ Mensagem'
               : t === 'antiban' ? '🛡️ Anti-ban'
               : `👥 Alunos (${selectedList.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── MENSAGEM ─────────────────────────────────────────── */}
          {tab === 'mensagem' && (
            <div className="space-y-4 py-2">
              {/* Variáveis */}
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground flex items-center mr-1">Inserir:</span>
                {DISPARO_VARS.map(v => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>

              {/* Template */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Template da mensagem</label>
                <textarea
                  ref={el => { templateRef.current = el; }}
                  value={cfg.template}
                  onChange={e => setCfg(c => ({ ...c, template: e.target.value }))}
                  rows={10}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Digite sua mensagem..."
                  disabled={running}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{cfg.template.length} chars</p>
              </div>

              {/* Links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valores das variáveis</p>
                {[
                  { key: 'link_grupo',  label: '📱 Link do grupo WhatsApp' },
                  { key: 'link_aula_1', label: '▶️ Link Aula 1' },
                  { key: 'link_aula_2', label: '▶️ Link Aula 2' },
                  { key: 'link_aula_3', label: '▶️ Link Aula 3' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-40 flex-shrink-0">{label}</label>
                    <input
                      type="text"
                      value={(cfg as any)[key]}
                      onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                      placeholder="https://..."
                      disabled={running}
                      className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                ))}
              </div>

              {/* Preview */}
              {alunosComWpp[0] && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Pré-visualização (como {alunosComWpp[0].nome})
                  </p>
                  <div className="bg-[#e5ddd5] rounded-lg p-3">
                    <div className="bg-white rounded-lg p-3 max-w-xs shadow-sm ml-auto">
                      <p className="text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">
                        {buildMensagem(alunosComWpp[0].nome)}
                      </p>
                      <p className="text-[10px] text-gray-400 text-right mt-1">agora ✓✓</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ANTI-BAN ─────────────────────────────────────────── */}
          {tab === 'antiban' && (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Como funciona o anti-ban
                </p>
                <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                  <li>Delay aleatório entre mensagens simula comportamento humano</li>
                  <li>Indicador "digitando..." antes de cada mensagem</li>
                  <li>Evolution API adiciona delay interno de 1.2s no envio</li>
                  <li>Recomendado: max 50 por sessão, depois pause 30 min</li>
                </ul>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Delay entre mensagens</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Mínimo (segundos)</label>
                      <input
                        type="number" min="3" max="60"
                        value={cfg.delay_min_s}
                        onChange={e => setCfg(c => ({ ...c, delay_min_s: parseInt(e.target.value) || 8 }))}
                        disabled={running}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Máximo (segundos)</label>
                      <input
                        type="number" min="5" max="120"
                        value={cfg.delay_max_s}
                        onChange={e => setCfg(c => ({ ...c, delay_max_s: parseInt(e.target.value) || 20 }))}
                        disabled={running}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Cada mensagem aguardará entre {cfg.delay_min_s}s e {cfg.delay_max_s}s antes de enviar a próxima.
                    Estimativa: ~{Math.round(selectedList.length * (cfg.delay_min_s + cfg.delay_max_s) / 2 / 60)} min para {selectedList.length} alunos.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Indicador de digitação</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="number" min="0" max="10"
                      value={cfg.typing_delay_s}
                      onChange={e => setCfg(c => ({ ...c, typing_delay_s: parseInt(e.target.value) || 0 }))}
                      disabled={running}
                      className="w-24 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">segundos de "digitando…" antes de enviar (0 = desativado)</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Instância WhatsApp</label>
                  <select
                    value={cfg.instance_name ?? '__auto__'}
                    onChange={e => setCfg(c => ({ ...c, instance_name: e.target.value === '__auto__' ? null : e.target.value }))}
                    disabled={running}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="__auto__">Auto-prioridade (recomendado)</option>
                    {instances.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── ALUNOS ───────────────────────────────────────────── */}
          {tab === 'alunos' && (
            <div className="space-y-3 py-2">
              {/* Progress (se running) */}
              {results.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{sent + errs}/{total} processados · {sent} enviados · {errs} erros</span>
                    {running && <span className="text-primary animate-pulse">Disparando…</span>}
                    {stopped && <span className="text-amber-600">Parado pelo usuário</span>}
                    {!running && !stopped && results.length > 0 && <span className="text-emerald-600">Concluído</span>}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${total > 0 ? ((sent + errs) / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Lista */}
              {results.length === 0 ? (
                <>
                  {alunosComWpp.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno desta turma tem WhatsApp cadastrado.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="select-all"
                          checked={selected.size === alunosComWpp.length}
                          onChange={e => setSelected(e.target.checked ? new Set(alunosComWpp.map(a => a.id)) : new Set())}
                          className="w-4 h-4"
                        />
                        <label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer">
                          Selecionar todos ({alunosComWpp.length} com WhatsApp)
                        </label>
                      </div>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {alunosComWpp.map(a => (
                          <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected.has(a.id)}
                              onChange={e => {
                                const s = new Set(selected);
                                e.target.checked ? s.add(a.id) : s.delete(a.id);
                                setSelected(s);
                              }}
                              className="w-4 h-4 flex-shrink-0"
                            />
                            <span className="text-sm font-medium flex-1 truncate">{a.nome}</span>
                            <span className="text-xs text-muted-foreground font-mono">{a.whatsapp}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {results.map(r => (
                    <div key={r.alunoId} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                      r.status === 'sent'    ? 'bg-emerald-50' :
                      r.status === 'error'   ? 'bg-red-50' :
                      r.status === 'sending' ? 'bg-blue-50' : 'bg-muted/30'
                    }`}>
                      <div className="flex-shrink-0">
                        {r.status === 'sent'    && <CheckCircle  className="h-3.5 w-3.5 text-emerald-600" />}
                        {r.status === 'error'   && <XCircle      className="h-3.5 w-3.5 text-red-500" />}
                        {r.status === 'sending' && <RefreshCw    className="h-3.5 w-3.5 text-blue-600 animate-spin" />}
                        {r.status === 'pending' && <Clock        className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <span className="font-medium flex-1 truncate">{r.nome}</span>
                      <span className="text-muted-foreground font-mono">{r.numero}</span>
                      {r.error && (
                        <span className={`max-w-[140px] truncate ${r.status === 'error' ? 'text-red-500' : 'text-muted-foreground italic'}`}
                          title={r.error}>
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {results.length === 0
              ? `${selectedList.length} aluno${selectedList.length !== 1 ? 's' : ''} selecionado${selectedList.length !== 1 ? 's' : ''} com WhatsApp`
              : `${sent} enviados · ${errs} erros · ${total - sent - errs} pendentes`}
          </span>
          <div className="flex gap-2">
            {!running && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                {results.length > 0 ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {running ? (
              <button
                type="button"
                onClick={stopDisparo}
                className="flex items-center gap-2 px-4 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <Square className="h-3.5 w-3.5" /> Parar disparo
              </button>
            ) : (
              <button
                type="button"
                onClick={startDisparo}
                disabled={selectedList.length === 0 || running}
                className="flex items-center gap-2 px-4 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-3.5 w-3.5" />
                {results.length > 0 ? 'Reenviar' : 'Iniciar disparo'}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Financeiro({ initialAlunoId }: { initialAlunoId?: string } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';
  const permissions = user?.permissions ?? null;
  const [activeTab, setActiveTab] = useState<ProdutoTab>('psicanalise');
  const [subView, setSubView] = useState<SubView>('alunos');
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [obsPendentesPorAluno, setObsPendentesPorAluno] = useState<Record<string, string>>({});
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('this_month');

  // Modais
  const [showTurmaDialog, setShowTurmaDialog] = useState(false);
  const [showAlunoDialog, setShowAlunoDialog] = useState(false);
  const [showAlunoDetail, setShowAlunoDetail] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditTurma, setShowEditTurma] = useState(false);
  const [alunoDetail, setAlunoDetail] = useState<Aluno | null>(null);
  const [alunoToDelete, setAlunoToDelete] = useState<Aluno | null>(null);
  const [cobrancaLogsAluno, setCobrancaLogsAluno] = useState<CobrancaLogAluno[]>([]);
  const [latestObsTexto, setLatestObsTexto] = useState('');
  const [loadingCobrancaLogsAluno, setLoadingCobrancaLogsAluno] = useState(false);
  const [indicadosAluno, setIndicadosAluno] = useState<IndicadoLead[]>([]);
  const [loadingIndicadosAluno, setLoadingIndicadosAluno] = useState(false);
  const [canaisCobranca, setCanaisCobranca] = useState<{ id: string; nome: string }[]>([]);
  const [taxasRates, setTaxasRates] = useState<TaxaDetalhe[]>([]);
  const [turmaToEdit, setTurmaToEdit] = useState<Turma | null>(null);

  // Inline edit turma card
  const [editingTurmaCardId, setEditingTurmaCardId] = useState<string | null>(null);
  const [inlineTurmaForm, setInlineTurmaForm] = useState<Partial<Turma>>({});
  const [savingInlineTurma, setSavingInlineTurma] = useState(false);
  const [disparoTurma, setDisparoTurma] = useState<{ id: string; nome: string } | null>(null);

  // Formularios
  const emptyTurmaForm = { nome: '', produto: 'psicanalise' as ProdutoTab, data_inicio: '', data_fim: '', valor_mensalidade: '109.90', total_mensalidades: '15' };
  const emptyAlunoForm = getEmptyAlunoForm();

  const [newTurmaForm, setNewTurmaForm] = useState(emptyTurmaForm);
  const [newAlunoForm, setNewAlunoForm] = useState(emptyAlunoForm);
  const [editAlunoForm, setEditAlunoForm] = useState<Partial<Aluno> & { turma_id_new?: string }>({});
  const [editTurmaForm, setEditTurmaForm] = useState<Partial<Turma>>({});
  const [savingAluno, setSavingAluno] = useState(false);
  const [uploadingContrato, setUploadingContrato] = useState(false);
  const [savingTurma, setSavingTurma] = useState(false);
  const [showPagoDialog, setShowPagoDialog] = useState(false);
  const [pagoInfo, setPagoInfo] = useState<{ pagamentoId: string; alunoId: string; data: string; canal_cobranca: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inadimplente' | 'cancelado' | 'pre_matricula'>('todos');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('todos');
  const [dueDayFilter, setDueDayFilter] = useState<DueDayFilter>('todos');
  const [dueFilter, setDueFilter] = useState<DueFilter>('todos');
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false);
  const [searchAluno, setSearchAluno] = useState('');
  const searchAlunoRef = useRef<HTMLInputElement>(null);
  const [assigningTurma, setAssigningTurma] = useState<Record<string, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkMarking, setBulkMarking] = useState(false);
  const [duplicataWarning, setDuplicataWarning] = useState<Aluno | null>(null);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [newResponsavelNome, setNewResponsavelNome] = useState('');
  const [savingResponsavel, setSavingResponsavel] = useState(false);

  // Card expandido nos KPIs do financeiro
  const [expandedCard, setExpandedCard] = useState<'recebido' | 'previsto' | 'aReceber' | 'inadimplentes' | 'ativos' | null>(null);

  // Edição manual de parcelas
  const [parcelasEditMode, setParcelasEditMode] = useState(false);
  const [parcelasLocais, setParcelasLocais] = useState<ParcelaLocal[]>([]);
  const [savingParcelas, setSavingParcelas] = useState(false);

  useEffect(() => { loadData(); }, []);

  const deepLinkAbertoRef = useRef(false);
  useEffect(() => {
    if (!initialAlunoId || loading || deepLinkAbertoRef.current) return;
    const aluno = alunos.find(a => a.id === initialAlunoId);
    if (aluno) {
      deepLinkAbertoRef.current = true;
      openAlunoDetail(aluno);
    }
  }, [initialAlunoId, loading, alunos]);

  const ALUNOS_SELECT_FULL = 'id, turma_id, produto, nome, whatsapp, email, cpf, rg, sexo, data_nascimento, endereco, cep, cidade_estado, pais, dia_vencimento, dia_vencimento_contrato, status, tipo_pagamento, mensalidades_pagas, total_mensalidades, data_inicio, data_fim, data_matricula, origem_lead, lancamento_id, valor_mensalidade, forma_pagamento, observacoes, grupo_turma_confirmado_em, forms_respondido, forms_respondido_em, contrato_enviado, contrato_enviado_em, contrato_assinado, contrato_assinado_em, autentique_documento_id, autentique_link_assinatura, contrato_baixado, contrato_arquivo_url, contrato_arquivo_nome, asaas_integrado, asaas_link, voomp_integrado, voomp_link, contrato_token, token_acesso, link_grupo_whatsapp, created_at';
  const ALUNOS_SELECT_BASE = 'id, turma_id, produto, nome, whatsapp, email, cpf, rg, sexo, data_nascimento, endereco, cep, cidade_estado, pais, dia_vencimento, dia_vencimento_contrato, status, tipo_pagamento, mensalidades_pagas, total_mensalidades, data_inicio, data_fim, data_matricula, origem_lead, valor_mensalidade, forma_pagamento, observacoes, grupo_turma_confirmado_em, forms_respondido, forms_respondido_em, contrato_enviado, contrato_enviado_em, contrato_assinado, contrato_assinado_em, autentique_documento_id, autentique_link_assinatura, created_at';

  const loadData = async () => {
    setLoading(true);
    try {
      const [turmasRes, alunosRes] = await Promise.all([
        supabase.from('turmas').select('id, nome, produto, tipo, data_inicio, data_fim, valor_mensalidade, total_mensalidades, responsavel_id, created_at').order('created_at', { ascending: false }),
        supabase.from('alunos').select(ALUNOS_SELECT_FULL).order('created_at', { ascending: false }),
      ]);
      if (turmasRes.data) setTurmas(turmasRes.data);
      if (alunosRes.data) {
        setAlunos(applyAutoStatus(alunosRes.data));
      } else if (alunosRes.error) {
        // Fallback: novas colunas ainda nao existem (migration pendente)
        const { data: fallback } = await supabase.from('alunos').select(ALUNOS_SELECT_BASE).order('created_at', { ascending: false });
        if (fallback) setAlunos(applyAutoStatus(fallback));
      }
      // Busca todos os pagamentos em lotes de 1000 para contornar limite do servidor
      const PAGE = 1000;
      const allPags: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from('pagamentos')
          .select('id, aluno_id, turma_id, produto, valor, mes_referencia, data_vencimento, data_pagamento, numero_parcela, status, canal_cobranca, taxa_valor, data_prevista_pagamento, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + PAGE - 1);
        if (!data?.length) break;
        allPags.push(...data);
        if (data.length < PAGE) break;
      }
      setPagamentos(allPags);
      // Responsaveis e opcional (tabela pode nao existir ainda)
      const respRes = await supabase.from('responsaveis').select('id, nome, created_at').order('nome');
      if (respRes.data) setResponsaveis(respRes.data);
      const lancRes = await supabase.from('lancamentos').select('id, nome, status, data_live, ativo').order('created_at', { ascending: false });
      if (lancRes.data) setLancamentos(lancRes.data);
      const { data: obsPendentes } = await supabase
        .from('aluno_observacoes')
        .select('aluno_id, texto')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });
      if (obsPendentes) {
        const map: Record<string, string> = {};
        for (const o of obsPendentes) if (!map[o.aluno_id]) map[o.aluno_id] = o.texto;
        setObsPendentesPorAluno(map);
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  const filteredTurmas = useMemo(() => {
    return turmas.filter(t => {
      if ((t.tipo || t.produto) !== activeTab) return false;
      if (isAdmin) return true;
      if (!permissions) return false;
      return canAccessFinanceiroTurma(permissions, t.id);
    });
  }, [turmas, activeTab, permissions, isAdmin]);

  // Tabs visíveis conforme turmas acessíveis
  const visibleTabs = useMemo<ProdutoTab[]>(() => {
    if (isAdmin) return ['psicanalise', 'numerologia'];
    const tabs: ProdutoTab[] = (['psicanalise', 'numerologia'] as ProdutoTab[]).filter(tab =>
      turmas.some(t => (t.tipo || t.produto) === tab && permissions && canAccessFinanceiroTurma(permissions, t.id))
    );
    return tabs.length > 0 ? tabs : ['psicanalise'];
  }, [turmas, permissions, isAdmin]);

  const filteredPagamentos = useMemo(() => pagamentos.filter(p => p.produto === activeTab && p.status !== 'isento'), [pagamentos, activeTab]);
  const pagamentosPorAluno = useMemo(() => {
    const map: Record<string, Pagamento[]> = {};
    filteredPagamentos.forEach(p => {
      if (!map[p.aluno_id]) map[p.aluno_id] = [];
      map[p.aluno_id].push(p);
    });
    Object.values(map).forEach(lista => lista.sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0)));
    return map;
  }, [filteredPagamentos]);

  // Inadimplencia calculada a partir dos pagamentos reais (nao do campo manual).
  // Canônica (compartilhada com Dashboard/FinanceiroCFO/Cobranca): 'atrasado'
  // OU 'pendente' com vencimento já passado — sem restrição de forma de
  // pagamento (antes só contava boleto, ignorando cartão/PIX vencidos).
  const inadimplenciaMap = useMemo(() => {
    const map: Record<string, { diasAtraso: number; valorEmAtraso: number; parcelasAtrasadas: number }> = {};
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    filteredPagamentos.forEach(p => {
      const aluno = alunos.find(a => a.id === p.aluno_id);
      if (!aluno) return;
      if (aluno.status === 'cancelado' || aluno.status === 'concluido') return;
      if (aluno.tipo_pagamento === 'bolsa' || aluno.tipo_pagamento === 'cortesia') return;
      if (!isPagamentoInadimplente(p, hoje)) return;

      if (!map[p.aluno_id]) map[p.aluno_id] = { diasAtraso: 0, valorEmAtraso: 0, parcelasAtrasadas: 0 };
      const venc = p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00') : hoje;
      const dias = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));
      map[p.aluno_id].diasAtraso = Math.max(map[p.aluno_id].diasAtraso, dias);
      map[p.aluno_id].valorEmAtraso += p.valor;
      map[p.aluno_id].parcelasAtrasadas += 1;
    });
    return map;
  }, [filteredPagamentos, alunos]);

  // Base: produto + turma + permissões apenas — sem statusFilter/paymentFilter/dueFilter
  const alunosBase = useMemo(() => {
    let r = alunos.filter(a => {
      if (a.produto !== activeTab) return false;
      if (isAdmin) return true;
      if (!permissions) return false;
      return canAccessFinanceiroTurma(permissions, a.turma_id);
    });
    if (selectedTurmaId !== 'todas') r = r.filter(a => a.turma_id === selectedTurmaId);
    return r;
  }, [alunos, activeTab, selectedTurmaId, permissions, isAdmin]);

  const alunosNoEscopo = useMemo(() => {
    let r = [...alunosBase];
    if (statusFilter !== 'todos') {
      if (statusFilter === 'inadimplente') r = r.filter(a => inadimplenciaMap[a.id] || a.status === 'inadimplente');
      else r = r.filter(a => a.status === statusFilter);
    }
    return r;
  }, [alunosBase, statusFilter, inadimplenciaMap]);

  const paymentCounts = useMemo(() => {
    return alunosNoEscopo.reduce<Record<PaymentMethod, number>>((acc, aluno) => {
      acc[normalizePaymentMethod(aluno.forma_pagamento)] += 1;
      return acc;
    }, { boleto: 0, cartao: 0, avista: 0 });
  }, [alunosNoEscopo]);

  const dueDayOptions = useMemo(() => {
    const counts = new Map<number, number>();
    [10, 20, 30].forEach(day => counts.set(day, 0));

    alunosNoEscopo.forEach(aluno => {
      if (normalizePaymentMethod(aluno.forma_pagamento) !== 'boleto') return;
      const day = getAlunoDueDay(aluno, pagamentosPorAluno[aluno.id] || []);
      counts.set(day, (counts.get(day) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, count]) => ({ key: `dia_${day}` as DueDayFilter, day, count }));
  }, [alunosNoEscopo, pagamentosPorAluno]);

  const filteredAlunos = useMemo(() => {
    const today = parseDateOnly(todayDateInput())!;
    const matchesDueFilter = (aluno: Aluno) => {
      if (dueFilter === 'todos') return true;

      const method = normalizePaymentMethod(aluno.forma_pagamento);
      if (method !== 'boleto') return dueFilter === 'quitados';

      const parcelasAbertas = (pagamentosPorAluno[aluno.id] || [])
        .filter(p => p.status !== 'pago')
        .filter(p => p.data_vencimento)
        .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)));

      if (dueFilter === 'quitados') return parcelasAbertas.length === 0;
      if (parcelasAbertas.length === 0) return false;

      const vencimento = parseDateOnly(parcelasAbertas[0].data_vencimento);
      if (!vencimento) return false;
      const diffDays = Math.floor((vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (dueFilter === 'vencidos') return diffDays < 0;
      if (dueFilter === 'hoje') return diffDays === 0;
      if (dueFilter === 'proximos_7') return diffDays >= 0 && diffDays <= 7;
      if (dueFilter === 'proximos_30') return diffDays >= 0 && diffDays <= 30;
      return true;
    };

    let r = [...alunosNoEscopo];
    if (paymentFilter !== 'todos') {
      r = r.filter(a => normalizePaymentMethod(a.forma_pagamento) === paymentFilter);
    }
    if (dueDayFilter !== 'todos') {
      const selectedDay = Number(dueDayFilter.replace('dia_', ''));
      r = r.filter(a =>
        normalizePaymentMethod(a.forma_pagamento) === 'boleto' &&
        getAlunoDueDay(a, pagamentosPorAluno[a.id] || []) === selectedDay
      );
    }
    if (dueFilter !== 'todos') {
      r = r.filter(a => matchesDueFilter(a));
    }
    return r;
  }, [alunosNoEscopo, paymentFilter, dueDayFilter, dueFilter, pagamentosPorAluno]);

  const currentMonth = new Date();

  const periodoLabel: Record<string, string> = { this_month: 'Este mes', last_month: 'Mes passado', last_3m: 'Ultimos 3 meses', this_year: 'Este ano', all: 'Tudo' };

  const periodoFilter = (dateStr?: string | null) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      const now = new Date();
      if (periodo === 'this_month') return isSameMonth(d, now);
      if (periodo === 'last_month') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return isSameMonth(d, lm); }
      if (periodo === 'last_3m') { const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1); return d >= cutoff; }
      if (periodo === 'this_year') return d.getFullYear() === now.getFullYear();
      return true;
    } catch { return false; }
  };

  const pagamentosEmFoco = useMemo(() => {
    const alunosAtivos = new Set(alunos.filter(a => a.status !== 'cancelado').map(a => a.id));
    const base = filteredPagamentos.filter(p => alunosAtivos.has(p.aluno_id));
    if (selectedTurmaId === 'todas') return base;
    return base.filter(p => p.turma_id === selectedTurmaId);
  }, [filteredPagamentos, selectedTurmaId, alunos]);

  const receitaMes = useMemo(() => pagamentosEmFoco.filter(p => p.status === 'pago' && periodoFilter(p.data_pagamento)).reduce((s, p) => s + p.valor, 0), [pagamentosEmFoco, periodo]);
  const previstoMes = useMemo(() => pagamentosEmFoco.filter(p => periodoFilter(p.data_vencimento)).reduce((s, p) => s + p.valor, 0), [pagamentosEmFoco, periodo]);
  const ltvTotal = useMemo(() => pagamentosEmFoco.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0), [pagamentosEmFoco]);
  const ltvMedio = useMemo(() => {
    const ids = new Set(pagamentosEmFoco.filter(p => p.status === 'pago').map(p => p.aluno_id));
    return ids.size > 0 ? ltvTotal / ids.size : 0;
  }, [ltvTotal, pagamentosEmFoco]);
  const parcelasEmAberto = useMemo(() => pagamentosEmFoco.filter(p => p.status !== 'pago'), [pagamentosEmFoco]);
  const valorAReceber = useMemo(() => parcelasEmAberto.reduce((s, p) => s + p.valor, 0), [parcelasEmAberto]);

  const inadimplentes = useMemo(() => alunosBase.filter(a => inadimplenciaMap[a.id] || a.status === 'inadimplente'), [alunosBase, inadimplenciaMap]);
  const totalEmAtraso = useMemo(() => inadimplentes.reduce((s, a) => s + (inadimplenciaMap[a.id]?.valorEmAtraso || 0), 0), [inadimplentes, inadimplenciaMap]);
  const contratosPendentes = useMemo(() => filteredAlunos.filter(a => !a.contrato_assinado && (a.status === 'ativo' || a.status === 'pre_matricula')).length, [filteredAlunos]);
  const alunosSemTurma = useMemo(() => alunos.filter(a => a.produto === activeTab && !a.turma_id), [alunos, activeTab]);

  // Agrupar alunos por turma
  const alunosVisiveis = useMemo(() => {
    if (!searchAluno.trim()) return filteredAlunos;
    const q = searchAluno.toLowerCase();
    return filteredAlunos.filter(a =>
      a.nome.toLowerCase().includes(q) ||
      (a.whatsapp || '').includes(q) ||
      (a.email || '').toLowerCase().includes(q)
    );
  }, [filteredAlunos, searchAluno]);

  const alunosPorTurma = useMemo(() => {
    const groups: Record<string, Aluno[]> = {};
    alunosVisiveis.forEach(a => {
      const key = a.turma_id || '__sem_turma__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    // Sort: sem_turma first (needs attention), then turmas by name
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '__sem_turma__') return -1;
      if (b === '__sem_turma__') return 1;
      const ta = turmas.find(t => t.id === a)?.nome || '';
      const tb = turmas.find(t => t.id === b)?.nome || '';
      return ta.localeCompare(tb);
    });
  }, [alunosVisiveis, turmas]);

  // CRUD turma
  const createTurma = async () => {
    if (!newTurmaForm.nome.trim()) return;
    try {
      const { error } = await supabase.from('turmas').insert({
        nome: newTurmaForm.nome,
        produto: newTurmaForm.produto,
        tipo: newTurmaForm.produto,
        data_inicio: newTurmaForm.data_inicio || null,
        data_fim: newTurmaForm.data_fim || null,
        valor_mensalidade: parseFloat(newTurmaForm.valor_mensalidade) || null,
        total_mensalidades: parseInt(newTurmaForm.total_mensalidades) || null,
      });
      if (error) throw error;
      toast({ title: 'Turma criada!' });
      setShowTurmaDialog(false);
      setNewTurmaForm(emptyTurmaForm);
      loadData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    }
  };

  const openEditTurma = (t: Turma) => {
    setTurmaToEdit(t);
    setEditTurmaForm({ nome: t.nome, data_inicio: t.data_inicio || '', data_fim: t.data_fim || '', valor_mensalidade: t.valor_mensalidade, total_mensalidades: t.total_mensalidades });
    setShowEditTurma(true);
  };

  const saveEditTurma = async () => {
    if (!turmaToEdit) return;
    setSavingTurma(true);
    try {
      const { error } = await supabase.from('turmas').update({
        nome: editTurmaForm.nome,
        data_inicio: editTurmaForm.data_inicio || null,
        data_fim: editTurmaForm.data_fim || null,
        valor_mensalidade: editTurmaForm.valor_mensalidade || null,
        total_mensalidades: editTurmaForm.total_mensalidades || null,
        responsavel_id: editTurmaForm.responsavel_id || null,
      }).eq('id', turmaToEdit.id);
      if (error) throw error;
      toast({ title: 'Turma atualizada!' });
      setShowEditTurma(false);
      loadData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    } finally {
      setSavingTurma(false);
    }
  };

  const deleteTurma = async (id: string) => {
    if (!confirm('Excluir turma? Os alunos nao serao deletados.')) return;
    const { error } = await supabase.from('turmas').delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: 'Turma removida!' });
    loadData();
  };

  const createResponsavel = async () => {
    if (!newResponsavelNome.trim()) return;
    setSavingResponsavel(true);
    const { error } = await supabase.from('responsaveis').insert({ nome: newResponsavelNome.trim() });
    setSavingResponsavel(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: 'Responsavel adicionado!' });
    setNewResponsavelNome('');
    loadData();
  };

  const deleteResponsavel = async (id: string) => {
    if (!confirm('Remover responsavel? As turmas ficam sem dono.')) return;
    const { error } = await supabase.from('responsaveis').delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: 'Responsavel removido!' });
    loadData();
  };

  const saveInlineTurma = async () => {
    if (!editingTurmaCardId) return;
    setSavingInlineTurma(true);
    const { error } = await supabase.from('turmas').update({
      nome: inlineTurmaForm.nome,
      data_inicio: inlineTurmaForm.data_inicio || null,
      data_fim: inlineTurmaForm.data_fim || null,
      valor_mensalidade: inlineTurmaForm.valor_mensalidade || null,
      total_mensalidades: inlineTurmaForm.total_mensalidades || null,
      responsavel_id: inlineTurmaForm.responsavel_id || null,
    }).eq('id', editingTurmaCardId);
    setSavingInlineTurma(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: 'Turma atualizada!' });
    setEditingTurmaCardId(null);
    loadData();
  };

  // CRUD aluno
  const getValorEfetivo = (turmaId: string, valorAluno?: number | null) => {
    const turma = turmas.find(t => t.id === turmaId);
    return Number(valorAluno ?? turma?.valor_mensalidade ?? 109.90);
  };

  const atualizarContadoresAluno = async (alunoId: string) => {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('status')
      .eq('aluno_id', alunoId);

    if (error) return;

    // Atualiza só os contadores — total_mensalidades é gerenciado por sincronizarParcelasAluno
    await supabase
      .from('alunos')
      .update({
        mensalidades_pagas: (data || []).filter(p => p.status === 'pago').length,
      })
      .eq('id', alunoId);
  };

  // sincronizarParcelasAluno agora vive em src/lib/parcelasAluno.ts (compartilhado com TimeComercial.tsx)

  const createAluno = async (forceCreate = false) => {
    if (!newAlunoForm.nome.trim() || !newAlunoForm.turma_id) return;
    if (!forceCreate) {
      const wNum = newAlunoForm.whatsapp.replace(/\D/g, '');
      const dup = alunos.find(a =>
        (newAlunoForm.email.trim() && a.email?.toLowerCase() === newAlunoForm.email.trim().toLowerCase()) ||
        (wNum && a.whatsapp?.replace(/\D/g, '') === wNum)
      );
      if (dup) { setDuplicataWarning(dup); return; }
    }
    try {
      const method = normalizePaymentMethod(newAlunoForm.forma_pagamento);
      const diaVenc = extractDueDay(newAlunoForm.dia_vencimento);
      const customTotal = newAlunoForm.total_parcelas ? parseInt(newAlunoForm.total_parcelas) : 0;
      const totalMens = customTotal > 0 ? customTotal : paymentMethodTotal(method);
      const valorAluno = newAlunoForm.valor_mensalidade ? parseFloat(newAlunoForm.valor_mensalidade) : null;
      const valorEfetivo = getValorEfetivo(newAlunoForm.turma_id, valorAluno);
      const isIsento = newAlunoForm.tipo_pagamento === 'bolsa' || newAlunoForm.tipo_pagamento === 'cortesia';
      const { data: inserted, error } = await supabase.from('alunos').insert({
        turma_id: newAlunoForm.turma_id,
        produto: activeTab,
        nome: newAlunoForm.nome,
        whatsapp: newAlunoForm.whatsapp || null,
        email: newAlunoForm.email || null,
        cpf: newAlunoForm.cpf || null,
        data_nascimento: newAlunoForm.data_nascimento || null,
        pais: newAlunoForm.pais || 'Brasil',
        endereco: newAlunoForm.endereco || null,
        cep: newAlunoForm.cep || null,
        cidade_estado: newAlunoForm.cidade_estado || null,
        dia_vencimento: diaVenc,
        dia_vencimento_contrato: `dia ${diaVenc}`,
        status: deriveAlunoStatus(newAlunoForm.data_matricula || todayDateInput()),
        tipo_pagamento: newAlunoForm.tipo_pagamento,
        mensalidades_pagas: isIsento ? 0 : (method === 'boleto' ? 1 : totalMens),
        total_mensalidades: totalMens,
        data_inicio: newAlunoForm.data_inicio || null,
        data_fim: newAlunoForm.data_fim || null,
        data_matricula: newAlunoForm.data_matricula || todayDateInput(),
        origem_lead: newAlunoForm.origem,
        lancamento_id: newAlunoForm.lancamento_id || null,
        valor_mensalidade: valorAluno,
        forma_pagamento: method,
      }).select().single();
      if (error) throw error;
      if (newAlunoForm.observacoes?.trim()) {
        await supabase.from('aluno_observacoes').insert({
          aluno_id: inserted.id,
          texto: newAlunoForm.observacoes.trim(),
          criado_por: user?.id ?? null,
        });
      }
      const rows = buildInstallments({
        alunoId: inserted.id,
        turmaId: newAlunoForm.turma_id,
        produto: activeTab,
        valor: valorEfetivo,
        method,
        diaVencimento: diaVenc,
        dataMatricula: newAlunoForm.data_matricula || todayDateInput(),
        minTotal: totalMens,
        isIsento,
      });
      const { error: pagamentosError } = await supabase.from('pagamentos').insert(rows as any[]);
      if (pagamentosError) throw pagamentosError;
      toast({ title: 'Aluno adicionado!' });
      setShowAlunoDialog(false);
      setNewAlunoForm(emptyAlunoForm);
      loadData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    }
  };

  useEffect(() => {
    if (!alunoDetail?.id) { setCobrancaLogsAluno([]); return; }
    setLoadingCobrancaLogsAluno(true);
    supabase
      .from('cobranca_logs')
      .select('id, pagamento_id, mensagem, template_nome, template_tipo, status, erro_msg, enviado_em, manual, created_at, respondeu_em, ultima_resposta')
      .eq('aluno_id', alunoDetail.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCobrancaLogsAluno((data as CobrancaLogAluno[]) || []);
        setLoadingCobrancaLogsAluno(false);
      });
  }, [alunoDetail?.id]);

  useEffect(() => {
    if (!alunoDetail?.id) { setIndicadosAluno([]); return; }
    const email = alunoDetail.email?.trim();
    const telefoneDigits = (alunoDetail.whatsapp || '').replace(/\D/g, '').slice(-11);
    if (!email && !telefoneDigits) { setIndicadosAluno([]); return; }
    setLoadingIndicadosAluno(true);
    const filtros = [email && `observacoes.ilike.%${email}%`, telefoneDigits && `observacoes.ilike.%${telefoneDigits}%`].filter(Boolean).join(',');
    supabase
      .from('leads')
      .select('id, nome, telefone, whatsapp, status, criado_em')
      .eq('origem', 'indicacao_matricula')
      .or(filtros)
      .order('criado_em', { ascending: false })
      .then(({ data }) => {
        setIndicadosAluno((data as IndicadoLead[]) || []);
        setLoadingIndicadosAluno(false);
      });
  }, [alunoDetail?.id]);

  useEffect(() => {
    supabase.from('canais_cobranca').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => {
      if (data) setCanaisCobranca(data);
    });
    supabase.from('payment_method_rates').select('*').eq('ativo', true).then(({ data }) => {
      if (data) setTaxasRates(data as TaxaDetalhe[]);
    });
  }, []);

  const openAlunoDetail = (a: Aluno) => {
    setAlunoDetail(a);
    const parcela2 = (pagamentosPorAluno[a.id] || []).find(p => p.numero_parcela === 2);
    setEditAlunoForm({
      nome: a.nome,
      whatsapp: a.whatsapp || '',
      email: a.email || '',
      cpf: a.cpf || '',
      rg: a.rg || '',
      sexo: a.sexo || '',
      data_nascimento: a.data_nascimento || '',
      pais: a.pais || 'Brasil',
      endereco: a.endereco || '',
      cep: a.cep || '',
      cidade_estado: a.cidade_estado || '',
      turma_id: a.turma_id,
      dia_vencimento: a.dia_vencimento || extractDueDay(a.dia_vencimento_contrato),
      dia_vencimento_contrato: a.dia_vencimento_contrato || '',
      data_inicio: a.data_inicio || '',
      data_fim: a.data_fim || '',
      data_matricula: a.data_matricula || todayDateInput(),
      status: deriveAlunoStatus(a.data_matricula, a.status),
      origem_lead: a.origem_lead || '',
      lancamento_id: a.lancamento_id || '',
      mensalidades_pagas: a.mensalidades_pagas || 0,
      valor_mensalidade: a.valor_mensalidade ?? undefined,
      tipo_pagamento: (a.tipo_pagamento || 'mensalidade') as 'mensalidade' | 'bolsa' | 'cortesia',
      forma_pagamento: normalizePaymentMethod(a.forma_pagamento),
      forms_respondido: a.forms_respondido ?? false,
      forms_respondido_em: toDateInput(a.forms_respondido_em),
      contrato_enviado: a.contrato_enviado ?? false,
      contrato_enviado_em: toDateInput(a.contrato_enviado_em),
      contrato_assinado: a.contrato_assinado ?? false,
      contrato_assinado_em: toDateInput(a.contrato_assinado_em),
      autentique_documento_id: a.autentique_documento_id || '',
      autentique_link_assinatura: a.autentique_link_assinatura || '',
      contrato_baixado: a.contrato_baixado ?? false,
      contrato_arquivo_url: a.contrato_arquivo_url || '',
      contrato_arquivo_nome: a.contrato_arquivo_nome || '',
      asaas_integrado: a.asaas_integrado ?? false,
      asaas_link: a.asaas_link || '',
      voomp_integrado: a.voomp_integrado ?? false,
      voomp_link: a.voomp_link || '',
      total_mensalidades: a.total_mensalidades,
      data_segunda_parcela: toDateInput(parcela2?.data_vencimento),
      observacoes: a.observacoes || '',
      grupo_turma_confirmado_em: a.grupo_turma_confirmado_em ?? null,
    });
    setLatestObsTexto('');
    setShowAlunoDetail(true);
  };

  const saveAlunoDetail = async () => {
    if (!alunoDetail) return;
    setSavingAluno(true);
    try {
      const nextTurmaId = editAlunoForm.turma_id || alunoDetail.turma_id;
      const nextMethod = normalizePaymentMethod(editAlunoForm.forma_pagamento || alunoDetail.forma_pagamento);
      const nextDiaVenc = extractDueDay(editAlunoForm.dia_vencimento || editAlunoForm.dia_vencimento_contrato || alunoDetail.dia_vencimento || alunoDetail.dia_vencimento_contrato);
      const nextDataMatricula = editAlunoForm.data_matricula || alunoDetail.data_matricula || todayDateInput();
      const nextStatus = deriveAlunoStatus(nextDataMatricula, editAlunoForm.status || alunoDetail.status);
      const nextValorAluno = editAlunoForm.valor_mensalidade ?? null;
      const valorEfetivo = getValorEfetivo(nextTurmaId, nextValorAluno);
      const editCustomTotal = editAlunoForm.total_mensalidades;
      const targetTotal = (editCustomTotal && editCustomTotal > 0)
        ? editCustomTotal
        : paymentMethodTotal(nextMethod);
      const nowIso = new Date().toISOString();
      const checkedDate = (checked?: boolean, formValue?: string, previousValue?: string) => {
        if (!checked) return null;
        if (formValue) return new Date(`${formValue}T12:00:00`).toISOString();
        return previousValue || nowIso;
      };
      const currentParcelas = pagamentos.filter(p => p.aluno_id === alunoDetail.id);
      const nextSegundaDate = editAlunoForm.data_segunda_parcela
        ? parseDateOnly(editAlunoForm.data_segunda_parcela)
        : null;
      const currentParcela2 = currentParcelas.find(p => p.numero_parcela === 2);
      const currentSegundaStr = toDateInput(currentParcela2?.data_vencimento) ?? '';
      const financialChanged =
        nextTurmaId !== alunoDetail.turma_id ||
        nextMethod !== normalizePaymentMethod(alunoDetail.forma_pagamento) ||
        nextDiaVenc !== extractDueDay(alunoDetail.dia_vencimento || alunoDetail.dia_vencimento_contrato) ||
        toDateInput(nextDataMatricula) !== toDateInput(alunoDetail.data_matricula) ||
        Number(nextValorAluno ?? 0) !== Number(alunoDetail.valor_mensalidade ?? 0) ||
        (editAlunoForm.data_segunda_parcela || '') !== currentSegundaStr ||
        currentParcelas.length === 0 ||
        currentParcelas.length !== targetTotal;

      const updateData: any = {
        nome: editAlunoForm.nome || alunoDetail.nome,
        whatsapp: editAlunoForm.whatsapp || null,
        email: editAlunoForm.email || null,
        cpf: editAlunoForm.cpf || null,
        rg: editAlunoForm.rg || null,
        sexo: editAlunoForm.sexo || null,
        data_nascimento: editAlunoForm.data_nascimento || null,
        pais: editAlunoForm.pais || 'Brasil',
        endereco: editAlunoForm.endereco || null,
        cep: editAlunoForm.cep || null,
        cidade_estado: editAlunoForm.cidade_estado || null,
        turma_id: nextTurmaId,
        dia_vencimento: nextDiaVenc,
        dia_vencimento_contrato: `dia ${nextDiaVenc}`,
        data_inicio: editAlunoForm.data_inicio || null,
        data_fim: editAlunoForm.data_fim || null,
        data_matricula: nextDataMatricula,
        status: nextStatus,
        tipo_pagamento: editAlunoForm.tipo_pagamento || 'mensalidade',
        origem_lead: editAlunoForm.origem_lead || null,
        lancamento_id: editAlunoForm.lancamento_id || null,
        valor_mensalidade: nextValorAluno,
        forma_pagamento: nextMethod,
        forms_respondido: editAlunoForm.forms_respondido ?? false,
        forms_respondido_em: checkedDate(editAlunoForm.forms_respondido, editAlunoForm.forms_respondido_em, alunoDetail.forms_respondido_em),
        contrato_enviado: editAlunoForm.contrato_enviado ?? false,
        contrato_enviado_em: checkedDate(editAlunoForm.contrato_enviado, editAlunoForm.contrato_enviado_em, alunoDetail.contrato_enviado_em),
        contrato_assinado: editAlunoForm.contrato_assinado ?? false,
        contrato_assinado_em: checkedDate(editAlunoForm.contrato_assinado, editAlunoForm.contrato_assinado_em, alunoDetail.contrato_assinado_em),
        autentique_documento_id: editAlunoForm.autentique_documento_id || null,
        autentique_link_assinatura: editAlunoForm.autentique_link_assinatura || null,
        contrato_baixado: editAlunoForm.contrato_baixado ?? false,
        contrato_arquivo_url: editAlunoForm.contrato_arquivo_url || null,
        contrato_arquivo_nome: editAlunoForm.contrato_arquivo_nome || null,
        asaas_integrado: editAlunoForm.asaas_integrado ?? false,
        asaas_link: editAlunoForm.asaas_link || null,
        voomp_integrado: editAlunoForm.voomp_integrado ?? false,
        voomp_link: editAlunoForm.voomp_link || null,
        total_mensalidades: targetTotal,
      };
      const { error } = await supabase.from('alunos').update(updateData).eq('id', alunoDetail.id);
      if (error) throw error;

      const nextIsIsento = (editAlunoForm.tipo_pagamento || 'mensalidade') !== 'mensalidade';
      const tipoPagamentoChanged = (editAlunoForm.tipo_pagamento || 'mensalidade') !== (alunoDetail.tipo_pagamento || 'mensalidade');
      if ((financialChanged || tipoPagamentoChanged) && !parcelasEditMode) {
        await sincronizarParcelasAluno({
          alunoId: alunoDetail.id,
          turmaId: nextTurmaId,
          produto: activeTab,
          method: nextMethod,
          diaVencimento: nextDiaVenc,
          dataMatricula: nextDataMatricula,
          dataSegundaParcela: nextSegundaDate,
          valor: valorEfetivo,
          customTotal: targetTotal,
          isIsento: nextIsIsento,
        });
      } else {
        await atualizarContadoresAluno(alunoDetail.id);
      }

      toast({ title: 'Aluno atualizado!' });
      setShowAlunoDetail(false);
      loadData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    } finally {
      setSavingAluno(false);
    }
  };

  const deleteAluno = async () => {
    if (!alunoToDelete) return;
    await supabase.from('pagamentos').delete().eq('aluno_id', alunoToDelete.id);
    const { error } = await supabase.from('alunos').delete().eq('id', alunoToDelete.id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: 'Aluno removido!' });
    setShowDeleteDialog(false);
    setAlunoToDelete(null);
    loadData();
  };

  const toggleRowSelection = (id: string) => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllRows = () => setSelectedRows(prev => prev.size === alunosVisiveis.length ? new Set() : new Set(alunosVisiveis.map(a => a.id)));

  const marcarPagoEmMassa = async () => {
    setBulkMarking(true);
    const hoje = todayDateInput();

    // Coletar IDs das próximas parcelas + alunoId associado em uma única passagem
    const toMark: { parcelaId: string; alunoId: string }[] = [];
    for (const alunoId of Array.from(selectedRows)) {
      const proxima = (pagamentosPorAluno[alunoId] || [])
        .filter(p => p.status !== 'pago')
        .sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0))[0];
      if (proxima) toMark.push({ parcelaId: proxima.id, alunoId });
    }

    let count = 0;
    if (toMark.length) {
      // 1 query para atualizar todos ao invés de N queries sequenciais
      const { error } = await supabase
        .from('pagamentos')
        .update({ status: 'pago', data_pagamento: hoje })
        .in('id', toMark.map(m => m.parcelaId));

      if (!error) {
        count = toMark.length;
        // Atualizar contadores em paralelo ao invés de sequencial
        await Promise.all(toMark.map(({ alunoId }) => atualizarContadoresAluno(alunoId)));
      }
    }

    setBulkMarking(false);
    setSelectedRows(new Set());
    toast({ title: `${count} pagamento${count !== 1 ? 's' : ''} confirmado${count !== 1 ? 's' : ''}!` });
    loadData();
  };

  const copiarMensagem = (aluno: Aluno) => {
    const parcelas = (pagamentosPorAluno[aluno.id] || []).filter(p => p.status !== 'pago').sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0));
    if (!parcelas.length) { toast({ title: 'Sem parcelas em aberto' }); return; }
    const proxima = parcelas[0];
    const total = (pagamentosPorAluno[aluno.id] || []).length;
    const nome = aluno.nome.split(' ')[0];
    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(proxima.valor);
    const venc = proxima.data_vencimento ? (() => { try { const [y,m,d] = proxima.data_vencimento.split('T')[0].split('-'); return `${d}/${m}/${y}`; } catch { return proxima.data_vencimento; } })() : '-';
    const msg = `Olá ${nome}! 😊\n\nTemos a parcela ${proxima.numero_parcela}/${total} do seu curso no valor de ${valor} com vencimento em ${venc} aguardando pagamento.\n\nRegularize para manter seu acesso em dia. Qualquer dúvida, estou aqui! 🙏`;
    navigator.clipboard.writeText(msg);
    toast({ title: 'Mensagem copiada!' });
  };

  const exportarCSV = () => {
    const headers = ['Nome', 'WhatsApp', 'Email', 'Turma', 'Pagamento', 'Parcelas pagas', 'Total parcelas', 'Prox. vencimento', 'Status', 'Em atraso (R$)'];
    const hoje = parseDateOnly(todayDateInput())!;
    const rows = alunosVisiveis.map(aluno => {
      const turma = turmas.find(t => t.id === aluno.turma_id);
      const method = normalizePaymentMethod(aluno.forma_pagamento);
      const parcs = pagamentosPorAluno[aluno.id] || [];
      const pagas = parcs.filter(p => p.status === 'pago').length;
      const total = parcs.length;
      const abertas = parcs.filter(p => p.status !== 'pago').sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)));
      const proxVencStr = method !== 'boleto' ? 'Quitado' : abertas[0]?.data_vencimento ? (() => { try { const [y,m,d] = abertas[0].data_vencimento.split('T')[0].split('-'); return `${d}/${m}/${y}`; } catch { return abertas[0].data_vencimento; } })() : 'Sem parcelas';
      const inad = inadimplenciaMap[aluno.id];
      return [aluno.nome, aluno.whatsapp || '', aluno.email || '', turma?.nome || 'Sem turma', method, pagas, total, proxVencStr, inad ? 'inadimplente' : aluno.status, inad ? inad.valorEmAtraso.toFixed(2) : ''];
    });
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `alunos_${activeTab}_${todayDateInput()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFichaPDF = () => {
    if (!alunoDetail) return;
    const turma = turmas.find(t => t.id === (editAlunoForm.turma_id || alunoDetail.turma_id));
    const parcelas = pagamentos
      .filter(p => p.aluno_id === alunoDetail.id)
      .sort((a, b) => a.numero_parcela - b.numero_parcela);
    const pagas = parcelas.filter(p => p.status === 'pago').length;
    const total = parcelas.length;
    const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const fmtDate = (d?: string | null) => {
      if (!d) return '—';
      try { const [y, m, dd] = d.split('T')[0].split('-'); return `${dd}/${m}/${y}`; } catch { return d; }
    };
    const fmtStatus = (s: string) => ({ pago: 'Pago', atrasado: 'Atrasado', pendente: 'Pendente' }[s] || s);
    const fmtMethod = (m?: string | null) => ({ boleto: 'Boleto — 15 mensalidades', cartao: 'Cartão — 1x (pagamento único)', avista: 'À vista — 1x' }[m || ''] || m || '—');

    const contratoStatus = editAlunoForm.contrato_assinado
      ? 'Assinado'
      : editAlunoForm.contrato_enviado
        ? 'Enviado — aguardando assinatura'
        : editAlunoForm.forms_respondido
          ? 'Forms respondido'
          : 'Pendente';

    const parcelasRows = parcelas.map(p => `
      <tr class="${p.status === 'pago' ? 'row-pago' : p.status === 'atrasado' ? 'row-atraso' : ''}">
        <td>${p.numero_parcela}/${total}</td>
        <td>${fmtDate(p.data_vencimento)}</td>
        <td>${p.data_pagamento ? fmtDate(p.data_pagamento) : '—'}</td>
        <td class="val">R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td><span class="badge badge-${p.status}">${fmtStatus(p.status)}</span></td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Ficha — ${alunoDetail.nome}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a;background:#fff;padding:32px 40px}
    h1{font-size:20px;font-weight:700;letter-spacing:-0.3px}
    .subtitle{font-size:11px;color:#666;margin-top:2px}
    .divider{border:none;border-top:1px solid #e5e5e5;margin:18px 0}
    .section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .field label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
    .field span{font-size:12px;color:#1a1a1a;font-weight:500}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f5f5f5;text-align:left;padding:7px 10px;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;border-bottom:1px solid #e0e0e0}
    td{padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#333}
    .val{font-weight:600;font-variant-numeric:tabular-nums}
    .row-pago td{background:#f0fdf4}
    .row-atraso td{background:#fff5f5}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
    .badge-pago{background:#dcfce7;color:#166534}
    .badge-atrasado{background:#fee2e2;color:#991b1b}
    .badge-pendente{background:#fef9c3;color:#854d0e}
    .contrato-pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:600;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
    .header-row{display:flex;justify-content:space-between;align-items:flex-start}
    .meta{font-size:10px;color:#999;text-align:right}
    .totals{display:flex;gap:24px;padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e5e5;margin-bottom:12px}
    .totals .item label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px}
    .totals .item .num{font-size:15px;font-weight:700;color:#111}
    .footer{margin-top:28px;font-size:9px;color:#bbb;text-align:center}
    @media print{body{padding:16px 24px}@page{margin:15mm}}
  </style>
</head>
<body>
  <div class="header-row">
    <div>
      <h1>${alunoDetail.nome}</h1>
      <div class="subtitle">${turma?.nome || 'Sem turma atribuída'} · ${turma?.produto || alunoDetail.produto || ''}</div>
    </div>
    <div class="meta">
      <div>Ficha do Aluno</div>
      <div>Gerado em ${geradoEm}</div>
      <div style="margin-top:4px"><span class="contrato-pill">${contratoStatus}</span></div>
    </div>
  </div>

  <hr class="divider"/>

  <div class="section-title">Dados Pessoais</div>
  <div class="grid" style="margin-bottom:16px">
    <div class="field"><label>Nome completo</label><span>${editAlunoForm.nome || alunoDetail.nome || '—'}</span></div>
    <div class="field"><label>WhatsApp</label><span>${editAlunoForm.whatsapp || alunoDetail.whatsapp || '—'}</span></div>
    <div class="field"><label>E-mail</label><span>${editAlunoForm.email || alunoDetail.email || '—'}</span></div>
    <div class="field"><label>CPF</label><span>${editAlunoForm.cpf || alunoDetail.cpf || '—'}</span></div>
    <div class="field"><label>Data de nascimento</label><span>${fmtDate(editAlunoForm.data_nascimento || alunoDetail.data_nascimento)}</span></div>
    <div class="field"><label>País</label><span>${editAlunoForm.pais || alunoDetail.pais || '—'}</span></div>
    <div class="field"><label>CEP</label><span>${editAlunoForm.cep || alunoDetail.cep || '—'}</span></div>
    <div class="field"><label>Cidade / Estado</label><span>${editAlunoForm.cidade_estado || alunoDetail.cidade_estado || '—'}</span></div>
    <div class="field"><label>Origem</label><span>${editAlunoForm.origem_lead || alunoDetail.origem_lead || '—'}</span></div>
  </div>
  ${(editAlunoForm.endereco || alunoDetail.endereco) ? `<div class="field" style="margin-bottom:16px"><label>Endereço</label><span>${editAlunoForm.endereco || alunoDetail.endereco}</span></div>` : ''}

  <hr class="divider"/>

  <div class="section-title">Financeiro</div>
  <div class="grid-2" style="margin-bottom:16px">
    <div class="field"><label>Turma</label><span>${turma?.nome || '—'}</span></div>
    <div class="field"><label>Forma de pagamento</label><span>${fmtMethod(editAlunoForm.forma_pagamento || alunoDetail.forma_pagamento)}</span></div>
    <div class="field"><label>Valor mensalidade</label><span>R$ ${((editAlunoForm.valor_mensalidade ?? alunoDetail.valor_mensalidade ?? turma?.valor_mensalidade ?? 0) as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
    <div class="field"><label>Dia de vencimento</label><span>Dia ${editAlunoForm.dia_vencimento || alunoDetail.dia_vencimento || '—'}</span></div>
    <div class="field"><label>Data de matrícula</label><span>${fmtDate(editAlunoForm.data_matricula || alunoDetail.data_matricula)}</span></div>
    <div class="field"><label>Início da turma</label><span>${fmtDate(editAlunoForm.data_inicio || alunoDetail.data_inicio)}</span></div>
    <div class="field"><label>Fim da turma</label><span>${fmtDate(editAlunoForm.data_fim || alunoDetail.data_fim)}</span></div>
    <div class="field"><label>Status</label><span>${editAlunoForm.status || alunoDetail.status || '—'}</span></div>
  </div>

  ${latestObsTexto ? `<div class="field" style="margin-bottom:16px"><label>Observações</label><span>${latestObsTexto}</span></div>` : ''}

  <hr class="divider"/>

  <div class="section-title">Parcelas</div>
  <div class="totals">
    <div class="item"><label>Total</label><div class="num">${total}</div></div>
    <div class="item"><label>Pagas</label><div class="num" style="color:#166534">${pagas}</div></div>
    <div class="item"><label>Em aberto</label><div class="num" style="color:#92400e">${total - pagas}</div></div>
    <div class="item"><label>Recebido</label><div class="num">R$ ${parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
    <div class="item"><label>A receber</label><div class="num">R$ ${parcelas.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
  </div>
  ${total > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Vencimento</th><th>Pago em</th><th>Valor</th><th>Status</th></tr></thead>
    <tbody>${parcelasRows}</tbody>
  </table>` : '<p style="color:#888;font-size:11px;padding:8px 0">Nenhuma parcela gerada.</p>'}

  <div class="footer">Sistema 11DS · Documento gerado em ${geradoEm}</div>

  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleContratoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !alunoDetail) return;
    e.target.value = '';
    setUploadingContrato(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${alunoDetail.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('contratos').upload(path, file, { upsert: true });
    if (upErr) {
      toast({ variant: 'destructive', title: 'Erro no upload', description: upErr.message });
      setUploadingContrato(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(path);
    const url = urlData.publicUrl;
    await supabase.from('alunos').update({ contrato_arquivo_url: url, contrato_arquivo_nome: file.name }).eq('id', alunoDetail.id);
    setEditAlunoForm(f => ({ ...f, contrato_arquivo_url: url, contrato_arquivo_nome: file.name }));
    setAlunos(prev => prev.map(a => a.id === alunoDetail.id ? { ...a, contrato_arquivo_url: url, contrato_arquivo_nome: file.name } : a));
    setUploadingContrato(false);
    toast({ title: 'Contrato anexado!' });
  };

  const removeContratoArquivo = async () => {
    if (!alunoDetail) return;
    const url = editAlunoForm.contrato_arquivo_url;
    if (url) {
      const parts = url.split('/contratos/');
      if (parts[1]) await supabase.storage.from('contratos').remove([parts[1]]);
    }
    await supabase.from('alunos').update({ contrato_arquivo_url: null, contrato_arquivo_nome: null }).eq('id', alunoDetail.id);
    setEditAlunoForm(f => ({ ...f, contrato_arquivo_url: '', contrato_arquivo_nome: '' }));
    setAlunos(prev => prev.map(a => a.id === alunoDetail.id ? { ...a, contrato_arquivo_url: undefined, contrato_arquivo_nome: undefined } : a));
    toast({ title: 'Arquivo removido.' });
  };

  const quickAssignTurma = async (alunoId: string, turmaId: string) => {
    setAssigningTurma(prev => ({ ...prev, [alunoId]: true }));
    try {
      const aluno = alunos.find(a => a.id === alunoId);
      if (aluno) {
        // Atualiza turma_id + recalcula parcelas em um unico lugar (compartilhado com TimeComercial.tsx)
        await assignTurmaEAtualizarParcelas(alunoId, turmaId, aluno);
      } else {
        const { error } = await supabase.from('alunos').update({ turma_id: turmaId }).eq('id', alunoId);
        if (error) throw error;
      }
    } catch (error: any) {
      setAssigningTurma(prev => ({ ...prev, [alunoId]: false }));
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }
    setAssigningTurma(prev => ({ ...prev, [alunoId]: false }));
    toast({ title: 'Turma atribuida!' });
    loadData();
  };

  const abrirPagoDialog = (pagamentoId: string, alunoId: string) => {
    const hoje = todayDateInput();
    setPagoInfo({ pagamentoId, alunoId, data: hoje, canal_cobranca: '' });
    setShowPagoDialog(true);
  };

  const confirmarPago = async () => {
    if (!pagoInfo) return;
    const pagamento = pagamentos.find(p => p.id === pagoInfo.pagamentoId);
    const aluno = alunos.find(a => a.id === pagoInfo.alunoId);
    const taxa = pagamento
      ? calcTaxaTransacao(pagamento.valor, pagamento.produto || '', aluno?.forma_pagamento || 'boleto', pagoInfo.canal_cobranca || '', taxasRates)
      : 0;
    const { error } = await supabase.from('pagamentos').update({
      status: 'pago',
      data_pagamento: pagoInfo.data,
      canal_cobranca: pagoInfo.canal_cobranca || null,
      taxa_valor: taxa,
    }).eq('id', pagoInfo.pagamentoId);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    await atualizarContadoresAluno(pagoInfo.alunoId);
    toast({ title: 'Pagamento confirmado!' });
    setShowPagoDialog(false);
    setPagoInfo(null);
    loadData();
  };

  const salvarParcelasManual = async () => {
    if (!alunoDetail) return;
    setSavingParcelas(true);
    try {
      const toDelete = parcelasLocais.filter(p => p.deleted && !p.isNew).map(p => p.id);
      const toInsert = parcelasLocais.filter(p => p.isNew && !p.deleted);
      const toUpdate = parcelasLocais.filter(p => !p.isNew && !p.deleted && p.status !== 'pago');

      if (toDelete.length > 0) {
        const { error } = await supabase.from('pagamentos').delete().in('id', toDelete);
        if (error) throw error;
      }
      if (toInsert.length > 0) {
        const rows = toInsert.map(p => ({
          aluno_id: alunoDetail.id,
          turma_id: alunoDetail.turma_id,
          produto: alunoDetail.produto,
          valor: p.valor,
          mes_referencia: p.data_vencimento.slice(0, 7) + '-01',
          data_vencimento: p.data_vencimento,
          numero_parcela: p.numero_parcela,
          status: 'pendente' as const,
          data_pagamento: null,
        }));
        const { error } = await supabase.from('pagamentos').insert(rows);
        if (error) throw error;
      }
      for (const p of toUpdate) {
        const { error } = await supabase.from('pagamentos').update({
          valor: p.valor,
          data_vencimento: p.data_vencimento,
          mes_referencia: p.data_vencimento.slice(0, 7) + '-01',
        }).eq('id', p.id);
        if (error) throw error;
      }

      const surviving = parcelasLocais.filter(p => !p.deleted);
      const paidCount = surviving.filter(p => p.status === 'pago').length;
      await supabase.from('alunos').update({
        total_mensalidades: surviving.length,
        mensalidades_pagas: paidCount,
      }).eq('id', alunoDetail.id);

      toast({ title: `Parcelas salvas! ${surviving.length} no total.` });
      setParcelasEditMode(false);
      loadData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar parcelas', description: e.message });
    } finally {
      setSavingParcelas(false);
    }
  };

  const marcarComoPago = async (pagamentoId: string, alunoId: string) => {
    abrirPagoDialog(pagamentoId, alunoId);
  };

  const estornarPagamento = async (pagamentoId: string, alunoId: string) => {
    const pagamento = pagamentos.find(p => p.id === pagamentoId);
    const vencimento = pagamento?.data_vencimento ? parseDateOnly(pagamento.data_vencimento) : null;
    const hoje = parseDateOnly(todayDateInput())!;
    const status = vencimento && vencimento < hoje ? 'atrasado' : 'pendente';
    await supabase.from('pagamentos').update({ status, data_pagamento: null }).eq('id', pagamentoId);
    await atualizarContadoresAluno(alunoId);
    toast({ title: 'Estornado!' });
    loadData();
  };

  // A previsão de pagamento (data que o aluno prometeu pagar) também pode ser definida na
  // Fila de Cobrança, mas o card de lá some assim que a parcela é marcada como cobrada --
  // aqui na ficha dá pra editar a qualquer momento, independente do estado da cobrança.
  const salvarPrevisaoPagamento = async (pagamentoId: string, data: string) => {
    const { error } = await supabase.from('pagamentos').update({ data_prevista_pagamento: data || null }).eq('id', pagamentoId);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    toast({ title: data ? 'Previsão salva!' : 'Previsão removida.' });
    loadData();
  };

  // Sub-componente compartilhado para Alunos e Turmas
  const ProdutoContent = () => (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border pb-2">
        <button onClick={() => setSubView('alunos')} className={`px-4 py-1.5 rounded-t text-sm font-medium transition-colors ${subView === 'alunos' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
          <Users className="h-3.5 w-3.5 inline mr-1" />Alunos
        </button>
        <button onClick={() => setSubView('turmas')} className={`px-4 py-1.5 rounded-t text-sm font-medium transition-colors ${subView === 'turmas' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
          <Building2 className="h-3.5 w-3.5 inline mr-1" />Turmas
        </button>
        {isAdmin && (
          <button onClick={() => setSubView('responsaveis')} className={`px-4 py-1.5 rounded-t text-sm font-medium transition-colors ${subView === 'responsaveis' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            <Users className="h-3.5 w-3.5 inline mr-1" />Por Responsavel
            {responsaveis.length > 0 && <span className="ml-1.5 bg-primary/20 text-primary rounded-full text-[10px] px-1.5 py-0.5">{responsaveis.length}</span>}
          </button>
        )}
      </div>

      {subView === 'alunos' && (
        <>
          {/* Banner alunos sem turma — apenas admin */}
          {isAdmin && alunosSemTurma.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-amber-800">{alunosSemTurma.length} aluno{alunosSemTurma.length !== 1 ? 's' : ''} sem turma atribuida</span>
                <span className="text-xs text-amber-600 ml-2 hidden sm:inline">Responderam o formulario mas ainda nao foram alocados.</span>
              </div>
              <button
                onClick={() => { setStatusFilter('todos'); setPaymentFilter('todos'); setDueDayFilter('todos'); setDueFilter('todos'); setSelectedTurmaId('todas'); }}
                className="text-xs text-amber-700 font-semibold hover:text-amber-900 whitespace-nowrap">
                Ver na lista ↓
              </button>
            </div>
          )}

          {/* Filtros */}
          <div className="space-y-2">
            {/* Periodo */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Periodo:</span>
              {Object.entries(periodoLabel).map(([key, label]) => (
                <button key={key} onClick={() => setPeriodo(key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${periodo === key ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Status + botao filtros avancados */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Status:</span>
              {([
                { key: 'todos', label: 'Todos', active: 'bg-gray-700 text-white' },
                { key: 'pre_matricula', label: 'Pré-matrícula', active: 'bg-amber-600 text-white' },
                { key: 'ativo', label: 'Ativos', active: 'bg-green-600 text-white' },
                { key: 'inadimplente', label: `Inadimplentes (${inadimplentes.length})`, active: 'bg-red-600 text-white' },
                { key: 'cancelado', label: 'Cancelados', active: 'bg-gray-500 text-white' },
              ] as { key: typeof statusFilter; label: string; active: string }[]).map(({ key, label, active }) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === key ? active : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowFiltrosAvancados(f => !f)}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  paymentFilter !== 'todos' || dueDayFilter !== 'todos' || dueFilter !== 'todos'
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}>
                Filtros
                {(paymentFilter !== 'todos' || dueDayFilter !== 'todos' || dueFilter !== 'todos') && (
                  <span className="bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                    {[paymentFilter !== 'todos', dueDayFilter !== 'todos', dueFilter !== 'todos'].filter(Boolean).length}
                  </span>
                )}
                <span className="text-[10px]">{showFiltrosAvancados ? '▲' : '▼'}</span>
              </button>
            </div>

            {/* Filtros avancados */}
            {showFiltrosAvancados && (
              <div className="bg-muted/30 border border-border/60 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">Pagamento:</span>
                  {([
                    { key: 'todos', label: 'Todos' },
                    { key: 'boleto', label: `Boleto (${paymentCounts.boleto})` },
                    { key: 'cartao', label: `Cartao (${paymentCounts.cartao})` },
                    { key: 'avista', label: `A vista (${paymentCounts.avista})` },
                  ] as { key: PaymentFilter; label: string }[]).map(({ key, label }) => (
                    <button key={key} onClick={() => { setPaymentFilter(key); if (key === 'cartao' || key === 'avista') setDueDayFilter('todos'); }}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${paymentFilter === key ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted/40'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">Dia venc.:</span>
                  <button onClick={() => setDueDayFilter('todos')}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${dueDayFilter === 'todos' ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted/40'}`}>
                    Todos
                  </button>
                  {dueDayOptions.map(({ key, day, count }) => (
                    <button key={key} onClick={() => { setDueDayFilter(key); setPaymentFilter('boleto'); }}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${dueDayFilter === key ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted/40'}`}>
                      Dia {day} ({count})
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">Situacao:</span>
                  {([
                    { key: 'todos', label: 'Todos' },
                    { key: 'vencidos', label: 'Vencidos' },
                    { key: 'hoje', label: 'Hoje' },
                    { key: 'proximos_7', label: '7 dias' },
                    { key: 'proximos_30', label: '30 dias' },
                    { key: 'quitados', label: 'Quitados' },
                  ] as { key: DueFilter; label: string }[]).map(({ key, label }) => (
                    <button key={key} onClick={() => setDueFilter(key)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${dueFilter === key ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted/40'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {(paymentFilter !== 'todos' || dueDayFilter !== 'todos' || dueFilter !== 'todos') && (
                  <button
                    onClick={() => { setPaymentFilter('todos'); setDueDayFilter('todos'); setDueFilter('todos'); }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium">
                    Limpar filtros avancados
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Cards resumo — clique para ver o detalhamento */}
          {(() => {
            const turmaAtiva = selectedTurmaId !== 'todas' ? filteredTurmas.find(t => t.id === selectedTurmaId) : null;
            const contexto = turmaAtiva ? turmaAtiva.nome : periodoLabel[periodo];
            const alunosAtivosLocal = filteredAlunos.filter(a => a.status === 'ativo');
            const pagsPeriodoRecebido = pagamentosEmFoco.filter(p => p.status === 'pago' && periodoFilter(p.data_pagamento));
            const pagsPrevisto = pagamentosEmFoco.filter(p => periodoFilter(p.data_vencimento));
            const getNome = (id: string) => alunos.find(a => a.id === id)?.nome || '—';
            const getTurma = (id: string) => turmas.find(t => t.id === id)?.nome || 'Sem turma';
            const toggle = (card: typeof expandedCard) => setExpandedCard(expandedCard === card ? null : card);
            const chevron = (card: typeof expandedCard) => (
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform ${expandedCard === card ? 'rotate-180' : ''}`} />
            );

            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

                  {/* Recebido */}
                  <Card
                    className={`p-4 cursor-pointer hover:shadow-md transition-all ${expandedCard === 'recebido' ? 'ring-2 ring-green-400 shadow-md' : ''}`}
                    onClick={() => toggle('recebido')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-1.5 bg-green-100 rounded-lg"><DollarSign className="h-3.5 w-3.5 text-green-600" /></div>
                      {chevron('recebido')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5 truncate" title={`Recebido — ${contexto}`}>Recebido — {contexto}</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(receitaMes)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{pagsPeriodoRecebido.length} pag.</p>
                  </Card>

                  {/* Previsto */}
                  <Card
                    className={`p-4 cursor-pointer hover:shadow-md transition-all ${expandedCard === 'previsto' ? 'ring-2 ring-blue-400 shadow-md' : ''}`}
                    onClick={() => toggle('previsto')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-1.5 bg-blue-100 rounded-lg"><Target className="h-3.5 w-3.5 text-blue-600" /></div>
                      {chevron('previsto')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5 truncate" title={`Previsto — ${contexto}`}>Previsto — {contexto}</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(previstoMes)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{pagsPrevisto.length} pag.</p>
                  </Card>

                  {/* A Receber */}
                  <Card
                    className={`p-4 cursor-pointer hover:shadow-md transition-all ${expandedCard === 'aReceber' ? 'ring-2 ring-yellow-400 shadow-md' : ''}`}
                    onClick={() => toggle('aReceber')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-1.5 bg-yellow-100 rounded-lg"><TrendingUp className="h-3.5 w-3.5 text-yellow-600" /></div>
                      {chevron('aReceber')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5">A Receber</p>
                    <p className="text-xl font-bold text-yellow-700">{formatCurrency(valorAReceber)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{parcelasEmAberto.length} parcela{parcelasEmAberto.length !== 1 ? 's' : ''}</p>
                  </Card>

                  {/* Inadimplentes */}
                  <Card
                    className={`p-4 cursor-pointer hover:shadow-md transition-all border-red-100 ${expandedCard === 'inadimplentes' ? 'ring-2 ring-red-400 shadow-md' : ''}`}
                    onClick={() => toggle('inadimplentes')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-1.5 bg-red-100 rounded-lg"><AlertCircle className="h-3.5 w-3.5 text-red-600" /></div>
                      {chevron('inadimplentes')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5">Inadimplentes</p>
                    <p className="text-xl font-bold text-red-600">{inadimplentes.length}</p>
                    {totalEmAtraso > 0 && <p className="text-xs text-red-500 font-medium mt-0.5">{formatCurrency(totalEmAtraso)} em atraso</p>}
                  </Card>

                  {/* Alunos Ativos */}
                  <Card
                    className={`p-4 cursor-pointer hover:shadow-md transition-all ${expandedCard === 'ativos' ? 'ring-2 ring-purple-400 shadow-md' : ''}`}
                    onClick={() => toggle('ativos')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-1.5 bg-purple-100 rounded-lg"><Users className="h-3.5 w-3.5 text-purple-600" /></div>
                      {chevron('ativos')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-0.5">Alunos Ativos</p>
                    <p className="text-xl font-bold text-purple-600">{alunosAtivosLocal.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{contratosPendentes > 0 ? `${contratosPendentes} sem contrato` : 'Todos c/ contrato'}</p>
                  </Card>
                </div>

                {/* Painel de detalhamento */}
                {expandedCard && (
                  <Card className="border border-border/60 bg-white">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
                      <p className="text-sm font-semibold text-foreground">
                        {expandedCard === 'recebido' && `Pagamentos recebidos — ${contexto} (${pagsPeriodoRecebido.length})`}
                        {expandedCard === 'previsto' && `Pagamentos previstos — ${contexto} (${pagsPrevisto.length})`}
                        {expandedCard === 'aReceber' && `Parcelas em aberto (${parcelasEmAberto.length})`}
                        {expandedCard === 'inadimplentes' && `Alunos inadimplentes (${inadimplentes.length})`}
                        {expandedCard === 'ativos' && `Alunos ativos (${alunosAtivosLocal.length})`}
                      </p>
                      <button onClick={() => setExpandedCard(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">fechar ×</button>
                    </div>

                    <div className="overflow-auto max-h-72">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
                          <tr>
                            <th className="text-left py-2 px-4 font-medium text-muted-foreground">Nome</th>
                            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Turma</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Parc. · Valor</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">
                              {expandedCard === 'recebido' ? 'Pago em' :
                               expandedCard === 'inadimplentes' ? 'Atraso' :
                               expandedCard === 'ativos' ? 'Mensalidade' : 'Vencimento'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {expandedCard === 'recebido' && (() => {
                            const sorted = [...pagsPeriodoRecebido].sort((a, b) => {
                              const nA = getNome(a.aluno_id); const nB = getNome(b.aluno_id);
                              return nA !== nB ? nA.localeCompare(nB) : (a.numero_parcela || 0) - (b.numero_parcela || 0);
                            });
                            return sorted.map((p, i) => {
                              const isFirst = i === 0 || sorted[i - 1].aluno_id !== p.aluno_id;
                              return (
                                <tr key={p.id} className={`hover:bg-muted/30 ${isFirst && i > 0 ? 'border-t-2 border-border/50' : 'border-t border-border/20'}`}>
                                  <td className="py-1.5 px-4">{isFirst ? <span className="font-medium">{getNome(p.aluno_id)}</span> : <span className="text-muted-foreground/40 pl-2">↳</span>}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{isFirst ? getTurma(p.turma_id) : ''}</td>
                                  <td className="py-1.5 px-3 text-right">
                                    <span className="text-muted-foreground mr-1.5">#{p.numero_parcela}</span>
                                    <span className="font-semibold text-green-700">{formatCurrency(p.valor)}</span>
                                  </td>
                                  <td className="py-1.5 px-4 text-right text-muted-foreground">{p.data_pagamento ? format(parseISO(p.data_pagamento), 'dd/MM/yy') : '—'}</td>
                                </tr>
                              );
                            });
                          })()}
                          {expandedCard === 'previsto' && (() => {
                            const sorted = [...pagsPrevisto].sort((a, b) => {
                              const nA = getNome(a.aluno_id); const nB = getNome(b.aluno_id);
                              return nA !== nB ? nA.localeCompare(nB) : a.data_vencimento.localeCompare(b.data_vencimento);
                            });
                            return sorted.map((p, i) => {
                              const isFirst = i === 0 || sorted[i - 1].aluno_id !== p.aluno_id;
                              return (
                                <tr key={p.id} className={`hover:bg-muted/30 ${p.status === 'atrasado' ? 'bg-red-50/30' : ''} ${isFirst && i > 0 ? 'border-t-2 border-border/50' : 'border-t border-border/20'}`}>
                                  <td className="py-1.5 px-4">{isFirst ? <span className="font-medium">{getNome(p.aluno_id)}</span> : <span className="text-muted-foreground/40 pl-2">↳</span>}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{isFirst ? getTurma(p.turma_id) : ''}</td>
                                  <td className="py-1.5 px-3 text-right">
                                    <span className="text-muted-foreground mr-1.5">#{p.numero_parcela}</span>
                                    <span className="font-semibold">{formatCurrency(p.valor)}</span>
                                  </td>
                                  <td className="py-1.5 px-4 text-right">
                                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${p.status === 'pago' ? 'bg-green-100 text-green-700' : p.status === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                      {p.status === 'pago' ? 'pago' : format(parseISO(p.data_vencimento), 'dd/MM/yy')}
                                    </span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                          {expandedCard === 'aReceber' && (() => {
                            const sorted = [...parcelasEmAberto].sort((a, b) => {
                              const nA = getNome(a.aluno_id); const nB = getNome(b.aluno_id);
                              return nA !== nB ? nA.localeCompare(nB) : a.data_vencimento.localeCompare(b.data_vencimento);
                            });
                            return sorted.map((p, i) => {
                              const isFirst = i === 0 || sorted[i - 1].aluno_id !== p.aluno_id;
                              return (
                                <tr key={p.id} className={`hover:bg-muted/30 ${p.status === 'atrasado' ? 'bg-red-50/30' : ''} ${isFirst && i > 0 ? 'border-t-2 border-border/50' : 'border-t border-border/20'}`}>
                                  <td className="py-1.5 px-4">{isFirst ? <span className="font-medium">{getNome(p.aluno_id)}</span> : <span className="text-muted-foreground/40 pl-2">↳</span>}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{isFirst ? getTurma(p.turma_id) : ''}</td>
                                  <td className="py-1.5 px-3 text-right">
                                    <span className="text-muted-foreground mr-1.5">#{p.numero_parcela}</span>
                                    <span className="font-semibold text-yellow-700">{formatCurrency(p.valor)}</span>
                                  </td>
                                  <td className="py-1.5 px-4 text-right">
                                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${p.status === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                      {format(parseISO(p.data_vencimento), 'dd/MM/yy')}
                                    </span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                          {expandedCard === 'inadimplentes' && inadimplentes
                            .sort((a, b) => (inadimplenciaMap[b.id]?.diasAtraso || 0) - (inadimplenciaMap[a.id]?.diasAtraso || 0))
                            .map(a => {
                              const inad = inadimplenciaMap[a.id];
                              return (
                                <tr key={a.id} className="border-t border-border/30 hover:bg-muted/30">
                                  <td className="py-2 px-4 font-medium">{a.nome}</td>
                                  <td className="py-2 px-3 text-muted-foreground">{getTurma(a.turma_id)}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-red-700">{inad ? formatCurrency(inad.valorEmAtraso) : '—'}</td>
                                  <td className="py-2 px-4 text-right">
                                    {inad ? (
                                      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                        {inad.diasAtraso}d · {inad.parcelasAtrasadas} parc.
                                      </span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          }
                          {expandedCard === 'ativos' && alunosAtivosLocal
                            .sort((a, b) => a.nome.localeCompare(b.nome))
                            .map(a => (
                              <tr key={a.id} className="border-t border-border/30 hover:bg-muted/30">
                                <td className="py-2 px-4 font-medium">{a.nome}</td>
                                <td className="py-2 px-3 text-muted-foreground">{getTurma(a.turma_id)}</td>
                                <td className="py-2 px-3 text-right text-muted-foreground">{a.valor_mensalidade ? formatCurrency(a.valor_mensalidade) : '—'}</td>
                                <td className="py-2 px-4 text-right">
                                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">ativo</span>
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Filtro turma + busca */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Card className="p-3 flex-1">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium whitespace-nowrap">Turma:</label>
                <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as turmas</SelectItem>
                    {filteredTurmas.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nome} ({alunos.filter(a => a.turma_id === t.id).length} alunos)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
            <Card className="p-3 flex-1 flex items-center gap-2">
              <Input
                ref={searchAlunoRef}
                placeholder="Buscar por nome, WhatsApp ou email..."
                value={searchAluno}
                onChange={e => setSearchAluno(e.target.value)}
                className="border-0 shadow-none p-0 h-auto text-sm focus-visible:ring-0 flex-1"
              />
              <Button variant="ghost" size="sm" onClick={exportarCSV} title="Exportar lista como CSV" className="shrink-0 h-7 px-2 text-muted-foreground hover:text-foreground">
                <Download className="h-4 w-4 mr-1" /><span className="text-xs">CSV</span>
              </Button>
            </Card>
          </div>

          {/* Barra flutuante de acao em massa */}
          {selectedRows.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl">
              <span className="text-sm font-medium">{selectedRows.size} selecionado{selectedRows.size !== 1 ? 's' : ''}</span>
              <button onClick={marcarPagoEmMassa} disabled={bulkMarking}
                className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-full text-sm font-semibold transition-colors">
                <CheckCircle2 className="h-4 w-4" />
                {bulkMarking ? 'Processando...' : 'Marcar proxima parcela como paga'}
              </button>
              <button onClick={() => setSelectedRows(new Set())} className="text-gray-400 hover:text-white text-sm">Cancelar</button>
            </div>
          )}

          {/* Alunos agrupados por turma */}
          {filteredAlunos.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum aluno cadastrado</p>
              {isAdmin && <Button onClick={() => setShowAlunoDialog(true)} className="mt-3 bg-primary text-white"><Plus className="h-4 w-4 mr-1" />Adicionar Aluno</Button>}
            </Card>
          ) : alunosVisiveis.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum aluno encontrado para "<span className="font-medium">{searchAluno}</span>"</p>
              <Button variant="ghost" onClick={() => setSearchAluno('')} className="mt-2 text-sm text-primary">Limpar busca</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {alunosPorTurma.map(([turmaId, grupo]) => {
                const turma = turmas.find(t => t.id === turmaId);
                const isSemTurma = turmaId === '__sem_turma__';
                const turmaLabel = isSemTurma ? 'Aguardando atribuicao de turma' : (turma?.nome || turmaId);
                return (
                  <Card key={turmaId} className={`p-5 ${isSemTurma ? 'border-amber-300 bg-amber-50/30' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-bold flex items-center gap-2 ${isSemTurma ? 'text-amber-800' : ''}`}>
                        {isSemTurma
                          ? <AlertCircle className="h-4 w-4 text-amber-600" />
                          : <Building2 className="h-4 w-4 text-primary" />}
                        {turmaLabel}
                        {turma?.valor_mensalidade && <span className="text-xs font-normal text-muted-foreground ml-1">- {formatCurrency(turma.valor_mensalidade)}/mes</span>}
                        {isSemTurma && <span className="text-xs font-normal text-amber-600 ml-1">— Abra o detalhe para atribuir uma turma</span>}
                      </h3>
                      <Badge variant="secondary" className={isSemTurma ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}>{grupo.length} aluno{grupo.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/20 border-b border-border/60">
                            <th className="py-2 px-2 w-8"><input type="checkbox" className="cursor-pointer" checked={grupo.length > 0 && grupo.every(a => selectedRows.has(a.id))} onChange={() => { const allSelected = grupo.every(a => selectedRows.has(a.id)); setSelectedRows(prev => { const n = new Set(prev); grupo.forEach(a => allSelected ? n.delete(a.id) : n.add(a.id)); return n; }); }} /></th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Nome</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">WhatsApp</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Turma</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pagamento</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Parcelas</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Prox. venc.</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contrato</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.map(aluno => {
                            const parcelasAluno = pagamentosPorAluno[aluno.id] || [];
                            const method = normalizePaymentMethod(aluno.forma_pagamento);
                            const dueDay = getAlunoDueDay(aluno, parcelasAluno);
                            const expectedTotal = paymentMethodTotal(method);
                            const total = method === 'boleto'
                              ? (aluno.total_mensalidades || turma?.total_mensalidades || parcelasAluno.length || expectedTotal)
                              : expectedTotal;
                            const pagas = method === 'boleto' ? (aluno.mensalidades_pagas ?? parcelasAluno.filter(p => p.status === 'pago').length) : expectedTotal;
                            const abertas = method === 'boleto'
                              ? parcelasAluno.filter(p => p.status !== 'pago').sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))
                              : [];
                            const proximoVencimento = abertas[0]?.data_vencimento;
                            const pgBadge: Record<PaymentMethod, string> = { boleto: 'bg-zinc-100 text-zinc-700 border border-zinc-200', cartao: 'bg-blue-50 text-blue-600 border border-blue-200', avista: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };

                            const inad = inadimplenciaMap[aluno.id];
                            const isInad = !!inad || aluno.status === 'inadimplente';
                            const contratoLabel = aluno.contrato_assinado ? 'Assinado' : aluno.contrato_enviado ? 'Enviado' : aluno.forms_respondido ? 'Forms ok' : 'Pendente';
                            const contratoClass = aluno.contrato_assinado
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : aluno.contrato_enviado
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : aluno.forms_respondido
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : 'bg-zinc-100 text-zinc-500 border border-zinc-200';
                            const hoje2 = parseDateOnly(todayDateInput())!;
                            const urgDot = (() => {
                              if (aluno.status === 'cancelado') return { cls: 'bg-zinc-300', tip: 'Cancelado' };
                              if (aluno.status === 'pre_matricula') return { cls: 'bg-amber-400', tip: 'Pré-matrícula' };
                              if (isInad && method !== 'boleto') return { cls: 'bg-red-600 ring-2 ring-red-200', tip: 'Inadimplente' };
                              if (method !== 'boleto') return { cls: 'bg-zinc-300', tip: 'Quitado' };
                              if (abertas.length === 0) return { cls: 'bg-emerald-500', tip: 'Quitado' };
                              if (!proximoVencimento) return { cls: 'bg-zinc-400', tip: '-' };
                              const v = parseDateOnly(proximoVencimento); if (!v) return { cls: 'bg-zinc-400', tip: '-' };
                              const diff = Math.floor((v.getTime() - hoje2.getTime()) / (1000*60*60*24));
                              if (diff < 0) return { cls: 'bg-red-600 ring-2 ring-red-200', tip: `Vencido há ${Math.abs(diff)}d` };
                              if (diff === 0) return { cls: 'bg-red-500 ring-2 ring-red-200', tip: 'Vence hoje!' };
                              if (diff <= 7) return { cls: 'bg-amber-500 ring-2 ring-amber-100', tip: `Vence em ${diff}d` };
                              return { cls: 'bg-emerald-500', tip: `Vence em ${diff}d` };
                            })();
                            return (
                              <tr key={aluno.id} className={`border-b border-border/30 transition-colors ${selectedRows.has(aluno.id) ? 'bg-primary/5' : isInad ? 'bg-red-50/60 border-l-[3px] border-l-red-400' : aluno.status === 'cancelado' ? 'bg-zinc-50 border-l-[3px] border-l-zinc-400 opacity-70' : aluno.status === 'pre_matricula' ? 'bg-amber-50/50 border-l-[3px] border-l-amber-400' : 'hover:bg-muted/25'}`}>
                                <td className="py-2.5 px-2"><input type="checkbox" className="cursor-pointer" checked={selectedRows.has(aluno.id)} onChange={() => toggleRowSelection(aluno.id)} /></td>
                                <td className="py-2.5 px-3 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${urgDot.cls}`} title={urgDot.tip} />
                                    <span className={`font-medium ${aluno.status === 'cancelado' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{aluno.nome}</span>
                                  </div>
                                  {obsPendentesPorAluno[aluno.id] && (
                                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5 leading-tight max-w-[180px] truncate" title={obsPendentesPorAluno[aluno.id]}>
                                      {obsPendentesPorAluno[aluno.id]}
                                    </p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {aluno.whatsapp
                                    ? <a href={`https://wa.me/${aluno.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-green-700 hover:text-green-900 font-medium transition-colors">
                                        <Phone className="h-3.5 w-3.5" />{aluno.whatsapp}
                                      </a>
                                    : <span className="text-muted-foreground text-xs">-</span>}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground text-xs">
                                  {isSemTurma
                                    ? <Select
                                        value=""
                                        onValueChange={v => quickAssignTurma(aluno.id, v)}
                                        disabled={assigningTurma[aluno.id]}
                                      >
                                        <SelectTrigger className="h-7 text-xs w-36 border-amber-300 text-amber-700 bg-amber-50">
                                          <SelectValue placeholder={assigningTurma[aluno.id] ? 'Salvando...' : 'Atribuir turma'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {filteredTurmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    : turma?.nome || '-'}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col gap-1">
                                    {aluno.tipo_pagamento === 'bolsa'
                                      ? <Badge className="bg-purple-50 text-purple-700 border border-purple-200">Bolsa</Badge>
                                      : aluno.tipo_pagamento === 'cortesia'
                                        ? <Badge className="bg-orange-50 text-orange-600 border border-orange-200">Cortesia</Badge>
                                        : <Badge className={pgBadge[method]}>{method === 'boleto' ? paymentLabels[method] : `${paymentLabels[method]} pago`}</Badge>
                                    }
                                    <span className="text-[10px] text-muted-foreground">
                                      {aluno.tipo_pagamento && aluno.tipo_pagamento !== 'mensalidade' ? 'Isento' : (method === 'boleto' ? `Dia ${dueDay}` : 'Quitado')}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  {aluno.tipo_pagamento && aluno.tipo_pagamento !== 'mensalidade'
                                    ? <span className="text-xs text-purple-500 font-medium">Isento</span>
                                    : method !== 'boleto'
                                      ? (() => {
                                          const valorCartao = parcelasAluno.reduce((s, p) => s + p.valor, 0) || aluno.valor_mensalidade || 0;
                                          return (
                                            <div className="flex flex-col gap-0.5">
                                              <div className="flex items-center gap-2">
                                                <span>1/1</span>
                                                <Progress value={100} className="w-16 h-1.5" />
                                              </div>
                                              {valorCartao > 0 && <span className="text-[10px] text-muted-foreground font-medium">{formatCurrency(valorCartao)}</span>}
                                            </div>
                                          );
                                        })()
                                      : <div className="flex items-center gap-2">
                                          <span>{pagas}/{total}</span>
                                          <Progress value={total ? (pagas / total) * 100 : 0} className="w-16 h-1.5" />
                                        </div>
                                  }
                                </td>
                                <td className="py-2.5 px-3 text-xs text-muted-foreground">
                                  {aluno.tipo_pagamento && aluno.tipo_pagamento !== 'mensalidade'
                                    ? <span className="text-purple-400">—</span>
                                    : method !== 'boleto'
                                      ? 'Quitado'
                                      : parcelasAluno.length === 0
                                        ? <span className="text-orange-400">Sem parcelas</span>
                                        : proximoVencimento
                                          ? safeDate(proximoVencimento)
                                          : <span className="text-green-600 font-medium">Quitado</span>}
                                </td>
                                <td className="py-2.5 px-3">
                                  <Badge className={contratoClass}>{contratoLabel}</Badge>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col gap-1">
                                    <Badge className={isInad ? 'bg-red-50 text-red-700 border border-red-200' : statusColors[aluno.status] || 'bg-zinc-100 text-zinc-600 border border-zinc-200'}>
                                      {isInad ? 'inadimplente' : (statusLabels[aluno.status] || aluno.status)}
                                    </Badge>
                                    {inad && (
                                      <span className="text-[10px] text-red-600 font-medium leading-tight mt-0.5 flex items-center gap-1">
                                        <span>{inad.parcelasAtrasadas}p</span>
                                        <span className="text-red-300">·</span>
                                        <span>{inad.diasAtraso}d</span>
                                        <span className="text-red-300">·</span>
                                        <span>{formatCurrency(inad.valorEmAtraso)}</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => openAlunoDetail(aluno)} title="Ver detalhes"><Eye className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => copiarMensagem(aluno)} title="Copiar mensagem de cobranca" className="text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setAlunoToDelete(aluno); setShowDeleteDialog(true); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {subView === 'responsaveis' && (
        <div className="space-y-4">
          {/* Adicionar responsavel */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Gerenciar Responsaveis</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do responsavel (ex: Joao, Equipe A...)"
                value={newResponsavelNome}
                onChange={e => setNewResponsavelNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createResponsavel()}
                className="max-w-sm"
              />
              <Button onClick={createResponsavel} disabled={savingResponsavel || !newResponsavelNome.trim()} className="bg-primary text-white">
                <Plus className="h-4 w-4 mr-1" />{savingResponsavel ? 'Salvando...' : 'Adicionar'}
              </Button>
            </div>
            {responsaveis.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {responsaveis.map(r => (
                  <div key={r.id} className="flex items-center gap-1.5 bg-muted px-3 py-1 rounded-full text-sm">
                    <span>{r.nome}</span>
                    <button onClick={() => deleteResponsavel(r.id)} className="text-muted-foreground hover:text-destructive ml-1 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Dashboard por responsavel */}
          {responsaveis.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum responsavel cadastrado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione responsaveis e vincule turmas a eles na aba Turmas.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {responsaveis.map(resp => {
                const turmasResp = filteredTurmas.filter(t => t.responsavel_id === resp.id);
                const alunosResp = alunos.filter(a => turmasResp.some(t => t.id === a.turma_id) && a.produto === activeTab);
                const ativosResp = alunosResp.filter(a => a.status === 'ativo');
                const pagResp = filteredPagamentos.filter(p => turmasResp.some(t => t.id === p.turma_id));
                const recebidoResp = pagResp.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
                const aReceberResp = pagResp.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0);
                const inadResp = alunosResp.filter(a => inadimplenciaMap[a.id] || a.status === 'inadimplente');
                const atrasoResp = inadResp.reduce((s, a) => s + (inadimplenciaMap[a.id]?.valorEmAtraso || 0), 0);

                return (
                  <Card key={resp.id} className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold">{resp.nome}</h3>
                        <p className="text-xs text-muted-foreground">{turmasResp.length} turma{turmasResp.length !== 1 ? 's' : ''} · {alunosResp.length} aluno{alunosResp.length !== 1 ? 's' : ''}</p>
                      </div>
                      {turmasResp.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhuma turma vinculada</span>}
                    </div>

                    {/* Metricas do responsavel */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs text-green-700 font-medium">Recebido (total)</p>
                        <p className="text-base font-bold text-green-700">{formatCurrency(recebidoResp)}</p>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3">
                        <p className="text-xs text-yellow-700 font-medium">A Receber</p>
                        <p className="text-base font-bold text-yellow-700">{formatCurrency(aReceberResp)}</p>
                        <p className="text-[10px] text-yellow-600">{pagResp.filter(p => p.status !== 'pago').length} parcelas</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-xs text-purple-700 font-medium">Alunos Ativos</p>
                        <p className="text-base font-bold text-purple-700">{ativosResp.length}</p>
                        <p className="text-[10px] text-purple-600">{alunosResp.length} total</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs text-red-700 font-medium">Inadimplentes</p>
                        <p className="text-base font-bold text-red-700">{inadResp.length}</p>
                        {atrasoResp > 0 && <p className="text-[10px] text-red-600">{formatCurrency(atrasoResp)} em atraso</p>}
                      </div>
                    </div>

                    {/* Turmas do responsavel */}
                    {turmasResp.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Turmas</p>
                        <div className="space-y-2">
                          {turmasResp.map(t => {
                            const alunosTurma = alunosResp.filter(a => a.turma_id === t.id);
                            const ativosTurma = alunosTurma.filter(a => a.status === 'ativo').length;
                            const pagTurma = filteredPagamentos.filter(p => p.turma_id === t.id);
                            const recTurma = pagTurma.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
                            const recebTurma = pagTurma.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0);
                            const inadTurma = alunosTurma.filter(a => inadimplenciaMap[a.id] || a.status === 'inadimplente').length;
                            return (
                              <div key={t.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <div>
                                    <span className="font-medium">{t.nome}</span>
                                    {t.valor_mensalidade && <span className="text-xs text-muted-foreground ml-1.5">{formatCurrency(t.valor_mensalidade)}/mes</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span><span className="font-medium text-foreground">{alunosTurma.length}</span> alunos ({ativosTurma} ativos)</span>
                                  <span className="text-green-700 font-medium">{formatCurrency(recTurma)}</span>
                                  <span className="text-yellow-700">{formatCurrency(recebTurma)} a receber</span>
                                  {inadTurma > 0 && <span className="text-red-600 font-medium">{inadTurma} inad.</span>}
                                  <button onClick={() => { setSelectedTurmaId(t.id); setSubView('alunos'); }} className="text-primary hover:underline">Ver alunos</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* Turmas sem responsavel */}
              {(() => {
                const semDono = filteredTurmas.filter(t => !t.responsavel_id);
                if (semDono.length === 0) return null;
                return (
                  <Card className="p-5 border-dashed border-muted-foreground/30">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">{semDono.length} turma{semDono.length !== 1 ? 's' : ''} sem responsavel</h3>
                    <div className="flex flex-wrap gap-2">
                      {semDono.map(t => (
                        <span key={t.id} className="bg-muted text-sm px-3 py-1 rounded-full">{t.nome}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Va em Turmas, edite cada uma e atribua um responsavel.</p>
                  </Card>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {subView === 'turmas' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => setShowTurmaDialog(true)} variant="outline"><Plus className="h-4 w-4 mr-1" />Nova Turma</Button>
            </div>
          )}
          {filteredTurmas.length === 0 ? (
            <Card className="p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma turma cadastrada</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTurmas.map(turma => {
                const count = alunos.filter(a => a.turma_id === turma.id).length;
                const receitaTurma = pagamentos.filter(p => p.turma_id === turma.id && p.status === 'pago').reduce((s, p) => s + p.valor, 0);
                const isEditing = editingTurmaCardId === turma.id;
                return (
                  <Card key={turma.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {isEditing
                          ? <Input value={inlineTurmaForm.nome || ''} onChange={e => setInlineTurmaForm(f => ({ ...f, nome: e.target.value }))} className="font-bold text-base h-8 mb-1" autoFocus />
                          : <h4 className="font-bold text-base">{turma.nome}</h4>}
                        <Badge className="mt-1 text-xs bg-primary/10 text-primary">{turma.tipo || turma.produto}</Badge>
                      </div>
                      <div className="flex gap-1 ml-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={saveInlineTurma} disabled={savingInlineTurma} className="h-7 text-xs bg-primary text-white">{savingInlineTurma ? '...' : 'Salvar'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingTurmaCardId(null)} className="h-7 text-xs">x</Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost" size="sm"
                              title="Disparar mensagem para alunos da turma"
                              onClick={() => setDisparoTurma({ id: turma.id, nome: turma.nome })}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingTurmaCardId(turma.id); setInlineTurmaForm({ nome: turma.nome, data_inicio: turma.data_inicio || '', data_fim: turma.data_fim || '', valor_mensalidade: turma.valor_mensalidade, total_mensalidades: turma.total_mensalidades, responsavel_id: turma.responsavel_id || '' }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteTurma(turma.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {isEditing ? (
                        <>
                          <div><label className="text-muted-foreground">Inicio</label><Input type="date" value={inlineTurmaForm.data_inicio || ''} onChange={e => setInlineTurmaForm(f => ({ ...f, data_inicio: e.target.value }))} className="h-7 mt-0.5 text-xs" /></div>
                          <div><label className="text-muted-foreground">Fim</label><Input type="date" value={inlineTurmaForm.data_fim || ''} onChange={e => setInlineTurmaForm(f => ({ ...f, data_fim: e.target.value }))} className="h-7 mt-0.5 text-xs" /></div>
                          <div><label className="text-muted-foreground">Mensalidade (R$)</label><Input type="number" step="0.01" value={inlineTurmaForm.valor_mensalidade ?? ''} onChange={e => setInlineTurmaForm(f => ({ ...f, valor_mensalidade: parseFloat(e.target.value) || undefined }))} className="h-7 mt-0.5 text-xs" /></div>
                          <div><label className="text-muted-foreground">Total Parcelas</label><Input type="number" value={inlineTurmaForm.total_mensalidades ?? ''} onChange={e => setInlineTurmaForm(f => ({ ...f, total_mensalidades: parseInt(e.target.value) || undefined }))} className="h-7 mt-0.5 text-xs" /></div>
                          <div className="col-span-2">
                            <label className="text-muted-foreground">Responsavel</label>
                            <Select value={inlineTurmaForm.responsavel_id || '__none__'} onValueChange={v => setInlineTurmaForm(f => ({ ...f, responsavel_id: v === '__none__' ? '' : v }))}>
                              <SelectTrigger className="h-7 mt-0.5 text-xs"><SelectValue placeholder="Sem responsavel" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem responsavel</SelectItem>
                                {responsaveis.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">Inicio:</span> {safeDate(turma.data_inicio) || '-'}</div>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">Fim:</span> {safeDate(turma.data_fim) || '-'}</div>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">Mensalidade:</span> {turma.valor_mensalidade ? formatCurrency(turma.valor_mensalidade) : '-'}</div>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">Parcelas:</span> {turma.total_mensalidades ?? '-'}</div>
                          {turma.responsavel_id && <div className="col-span-2 text-muted-foreground"><span className="font-medium text-foreground">Responsavel:</span> {responsaveis.find(r => r.id === turma.responsavel_id)?.nome || '-'}</div>}
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>{count} aluno{count !== 1 ? 's' : ''}</div>
                        {receitaTurma > 0 && <div className="text-green-600 font-medium">Recebido: {formatCurrency(receitaTurma)}</div>}
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setSelectedTurmaId(turma.id); setSubView('alunos'); }}>Ver alunos</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" /><p className="text-muted-foreground">Carregando...</p></div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Financeiro</h1>
            <p className="text-sm text-muted-foreground">Gestao completa de turmas e pagamentos</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTurmaDialog(true)}><Plus className="h-4 w-4 mr-1" />Nova Turma</Button>
              <Button onClick={() => setShowAlunoDialog(true)} className="bg-primary text-white"><Plus className="h-4 w-4 mr-1" />Adicionar Aluno</Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {visibleTabs.length > 1 && (
          <div className="mb-4">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as ProdutoTab); setSubView('alunos'); setSelectedTurmaId('todas'); }}>
              <TabsList className={`grid w-full max-w-xs`} style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
                {visibleTabs.includes('psicanalise') && <TabsTrigger value="psicanalise">Psicanalise</TabsTrigger>}
                {visibleTabs.includes('numerologia') && <TabsTrigger value="numerologia">Numerologia</TabsTrigger>}
              </TabsList>
            </Tabs>
          </div>
        )}
        {ProdutoContent()}
      </div>

      {/* Modal Disparo de Turma */}
      {disparoTurma && (
        <TurmaDisparoModal
          open={!!disparoTurma}
          onClose={() => setDisparoTurma(null)}
          turma={disparoTurma}
          alunos={alunos.filter(a => a.turma_id === disparoTurma.id)}
        />
      )}

      {/* Modal Nova Turma */}
      <Dialog open={showTurmaDialog} onOpenChange={setShowTurmaDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Turma</DialogTitle><DialogDescription>Crie uma nova turma</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da Turma *</label>
              <Input value={newTurmaForm.nome} onChange={e => setNewTurmaForm({ ...newTurmaForm, nome: e.target.value })} placeholder="Ex: Turma 02226" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Produto</label>
              <Select value={newTurmaForm.produto} onValueChange={v => setNewTurmaForm({ ...newTurmaForm, produto: v as ProdutoTab })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="psicanalise">Psicanalise</SelectItem>
                  <SelectItem value="numerologia">Numerologia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Data Inicio</label><Input type="date" value={newTurmaForm.data_inicio} onChange={e => setNewTurmaForm({ ...newTurmaForm, data_inicio: e.target.value })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Data Fim</label><Input type="date" value={newTurmaForm.data_fim} onChange={e => setNewTurmaForm({ ...newTurmaForm, data_fim: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Valor Mensalidade</label><Input type="number" step="0.01" value={newTurmaForm.valor_mensalidade} onChange={e => setNewTurmaForm({ ...newTurmaForm, valor_mensalidade: e.target.value })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Total Parcelas</label><Input type="number" value={newTurmaForm.total_mensalidades} onChange={e => setNewTurmaForm({ ...newTurmaForm, total_mensalidades: e.target.value })} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTurmaDialog(false)}>Cancelar</Button>
            <Button onClick={createTurma} className="bg-primary text-white">Criar Turma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Turma */}
      <Dialog open={showEditTurma} onOpenChange={setShowEditTurma}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Turma</DialogTitle><DialogDescription>{turmaToEdit?.nome}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Nome</label><Input value={editTurmaForm.nome || ''} onChange={e => setEditTurmaForm({ ...editTurmaForm, nome: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Data Inicio</label><Input type="date" value={editTurmaForm.data_inicio || ''} onChange={e => setEditTurmaForm({ ...editTurmaForm, data_inicio: e.target.value })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Data Fim</label><Input type="date" value={editTurmaForm.data_fim || ''} onChange={e => setEditTurmaForm({ ...editTurmaForm, data_fim: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Valor Mensalidade</label><Input type="number" step="0.01" value={editTurmaForm.valor_mensalidade || ''} onChange={e => setEditTurmaForm({ ...editTurmaForm, valor_mensalidade: parseFloat(e.target.value) })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Total Parcelas</label><Input type="number" value={editTurmaForm.total_mensalidades || ''} onChange={e => setEditTurmaForm({ ...editTurmaForm, total_mensalidades: parseInt(e.target.value) })} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTurma(false)}>Cancelar</Button>
            <Button onClick={saveEditTurma} disabled={savingTurma} className="bg-primary text-white">{savingTurma ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog duplicata */}
      <Dialog open={!!duplicataWarning} onOpenChange={() => setDuplicataWarning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Possivel duplicata</DialogTitle>
            <DialogDescription>Ja existe um aluno cadastrado com o mesmo email ou WhatsApp.</DialogDescription>
          </DialogHeader>
          {duplicataWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-1">
              <p className="font-semibold">{duplicataWarning.nome}</p>
              {duplicataWarning.whatsapp && <p className="text-muted-foreground">{duplicataWarning.whatsapp}</p>}
              {duplicataWarning.email && <p className="text-muted-foreground">{duplicataWarning.email}</p>}
              <p className="text-xs">Status: <span className="font-medium">{duplicataWarning.status}</span></p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicataWarning(null)}>Cancelar</Button>
            <Button onClick={() => { setDuplicataWarning(null); createAluno(true); }} className="bg-primary text-white">Cadastrar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Adicionar Aluno */}
      <Dialog open={showAlunoDialog} onOpenChange={setShowAlunoDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar Aluno</DialogTitle><DialogDescription>Adicione um novo aluno na turma</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Nome *</label><Input value={newAlunoForm.nome} onChange={e => setNewAlunoForm({ ...newAlunoForm, nome: e.target.value })} placeholder="Nome completo" className="mt-1" /></div>
            <div><label className="text-sm font-medium">WhatsApp</label><Input value={newAlunoForm.whatsapp} onChange={e => setNewAlunoForm({ ...newAlunoForm, whatsapp: e.target.value })} placeholder="(11) 99999-9999" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Email</label><Input type="email" value={newAlunoForm.email} onChange={e => setNewAlunoForm({ ...newAlunoForm, email: e.target.value })} placeholder="email@example.com" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">CPF</label><Input value={newAlunoForm.cpf} onChange={e => setNewAlunoForm({ ...newAlunoForm, cpf: e.target.value })} placeholder="000.000.000-00" className="mt-1" /></div>
              <div><label className="text-sm font-medium">Data de nascimento</label><Input type="date" value={newAlunoForm.data_nascimento} onChange={e => setNewAlunoForm({ ...newAlunoForm, data_nascimento: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Pais</label><Input value={newAlunoForm.pais} onChange={e => setNewAlunoForm({ ...newAlunoForm, pais: e.target.value })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">CEP</label><Input value={newAlunoForm.cep} onChange={e => setNewAlunoForm({ ...newAlunoForm, cep: e.target.value })} className="mt-1" /></div>
            </div>
            <div><label className="text-sm font-medium">Endereco completo</label><Input value={newAlunoForm.endereco} onChange={e => setNewAlunoForm({ ...newAlunoForm, endereco: e.target.value })} className="mt-1" /></div>
            <div><label className="text-sm font-medium">Cidade / Estado</label><Input value={newAlunoForm.cidade_estado} onChange={e => setNewAlunoForm({ ...newAlunoForm, cidade_estado: e.target.value })} className="mt-1" /></div>
            <div>
              <label className="text-sm font-medium">Turma *</label>
              <Select value={newAlunoForm.turma_id} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, turma_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione uma turma" /></SelectTrigger>
                <SelectContent>{filteredTurmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Data de Matricula</label><Input type="date" value={newAlunoForm.data_matricula} onChange={e => setNewAlunoForm({ ...newAlunoForm, data_matricula: e.target.value })} className="mt-1" /><p className="text-[10px] text-muted-foreground mt-0.5">Data do 1o pagamento / ato de matricula. Se for uma data futura, o aluno entra como Pré-matrícula automaticamente.</p></div>
              <div><label className="text-sm font-medium">Data de Inicio da Turma</label><Input type="date" value={newAlunoForm.data_inicio} onChange={e => setNewAlunoForm({ ...newAlunoForm, data_inicio: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Data fim</label><Input type="date" value={newAlunoForm.data_fim} onChange={e => setNewAlunoForm({ ...newAlunoForm, data_fim: e.target.value })} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Valor personalizado</label><Input type="number" step="0.01" value={newAlunoForm.valor_mensalidade} onChange={e => setNewAlunoForm({ ...newAlunoForm, valor_mensalidade: e.target.value })} placeholder="Vazio = valor da turma" className="mt-1" /></div>
            </div>
            <div>
              <label className="text-sm font-medium">Dia Vencimento</label>
              <Select value={newAlunoForm.dia_vencimento} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, dia_vencimento: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,5,10,15,20,25,28,30].map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de pagamento</label>
              <Select value={newAlunoForm.tipo_pagamento} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, tipo_pagamento: v as 'mensalidade' | 'bolsa' | 'cortesia' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensalidade">Mensalidade (pagante)</SelectItem>
                  <SelectItem value="bolsa">Bolsa de estudo (isento)</SelectItem>
                  <SelectItem value="cortesia">Cortesia (isento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Forma de Pagamento</label>
                <Select value={newAlunoForm.forma_pagamento} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, forma_pagamento: v as PaymentMethod, total_parcelas: '' })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto">Boleto - 15 mensalidades</SelectItem>
                    <SelectItem value="cartao">Cartao - 1x (pagamento único)</SelectItem>
                    <SelectItem value="avista">A vista - 1/1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Nº de parcelas</label>
                <Input
                  type="number"
                  min="1"
                  value={newAlunoForm.total_parcelas}
                  onChange={e => setNewAlunoForm({ ...newAlunoForm, total_parcelas: e.target.value })}
                  placeholder={String(paymentMethodTotal(newAlunoForm.forma_pagamento))}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Vazio = padrão do método</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Origem</label>
              <Select value={newAlunoForm.origem} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, origem: v, lancamento_id: v !== 'lancamento' ? '' : newAlunoForm.lancamento_id })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direto">Direto</SelectItem>
                  <SelectItem value="lancamento">Lançamento</SelectItem>
                  <SelectItem value="npa">NPA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newAlunoForm.origem === 'lancamento' && (
              <div>
                <label className="text-sm font-medium">Lançamento</label>
                <Select value={newAlunoForm.lancamento_id} onValueChange={v => setNewAlunoForm({ ...newAlunoForm, lancamento_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o lançamento" /></SelectTrigger>
                  <SelectContent>
                    {lancamentos.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome}{l.data_live ? ` — ${new Date(l.data_live + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Observacoes</label>
              <Textarea value={newAlunoForm.observacoes} onChange={e => setNewAlunoForm({ ...newAlunoForm, observacoes: e.target.value })} placeholder="Informacoes do contrato, cobranca ou atendimento..." className="mt-1 min-h-16" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAlunoDialog(false)}>Cancelar</Button>
            <Button onClick={createAluno} className="bg-primary text-white">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhe/Edicao do Aluno */}
      <Dialog open={showAlunoDetail} onOpenChange={v => { if (!v) { setParcelasEditMode(false); setParcelasLocais([]); } setShowAlunoDetail(v); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{alunoDetail?.nome}</DialogTitle>
            <DialogDescription>Edite os dados e gerencie pagamentos</DialogDescription>
          </DialogHeader>
          {alunoDetail && (() => {
            const parcelas = filteredPagamentos.filter(p => p.aluno_id === alunoDetail.id).sort((a, b) => a.numero_parcela - b.numero_parcela);
            const pagas = parcelas.filter(p => p.status === 'pago').length;
            const atrasadas = parcelas.filter(p => p.status === 'atrasado').length;
            const total = parcelas.length;
            const turmaAtual = turmas.find(t => t.id === (editAlunoForm.turma_id || alunoDetail.turma_id));
            const valorEfetivo = editAlunoForm.valor_mensalidade ?? turmaAtual?.valor_mensalidade ?? 0;
            return (
              <div className="space-y-5">

                {/* Link do Formulário de Contrato */}
                {alunoDetail.contrato_token && (
                  <div className="rounded-lg border border-border bg-white p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formulário de Contrato</p>

                    {/* Pipeline visual */}
                    <div className="flex items-center gap-1 text-xs">
                      {[
                        { label: 'Link gerado', done: true },
                        { label: 'Forms respondido', done: !!alunoDetail.forms_respondido },
                        { label: 'Contrato enviado', done: !!alunoDetail.contrato_enviado },
                        { label: 'Assinado', done: !!alunoDetail.contrato_assinado },
                      ].map((step, i, arr) => (
                        <div key={step.label} className="flex items-center gap-1">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                            step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                          }`}>
                            {step.done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {step.label}
                          </div>
                          {i < arr.length - 1 && <div className={`h-px w-3 ${step.done ? 'bg-emerald-300' : 'bg-border'}`} />}
                        </div>
                      ))}
                    </div>

                    {/* URL do formulário */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Link para o aluno preencher os dados e assinar:</p>
                      <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2 font-mono text-xs">
                        <span className="flex-1 truncate text-foreground/70">
                          {window.location.origin}/assinar/{alunoDetail.contrato_token}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/assinar/${alunoDetail.contrato_token}`);
                            toast({ title: 'Link copiado!' });
                          }}
                          className="p-1 hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                          title="Copiar link"
                        >
                          <Copy className="h-3.5 w-3.5 text-primary" />
                        </button>
                        <a
                          href={`${window.location.origin}/assinar/${alunoDetail.contrato_token}`}
                          target="_blank" rel="noopener noreferrer"
                          className="p-1 hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                          title="Abrir formulário"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        </a>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 text-xs h-8"
                        onClick={async () => {
                          const link = `${window.location.origin}/assinar/${alunoDetail.contrato_token}`;
                          const { error } = await supabase.functions.invoke('wpp-enviar', {
                            body: {
                              numero: alunoDetail.whatsapp,
                              mensagem: `Olá, ${alunoDetail.nome.split(' ')[0]}! 📝\n\nPreencha seus dados para assinar o contrato de matrícula:\n\n${link}`,
                            },
                          });
                          if (error) toast({ variant: 'destructive', title: 'Erro ao enviar WPP', description: error.message });
                          else toast({ title: '✅ Link enviado por WhatsApp!' });
                        }}
                        disabled={!alunoDetail.whatsapp}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Enviar por WPP
                      </Button>

                      {alunoDetail.token_acesso && (
                        <Button
                          size="sm" variant="outline"
                          className="gap-1.5 text-xs h-8 border-purple-500/40 text-purple-700 hover:bg-purple-50"
                          onClick={async () => {
                            const link = `${window.location.origin}/membros/${alunoDetail.token_acesso}`;
                            const { error } = await supabase.functions.invoke('wpp-enviar', {
                              body: {
                                numero: alunoDetail.whatsapp,
                                mensagem: `Olá, ${alunoDetail.nome.split(' ')[0]}! 🎓\n\nAcesse sua área de membros para ver sua matrícula, pagamentos e o link do grupo:\n\n${link}`,
                              },
                            });
                            if (error) toast({ variant: 'destructive', title: 'Erro ao enviar WPP', description: error.message });
                            else toast({ title: '✅ Link da área de membros enviado!' });
                          }}
                          disabled={!alunoDetail.whatsapp}
                        >
                          <MessageSquare className="h-3.5 w-3.5" /> Área de membros
                        </Button>
                      )}

                      {alunoDetail.autentique_link_assinatura && (
                        <a
                          href={alunoDetail.autentique_link_assinatura}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <Button size="sm" className="gap-1.5 text-xs h-8 bg-violet-600 hover:bg-violet-700">
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir na Autentique
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Contrato */}
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contrato</span>
                  <button
                    onClick={() => setEditAlunoForm(f => ({ ...f, contrato_enviado: !f.contrato_enviado, contrato_enviado_em: !f.contrato_enviado ? (f.contrato_enviado_em || todayDateInput()) : '' }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${editAlunoForm.contrato_enviado ? 'bg-blue-500 text-white' : 'bg-white border border-border text-muted-foreground'}`}>
                    Enviado
                  </button>
                  <button
                    onClick={() => setEditAlunoForm(f => ({ ...f, contrato_assinado: !f.contrato_assinado, contrato_assinado_em: !f.contrato_assinado ? (f.contrato_assinado_em || todayDateInput()) : '', contrato_enviado: f.contrato_assinado ? f.contrato_enviado : true, contrato_enviado_em: f.contrato_assinado ? f.contrato_enviado_em : (f.contrato_enviado_em || todayDateInput()) }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${editAlunoForm.contrato_assinado ? 'bg-green-500 text-white' : 'bg-white border border-border text-muted-foreground'}`}>
                    Assinado
                  </button>
                  <button
                    onClick={() => setEditAlunoForm(f => ({ ...f, contrato_baixado: !f.contrato_baixado }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${editAlunoForm.contrato_baixado ? 'bg-violet-500 text-white' : 'bg-white border border-border text-muted-foreground'}`}>
                    Baixado
                  </button>
                  <button
                    onClick={() => setEditAlunoForm(f => ({ ...f, asaas_integrado: !f.asaas_integrado }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${editAlunoForm.asaas_integrado ? 'bg-sky-500 text-white' : 'bg-white border border-border text-muted-foreground'}`}>
                    Asaas
                  </button>
                  <button
                    onClick={() => setEditAlunoForm(f => ({ ...f, voomp_integrado: !f.voomp_integrado }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${editAlunoForm.voomp_integrado ? 'bg-orange-500 text-white' : 'bg-white border border-border text-muted-foreground'}`}>
                    Voomp
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Select value={editAlunoForm.status || 'ativo'} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, status: v as Aluno['status'] })}>
                      <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre_matricula">Pré-matrícula</SelectItem>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inadimplente">Inadimplente</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                        <SelectItem value="concluido">Concluido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="w-full text-[10px] text-muted-foreground -mt-1">
                    Pré-matrícula é automático: enquanto a data de "Ato de matrícula / 1ª parcela" abaixo estiver no futuro, o aluno fica como Pré-matrícula; ao salvar depois que a data chegar, ele vira Ativo sozinho.
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full pt-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!editAlunoForm.forms_respondido} onCheckedChange={checked => setEditAlunoForm(f => ({ ...f, forms_respondido: checked, forms_respondido_em: checked ? (f.forms_respondido_em || todayDateInput()) : '' }))} />
                      <span className="text-xs font-medium">Forms respondido</span>
                    </div>
                    <div><label className="text-xs text-muted-foreground">Data forms</label><Input type="date" value={editAlunoForm.forms_respondido_em || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, forms_respondido_em: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Contrato enviado em</label><Input type="date" value={editAlunoForm.contrato_enviado_em || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, contrato_enviado_em: e.target.value, contrato_enviado: !!e.target.value || editAlunoForm.contrato_enviado })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Assinado em</label><Input type="date" value={editAlunoForm.contrato_assinado_em || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, contrato_assinado_em: e.target.value, contrato_assinado: !!e.target.value || editAlunoForm.contrato_assinado })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">ID Autentique</label><Input value={editAlunoForm.autentique_documento_id || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, autentique_documento_id: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div className="lg:col-span-3"><label className="text-xs text-muted-foreground">Link de assinatura</label><Input value={editAlunoForm.autentique_link_assinatura || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, autentique_link_assinatura: e.target.value })} placeholder="https://..." className="mt-1 h-8 text-sm" /></div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${editAlunoForm.asaas_integrado ? 'bg-sky-500' : 'bg-zinc-300'}`} />
                        Link Asaas
                      </label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input value={editAlunoForm.asaas_link || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, asaas_link: e.target.value })} placeholder="https://asaas.com/..." className="h-8 text-sm flex-1" />
                        {editAlunoForm.asaas_link && (
                          <a href={editAlunoForm.asaas_link} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-800 flex-shrink-0">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${editAlunoForm.voomp_integrado ? 'bg-orange-500' : 'bg-zinc-300'}`} />
                        Link Voomp
                      </label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input value={editAlunoForm.voomp_link || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, voomp_link: e.target.value })} placeholder="https://voomp.com.br/..." className="h-8 text-sm flex-1" />
                        {editAlunoForm.voomp_link && (
                          <a href={editAlunoForm.voomp_link} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-800 flex-shrink-0">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 lg:col-span-4">
                      <label className="text-xs text-muted-foreground">Arquivo do contrato</label>
                      {editAlunoForm.contrato_arquivo_url ? (
                        <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50/60">
                          <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-sm text-emerald-800 flex-1 truncate" title={editAlunoForm.contrato_arquivo_nome}>
                            {editAlunoForm.contrato_arquivo_nome || 'Contrato'}
                          </span>
                          <a href={editAlunoForm.contrato_arquivo_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex-shrink-0 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />Ver
                          </a>
                          <button onClick={removeContratoArquivo}
                            className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 ml-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className={`mt-1 flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border bg-white hover:bg-muted/20 cursor-pointer transition-colors ${uploadingContrato ? 'opacity-60 pointer-events-none' : ''}`}>
                          <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">
                            {uploadingContrato ? 'Enviando...' : 'Clique para anexar PDF, imagem ou documento'}
                          </span>
                          <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            onChange={handleContratoUpload} disabled={uploadingContrato} />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dados pessoais */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados Pessoais</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">Nome</label><Input value={editAlunoForm.nome || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, nome: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">WhatsApp</label><Input value={editAlunoForm.whatsapp || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, whatsapp: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Email</label><Input type="email" value={editAlunoForm.email || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, email: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">CPF</label><Input value={editAlunoForm.cpf || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, cpf: e.target.value })} placeholder="000.000.000-00" className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">RG</label><Input value={editAlunoForm.rg || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, rg: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Data de nascimento</label><Input type="date" value={editAlunoForm.data_nascimento || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, data_nascimento: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div>
                      <label className="text-xs text-muted-foreground">Sexo</label>
                      <Select value={editAlunoForm.sexo || ''} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, sexo: v })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Masculino">Masculino</SelectItem>
                          <SelectItem value="Feminino">Feminino</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                          <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><label className="text-xs text-muted-foreground">Pais</label><Input value={editAlunoForm.pais || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, pais: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">CEP</label><Input value={editAlunoForm.cep || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, cep: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Cidade / Estado</label><Input value={editAlunoForm.cidade_estado || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, cidade_estado: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div className="col-span-2"><label className="text-xs text-muted-foreground">Endereco completo</label><Input value={editAlunoForm.endereco || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, endereco: e.target.value })} className="mt-1 h-8 text-sm" /></div>
                    <div>
                      <label className="text-xs text-muted-foreground">Origem</label>
                      <Select value={editAlunoForm.origem_lead || 'direto'} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, origem_lead: v, lancamento_id: v !== 'lancamento' ? '' : editAlunoForm.lancamento_id })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direto">Direto</SelectItem>
                          <SelectItem value="lancamento">Lançamento</SelectItem>
                          <SelectItem value="npa">NPA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {editAlunoForm.origem_lead === 'lancamento' && (
                      <div>
                        <label className="text-xs text-muted-foreground">Lançamento</label>
                        <Select value={editAlunoForm.lancamento_id || ''} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, lancamento_id: v })}>
                          <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Selecione o lançamento" /></SelectTrigger>
                          <SelectContent>
                            {lancamentos.map(l => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.nome}{l.data_live ? ` — ${new Date(l.data_live + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Observacoes (historico) */}
                {alunoDetail && (
                  <div>
                    <AlunoObservacoes
                      alunoId={alunoDetail.id}
                      onLoaded={list => {
                        setLatestObsTexto(list[0]?.texto || '');
                        const pendente = list.find(o => o.status === 'pendente')?.texto || '';
                        setObsPendentesPorAluno(prev => {
                          const next = { ...prev };
                          if (pendente) next[alunoDetail.id] = pendente;
                          else delete next[alunoDetail.id];
                          return next;
                        });
                      }}
                    />
                  </div>
                )}

                {/* Grupo e bonus */}
                {alunoDetail && (
                  <div>
                    <AlunoGruposBonus
                      aluno={{ id: alunoDetail.id, grupo_turma_confirmado_em: editAlunoForm.grupo_turma_confirmado_em ?? null }}
                      onGrupoTurmaChange={confirmadoEm => {
                        setEditAlunoForm(f => ({ ...f, grupo_turma_confirmado_em: confirmadoEm }));
                        setAlunos(prev => prev.map(a => a.id === alunoDetail.id ? { ...a, grupo_turma_confirmado_em: confirmadoEm } : a));
                      }}
                    />
                  </div>
                )}

                {/* Financeiro */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Financeiro</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Turma</label>
                      <Select value={editAlunoForm.turma_id || ''} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, turma_id: v })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{turmas.filter(t => t.produto === activeTab || t.tipo === activeTab).map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tipo de pagamento</label>
                      <Select value={editAlunoForm.tipo_pagamento || 'mensalidade'} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, tipo_pagamento: v as 'mensalidade' | 'bolsa' | 'cortesia' })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensalidade">Mensalidade</SelectItem>
                          <SelectItem value="bolsa">Bolsa de estudo</SelectItem>
                          <SelectItem value="cortesia">Cortesia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Forma de Pagamento</label>
                      <Select value={editAlunoForm.forma_pagamento || ''} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, forma_pagamento: v })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                  <SelectItem value="boleto">Boleto - 15 mensalidades</SelectItem>
                  <SelectItem value="cartao">Cartao - 1x (pagamento único)</SelectItem>
                  <SelectItem value="avista">A vista - 1/1</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Nº de parcelas</label>
                      <Input
                        type="number"
                        min="1"
                        value={editAlunoForm.total_mensalidades ?? ''}
                        onChange={e => setEditAlunoForm({ ...editAlunoForm, total_mensalidades: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder={String(paymentMethodTotal(editAlunoForm.forma_pagamento || 'boleto'))}
                        className="mt-1 h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Vazio = padrão do método. Salvar reagenda parcelas.</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Valor mensalidade (R$)</label>
                      <Input type="number" step="0.01" value={editAlunoForm.valor_mensalidade ?? ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, valor_mensalidade: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder={turmaAtual?.valor_mensalidade ? `Padrao: R$ ${turmaAtual.valor_mensalidade}` : 'Padrao da turma'} className="mt-1 h-8 text-sm" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Vazio = usa valor da turma. Salvar atualiza parcelas pendentes.</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Dia vencimento</label>
                      <Select value={String(editAlunoForm.dia_vencimento || 10)} onValueChange={v => setEditAlunoForm({ ...editAlunoForm, dia_vencimento: parseInt(v) })}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{[1,5,10,15,20,25,28,30].map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Ato de matricula / 1a parcela</label>
                      <Input type="date" value={editAlunoForm.data_matricula || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, data_matricula: e.target.value })} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Data da 2ª parcela</label>
                      <Input
                        type="date"
                        value={editAlunoForm.data_segunda_parcela || ''}
                        onChange={e => setEditAlunoForm({ ...editAlunoForm, data_segunda_parcela: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Parcelas 3, 4… calculadas mensalmente a partir desta data.</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Data de inicio da turma</label>
                      <Input type="date" value={editAlunoForm.data_inicio || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, data_inicio: e.target.value })} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Data fim</label>
                      <Input type="date" value={editAlunoForm.data_fim || ''} onChange={e => setEditAlunoForm({ ...editAlunoForm, data_fim: e.target.value })} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Parcelas calculadas</label>
                      <Input value={`${pagas}/${total || (editAlunoForm.total_mensalidades || paymentMethodTotal(editAlunoForm.forma_pagamento))}`} readOnly className="mt-1 h-8 text-sm bg-muted/50" />
                    </div>
                  </div>
                </div>

                {/* Parcelas */}
                {(() => {
                  const visiveisLocais = parcelasLocais.filter(p => !p.deleted);
                  const totalLocal = visiveisLocais.length;
                  const pagasLocal = visiveisLocais.filter(p => p.status === 'pago').length;
                  const recebidoLocal = visiveisLocais.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
                  const totalValorLocal = visiveisLocais.reduce((s, p) => s + p.valor, 0);

                  const enterEditMode = () => {
                    setParcelasLocais(parcelas.map(p => ({
                      id: p.id,
                      numero_parcela: p.numero_parcela,
                      valor: p.valor,
                      data_vencimento: p.data_vencimento?.split('T')[0] ?? '',
                      data_pagamento: p.data_pagamento ?? null,
                      status: p.status,
                      isNew: false,
                      deleted: false,
                    })));
                    setParcelasEditMode(true);
                  };

                  const addParcela = () => {
                    const existentes = parcelasLocais.filter(p => !p.deleted);
                    const lastNum = existentes.length > 0 ? Math.max(...existentes.map(p => p.numero_parcela)) : 0;
                    const lastDate = existentes.filter(p => p.data_vencimento).sort((a, b) => b.numero_parcela - a.numero_parcela)[0]?.data_vencimento ?? '';
                    const nextDate = (() => {
                      if (!lastDate) return '';
                      const d = new Date(lastDate + 'T12:00:00');
                      d.setMonth(d.getMonth() + 1);
                      return formatLocalDate(d);
                    })();
                    const lastValor = existentes.filter(p => p.status !== 'pago').sort((a, b) => b.numero_parcela - a.numero_parcela)[0]?.valor ?? (existentes[0]?.valor ?? 0);
                    setParcelasLocais(prev => [...prev, {
                      id: `new_${Date.now()}`,
                      numero_parcela: lastNum + 1,
                      valor: lastValor,
                      data_vencimento: nextDate,
                      status: 'pendente',
                      isNew: true,
                      deleted: false,
                    }]);
                  };

                  const updateParcela = (id: string, field: 'valor' | 'data_vencimento', raw: string) => {
                    setParcelasLocais(prev => prev.map(p =>
                      p.id === id
                        ? { ...p, [field]: field === 'valor' ? (parseFloat(raw) || 0) : raw }
                        : p
                    ));
                  };

                  const deleteParcela = (id: string) => {
                    setParcelasLocais(prev => prev.map(p => p.id === id ? { ...p, deleted: true } : p));
                  };

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2 pt-1 border-t border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {parcelasEditMode
                            ? `Parcelas — editando (${totalLocal} total)`
                            : <>Parcelas — {total > 0 ? `${pagas}/${total} pagas` : 'nenhuma gerada'}{atrasadas > 0 && <span className="ml-2 text-red-600">- {atrasadas} em atraso</span>}</>
                          }
                        </p>
                        <div className="flex items-center gap-2">
                          {parcelasEditMode ? (
                            <>
                              <span className="text-xs text-muted-foreground">
                                Total: {formatCurrency(totalValorLocal)} · Recebido: {formatCurrency(recebidoLocal)}
                              </span>
                              <Button size="sm" variant="outline" onClick={addParcela} className="h-6 px-2 text-[10px] gap-1">
                                <Plus className="h-3 w-3" /> Parcela
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setParcelasEditMode(false)} className="h-6 px-2 text-[10px] text-muted-foreground">
                                Cancelar
                              </Button>
                              <Button size="sm" onClick={salvarParcelasManual} disabled={savingParcelas} className="h-6 px-2 text-[10px] bg-primary text-white">
                                {savingParcelas ? 'Salvando…' : 'Salvar parcelas'}
                              </Button>
                            </>
                          ) : (
                            <>
                              {total > 0 && valorEfetivo > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Total: {formatCurrency(valorEfetivo * total)} - Recebido: {formatCurrency(parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0))}
                                </span>
                              )}
                              <Button size="sm" variant="outline" onClick={enterEditMode} className="h-6 px-2 text-[10px] gap-1">
                                <Pencil className="h-3 w-3" /> Editar parcelas
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Aviso modo edição */}
                      {parcelasEditMode && (
                        <div className="mb-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                          Edite valor e vencimento de cada parcela. Parcelas pagas não podem ser alteradas. Clique <strong>Salvar parcelas</strong> para confirmar.
                        </div>
                      )}

                      {/* Tabela modo leitura */}
                      {!parcelasEditMode && (
                        total === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma parcela gerada. Adicione o aluno com forma de pagamento para gerar automaticamente.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-md border border-border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50">
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="text-left py-2 px-2 font-medium text-xs">No.</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Vencimento</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Pago em</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Valor</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Status</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Taxa</th>
                                  <th className="text-left py-2 px-2 font-medium text-xs">Previsão</th>
                                  <th className="text-left py-2 px-3 font-medium">Acoes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {parcelas.map(p => (
                                  <tr key={p.id} className={`border-b border-border/40 transition-colors ${p.status === 'atrasado' ? 'bg-red-50' : p.status === 'pago' ? 'bg-green-50/60' : 'hover:bg-muted/30'}`}>
                                    <td className="py-2 px-2 font-medium text-xs">{p.numero_parcela}/{total}</td>
                                    <td className="py-2 px-2 text-xs">{safeDate(p.data_vencimento)}</td>
                                    <td className="py-2 px-2 text-xs">
                                      {p.data_pagamento
                                        ? <span className="text-green-700 font-medium">{safeDate(p.data_pagamento)}</span>
                                        : <span className="text-muted-foreground">-</span>}
                                    </td>
                                    <td className="py-2 px-2 font-semibold text-xs">{formatCurrency(p.valor)}</td>
                                    <td className="py-2 px-2">
                                      <Badge className={`text-[10px] px-1.5 py-0.5 ${p.status === 'pago' ? 'bg-green-100 text-green-800' : p.status === 'atrasado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {p.status === 'pago' ? 'Pago' : p.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-2 text-xs text-muted-foreground">{p.canal_cobranca || '—'}</td>
                                    <td className="py-2 px-2 text-xs">
                                      {p.status === 'pago'
                                        ? <span className="text-red-600">−{formatCurrency(taxaDoPagamento({ ...p, forma_pagamento: alunoDetail?.forma_pagamento || 'boleto' }, taxasRates))}</span>
                                        : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="py-2 px-2">
                                      {isPagamentoInadimplente(p) ? (
                                        <PrevisaoPagamentoPopover
                                          valorAtual={p.data_prevista_pagamento ?? null}
                                          onSalvar={data => salvarPrevisaoPagamento(p.id, data)}
                                        />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2">
                                      {p.status === 'pago'
                                        ? <Button variant="ghost" size="sm" onClick={() => estornarPagamento(p.id, alunoDetail.id)} className="text-orange-500 hover:text-orange-700 h-6 px-2 text-[10px]">Estornar</Button>
                                        : <Button variant="ghost" size="sm" onClick={() => marcarComoPago(p.id, alunoDetail.id)} className="text-green-600 hover:text-green-800 h-6 px-2 text-[10px] font-semibold">Pago</Button>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}

                      {/* Tabela modo edição */}
                      {parcelasEditMode && (
                        <div className="overflow-x-auto rounded-md border border-border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr className="border-b border-border text-muted-foreground">
                                <th className="text-left py-2 px-2 font-medium text-xs">No.</th>
                                <th className="text-left py-2 px-2 font-medium text-xs">Vencimento</th>
                                <th className="text-left py-2 px-2 font-medium text-xs">Pago em</th>
                                <th className="text-left py-2 px-2 font-medium text-xs">Valor (R$)</th>
                                <th className="text-left py-2 px-2 font-medium text-xs">Status</th>
                                <th className="text-left py-2 px-2 font-medium text-xs w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {visiveisLocais.map((p, idx) => (
                                <tr key={p.id} className={`border-b border-border/40 ${p.status === 'pago' ? 'bg-green-50/60' : 'bg-white'}`}>
                                  <td className="py-1.5 px-2 text-xs font-medium text-muted-foreground">{idx + 1}/{totalLocal}</td>
                                  <td className="py-1.5 px-2">
                                    {p.status === 'pago'
                                      ? <span className="text-xs text-muted-foreground">{safeDate(p.data_vencimento)}</span>
                                      : <input
                                          type="date"
                                          value={p.data_vencimento}
                                          onChange={e => updateParcela(p.id, 'data_vencimento', e.target.value)}
                                          className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-32"
                                        />
                                    }
                                  </td>
                                  <td className="py-1.5 px-2 text-xs">
                                    {p.data_pagamento
                                      ? <span className="text-green-700 font-medium">{safeDate(p.data_pagamento)}</span>
                                      : <span className="text-muted-foreground">-</span>}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    {p.status === 'pago'
                                      ? <span className="text-xs font-semibold">{formatCurrency(p.valor)}</span>
                                      : <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={p.valor}
                                          onChange={e => updateParcela(p.id, 'valor', e.target.value)}
                                          className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-24"
                                        />
                                    }
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <Badge className={`text-[10px] px-1.5 py-0.5 ${p.status === 'pago' ? 'bg-green-100 text-green-800' : p.status === 'atrasado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                      {p.status === 'pago' ? 'Pago' : p.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 px-2">
                                    {p.status !== 'pago' && (
                                      <button
                                        onClick={() => deleteParcela(p.id)}
                                        className="text-muted-foreground hover:text-red-500 transition-colors"
                                        title="Remover parcela"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {visiveisLocais.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma parcela. Clique em "+ Parcela" para adicionar.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />Histórico de Cobranças
                  </p>
                  {loadingCobrancaLogsAluno ? (
                    <p className="text-xs text-muted-foreground py-2">Carregando...</p>
                  ) : cobrancaLogsAluno.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Nenhuma cobrança enviada para este aluno ainda.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left py-1.5 px-2 font-medium">Quando</th>
                            <th className="text-left py-1.5 px-2 font-medium">Template</th>
                            <th className="text-left py-1.5 px-2 font-medium">Status</th>
                            <th className="text-left py-1.5 px-2 font-medium">Resposta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cobrancaLogsAluno.map(log => (
                            <tr key={log.id} className="border-t border-border">
                              <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                                {new Date(log.enviado_em || log.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-1.5 px-2">
                                {log.template_nome}
                                {log.manual && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">Manual</Badge>}
                              </td>
                              <td className="py-1.5 px-2">
                                {log.status === 'enviado' && <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1 text-[10px]"><CheckCircle2 size={10} />Enviado</Badge>}
                                {log.status === 'erro' && <Badge className="bg-red-50 text-red-700 border border-red-200 gap-1 text-[10px]" title={log.erro_msg || ''}><XCircle size={10} />Erro</Badge>}
                                {log.status === 'pendente' && <Badge className="bg-amber-50 text-amber-700 border border-amber-200 gap-1 text-[10px]"><Clock size={10} />Pendente</Badge>}
                              </td>
                              <td className="py-1.5 px-2">
                                {log.respondeu_em ? (
                                  <div className="flex items-start gap-1 text-muted-foreground">
                                    <MessageSquare size={11} className="mt-0.5 shrink-0 text-violet-600" />
                                    <div>
                                      <p className="truncate max-w-[220px]">{log.ultima_resposta}</p>
                                      <p className="text-[10px]">{new Date(log.respondeu_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />Indicações feitas por {alunoDetail.nome.split(' ')[0]}
                  </p>
                  {loadingIndicadosAluno ? (
                    <p className="text-xs text-muted-foreground py-2">Carregando...</p>
                  ) : indicadosAluno.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Este aluno ainda não indicou ninguém pela Ficha de Matrícula.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left py-1.5 px-2 font-medium">Indicado(a)</th>
                            <th className="text-left py-1.5 px-2 font-medium">WhatsApp</th>
                            <th className="text-left py-1.5 px-2 font-medium">Status</th>
                            <th className="text-left py-1.5 px-2 font-medium">Quando</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indicadosAluno.map(ind => (
                            <tr key={ind.id} className="border-t border-border">
                              <td className="py-1.5 px-2 font-medium">{ind.nome}</td>
                              <td className="py-1.5 px-2 text-muted-foreground">{ind.whatsapp || ind.telefone || '—'}</td>
                              <td className="py-1.5 px-2">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ind.status || '—'}</Badge>
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                                {new Date(ind.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={downloadFichaPDF} className="mr-auto gap-1.5">
              <Download className="h-4 w-4" />Baixar PDF
            </Button>
            <Button variant="outline" onClick={() => setShowAlunoDetail(false)}>Fechar</Button>
            <Button onClick={saveAlunoDetail} disabled={savingAluno} className="bg-primary text-white"><CheckCircle2 className="h-4 w-4 mr-1" />{savingAluno ? 'Salvando...' : 'Salvar Alteracoes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Pagamento com Data */}
      <Dialog open={showPagoDialog} onOpenChange={setShowPagoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle><DialogDescription>Informe a data em que o pagamento foi realizado</DialogDescription></DialogHeader>
          <div>
            <label className="text-sm font-medium">Data do Pagamento</label>
            <Input type="date" value={pagoInfo?.data || ''} onChange={e => setPagoInfo(prev => prev ? { ...prev, data: e.target.value } : prev)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Canal de cobrança</label>
            <Select value={pagoInfo?.canal_cobranca || ''} onValueChange={v => setPagoInfo(prev => prev ? { ...prev, canal_cobranca: v } : prev)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="De onde veio esse pagamento?" /></SelectTrigger>
              <SelectContent>
                {canaisCobranca.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum canal cadastrado — crie em Configurações</div>
                )}
                {canaisCobranca.map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Opcional — a taxa já é calculada pelo método de pagamento.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPagoDialog(false)}>Cancelar</Button>
            <Button
              onClick={confirmarPago}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusao */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-destructive">Confirmar Exclusao</DialogTitle><DialogDescription>Tem certeza que deseja remover <strong>{alunoToDelete?.nome}</strong>? Todos os pagamentos vinculados serao excluidos.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteAluno}>Confirmar Exclusao</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
