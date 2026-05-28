/**
 * LancamentoWizard.tsx
 * Wizard multi-passo para criar/editar lançamentos e NPAs.
 * Configura tudo de uma vez: lancamento, kanban, funil, boas-vindas, grupos.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureDefaultLancamentoKanbanColumns } from '@/components/crm/kanban/useKanbanColunas';
import {
  WizardConfig, TemplateMensagem, AulaConfig, GrupoConfig,
  generateLancamentoMessages, buildFunnelVariaveis,
  defaultBoasVindasWpp, defaultBoasVindasEmail,
} from '@/lib/lancamento-templates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Check, Loader2,
  AlertTriangle, Calendar, Users, MessageSquare, Zap, Eye, Settings,
  Upload, X, Smartphone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Turma {
  id: string; nome: string; produto: string;
  valor_mensalidade: number | null; dia_vencimento: number | null; total_mensalidades: number | null;
}
interface Responsavel { id: string; nome: string; }
interface EvoInstance { instance_name: string; }

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
    quantidade_grupos: 1,
    grupos: [{ nickname: '', jid: '', participantes: [] }],
    instancia_evolution: '__priority__',
    aulas: [
      { data: '', hora: '20:00', link: '', professor: '' },
      { data: '', hora: '20:00', link: '', professor: '' },
      { data: '', hora: '20:00', link: '', professor: '' },
    ],
    links_extras: [{ key: 'link_checkout', value: '' }],
    bv_wpp_ativo: true, bv_wpp_mensagem: '',
    bv_email_ativo: false, bv_email_assunto: '', bv_email_corpo: '',
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
          <label className="text-xs font-medium text-muted-foreground">Data do live *</label>
          <Input type="date" value={config.data_live} onChange={e => set('data_live', e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Horário</label>
          <Input type="time" value={config.hora_live} onChange={e => set('hora_live', e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Meta de leads</label>
          <Input type="number" value={config.meta_leads || ''} onChange={e => set('meta_leads', Number(e.target.value))} placeholder="Ex: 500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Meta de matrículas</label>
          <Input type="number" value={config.meta_matriculas || ''} onChange={e => set('meta_matriculas', Number(e.target.value))} placeholder="Ex: 30" />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Turma Destino ────────────────────────────────────────────────────

function Step2({ config, setConfig, turmas }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
  turmas: Turma[];
}) {
  const set = (k: keyof WizardConfig, v: unknown) => setConfig(c => ({ ...c, [k]: v }));

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Defina para qual turma os leads matriculados neste lançamento serão enviados automaticamente.
      </p>
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
      </div>

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

function Step3({ config, setConfig, evoInstances }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
  evoInstances: EvoInstance[];
}) {
  const [criando, setCriando] = useState<Record<number, boolean>>({});
  const [erros, setErros]     = useState<Record<number, string>>({});
  const [fotoFiles, setFotoFiles] = useState<Record<number, File | null>>({});
  const [partInputs, setPartInputs] = useState<Record<number, string>>({});

  const qtd = config.quantidade_grupos ?? 1;

  const setQtd = (n: 1 | 2) => {
    setConfig(c => {
      const novos = [...c.grupos];
      while (novos.length < n) novos.push({ nickname: '', jid: '', participantes: [] });
      return { ...c, quantidade_grupos: n, grupos: novos.slice(0, n) };
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

  const LABELS    = ['Lançamento', 'Oferta'];
  const EMOJI     = ['🚀', '🎯'];
  const VAR_NAMES = ['{{grupo_1}}', '{{grupo_2}}'];

  return (
    <div className="space-y-5">
      {/* ── Toggle 1 / 2 grupos ── */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Quantos grupos WhatsApp?</label>
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
              {n === 1 ? '1 grupo' : '2 grupos  (lançamento + oferta)'}
            </button>
          ))}
        </div>
      </div>

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

      {/* ── Cards de grupo ── */}
      {Array.from({ length: qtd }).map((_, i) => {
        const grupo    = config.grupos[i] ?? { nickname: '', jid: '', participantes: [] };
        const isCriado = !!grupo.jid;
        const isLoading = criando[i] ?? false;
        const erro     = erros[i] ?? '';
        const fotoFile = fotoFiles[i] ?? null;
        const numCount = parseNumeros(partInputs[i] ?? '').length;

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
                  {isCriado ? <Check className="h-4 w-4" /> : EMOJI[i]}
                </span>
                <div>
                  <p className="text-sm font-semibold">Grupo de {LABELS[i]}</p>
                  <p className="text-[10px] text-muted-foreground">{VAR_NAMES[i]}</p>
                </div>
              </div>
              {isCriado ? (
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                  <Check className="h-3 w-3" /> Criado
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
                placeholder={i === 0
                  ? `Ex: ${config.nome || 'Turma 37'} – Lançamento`
                  : `Ex: ${config.nome || 'Turma 37'} – Oferta`}
                className="h-9 text-sm"
                disabled={isCriado}
              />
            </div>

            {/* Participantes */}
            <div className="space-y-1">
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
              {numCount > 0 && (
                <p className="text-[10px] text-primary font-medium">
                  ✓ {numCount} número{numCount !== 1 ? 's' : ''} válido{numCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Foto do grupo */}
            <div className="space-y-1">
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
            </div>

            {/* JID exibido após criação */}
            {isCriado && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-100 border border-green-200 rounded-lg">
                <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <span className="text-[11px] text-green-800 font-mono truncate">{grupo.jid}</span>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{erro}</p>
              </div>
            )}

            {/* Botão criar */}
            {!isCriado && (
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
  const updateAula = (i: number, field: keyof AulaConfig, val: string) =>
    setConfig(c => ({ ...c, aulas: c.aulas.map((a, idx) => idx === i ? { ...a, [field]: val } : a) }));

  const addAula = () =>
    setConfig(c => ({ ...c, aulas: [...c.aulas, { data: '', hora: '20:00', link: '', professor: '' }] }));

  const removeAula = (i: number) =>
    setConfig(c => ({ ...c, aulas: c.aulas.filter((_, idx) => idx !== i) }));

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
        {config.aulas.map((a, i) => (
          <div key={i} className="border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary">Aula {i + 1}</span>
              {config.aulas.length > 1 && (
                <button onClick={() => removeAula(i)} className="text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[10px] text-muted-foreground">Data</label>
                <Input type="date" value={a.data} onChange={e => updateAula(i, 'data', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Horário</label>
                <Input type="time" value={a.hora} onChange={e => updateAula(i, 'hora', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Professor(a)</label>
                <Input value={a.professor} onChange={e => updateAula(i, 'professor', e.target.value)} placeholder="Nome" className="h-8 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-4 space-y-1">
                <label className="text-[10px] text-muted-foreground">Link da aula → {'{{link_aula_' + (i + 1) + '}}'}</label>
                <Input value={a.link} onChange={e => updateAula(i, 'link', e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              </div>
            </div>
          </div>
        ))}
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

function Step5({ config, setConfig }: {
  config: WizardConfig;
  setConfig: React.Dispatch<React.SetStateAction<WizardConfig>>;
}) {
  const set = (k: keyof WizardConfig, v: unknown) => setConfig(c => ({ ...c, [k]: v }));
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
            <input
              type="checkbox"
              checked={config.bv_wpp_ativo}
              onChange={e => set('bv_wpp_ativo', e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-xs text-muted-foreground">Ativo</span>
          </label>
        </div>

        {config.bv_wpp_ativo && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {VARS.map(v => (
                <button
                  key={v}
                  onClick={() => set('bv_wpp_mensagem', config.bv_wpp_mensagem + v)}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 font-mono"
                >{v}</button>
              ))}
            </div>
            <textarea
              className="w-full h-32 text-sm font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              value={config.bv_wpp_mensagem}
              onChange={e => set('bv_wpp_mensagem', e.target.value)}
              placeholder="Olá {{nome}}! Bem-vindo(a)..."
            />
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

      {/* Email */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Email</h3>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.bv_email_ativo}
              onChange={e => set('bv_email_ativo', e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
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
              <textarea
                className="w-full h-40 text-xs font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                value={config.bv_email_corpo}
                onChange={e => set('bv_email_corpo', e.target.value)}
                placeholder="<h2>Olá, {{nome}}!</h2>..."
              />
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
      supabase.from('evolution_config').select('instance_name').eq('ativo', true).order('prioridade'),
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

      const links_extras = Object.entries(variaveis)
        .filter(([k]) => !k.startsWith('grupo_') && !k.startsWith('data_aula_') && !k.startsWith('link_aula_') && !k.startsWith('hora_aula_') && !k.startsWith('professor_'))
        .map(([key, value]) => ({ key, value }));

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
        grupos: grupos.length ? grupos : [{ nickname: 'Grupo de Lançamento', jid: '' }],
        instancia_evolution: '__priority__',
        aulas: aulas.length ? aulas : [{ data: '', hora: '20:00', link: '', professor: '' }],
        links_extras: links_extras.length ? links_extras : [{ key: 'link_checkout', value: '' }],
        bv_wpp_ativo: (bvConfig as any)?.wpp_ativo ?? true,
        bv_wpp_mensagem: (bvConfig as any)?.wpp_mensagem || '',
        bv_email_ativo: (bvConfig as any)?.email_ativo ?? false,
        bv_email_assunto: (bvConfig as any)?.email_assunto || '',
        bv_email_corpo: (bvConfig as any)?.email_corpo || '',
      });
      setStep(1);
    };
    loadExisting();
  }, [open, existingId, existingTipo]);

  // Regenerate messages when reaching step 6
  const goToStep = useCallback((s: number) => {
    if (s === 6) {
      // Preenche boas-vindas padrão se vazio
      setConfig(c => {
        const defaults = defaultBoasVindasEmail(c);
        return {
          ...c,
          bv_wpp_mensagem: c.bv_wpp_mensagem || defaultBoasVindasWpp(c),
          bv_email_assunto: c.bv_email_assunto || defaults.assunto,
          bv_email_corpo: c.bv_email_corpo || defaults.corpo,
        };
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
        } : commonFields;
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
        } : commonFields;
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
        }));
        await supabase.from('funnel_messages').insert(rows);
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
          {step === 2 && <Step2 config={config} setConfig={setConfig} turmas={turmas} />}
          {step === 3 && <Step3 config={config} setConfig={setConfig} evoInstances={evoInstances} />}
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
