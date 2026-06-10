/**
 * LancamentoWizard.tsx
 * Wizard multi-passo para criar/editar lançamentos e NPAs.
 * Configura tudo de uma vez: lancamento, kanban, funil, boas-vindas, grupos.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureDefaultLancamentoKanbanColumns } from '@/components/crm/kanban/useKanbanColunas';
import {
  WizardConfig, TemplateMensagem, AulaConfig, GrupoConfig,
  generateLancamentoMessages, buildFunnelVariaveis,
  defaultBoasVindasWpp, defaultBoasVindasEmail,
  defaultBoasVindasNpaManha, defaultBoasVindasNpaTarde, defaultPixTemplate,
} from '@/lib/lancamento-templates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Check, Loader2,
  AlertTriangle, Calendar, Users, MessageSquare, Zap, Eye, Settings,
  Upload, X, Smartphone, Search,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Turma {
  id: string; nome: string; produto: string;
  valor_mensalidade: number | null; dia_vencimento: number | null; total_mensalidades: number | null;
}
interface Responsavel { id: string; nome: string; }
interface EvoInstance { instance_name: string; api_url: string; api_key: string; }

interface LancamentoWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (id: string, tipo: 'lancamento' | 'npa') => void;
  /** Se fornecido, abre em modo edição */
  existingId?: string;
  existingTipo?: 'lancamento' | 'npa';
}

// ─── Config padrão ────────────────────────────────────────────────────────────

function defaultConfig(): WizardConfig {
  return {
    nome: '', tipo: 'lancamento',
    data_live: '', hora_live: '20:00',
    meta_leads: 0, meta_matriculas: 0, responsavel_id: '',
    turma_destino_id: '', produto_destino: 'psicanalise',
    valor_mensalidade_destino: 109.90, dia_vencimento_destino: 10,
    total_mensalidades_destino: 15,
    // quantidade_grupos = nº de grupos de LANÇAMENTO; grupo de oferta é sempre +1
    quantidade_grupos: 1,
    grupos: [
      { nickname: '', jid: '', link: '', participantes: [] }, // lançamento 1 / manhã
      { nickname: '', jid: '', link: '', participantes: [] }, // oferta / tarde
    ],
    instancia_evolution: '__priority__',
    aulas: [
      { data: '', hora: '20:00', link: '', professor: '' },
      { data: '', hora: '20:00', link: '', professor: '' },
      { data: '', hora: '20:00', link: '', professor: '' },
    ],
    links_extras: [{ key: 'link_checkout', value: '' }],
    bv_wpp_ativo: true, bv_wpp_mensagem: '',
    bv_wpp_mensagem_tarde: '', pix_mensagem_template: '',
    bv_email_ativo: false, bv_email_assunto: '', bv_email_corpo: '',
    bv_delay_minutos: 0,
  };
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Básico',      icon: Settings },
  { n: 2, label: 'Turma',       icon: Users },
  { n: 3, label: 'Grupos WPP',  icon: MessageSquare },
  { n: 4, label: 'Aulas',       icon: Calendar },
  { n: 5, label: 'Boas-Vindas', icon: Zap },
  { n: 6, label: 'Revisão',     icon: Eye },
];

function StepperBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6 overflow-x-auto">
      {STEPS.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              active ? 'bg-primary text-white' :
              done   ? 'bg-primary/15 text-primary' :
                       'bg-muted text-muted-foreground'
            }`}>
              {done
                ? <Check className="h-3 w-3" />
                : <s.icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-px mx-0.5 ${done ? 'bg-primary/40' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Informações Básicas ──────────────────────────────────────────────

function Step1({ config, setConfig, responsaveis }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
  responsaveis: Responsavel[];
}) {
  const set = (k: keyof WizardConfig, v: unknown) => setConfig(c => ({ ...c, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nome *</label>
          <Input value={config.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Lançamento #35" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <div className="flex gap-2">
            {(['lancamento', 'npa'] as const).map(t => (
              <button
                key={t}
                onClick={() => {
                  set('tipo', t);
                  // Ajusta aulas padrão conforme o tipo
                  setConfig(prev => {
                    if (t === 'lancamento' && prev.aulas.length < 3) {
                      const extras = Array.from({ length: 3 - prev.aulas.length }, () => ({
                        data: '', hora: '20:00', link: '', professor: '',
                      }));
                      return { ...prev, tipo: t, aulas: [...prev.aulas, ...extras] };
                    }
                    if (t === 'npa' && prev.aulas.length > 1) {
                      return { ...prev, tipo: t, aulas: [prev.aulas[0]] };
                    }
                    return { ...prev, tipo: t };
                  });
                }}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  config.tipo === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {t === 'lancamento' ? '🚀 Lançamento (3 aulas)' : '🎯 NPA (1 aula)'}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Responsável</label>
          <select
            value={config.responsavel_id}
            onChange={e => set('responsavel_id', e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Selecionar —</option>
            {responsaveis.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Meta de leads</label>
          <Input type="number" value={config.meta_leads || ''} onChange={e => set('meta_leads', Number(e.target.value))} placeholder="Ex: 500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Meta de matrículas</label>
          <Input type="number" value={config.meta_matriculas || ''} onChange={e => set('meta_matriculas', Number(e.target.value))} placeholder="Ex: 30" />
        </div>

        {config.tipo === 'npa' && (
          <div className="sm:col-span-2 space-y-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200">
            <div>
              <p className="text-xs font-semibold text-amber-900">Produtos Vega Checkout</p>
              <p className="text-[10px] text-amber-700 mt-0.5">
                Cole o nome exato do produto no Vega para cada turma. O webhook vai identificar automaticamente qual turma pagou e enviar o PIX ou boas-vindas.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-amber-900 uppercase tracking-wide">
                  ☀️ Produto Manhã
                </label>
                <Input
                  value={config.vega_produto_id ?? ''}
                  onChange={e => set('vega_produto_id', e.target.value)}
                  placeholder="Ex: INGRESSO SP - 30/05 - Turma Manha - ..."
                  className="h-9 text-xs font-mono bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-amber-900 uppercase tracking-wide">
                  🌆 Produto Tarde
                </label>
                <Input
                  value={config.vega_produto_tarde ?? ''}
                  onChange={e => set('vega_produto_tarde', e.target.value)}
                  placeholder="Ex: INGRESSO SP - 30/05 - Turma Tarde - ..."
                  className="h-9 text-xs font-mono bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Datas das lives ── */}
      <div className="pt-3 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">
            {config.tipo === 'lancamento' ? '📅 Datas das 3 lives' : '📅 Data do evento'}
          </label>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-muted-foreground">Horário padrão</label>
            <Input
              type="time"
              value={config.hora_live}
              onChange={e => {
                set('hora_live', e.target.value);
                // Propaga o horário para todas as aulas
                setConfig(c => ({
                  ...c,
                  hora_live: e.target.value,
                  aulas: c.aulas.map(a => a.hora === config.hora_live ? { ...a, hora: e.target.value } : a),
                }));
              }}
              className="h-7 w-24 text-xs"
            />
          </div>
        </div>

        <div className={`grid gap-3 ${config.tipo === 'lancamento' ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {config.aulas.map((aula, i) => (
            <div key={i} className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {config.tipo === 'lancamento' ? `Aula ${i + 1}` : 'Dia do evento'}
              </label>
              <Input
                type="date"
                value={aula.data}
                onChange={e => {
                  const newData = e.target.value;
                  setConfig(c => ({
                    ...c,
                    // Aula 1 auto-preenche data_live (âncora de scheduling)
                    data_live: i === 0 ? newData : c.data_live,
                    aulas: c.aulas.map((a, idx) =>
                      idx === i ? { ...a, data: newData } : a,
                    ),
                  }));
                }}
                className="h-9 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          💡 Essas datas são marcadas automaticamente no calendário ao salvar.
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: Turma Destino ────────────────────────────────────────────────────

function Step2({ config, setConfig, turmas, setTurmas }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
  turmas: Turma[];
  setTurmas: React.Dispatch<React.SetStateAction<Turma[]>>;
}) {
  const set = (k: keyof WizardConfig, v: unknown) => setConfig(c => ({ ...c, [k]: v }));

  // ── inline "criar turma" ───────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [newTurma, setNewTurma]     = useState({
    nome: '', produto: 'psicanalise', valor_mensalidade: 109.90, total_mensalidades: 15,
  });

  const handleTurmaSelect = (id: string) => {
    const t = turmas.find(x => x.id === id);
    setConfig(c => ({
      ...c,
      turma_destino_id: id,
      produto_destino: t?.produto ?? c.produto_destino,
      valor_mensalidade_destino: t?.valor_mensalidade ?? c.valor_mensalidade_destino,
      dia_vencimento_destino: t?.dia_vencimento ?? c.dia_vencimento_destino,
      total_mensalidades_destino: t?.total_mensalidades ?? c.total_mensalidades_destino,
    }));
  };

  const salvarNovaTurma = async () => {
    if (!newTurma.nome.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('turmas')
        .insert({
          nome: newTurma.nome.trim(),
          tipo: newTurma.produto,   // coluna NOT NULL — mesmo valor que produto
          produto: newTurma.produto,
          valor_mensalidade: newTurma.valor_mensalidade,
          total_mensalidades: newTurma.total_mensalidades,
        })
        .select('id, nome, produto, valor_mensalidade, dia_vencimento, total_mensalidades')
        .single();

      if (error) throw error;

      const criada = data as Turma;
      setTurmas(prev => [...prev, criada].sort((a, b) => a.nome.localeCompare(b.nome)));
      handleTurmaSelect(criada.id);
      setShowCreate(false);
      setNewTurma({ nome: '', produto: 'psicanalise', valor_mensalidade: 109.90, total_mensalidades: 15 });
    } catch (e: any) {
      toast.error('Erro ao criar turma: ' + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Defina para qual turma os leads matriculados neste lançamento serão enviados automaticamente.
      </p>

      {/* ── Seletor de turma ── */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Turma destino *</label>
        <select
          value={config.turma_destino_id}
          onChange={e => handleTurmaSelect(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Selecionar turma —</option>
          {turmas.map(t => <option key={t.id} value={t.id}>{t.nome} ({t.produto})</option>)}
        </select>

        {/* Botão criar nova turma */}
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Criar nova turma
          </button>
        )}
      </div>

      {/* ── Mini-form de criação inline ── */}
      {showCreate && (
        <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Nova turma</p>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Nome *</label>
            <Input
              value={newTurma.nome}
              onChange={e => setNewTurma(p => ({ ...p, nome: e.target.value }))}
              placeholder="Ex: Turma #02526"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Produto</label>
              <select
                value={newTurma.produto}
                onChange={e => setNewTurma(p => ({ ...p, produto: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="psicanalise">Psicanálise</option>
                <option value="numerologia">Numerologia</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor mensalidade (R$)</label>
              <Input
                type="number" step="0.01"
                value={newTurma.valor_mensalidade}
                onChange={e => setNewTurma(p => ({ ...p, valor_mensalidade: Number(e.target.value) }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Total de parcelas</label>
              <Input
                type="number" min={1}
                value={newTurma.total_mensalidades}
                onChange={e => setNewTurma(p => ({ ...p, total_mensalidades: Number(e.target.value) }))}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={salvarNovaTurma}
            disabled={saving || !newTurma.nome.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
              : <><Check className="h-4 w-4" /> Criar e selecionar turma</>}
          </button>
        </div>
      )}

      {/* ── Campos editáveis pós-seleção ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Produto</label>
          <select
            value={config.produto_destino}
            onChange={e => set('produto_destino', e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="psicanalise">Psicanálise</option>
            <option value="numerologia">Numerologia</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Valor mensalidade (R$)</label>
          <Input type="number" step="0.01" value={config.valor_mensalidade_destino || ''} onChange={e => set('valor_mensalidade_destino', Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Total de parcelas</label>
          <Input type="number" min={1} value={config.total_mensalidades_destino || ''} onChange={e => set('total_mensalidades_destino', Number(e.target.value))} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        💡 O dia de vencimento é escolhido individualmente por cada aluno no momento da matrícula.
      </p>

      {config.turma_destino_id && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          ✅ Configurado: R$ {config.valor_mensalidade_destino?.toFixed(2).replace('.', ',')} × {config.total_mensalidades_destino}x
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Grupos WhatsApp ──────────────────────────────────────────────────

/** Converte File para base64 puro (sem prefixo data:...) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Step3({ config, setConfig, evoInstances, existingId }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
  evoInstances: EvoInstance[];
  existingId?: string;
}) {
  const STORAGE_KEY = 'evo_default_participants';

  const [criando, setCriando] = useState<Record<number, boolean>>({});
  const [erros, setErros]     = useState<Record<number, string>>({});
  const [fotoFiles, setFotoFiles] = useState<Record<number, File | null>>({});
  const [gerandoFoto, setGerandoFoto] = useState<Record<number, boolean>>({});
  const [fotoGeradaUrl, setFotoGeradaUrl] = useState<Record<number, string>>({});
  const [aplicandoFoto, setAplicandoFoto] = useState<Record<number, boolean>>({});
  // Inicia partInputs com os números padrão salvos (mesmo valor para todos os grupos)
  const [partInputs, setPartInputs] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? '';
      return { 0: saved, 1: saved, 2: saved };
    } catch { return {}; }
  });
  const [fetchedGroups, setFetchedGroups] = useState<Record<number, Array<{id: string; subject: string; size?: number}>>>({});
  const [fetchingGroups, setFetchingGroups] = useState<Record<number, boolean>>({});

  // qtd = nº de grupos de LANÇAMENTO; total de grupos = qtd + 1 (oferta sempre presente)
  // NPA: sempre 2 grupos (manhã + tarde)
  const qtd = config.quantidade_grupos ?? 1;
  const totalGrupos = config.tipo === 'npa' ? 2 : qtd + 1;

  const fetchGroups = async (cardIdx: number) => {
    const evo = config.instancia_evolution !== '__priority__'
      ? evoInstances.find(e => e.instance_name === config.instancia_evolution)
      : evoInstances[0];
    if (!evo) { toast.error('Nenhuma instância Evolution ativa'); return; }
    setFetchingGroups(p => ({ ...p, [cardIdx]: true }));
    try {
      const rawBase = evo.api_url.replace(/\/$/, '');
      const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      const url = `${base}/group/fetchAllGroups/${evo.instance_name}?getParticipants=false`;
      const res = await fetch(url, { headers: { apikey: evo.api_key } });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        toast.error(`API retornou ${res.status}: ${errText.slice(0, 120)}`);
        return;
      }

      const rawText = await res.text();
      let data: unknown;
      try { data = JSON.parse(rawText); } catch { toast.error('Resposta inválida da API'); return; }

      // Suporta múltiplos formatos da Evolution API
      const list: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as Record<string, unknown>)?.groups)
          ? (data as Record<string, unknown[]>).groups
          : [];

      const groups = list
        .map((g: unknown) => {
          const r = g as Record<string, unknown>;
          const id = String(r.id ?? r.remoteJid ?? r.jid ?? '');
          return {
            id,
            subject: String(r.subject ?? r.name ?? id ?? ''),
            size: Number(r.size ?? (r.participants as unknown[])?.length ?? 0),
          };
        })
        .filter(g => g.id.includes('@g.us'))
        .sort((a, b) => a.subject.localeCompare(b.subject));

      if (groups.length === 0) {
        toast.warning('Nenhum grupo encontrado nesta instância');
      } else {
        toast.success(`${groups.length} grupo(s) encontrado(s)`);
      }
      setFetchedGroups(p => ({ ...p, [cardIdx]: groups }));
    } catch (e: unknown) {
      toast.error('Erro ao buscar grupos: ' + (e as Error).message);
    } finally {
      setFetchingGroups(p => ({ ...p, [cardIdx]: false }));
    }
  };

  const setQtd = (n: 1 | 2) => {
    setConfig(c => {
      const novos = [...c.grupos];
      const total = n + 1; // n lançamento + 1 oferta
      // Garante que temos slots suficientes
      while (novos.length < total) novos.push({ nickname: '', jid: '', participantes: [] });
      // Ao reduzir de 2→1: remove o segundo grupo de lançamento (índice 1),
      // mantém lançamento-1 (índice 0) e oferta (último)
      if (n === 1 && novos.length > 2) {
        novos.splice(1, novos.length - 2); // deixa só [0] + [ultimo]
      }
      return { ...c, quantidade_grupos: n, grupos: novos.slice(0, total) };
    });
  };

  const updateGrupo = (i: number, field: keyof GrupoConfig, val: string) =>
    setConfig(c => ({ ...c, grupos: c.grupos.map((g, idx) => idx === i ? { ...g, [field]: val } : g) }));

  const parseNumeros = (raw: string) =>
    raw.split(/[\n,;]+/).map(p => p.trim().replace(/\D/g, '')).filter(p => p.length >= 10);

  const criarGrupo = async (i: number) => {
    const grupo = config.grupos[i];
    if (!grupo?.nickname?.trim()) return;

    setCriando(p => ({ ...p, [i]: true }));
    setErros(p => ({ ...p, [i]: '' }));

    try {
      let photo_base64: string | undefined;
      const fotoFile = fotoFiles[i];
      if (fotoFile) photo_base64 = await fileToBase64(fotoFile);

      const participants = parseNumeros(partInputs[i] ?? '');

      const instName = config.instancia_evolution !== '__priority__'
        ? config.instancia_evolution
        : undefined;

      const { data, error } = await supabase.functions.invoke('evo-criar-grupo', {
        body: { subject: grupo.nickname.trim(), instance_name: instName, participants, photo_base64 },
      });

      if (error || data?.error) throw new Error(error?.message ?? data?.error);

      updateGrupo(i, 'jid', data.jid);
      // salva participantes no config também
      setConfig(c => ({
        ...c,
        grupos: c.grupos.map((g, idx) =>
          idx === i ? { ...g, participantes: participants } : g,
        ),
      }));
    } catch (e: any) {
      setErros(p => ({ ...p, [i]: e.message ?? 'Erro ao criar grupo' }));
    } finally {
      setCriando(p => ({ ...p, [i]: false }));
    }
  };

  // Label/emoji/varname dinâmicos por posição
  const isNpa = config.tipo === 'npa';
  const getLabel   = (i: number) => isNpa
    ? (i === 0 ? 'Manhã ☀️' : 'Tarde 🌆')
    : (i === qtd ? 'Oferta' : qtd === 1 ? 'Lançamento' : `Lançamento ${i + 1}`);
  const getEmoji   = (i: number) => isNpa ? (i === 0 ? '☀️' : '🌆') : (i === qtd ? '🎯' : '🚀');
  const getVarName = (i: number) => `{{grupo_${i + 1}}}`;

  return (
    <div className="space-y-5">
      {/* ── Toggle: quantos grupos de lançamento (apenas para Lançamento) ── */}
      {!isNpa && (
        <div className="space-y-2">
          <div>
            <label className="text-sm font-medium">Grupos de lançamento</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              O grupo de oferta <strong>sempre</strong> é criado. Escolha quantos grupos de lançamento você quer.
            </p>
          </div>
          <div className="flex gap-2">
            {([1, 2] as const).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setQtd(n)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  qtd === n
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {n === 1
                  ? '1 lançamento + oferta  (2 total)'
                  : '2 lançamentos + oferta  (3 total)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cabeçalho NPA ── */}
      {isNpa && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          💡 NPA usa <strong>2 grupos separados</strong>: um para a turma Manhã e outro para a Tarde. Cada grupo recebe mensagens e PIX de ingresso independentes.
        </div>
      )}

      {/* ── Instância Evolution ── */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Instância Evolution
        </label>
        <select
          value={config.instancia_evolution}
          onChange={e => setConfig(c => ({ ...c, instancia_evolution: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="__priority__">Automático (por prioridade)</option>
          {evoInstances.map(inst => (
            <option key={inst.instance_name} value={inst.instance_name}>{inst.instance_name}</option>
          ))}
        </select>
      </div>

      {/* ── Cards de grupo (totalGrupos = qtd lançamento + 1 oferta) ── */}
      {Array.from({ length: totalGrupos }).map((_, i) => {
        const grupo    = config.grupos[i] ?? { nickname: '', jid: '', participantes: [] };
        const hasLink  = !!(grupo.link && grupo.link.includes('chat.whatsapp.com/'));
        const isCriado = !!grupo.jid || hasLink;  // link sozinho é suficiente
        const isLoading = criando[i] ?? false;
        const erro     = erros[i] ?? '';
        const fotoFile = fotoFiles[i] ?? null;
        const numCount = parseNumeros(partInputs[i] ?? '').length;
        const label    = getLabel(i);
        const emoji    = getEmoji(i);
        const varName  = getVarName(i);

        return (
          <div
            key={i}
            className={`rounded-2xl border p-4 space-y-4 transition-all ${
              isCriado ? 'border-green-300 bg-green-50/60' : 'border-border bg-card'
            }`}
          >
            {/* Cabeçalho do card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                  isCriado ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary'
                }`}>
                  {isCriado ? <Check className="h-4 w-4" /> : emoji}
                </span>
                <div>
                  <p className="text-sm font-semibold">Grupo de {label}</p>
                  <p className="text-[10px] text-muted-foreground">{varName}</p>
                </div>
              </div>
              {grupo.jid ? (
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                  <Check className="h-3 w-3" /> Criado
                </span>
              ) : hasLink ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                  <Check className="h-3 w-3" /> Link configurado
                </span>
              ) : (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">⏳ Pendente</span>
              )}
            </div>

            {/* Nome do grupo */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Nome do grupo</label>
              <Input
                value={grupo.nickname}
                onChange={e => updateGrupo(i, 'nickname', e.target.value)}
                placeholder={`Ex: ${config.nome || 'Turma 37'} – ${label}`}
                className="h-9 text-sm"
                disabled={isCriado}
              />
            </div>

            {/* Link de convite */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Link de convite <span className="normal-case text-muted-foreground/60">(chat.whatsapp.com/...)</span>
              </label>
              <Input
                value={grupo.link ?? ''}
                onChange={e => updateGrupo(i, 'link', e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="h-9 text-sm"
              />
            </div>

            {/* Buscar / criar grupo — mostra se não tem JID ainda */}
            {!grupo.jid && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {hasLink ? 'vincular JID (opcional)' : 'selecionar grupo existente'}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <button
                  type="button"
                  onClick={() => fetchGroups(i)}
                  disabled={fetchingGroups[i] || evoInstances.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary disabled:opacity-50 transition-colors"
                >
                  {fetchingGroups[i]
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando grupos...</>
                    : <><Search className="h-3.5 w-3.5" /> Buscar grupos do WhatsApp</>}
                </button>
                {fetchedGroups[i]?.length > 0 && (
                  <select
                    onChange={e => {
                      if (!e.target.value) return;
                      const g = fetchedGroups[i].find(x => x.id === e.target.value);
                      if (!g) return;
                      updateGrupo(i, 'jid', g.id);
                      if (!grupo.nickname?.trim()) updateGrupo(i, 'nickname', g.subject);
                    }}
                    defaultValue=""
                    className="w-full px-3 py-2 rounded-lg border border-primary/40 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Selecionar grupo —</option>
                    {fetchedGroups[i].map(g => (
                      <option key={g.id} value={g.id}>
                        {g.subject}{g.size ? ` (${g.size} membros)` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {!hasLink && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">ou criar novo</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
              </div>
            )}

            {/* Participantes — só mostra quando vai criar novo grupo (sem link e sem JID) */}
            {!hasLink && <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Smartphone className="h-3 w-3" />
                Participantes a adicionar (um número por linha, com DDI+DDD)
              </label>
              <textarea
                value={partInputs[i] ?? ''}
                onChange={e => setPartInputs(p => ({ ...p, [i]: e.target.value }))}
                placeholder={"5511999990001\n5521988880002\n5531977770003"}
                rows={4}
                disabled={isCriado}
                className="w-full px-3 py-2 rounded-lg border border-border text-xs font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60 leading-relaxed"
              />
              <div className="flex items-center justify-between">
                {numCount > 0 ? (
                  <p className="text-[10px] text-primary font-medium">
                    ✓ {numCount} número{numCount !== 1 ? 's' : ''} válido{numCount !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 font-medium">
                    ⚠ Pelo menos 1 número obrigatório
                  </p>
                )}
                {numCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem(STORAGE_KEY, partInputs[i] ?? '');
                        // Propaga para os outros grupos também
                        setPartInputs(p => {
                          const next = { ...p };
                          Object.keys(next).forEach(k => { if (Number(k) !== i) next[Number(k)] = partInputs[i] ?? ''; });
                          return next;
                        });
                        toast.success('Números salvos como padrão para próximos grupos ✓');
                      } catch {}
                    }}
                    className="text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                  >
                    💾 Salvar como padrão
                  </button>
                )}
              </div>
            </div>}

            {/* Foto do grupo — só quando vai criar novo grupo */}
            {!hasLink && <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Foto do grupo</label>
              {fotoFile ? (
                <div className="flex items-center gap-3 p-2 border border-border rounded-lg bg-muted/30">
                  <img
                    src={URL.createObjectURL(fotoFile)}
                    alt="preview"
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{fotoFile.name}</span>
                  {!isCriado && (
                    <button
                      type="button"
                      onClick={() => setFotoFiles(p => ({ ...p, [i]: null }))}
                      className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <label className={`flex items-center gap-2 px-3 py-3 border border-dashed rounded-lg text-sm text-muted-foreground transition-colors cursor-pointer ${
                  isCriado ? 'opacity-50 pointer-events-none' : 'hover:border-primary/50 hover:text-primary border-border'
                }`}>
                  <Upload className="h-4 w-4" />
                  <span>Clique para enviar a foto do grupo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isCriado}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setFotoFiles(p => ({ ...p, [i]: f }));
                    }}
                  />
                </label>
              )}
            </div>}

            {/* Gerar foto com IA */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">foto com IA</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {fotoGeradaUrl[i] ? (
                <div className="space-y-2">
                  <img
                    src={fotoGeradaUrl[i]}
                    alt="Foto gerada"
                    className="w-full rounded-xl border border-border object-cover aspect-square"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFotoGeradaUrl(p => ({ ...p, [i]: '' }))}
                      className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-red-300 hover:text-red-600 transition-colors"
                    >
                      Descartar
                    </button>
                    {grupo.jid && (
                      <button
                        type="button"
                        disabled={aplicandoFoto[i]}
                        onClick={async () => {
                          const evo = config.instancia_evolution !== '__priority__'
                            ? evoInstances.find(e => e.instance_name === config.instancia_evolution)
                            : evoInstances[0];
                          if (!evo) { toast.error('Nenhuma instância Evolution ativa'); return; }
                          setAplicandoFoto(p => ({ ...p, [i]: true }));
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
                          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
                          try {
                            const res = await fetch(`${supabaseUrl}/functions/v1/gerar-foto-grupo`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
                              body: JSON.stringify({
                                mode: 'apply',
                                lancamento_id: 'wizard',
                                tipo: config.tipo,
                                foto_url: fotoGeradaUrl[i],
                                grupo_jid: grupo.jid,
                                api_url: evo.api_url,
                                api_key: evo.api_key,
                                instance_name: evo.instance_name,
                              }),
                            });
                            const data = await res.json();
                            if (data.ok) toast.success('Foto aplicada no grupo!');
                            else toast.error(data.error || 'Erro ao aplicar foto');
                          } catch { toast.error('Erro ao aplicar foto'); }
                          setAplicandoFoto(p => ({ ...p, [i]: false }));
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        {aplicandoFoto[i] ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {aplicandoFoto[i] ? 'Aplicando...' : '📱 Aplicar no grupo'}
                      </button>
                    )}
                  </div>
                </div>
              ) : existingId ? (
                <button
                  type="button"
                  disabled={gerandoFoto[i]}
                  onClick={async () => {
                    setGerandoFoto(p => ({ ...p, [i]: true }));
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
                    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
                    try {
                      const res = await fetch(`${supabaseUrl}/functions/v1/gerar-foto-grupo`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
                        body: JSON.stringify({
                          mode: 'generate',
                          lancamento_id: existingId,
                          tipo: config.tipo,
                          turma_nome: config.nome || 'Turma',
                          produto: config.produto_destino,
                          data_evento: config.aulas[0]?.data || undefined,
                        }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        setFotoGeradaUrl(p => ({ ...p, [i]: data.url }));
                        toast.success('Foto gerada e salva!');
                      } else {
                        toast.error(data.error || 'Erro ao gerar foto');
                      }
                    } catch { toast.error('Erro ao gerar foto'); }
                    setGerandoFoto(p => ({ ...p, [i]: false }));
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-purple-300 text-sm text-purple-600 hover:border-purple-400 hover:bg-purple-50/50 disabled:opacity-50 transition-colors font-medium"
                >
                  {gerandoFoto[i]
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando com DALL-E (~30s)...</>
                    : <>✨ Gerar foto do grupo com IA</>}
                </button>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-2">
                  Salve o lançamento uma vez para habilitar a geração de foto com IA.
                </p>
              )}
            </div>

            {/* JID exibido após criação */}
            {grupo.jid && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-100 border border-green-200 rounded-lg">
                <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <span className="text-[11px] text-green-800 font-mono truncate flex-1">{grupo.jid}</span>
                <button
                  type="button"
                  onClick={() => updateGrupo(i, 'jid', '')}
                  className="text-green-600 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Remover JID"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Aviso link sem JID */}
            {hasLink && !grupo.jid && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700">Link salvo. Para verificar automaticamente quem entrou no grupo, selecione o JID via "Buscar grupos do WhatsApp".</p>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{erro}</p>
              </div>
            )}

            {/* Botão criar — só quando não tem link nem JID */}
            {!isCriado && !hasLink && (
              <button
                type="button"
                onClick={() => criarGrupo(i)}
                disabled={isLoading || !grupo.nickname?.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Criando grupo...</>
                ) : (
                  <><MessageSquare className="h-4 w-4" /> Criar grupo no WhatsApp</>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 4: Aulas e Links ────────────────────────────────────────────────────

function Step4({ config, setConfig }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
}) {
  // profInputs: um campo de texto temporário por aula para digitar novo professor
  const [profInputs, setProfInputs] = useState<Record<number, string>>({});

  const updateAula = (i: number, field: keyof AulaConfig, val: string) =>
    setConfig(c => ({ ...c, aulas: c.aulas.map((a, idx) => idx === i ? { ...a, [field]: val } : a) }));

  const addAula = () =>
    setConfig(c => ({ ...c, aulas: [...c.aulas, { data: '', hora: '20:00', link: '', professor: '' }] }));

  const removeAula = (i: number) =>
    setConfig(c => ({ ...c, aulas: c.aulas.filter((_, idx) => idx !== i) }));

  /** Retorna lista de professores da aula i */
  const getProfessores = (i: number) =>
    config.aulas[i]?.professor
      ? config.aulas[i].professor.split(',').map(p => p.trim()).filter(Boolean)
      : [];

  /** Adiciona professor pelo input temporário */
  const commitProfessor = (aulaIdx: number) => {
    const nome = (profInputs[aulaIdx] ?? '').trim();
    if (!nome) return;
    const atual = getProfessores(aulaIdx);
    if (!atual.includes(nome)) {
      updateAula(aulaIdx, 'professor', [...atual, nome].join(', '));
    }
    setProfInputs(p => ({ ...p, [aulaIdx]: '' }));
  };

  /** Remove professor pelo índice dentro da lista */
  const removeProfessor = (aulaIdx: number, profIdx: number) => {
    const atual = getProfessores(aulaIdx);
    atual.splice(profIdx, 1);
    updateAula(aulaIdx, 'professor', atual.join(', '));
  };

  const updateLink = (i: number, field: 'key' | 'value', val: string) =>
    setConfig(c => ({ ...c, links_extras: c.links_extras.map((l, idx) => idx === i ? { ...l, [field]: val } : l) }));

  const addLink = () =>
    setConfig(c => ({ ...c, links_extras: [...c.links_extras, { key: '', value: '' }] }));

  const removeLink = (i: number) =>
    setConfig(c => ({ ...c, links_extras: c.links_extras.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-5">
      {/* Aulas */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Aulas ao vivo</h3>
        {config.aulas.map((a, i) => {
          const professores = getProfessores(i);
          return (
          <div key={i} className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary">Aula {i + 1}</span>
              {config.aulas.length > 1 && (
                <button onClick={() => removeAula(i)} className="text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Título da aula */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Nome/Título da aula <span className="text-muted-foreground/50">(opcional)</span>
              </label>
              <Input
                placeholder={`Ex: O Despertar, A Cura, A Revelação…`}
                value={a.titulo ?? ''}
                onChange={e => updateAula(i, 'titulo', e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Data (read-only, definida no Step 1) + Horário */}
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Horário</label>
                <Input type="time" value={a.hora} onChange={e => updateAula(i, 'hora', e.target.value)} className="h-8 text-sm" />
              </div>
              {a.data ? (
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Data (Step 1)</label>
                  <div className="h-8 flex items-center px-3 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    {new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ) : (
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Data</label>
                  <div className="h-8 flex items-center px-3 rounded-md border border-dashed border-border text-xs text-muted-foreground/60">
                    ← definir no Step 1
                  </div>
                </div>
              )}
            </div>

            {/* Professores — chips + input */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Professor(es) — <span className="text-primary font-medium">{'{{professor_' + (i + 1) + '}}'}</span>
              </label>

              {/* Chips dos professores adicionados */}
              {professores.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {professores.map((p, pi) => (
                    <span
                      key={pi}
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium"
                    >
                      {p}
                      <button
                        type="button"
                        onClick={() => removeProfessor(i, pi)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Input para adicionar novo professor */}
              <div className="flex gap-1.5">
                <Input
                  value={profInputs[i] ?? ''}
                  onChange={e => setProfInputs(p => ({ ...p, [i]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitProfessor(i); }
                  }}
                  placeholder={professores.length === 0 ? 'Nome do professor' : '+ Outro professor'}
                  className="h-8 text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={() => commitProfessor(i)}
                  disabled={!(profInputs[i] ?? '').trim()}
                  className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Pressione Enter ou clique + para adicionar</p>
            </div>

            {/* Link da aula */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Link da aula → {'{{link_aula_' + (i + 1) + '}}'}</label>
              <Input value={a.link} onChange={e => updateAula(i, 'link', e.target.value)} placeholder="https://..." className="h-8 text-sm" />
            </div>
          </div>
          );
        })}
        {config.aulas.length < 5 && (
          <button onClick={addAula} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
            <Plus className="h-4 w-4" /> Adicionar aula
          </button>
        )}
      </div>

      {/* Links extras */}
      <div className="space-y-3 pt-3 border-t border-border">
        <h3 className="text-sm font-semibold">Links extras (variáveis customizadas)</h3>
        <p className="text-xs text-muted-foreground">Cada linha cria uma variável {'{{chave}}'} usável nas mensagens.</p>
        {config.links_extras.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={l.key}
              onChange={e => updateLink(i, 'key', e.target.value.replace(/\s/g, '_').toLowerCase())}
              placeholder="link_checkout"
              className="h-8 text-sm w-36 font-mono flex-shrink-0"
            />
            <span className="text-muted-foreground text-xs flex-shrink-0">→ {'{{' + l.key + '}}'}</span>
            <Input
              value={l.value}
              onChange={e => updateLink(i, 'value', e.target.value)}
              placeholder="https://..."
              className="h-8 text-sm flex-1"
            />
            <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-red-500 flex-shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={addLink} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
          <Plus className="h-4 w-4" /> Adicionar link
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Boas-Vindas ──────────────────────────────────────────────────────

function WppTemplateCard({
  title, subtitle, badge, bgColor, borderColor, headerColor, badgeColor, emoji,
  vars, template, onChange, placeholder,
}: {
  title: string; subtitle: string; badge: string;
  bgColor: string; borderColor: string; headerColor: string; badgeColor: string; emoji: string;
  vars: string[]; template: string; onChange: (v: string) => void; placeholder: string;
}) {
  const preview = template
    .replace(/\{\{nome\}\}/g, 'Maria Silva')
    .replace(/\{\{evento_nome\}\}/g, 'NPA #14 Santos')
    .replace(/\{\{data_evento\}\}/g, '14/06/2025')
    .replace(/\{\{turma\}\}/g, 'Manhã')
    .replace(/\{\{link_grupo_manha\}\}/g, 'https://chat.whatsapp.com/exemplo')
    .replace(/\{\{link_grupo_tarde\}\}/g, 'https://chat.whatsapp.com/exemplo2')
    .replace(/\{\{link_grupo\}\}/g, 'https://chat.whatsapp.com/exemplo');

  return (
    <div className={`rounded-xl border-2 ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${headerColor} border-b ${borderColor}`}>
        <span className="text-lg">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{title}</p>
          <p className="text-xs opacity-75 truncate">{subtitle}</p>
        </div>
        <span className={`flex-shrink-0 text-xs ${badgeColor} px-2 py-0.5 rounded-full font-medium font-mono`}>{badge}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {vars.map(v => (
            <button key={v} type="button" onClick={() => onChange(template + v)}
              className="text-xs px-2 py-0.5 rounded-full bg-white border border-border text-muted-foreground hover:border-primary hover:text-primary font-mono transition-colors">
              {v}
            </button>
          ))}
        </div>
        <textarea
          className="w-full h-36 text-sm font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          value={template}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {template && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Prévia (WhatsApp):</p>
            <div className="bg-[#e5ddd5] rounded-lg p-3 max-h-40 overflow-y-auto">
              <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-[85%] ml-auto">
                <p className="text-sm whitespace-pre-wrap text-gray-800">{preview}</p>
                <p className="text-[10px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step5({ config, setConfig }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
}) {
  const set = (k: keyof WizardConfig, v: unknown) => setConfig(c => ({ ...c, [k]: v }));

  // ── NPA: 3 templates automáticos ──────────────────────────────────────────
  if (config.tipo === 'npa') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-lg flex-shrink-0">🤖</span>
          <div>
            <p className="text-sm font-semibold text-blue-900">Mensagens automáticas via Vega Checkout</p>
            <p className="text-xs text-blue-700 mt-0.5">Essas mensagens são enviadas automaticamente quando o cliente realiza a compra. Configure cada template abaixo para as turmas Manhã e Tarde.</p>
          </div>
        </div>

        {/* PIX Gerado — card especial com fluxo de 3 mensagens */}
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-100 border-b border-orange-200">
            <span className="text-lg">💳</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-900">PIX Gerado</p>
              <p className="text-xs text-orange-700 truncate">Enviada quando o cliente escolhe PIX no checkout — envia 3 mensagens em sequência</p>
            </div>
            <span className="flex-shrink-0 text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium font-mono">sale_wait_payment</span>
          </div>
          <div className="p-4 space-y-4">
            {/* Mensagem 1: configurável */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center text-[10px] font-bold">1</span>
                Mensagem de introdução (editável)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['{{nome}}', '{{evento_nome}}', '{{data_evento}}'].map(v => (
                  <button key={v} type="button" onClick={() => set('pix_mensagem_template', (config.pix_mensagem_template || '') + v)}
                    className="text-xs px-2 py-0.5 rounded-full bg-white border border-border text-muted-foreground hover:border-primary hover:text-primary font-mono transition-colors">{v}</button>
                ))}
              </div>
              <textarea
                className="w-full h-32 text-sm font-mono border border-orange-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                value={config.pix_mensagem_template || ''}
                onChange={e => set('pix_mensagem_template', e.target.value)}
                placeholder="Olá {{nome}}! Seu PIX foi gerado..."
              />
            </div>

            {/* Mensagem 2: fixa */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center text-[10px] font-bold">2</span>
                Mensagem de instrução <span className="font-normal text-orange-600">(automática — não editável)</span>
              </p>
              <div className="bg-[#e5ddd5] rounded-lg p-3">
                <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-[85%] ml-auto">
                  <p className="text-sm text-gray-800">Segue abaixo o pix copia e cola, é só copiar o código e colocar no seu banco para confirmar o pagamento.</p>
                  <p className="text-[10px] text-gray-400 text-right mt-1">12:01 ✓✓</p>
                </div>
              </div>
            </div>

            {/* Mensagem 3: código PIX */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center text-[10px] font-bold">3</span>
                Código PIX <span className="font-normal text-orange-600">(gerado automaticamente pelo Vega)</span>
              </p>
              <div className="bg-[#e5ddd5] rounded-lg p-3">
                <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-[85%] ml-auto">
                  <p className="text-xs font-mono text-gray-500 break-all">00020126580014BR.GOV.BCB.PIX01...</p>
                  <p className="text-[10px] text-gray-400 text-right mt-1">12:02 ✓✓</p>
                </div>
              </div>
            </div>

            {/* Prévia da mensagem 1 */}
            {config.pix_mensagem_template && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Prévia da mensagem 1:</p>
                <div className="bg-[#e5ddd5] rounded-lg p-3 max-h-40 overflow-y-auto">
                  <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-[85%] ml-auto">
                    <p className="text-sm whitespace-pre-wrap text-gray-800">
                      {config.pix_mensagem_template
                        .replace(/\{\{nome\}\}/g, 'Maria Silva')
                        .replace(/\{\{evento_nome\}\}/g, 'NPA #14 Santos')
                        .replace(/\{\{data_evento\}\}/g, '14/06/2025')}
                    </p>
                    <p className="text-[10px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <WppTemplateCard
          emoji="☀️" title="Compra Confirmada — Turma Manhã" badge="sale_paid · manhã"
          subtitle="Enviada após confirmação do pagamento para alunos da turma Manhã"
          bgColor="bg-yellow-50/40" borderColor="border-yellow-200" headerColor="bg-yellow-100" badgeColor="bg-yellow-200 text-yellow-800"
          vars={['{{nome}}', '{{evento_nome}}', '{{data_evento}}', '{{link_grupo_manha}}']}
          template={config.bv_wpp_mensagem || ''}
          onChange={v => set('bv_wpp_mensagem', v)}
          placeholder="🌟 Bem-vindo(a) — Turma Manhã!..."
        />

        <WppTemplateCard
          emoji="🌆" title="Compra Confirmada — Turma Tarde" badge="sale_paid · tarde"
          subtitle="Enviada após confirmação do pagamento para alunos da turma Tarde"
          bgColor="bg-indigo-50/40" borderColor="border-indigo-200" headerColor="bg-indigo-100" badgeColor="bg-indigo-200 text-indigo-800"
          vars={['{{nome}}', '{{evento_nome}}', '{{data_evento}}', '{{link_grupo_tarde}}']}
          template={config.bv_wpp_mensagem_tarde || ''}
          onChange={v => set('bv_wpp_mensagem_tarde', v)}
          placeholder="🌟 Bem-vindo(a) — Turma Tarde!..."
        />
      </div>
    );
  }

  // ── Lançamento: boas-vindas simples ───────────────────────────────────────
  const VARS = ['{{nome}}', '{{turma}}', '{{whatsapp}}', '{{email}}'];
  const previewWpp = config.bv_wpp_mensagem
    .replace(/\{\{nome\}\}/g, 'Maria Silva')
    .replace(/\{\{turma\}\}/g, config.nome || 'Turma')
    .replace(/\{\{whatsapp\}\}/g, '5511999999999')
    .replace(/\{\{email\}\}/g, 'maria@email.com');

  return (
    <div className="space-y-5">
      {/* WPP */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">WhatsApp</h3>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={config.bv_wpp_ativo} onChange={e => set('bv_wpp_ativo', e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            <span className="text-xs text-muted-foreground">Ativo</span>
          </label>
        </div>
        {config.bv_wpp_ativo && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {VARS.map(v => (
                <button key={v} type="button" onClick={() => set('bv_wpp_mensagem', config.bv_wpp_mensagem + v)}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 font-mono">{v}</button>
              ))}
            </div>
            <textarea className="w-full h-32 text-sm font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary" value={config.bv_wpp_mensagem} onChange={e => set('bv_wpp_mensagem', e.target.value)} placeholder="Olá {{nome}}! Bem-vindo(a)..." />
            {config.bv_wpp_mensagem && (
              <div className="bg-[#e5ddd5] rounded-lg p-3 max-h-36 overflow-y-auto">
                <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-xs ml-auto">
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{previewWpp}</p>
                  <p className="text-[10px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Delay de envio */}
      <div className="pt-3 border-t border-border space-y-2">
        <h3 className="text-sm font-semibold">Delay de envio</h3>
        <p className="text-xs text-muted-foreground">Quanto tempo após o lead entrar na planilha a mensagem será enviada.</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Imediato', value: 0 },
            { label: '30 min', value: 30 },
            { label: '1 hora', value: 60 },
            { label: '2 horas', value: 120 },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('bv_delay_minutos', opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                config.bv_delay_minutos === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Personalizado:</span>
            <input
              type="number"
              min={0}
              step={5}
              value={config.bv_delay_minutos}
              onChange={e => set('bv_delay_minutos', Number(e.target.value))}
              className="w-20 h-8 text-xs border border-border rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="min"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Email</h3>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={config.bv_email_ativo} onChange={e => set('bv_email_ativo', e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            <span className="text-xs text-muted-foreground">Ativo</span>
          </label>
        </div>
        {config.bv_email_ativo && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Assunto</label>
              <Input value={config.bv_email_assunto} onChange={e => set('bv_email_assunto', e.target.value)} placeholder="Bem-vindo(a) ao {{turma}}!" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Corpo (HTML)</label>
              <textarea className="w-full h-40 text-xs font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary" value={config.bv_email_corpo} onChange={e => set('bv_email_corpo', e.target.value)} placeholder="<h2>Olá, {{nome}}!</h2>..." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 6: Revisão ──────────────────────────────────────────────────────────

function Step6({ messages, setMessages, config }: {
  messages: TemplateMensagem[];
  setMessages: React.Dispatch<React.SetStateAction<TemplateMensagem[]>>;
  config: WizardConfig;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const toggle = (i: number) =>
    setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, status: m.status === 'scheduled' ? 'draft' : 'scheduled' } : m));

  const startEdit = (i: number) => { setEditIdx(i); setEditText(messages[i].message_text); };
  const saveEdit  = () => {
    if (editIdx === null) return;
    setMessages(prev => prev.map((m, i) => i === editIdx ? { ...m, message_text: editText, hasUnresolvedVar: false, status: 'scheduled' } : m));
    setEditIdx(null);
  };

  const updateScheduled = (i: number, val: string) =>
    setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, scheduled_at: new Date(val).toISOString() } : m));

  const scheduled = messages.filter(m => m.status === 'scheduled').length;
  const drafts    = messages.filter(m => m.status === 'draft').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-2 text-xs">
          <Badge className="bg-green-100 text-green-800">{scheduled} agendadas</Badge>
          {drafts > 0 && <Badge className="bg-amber-100 text-amber-800">{drafts} rascunho</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Revise as mensagens geradas. Mensagens em 🟡 têm variáveis pendentes.
        </p>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 space-y-2 transition-colors ${
              m.status === 'scheduled' ? 'border-border bg-white' : 'border-amber-200 bg-amber-50/50'
            }`}
          >
            {editIdx === i ? (
              <div className="space-y-2">
                <textarea
                  className="w-full h-32 text-xs font-mono border border-border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditIdx(null)}>Cancelar</Button>
                  <Button size="sm" onClick={saveEdit}>Salvar</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={m.status === 'scheduled'}
                      onChange={() => toggle(i)}
                      className="w-3.5 h-3.5 accent-primary flex-shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.recipient_id} · {m.send_header_image && '📷 '}{m.mention_everyone && '@todos'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {m.hasUnresolvedVar && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title="Variável pendente" />}
                    <button onClick={() => startEdit(i)} className="text-muted-foreground hover:text-primary text-xs px-1.5 py-0.5 rounded hover:bg-muted">editar</button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 font-mono bg-muted/30 rounded px-2 py-1">
                  {m.message_text.substring(0, 120)}{m.message_text.length > 120 ? '…' : ''}
                </p>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-shrink-0">Data/hora:</label>
                  <input
                    type="datetime-local"
                    value={m.scheduled_at ? m.scheduled_at.slice(0, 16) : ''}
                    onChange={e => updateScheduled(i, e.target.value)}
                    className="text-[10px] border border-border rounded px-1.5 py-0.5 focus:outline-none bg-background"
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-border text-xs text-muted-foreground">
        Ao clicar <strong>"Salvar e Agendar"</strong>, {scheduled} mensagem(ns) serão criadas com status <em>agendada</em> no Funil de Lançamento.
        {drafts > 0 && ` As ${drafts} em rascunho precisarão de revisão adicional.`}
      </div>
    </div>
  );
}

// ─── Main Wizard Component ────────────────────────────────────────────────────

export function LancamentoWizard({ open, onClose, onSuccess, existingId, existingTipo }: LancamentoWizardProps) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<WizardConfig>(() => defaultConfig());
  const [messages, setMessages] = useState<TemplateMensagem[]>([]);
  const [saving, setSaving] = useState(false);

  // Lookup data
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [evoInstances, setEvoInstances] = useState<EvoInstance[]>([]);

  // Load lookup data once
  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('turmas').select('id, nome, produto, valor_mensalidade, dia_vencimento, total_mensalidades').order('nome'),
      supabase.from('responsaveis').select('id, nome').order('nome'),
      supabase.from('evolution_config').select('instance_name, api_url, api_key').eq('ativo', true).order('prioridade'),
    ]).then(([t, r, e]) => {
      setTurmas((t.data as Turma[]) || []);
      setResponsaveis((r.data as Responsavel[]) || []);
      setEvoInstances((e.data as EvoInstance[]) || []);
    });
  }, [open]);

  // If editing, pre-load existing data
  useEffect(() => {
    if (!open || !existingId) {
      setConfig(defaultConfig());
      setStep(1);
      return;
    }
    const loadExisting = async () => {
      const table = existingTipo === 'npa' ? 'npa_eventos' : 'lancamentos';
      const { data: lancData } = await supabase.from(table).select('*').eq('id', existingId).single();
      if (!lancData) return;

      const { data: fConfig } = await supabase.from('funnel_configs').select('*').eq('funnel_name', lancData.nome).maybeSingle();
      const { data: bvConfig } = await supabase.from('boas_vindas_config').select('*').eq('funnel_name', lancData.nome).maybeSingle();

      const variaveis: Record<string, string> = (fConfig as any)?.variaveis || {};
      const grupos: GrupoConfig[] = [];
      let gi = 1;
      // grupo_1_id e grupo_2_id são colunas dedicadas
      if ((fConfig as any)?.grupo_1_id) grupos.push({ nickname: 'Grupo 1', jid: (fConfig as any).grupo_1_id });
      if ((fConfig as any)?.grupo_2_id) grupos.push({ nickname: 'Grupo 2', jid: (fConfig as any).grupo_2_id });
      // grupo_3+ em variaveis
      while (variaveis[`grupo_${gi + grupos.length}`]) {
        grupos.push({ nickname: `Grupo ${gi + grupos.length}`, jid: variaveis[`grupo_${gi + grupos.length}`] });
        gi++;
      }

      const aulas: AulaConfig[] = [];
      let ai = 1;
      while (variaveis[`link_aula_${ai}`] || variaveis[`data_aula_${ai}`]) {
        aulas.push({
          data: variaveis[`data_aula_${ai}`] ? '' : '',
          hora: variaveis[`hora_aula_${ai}`] || '20:00',
          link: variaveis[`link_aula_${ai}`] || '',
          professor: variaveis[`professor_${ai}`] || '',
        });
        ai++;
      }

      const INTERNAL_VAR_PREFIXES = ['grupo_', 'data_aula_', 'link_aula_', 'hora_aula_', 'professor_', 'titulo_aula_', 'link_grupo_', 'bv_wpp_'];
      const INTERNAL_VAR_KEYS = new Set(['grupo_manha', 'grupo_tarde']);
      const links_extras = Object.entries(variaveis)
        .filter(([k]) => !INTERNAL_VAR_PREFIXES.some(p => k.startsWith(p)) && !INTERNAL_VAR_KEYS.has(k))
        .map(([key, value]) => ({ key, value }));

      const isNpaLoad = existingTipo === 'npa';
      const qtdGrupos = isNpaLoad ? 1 : (Math.max(1, grupos.length - 1) as 1 | 2);
      setConfig({
        nome: lancData.nome || '',
        tipo: existingTipo || 'lancamento',
        data_live: (lancData as any).data_live?.slice(0, 10) || '',
        hora_live: '20:00',
        meta_leads: (lancData as any).meta_leads || 0,
        meta_matriculas: (lancData as any).meta_matriculas || 0,
        responsavel_id: (lancData as any).responsavel_id || '',
        turma_destino_id: (lancData as any).turma_destino_id || '',
        produto_destino: (lancData as any).produto_destino || 'psicanalise',
        valor_mensalidade_destino: (lancData as any).valor_mensalidade_destino || 109.90,
        dia_vencimento_destino: (lancData as any).dia_vencimento_destino || 10,
        total_mensalidades_destino: (lancData as any).total_mensalidades_destino || 15,
        quantidade_grupos: qtdGrupos,
        grupos: grupos.length ? grupos : [{ nickname: 'Grupo de Lançamento', jid: '' }],
        instancia_evolution: '__priority__',
        vega_produto_id:        isNpaLoad ? ((lancData as any).vega_produto_id        || '') : undefined,
        vega_produto_tarde:     isNpaLoad ? ((lancData as any).vega_produto_tarde     || '') : undefined,
        pix_mensagem_template:  isNpaLoad ? ((lancData as any).pix_mensagem_template  || '') : undefined,
        aulas: aulas.length ? aulas : [{ data: '', hora: '20:00', link: '', professor: '' }],
        links_extras: links_extras.length ? links_extras : [{ key: 'link_checkout', value: '' }],
        bv_wpp_ativo: (bvConfig as any)?.wpp_ativo ?? true,
        bv_wpp_mensagem: (bvConfig as any)?.wpp_mensagem || '',
        bv_wpp_mensagem_tarde: isNpaLoad ? (variaveis['bv_wpp_tarde'] || '') : undefined,
        bv_email_ativo: (bvConfig as any)?.email_ativo ?? false,
        bv_email_assunto: (bvConfig as any)?.email_assunto || '',
        bv_email_corpo: (bvConfig as any)?.email_corpo || '',
        bv_delay_minutos: (bvConfig as any)?.delay_minutos ?? 0,
      });
      setStep(1);
    };
    loadExisting();
  }, [open, existingId, existingTipo]);

  // Regenerate messages when reaching step 6
  const goToStep = useCallback((s: number) => {
    if (s === 5 || s === 6) {
      // Preenche boas-vindas padrão se vazio
      setConfig(c => {
        if (c.tipo === 'npa') {
          return {
            ...c,
            pix_mensagem_template:  c.pix_mensagem_template  || defaultPixTemplate(),
            bv_wpp_mensagem:        c.bv_wpp_mensagem        || defaultBoasVindasNpaManha(c),
            bv_wpp_mensagem_tarde:  c.bv_wpp_mensagem_tarde  || defaultBoasVindasNpaTarde(c),
          };
        }
        if (s === 6) {
          const defaults = defaultBoasVindasEmail(c);
          return {
            ...c,
            bv_wpp_mensagem:   c.bv_wpp_mensagem   || defaultBoasVindasWpp(c),
            bv_email_assunto:  c.bv_email_assunto  || defaults.assunto,
            bv_email_corpo:    c.bv_email_corpo    || defaults.corpo,
          };
        }
        return c;
      });
      setMessages(generateLancamentoMessages(config));
    }
    setStep(s);
  }, [config]);

  const canNext = () => {
    if (step === 1) return !!config.nome.trim() && !!config.data_live;
    return true;
  };

  const handleSave = async () => {
    if (!config.nome.trim() || !config.data_live) { toast.error('Nome e data do live são obrigatórios'); return; }
    setSaving(true);
    try {
      const table = config.tipo === 'npa' ? 'npa_eventos' : 'lancamentos';
      const grupo1 = config.grupos[0]?.jid || null;
      const grupo2 = config.grupos[1]?.jid || null;

      // 1. Create/update lancamento
      let lancId = existingId;
      if (existingId) {
        const commonFields = {
          nome: config.nome,
          responsavel_id: config.responsavel_id || null,
          turma_destino_id: config.turma_destino_id || null,
          produto_destino: config.produto_destino || null,
          valor_mensalidade_destino: config.valor_mensalidade_destino || null,
          dia_vencimento_destino: config.dia_vencimento_destino || null,
          total_mensalidades_destino: config.total_mensalidades_destino || null,
        };
        const lancFields = config.tipo === 'lancamento' ? {
          ...commonFields,
          data_live: config.data_live,
          meta_leads: config.meta_leads || 0,
          meta_matriculas: config.meta_matriculas || 0,
          grupo_lancamento_jid: grupo1,
          grupo_oferta_jid: grupo2,
        } : {
          ...commonFields,
          vega_produto_id:        config.vega_produto_id        || null,
          vega_produto_tarde:     config.vega_produto_tarde     || null,
          pix_mensagem_template:  config.pix_mensagem_template  || null,
        };
        await supabase.from(table).update(lancFields).eq('id', existingId);
      } else {
        const commonFields = {
          nome: config.nome,
          status: 'planejamento' as const,
          ativo: false,
          responsavel_id: config.responsavel_id || null,
          turma_destino_id: config.turma_destino_id || null,
          produto_destino: config.produto_destino || null,
          valor_mensalidade_destino: config.valor_mensalidade_destino || null,
          dia_vencimento_destino: config.dia_vencimento_destino || null,
          total_mensalidades_destino: config.total_mensalidades_destino || null,
          created_at: new Date().toISOString(),
        };
        const lancFields = config.tipo === 'lancamento' ? {
          ...commonFields,
          meta_matriculas: config.meta_matriculas || 0,
          meta_leads: config.meta_leads || 0,
          data_live: config.data_live,
          grupo_lancamento_jid: grupo1,
          grupo_oferta_jid: grupo2,
        } : {
          ...commonFields,
          vega_produto_id:        config.vega_produto_id        || null,
          vega_produto_tarde:     config.vega_produto_tarde     || null,
          pix_mensagem_template:  config.pix_mensagem_template  || null,
        };
        const { data: created, error } = await supabase.from(table).insert(lancFields).select('id').single();
        if (error || !created) { toast.error('Erro ao criar: ' + error?.message); setSaving(false); return; }
        lancId = created.id;
        // Create default kanban columns
        if (config.tipo === 'lancamento') {
          try { await ensureDefaultLancamentoKanbanColumns(lancId!); } catch {}
        }
      }

      // 2. Upsert funnel_configs
      const variaveis = buildFunnelVariaveis(config);
      // Adiciona grupos 3+ em variaveis
      config.grupos.slice(2).forEach((g, i) => { if (g.jid) variaveis[`grupo_${i + 3}`] = g.jid; });

      await supabase.from('funnel_configs').upsert({
        funnel_name: config.nome,
        grupo_1_id: grupo1 || '',
        grupo_2_id: grupo2 || '',
        imagem_manha: '',
        imagem_tarde: '',
        imagem_noite: '',
        variaveis,
        imagens: {},
      }, { onConflict: 'funnel_name' });

      // 3. Upsert boas_vindas_config
      if (config.bv_wpp_ativo || config.bv_email_ativo) {
        await supabase.from('boas_vindas_config').upsert({
          funnel_name: config.nome,
          ativo: true,
          wpp_ativo: config.bv_wpp_ativo,
          wpp_mensagem: config.bv_wpp_mensagem,
          wpp_instance_name: config.instancia_evolution === '__priority__' ? null : config.instancia_evolution,
          email_ativo: config.bv_email_ativo,
          email_assunto: config.bv_email_assunto,
          email_corpo: config.bv_email_corpo,
          delay_minutos: config.bv_delay_minutos ?? 0,
        }, { onConflict: 'funnel_name' });
      }

      // 4. Insert funnel_messages (delete old ones from this funnel if editing)
      if (messages.length > 0) {
        if (existingId) {
          await supabase.from('funnel_messages').delete().eq('funnel_name', config.nome).in('status', ['scheduled', 'draft']);
        }
        const rows = messages.map(m => ({
          funnel_name: m.funnel_name,
          day_number: m.day_number,
          scheduled_at: m.scheduled_at,
          recipient_type: m.recipient_type,
          recipient_id: m.recipient_id,
          message_type: m.message_type,
          message_text: m.message_text,
          link_preview: m.link_preview,
          mention_everyone: m.mention_everyone,
          send_header_image: m.send_header_image,
          update_group_picture: m.update_group_picture,
          subtipo: m.subtipo || null,
          status: m.status,
          poll_name: m.poll_name ?? null,
          poll_options: m.poll_options ?? null,
        }));
        await supabase.from('funnel_messages').insert(rows);
      }

      // 5. Criar entradas no calendário para cada aula com data preenchida
      const aulaComData = config.aulas.filter(a => a.data);
      if (aulaComData.length > 0) {
        // Remove entradas antigas deste lancamento (se editando)
        if (existingId) {
          await supabase.from('eventos_calendario')
            .delete()
            .ilike('titulo', `${config.nome} — Aula%`);
        }
        const cor = config.tipo === 'npa' ? '#7C3AED' : '#EA580C';
        const evtRows = aulaComData.map((a, i) => ({
          titulo: `${config.nome} — Aula ${i + 1}`,
          data_inicio: `${a.data}T${a.hora || '20:00'}:00`,
          cor,
          tipo: config.tipo,
        }));
        await supabase.from('eventos_calendario').insert(evtRows);
      }

      toast.success(existingId ? `${config.nome} atualizado!` : `${config.nome} criado com sucesso! 🚀`);
      onSuccess(lancId!, config.tipo);
      onClose();
    } catch (e: unknown) {
      toast.error('Erro inesperado: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (!canNext()) { toast.error('Preencha os campos obrigatórios'); return; }
    goToStep(step + 1);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[92vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-lg font-bold">
            {existingId ? `⚙️ Configurar — ${config.nome || '...'}` : '🚀 Novo Lançamento / NPA'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 flex-shrink-0">
          <StepperBar current={step} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
          {step === 1 && <Step1 config={config} setConfig={setConfig} responsaveis={responsaveis} />}
          {step === 2 && <Step2 config={config} setConfig={setConfig} turmas={turmas} setTurmas={setTurmas} />}
          {step === 3 && <Step3 config={config} setConfig={setConfig} evoInstances={evoInstances} existingId={existingId} />}
          {step === 4 && <Step4 config={config} setConfig={setConfig} />}
          {step === 5 && <Step5 config={config} setConfig={setConfig} />}
          {step === 6 && <Step6 messages={messages} setMessages={setMessages} config={config} />}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          <span className="text-xs text-muted-foreground">Etapa {step} de {STEPS.length}</span>
          {step < 6 ? (
            <Button size="sm" onClick={handleNext} disabled={!canNext()}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar e Agendar'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
